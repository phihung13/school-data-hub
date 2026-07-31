-- 0024_rls_gaps.sql
-- Bịt ba lỗ RLS còn sót và trả lại hiệu lực cho tường lửa §5.
--
-- Bối cảnh (rà toàn hệ thống 31/07/2026): 0009 bật RLS theo danh sách viết tay.
-- Danh sách viết tay thì bảng sinh sau, hoặc bảng bị quên, sẽ NẰM NGOÀI mà không
-- ai thấy — trong khi câu `grant select on all tables in schema ... to authenticated`
-- ở 0009:251 lại quét theo schema, không theo danh sách. Hai cơ chế lệch nhau đúng
-- một nhịp là đủ để mở cửa:
--
--   1. care.care_case_flags  — được GRANT, thiếu RLS  → mọi tài khoản đăng nhập
--      (kể cả học sinh, phụ huynh) đọc được toàn bộ bảng nối case↔flag: số ca đang
--      mở toàn hệ, số cờ mỗi ca, thời điểm gắn. Không có tên nhưng có SỐ LƯỢNG và
--      có case_id — đủ để đếm "lớp mình có mấy bạn đang bị theo dõi".
--   2. ops.embedded_app_events — bảng DUY NHẤT trong repo chưa có dòng
--      `enable row level security` nào. Hiện chưa lộ vì câu grant ở 0009 chạy
--      trước khi bảng tồn tại (0019). Đó là may, không phải thiết kế: một câu
--      `grant ... on all tables in schema ops` trong tương lai là lộ ngay.
--   3. attendance.checkin_rules — được GRANT, thiếu RLS. Cột campus_cidrs CHÍNH LÀ
--      cơ chế chống gian lận điểm danh của ADR-007. Học sinh đọc được dải IP trường
--      và khung giờ hợp lệ thì cơ chế đó chỉ còn là trang trí.
--   4. security_invoker — mọi view trong repo tạo không kèm tuỳ chọn này. Trên
--      PostgreSQL 15/16 mặc định là SECURITY DEFINER: view chạy bằng quyền của chủ
--      view, bỏ qua cả RLS lẫn GRANT của người gọi. Với ba view core.v_my_* đó là
--      CHỦ Ý (WHERE tự khoá theo core.current_user_id()). Với report.v_campus_trends
--      thì không: view đó `select avg(c.mood) from attendance.checkins` — đúng thứ
--      §5 cấm role `reporting` chạm, và §5 đang được thi hành bằng
--      `revoke usage on schema attendance from reporting` (0009:274). Cấp SELECT
--      trên view definer là vô hiệu hoá toàn bộ lệnh revoke đó.
--
-- Không sửa 0009 tại chỗ: migration đã chạy ở môi trường khác thì sửa lại là §2.
--
-- Phụ thuộc: 0004 (checkin_rules), 0005 (care_case_flags), 0009 (hàm can_see_*,
-- has_role, các view), 0011 (v_stale_sources), 0012 (v_vaar_indicators), 0019
-- (embedded_app_events).

begin;

-- ---------------------------------------------------------------------------
-- 1. care.care_case_flags — cùng phạm vi với chính hồ sơ mà nó nối tới
-- ---------------------------------------------------------------------------
alter table care.care_case_flags enable row level security;

drop policy if exists care_case_flags_scope on care.care_case_flags;
create policy care_case_flags_scope on care.care_case_flags for select to authenticated
  using (
    exists (
      select 1 from care.care_cases c
       where c.id = case_id and core.can_see_care(c.student_id)
    )
  );

comment on table care.care_case_flags is
  'Bảng nối flags ↔ cases. RLS đi THEO care_cases (0024): thấy được hồ sơ thì mới thấy được các cờ gắn vào hồ sơ đó — không có đường vòng nào để đếm số ca đang mở.';

-- ---------------------------------------------------------------------------
-- 2. ops.embedded_app_events — deny by default, chỉ vai máy chủ đọc
-- ---------------------------------------------------------------------------
-- Bảng chứa payload TỰ DO từ app ngoài kèm actor_user_id thật. Không có cách nào
-- biết trước app ngoài nhét gì vào payload, nên không có policy nào cho
-- `authenticated` là đúng: chưa chứng minh được an toàn thì đóng.
alter table ops.embedded_app_events enable row level security;
alter table ops.embedded_app_events force  row level security;

-- Phòng thủ chiều sâu: nếu sau này ai đó chạy `grant ... on all tables in schema ops`
-- thì dòng revoke này đã bị ghi đè, nhưng RLS ở trên vẫn giữ bảng đóng.
revoke all on ops.embedded_app_events from authenticated;

-- FORCE áp cả cho CHỦ BẢNG. Mà core.promote_embedded_event() là SECURITY DEFINER
-- thuộc đúng chủ bảng đó — không có policy này thì đường ingest §8 chết ngay khi
-- chủ bảng không phải superuser (dev dùng superuser nên CI sẽ KHÔNG bắt được lỗi
-- đó, chỉ production mới gãy). Vì vậy cấp policy tường minh cho chủ bảng, đọc tên
-- chủ từ catalog để migration không phụ thuộc tên role của từng môi trường.
do $$
declare
  v_owner text;
