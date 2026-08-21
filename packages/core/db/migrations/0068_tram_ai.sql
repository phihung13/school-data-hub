-- 0068_tram_ai.sql
-- §7 + ADR-034 — trạm AI: hạn mức chi phí và nhật ký gọi model.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HAI Ý LẤY TỪ SƠ ĐỒ AI OS CỦA CẤP TRÊN, mà §7 chưa nói
-- ═══════════════════════════════════════════════════════════════════════════
-- §7 (đã ký từ đầu) nói đúng một việc: mọi lời gọi model ngoài đi qua một wrapper duy
-- nhất bóc định danh. Sơ đồ của cấp trên thêm hai việc mà §7 không có, và cả hai đáng:
--   · **hạn mức chi phí theo app và theo người** — không app nào đốt ngân sách của app
--     khác, không người nào (hay một vòng lặp hỏng) đốt của cả trường;
--   · **lọc nội dung theo lứa tuổi**.
-- File này dựng phần ĐO ĐƯỢC của hai việc đó. Phần lọc nội dung nằm ở tầng ứng dụng và
-- **cố ý được khai là một sàn, không phải một giải pháp** — xem `apps/hub/server/ai/`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NHẬT KÝ: GHI CÁI GÌ, VÀ CỐ Ý KHÔNG GHI CÁI GÌ
-- ═══════════════════════════════════════════════════════════════════════════
-- Sơ đồ viết "log toàn bộ hội thoại phục vụ kiểm định". Làm đúng chữ đó là dựng một kho
-- lưu **nguyên văn lời trẻ con nói với AI** — và bản sao lưu mang kho ấy ra khỏi máy chủ
-- mỗi ngày (ADR-006). Nên bảng này ghi **chữ ĐÃ BÓC**, không ghi bản gốc:
--
--   · lưu `cau_hoi_sach` / `tra_loi_sach` — chính chuỗi đã đi ra và đi về, sau khi bóc.
--     Đây đủ cho mọi việc kiểm định thật: xem model được hỏi gì, trả lời gì, có bậy
--     không, có bịa không.
--   · KHÔNG lưu bản gốc, KHÔNG lưu `duongVe` (bản đồ mã → tên). Có `duongVe` là có đủ
--     để dựng lại nguyên văn, tức là bảng này lại thành cái kho vừa tránh.
--
-- Nói cách khác: nhật ký trả lời được "AI đã nói gì với trẻ", KHÔNG trả lời được "em
-- nào đã kể chuyện gì". Câu thứ hai là câu §7 sinh ra để không ai trả lời được.

begin;

-- ---------------------------------------------------------------------------
-- 1. HẠN MỨC — theo app và theo người, cùng một bảng
-- ---------------------------------------------------------------------------
create table ai.han_muc (
  -- 'app' = trần của một Mini App; 'nguoi' = trần của một người trong ngày;
  -- 'truong' = trần toàn trường. Ba tầng, và tầng nào chạm trần trước thì chặn trước.
  pham_vi     text not null,
  -- app_id với 'app'; NULL với 'nguoi' và 'truong' (trần áp cho mọi người/cả trường).
  khoa        text,
  so_luot_ngay integer not null,
  active      boolean not null default true,
  updated_by  uuid references core.users(id),
  updated_at  timestamptz not null default now(),
  constraint han_muc_pham_vi_chk check (pham_vi in ('app', 'nguoi', 'truong')),
  constraint han_muc_khoa_dung_cho_app_chk check (
    (pham_vi = 'app' and khoa is not null) or (pham_vi <> 'app' and khoa is null)
  ),
  constraint han_muc_duong_chk check (so_luot_ngay >= 0)
);
create unique index han_muc_uq on ai.han_muc (pham_vi, coalesce(khoa, ''));

comment on table ai.han_muc is
  '§7 + ADR-034 — trần số lượt gọi model mỗi ngày, ba tầng: app · người · toàn trường. Đổi trần KHÔNG cần deploy. so_luot_ngay = 0 nghĩa là KHOÁ HẲN, và đó là công tắc dừng khẩn: một dòng UPDATE cắt được đường ra model của cả trường trong một giây.';

-- Trần khởi điểm. Đây là ĐỀ XUẤT của kỹ thuật, không phải quyết định của nhà trường —
-- nhà trường đổi bằng một câu UPDATE. Chọn nhỏ có chủ ý: một trần quá rộng ngày đầu thì
-- hoá đơn tháng đầu là thứ dạy ta con số đúng, và đó là cách học đắt tiền.
insert into ai.han_muc (pham_vi, khoa, so_luot_ngay) values
  ('truong', null, 2000),
  ('nguoi',  null, 30);

-- ---------------------------------------------------------------------------
-- 2. NHẬT KÝ GỌI MODEL
-- ---------------------------------------------------------------------------
create table ai.nhat_ky_goi (
  id            bigserial primary key,
  xay_ra_luc    timestamptz not null default now(),
  app_id        text,
  nguoi_goi     uuid references core.users(id),
  nha_cung_cap  text not null,
  model         text not null,
  -- Chữ ĐÃ BÓC. Xem khối đầu file: bản gốc và bản đồ đường về cố ý không có ở đây.
  cau_hoi_sach  text not null,
  tra_loi_sach  text,
  -- Đếm theo loại của lần bóc đó — số, không phải giá trị. Cho phép trả lời "tháng này
  -- bộ lọc đã chặn bao nhiêu số điện thoại" mà không giữ số nào.
  da_boc        jsonb not null default '{}',
  token_vao     integer,
  token_ra      integer,
  -- 'ok' | 'qua_han_muc' | 'loc_chan' | 'loi_nha_cung_cap' | 'con_sot_pii'
  ket_qua       text not null,
  ghi_chu       text,
  constraint nhat_ky_ket_qua_chk check (
    ket_qua in ('ok', 'qua_han_muc', 'loc_chan', 'loi_nha_cung_cap', 'con_sot_pii')
  )
);

