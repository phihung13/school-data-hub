-- pgTAP — "TÂM TRẠNG": ai được thấy em này CẢM THẤY GÌ (0038)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0038_checkins_mood_scope_test.sql
--
-- Màn `/checkin` in chữ cho em đọc, ngay tại chỗ em bấm bốn ô cảm xúc:
--     "Chỉ thầy cô chủ nhiệm thấy"
-- DESIGN-GUIDELINES §9 ghi đúng câu đó. Trước 0038 câu đó KHÔNG đúng ở tầng dữ
-- liệu: `attendance.checkins` nằm trong vòng lặp 16 bảng của 0009:150-176 nên dùng
-- chung `core.can_see_student()` với danh sách lớp và bảng điểm — hàm gồm cả
-- `is_my_child` và `principal_of`. Đo được trên hub_dev: phiên phụ huynh đọc ra 7
-- dòng có mood, phiên hiệu trưởng 8 dòng.
--
-- Quyết định nghiệp vụ chủ đầu tư 31/07/2026: mood CHỈ GVCN và tâm lý cụm thấy;
-- phụ huynh và hiệu trưởng KHÔNG thấy mood từng ngày, nhưng phụ huynh VẪN thấy
-- điểm danh và báo cáo tổng hợp.
--
-- ── SỬA 01/08/2026 (ADR-026, migration 0044) ───────────────────────────────
-- Chủ đầu tư siết thêm một nấc: GVCN cũng KHÔNG còn đọc mood từng ngày. Phạm vi
-- `core.can_read_mood` nay là `is_me ∨ in_my_cluster` — chính em và tâm lý cụm.
-- Assertion đầu tiên của file này vì thế ĐÃ ĐỔI CHIỀU (xem chú thích tại chỗ);
-- phần còn lại của bài test không đổi một chữ, vì thứ nó canh — che CỘT chứ không
-- chặn DÒNG, phụ huynh giữ điểm danh và số tổng hợp — vẫn nguyên giá trị.
-- Chiều mới của GVCN được canh đầy đủ ở `0044_mood_chi_tam_ly_test.sql`.
--
-- Bốn nhóm assertion. Nhóm 2 là lý do bài test tồn tại; nhóm 3 là lý do nó không
-- được siết tay quá đà; nhóm 4 chặn kiểu hồi quy mà ba nhóm trên không thấy.
--   1. CHO PHÉP   — chính em, tâm lý cụm (GVCN đã rời nhóm này từ ADR-026).
--   2. TỪ CHỐI    — GVCN của em, phụ huynh, hiệu trưởng/quản trị, GV bộ môn,
--                   GVCN lớp khác.
--   3. KHÔNG SIẾT NHẦM — phụ huynh vẫn đọc được DÒNG điểm danh và số tổng hợp;
--      học sinh vẫn ghi được mood (đường check-in hằng ngày không gãy).
--   4. HÌNH DẠNG  — cột `mood` phải nằm ngoài grant, mọi cột khác phải nằm trong
--      (chống trôi khi ai đó thêm cột mới), và view phải đi qua đúng hàm phạm vi.

begin;
select plan(20);
select test_support.seed_basic();

-- Minh (6A1, cơ sở Q7): cô Lan chủ nhiệm, cô Mai tâm lý cụm Q7, thầy Nam dạy bộ
-- môn CHÍNH lớp 6A1, phụ huynh là 90000000-…-0004, Hùng là hiệu trưởng Q7 + admin.
-- mood = 1 ("Buồn") cố ý: nếu nó lọt ra ngoài phạm vi thì lọt đúng thứ đau nhất.
insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source) values
  ('70000000-0000-0000-0000-000000000001', current_date,     'in', 1, 'present', 'app'),
  ('70000000-0000-0000-0000-000000000001', current_date - 1, 'in', 4, 'present', 'app');

-- ═══ 1. CHIỀU CHO PHÉP ═════════════════════════════════════════════════════
-- ĐÃ ĐỔI CHIỀU 01/08/2026 — ADR-026, migration 0044.
-- Câu cũ ở đây là: "GVCN CỦA EM đọc được ĐÚNG GIÁ TRỊ mood — 'chỉ thầy cô chủ
-- nhiệm thấy' nghĩa là cô PHẢI thấy". Câu đó đúng với quyết định 31/07/2026 và
-- hết đúng với quyết định 01/08/2026: chủ đầu tư chốt cô chủ nhiệm không còn đọc
-- nhật ký cảm xúc từng ngày, chỉ còn nhận cờ "cần để ý" và tín hiệu "cần gặp
-- thầy cô". Không xoá assertion — LẬT nó, để chỗ này vẫn có người canh và để ai
-- đọc sau còn thấy hệ đã từng hứa điều gì. Lý do đầy đủ + đánh đổi: ADR-026.
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1
select is_empty(
  $$ select 1 from attendance.checkins_care
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN CỦA EM đọc attendance.checkins_care ra 0 DÒNG (ADR-026 lật assertion cũ) — 0 dòng chứ không phải lỗi, để màn hình cô hiện "không có" chứ không hiện "hỏng"');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000003');  -- cô Mai, tâm lý cụm
select isnt_empty(
  $$ select 1 from attendance.checkins_care
      where student_id = '70000000-0000-0000-0000-000000000001' and mood is not null $$,
  'TÂM LÝ CỤM đọc được mood — cùng phạm vi core.can_see_care() với cờ và hồ sơ chăm sóc');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, chính em
select is(
  (select count(*)::int from attendance.checkins_care where mood is not null),
  2,
  'CHÍNH EM đọc lại được tâm trạng mình đã ghi — màn /checkin hiện "Con đã ghi: …"');
select test_support.logout();

