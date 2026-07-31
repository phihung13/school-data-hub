-- pgTAP — phạm vi vai `principal` (và `admin`) trong ma trận RLS — trả nợ DEBT #16
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0023_principal_scope_test.sql
--
-- DEBT #16: ma trận 02-database.md có 7 cột vai, pgTAP mới phủ 5 (student, guardian,
-- teacher, homeroom, counselor). Hai cột còn lại chưa test được vì fixture không có
-- tài khoản nào mang vai đó — đã bổ sung ở 000_test_support.sql (Hùng, vai `admin`
-- + `principal`, phạm vi cơ sở Q7) và một học sinh ở CƠ SỞ KHÁC (Cường, Q2) để phép
-- kiểm "campus" có chiều từ chối thật.
--
-- Hàng của ma trận mà file này khoá lại:
--   core/tutor/evidence/attendance : campus     → thấy em cơ sở mình, KHÔNG thấy cơ sở khác
--   care.flags + interventions     : count-only → không tra cứu tự do được dòng nào
--   care.counselor_notes           : —
--   health.logs                    : —
--
-- Vì Hùng mang cả vai `admin` mà vai này không xuất hiện trong bất kỳ policy nào
-- (0009), mọi assertion "KHÔNG đọc được" dưới đây đồng thời chứng minh `admin`
-- không phải một cửa sau lặng lẽ.

begin;
select plan(8);
select test_support.seed_basic();

-- Dữ liệu để soi: Minh ở cơ sở Q7 (cùng cơ sở với hiệu trưởng), Cường ở Q2.
insert into attendance.checkins (student_id, occurred_on, mood, status) values
  ('70000000-0000-0000-0000-000000000001', current_date, 2, 'present'),
  ('70000000-0000-0000-0000-000000000003', current_date, 1, 'present');

insert into care.flags (student_id, rule_code, as_of_date)
     values ('70000000-0000-0000-0000-000000000001', 'E_MOOD', current_date);

insert into care.care_cases (id, student_id, owner_id, tier) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001', 2);

insert into care.counselor_notes (case_id, author_id, body) values
  ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
   'Nội dung tư vấn — hiệu trưởng không đọc tự do, chỉ qua màn hình care team có audit');

insert into health.logs (student_id, logged_on, category, detail, recorded_by) values
  ('70000000-0000-0000-0000-000000000001', current_date, 'ban_tru', '{}',
   '40000000-0000-0000-0000-000000000001');

select test_support.login_as('90000000-0000-0000-0000-000000000007'); -- Hùng: principal Q7 + admin

-- ── Hàng 1: campus — chiều cho phép ─────────────────────────────────────────
select isnt_empty(
  $$ select 1 from core.students where id = '70000000-0000-0000-0000-000000000001' $$,
  'Hiệu trưởng thấy học sinh CƠ SỞ MÌNH (Minh, Q7)'
);

-- ── Hàng 1: campus — chiều từ chối, phần quan trọng hơn ─────────────────────
select is_empty(
  $$ select 1 from core.students where id = '70000000-0000-0000-0000-000000000003' $$,
  'Hiệu trưởng KHÔNG thấy học sinh cơ sở khác (Cường, Q2) — "campus" không phải "toàn hệ"'
);

-- ── Hàng 1 áp cho attendance: campus CÓ, nhưng cột `mood` thì KHÔNG ────────────
-- LẬT CHIỀU 01/08/2026 (ADR-025, migration 0038). Bản cũ của file này khẳng định
-- "Hiệu trưởng đọc được check-in KÈM mood", và tự nói trước: nếu sau này che mood
-- khỏi BGH thì "đây là assertion đỏ đầu tiên, và việc đổi luật phải đi qua ADR chứ
-- không phải sửa lặng lẽ". Đúng chuyện đó đã xảy ra — nên lật kèm ADR, không xoá.
--
-- Vì sao lật: màn /checkin in cho trẻ câu "Chỉ thầy cô chủ nhiệm và thầy cô tâm lý
-- thấy". Câu đó là một lời hứa với trẻ em, không phải nhãn trang trí; nếu hiệu trưởng
-- vẫn đọc được thì lời hứa sai, và cái sai nằm ở chỗ đứa trẻ không bao giờ kiểm được.
-- 0038 giữ nguyên phạm vi DÒNG (BGH vẫn thấy đủ điểm danh cơ sở mình) và chỉ rút
-- quyền CỘT mood — nên hai assertion dưới đây phải đi thành cặp: một cho phần còn
-- thấy, một cho phần bị che. Chỉ giữ vế "bị che" thì lần sau ai đó siết quá tay,
-- khoá luôn cả điểm danh, test này vẫn xanh.
select isnt_empty(
  $$ select 1 from attendance.checkins
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'Hiệu trưởng vẫn đọc được DÒNG check-in của cơ sở mình — 0038 không đụng phạm vi dòng'
);
select throws_ok(
  $$ select 1 from attendance.checkins
      where student_id = '70000000-0000-0000-0000-000000000001' and mood is not null $$,
  '42501',
  null,
  'Hiệu trưởng KHÔNG đọc được cột mood — quyền cột bị rút ở 0038, Postgres từ chối thẳng'
);
-- Và đường đọc hợp lệ (view `checkins_care`) trả 0 dòng chứ không nổ: BGH mở màn
-- Điều hành thì thấy trống, không thấy lỗi 500. "Không có quyền" và "hỏng" là hai
-- thứ khác nhau, người dùng phải phân biệt được.
select is_empty(
  $$ select 1 from attendance.checkins_care $$,
  'Hiệu trưởng qua view checkins_care ra 0 dòng — bị che, không phải bị vỡ'
);

-- ── Hàng care: không tra cứu tự do ──────────────────────────────────────────
select is_empty(
  $$ select 1 from care.counselor_notes $$,
  'Hiệu trưởng KHÔNG đọc được ghi chú tư vấn (ma trận: "—")'
);
select is_empty(
  $$ select 1 from care.flags $$,
  'Hiệu trưởng KHÔNG đọc được từng cờ (ma trận: count-only, xem qua màn hình có audit)'
);

-- ── Hàng y tế: chặt nhất ────────────────────────────────────────────────────
select is_empty(
  $$ select 1 from health.logs $$,
  'Hiệu trưởng KHÔNG đọc được nhật ký y tế (ADR-009, ma trận: "—")'
);

select test_support.logout();

select * from finish();
rollback;
