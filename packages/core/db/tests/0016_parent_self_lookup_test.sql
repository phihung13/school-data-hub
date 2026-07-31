-- pgTAP — core.parents/core.parent_students tự tra cứu (0016)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0016_parent_self_lookup_test.sql

begin;
select plan(5);
select test_support.seed_basic();

-- PH (fixture) là parent của Minh, không phải của Bình.
select test_support.login_as('90000000-0000-0000-0000-000000000004'); -- PH của Minh

select is(
  (select user_id::text from core.parents where user_id = core.current_user_id()),
  '40000000-0000-0000-0000-000000000004',
  'Phụ huynh tự tra được chính mình trong core.parents'
);

select is(
  (select count(*)::int from core.parent_students),
  1,
  'Phụ huynh chỉ thấy đúng 1 dòng parent_students của mình (Minh), không thấy dòng khác'
);

select is(
  (select student_id::text from core.parent_students limit 1),
  '70000000-0000-0000-0000-000000000001',
  'Dòng thấy được đúng là con của mình (Minh), không phải Bình'
);
select test_support.logout();

-- ── Chiều từ chối: GVCN không tự ý đọc thẳng bảng phụ huynh ─────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan
select is_empty(
  $$ select 1 from core.parent_students $$,
  'GVCN KHÔNG đọc thẳng core.parent_students (không phải phụ huynh) — dùng is_my_child() qua RLS bảng khác'
);
select is_empty(
  $$ select 1 from core.parents $$,
  'GVCN KHÔNG đọc thẳng core.parents của người khác'
);
select test_support.logout();

select * from finish();
rollback;