-- ═══ 2. CHIỀU TỪ CHỐI — đây là lỗi đang vá ═════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh của Minh
select throws_ok(
  $$ select mood from attendance.checkins $$,
  '42501',
  null,
  'PHỤ HUYNH đọc cột mood → Postgres TỪ CHỐI (42501). Trước 0038 câu này trả về 7 dòng trên hub_dev');
select is_empty(
  $$ select 1 from attendance.checkins_care $$,
  'PHỤ HUYNH đọc attendance.checkins_care ra 0 dòng — không có cửa vòng nào');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000007');  -- Hùng: principal Q7 + admin
select throws_ok(
  $$ select mood from attendance.checkins $$,
  '42501',
  null,
  'HIỆU TRƯỞNG/QUẢN TRỊ đọc cột mood → TỪ CHỐI (§9: BGH chỉ xem dữ liệu tổng hợp theo lô)');
select is_empty(
  $$ select 1 from attendance.checkins_care $$,
  'HIỆU TRƯỞNG đọc attendance.checkins_care ra 0 dòng');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- thầy Nam, bộ môn 6A1
select throws_ok(
  $$ select mood from attendance.checkins $$,
  '42501',
  null,
  'GIÁO VIÊN BỘ MÔN của CHÍNH lớp đó cũng bị từ chối — §9 nói "chỉ GVCN", không phải "thầy cô nào cũng được"');
select is_empty(
  $$ select 1 from attendance.checkins_care $$,
  'GIÁO VIÊN BỘ MÔN đọc checkins_care ra 0 dòng');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000006');  -- cô Hạnh, GVCN 6A2
select is_empty(
  $$ select 1 from attendance.checkins_care $$,
  -- Từ ADR-026 câu này không còn là câu về "chủ nhiệm của ai" nữa (mọi chủ nhiệm
  -- đều ra 0 dòng). Giữ nguyên assertion vì nó vẫn canh một thứ thật: view chủ-quyền
  -- không được rò dữ liệu qua một vai chỉ vì vai đó có mặt trong cùng cơ sở.
  'GVCN LỚP KHÁC đọc ra 0 dòng — sau ADR-026 mọi GVCN đều 0 dòng, câu này canh riêng việc view không rò theo cơ sở');
select test_support.logout();

-- ═══ 3. KHÔNG SIẾT NHẦM ════════════════════════════════════════════════════
-- Thiếu nhóm này thì một lần siết tay quá đà vẫn xanh, mà phụ huynh mất đường xem
-- con đi học có đủ không, và học sinh mất luôn nút check-in.
select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh
select is(
  (select count(*)::int from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001'),
  2,
  'PHỤ HUYNH VẪN đọc được DÒNG check-in của con — 0038 che CỘT, không chặn dòng');
select is(
  (select string_agg(distinct status, ',') from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001'),
  'present',
  'PHỤ HUYNH VẪN đọc được cột status — có mặt/vắng/muộn là thứ họ phải thấy');
select is(
  attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  1,
  'PHỤ HUYNH VẪN lấy được SỐ TỔNG HỢP "ngày Vui trong tuần" — Báo cáo Trưởng thành không mất mục Glow');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000006');  -- cô Hạnh, GVCN 6A2
select is(
  attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  null,
  'happy_days trả NULL (KHÔNG phải 0) cho người không được xem em này — "không được phép biết" khác "không có ngày vui nào"');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 3, 'present', 'app')
     on conflict (student_id, occurred_on, kind) do update set mood = 3 $$,
  'HỌC SINH vẫn ghi đè được mood trong ngày (§9 idempotent) — grant UPDATE(mood) của 0025 còn nguyên, đường check-in hằng ngày không gãy');
select test_support.logout();

-- ═══ 4. KHOÁ HÌNH DẠNG ═════════════════════════════════════════════════════
select is(
  has_column_privilege('authenticated', 'attendance.checkins', 'mood', 'select'),
  false,
  'Cột mood NẰM NGOÀI grant SELECT của authenticated — đây là chỗ duy nhất cưỡng chế lời hứa, không phải một dòng comment');

-- Chống trôi: 0025 đã dạy rằng grant theo cột là danh sách viết tay, và danh sách
-- viết tay thì lệch. Thêm một cột mới vào attendance.checkins mà quên grant thì cột
-- đó vô hình với cả hệ thống — hỏng kiểu im lặng. Câu này bắt đúng ca đó.
select is(
  (select count(*)::int
     from pg_attribute a
    where a.attrelid = 'attendance.checkins'::regclass
      and a.attnum > 0 and not a.attisdropped
      and a.attname <> 'mood'
      and not has_column_privilege('authenticated', 'attendance.checkins', a.attname, 'select')),
  0,
  'MỌI cột khác ngoài mood vẫn nằm trong grant SELECT — thêm cột mới mà quên grant thì câu này đỏ');

select ok(
  (select pg_get_viewdef('attendance.checkins_care'::regclass) like '%can_read_mood%'),
  'attendance.checkins_care đi qua core.can_read_mood() — view CHỦ-QUYỀN nên phạm vi dòng phải nằm trong chính nó');

select ok(
  (select prosrc not like '%can_see_student%' from pg_proc
    where oid = 'core.can_read_mood(uuid)'::regprocedure),
  'core.can_read_mood() KHÔNG gọi core.can_see_student() — dùng chung một hàm cho hai câu hỏi khác nhau là cách lỗi 0035/0037/0038 sinh ra ba lần');

select ok(
  not has_table_privilege('reporting', 'attendance.checkins_care', 'select'),
  'Role reporting KHÔNG có cửa nào vào checkins_care — §5 tường lửa báo cáo học thuật vẫn kín sau khi thêm view mới');

select * from finish();
rollback;
