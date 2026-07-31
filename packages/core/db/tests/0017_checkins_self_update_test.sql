-- pgTAP — attendance.checkins UPDATE tự sửa mood trong ngày (0017)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0017_checkins_self_update_test.sql

begin;
select plan(4);
select test_support.seed_basic();

insert into attendance.checkins (student_id, occurred_on, kind, mood, status)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 2, 'present');

-- ── Tự sửa mood của chính mình (nhánh ON CONFLICT DO UPDATE của submitMood) ──
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
-- `do update set mood = 4` chứ KHÔNG phải `= excluded.mood` (sửa 01/08/2026, hệ quả 0038).
-- Postgres tính việc đọc `excluded.mood` là ĐỌC cột `mood`, mà 0038 đã rút quyền SELECT
-- cột đó khỏi vai `authenticated` ⇒ câu cũ ném 42501 ngay ở lần bấm thứ hai của chính em.
-- Router thật đã đổi sang gán tham số (checkin.ts submitMood); bài test phải bám đúng câu
-- router chạy, nếu không nó kiểm một câu không còn ai chạy — xanh mà vô nghĩa.
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 4, 'present', 'app')
     on conflict (student_id, occurred_on, kind) do update set mood = 4 $$,
  'Minh bấm check-in lần 2 trong ngày (đổi mood qua ON CONFLICT DO UPDATE) — cho phép'
);
-- Đọc qua view chủ-quyền `attendance.checkins_care`: đó là đường đọc mood DUY NHẤT của
-- người dùng cuối sau 0038, và chính em nằm trong `core.can_read_mood()` (`is_me`).
select is(
  (select mood::int from attendance.checkins_care
     where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date),
  4,
  'Mood đã đổi thành 4, vẫn chỉ một dòng (§9) — đọc qua checkins_care, đúng đường của 0038'
);
select test_support.logout();

-- ── Không tự sửa được check-in của người khác ───────────────────────────────
insert into attendance.checkins (student_id, occurred_on, kind, mood, status)
     values ('70000000-0000-0000-0000-000000000002', current_date, 'in', 3, 'present');
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select lives_ok(
  $$ update attendance.checkins set mood = 1
     where student_id = '70000000-0000-0000-0000-000000000002' and occurred_on = current_date $$,
  'UPDATE không lỗi (RLS lọc theo USING, không ném exception)'
);
select test_support.logout();
select is(
  (select mood::int from attendance.checkins
     where student_id = '70000000-0000-0000-0000-000000000002' and occurred_on = current_date),
  3,
  'Mood của Bình KHÔNG đổi — Minh không sửa được check-in người khác (0 dòng bị đổi)'
);

select * from finish();
rollback;