comment on table ai.nhat_ky_goi is
  '§7 — mọi lượt gọi model ngoài, kể cả lượt BỊ CHẶN. Lưu chữ ĐÃ BÓC, không lưu bản gốc và không lưu bản đồ đường về: có bản đồ là dựng lại được nguyên văn lời trẻ con, tức bảng này thành đúng cái kho mà §7 sinh ra để tránh. Trả lời được "AI đã nói gì với trẻ", KHÔNG trả lời được "em nào kể chuyện gì".';
comment on column ai.nhat_ky_goi.ket_qua is
  'Lượt bị chặn cũng GHI. Không ghi thì "hôm nay không ai gọi AI" và "hôm nay mọi lượt gọi đều bị chặn" trông y hệt nhau — đúng loại im lặng bị đọc thành kết luận mà Rev B/C điều 3 cấm.';

create index nhat_ky_goi_ngay_idx    on ai.nhat_ky_goi (xay_ra_luc desc);
create index nhat_ky_goi_nguoi_idx   on ai.nhat_ky_goi (nguoi_goi, xay_ra_luc desc);

-- ---------------------------------------------------------------------------
-- 3. CÒN BAO NHIÊU LƯỢT — một hàm, ba tầng
-- ---------------------------------------------------------------------------
-- Trả về tầng CHẠM TRẦN TRƯỚC, kèm tên tầng đó: nơi gọi phải nói được với người dùng
-- "hết lượt của con hôm nay" khác với "cả trường hết lượt hôm nay" — hai câu ấy dẫn tới
-- hai hành động khác nhau, và gộp chúng thành "thử lại sau" là làm người dùng chờ vô ích.
create or replace function ai.con_luot(p_nguoi uuid, p_app text)
returns table (con boolean, tang text, da_dung integer, tran integer)
language plpgsql
stable
security definer
set search_path = ai, core, pg_temp
as $$
declare
  r record;
begin
  for r in
    select h.pham_vi, h.so_luot_ngay,
           (select count(*)::int from ai.nhat_ky_goi n
             where n.xay_ra_luc >= date_trunc('day', now())
               and n.ket_qua = 'ok'
               and (h.pham_vi <> 'nguoi'  or n.nguoi_goi = p_nguoi)
               and (h.pham_vi <> 'app'    or n.app_id    = p_app)) as da
      from ai.han_muc h
     where h.active
       and (h.pham_vi <> 'app' or h.khoa = p_app)
     -- Trần NHỎ NHẤT xét trước: tầng chạm trần trước là tầng phải được kể tên.
     order by h.so_luot_ngay asc
  loop
    if r.da >= r.so_luot_ngay then
      return query select false, r.pham_vi, r.da, r.so_luot_ngay;
      return;
    end if;
  end loop;
  return query select true, 'con'::text, 0, 0;
end;
$$;

comment on function ai.con_luot(uuid, text) is
  '§7 — còn lượt gọi model không, xét cả ba tầng hạn mức. Trả về TÊN TẦNG chạm trần trước: "hết lượt của con hôm nay" và "cả trường hết lượt" dẫn tới hai hành động khác nhau, gộp thành "thử lại sau" là bắt người dùng chờ vô ích. Chỉ đếm lượt ket_qua = ok — lượt bị chặn không tiêu hạn mức.';

-- ---------------------------------------------------------------------------
-- 4. AI ĐỌC ĐƯỢC
-- ---------------------------------------------------------------------------
alter table ai.nhat_ky_goi enable row level security;
alter table ai.han_muc     enable row level security;

-- Chính mình đọc được lượt gọi của mình — để màn hình nói được "con còn 12 lượt hôm nay".
create policy nhat_ky_cua_minh on ai.nhat_ky_goi
  for select to authenticated using (nguoi_goi = core.current_user_id());

-- Trần thì ai cũng đọc được: nó là quy định của trường, không phải bí mật.
create policy han_muc_ai_cung_doc on ai.han_muc
  for select to authenticated using (true);

comment on policy nhat_ky_cua_minh on ai.nhat_ky_goi is
  '§7 — mỗi người chỉ đọc lượt gọi CỦA MÌNH. Không mở cho GVCN hay BGH qua policy: "em này hỏi AI cái gì" là câu hỏi phải đi qua một quyết định có tên, không phải một cửa mở sẵn. Kiểm định thì đọc qua vai Metabase (ADR-039), nơi có sổ cấp tài khoản.';

grant select on ai.nhat_ky_goi, ai.han_muc to authenticated;
-- Đường GHI: chỉ máy chủ, qua vai chủ schema. `authenticated` không có INSERT — nếu có
-- thì một người tự ghi vào nhật ký để làm loãng chính sổ vết của mình.

commit;
