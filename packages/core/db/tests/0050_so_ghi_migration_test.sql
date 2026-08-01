-- pgTAP — 0050: sổ ghi migration đã chạy (DEBT #23)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0050_so_ghi_migration_test.sql
--
-- Bảng này KHÔNG chở dữ liệu học sinh, nên bài test của nó không kiểm phân quyền
-- theo vai — nó kiểm thứ khác, và thứ đó cũng quan trọng không kém: SỔ PHẢI KHÔNG
-- NÓI DỐI ĐƯỢC. Một sổ ghi sai còn tệ hơn không có sổ, vì người trực sẽ TIN nó.
--
-- Bốn nhóm:
--   1. HÌNH DẠNG   — khoá, kiểu, index. Nền của mọi câu còn lại.
--   2. KHÔNG NÓI DỐI ĐƯỢC — ba ràng buộc CHECK, mỗi cái chặn một kiểu dòng sai:
--        · version không phải bốn chữ số ⇒ thứ tự áp thành thứ tự chuỗi ngẫu nhiên;
--        · checksum không phải sha256 hex ⇒ cột phát hiện lệch nội dung thành vô nghĩa;
--        · dòng NHẬN NỢ mà mang duration_ms ⇒ nó giả vờ đã chạy, và mất luôn sự
--          phân biệt giữa "tôi đã chạy cái này" với "tôi tin cái này đã có sẵn".
--      Nhóm này là lý do bảng có CHECK chứ không chỉ có chú thích.
--   3. QUYỀN       — sổ vận hành không rò ra tài khoản người dùng.
--   4. KHÔNG KHAI NHỊP — `migrate` cố ý KHÔNG có trong ops.job_schedule. Migration
--      không có nhịp; khai vào đó là để ops.v_job_health (0041) báo "quá hạn" mỗi
--      ngày không ai áp gì, và một báo động giả mỗi ngày là cách nhanh nhất giết
--      một bảng cảnh báo.

begin;
select plan(14);

-- ═══ 1. HÌNH DẠNG ═══════════════════════════════════════════════════════════
select has_table('ops', 'schema_migrations', 'ops.schema_migrations tồn tại — sổ ghi migration (DEBT #23)');

select col_is_pk('ops', 'schema_migrations', 'version',
  'version là khoá chính — hai file cùng số nghĩa là một trong hai VĨNH VIỄN không được áp; khoá chính biến ca đó thành lỗi ồn ào');

select has_index('ops', 'schema_migrations', 'schema_migrations_applied_idx',
  'có index theo applied_at — "database đang ở đâu, ai áp lúc nào" là câu hỏi của người trực lúc 2 giờ sáng');

select col_not_null('ops', 'schema_migrations', 'checksum',
  'checksum NOT NULL — một dòng sổ không có băm là một dòng không kiểm chứng được gì');

-- ═══ 2. KHÔNG NÓI DỐI ĐƯỢC ═════════════════════════════════════════════════
select throws_ok(
  $$ insert into ops.schema_migrations (version, filename, checksum, duration_ms)
     values ('latest', 'x.sql', repeat('a', 64), 1) $$,
  '23514',
  null,
  'version phải là BỐN CHỮ SỐ — chặn ca một công cụ khác nhét khoá kiểu latest/2026-08-02 vào rồi thứ tự áp thành thứ tự chuỗi ngẫu nhiên');

select throws_ok(
  $$ insert into ops.schema_migrations (version, filename, checksum, duration_ms)
     values ('0099', 'x.sql', '0050_so_ghi_migration.sql', 1) $$,
  '23514',
  null,
  'checksum phải là sha256 hex 64 ký tự — bắt ca ghi nhầm TÊN FILE vào ô băm, lúc đó cột phát hiện lệch nội dung thành vô nghĩa mà vẫn trông đầy đủ');

-- Đây là ràng buộc quan trọng nhất của bảng. Xem chú thích "NHẬN NỢ BAN ĐẦU" ở 0050.
select throws_ok(
  $$ insert into ops.schema_migrations (version, filename, checksum, duration_ms, nhan_no)
     values ('0099', 'x.sql', repeat('a', 64), 12, true) $$,
  '23514',
  null,
  'dòng NHẬN NỢ không được mang duration_ms — nhận nợ nghĩa là CHƯA TỪNG CHẠY, có thời gian chạy là tự mâu thuẫn và biến sổ thành thứ không phân biệt được "đã chạy" với "tin là đã có"');

select throws_ok(
  $$ insert into ops.schema_migrations (version, filename, checksum, nhan_no)
     values ('0099', 'x.sql', repeat('a', 64), false) $$,
  '23514',
  null,
  'dòng CHẠY THẬT bắt buộc có duration_ms — thiếu nó thì một dòng chạy thật trông y hệt một dòng nhận nợ');

select lives_ok(
  $$ insert into ops.schema_migrations (version, filename, checksum, nhan_no, ghi_chu)
     values ('0099', 'x.sql', repeat('a', 64), true, 'nhận nợ ban đầu') $$,
  'dòng NHẬN NỢ hợp lệ (nhan_no = true, duration_ms NULL) được nhận — đây là hình dạng của 49 dòng đầu trên hub_dev');

select lives_ok(
  $$ insert into ops.schema_migrations (version, filename, checksum, duration_ms, nhan_no)
     values ('0098', 'y.sql', repeat('b', 64), 42, false) $$,
  'dòng CHẠY THẬT hợp lệ (nhan_no = false, có duration_ms) được nhận');

select throws_ok(
  $$ insert into ops.schema_migrations (version, filename, checksum, nhan_no)
     values ('0099', 'x_doi_ten.sql', repeat('c', 64), true) $$,
  '23505',
  null,
  'áp lại cùng một version bị khoá chính chặn — đây là hàng rào CUỐI của "TỪ CHỐI ÁP LẠI FILE ĐÃ ÁP"; hàng rào đầu là bộ chạy tự bỏ qua, nhưng hàng rào ở tầng dữ liệu mới là thứ không lách được bằng một script khác');

-- ═══ 3. QUYỀN ═══════════════════════════════════════════════════════════════
select ok(
  not has_table_privilege('authenticated', 'ops.schema_migrations', 'select'),
  'authenticated KHÔNG đọc được sổ — schema ops không nằm trong câu grant của 0009, và không được "cấp cho đủ bộ"');

select ok(
  has_table_privilege('backup_reader', 'ops.schema_migrations', 'select'),
  'backup_reader ĐỌC được sổ — ADR-006: một bản khôi phục không mang theo sổ ghi là một database không ai biết đang ở migration số mấy, đúng tình cảnh 0050 sinh ra để chấm dứt');

-- ═══ 4. KHÔNG KHAI NHỊP ═════════════════════════════════════════════════════
select is_empty(
  $$ select 1 from ops.job_schedule where job_name = 'migrate' $$,
  'job_name "migrate" KHÔNG có trong ops.job_schedule — migration không có nhịp; khai vào đó là để ops.v_job_health báo "quá hạn" mỗi ngày không ai áp gì, và một báo động giả mỗi ngày giết cả bảng cảnh báo');

select * from finish();
rollback;
