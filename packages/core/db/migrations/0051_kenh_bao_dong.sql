-- 0051_kenh_bao_dong.sql
-- KÊNH BÁO ĐỘNG TỚI MỘT CON NGƯỜI — nợ #40.
--
-- ── Cái đang thiếu, đo được 01–02/08/2026 ────────────────────────────────────────
--   · `ops.outbox_messages` (0008) có đúng MỘT chỗ ghi: 0039_flag_engine.sql:534.
--   · `grep -rn "outbox" apps/ tools/ packages/core/src` = 0 hit. Không tiến trình
--     nào gửi bất cứ thứ gì đi.
--   · `select count(*) from ops.outbox_messages` trên hub_dev = 0.
--   · `ops.v_job_health` (0041) và `ops.v_rule_health` (0043) BIẾT máy hỏng. Cả hai
--     là kênh KÉO: phải có người đi hỏi mới biết. Không có đường nào ĐẨY tới người.
--
-- Sau ADR-026 điều này nặng hơn hẳn: buồng lái GVCN phụ thuộc HOÀN TOÀN vào lượt
-- quét đêm để có cờ cảm xúc. Engine ngủ một đêm là cô giáo mất khả năng phát hiện
-- sớm — và hôm nay không ai được báo. Dòng `flag_engine` trong `ops.v_job_health`
-- chuyển sang `qua_han` trong im lặng tuyệt đối.
--
-- ── Cái migration này KHÔNG làm, và vì sao ───────────────────────────────────────
-- Hôm nay CHƯA CÓ Zalo OA, CHƯA CÓ SMTP, CHƯA CÓ số điện thoại người trực
-- (`10-mua-sam-ha-tang.md`). Cám dỗ lớn nhất là dựng một bảng `sms_queue`, một hàm
-- `gui_sms()` rỗng, rồi đánh dấu `sent_at = now()` cho đẹp bảng điều khiển. Đó là
-- chế tạo một lời nói dối có cấu trúc: từ hôm sau, mọi màn hình sẽ khẳng định
-- "đã báo" cho những tin chưa từng rời khỏi database.
--
-- Nên ở đây tách đôi rõ ràng:
--   · GIAO DIỆN gửi (`ops.alert_channels` + `ops.alert_deliveries`) — trung lập với
--     phương tiện. Ngày có Zalo OA thì THÊM một dòng kênh + một adapter trong
--     `tools/alert/kenh/`, không sửa lại bảng, không sửa lại hàm.
--   · BỘ GỬI THẬT dùng được ngay hôm nay, không cần tài khoản ngoài: ghi ra một tệp
--     nhật ký báo động trên máy chủ (`tools/alert/kenh/tep-nhat-ky.mjs`) và một sổ
--     trực đọc được (`ops.v_bao_dong`). Tệp nhật ký VẪN LÀ KÊNH KÉO — nó không đánh
--     thức ai lúc 2 giờ sáng. Nó chỉ hơn hôm nay ở ba điểm, và ba điểm đó phải nói
--     thẳng chứ không được tô hồng: có một bản ghi NGOÀI database (đọc được cả khi
--     Postgres đang chết), có mốc thời gian từng lần, và có trạng thái phân biệt
--     được. Nợ "kênh ĐẨY thật" vẫn nguyên trong DEBT.md #40.
--
-- ── Bốn trạng thái, và vì sao KHÔNG gộp thành một cờ boolean ─────────────────────
-- `ops.outbox_messages` cũ chỉ có `sent_at`. `sent_at is null` gộp bốn sự thật khác
-- hẳn nhau vào một chỗ, và bốn thứ đó đòi bốn hành động khác nhau:
--
--   cho_gui       chưa tới lượt gửi          → không phải việc của ai, đợi
--   da_gui        đã ra khỏi hệ, có bằng chứng → xong
--   gui_hong      thử rồi, hỏng, còn lượt     → máy tự thử lại, kèm LÝ DO
--   het_luot      hỏng hết lượt, máy bỏ cuộc  → NGƯỜI phải vào, ngay
--   khong_co_kenh không có đường nào để gửi   → mua hạ tầng, hoặc ai đó vừa tắt kênh
--
-- Điều nguy hiểm nhất là để `khong_co_kenh` đọc thành `da_gui`. Ràng buộc CHECK
-- `(status = 'da_gui') = (sent_at is not null)` biến điều đó thành lỗi database
-- chứ không phải một quy ước trong đầu người viết mã.
--
-- ── Ai sinh ra tin báo động, và ai CỐ Ý không sinh ───────────────────────────────
-- Rà toàn bộ hệ 02/08/2026. Bốn ứng viên, chỉ hai được chọn:
--
--   ✓ `ops.v_job_health.needs_attention` — job quá hạn/thất bại/treo/tắt/chưa chạy.
--     Đây chính là ADR-026: `flag_engine` quá hạn = buồng lái GVCN mù.
--   ✓ `ops.v_rule_health.needs_attention` — nguồn hết tươi, hoặc ai đó vừa TẮT một
--     luật. 0043 đã lọc sẵn: `chua_cai_dat`/`chua_khai_nguon_tuoi` KHÔNG bật đèn vì
--     đó là nợ đã có tên. Migration này dùng lại đúng cột đó, không tự lọc lại —
--     hai bộ lọc cho một câu hỏi là hai bộ lọc sẽ lệch nhau.
--   ✗ `staging.v_loi_nap_danh_sach` (0045/0048) — lô nạp danh sách có lỗi. KHÔNG
--     sinh báo động: nạp danh sách là việc CHẠY TAY, người bấm nút đang ngồi trước
--     màn hình và thấy lỗi ngay trong kết quả trả về. Báo động cho người đang nhìn
--     là tiếng ồn thuần tuý.
--   ✗ `ops.v_stale_sources` (0011/0043) — nguồn hết tươi. KHÔNG sinh riêng: nó đã
--     tới người qua `v_rule_health` với đúng tên luật bị ảnh hưởng, tức là kèm câu
--     "vì thế luật nào ngừng chấm". Sinh thêm một tin nữa là nói cùng một chuyện
--     hai lần bằng hai giọng — đúng thứ làm người trực học cách phớt lờ.
--
-- Luật của 0011/0041 áp nguyên: CẢNH BÁO LÚC NÀO CŨNG SÁNG LÀ CẢNH BÁO ĐÃ CHẾT.
--
-- ── Giới hạn phải nói ra: bộ sinh báo động nằm TRONG cái nó canh ─────────────────
-- `ops.sinh_bao_dong()` chạy như một job, trong cùng `run-all.mjs` mà nó giám sát.
-- Máy chạy cron chết ⇒ không có lượt quét ⇒ KHÔNG SINH ĐƯỢC TIN NÀO, kể cả tin
-- "cron đã chết". Đây là giới hạn cấu trúc, không vá được từ bên trong: người canh
-- ngoài cùng bắt buộc phải đứng ngoài. Hôm nay người canh ngoài cùng là mã thoát
-- của `run-all.mjs --check` + Task Scheduler — và nó CHƯA ĐƯỢC ĐĂNG KÝ (nợ #33).
-- Ghi ra đây để không ai đọc migration này rồi tưởng lỗ hổng đó đã bịt.
--
-- Phụ thuộc: 0008 (ops.outbox_messages, ops.job_runs), 0041 (ops.v_job_health,
--            ops.job_schedule), 0043 (ops.v_rule_health).

begin;

-- ---------------------------------------------------------------------------
-- 1. ops.outbox_messages — cho mỗi tin một trạng thái nói thật
-- ---------------------------------------------------------------------------
alter table ops.outbox_messages
  add column if not exists status          text        not null default 'cho_gui',
  add column if not exists max_attempts    smallint    not null default 5,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists last_attempt_at timestamptz;

comment on column ops.outbox_messages.status is
  'cho_gui | da_gui | gui_hong | het_luot | khong_co_kenh (0051). Năm thứ khác nhau, năm việc phải làm khác nhau — gộp lại thành một cờ boolean là dựng sẵn một lời nói dối.';
comment on column ops.outbox_messages.max_attempts is
  'Hết lượt thì tin chuyển het_luot và NỔI LÊN, không nằm im. Một hàng đợi đầy tin chết mà không ai biết còn tệ hơn không có hàng đợi.';
comment on column ops.outbox_messages.next_attempt_at is
  'Lần thử kế tiếp. Giãn dần theo số lần hỏng: kênh ngoài đang chết thì thử mỗi phút chỉ tổ đốt hạn mức, không làm nó sống lại.';

-- Dòng có sẵn từ trước 0051 (0039 ghi tóm tắt nạp bù) phải được xếp đúng chỗ TRƯỚC
-- khi ràng buộc bật lên, nếu không migration sẽ vỡ trên database đang sống.
update ops.outbox_messages
   set status = case when sent_at is not null then 'da_gui' else 'cho_gui' end
 where status = 'cho_gui' and sent_at is not null;

alter table ops.outbox_messages
  drop constraint if exists outbox_status_chk,
  drop constraint if exists outbox_sent_khop_chk,
  drop constraint if exists outbox_max_attempts_chk;

alter table ops.outbox_messages
  add constraint outbox_status_chk
    check (status in ('cho_gui', 'da_gui', 'gui_hong', 'het_luot', 'khong_co_kenh')),
  -- Chốt trung tâm của cả migration này. Không có nó thì "đã gửi" chỉ là một chuỗi
  -- ký tự ai cũng ghi được, và ngày nào đó sẽ có người ghi.
  add constraint outbox_sent_khop_chk
    check ((status = 'da_gui') = (sent_at is not null)),
  add constraint outbox_max_attempts_chk
    check (max_attempts between 1 and 100);

-- Chỉ mục cũ `outbox_pending_idx` lọc theo `sent_at is null` — vẫn đúng, nhưng bộ
-- gửi hỏi câu khác: "tin nào tới giờ thử lại". Thêm chỉ mục cho đúng câu hỏi đó.
create index if not exists outbox_den_luot_idx
  on ops.outbox_messages (next_attempt_at)
  where status in ('cho_gui', 'gui_hong', 'khong_co_kenh');

-- ---------------------------------------------------------------------------
-- 2. ops.alert_channels — sổ khai kênh, đúng hình dạng ops.job_schedule
-- ---------------------------------------------------------------------------
-- Cùng một bài học chép từ 0041: CHỈ KHAI KÊNH ĐÃ CÓ ADAPTER THẬT. Khai `zalo_oa`
-- hôm nay là mỗi tin đều đi qua một adapter không tồn tại, hỏng đủ 5 lượt rồi nằm
-- ở `het_luot` — tức là tự chế một hàng tin chết sáng vĩnh viễn ngay ngày đầu.
--
-- `kind` quyết định `tools/alert/kenh/` dùng adapter nào. Cố ý KHÔNG lưu câu lệnh,
-- KHÔNG lưu URL đầy đủ, KHÔNG lưu bí mật: `target` chỉ mang tham số vô hại (thư mục
-- ghi tệp). Khoá API của Zalo/SMTP sau này nằm ở biến môi trường của tiến trình gửi,
-- không nằm trong một bảng mà nhiều người đọc được (§8).
create table if not exists ops.alert_channels (
  channel_id  text        primary key,
  label       text        not null,             -- tên tiếng Việt cho người trực đọc
  kind        text        not null,             -- loại adapter trong tools/alert/kenh/
  target      text,                             -- tham số vô hại của adapter, KHÔNG bí mật
  audiences   text[]      not null default array['*'],
  enabled     boolean     not null default true,
  note        text,
  updated_at  timestamptz not null default now(),

  constraint alert_channels_kind_chk      check (kind ~ '^[a-z][a-z0-9_]{1,30}$'),
  constraint alert_channels_audiences_chk check (cardinality(audiences) > 0)
);

comment on table ops.alert_channels is
  'Sổ khai kênh báo động (0051). CHỈ khai kênh đã có adapter thật trong tools/alert/kenh/ — khai sớm là tự chế một hàng tin chết (bài học 0011/0041). Không chứa bí mật: khoá API nằm ở biến môi trường của tiến trình gửi (§8).';
comment on column ops.alert_channels.audiences is
  'Đối tượng nhận mà kênh này phục vụ, khớp ops.outbox_messages.channel. ''*'' là mọi đối tượng. Tin không có kênh nào phục vụ KHÔNG được đánh dấu đã gửi.';
comment on column ops.alert_channels.target is
  'Tham số vô hại của adapter (ví dụ thư mục ghi tệp). Bí mật không được để ở đây — bảng này rồi sẽ có người đọc.';

-- Kênh DUY NHẤT có adapter thật hôm nay.
--
-- `audiences = {nguoi_truc}` chứ không phải `{*}`, và đó là một lựa chọn có chủ đích:
-- `care_team` (bản tóm tắt nạp bù của 0039) KHÔNG phải báo động, và hôm nay cũng
-- thật sự chưa có đường nào tới care team. Để nó rơi vào `khong_co_kenh` là nói
-- đúng sự thật; nhét nó vào tệp nhật ký của người trực là trộn tiếng ồn vào đúng
-- cái tệp phải đọc lúc 7 giờ sáng.
insert into ops.alert_channels (channel_id, label, kind, target, audiences, enabled, note) values
  ('tep_nhat_ky', 'Tệp nhật ký báo động trên máy chủ', 'tep_nhat_ky', null,
   array['nguoi_truc'], true,
   'Kênh KÉO, không phải kênh ĐẨY — nó không đánh thức ai. Giá trị: bản ghi nằm NGOÀI database, đọc được cả khi Postgres đang chết. Nợ kênh đẩy thật vẫn nguyên (DEBT.md #40).')
on conflict (channel_id) do nothing;

alter table ops.alert_channels enable row level security;
-- Không policy, không GRANT cho authenticated: đổi kênh báo động là việc của
-- migration + người vận hành, không phải của một ô tick trên UI.

-- ---------------------------------------------------------------------------
-- 3. ops.alert_deliveries — bằng chứng từng lần gửi, và cổng §9
-- ---------------------------------------------------------------------------
-- Vì sao một bảng riêng chứ không phải một cột trong outbox: một tin có thể đi qua
-- NHIỀU kênh (mai này: tệp nhật ký + Zalo). "Đã gửi" của tin là hợp của các kênh;
-- lý do hỏng thì thuộc về TỪNG kênh. Nhét cả hai vào `last_error` là mất câu
-- "Zalo hỏng nhưng tệp nhật ký vẫn ghi được" — câu quan trọng nhất lúc có sự cố.
create table if not exists ops.alert_deliveries (
  id          bigserial   primary key,
  message_id  bigint      not null references ops.outbox_messages(id) on delete cascade,
  channel_id  text        not null references ops.alert_channels(channel_id),
  status      text        not null,
  attempt     smallint    not null,
  detail      text,                             -- đường dẫn tệp đã ghi, hoặc lý do hỏng
  occurred_at timestamptz not null default now(),

  constraint alert_deliveries_status_chk  check (status in ('da_gui', 'gui_hong')),
  constraint alert_deliveries_attempt_chk check (attempt >= 0)
);

-- §9 viết thành ràng buộc database, không phải thành lời hứa trong mã: chạy bộ gửi
-- hai lần không thể ghi hai lần THÀNH CÔNG cho cùng một (tin, kênh). Lần thứ hai
-- nhận lỗi trùng khoá và bỏ qua tin đó.
create unique index if not exists alert_deliveries_mot_lan_idx
  on ops.alert_deliveries (message_id, channel_id)
  where status = 'da_gui';

create index if not exists alert_deliveries_message_idx
  on ops.alert_deliveries (message_id, occurred_at desc);

comment on table ops.alert_deliveries is
  'Từng lần gửi một tin qua một kênh (0051). Chỉ mục duy nhất một-phần trên (message_id, channel_id) where status=''da_gui'' LÀ cổng §9: chạy bộ gửi hai lần không gửi đôi được, vì database không cho.';

alter table ops.alert_deliveries enable row level security;

-- ---------------------------------------------------------------------------
-- 4. ops.kenh_cho / ops.co_kenh_khai_bao — hỏi sổ kênh
-- ---------------------------------------------------------------------------
create or replace function ops.kenh_cho(p_audience text)
returns table (channel_id text, kind text, target text, label text)
language sql
stable
security definer
set search_path = ops, pg_catalog
as $$
  select c.channel_id, c.kind, c.target, c.label
    from ops.alert_channels c
   where c.enabled
     and (c.audiences && array['*']::text[] or p_audience = any (c.audiences))
   order by c.channel_id;
$$;

comment on function ops.kenh_cho(text) is
  '0051 — các kênh đang BẬT phục vụ một đối tượng nhận. Trả rỗng nghĩa là không có đường nào để gửi; bộ gửi phải ghi khong_co_kenh, tuyệt đối không ghi da_gui.';

-- Phân biệt "chưa mua hạ tầng" với "có kênh nhưng ai đó vừa tắt". Đúng ranh giới
-- 0043 đã vạch: nợ ĐÃ CÓ TÊN thì không bật đèn; người tắt một thứ đang bảo vệ trẻ
-- con thì có.
create or replace function ops.co_kenh_khai_bao(p_audience text)
returns boolean
language sql
stable
security definer
set search_path = ops, pg_catalog
as $$
  select exists (
    select 1 from ops.alert_channels c
     where c.audiences && array['*']::text[] or p_audience = any (c.audiences)
  );
$$;

comment on function ops.co_kenh_khai_bao(text) is
  '0051 — đối tượng này ĐÃ TỪNG có kênh khai chưa (kể cả đang tắt). Chưa khai bao giờ = nợ hạ tầng có tên, không bật đèn. Khai rồi mà tắt = có người tắt, bật đèn.';

-- ---------------------------------------------------------------------------
-- 5. ops.sinh_bao_dong — biến "máy biết" thành "có tin cho người"
-- ---------------------------------------------------------------------------
-- dedup_key mang NGÀY chứ không mang giờ: một job hỏng suốt tuần cho ra 7 tin, chứ
-- không phải 168 tin. Đó là ranh giới giữa "có người đọc" và "có người tắt thông báo".
-- `on conflict do nothing` làm hàm này idempotent (§9): gọi 20 lần trong ngày vẫn
-- đúng một tin cho mỗi chuyện.
create or replace function ops.sinh_bao_dong(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ops, care, pg_catalog
as $$
declare
  v_ngay   date := (p_now at time zone 'Asia/Ho_Chi_Minh')::date;
  v_job    integer := 0;
  v_luat   integer := 0;
begin
  -- ── 5a. Job có vấn đề ────────────────────────────────────────────────────
  with ung_vien as (
    select h.job_name,
           h.label,
           h.state,
           h.note,
           h.last_findings,
           h.expected_every,
           h.grace,
           s.updated_at as khai_luc
      from ops.v_job_health h
      join ops.job_schedule s on s.job_name = h.job_name
     where h.needs_attention
       -- Job vừa được khai vài phút trước thì `chua_chay` là ĐÚNG chứ không phải
       -- sự cố. Không có mệnh đề này, mỗi migration khai job mới lại đẻ ra một tin
       -- báo động ngay trong lúc chạy migration.
       and (h.state <> 'chua_chay'
            or p_now - s.updated_at > s.expected_every + s.grace)
  ),
  moi as (
    insert into ops.outbox_messages (channel, dedup_key, payload)
    select 'nguoi_truc',
           'bao_dong:job:' || u.job_name || ':' || u.state || ':' || v_ngay::text,
           jsonb_build_object(
             'loai',        'job',
             'khoa',        u.job_name,
             'trang_thai',  u.state,
             -- flag_engine là ngoại lệ có tên: ADR-026 buộc buồng lái GVCN phụ thuộc
             -- HOÀN TOÀN vào lượt quét đêm để có cờ cảm xúc. Nó ngủ một đêm là cô
             -- giáo mất khả năng phát hiện sớm, và cô không có cách nào tự biết.
             'muc_do',      case when u.job_name = 'flag_engine' then 'khan' else 'thuong' end,
             'tieu_de',     u.label || ' — ' ||
                            case u.state
                              when 'qua_han'   then 'QUÁ HẠN, chưa chạy đúng nhịp'
                              when 'that_bai'  then 'lần chạy gần nhất THẤT BẠI'
                              when 'treo'      then 'TREO giữa chừng'
                              when 'chua_chay' then 'CHƯA CHẠY LẦN NÀO'
                              when 'tat'       then 'ĐANG BỊ TẮT'
                              else 'có ' || u.last_findings || ' phát hiện'
                            end,
             'noi_dung',    coalesce(u.note, '') ||
                            case when u.last_findings > 0
                                 then ' Lần chạy gần nhất tìm ra ' || u.last_findings || ' vấn đề.'
                                 else '' end,
             'viec_can_lam',
                            case u.state
                              when 'tat' then 'Ai đó đã tắt job này. Bật lại, hoặc xoá hẳn dòng khỏi ops.job_schedule bằng một migration có dấu vết.'
                              else 'Chạy: node tools/jobs/run-all.mjs --check để xem chi tiết, rồi chạy tay job này bằng --only=' || u.job_name || ' --force.'
                            end,
             'ngay',        v_ngay
           )
      from ung_vien u
    on conflict (dedup_key) do nothing
    returning 1
  )
  select count(*)::int into v_job from moi;

  -- ── 5b. Luật của bộ quét đang ngủ ────────────────────────────────────────
  -- Dùng NGUYÊN cột needs_attention của 0043, không lọc lại. 0043 đã cân ranh giới
  -- rất kỹ (chua_cai_dat/chua_khai_nguon_tuoi CỐ Ý không bật đèn vì là nợ có tên);
  -- lọc lại ở đây là dựng nguồn sự thật thứ hai, và nguồn thứ hai sẽ lệch.
  with moi as (
    insert into ops.outbox_messages (channel, dedup_key, payload)
    select 'nguoi_truc',
           'bao_dong:luat:' || r.rule_code || ':' || r.state || ':' || v_ngay::text,
           jsonb_build_object(
             'loai',        'luat',
             'khoa',        r.rule_code,
             'trang_thai',  r.state,
             'muc_do',      'thuong',
             'tieu_de',     'Luật ' || r.rule_code || ' của bộ quét không được chấm',
             'noi_dung',    r.giai_thich,
             'viec_can_lam','Xem ops.v_rule_health. Nếu là nguồn hết tươi thì đi tìm máy bơm dữ liệu; nếu là ngưỡng bị tắt thì hỏi ai tắt.',
             'ngay',        v_ngay
           )
      from ops.v_rule_health r
     where r.needs_attention
       -- Ngoại lệ DUY NHẤT với "không lọc lại", và nó có lý do đúng bằng lý do của
       -- chính 0043: `chua_chay` của v_rule_health nghĩa là "bộ quét chưa chạy thành
       -- công lần nào" — tức là CÙNG MỘT SỰ VIỆC mà 5a vừa báo ở dòng job flag_engine,
       -- với mức 'khan' và câu chữ đúng hơn. Không chặn ở đây thì mỗi lần bộ quét
       -- chết là 1 tin job + 6 tin luật cho một chuyện. 0043 tự viết ra câu này:
       -- "Hai view không được nói cùng một điều bằng hai giọng khác nhau."
       and r.state <> 'chua_chay'
    on conflict (dedup_key) do nothing
    returning 1
  )
  select count(*)::int into v_luat from moi;

  return jsonb_build_object(
    'tin_moi_job',  v_job,
    'tin_moi_luat', v_luat,
    'ngay',         v_ngay
  );
end;
$$;

comment on function ops.sinh_bao_dong(timestamptz) is
  '0051 — đọc ops.v_job_health + ops.v_rule_health rồi ghi tin vào ops.outbox_messages. dedup_key mang NGÀY: một chuyện hỏng cả tuần cho 7 tin chứ không phải 168. Chạy lại là no-op (§9). GIỚI HẠN: hàm này chạy trong chính bộ lịch nó canh — cron chết thì không tin nào được sinh, kể cả tin "cron đã chết".';

-- ---------------------------------------------------------------------------
-- 6. ops.claim_bao_dong — nhặt tin tới lượt, khoá lại
-- ---------------------------------------------------------------------------
-- `for update skip locked`: hai tiến trình gửi chạy chồng nhau thì mỗi tin chỉ một
-- bên cầm. Khoá giữ tới khi tiến trình gửi COMMIT — nên phải gọi hàm này BÊN TRONG
-- một transaction ở phía Node, không phải autocommit. Gọi ngoài transaction thì khoá
-- nhả ngay khi hàm trả về và hai tiến trình cùng gửi một tin.
--
-- `khong_co_kenh` cũng được nhặt lại: ngày ai đó bật kênh lên, tin cũ phải đi được
-- mà không cần ai vào sửa tay. Nó KHÔNG đốt lượt thử (xem ops.ket_thuc_gui).
create or replace function ops.claim_bao_dong(p_limit integer default 50)
returns table (
  id           bigint,
  channel      text,
  dedup_key    text,
  payload      jsonb,
  attempts     smallint,
  max_attempts smallint,
  created_at   timestamptz
)
language sql
volatile
security definer
set search_path = ops, pg_catalog
as $$
  select m.id, m.channel, m.dedup_key, m.payload, m.attempts, m.max_attempts, m.created_at
    from ops.outbox_messages m
   where m.status in ('cho_gui', 'gui_hong', 'khong_co_kenh')
     and m.attempts < m.max_attempts
     and m.next_attempt_at <= now()
   order by m.created_at
   limit greatest(p_limit, 0)
     for update skip locked;
$$;

comment on function ops.claim_bao_dong(integer) is
  '0051 — nhặt tin tới lượt gửi và KHOÁ chúng (for update skip locked). Phải gọi BÊN TRONG transaction: ngoài transaction thì khoá nhả ngay và hai tiến trình cùng gửi một tin.';

-- ---------------------------------------------------------------------------
-- 7. ops.ghi_ket_qua_gui — ghi bằng chứng một lần gửi qua một kênh
-- ---------------------------------------------------------------------------
-- Trả về false khi tin+kênh này ĐÃ có bản ghi thành công. Bộ gửi đọc giá trị đó để
-- không ghi đè, và pgTAP đọc nó để chứng minh §9 ở tầng database.
create or replace function ops.ghi_ket_qua_gui(
  p_message_id bigint,
  p_channel_id text,
  p_ok         boolean,
  p_detail     text default null
)
returns boolean
language plpgsql
security definer
set search_path = ops, pg_catalog
as $$
declare
  v_attempt smallint;
begin
  select (attempts + 1)::smallint into v_attempt
    from ops.outbox_messages where id = p_message_id;

  if v_attempt is null then
    raise exception 'Không có tin nào mang id % trong ops.outbox_messages', p_message_id;
  end if;

  begin
    insert into ops.alert_deliveries (message_id, channel_id, status, attempt, detail)
         values (p_message_id, p_channel_id, case when p_ok then 'da_gui' else 'gui_hong' end,
                 v_attempt, p_detail);
  exception when unique_violation then
    -- Chỉ mục một-phần đã chặn: tin này đã gửi thành công qua kênh này rồi. Đây là
    -- đường §9 đi qua, KHÔNG phải lỗi — trả false để bộ gửi bỏ qua trong im lặng.
    return false;
  end;

  return true;
end;
$$;

-- Hỏi TRƯỚC khi gửi. Chỉ mục một-phần ở trên mới là cổng §9 thật (nó chặn cả khi
-- hai tiến trình chạy song song); hàm này là lớp đứng trước, và nó tồn tại vì một
-- lý do rất cụ thể: adapter ghi tệp gây tác dụng phụ TRƯỚC khi ghi sổ, nên nếu
-- không hỏi trước thì lượt gửi thứ hai sẽ ghi thêm một dòng chữ vào tệp nhật ký rồi
-- mới bị chỉ mục chặn — người trực đọc tệp thấy hai dòng và tưởng hai sự cố.
create or replace function ops.da_gui_qua(p_message_id bigint, p_channel_id text)
returns boolean
language sql
stable
security definer
set search_path = ops, pg_catalog
as $$
  select exists (
    select 1 from ops.alert_deliveries d
     where d.message_id = p_message_id
       and d.channel_id = p_channel_id
       and d.status = 'da_gui'
  );
$$;

comment on function ops.da_gui_qua(bigint, text) is
  '0051 — tin này đã đi qua kênh đó chưa. Lớp hỏi-trước cho §9; cổng thật vẫn là chỉ mục một-phần alert_deliveries_mot_lan_idx.';

comment on function ops.ghi_ket_qua_gui(bigint, text, boolean, text) is
  '0051 — ghi một lần gửi. Trả false khi tin đã gửi thành công qua kênh đó rồi (chỉ mục một-phần chặn) — đó là §9 chạy đúng, không phải lỗi.';

-- ---------------------------------------------------------------------------
-- 8. ops.ket_thuc_gui — chốt trạng thái của TIN sau khi thử hết các kênh
-- ---------------------------------------------------------------------------
create or replace function ops.ket_thuc_gui(
  p_message_id bigint,
  p_so_kenh    integer,       -- số kênh đang bật phục vụ tin này
  p_so_gui_duoc integer,      -- số kênh nhận được tin (kể cả kênh đã nhận từ lượt trước)
  p_ly_do      text default null
)
returns text
language plpgsql
security definer
set search_path = ops, pg_catalog
as $$
declare
  v_status  text;
  v_attempts smallint;
begin
  select status, attempts into v_status, v_attempts
    from ops.outbox_messages where id = p_message_id for update;

  if v_status is null then
    raise exception 'Không có tin nào mang id % trong ops.outbox_messages', p_message_id;
  end if;

  -- §9: tin đã gửi rồi thì không lượt nào được đổi kết luận của nó.
  if v_status = 'da_gui' then
    return 'da_gui';
  end if;

  if p_so_gui_duoc > 0 then
    update ops.outbox_messages
       set status          = 'da_gui',
           sent_at         = now(),
           last_attempt_at = now(),
           attempts        = (attempts + 1)::smallint,
           last_error      = null
     where id = p_message_id;
    return 'da_gui';
  end if;

  if p_so_kenh = 0 then
    -- KHÔNG đốt lượt thử. Không có kênh không phải là "gửi hỏng" — đốt lượt ở đây
    -- thì sau 5 lượt quét tin rơi sang het_luot và mang theo một lý do SAI ("thử 5
    -- lần đều hỏng"), trong khi sự thật là chưa ai từng thử vì không có đường nào.
    update ops.outbox_messages
       set status          = 'khong_co_kenh',
           last_attempt_at = now(),
           -- Ngó lại mỗi giờ: ngày ai đó bật kênh lên thì tin cũ tự đi, không cần
           -- ai nhớ ra là còn tồn tin.
           next_attempt_at = now() + interval '1 hour',
           last_error      = coalesce(p_ly_do,
                               'Không có kênh nào đang bật phục vụ đối tượng nhận này. Tin CHƯA đi đâu cả.')
     where id = p_message_id;
    return 'khong_co_kenh';
  end if;

  v_attempts := (v_attempts + 1)::smallint;

  update ops.outbox_messages
     set attempts        = v_attempts,
         last_attempt_at = now(),
         last_error      = coalesce(p_ly_do, 'Gửi hỏng, không rõ lý do'),
         status          = case when v_attempts >= max_attempts then 'het_luot' else 'gui_hong' end,
         -- Giãn dần 5 phút → 10 → 20 … chặn trần 6 giờ. Kênh ngoài đang chết thì
         -- thử mỗi phút không làm nó sống lại, chỉ đốt hạn mức và đầy log.
         next_attempt_at = now() + least(interval '6 hours',
                                         interval '5 minutes' * (2 ^ least(v_attempts, 8)))
   where id = p_message_id
  returning status into v_status;

  return v_status;
end;
$$;

comment on function ops.ket_thuc_gui(bigint, integer, integer, text) is
  '0051 — chốt trạng thái một tin sau lượt gửi. Bốn ngả tách bạch: đã gửi · còn lượt (gui_hong) · hết lượt (het_luot, NGƯỜI phải vào) · không có kênh (khong_co_kenh, KHÔNG đốt lượt vì chưa ai từng thử). Tin đã da_gui thì không lượt nào đổi được (§9).';

-- ---------------------------------------------------------------------------
-- 9. Sổ trực — thứ người trực thật sự mở ra lúc 7 giờ sáng
-- ---------------------------------------------------------------------------
-- Người trực là một giáo viên hoặc nhân viên văn phòng, không phải dev. Nên view
-- này trả về CÂU TIẾNG VIỆT, không trả về mã trạng thái để người đọc tự tra.
create or replace view ops.v_bao_dong as
select m.id,
       m.channel                      as doi_tuong_nhan,
       m.dedup_key,
       m.status,
       coalesce(m.payload ->> 'muc_do', 'thuong')   as muc_do,
       coalesce(m.payload ->> 'tieu_de', m.dedup_key) as tieu_de,
       m.payload ->> 'noi_dung'       as noi_dung,
       m.payload ->> 'viec_can_lam'   as viec_can_lam,
       m.created_at,
       m.sent_at,
       m.attempts,
       m.max_attempts,
       m.last_error,
       m.next_attempt_at,
       d.kenh_da_nhan,
       case m.status
         when 'da_gui'        then 'ĐÃ GỬI qua ' || coalesce(array_to_string(d.kenh_da_nhan, ', '), '?')
         when 'cho_gui'       then 'CHƯA GỬI — đang đợi lượt gửi kế tiếp'
         when 'gui_hong'      then 'GỬI HỎNG (' || m.attempts || '/' || m.max_attempts ||
                                   ' lượt) — máy sẽ tự thử lại. Lý do: ' || coalesce(m.last_error, 'không rõ')
         when 'het_luot'      then 'HẾT LƯỢT THỬ — máy đã bỏ cuộc, CẦN NGƯỜI VÀO. Lý do lần cuối: ' ||
                                   coalesce(m.last_error, 'không rõ')
         when 'khong_co_kenh' then 'KHÔNG CÓ KÊNH NÀO ĐỂ GỬI — tin này CHƯA đi đâu cả, đừng đọc thành đã báo'
         else m.status
       end as noi_bang_tieng_viet
  from ops.outbox_messages m
  left join lateral (
    select array_agg(dv.channel_id order by dv.channel_id) as kenh_da_nhan
      from ops.alert_deliveries dv
     where dv.message_id = m.id and dv.status = 'da_gui'
  ) d on true;

comment on view ops.v_bao_dong is
  'Sổ trực (0051) — mỗi tin báo động một dòng, kèm một câu tiếng Việt nói đúng trạng thái. Người trực là giáo viên/nhân viên văn phòng, không phải dev: không bắt họ tra mã trạng thái.';

-- Hàng tin CẦN TAY NGƯỜI. Tách khỏi v_bao_dong vì đây là câu hỏi khác: không phải
-- "hôm nay có gì", mà "có gì đang mắc kẹt".
create or replace view ops.v_bao_dong_ton as
select v.*,
       case
         when v.status = 'het_luot' then
           'Máy đã thử ' || v.attempts || ' lần và bỏ cuộc. Tin này sẽ KHÔNG tự đi nữa.'
         when v.status = 'khong_co_kenh' then
           'Có kênh được khai cho đối tượng "' || v.doi_tuong_nhan ||
           '" nhưng đang TẮT hết. Ai đó đã tắt một đường báo động.'
         else
           'Tin nằm ở hàng đợi quá 24 giờ mà chưa có lượt gửi nào chạm tới — bộ gửi có đang chạy không?'
       end as vi_sao_mac_ket
  from ops.v_bao_dong v
 where v.status = 'het_luot'
    -- "Chưa mua hạ tầng" là nợ ĐÃ CÓ TÊN (DEBT.md #40), không phải sự cố đêm nay —
    -- đúng ranh giới 0043 vạch cho chua_cai_dat. Nhưng "đã khai kênh rồi mà tắt hết"
    -- thì có người vừa tắt một đường báo động, và điều đó phải kêu.
    or (v.status = 'khong_co_kenh' and ops.co_kenh_khai_bao(v.doi_tuong_nhan))
    or (v.status = 'cho_gui' and v.created_at < now() - interval '24 hours');

comment on view ops.v_bao_dong_ton is
  'Tin báo động đang MẮC KẸT, cần tay người (0051). Cố ý KHÔNG đếm tin thuộc đối tượng chưa từng có kênh nào được khai — đó là nợ hạ tầng có tên (DEBT.md #40), và một đèn sáng vĩnh viễn là một đèn sẽ bị phớt lờ (bài học 0011/0043).';

-- Sức khoẻ của TỪNG KÊNH, tách hẳn khỏi sức khoẻ của từng tin.
--
-- Lỗ hổng này tìm ra bằng cách thử ngược, không phải bằng cách ngồi nghĩ (02/08/2026):
-- khai thêm một kênh `zalo_gia` (kind = 'zalo_oa', chưa có adapter) rồi gửi một tin.
-- Kết quả: tin thành `da_gui` — ĐÚNG, vì tệp nhật ký đã nhận được nó, và một tin tới
-- được một người là tin đã tới. Nhưng kênh zalo_gia hỏng 100% số lượt mà KHÔNG chỗ
-- nào nói ra: tin đã `da_gui` thì không bao giờ được nhặt lại, nên không lượt nào
-- thử kênh đó nữa. Một kênh báo động chết trong im lặng — đúng hình dạng hỏng mà cả
-- gói này sinh ra để chống, chỉ lùi lại một tầng.
--
-- Ranh giới đèn (vẫn là luật 0011): chỉ kêu khi kênh ĐANG BẬT, có lượt hỏng trong
-- 24 giờ, VÀ chưa gửi được lần nào kể từ lượt hỏng gần nhất. Kênh hỏng một lượt rồi
-- tự khỏi thì không đánh thức ai.
create or replace view ops.v_suc_khoe_kenh as
with lan_cuoi as (
  select d.channel_id,
         max(d.occurred_at) filter (where d.status = 'da_gui')   as gui_duoc_luc,
         max(d.occurred_at) filter (where d.status = 'gui_hong') as hong_luc,
         count(*) filter (where d.occurred_at > now() - interval '24 hours')            as luot_24h,
         count(*) filter (where d.occurred_at > now() - interval '24 hours'
                            and d.status = 'gui_hong')                                  as hong_24h
    from ops.alert_deliveries d
   group by d.channel_id
)
select c.channel_id,
       c.label,
       c.kind,
       c.enabled,
       coalesce(l.luot_24h, 0) as luot_24h,
       coalesce(l.hong_24h, 0) as hong_24h,
       l.gui_duoc_luc,
       l.hong_luc,
       (select d2.detail
          from ops.alert_deliveries d2
         where d2.channel_id = c.channel_id and d2.status = 'gui_hong'
         order by d2.occurred_at desc limit 1) as ly_do_hong_gan_nhat,
       (c.enabled
        and coalesce(l.hong_24h, 0) > 0
        and (l.gui_duoc_luc is null or l.gui_duoc_luc < l.hong_luc)) as needs_attention
  from ops.alert_channels c
  left join lan_cuoi l on l.channel_id = c.channel_id;

comment on view ops.v_suc_khoe_kenh is
  'Sức khoẻ từng kênh báo động (0051). Cần thiết vì trạng thái của TIN không nói lên trạng thái của KÊNH: một tin gửi được qua kênh A vẫn là ''da_gui'' dù kênh B hỏng, và tin đã da_gui thì không bao giờ được thử lại — kênh B chết trong im lặng. Lỗ hổng này tìm ra bằng thử ngược 02/08/2026.';

-- ---------------------------------------------------------------------------
-- 10. Khai job — CHỈ vì bộ chạy đã tồn tại thật
-- ---------------------------------------------------------------------------
-- Bộ chạy: tools/jobs/run-bao-dong.mjs, ra đời trong CÙNG commit với migration này.
-- Nếu file đó vắng mặt, run-all.mjs đã có sẵn nhánh "THIẾU BỘ CHẠY" (ghi failed +
-- in ra màn hình), nên khai sớm không thể im lặng — nhưng vẫn đừng khai sớm.
--
-- Nhịp 1 giờ khớp với nhịp mặc định HOURLY của tools/jobs/dang-ky-lich.ps1. Nhanh
-- hơn nhịp đó là vô nghĩa (bộ lịch có chạy đâu mà gọi), chậm hơn thì một job chết
-- lúc 1 giờ sáng phải đợi tới trưa mới có tin.
insert into ops.job_schedule (job_name, label, kind, runner, expected_every, grace, note)
select 'kenh_bao_dong', 'Sinh và gửi tin báo động', 'script', 'run-bao-dong.mjs',
       interval '1 hour', interval '2 hours',
       'Đọc ops.v_job_health + ops.v_rule_health, ghi tin vào ops.outbox_messages rồi gửi qua ops.alert_channels. Dòng này quá hạn = KHÔNG AI ĐƯỢC BÁO về bất cứ chuyện gì nữa.'
 where to_regprocedure('ops.sinh_bao_dong(timestamptz)') is not null
on conflict (job_name) do nothing;

-- ---------------------------------------------------------------------------
-- 11. Quyền — job chạy bằng vai chủ sở hữu, không phải vai người dùng
-- ---------------------------------------------------------------------------
-- PostgreSQL cấp EXECUTE cho PUBLIC trên mọi hàm mới. Không thu lại thì bất kỳ
-- phiên đăng nhập nào cũng đánh dấu được "đã gửi" cho một tin chưa đi đâu cả — tức
-- là xoá được đúng cái báo động đang nói về mình.
revoke execute on function ops.sinh_bao_dong(timestamptz)                    from public;
revoke execute on function ops.claim_bao_dong(integer)                       from public;
revoke execute on function ops.ghi_ket_qua_gui(bigint, text, boolean, text)  from public;
revoke execute on function ops.da_gui_qua(bigint, text)                      from public;
revoke execute on function ops.ket_thuc_gui(bigint, integer, integer, text)  from public;
revoke execute on function ops.kenh_cho(text)                                from public;
revoke execute on function ops.co_kenh_khai_bao(text)                        from public;

-- Hai view sổ trực đọc ops.outbox_messages, và bảng đó CỐ Ý không GRANT cho
-- authenticated (0024: "chứa nội dung bản tin"). Nên không GRANT hai view này cho
-- authenticated: đường đọc duy nhất hôm nay là psql của người vận hành và bộ gửi.
-- Ngày có màn hình trực thật thì mở bằng một migration riêng, có chủ đích, kèm
-- security_invoker và policy — không mở lén ở đây.

commit;
