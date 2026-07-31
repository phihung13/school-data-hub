-- pgTAP — attendance.checkins UPDATE tự sửa mood trong ngày (0017)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0017_checkins_self_update_test.sql

begin;
select plan(4);
select test_support.seed_basic();

insert into attendance.checkins (student_id, occurred_on, kind, mood, status)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 2, 'present');

-- ── Tự sửa mood của chính mình (nhánh ON CONFLICT DO UPDATE của submitMood) ──
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 4, 'present', 'app')
     on conflict (student_id, occurred_on, kind) do update set mood = excluded.mood $$,
  'Minh bấm check-in lần 2 trong ngày (đổi mood qua ON CONFLICT DO UPDATE) — cho phép'
);
select is(
  (select mood::int from attendance.checkins
     where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date),
  4,
  'Mood đã đổi thành 4, vẫn chỉ một dòng (§9)'
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
