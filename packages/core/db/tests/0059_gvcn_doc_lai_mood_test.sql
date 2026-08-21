-- pgTAP — ADR-035: GVCN đọc lại nhật ký cảm xúc — VÀ những gì KHÔNG mở theo (0059)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0059_gvcn_doc_lai_mood_test.sql
--
-- Chiều THUẬN (cô đọc được) đã canh ở 0038/0044 — hai file đó lật assertion tại
-- chỗ ngày 21/08/2026, có ghi chú. File này canh thứ mà một lần MỞ quyền hay làm
-- rơi nhất: các vai KHÔNG nằm trong quyết định nhưng đứng sát ranh giới.
--
--   1. RANH GIỚI LỚP  — GVCN lớp KHÁC vẫn 0 dòng, cả ba cửa.
--   2. RANH GIỚI VAI  — giáo viên bộ môn (dạy CHÍNH lớp đó) và quản trị/hiệu
--                       trưởng vẫn không đọc được gì.
--   3. PHỤ HUYNH      — không được mở theo (nhật ký từng ngày vẫn đóng, sàn 5
--                       ngày vẫn nổ), và không MẤT theo (số tổng hợp vẫn sống).
--   4. HÌNH DẠNG      — can_read_mood không lén mang is_my_child vào;
--                       happy_days giữ đủ hai nhánh nó phải có.
--
-- Vì sao nhóm 3 hai chiều: ADR-035 nói "phụ huynh không đổi". Không đổi nghĩa là
-- cả không-mở lẫn không-đóng — kiểm một chiều là canh nửa lời hứa.

begin;
select plan(12);
select test_support.seed_basic();

-- Phiếu đồng ý cho Minh (0047) rồi mới có mood để đọc — cùng khuôn 0044.
insert into core.consent_records (user_id, student_id, terms_version_id, decision, content_hash)
select '40000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001',
       tv.id, 'granted', tv.content_hash
  from core.terms_versions tv where tv.version = 1;

insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source) values
  ('70000000-0000-0000-0000-000000000001', current_date,     'in', 1, 'present', 'app'),
  ('70000000-0000-0000-0000-000000000001', current_date - 1, 'in', 1, 'present', 'app'),
  ('70000000-0000-0000-0000-000000000001', current_date - 2, 'in', 4, 'present', 'app');

insert into attendance.mood_trends (student_id, period_month, avg_mood, sample_count) values
  ('70000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date, 1.50, 12);

-- ═══ 0. MỘT CÂU CHIỀU THUẬN — để file tự đứng được một mình ═════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1
select is(
  (select count(*)::int from attendance.checkins_care
    where student_id = '70000000-0000-0000-0000-000000000001' and mood is not null),
  3,
  'GVCN CỦA EM đọc được mood (ADR-035) — chiều thuận, bản đầy đủ ở 0038/0044 đã lật');
select test_support.logout();

-- ═══ 1. RANH GIỚI LỚP — GVCN lớp khác: cả ba cửa vẫn đóng ══════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000006');  -- cô Hạnh, GVCN 6A2
select is_empty(
  $$ select 1 from attendance.checkins_care
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN LỚP KHÁC đọc em 6A1 ra 0 DÒNG — is_homeroom_of là "chủ nhiệm CỦA EM", không phải "mang chức chủ nhiệm"');

select is_empty(
  $$ select 1 from attendance.mood_trends
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN LỚP KHÁC không đọc được xu hướng mood của em 6A1 — cửa 2 đóng theo cùng hàm');

select is(
  attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  null,
  'GVCN LỚP KHÁC gọi happy_days cho em 6A1 nhận NULL — cửa 3 cũng phân biệt "của em" với "có chức"');
select test_support.logout();

-- ═══ 2. RANH GIỚI VAI — bộ môn và quản trị không hưởng gì từ ADR-035 ════════
select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- thầy Nam, bộ môn CHÍNH lớp 6A1
select is_empty(
  $$ select 1 from attendance.checkins_care
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GIÁO VIÊN BỘ MÔN của chính lớp đó vẫn 0 dòng — ADR-035 mở cho chủ nhiệm, không mở cho "thầy cô nào cũng được"');

select is(
  attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  null,
  'GIÁO VIÊN BỘ MÔN gọi happy_days vẫn NULL — cổng mới thêm đúng MỘT nhánh, không quay về can_see_student (6 nhánh)');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000007');  -- Hùng, quản trị + hiệu trưởng Q7
select is_empty(
  $$ select 1 from attendance.checkins_care where mood is not null $$,
  'QUẢN TRỊ/HIỆU TRƯỞNG vẫn 0 dòng mood — "ai được thấy em này" chưa bao giờ là "ai được thấy em này CẢM THẤY GÌ" (ADR-025, còn nguyên)');
select test_support.logout();

-- ═══ 3. PHỤ HUYNH — không mở theo, không mất theo ══════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh của Minh
select is_empty(
  $$ select 1 from attendance.checkins_care
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'PHỤ HUYNH vẫn 0 dòng ở checkins_care — ADR-035 không mở nhật ký từng ngày cho vai này');

select throws_ok(
  $$ select attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date, current_date) $$,
  '22023',
  null,
  'PHỤ HUYNH hỏi happy_days MỘT ngày → vẫn nổ 22023 — sàn 5 ngày sinh ra để che đúng vai này, ADR-035 không nới');

select is(
  attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  1,
  'PHỤ HUYNH vẫn lấy được SỐ TỔNG HỢP — "không đổi" nghĩa là cả hai chiều: Báo cáo Trưởng thành không mất mục Glow');
select test_support.logout();

-- ═══ 4. HÌNH DẠNG — hai hàm, đúng những nhánh đã quyết, không hơn ═══════════
select ok(
  (select prosrc not like '%is_my_child%' from pg_proc
    where oid = 'core.can_read_mood(uuid)'::regprocedure),
  'core.can_read_mood KHÔNG mang is_my_child — mở cho GVCN mà lén mở cho phụ huynh là vượt quyết định 21/08/2026');

select ok(
  (select prosrc like '%is_homeroom_of%' and prosrc like '%is_my_child%' from pg_proc
    where oid = 'attendance.happy_days(uuid, date, date)'::regprocedure),
  'attendance.happy_days giữ đủ CẢ HAI nhánh: is_homeroom_of (mới, ADR-035) và is_my_child (cũ — cắt nhầm là phụ huynh mất Báo cáo Trưởng thành)');

select * from finish();
rollback;
