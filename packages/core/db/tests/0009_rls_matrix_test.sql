-- pgTAP — MA TRẬN PHÂN QUYỀN (02-database.md)
--
-- Nghĩa vụ: mỗi ô của ma trận phải có test CẢ chiều cho phép LẪN chiều từ chối.
-- Test chỉ kiểm "ai xem được" mà bỏ "ai KHÔNG xem được" là test vô dụng —
-- lỗi phân quyền luôn nằm ở chiều thứ hai.

begin;
select plan(16);
select test_support.seed_basic();

-- Dữ liệu để soi: Minh (6A1) và Bình (6A2)
insert into attendance.checkins (student_id, occurred_on, mood, status) values
  ('70000000-0000-0000-0000-000000000001', current_date, 2, 'present'),
  ('70000000-0000-0000-0000-000000000002', current_date, 4, 'present');

insert into care.flags (student_id, rule_code, as_of_date) values
  ('70000000-0000-0000-0000-000000000001', 'E_MOOD', current_date);

insert into care.care_cases (id, student_id, owner_id, tier) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001', 2);

insert into care.counselor_notes (case_id, author_id, body) values
  ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
   'Nội dung tư vấn — không ai ngoài phạm vi được đọc');

-- ═══ HỌC SINH: chỉ mình ═══════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh
select isnt_empty(
  $$ select 1 from attendance.checkins where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'Học sinh xem được check-in của chính mình');
select is_empty(
  $$ select 1 from attendance.checkins where student_id = '70000000-0000-0000-0000-000000000002' $$,
  'Học sinh KHÔNG xem được của bạn khác');
select is_empty(
  $$ select 1 from care.flags $$,
  'Học sinh KHÔNG thấy cờ của chính mình — buồng lái là ngôn ngữ nội bộ, không phải ngôn ngữ với các em');
select test_support.logout();

-- ═══ PHỤ HUYNH: con mình ══════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000004');
select isnt_empty(
  $$ select 1 from attendance.checkins where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'Phụ huynh xem được của con mình');
select is_empty(
  $$ select 1 from attendance.checkins where student_id = '70000000-0000-0000-0000-000000000002' $$,
  'Phụ huynh KHÔNG xem được con nhà khác');
select is_empty(
  $$ select 1 from care.counselor_notes $$,
  'Phụ huynh KHÔNG đọc được ghi chú tư vấn');
select test_support.logout();

-- ═══ GIÁO VIÊN BỘ MÔN: lớp được phân công, không có care ══════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- thầy Nam
select isnt_empty(
  $$ select 1 from attendance.checkins where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'Giáo viên bộ môn xem được học sinh lớp mình dạy');
select is_empty(
  $$ select 1 from attendance.checkins where student_id = '70000000-0000-0000-0000-000000000002' $$,
  'Giáo viên bộ môn KHÔNG xem được lớp không dạy');
select is_empty(
  $$ select 1 from care.flags $$,
  'Giáo viên bộ môn KHÔNG thấy cờ cảnh báo (ma trận: chỉ homeroom/counselor)');
select is_empty(
  $$ select 1 from care.counselor_notes $$,
  'Giáo viên bộ môn KHÔNG đọc ghi chú tư vấn');
select test_support.logout();

-- ═══ GVCN: lớp chủ nhiệm, có care ═════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan
select isnt_empty($$ select 1 from care.flags $$,
  'GVCN thấy cờ của lớp mình — chiều cho phép');
select isnt_empty($$ select 1 from care.counselor_notes $$,
  'GVCN đọc được ghi chú tư vấn của ca mình phụ trách');
select test_support.logout();

-- ═══ GVCN LỚP KHÁC: không tra cứu chéo ════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000006');  -- cô Hạnh, 6A2
select is_empty(
  $$ select 1 from care.flags where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN lớp khác KHÔNG tra cứu được cờ của học sinh ngoài lớp mình');
select test_support.logout();

-- ═══ TÂM LÝ CỤM: cả cụm ═══════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000003');  -- cô Mai
select isnt_empty(
  $$ select 1 from care.flags where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'Tâm lý cụm thấy ca trong cụm của mình');
select test_support.logout();

-- ═══ §5 TƯỜNG LỬA: bộ sinh báo cáo không chạm dữ liệu cảm xúc ═════════════
select ok(
  not has_table_privilege('reporting', 'attendance.checkins', 'SELECT'),
  '§5 — role reporting KHÔNG đọc được check-in cảm xúc'
);
select ok(
  not has_table_privilege('reporting', 'evidence.survey_responses', 'SELECT'),
  '§5 — role reporting KHÔNG đọc được khảo sát nhạy cảm'
);

select * from finish();
rollback;
