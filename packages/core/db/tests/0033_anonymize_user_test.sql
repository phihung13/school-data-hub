-- pgTAP — 0033: ẩn danh hoá tài khoản + chính sách ON DELETE nhất quán
--
-- Câu hỏi bài test trả lời: "một giáo viên nghỉ việc yêu cầu xoá dữ liệu cá nhân —
-- hệ có làm được không, và làm xong thì lịch sử chăm sóc của học sinh còn nguyên
-- chứ?" (Luật 91/2025/QH15 + §9 RULES.md).
--
-- Ba nhóm khẳng định:
--   A. Chính sách ON DELETE là LỰA CHỌN, không phải chỗ ai đó quên gõ mệnh đề.
--   B. core.anonymize_user() xoá đúng phần định danh, giữ đúng phần bằng chứng,
--      và gọi lại là no-op.
--   C. Xoá cứng thì hoặc bị chặn với thông điệp rõ, hoặc chạy sạch — không nửa vời.

begin;
select plan(23);

select test_support.seed_basic();

-- Cô Lan (…0001) là người thao tác trong mọi bảng dưới đây: đúng chân dung một GVCN
-- làm việc vài năm rồi nghỉ, tức ca thật mà chính sách này phải xử lý được.
insert into core.identity_links (system, external_id, user_id)
     values ('moodle', 'lan-moodle-001', '40000000-0000-0000-0000-000000000001');

insert into attendance.checkins (student_id, occurred_on, mood, status, confirmed_by)
     values ('70000000-0000-0000-0000-000000000001', current_date, 3, 'present',
             '40000000-0000-0000-0000-000000000001');

insert into care.care_cases (id, student_id, owner_id, tier) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001', 2);

insert into care.interventions (case_id, actor_id, action, note) values
  ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'gap_rieng', 'Đã gặp em cuối giờ, em nói chuyện ở nhà.');

insert into ops.audit_log (actor_id, action, object_type, object_id) values
  ('40000000-0000-0000-0000-000000000001', 'care.read_case', 'care.care_cases',
   '80000000-0000-0000-0000-000000000001');

-- ── A. Chính sách ON DELETE ─────────────────────────────────────────────────
select has_column('core', 'users', 'anonymized_at',
  'core.users có cột anonymized_at — trả lời được "yêu cầu xoá đã thực hiện lúc nào"');

select has_function('core', 'anonymize_user', array['uuid', 'text'],
  'Có core.anonymize_user(uuid, text) — đường xoá dữ liệu chính thức');

-- confdeltype: 'n' = SET NULL, 'a' = NO ACTION, 'c' = CASCADE.
select is(
  (select confdeltype::text from pg_constraint where conname = 'checkins_confirmed_by_fkey'),
  'n',
  'checkins.confirmed_by = SET NULL — người thao tác mất tên, dòng điểm danh vẫn đúng'
);

-- Mắt xích đã làm `delete from core.users` hỏng nửa vời: cascade tới core.teachers
-- rồi bị FK này chặn bằng 23503 ở giữa chừng.
select is(
  (select confdeltype::text from pg_constraint where conname = 'value_behaviors_confirmed_by_fkey'),
  'n',
  'value_behaviors.confirmed_by = SET NULL — gỡ mắt xích làm lệnh xoá kẹt giữa chừng'
);

select is(
  (select confdeltype::text from pg_constraint where conname = 'audit_log_actor_id_fkey'),
  'a',
  'audit_log.actor_id giữ NO ACTION — sổ audit xoá được người thao tác thì hết là bằng chứng'
);

select is(
  (select confdeltype::text from pg_constraint where conname = 'interventions_actor_id_fkey'),
  'a',
  'interventions.actor_id giữ NO ACTION — "ai đã làm gì cho con tôi" phải trả lời được'
);

-- ── B. Ẩn danh hoá ──────────────────────────────────────────────────────────
-- Hàm là SECURITY DEFINER ghi đè core.users: quên REVOKE thì một tài khoản học sinh
-- khoá được tài khoản hiệu trưởng.
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, học sinh
select throws_ok(
  $$ select core.anonymize_user('40000000-0000-0000-0000-000000000001'::uuid) $$,
  '42501', null,
  'Học sinh KHÔNG gọi được core.anonymize_user (không khoá được tài khoản người khác)'
);
select test_support.logout();

create temp table t_run1 as
  select core.anonymize_user('40000000-0000-0000-0000-000000000001'::uuid,
                             'GV nghỉ việc, yêu cầu xoá theo Luật 91/2025') as m;

select is(
  (select (m ->> 'already_anonymized')::boolean from t_run1),
  false,
  'Lần gọi đầu thực sự làm việc, không phải no-op'
);

select is(
  (select full_name from core.users where id = '40000000-0000-0000-0000-000000000001'),
  'Người dùng đã ẩn danh',
  'Tên thật đã bị thay bằng nhãn vô danh'
);

select ok(
  (select email is null and auth_uid is null and status = 'disabled' and anonymized_at is not null
     from core.users where id = '40000000-0000-0000-0000-000000000001'),
  'Email, auth_uid đã xoá · status=disabled · có mốc anonymized_at'
);

