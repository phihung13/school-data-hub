-- pgTAP — màn hình Điều hành cho BGH (0040_report_aggregate.sql), gói "man-hinh-bgh".
-- Chạy: psql -f packages/core/db/tests/0040_report_aggregate_test.sql (hoặc tools/run-db-tests.sh)
--
-- File này trả nốt DEBT #16 ("principal và board chưa có test"): 0023 đã khoá phần
-- principal KHÔNG được đọc gì, còn đây khoá phần principal/board ĐƯỢC đọc gì — và
-- khoá luôn cái giá của việc mở: hàm tổng hợp chạy SECURITY DEFINER nên nó phải tự
-- chứng minh bốn điều, không điều nào bỏ được:
--
--   1. VAI  — GVCN, học sinh, phụ huynh gọi vào phải nhận LỖI 42501, không nhận bảng
--             rỗng. Rỗng đọc thành "hôm nay cả khối không có gì".
--   2. PHẠM VI — hiệu trưởng Q7 không thấy số của cơ sở Q2; board thấy cả hai.
--   3. KHÔNG MỞ CỬA SAU — sau khi gọi được hàm đếm hồ sơ chăm sóc, principal vẫn
--             KHÔNG select được một dòng nào của care.care_cases; board vẫn KHÔNG
--             select được core.students. Hàm đếm không được biến thành đường tra cứu.
--   4. NGƯỠNG ẨN DANH — lớp dưới 10 em bị che số đo (NULL, không phải 0), nhưng tổng
--             KHỐI vẫn cộng đủ phần của lớp bị che. Che ở chỗ hiển thị, không phải
--             che bằng cách đánh mất dữ liệu.
--
-- Bố cục dữ liệu dựng thêm (ngoài seed_basic):
--   Q7 · 6A1: 1 em (Minh)          → dưới ngưỡng, bị che
--   Q7 · 6A2: 1 em (Bình)          → dưới ngưỡng, bị che
--   Q7 · 6A3: 12 em                → đủ ngưỡng: 10 check-in (có mood), 1 vắng, 1 CHƯA CÓ DÒNG NÀO
--   Q2 · 7B1: 12 em                → cơ sở khác, để phạm vi có chiều từ chối thật

begin;
select plan(27);
select test_support.seed_basic();

-- ── Dựng thêm hai lớp có sĩ số thật ─────────────────────────────────────────
insert into core.classes (id, school_id, code, academic_year, grade) values
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-000000000001', '6A3', '2026-2027', 6),
  ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000002', '7B1', '2026-2027', 7);

