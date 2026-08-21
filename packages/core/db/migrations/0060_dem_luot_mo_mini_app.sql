-- 0060_dem_luot_mo_mini_app.sql
-- ADR-034 (hạng mục "launcher tự ghim theo tần suất" lấy từ sơ đồ AI OS của cấp trên).
--
-- Trang chủ ghim 4 app dùng nhiều nhất lên đầu lưới. Muốn ghim thì phải ĐẾM, mà hôm
-- nay Hub không có chỗ nào đếm lượt mở app.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VÌ SAO KHÔNG DÙNG `ops.audit_log`
-- ═══════════════════════════════════════════════════════════════════════════
-- Bảng đó khai rõ phạm vi của mình: "bắt buộc cho care, health, admin và mọi lần cấp
-- token OIDC" — tức sổ vết cho những việc CÓ HỆ QUẢ. Mỗi cú chạm vào một ô app là
-- việc không hệ quả, xảy ra vài chục lần mỗi ngày mỗi người. Đổ nó vào cùng bảng là
-- pha loãng đúng cuốn sổ mà một ngày nào đó người ta phải lật để trả lời "ai đã xem
-- hồ sơ em này". Sổ vết mà 99% là tiếng ồn thì không ai đọc nữa.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HÌNH DẠNG: MỘT DÒNG MỖI (NGƯỜI · APP · NGÀY), KHÔNG PHẢI MỘT DÒNG MỖI CÚ CHẠM
-- ═══════════════════════════════════════════════════════════════════════════
-- Gộp theo ngày ngay tại chỗ ghi, ba lẽ:
--   · Ghim cần TẦN SUẤT GẦN ĐÂY, không cần từng cú chạm. Giữ chi tiết là giữ thứ
--     không ai hỏi tới — và với dữ liệu hành vi của trẻ, giữ thừa là một khoản nợ
--     trước Luật 91/2025 chứ không phải một tài sản.
--   · Bảng nhỏ và không lớn theo lưu lượng: trần là (số người × số app × số ngày).
--   · Job dọn theo ngày viết được bằng một câu `delete … where ngay <`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- §9 — GỌI HAI LẦN CHO CÙNG KẾT QUẢ, ở một bảng ĐẾM
-- ═══════════════════════════════════════════════════════════════════════════
-- Một bộ đếm thì bản chất KHÔNG idempotent: cộng hai lần ra hai. §9 sinh ra để chặn
-- "double-tap và retry mạng sinh bản ghi đôi", nên chỗ này thi hành đúng tinh thần đó
-- bằng CỬA SỔ NGUỘI: hai lượt cách nhau dưới 30 giây tính là MỘT. Em bấm hụt rồi bấm
-- lại, hay trình duyệt gửi lại beacon, đều không thổi số. Mở lại app sau 30 giây thì
-- CÓ tính — đó là lượt dùng thật, và đếm nó mới là việc của bảng này.
-- Cùng khuôn với `core.parent_invite_codes` (nhận lại trong 15 phút rồi khoá).

begin;

create table ops.mini_app_usage (
  user_id   uuid        not null references core.users(id) on delete cascade,
  -- Khoá app: hoặc `key` của một màn trong `apps/hub/lib/man-hinh.ts`, hoặc `app_id`
  -- của một Mini App ngoài trong `core.embedded_apps`. CỐ Ý KHÔNG có khoá ngoại: hai
  -- không gian tên khác nhau, và một FK về `embedded_apps` sẽ xoá lịch sử dùng khi
  -- một app bị gỡ khỏi sổ — mà lúc đó số cũ vẫn còn nghĩa cho việc rà lại.
  app_key   text        not null,
  ngay      date        not null,
  so_lan    integer     not null default 1,
  lan_cuoi  timestamptz not null default now(),
  primary key (user_id, app_key, ngay),
  constraint mini_app_usage_so_lan_duong_chk check (so_lan > 0),
  constraint mini_app_usage_key_khong_rong_chk check (length(btrim(app_key)) between 1 and 64)
);

comment on table ops.mini_app_usage is
  'Đếm lượt mở mini app để trang chủ tự ghim 4 app dùng nhiều nhất (ADR-034). Gộp theo NGÀY ngay tại chỗ ghi — không giữ từng cú chạm. Không phải sổ vết: sổ vết là ops.audit_log, và cố ý không trộn hai thứ vào nhau.';
comment on column ops.mini_app_usage.app_key is
  'key của màn trong man-hinh.ts HOẶC app_id của Mini App ngoài. Không FK — hai không gian tên, và gỡ app khỏi sổ không được xoá lịch sử dùng.';
comment on column ops.mini_app_usage.lan_cuoi is
  'Mốc cho cửa sổ nguội 30 giây của §9: hai lượt sát nhau tính là một.';

-- Câu hỏi duy nhất của tầng ghim: "người này 30 ngày qua mở app nào nhiều nhất".
create index mini_app_usage_ghim_idx on ops.mini_app_usage (user_id, ngay desc);

alter table ops.mini_app_usage enable row level security;

