-- pgTAP — "CẦN GẶP THẦY CÔ": ai đọc được lời nhắn của em (0037)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0037_help_requests_scope_test.sql
--
-- Bài này khoá lại một lỗi ĐÃ CHẠY THẬT trên hub_dev: `attendance.help_requests` nằm
-- trong vòng lặp 16 bảng ở 0009:150-176, nên nó dùng chung `core.can_see_student()`
-- với danh sách lớp và bảng điểm. Hàm đó gồm cả `is_my_child` và `principal_of` ⇒
-- PHỤ HUYNH và HIỆU TRƯỞNG đọc được cột `note` — nguyên văn lời em viết cho cô.
--
-- Màn hình `/can-gap-thay-co` in cho em đọc, ngay tại chỗ nhập:
--     "Bạn cùng lớp · thầy cô khác · bố mẹ — KHÔNG nhìn thấy"
-- Lời hứa in trên màn hình là ràng buộc kỹ thuật. File này là chỗ nó được cưỡng chế.
--
-- Ba nhóm assertion, và nhóm thứ hai mới là nhóm bài test tồn tại vì nó:
--   · CHO PHÉP  — chính em, GVCN của em, tâm lý cụm.
--   · TỪ CHỐI   — PHỤ HUYNH (0 dòng), GV bộ môn, GVCN lớp khác, hiệu trưởng/quản trị.
--   · KHÔNG SIẾT NHẦM — phụ huynh vẫn tra được con mình, GVCN vẫn đọc được check-in.
--     Thiếu nhóm ba thì một lần siết tay quá đà vẫn xanh, mà cô mất tín hiệu để hành
--     động và phụ huynh mất luôn đường tra con mình.

begin;
select plan(13);
select test_support.seed_basic();

-- Lời nhắn của Minh (6A1, cơ sở Q7): cô Lan chủ nhiệm, cô Mai là tâm lý cụm Q7,
-- thầy Nam dạy bộ môn ở chính lớp 6A1, phụ huynh là tài khoản 90000000-…-0004.
insert into attendance.help_requests (student_id, requested_on, topic, urgency, note) values
  ('70000000-0000-0000-0000-000000000001', current_date, 'nha', 'today',
   'Chuyện ở nhà — em chỉ muốn kể cho cô chủ nhiệm');

-- Một dòng check-in để nhóm "không siết nhầm" có thứ để đối chiếu.
insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source) values
  ('70000000-0000-0000-0000-000000000001', current_date, 'in', 2, 'present', 'app');

-- ═══ CHIỀU CHO PHÉP ═══════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- học sinh Minh
select isnt_empty(
  $$ select 1 from attendance.help_requests
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'CHÍNH EM đọc lại được yêu cầu mình vừa gửi (is_me) — cũng là nhánh mà on-conflict-do-update của requestHelp cần');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1
select isnt_empty(
  $$ select 1 from attendance.help_requests
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN CỦA EM đọc được — đúng người mà màn hình hứa là sẽ đọc');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000003');  -- cô Mai, tâm lý cụm
select isnt_empty(
  $$ select 1 from attendance.help_requests
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'TÂM LÝ CỤM đọc được — trùng đúng phạm vi policy UPDATE help_requests_handle_care (0026)');
select test_support.logout();

-- ═══ CHIỀU TỪ CHỐI — đây là lỗi đang vá ═══════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh của Minh
select is_empty(
  $$ select 1 from attendance.help_requests $$,
  'PHỤ HUYNH đọc ra 0 dòng — trước 0037 con số này là 1, đo được trên hub_dev');
select is_empty(
  $$ select note from attendance.help_requests where note is not null $$,
  'PHỤ HUYNH không lấy được cột note — "bố mẹ không nhìn thấy" là câu in trên màn hình của em');
-- ... nhưng KHÔNG được siết nhầm: phụ huynh vẫn phải tra được chính con mình.
select isnt_empty(
  $$ select 1 from core.students where id = '70000000-0000-0000-0000-000000000001' $$,
  'PHỤ HUYNH VẪN tra được con mình — siết một bảng không được khoá cả đường của họ');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- thầy Nam, bộ môn 6A1
select is_empty(
  $$ select 1 from attendance.help_requests $$,
  'GIÁO VIÊN BỘ MÔN của chính lớp đó đọc ra 0 dòng ("thầy cô khác — không nhìn thấy")');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000006');  -- cô Hạnh, GVCN 6A2
select is_empty(
  $$ select 1 from attendance.help_requests $$,
  'GVCN LỚP KHÁC đọc ra 0 dòng');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000007');  -- Hùng: principal + admin
select is_empty(
  $$ select 1 from attendance.help_requests $$,
  'HIỆU TRƯỞNG/QUẢN TRỊ đọc ra 0 dòng — principal_of không còn là cửa vào lời nhắn của trẻ');
select test_support.logout();

-- ═══ KHÔNG SIẾT NHẦM ══════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan
select isnt_empty(
  $$ select 1 from attendance.checkins
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN VẪN đọc được check-in của lớp mình — 0037 chỉ chạm đúng một bảng');
select test_support.logout();

-- ═══ KHOÁ LUÔN HÌNH DẠNG CỦA POLICY ═══════════════════════════════════════
-- Ba câu cuối chặn kiểu hồi quy nguy hiểm nhất: ai đó "dọn dẹp" bằng cách đưa bảng
-- này về lại vòng lặp 16 bảng của 0009 cho gọn. Khi đó mọi assertion phía trên đã đỏ
-- rồi — nhưng ba câu này nói thẳng LÝ DO cho người đọc log, thay vì bắt họ đi lần
-- ngược từ "phụ huynh đọc ra 1 dòng" tới định nghĩa của core.can_see_student().
select ok(
  (select pg_get_expr(polqual, polrelid) not like '%can_see_student%'
     from pg_policy where polrelid = 'attendance.help_requests'::regclass
      and polname = 'help_requests_scope'),
  'Policy KHÔNG dùng core.can_see_student() — hàm đó gồm cả is_my_child và principal_of');
select ok(
  (select pg_get_expr(polqual, polrelid) like '%can_see_care%'
     from pg_policy where polrelid = 'attendance.help_requests'::regclass
      and polname = 'help_requests_scope'),
  'Policy đi qua core.can_see_care() — cùng phạm vi với policy UPDATE, đọc và ghi một kết luận');
select ok(
  (select pg_get_expr(polqual, polrelid) like '%is_me%'
     from pg_policy where polrelid = 'attendance.help_requests'::regclass
      and polname = 'help_requests_scope'),
  'Policy giữ nhánh core.is_me() — em phải xem lại được lời mình vừa gửi');

select * from finish();
rollback;
