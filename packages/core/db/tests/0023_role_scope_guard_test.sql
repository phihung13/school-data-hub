-- pgTAP — hàng rào chống lệch trên core.user_role_scopes (0023)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0023_role_scope_guard_test.sql
--
-- File này khoá NỬA ĐẦU của việc chốt một nguồn sự thật GVCN: bảng vai trò không
-- được phép nói điều mà core.class_assignments không công nhận. Nửa sau (mọi người
-- đọc chuyển sang đúng nguồn) nằm ở 0030_homeroom_source_test.sql.
--
-- Ba assertion "chiều từ chối" dưới đây tương ứng ba kiểu hỏng thật đã mô tả ở đầu
-- migration 0023 — mỗi cái đều tái hiện được bằng tay trước khi có file này:
--   (b) dòng vai trò không có phân công  → GVCN mở buồng lái thấy lớp TRỐNG RỖNG
--   (c) hai dòng vai trò cùng một lớp    → tên GVCN hiện ra không xác định
--   (+) dòng vai trò không có lớp        → "chủ nhiệm mọi lớp"

begin;
select plan(9);
select test_support.seed_basic();

-- ── Chiều cho phép: hàng rào không được cản dữ liệu ĐÚNG ───────────────────
-- Gỡ dòng của fixture rồi cấp lại y hệt — đúng thao tác của người quản trị khi sửa
-- một dòng vai trò. Assertion này đỏ thì hàng rào đang chặn cả việc cấp vai cho GVCN
-- mới, tức là hỏng nặng hơn cả cái nó định vá.
delete from core.user_role_scopes
 where role_code = 'homeroom'
   and class_id = '30000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ insert into core.user_role_scopes (user_id, role_code, school_id, class_id)
     values ('40000000-0000-0000-0000-000000000001', 'homeroom',
             '20000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001') $$,
  'Có phân công chủ nhiệm thật ở core.class_assignments → cấp vai homeroom chạy bình thường'
);

-- ── Chiều từ chối (c): một lớp một GVCN, ở CẢ HAI sổ ────────────────────────
-- Khoá cũ `user_role_scopes_uq` unique theo (user_id, role_code, school_id, class_id,
-- cluster) — chỉ cần khác `cluster` là chèn thêm được một dòng homeroom nữa cho CÙNG
-- một lớp. Hậu quả không nằm ở bảng mà ở màn hình: checkin.ts:228, profile.ts:43
-- `limit 1` không ORDER BY và dev-provider.ts:103 `(array_agg(...))[1]` sẽ trả một
-- trong hai dòng KHÔNG XÁC ĐỊNH — hôm nay đúng, sau một lần VACUUM thì sai.
select throws_ok(
  $$ insert into core.user_role_scopes (user_id, role_code, school_id, class_id, cluster)
     values ('40000000-0000-0000-0000-000000000001', 'homeroom',
             '20000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', 'cum-nam') $$,
  '23505', null,
  'Dòng homeroom thứ hai cho cùng một class_id → unique index chặn (kiểu hỏng c)'
);

select has_index('core', 'user_role_scopes', 'user_role_scopes_one_homeroom_idx',
  'user_role_scopes_one_homeroom_idx tồn tại — bản sao của class_assignments_one_homeroom_idx (0003)');

-- ── Chiều từ chối (b): bản sao KHÔNG được đi trước bản gốc ──────────────────
-- Thầy Nam chỉ dạy bộ môn ở 6A1 (fixture 0003). Trước 0023, dòng dưới đây chèn
-- được, và hậu quả không phải là "thầy đọc trộm được dữ liệu" — RLS vẫn chặn — mà
-- là thầy mở buồng lái 6A1 và thấy MỘT LỚP TRỐNG RỖNG, rồi kết luận cả lớp chưa
-- check-in. Đó là kiểu hỏng khó thấy nhất: hệ thống không báo lỗi gì cả.
select throws_ok(
  $$ insert into core.user_role_scopes (user_id, role_code, school_id, class_id)
     values ('40000000-0000-0000-0000-000000000002', 'homeroom',
             '20000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'Cấp vai GVCN cho người KHÔNG có phân công chủ nhiệm → bị từ chối (kiểu hỏng b)'
);

-- Cùng một luật phải áp cho UPDATE, không chỉ INSERT: sửa class_id của một dòng
-- homeroom hợp lệ sang lớp khác là đúng cái lỗ vừa bịt, đi bằng cửa sau.
select throws_ok(
  $$ update core.user_role_scopes
        set class_id = '30000000-0000-0000-0000-000000000002'
      where role_code = 'homeroom'
        and user_id = '40000000-0000-0000-0000-000000000001' $$,
  '23503', null,
  'Đổi class_id của dòng homeroom sang lớp mình không chủ nhiệm → bị từ chối (UPDATE cũng bị gác)'
);

-- ── Chiều từ chối (+): "GVCN" không lớp = "chủ nhiệm mọi lớp" ───────────────
-- comment ở 0003:90 nói rõ: dòng không có phạm vi nào = vai trò TOÀN HỆ. Một dòng
-- homeroom mang class_id NULL vì thế là quả mìn hẹn giờ cho lần refactor sau.
select throws_ok(
  $$ insert into core.user_role_scopes (user_id, role_code)
     values ('40000000-0000-0000-0000-000000000001', 'homeroom') $$,
  '23514', null,
  'Vai homeroom không kèm class_id → bị từ chối, không có "chủ nhiệm mọi lớp"'
);

-- CHECK constraint phải TỒN TẠI THẬT chứ không chỉ có trigger: khôi phục backup
-- chạy với session_replication_role = replica, trigger im lặng, chỉ CHECK còn gác.
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'core.user_role_scopes'::regclass
      and conname  = 'user_role_scopes_homeroom_class_chk'),
  1,
  'CHECK user_role_scopes_homeroom_class_chk tồn tại — hàng rào còn hiệu lực cả khi trigger bị tắt'
);

-- ── Vai KHÔNG gắn lớp phải đi qua hàng rào mà không bị xây xát ──────────────
-- Hàng rào chỉ được biết đúng một từ: 'homeroom'. Nếu nó chặn nhầm counselor hay
-- guardian thì 0013 (redeem_parent_invite_code) gãy và phụ huynh không đăng nhập được.
select lives_ok(
  $$ insert into core.user_role_scopes (user_id, role_code, school_id)
     values ('40000000-0000-0000-0000-000000000002', 'counselor',
             '20000000-0000-0000-0000-000000000002') $$,
  'Vai counselor (không gắn lớp) không bị hàng rào homeroom cản'
);
select lives_ok(
  $$ insert into core.user_role_scopes (user_id, role_code)
     values ('40000000-0000-0000-0000-000000000003', 'guardian') $$,
  'Vai guardian không phạm vi vẫn chèn được — 0013 phát mã mời phụ huynh không gãy'
);

select * from finish();
rollback;
