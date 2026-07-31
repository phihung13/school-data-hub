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
select plan(6);
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

-- ── Hàng 1 áp cho attendance: ma trận ghi `campus`, KHÔNG loại trừ cột mood ──
-- Ghi lại hành vi THẬT ở đây thay vì suy diễn: §5 là tường lửa cho BỘ SINH BÁO CÁO
-- học thuật (role `reporting`), không phải cho hiệu trưởng cơ sở — 02-database.md
-- nói rõ mood "phân quyền theo ma trận chung, y như mọi dữ liệu khác". Nếu Hội đồng
-- dữ liệu sau này quyết định che mood khỏi BGH thì đây là assertion đỏ đầu tiên,
-- và việc đổi luật phải đi qua ADR chứ không phải sửa lặng lẽ.
select isnt_empty(
  $$ select 1 from attendance.checkins
      where student_id = '70000000-0000-0000-0000-000000000001' and mood is not null $$,
  'Hiệu trưởng đọc được check-in (kèm mood) của cơ sở mình — đúng ô "attendance = campus"'
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
