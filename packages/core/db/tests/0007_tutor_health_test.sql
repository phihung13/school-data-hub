-- pgTAP — ảnh chụp học thuật + y tế (ADR-009)
begin;
select plan(6);
select test_support.seed_basic();

select col_is_fk('tutor', 'mastery_snapshots', 'student_id', 'mastery_snapshots FK về core.students');
select col_is_fk('health', 'logs',             'student_id', 'health.logs FK về core.students');

-- Ảnh chụp cùng ngày cùng mạch kiến thức chỉ có một bản (§9) —
-- connector kéo lại nhiều lần trong ngày là chuyện bình thường.
select lives_ok(
  $$ insert into tutor.mastery_snapshots (student_id, strand_code, mastery, as_of_date)
     values ('70000000-0000-0000-0000-000000000001', 'MATH-ALG', 62.5, current_date) $$,
  'Ghi ảnh chụp mastery'
);
select throws_ok(
  $$ insert into tutor.mastery_snapshots (student_id, strand_code, mastery, as_of_date)
     values ('70000000-0000-0000-0000-000000000001', 'MATH-ALG', 70.0, current_date) $$,
  '23505', null,
  'Kéo lại cùng ngày không tạo hai ảnh chụp (§9)'
);

-- ── ADR-009: giáo viên bộ môn KHÔNG đọc được y tế ──────────────────────────
insert into health.logs (student_id, logged_on, category, detail, recorded_by)
values ('70000000-0000-0000-0000-000000000001', current_date, 'medication',
        '{"note": "uống thuốc sau bữa trưa"}', '40000000-0000-0000-0000-000000000001');

select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- thầy Nam, bộ môn 6A1
select is_empty(
  $$ select 1 from health.logs
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'Giáo viên bộ môn KHÔNG đọc được y tế của học sinh mình dạy (ADR-009)'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN
select isnt_empty(
  $$ select 1 from health.logs
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN đọc được y tế của học sinh lớp mình — chiều cho phép cũng phải đúng'
);
select test_support.logout();

select * from finish();
rollback;