-- Rev F điều 6: giữ lại sổ đăng nhập là giữ đường cho lần SSO kế tiếp nối người cũ
-- vào tài khoản đã ẩn danh — lúc đó "ẩn danh" chỉ còn là đổi tên hiển thị.
select is(
  (select count(*)::int from core.identity_links
    where user_id = '40000000-0000-0000-0000-000000000001'),
  0,
  'Sổ đăng nhập của người đó đã bị gỡ — không nối lại được qua SSO'
);

select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- auth_uid CŨ của cô Lan
select is(
  (select core.current_user_id()),
  null,
  'Đăng nhập bằng auth_uid cũ → core.current_user_id() trả NULL, không vào được hệ'
);
select test_support.logout();

-- Đường vào THẬT của ứng dụng không phải core.current_user_id() mà là
-- core.begin_user_context() (0029, gọi từ withUserContext trong packages/core/db/client.ts).
-- Kiểm cả hai vì chúng là hai đường code khác nhau: vá một đường mà quên đường kia
-- thì tài khoản đã "xoá" vẫn đăng nhập được qua chính lối đi mà production dùng.
select is(
  (select core.begin_user_context('90000000-0000-0000-0000-000000000001'::uuid)),
  null,
  'Đường vào thật của ứng dụng (core.begin_user_context) cũng trả NULL — ADR-016 "khoá là cắt" còn đúng sau khi ẩn danh'
);
select test_support.logout();

-- Phần quan trọng nhất: xoá định danh KHÔNG được kéo theo lịch sử chăm sóc.
select is(
  (select count(*)::int from care.interventions
    where actor_id = '40000000-0000-0000-0000-000000000001'),
  1,
  'Dòng can thiệp vẫn còn nguyên sau khi ẩn danh (bằng chứng không mất)'
);

select is(
  (select count(*)::int from ops.audit_log
    where actor_id = '40000000-0000-0000-0000-000000000001' and action = 'care.read_case'),
  1,
  'Dòng audit cũ vẫn còn nguyên — vẫn truy được "ai đã xem gì"'
);

select is(
  (select count(*)::int from ops.audit_log
    where action = 'core.anonymize_user' and result = 'ok'
      and object_id = '40000000-0000-0000-0000-000000000001'),
  1,
  'Chính việc ẩn danh hoá cũng được ghi audit — thao tác pháp lý phải có dấu vết'
);

-- ── §9: gọi lại là no-op ────────────────────────────────────────────────────
create temp table t_stamp1 as
  select anonymized_at from core.users where id = '40000000-0000-0000-0000-000000000001';

create temp table t_run2 as
  select core.anonymize_user('40000000-0000-0000-0000-000000000001'::uuid, 'gọi lại') as m;

select is(
  (select (m ->> 'already_anonymized')::boolean from t_run2),
  true,
  '§9 — gọi lần hai báo đã ẩn danh, không làm lại'
);

select is(
  (select anonymized_at from core.users where id = '40000000-0000-0000-0000-000000000001'),
  (select anonymized_at from t_stamp1),
  '§9 — mốc anonymized_at KHÔNG bị dời (mốc pháp lý phải là lần đầu)'
);

select is(
  (select count(*)::int from ops.audit_log
    where action = 'core.anonymize_user' and result = 'noop'),
  1,
  '§9 — lần gọi thừa vẫn để lại dấu vết result=noop, không im lặng'
);

select throws_ok(
  $$ select core.anonymize_user('40000000-0000-0000-0000-0000000000ff'::uuid) $$,
  'P0002', null,
  'Ẩn danh một id không tồn tại thì báo lỗi rõ, KHÔNG âm thầm coi như xong'
);

-- ── C. Xoá cứng: chặn có tiếng nói, hoặc chạy sạch ──────────────────────────
select throws_like(
  $$ delete from core.users where id = '40000000-0000-0000-0000-000000000001' $$,
  '%ẩn danh hoá%',
  'Xoá cứng bị chặn kèm thông điệp chỉ đúng đường thay thế (không phải mã 23503 trần)'
);

-- Mở phanh tay: từ đây tới cuối file, DELETE trên core.users được phép chạy.
set local hub.allow_user_hard_delete = 'on';

select throws_like(
  $$ delete from core.users where id = '40000000-0000-0000-0000-000000000001' $$,
  '%còn bằng chứng%',
  'Mở phanh vẫn không xoá được người còn bằng chứng — và nói rõ còn bao nhiêu, ở đâu'
);

-- Người KHÔNG mang bằng chứng thì lệnh xoá phải chạy trọn vẹn, không kẹt ở FK nào.
insert into core.users (id, auth_uid, email, full_name)
     values ('40000000-0000-0000-0000-000000000088', '90000000-0000-0000-0000-000000000088',
             'tam@va.edu.vn', 'Nhân viên thời vụ');

insert into attendance.checkins (student_id, occurred_on, kind, status, confirmed_by)
     values ('70000000-0000-0000-0000-000000000002', current_date, 'in', 'present',
             '40000000-0000-0000-0000-000000000088');

delete from core.users where id = '40000000-0000-0000-0000-000000000088';

select ok(
  (select confirmed_by is null from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000002' and occurred_on = current_date),
  'Xoá cứng người không mang bằng chứng chạy SẠCH: dòng điểm danh còn, confirmed_by về NULL'
);

select * from finish();
rollback;
