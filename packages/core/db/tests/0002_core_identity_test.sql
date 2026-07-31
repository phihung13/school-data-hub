-- pgTAP — core: định danh, mã học sinh, ghi danh (§1)
begin;
select plan(8);
select test_support.seed_basic();

select has_table('core', 'students', 'core.students tồn tại');
select has_table('core', 'enrollments', 'core.enrollments tồn tại');

-- ── §1: mã học sinh đúng khuôn và bất biến ─────────────────────────────────
select throws_ok(
  $$ insert into core.students (student_code, school_id, full_name)
     values ('HS-001', '20000000-0000-0000-0000-000000000001', 'Sai khuôn') $$,
  '23514', null,
  'Mã không đúng khuôn VA-YYYY-NNNNN bị chặn (§1)'
);

select throws_ok(
  $$ insert into core.students (student_code, school_id, full_name)
     values ('VA-2026-00417', '20000000-0000-0000-0000-000000000001', 'Trùng mã') $$,
  '23505', null,
  'Mã học sinh trùng bị chặn — một mã cho một em, xuyên 12 năm'
);

-- ── Một em không học hai lớp cùng lúc ──────────────────────────────────────
-- Nếu để lọt, phân quyền theo lớp sai âm thầm: hai GVCN cùng thấy một em.
select throws_ok(
  $$ insert into core.enrollments (student_id, class_id, valid_from)
     values ('70000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000002', '2026-10-01') $$,
  '23P01', null,
  'Ghi danh chồng lấn thời gian bị chặn'
);

-- Chuyển lớp hợp lệ: đóng kỳ cũ trước rồi mở kỳ mới.
select lives_ok(
  $$ update core.enrollments set valid_to = '2026-09-30'
      where student_id = '70000000-0000-0000-0000-000000000001';
     insert into core.enrollments (student_id, class_id, valid_from)
     values ('70000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000002', '2026-10-01') $$,
  'Chuyển lớp đúng cách (đóng kỳ cũ) thì được'
);

-- ── ADR-016: khóa tài khoản là mất ngữ cảnh ngay ───────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000001');
select isnt(core.current_user_id(), null, 'Tài khoản active có ngữ cảnh người dùng');
select test_support.logout();

update core.users set status = 'disabled'
 where id = '40000000-0000-0000-0000-000000000001';

select test_support.login_as('90000000-0000-0000-0000-000000000001');
select is(core.current_user_id(), null,
  'Tài khoản disabled -> current_user_id() NULL -> mọi policy đóng lại (ADR-016)');
select test_support.logout();

select * from finish();
rollback;
