-- pgTAP — vai đọc cho Metabase (0066 + 0067, ADR-039)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0066_vai_doc_cho_metabase_test.sql
--
-- Vai này là cửa RỘNG NHẤT trong toàn hệ — chủ đầu tư chọn thế, có ghi trong ADR-039.
-- Chính vì rộng nên nó cần bài canh: một cửa rộng có chủ ý và một cửa rộng do trôi dần
-- trông y hệt nhau khi nhìn `\du`.
--
-- Bốn nhóm:
--   1. VAI CÓ THẬT và ĐÚNG HÌNH DẠNG — NOLOGIN, và KHÔNG mang BYPASSRLS (0067: thuộc
--      tính vai không kế thừa qua membership, nên đặt ở đây là một lời hứa sai).
--   2. ĐỌC ĐƯỢC thứ nó phải đọc.
--   3. KHÔNG GHI được gì — Metabase là công cụ đọc.
--   4. KHÔNG chạm `staging` — hàng đợi kỹ thuật, không phải dữ liệu phân tích.

begin;
select plan(11);

-- ═══ 1. HÌNH DẠNG VAI ══════════════════════════════════════════════════════
select is(
  (select count(*)::int from pg_roles where rolname = 'metabase_doc_rong'),
  1,
  'Vai metabase_doc_rong tồn tại (0066)');

select is(
  (select rolcanlogin from pg_roles where rolname = 'metabase_doc_rong'),
  false,
  'Vai NHÓM, không đăng nhập được — mật khẩu không bao giờ nằm trong migration (§8), người vận hành tạo vai đăng nhập riêng');

select is(
  (select rolbypassrls from pg_roles where rolname = 'metabase_doc_rong'),
  false,
  'Vai nhóm KHÔNG mang BYPASSRLS (0067) — thuộc tính vai không kế thừa qua membership, nên đặt ở đây là một cờ vô dụng mà `\du` vẫn in ra: đúng loại "trạng thái hợp lệ trên giấy". Đo 21/08/2026: cấp nhóm → 0 dòng, vai đăng nhập tự mang cờ → 538 dòng');

select is(
  (select rolsuper from pg_roles where rolname = 'metabase_doc_rong'),
  false,
  'Và KHÔNG phải superuser — cửa rộng có chủ ý vẫn phải có đáy');

-- ═══ 2. ĐỌC ĐƯỢC THỨ NÓ PHẢI ĐỌC ═══════════════════════════════════════════
select ok(
  has_table_privilege('metabase_doc_rong', 'attendance.checkins', 'SELECT'),
  'Đọc được attendance.checkins — đây chính là cửa mà ADR-039 mở có chủ ý');

select ok(
  has_table_privilege('metabase_doc_rong', 'care.care_cases', 'SELECT'),
  'Đọc được care.care_cases — nói thẳng: hồ sơ chăm sóc nằm trong tầm đọc của tài khoản Metabase');

select ok(
  has_table_privilege('metabase_doc_rong', 'evidence.diem_thi_dua', 'SELECT'),
  'Đọc được sổ điểm thi đua — dashboard thi đua là một trong những thứ Metabase sinh ra để làm');

-- Bảng SINH SAU cũng phải tự có quyền: thiếu default privileges thì mỗi migration mới
-- đẻ ra một bảng Metabase không đọc được, và người vận hành sẽ vá bằng một câu grant gõ
-- tay lúc 11 giờ đêm — thường rộng hơn hẳn câu cần thiết.
create table ops.bang_sinh_sau_de_do (id int);
select ok(
  has_table_privilege('metabase_doc_rong', 'ops.bang_sinh_sau_de_do', 'SELECT'),
  'Bảng TẠO SAU cũng tự có quyền đọc — alter default privileges có thật, không chỉ ghi trong chú thích');

-- ═══ 3. KHÔNG GHI ══════════════════════════════════════════════════════════
select ok(
  not has_table_privilege('metabase_doc_rong', 'attendance.checkins', 'INSERT'),
  'KHÔNG ghi được: một vai phân tích có quyền ghi là một cú update gõ nhầm trong ô truy vấn tự do');

select ok(
  not has_table_privilege('metabase_doc_rong', 'care.care_cases', 'UPDATE'),
  'KHÔNG sửa được hồ sơ chăm sóc');

-- ═══ 4. KHÔNG CHẠM staging ═════════════════════════════════════════════════
select ok(
  not has_schema_privilege('metabase_doc_rong', 'staging', 'USAGE'),
  'KHÔNG chạm schema staging — bản ghi thô của connector là hàng đợi kỹ thuật, và nó chứa payload nguyên văn từ app ngoài');

select * from finish();
rollback;
