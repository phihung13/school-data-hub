-- pgTAP — ba lỗ RLS + tường lửa §5 (0024)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0024_rls_gaps_test.sql
--
-- Ba lỗ này giống nhau ở một điểm: KHÔNG có test nào từng thử đọc bảng bằng vai
-- học sinh. Bật RLS mà không có assertion "học sinh đọc ra 0 dòng" thì lần refactor
-- sau ai đó gỡ policy vẫn xanh. Nên mỗi lỗ ở đây có hai vế:
--   (a) người KHÔNG được phép đọc ra 0 dòng / permission denied, và
--   (b) người ĐƯỢC phép vẫn đọc ra dòng — nếu thiếu vế (b) thì "policy chặn tất"
--       cũng qua test, và ta vá bằng cách làm hỏng tính năng.
--
-- Assertion §5 (số 11) là quan trọng nhất file: nó là bằng chứng DUY NHẤT trong
-- repo rằng tường lửa chăm sóc ↔ đánh giá còn sống. Trước 0024, `reporting` bị
-- chặn khỏi report.v_campus_trends chỉ vì QUÊN cấp SELECT trên view — cấp quyền
-- cho đúng vai được thiết kế để dùng view đó là mở toang §5. Nên test CỐ TÌNH cấp
-- quyền rồi mới kiểm: chặn phải đến từ quyền trên bảng gốc, không phải từ sự quên.

begin;
select plan(14);
select test_support.seed_basic();

-- ── Dữ liệu phụ: một hồ sơ care của Minh + một cờ gắn vào hồ sơ đó ───────────
insert into care.care_cases (id, student_id, owner_id)
     values ('80000000-0000-0000-0000-000000000001',
             '70000000-0000-0000-0000-000000000001',
             '40000000-0000-0000-0000-000000000003');

insert into care.flags (id, student_id, rule_code, as_of_date)
     values ('81000000-0000-0000-0000-000000000001',
             '70000000-0000-0000-0000-000000000001', 'E_MOOD', current_date);

insert into care.care_case_flags (case_id, flag_id)
     values ('80000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001');

-- Vai admin chưa có trong fixture chung; dựng tại chỗ để test này tự đứng được.
insert into core.users (id, auth_uid, email, full_name, status)
     values ('40000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000a1',
             'admin.rls@va.edu.vn', 'Quản trị (test 0024)', 'active');
insert into core.user_role_scopes (user_id, role_code, school_id)
     values ('40000000-0000-0000-0000-0000000000a1', 'admin',
             '20000000-0000-0000-0000-000000000001');

insert into attendance.checkin_rules (school_id, campus_cidrs)
     values ('20000000-0000-0000-0000-000000000001', '{203.0.113.0/24}');

-- ── 1. care.care_case_flags — bảng nối bị bỏ sót ở 0009 ──────────────────────
select is(
  (select relrowsecurity from pg_class where oid = 'care.care_case_flags'::regclass),
  true,
  'care.care_case_flags đã bật RLS (0009 bật cho 6 bảng care nhưng bỏ sót bảng này)'
);