insert into core.students (id, student_code, school_id, full_name)
select ('71000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       'VA-2026-4' || lpad(i::text, 4, '0'),
       '20000000-0000-0000-0000-000000000001',
       'Em 6A3 số ' || i
  from generate_series(1, 12) i;

insert into core.students (id, student_code, school_id, full_name)
select ('72000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       'VA-2026-5' || lpad(i::text, 4, '0'),
       '20000000-0000-0000-0000-000000000002',
       'Em 7B1 số ' || i
  from generate_series(1, 12) i;

insert into core.enrollments (student_id, class_id, valid_from)
select ('71000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       '30000000-0000-0000-0000-0000000000a3', '2026-09-05'
  from generate_series(1, 12) i;

insert into core.enrollments (student_id, class_id, valid_from)
select ('72000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       '30000000-0000-0000-0000-0000000000b1', '2026-09-05'
  from generate_series(1, 12) i;

-- 6A3: em 1–10 check-in có tâm trạng (5 vui · 3 bình thường · 1 mệt · 1 buồn),
--      em 11 vắng, em 12 KHÔNG có dòng nào (đây là ca "im lặng ≠ vắng").
insert into attendance.checkins (student_id, occurred_on, kind, status, mood)
select ('71000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       current_date, 'in', 'present',
       case when i <= 5 then 4 when i <= 8 then 3 when i = 9 then 2 else 1 end
  from generate_series(1, 10) i;

insert into attendance.checkins (student_id, occurred_on, kind, status, mood) values
  ('71000000-0000-0000-0000-000000000011', current_date, 'in', 'absent', null);

-- Hai hồ sơ chăm sóc đang mở trong 6A3 (+ một hồ sơ đã đóng, để phép đếm phải lọc thật).
insert into care.care_cases (student_id, owner_id, tier, status) values
  ('71000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 2, 'open'),
  ('71000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 2, 'open'),
  ('71000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 2, 'closed');

-- Vai `board` chưa có trong fixture chung (seed_basic dừng ở principal/admin) — dựng
-- tại chỗ, KHÔNG sửa fixture dùng chung để bài khác không bị đổi nền dưới chân.
-- board là vai TOÀN HỆ: dòng phân quyền không gắn school_id (0003 cho phép đúng thế).
insert into core.users (id, auth_uid, email, full_name, status) values
  ('40000000-0000-0000-0000-0000000000b0', '90000000-0000-0000-0000-0000000000b0',
   'hoidong@va.edu.vn', 'Cô Thu (ban điều hành)', 'active');
insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values
  ('40000000-0000-0000-0000-0000000000b0', 'board', null, null);

-- ── A. Hình dạng hàm: không hứa dữ liệu cá nhân ─────────────────────────────
select is(report.min_cohort(), 10,
  'Ngưỡng ẩn danh là 10 — cùng con số với having count(*) >= 10 của report.v_campus_trends (0009)');

select ok(
  pg_get_function_result('report.class_pulse(date, text)'::regprocedure) !~* '(student|full_name|teacher)',
  'class_pulse KHÔNG có cột nào mang student/full_name/teacher — đơn vị nhỏ nhất là LỚP (§9)'
);
select ok(
  pg_get_function_result('report.grade_pulse(date, text)'::regprocedure) !~* '(student|full_name|teacher)',
  'grade_pulse KHÔNG có cột nào mang student/full_name/teacher'
);

-- ── B. Cấp quyền: hàm thô không cho ai, hàm bọc không cho `reporting` ────────
select ok(
  not has_function_privilege('authenticated', 'report.class_pulse_raw(date)'::regprocedure, 'execute'),
  'class_pulse_raw (chạm thẳng dữ liệu, KHÔNG có cổng vai) không cấp cho authenticated — chỉ hai hàm bọc gọi được'
);
select ok(
  not has_function_privilege('reporting', 'report.class_pulse(date, text)'::regprocedure, 'execute'),
  '§5 — role `reporting` (bộ sinh báo cáo học thuật) KHÔNG gọi được hàm đọc mood, kể cả dạng tổng hợp'
);

-- ── C. Vai sai phải nhận LỖI, không nhận bảng rỗng ──────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, GVCN 6A1
select throws_ok(
  $$ select * from report.class_pulse() $$, '42501', null,
  'GVCN gọi màn Điều hành → 42501. Trả rỗng sẽ đọc thành "cả khối hôm nay không có gì"'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Học sinh Minh
select throws_ok(
  $$ select * from report.grade_pulse() $$, '42501', null,
  'Học sinh gọi grade_pulse → 42501'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000004'); -- Phụ huynh
select throws_ok(
  $$ select * from report.aggregate_school_ids() $$, '42501', null,
  'Phụ huynh gọi cổng phạm vi → 42501'
);
select test_support.logout();

-- ── D. Hiệu trưởng cơ sở: được số tổng hợp, đúng phạm vi ────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000007'); -- Hùng: principal Q7

select results_eq(
  $$ select school_id from report.aggregate_school_ids() $$,
  $$ values ('20000000-0000-0000-0000-000000000001'::uuid) $$,
  'Phạm vi của hiệu trưởng Q7 đúng MỘT cơ sở — lấy từ core.user_role_scopes, không từ JWT'
);

select results_eq(
  $$ select class_code from report.class_pulse() $$,
  $$ values ('6A1'::text), ('6A2'), ('6A3') $$,
  'Hiệu trưởng Q7 thấy đúng ba lớp của cơ sở mình, KHÔNG thấy 7B1 (Q2)'
);

select is(
  (select roster_count from report.class_pulse() where class_code = '6A3'), 12,
  'Sĩ số 6A3 = 12'
);
select is(
  (select cohort_too_small from report.class_pulse() where class_code = '6A3'), false,
  '6A3 đủ ngưỡng ẩn danh nên số được hiện'
);
select is(
  (select checked_in_count from report.class_pulse() where class_code = '6A3'), 10,
  '6A3: 10 em đã check-in'
);
select is(
  (select absent_count from report.class_pulse() where class_code = '6A3'), 1,
  '6A3: đúng 1 em được ghi VẮNG'
);
-- Assertion quan trọng nhất của cả file về mặt nghiệp vụ.
select is(
  (select no_record_count from report.class_pulse() where class_code = '6A3'), 1,
  '6A3: em không có dòng check-in nào ra cột no_record_count, KHÔNG bị cộng vào absent_count'
);
select is(
  (select mood_happy from report.class_pulse() where class_code = '6A3'), 5,
  '6A3: phân bố tâm trạng hiện ra khi đủ 10 em đã ghi (5 "Vui")'
);
select is(
  (select open_care_count from report.class_pulse() where class_code = '6A3'), 2,
  '6A3: đếm ĐÚNG 2 hồ sơ đang mở — hồ sơ đã đóng không được tính'
);

-- ── E. Ngưỡng ẩn danh: lớp nhỏ bị che, và che bằng NULL chứ không bằng 0 ─────
select is(
  (select cohort_too_small from report.class_pulse() where class_code = '6A1'), true,
  'Lớp 6A1 (1 em) dưới ngưỡng — cờ cohort_too_small bật'
);
select is(
  (select checked_in_count from report.class_pulse() where class_code = '6A1'), null::int,
  'Lớp dưới ngưỡng trả NULL, KHÔNG trả 0: 0 là một lời khẳng định, NULL là "không được phép nói"'
);

-- ── F. Tổng KHỐI phải cộng đủ cả phần của lớp bị che ────────────────────────
select is(
  (select roster_count from report.grade_pulse() where grade = 6), 14,
  'Khối 6 = 1 + 1 + 12 = 14 em: che ở chỗ hiển thị, KHÔNG che bằng cách đánh mất dữ liệu'
);
select is(
  (select no_record_count from report.grade_pulse() where grade = 6), 3,
  'Khối 6: 3 em chưa có dòng check-in (1 của 6A1 + 1 của 6A2 + 1 của 6A3)'
);
select is(
  (select class_count from report.grade_pulse() where grade = 6), 3,
  'Khối 6 có 3 lớp có sĩ số'
);
select is_empty(
  $$ select 1 from report.grade_pulse() where grade = 7 $$,
  'Hiệu trưởng Q7 KHÔNG thấy khối 7 của cơ sở Q2'
);

-- ── G. Mở đường ĐẾM không được mở đường ĐỌC ─────────────────────────────────
select is_empty(
  $$ select 1 from care.care_cases $$,
  'Sau khi đếm được hồ sơ chăm sóc, hiệu trưởng VẪN không select được một dòng nào (ma trận: count-only)'
);
select test_support.logout();

-- ── H. Ban điều hành: toàn hệ, nhưng vẫn chỉ là số tổng hợp ─────────────────
select test_support.login_as('90000000-0000-0000-0000-0000000000b0'); -- Cô Thu, board

select results_eq(
  $$ select class_code from report.class_pulse() $$,
  $$ values ('6A1'::text), ('6A2'), ('6A3'), ('7B1') $$,
  'Ban điều hành thấy CẢ HAI cơ sở — vai toàn hệ, không giới hạn campus'
);
select is_empty(
  $$ select 1 from core.students $$,
  'Ban điều hành KHÔNG select được học sinh nào (core.can_see_student cố ý không gồm board) — chỉ số tổng hợp'
);
select is_empty(
  $$ select 1 from attendance.checkins $$,
  'Ban điều hành KHÔNG đọc được dòng check-in nào, kể cả khi vừa xem xong số tổng của chính bảng đó'
);

select test_support.logout();

select * from finish();
rollback;