-- CHỈ CỦA MÌNH, cả đọc lẫn ghi. Không vai nào đọc chéo được người khác qua đường này:
-- "em nào mở app nào lúc mấy giờ" là dữ liệu hành vi của trẻ, và nó KHÔNG nằm trong
-- bất kỳ lời hứa nào của trường với ai. Muốn số tổng hợp cho quản trị thì mở một view
-- riêng, có tên, qua ADR — không nới policy này.
create policy mini_app_usage_cua_minh on ops.mini_app_usage
  for select to authenticated
  using (user_id = core.current_user_id());

create policy mini_app_usage_tu_ghi on ops.mini_app_usage
  for insert to authenticated
  with check (user_id = core.current_user_id());

create policy mini_app_usage_tu_cong on ops.mini_app_usage
  for update to authenticated
  using (user_id = core.current_user_id())
  with check (user_id = core.current_user_id());

comment on policy mini_app_usage_cua_minh on ops.mini_app_usage is
  'Mỗi người chỉ thấy lượt dùng của chính mình. Đọc chéo phải đi qua một view tổng hợp có tên và có ADR — nới policy này là mở một cửa đọc hành vi từng em mà không lời hứa nào của trường nói tới.';

grant select, insert, update on ops.mini_app_usage to authenticated;

-- ---------------------------------------------------------------------------
-- Đường GHI duy nhất — cửa sổ nguội 30 giây nằm TRONG câu SQL
-- ---------------------------------------------------------------------------
-- Đặt cửa sổ ở đây chứ không ở tầng ứng dụng: tầng ứng dụng có nhiều lối vào (route
-- beacon hôm nay, có thể thêm lối khác mai sau) và mỗi lối tự nhớ luật là mỗi lối
-- quên được. SECURITY INVOKER (mặc định) — hàm chạy bằng quyền người gọi nên ba
-- policy trên vẫn là hàng rào thật, hàm chỉ là chỗ giữ luật đếm.
create or replace function ops.ghi_mo_mini_app(p_app_key text)
returns void
language plpgsql
volatile
as $$
declare
  v_user uuid := core.current_user_id();
begin
  -- Chưa đăng nhập, hoặc tài khoản đã khoá (current_user_id trả NULL): im lặng bỏ qua.
  -- Đây là đường ghi telemetry — ném lỗi ở đây là làm hỏng một cú điều hướng của người
  -- dùng vì một con số thống kê.
  if v_user is null or p_app_key is null or btrim(p_app_key) = '' then
    return;
  end if;

  insert into ops.mini_app_usage (user_id, app_key, ngay, so_lan, lan_cuoi)
       values (v_user, btrim(p_app_key), current_date, 1, now())
  on conflict (user_id, app_key, ngay) do update
     set so_lan   = ops.mini_app_usage.so_lan
                  + case when now() - ops.mini_app_usage.lan_cuoi > interval '30 seconds'
                         then 1 else 0 end,
         lan_cuoi = greatest(ops.mini_app_usage.lan_cuoi, now());
end;
$$;

comment on function ops.ghi_mo_mini_app(text) is
  'Ghi một lượt mở mini app cho CHÍNH người đang đăng nhập. §9: hai lượt cách nhau dưới 30 giây tính là MỘT (double-tap, gửi lại beacon). Im lặng bỏ qua khi chưa đăng nhập — đây là telemetry, không được làm hỏng một cú điều hướng vì một con số.';

grant execute on function ops.ghi_mo_mini_app(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Đường ĐỌC cho tầng ghim
-- ---------------------------------------------------------------------------
-- 30 ngày: đủ dài để một app dùng hằng tuần không rớt khỏi ghim vì một tuần nghỉ, đủ
-- ngắn để thói quen đổi thì ghim đổi theo trong vòng một tháng. Con số này KHÔNG phải
-- ngưỡng cảnh báo nên không thuộc §6 (`care.thresholds`) — nó là tham số hiển thị.
create or replace function ops.app_dung_nhieu_nhat(p_so_luong integer default 4)
returns table (app_key text, so_lan bigint)
language sql
stable
as $$
  select u.app_key, sum(u.so_lan)::bigint as so_lan
    from ops.mini_app_usage u
   where u.user_id = core.current_user_id()
     and u.ngay >= current_date - 29
   group by u.app_key
   -- Ngưỡng 3: một app mở đúng một lần vì tò mò KHÔNG được đẩy một app dùng hằng ngày
   -- ra khỏi hàng ghim. Không có nó thì hàng đầu lưới xáo mỗi lần người dùng thử một
   -- app mới, và ô người ta định chạm lại nằm chỗ khác — ghim mà nhảy thì tệ hơn không ghim.
  having sum(u.so_lan) >= 3
   order by sum(u.so_lan) desc, max(u.lan_cuoi) desc
   limit greatest(coalesce(p_so_luong, 4), 0);
$$;

comment on function ops.app_dung_nhieu_nhat(integer) is
  'App người đang đăng nhập mở nhiều nhất trong 30 ngày gần đây, để trang chủ ghim lên đầu lưới. Đòi tối thiểu 3 lượt: một app mở vì tò mò không được đẩy app dùng hằng ngày ra khỏi hàng ghim — hàng ghim mà nhảy thì tệ hơn không ghim.';

grant execute on function ops.app_dung_nhieu_nhat(integer) to authenticated;

commit;