select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh (học sinh)
select is(
  (select count(*)::int from care.care_case_flags),
  0,
  'Học sinh đọc care_case_flags ra 0 dòng — không đếm được số ca đang mở toàn hệ'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000004'); -- Phụ huynh của Minh
select is(
  (select count(*)::int from care.care_case_flags),
  0,
  'Phụ huynh cũng ra 0 dòng — care là vùng hẹp nhất, quan hệ cha-con không mở cửa này'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, GVCN của Minh
select is(
  (select count(*)::int from care.care_case_flags),
  1,
  'GVCN của em đó VẪN đọc được — policy lọc theo can_see_care, không phải chặn tất'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000006'); -- Cô Hạnh, GVCN lớp 6A2
select is(
  (select count(*)::int from care.care_case_flags),
  0,
  'GVCN lớp khác ra 0 dòng — phạm vi đi theo lớp, không theo chức danh'
);
select test_support.logout();

-- ── 2. ops.embedded_app_events — bảng duy nhất chưa từng có dòng enable RLS ──
select is(
  (select relforcerowsecurity from pg_class where oid = 'ops.embedded_app_events'::regclass),
  true,
  'ops.embedded_app_events bật FORCE RLS — chủ bảng cũng bị lọc, vì pool của app chạy bằng chính vai đó'
);

select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select throws_ok(
  'select * from ops.embedded_app_events',
  '42501',
  null,
  'Người đăng nhập chạm ops.embedded_app_events → permission denied (payload tự do từ app ngoài, deny-by-default)'
);
select test_support.logout();

-- FORCE RLS áp cả cho chủ bảng, mà core.promote_embedded_event() là SECURITY DEFINER
-- thuộc đúng chủ bảng đó. Thiếu policy dưới đây thì đường ingest §8 chết ở production
-- (dev chạy superuser nên bỏ qua RLS, CI sẽ KHÔNG bắt được) — nên khoá bằng assertion.
select ok(
  exists (
    select 1
      from pg_policies p
     where p.schemaname = 'ops'
       and p.tablename  = 'embedded_app_events'
       and p.policyname = 'embedded_app_events_server'
       and p.roles::text[] @> array[
             (select pg_get_userbyid(relowner)::text
                from pg_class where oid = 'ops.embedded_app_events'::regclass)
           ]
  ),
  'Có policy cho CHỦ BẢNG — promote() (SECURITY DEFINER) vẫn ghi được dưới FORCE RLS'
);

-- ── 3. attendance.checkin_rules — cấu hình chống gian lận ADR-007 ────────────
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select is(
  (select count(*)::int from attendance.checkin_rules),
  0,
  'Học sinh ra 0 dòng — không đọc được dải IP trường và khung giờ hợp lệ (ADR-007)'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-0000000000a1'); -- Quản trị
select is(
  (select count(*)::int from attendance.checkin_rules),
  1,
  'Quản trị VẪN đọc được — màn hình cấu hình cơ sở không bị vá làm hỏng'
);
select test_support.logout();

-- ── 4. §5 — tường lửa chăm sóc ↔ đánh giá ───────────────────────────────────
-- Cấp đúng thứ mà vai `reporting` lẽ ra phải có, rồi mới kiểm: nếu view còn là
-- SECURITY DEFINER thì câu select này CHẠY ĐƯỢC và trả avg(mood) — §5 sập.
grant select on report.v_campus_trends to reporting;
set local role reporting;
select throws_ok(
  'select * from report.v_campus_trends',
  '42501',
  null,
  '§5 — role reporting có SELECT trên view vẫn bị chặn ở attendance.checkins: security_invoker trả hiệu lực cho revoke ở 0009'
);
reset role;

select is(
  (select 'security_invoker=true' = any (reloptions)
     from pg_class where oid = 'report.v_campus_trends'::regclass),
  true,
  'report.v_campus_trends chạy bằng quyền NGƯỜI GỌI'
);

-- Ba view core.v_my_* thì ngược lại: definer là CHỦ Ý. Bật invoker ở đó sẽ làm
-- mọi màn hình mất vai trò (core.user_role_scopes không cấp quyền cho authenticated).
select is(
  (select coalesce('security_invoker=true' = any (reloptions), false)
     from pg_class where oid = 'core.v_my_scopes'::regclass),
  false,
  'core.v_my_scopes CỐ TÌNH giữ security definer — WHERE tự khoá theo người gọi, đừng "sửa cho đồng bộ"'
);

-- ── 5. Không còn bảng nào thiếu RLS mà chưa khai báo ────────────────────────
select is(
  (select count(*)::int from ops.v_rls_gaps),
  0,
  'ops.v_rls_gaps rỗng — mọi bảng không có RLS đều đã khai tường minh trong ops.rls_exemptions'
);

select * from finish();
rollback;
