-- pgTAP — core.v_my_homeroom_teacher: tên GVCN đã bỏ hậu tố (0020 + 0022)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0022_homeroom_teacher_name_clean_test.sql
--
-- 0022 nhét một regexp_replace vào view để V5/V9 ghép được câu "Gửi riêng cho Cô Lan".
-- Regex nằm trong view thì không ai nhìn thấy nó gãy: đổi quy ước đặt full_name là
-- màn hình lặng lẽ hiện lại "Cô Lan (GVCN 6A1)" hoặc tệ hơn là chuỗi rỗng.
--
-- Điều kiện `e.valid_to is null` (0020 dòng 49) là phần chưa ai kiểm và là phần
-- nguy hiểm hơn: thiếu nó thì em chuyển lớp/chuyển trường vẫn nhìn thấy — và gửi
-- tâm sự cho — GVCN CŨ.

begin;
select plan(4);
select test_support.seed_basic();

-- ── Chiều cho phép ──────────────────────────────────────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select is(
  (select full_name from core.v_my_homeroom_teacher),
  'Cô Lan',
  'Hậu tố "(GVCN 6A1)" bị bỏ ngay tại view — nơi hiển thị không phải lặp regex'
);
select is(
  (select class_code from core.v_my_homeroom_teacher),
  '6A1',
  'class_code trả đúng lớp đang học của em'
);
select test_support.logout();

-- ── Chiều từ chối: giáo viên không có "GVCN của mình" ───────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000002'); -- Thầy Nam
select is_empty(
  $$ select * from core.v_my_homeroom_teacher $$,
  'Giáo viên gọi view → rỗng (view chỉ trả lời câu hỏi của học sinh)'
);
select test_support.logout();

-- ── Ghi danh đã kết thúc thì không còn là GVCN của em nữa ───────────────────
-- Đóng kỳ bằng chính valid_from: enrollments_period_chk đòi valid_to >= valid_from,
-- mà fixture đặt valid_from = 2026-09-05 nên `current_date - 1` có thể nằm TRƯỚC
-- ngày đó tuỳ ngày chạy test. Điều view quan tâm chỉ là valid_to KHÁC NULL.
update core.enrollments set valid_to = valid_from
 where student_id = '70000000-0000-0000-0000-000000000001';

select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select is_empty(
  $$ select * from core.v_my_homeroom_teacher $$,
  'Ghi danh đã kết thúc → view rỗng, em không còn thấy (và không gửi cho) GVCN cũ'
);
select test_support.logout();

select * from finish();
rollback;