begin
  select pg_get_userbyid(relowner) into v_owner
    from pg_class where oid = 'ops.embedded_app_events'::regclass;

  execute 'drop policy if exists embedded_app_events_server on ops.embedded_app_events';
  execute format(
    'create policy embedded_app_events_server on ops.embedded_app_events
       for all to %I using (true) with check (true)', v_owner);
end
$$;

-- ADR-006 — job backup phải thấy bảng này, nếu không thì "sao lưu đủ" là lời nói dối.
-- 0009:278 cấp quyền theo `all tables in schema ops` NHƯNG chạy trước khi 0019 tạo
-- bảng, nên bảng này đang nằm ngoài phạm vi backup mà không ai được báo.
grant select on ops.embedded_app_events to backup_reader;
drop policy if exists embedded_app_events_backup on ops.embedded_app_events;
create policy embedded_app_events_backup on ops.embedded_app_events
  for select to backup_reader using (true);

comment on table ops.embedded_app_events is
  'Rổ Xanh — cổng nhận TOÀN BỘ sự kiện nghiệp vụ từ app nhúng ngoài, giữ nguyên payload JSON. RLS deny-by-default (0024): không policy nào cho authenticated; chỉ vai máy chủ (chủ bảng, qua promote()) và backup_reader đọc được.';

-- ---------------------------------------------------------------------------
-- 3. attendance.checkin_rules — cấu hình chống gian lận, không phải dữ liệu chung
-- ---------------------------------------------------------------------------
alter table attendance.checkin_rules enable row level security;

-- Chỉ quản trị và Hội đồng dữ liệu đọc. Đường kiểm IP lúc check-in KHÔNG đi qua
-- đây bằng quyền người dùng: server đọc bằng vai máy chủ / SECURITY DEFINER, nên
-- siết policy này không làm gãy ADR-007.
drop policy if exists checkin_rules_admin_read on attendance.checkin_rules;
create policy checkin_rules_admin_read on attendance.checkin_rules for select to authenticated
  using (core.has_role('admin') or core.has_role('board'));

comment on table attendance.checkin_rules is
  'ADR-007 — khung giờ + dải IP hợp lệ của từng cơ sở. RLS admin/board (0024): công khai dải IP và khung giờ cho học sinh là chỉ dẫn cách gian lận điểm danh.';

-- ---------------------------------------------------------------------------
-- 4. security_invoker cho các view KHÔNG tự khoá theo người gọi
-- ---------------------------------------------------------------------------
-- Sau lệnh này, mọi view dưới đây chạy bằng quyền NGƯỜI GỌI. Role `reporting`
-- (đã bị revoke usage on schema attendance ở 0009:274) sẽ nhận permission denied
-- ngay cả khi được cấp SELECT trên chính view — tường lửa §5 lại có hiệu lực thật.
alter view report.v_campus_trends    set (security_invoker = true);
alter view report.v_vaar_indicators  set (security_invoker = true);

-- Signal views (ADR-010): flag engine chạy bằng vai máy chủ nên không đổi hành vi;
-- điểm được là không còn cửa hậu "cấp SELECT một view là đọc xuyên mọi Mini App".
alter view care.v_signal_attendance  set (security_invoker = true);
alter view care.v_signal_behavior    set (security_invoker = true);
alter view care.v_signal_course      set (security_invoker = true);
alter view care.v_signal_emotion     set (security_invoker = true);

-- Buồng lái đọc view này bằng phiên người dùng: authenticated đã có SELECT trên
-- ops.source_freshness kèm policy `using (true)` (0011) nên đổi sang invoker
-- KHÔNG làm băng vàng biến mất.
alter view ops.v_stale_sources       set (security_invoker = true);

-- Ba view core.v_my_* CỐ TÌNH giữ security definer — ghi rõ ra để lần rà sau
-- không ai "sửa cho đồng bộ" rồi làm gãy đăng nhập.
comment on view core.v_my_scopes is
  'Chỉ trả về scope của core.current_user_id() — an toàn cấp SELECT rộng vì WHERE tự khoá theo người gọi. DEFINER CÓ CHỦ Ý (0024): core.user_role_scopes không cấp quyền cho authenticated, view này là cửa duy nhất; bật security_invoker sẽ làm mọi màn hình mất vai trò.';

comment on view core.v_my_guardians is
  'Chỉ trả về phụ huynh của core.current_user_id() (khi người gọi là học sinh). DEFINER CÓ CHỦ Ý (0024) — cùng lý do v_my_scopes: WHERE tự khoá theo người gọi, không dựa vào RLS của bảng gốc.';

comment on view core.v_my_homeroom_teacher is
  'Chỉ trả về GVCN của core.current_user_id() (khi người gọi là học sinh), đã bỏ hậu tố "(...)" trong full_name. DEFINER CÓ CHỦ Ý (0024) — đọc core.user_role_scopes vốn không cấp quyền cho authenticated.';

-- ---------------------------------------------------------------------------
-- 5. Allowlist tường minh — để lần sau không phải rà bằng mắt nữa
-- ---------------------------------------------------------------------------
-- Gốc rễ của cả ba lỗ trên là: KHÔNG có chỗ nào trả lời được câu "bảng nào đang
-- không có RLS, và điều đó có chủ ý không?". Từ nay bảng không có RLS phải được
-- KHAI BÁO, kèm lý do. Bảng mới quên bật RLS → hiện ngay trong ops.v_rls_gaps →
-- pgTAP 0024 đỏ → CI chặn merge.
create table if not exists ops.rls_exemptions (
  schema_name             text not null,
  table_name              text not null,
  reason                  text not null,
  -- true = cố tình cho người đăng nhập đọc cả bảng (danh mục dùng chung, không PII).
  allow_authenticated_read boolean not null default false,
  declared_at             timestamptz not null default now(),
  primary key (schema_name, table_name)
);

comment on table ops.rls_exemptions is
  'Danh sách bảng CỐ TÌNH không bật RLS, kèm lý do. Không phải tài liệu — ops.v_rls_gaps đối chiếu bảng này với catalog thật, pgTAP 0024 khẳng định phần dư bằng rỗng.';

-- Bảng khai báo ngoại lệ mà lại là ngoại lệ của chính nó thì thành vòng lặp:
-- bật RLS, không policy, không grant.
alter table ops.rls_exemptions enable row level security;

insert into ops.rls_exemptions (schema_name, table_name, reason, allow_authenticated_read) values
  -- Danh mục dùng chung, không gắn cá nhân: mở cho mọi người đăng nhập là chủ ý (0009:250).
  ('core', 'schools',          'Danh mục cơ sở — không có dữ liệu cá nhân, mọi màn hình cần tên cơ sở', true),
  ('core', 'classes',          'Danh mục lớp — không có dữ liệu cá nhân, dùng để vẽ bộ lọc lớp',        true),
  ('core', 'school_networks',  'Danh mục hệ thống trường — một dòng, không có dữ liệu cá nhân',         true),
  -- Bảng phân quyền: KHÔNG cấp GRANT cho authenticated, nên đóng bằng quyền bảng.
  -- Cấp quyền sau này mà quên bật RLS → v_rls_gaps bắt ngay (allow_authenticated_read = false).
  ('core', 'roles',            'Từ điển vai trò — không GRANT cho authenticated; đọc qua core.v_my_scopes',        false),
  ('core', 'permissions',      'Từ điển quyền — không GRANT cho authenticated',                                     false),
  ('core', 'role_permissions', 'Ma trận vai trò↔quyền — không GRANT cho authenticated',                            false),
  ('core', 'teachers',         'Hồ sơ giáo viên — không GRANT cho authenticated; chỉ hàm SECURITY DEFINER đọc',    false),
  ('core', 'class_assignments','Phân công lớp — không GRANT cho authenticated; chỉ core.is_homeroom_of/teaches đọc', false),
  ('core', 'user_role_scopes', 'Bảng phân quyền — không GRANT cho authenticated; cửa duy nhất là core.v_my_scopes', false),
  -- Nhật ký máy: chỉ job nền và vai máy chủ.
  ('ops',  'audit_log',        'Sổ audit — không GRANT cho authenticated; chỉ vai máy chủ ghi/đọc',                 false),
  ('ops',  'heartbeats',       'Nhịp tim job nền — không GRANT cho authenticated',                                  false),
  ('ops',  'outbox_messages',  'Hàng đợi gửi tin — chứa nội dung bản tin, không GRANT cho authenticated',           false)
on conflict (schema_name, table_name) do update
   set reason = excluded.reason,
       allow_authenticated_read = excluded.allow_authenticated_read;

-- Phần dư giữa catalog thật và allowlist. Rỗng = không còn lỗ nào chưa khai báo.
create or replace view ops.v_rls_gaps
with (security_invoker = true) as
  with tracked as (
    select n.nspname as schema_name,
           c.relname as table_name,
           c.oid     as table_oid,
           c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r'
       and n.nspname in ('core', 'attendance', 'care', 'evidence', 'tutor', 'health', 'ops')
  )
  select t.schema_name,
         t.table_name,
         case
           when e.table_name is null
             then 'thiếu RLS và KHÔNG có trong ops.rls_exemptions'
           else 'khai là nội bộ (allow_authenticated_read = false) nhưng đã được cấp SELECT cho authenticated'
         end as problem
    from tracked t
    left join ops.rls_exemptions e
           on e.schema_name = t.schema_name
          and e.table_name  = t.table_name
   where not t.relrowsecurity
     and (
       e.table_name is null
       or (not e.allow_authenticated_read
           and has_table_privilege('authenticated', t.table_oid, 'select'))
     );

comment on view ops.v_rls_gaps is
  'Bảng không có RLS mà chưa khai trong ops.rls_exemptions, HOẶC đã khai là nội bộ nhưng lại được GRANT cho authenticated. pgTAP 0024 khẳng định view này rỗng — đó là cách duy nhất để "quên bật RLS" trở thành lỗi CI thay vì phát hiện bằng mắt.';

commit;
