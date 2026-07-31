-- pgTAP — core.v_my_scopes (0015)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0015_my_scopes_view_test.sql

begin;
select plan(4);
select test_support.seed_basic();

select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, homeroom 6A1
select is(
  (select role_code from core.v_my_scopes),
  'homeroom',
  'Cô Lan thấy đúng vai trò của mình (homeroom)'
);
select is(
  (select class_id::text from core.v_my_scopes),
  '30000000-0000-0000-0000-000000000001',
  'Cô Lan thấy đúng lớp mình chủ nhiệm (6A1), không phải lớp khác'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000006'); -- Cô Hạnh, homeroom 6A2
select is(
  (select class_id::text from core.v_my_scopes),
  '30000000-0000-0000-0000-000000000002',
  'Cô Hạnh thấy lớp của mình (6A2), không lẫn với Cô Lan'
);
select test_support.logout();

-- ── Chiều từ chối: không đăng nhập thì không thấy gì (current_user_id() = NULL) ─
select is_empty(
  $$ select * from core.v_my_scopes $$,
  'Chưa đăng nhập (không có claim.sub) — view rỗng, không rò dữ liệu'
);

select * from finish();
rollback;
