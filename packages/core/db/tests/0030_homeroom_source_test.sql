-- pgTAP — core.class_assignments là nguồn sự thật GVCN (0030)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0030_homeroom_source_test.sql
--
-- 0023 khoá chiều "bản sao nói dối". File này khoá phần khó hơn: SAU KHI hai sổ lệch
-- nhau, hệ thống vẫn phải trả lời NHẤT QUÁN — vì trong đời thật lệch sẽ xảy ra
-- (khôi phục backup, sửa tay, migration cũ), và cái đắt không phải là lệch mà là hai
-- tầng trả lời khác nhau về cùng một câu hỏi.
--
-- Phép thử trung tâm, lặp lại ở nhiều assertion: xoá dòng core.user_role_scopes của
-- Cô Lan (bản sao) rồi hỏi lại cả hai tầng.
--   · tầng tRPC  (core.v_my_scopes → homeroomProcedure → care.getDashboard)
--   · tầng RLS   (core.is_homeroom_of → mọi policy care/health/checkin)
-- Trước 0030, tầng tRPC nói "không phải GVCN" còn tầng RLS nói "được đọc cả lớp".
-- Sau 0030, cả hai đọc chung một bảng nên không còn cách nào lệch.

begin;
select plan(12);
select test_support.seed_basic();

-- ── 1. Đường thẳng: fixture khớp, view phải trả đúng ───────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan
select is(
  (select class_code from core.v_my_homeroom_classes),
  '6A1',
  'core.v_my_homeroom_classes trả đúng lớp Cô Lan chủ nhiệm'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000002'); -- Thầy Nam (bộ môn)
select is_empty(
  $$ select * from core.v_my_homeroom_classes $$,
  'Giáo viên bộ môn KHÔNG có lớp chủ nhiệm — dạy một lớp không phải là chủ nhiệm lớp đó'
);
select test_support.logout();

select is_empty(
  $$ select * from core.v_my_homeroom_classes $$,
  'Chưa đăng nhập → view rỗng, không rò danh sách lớp'
);

-- ── 2. Sổ hai sổ khớp nhau thì sổ soi lệch phải rỗng ────────────────────────
select is(
  (select count(*)::int from ops.v_homeroom_drift),
  0,
  'ops.v_homeroom_drift rỗng trên dữ liệu chuẩn — sổ soi lệch không báo động giả'
);

-- ── 3. KIỂU HỎNG (a): mất bản sao, buồng lái vẫn phải mở đúng lớp ──────────
-- Đây là kịch bản trong tiêu chí nghiệm thu: "xoá thủ công dòng user_role_scopes
-- homeroom của Cô Lan rồi đăng nhập → buồng lái vẫn mở đúng 6A1".
delete from core.user_role_scopes
 where role_code = 'homeroom'
   and class_id = '30000000-0000-0000-0000-000000000001';

select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan
select is(
  (select class_id::text from core.v_my_scopes where role_code = 'homeroom'),
  '30000000-0000-0000-0000-000000000001',
  'Mất dòng user_role_scopes → core.v_my_scopes VẪN thấy 6A1 (suy từ core.class_assignments)'
);
select is(
  (select class_code from core.v_my_homeroom_classes),
  '6A1',
  'core.v_my_homeroom_classes cũng không phụ thuộc bản sao'
);
-- Hai tầng phải nói CÙNG một câu. Đây là assertion quan trọng nhất của cả file:
-- nó so trực tiếp câu trả lời của hàng rào tRPC với câu trả lời của hàng rào RLS.
select is(
  core.is_homeroom_of('70000000-0000-0000-0000-000000000001'),
  exists (select 1 from core.v_my_scopes
           where role_code = 'homeroom'
             and class_id = '30000000-0000-0000-0000-000000000001'),
  'Tầng RLS (is_homeroom_of) và tầng tRPC (v_my_scopes) trả lời giống nhau — hết cảnh "vào được phòng mà phòng trống"'
);
select test_support.logout();

-- ── 4. KIỂU HỎNG (c): học sinh thấy đúng tên người thật sự đọc được dữ liệu ─
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select is(
  (select full_name from core.v_my_homeroom_teacher),
  'Cô Lan',
  'Mất bản sao → học sinh VẪN thấy đúng tên GVCN (view đọc core.class_assignments)'
);
select test_support.logout();

-- ── 5. Lệch thì phải NHÌN THẤY, không được im lặng (Rev B/C điều 3) ─────────
-- Phân quyền lúc này đã đúng, nhưng bản sao thiếu vẫn làm claim OIDC (claims.ts:22)
-- trả thiếu `hub_classes`. Sổ soi lệch tồn tại để chỗ hỏng còn lại không vô hình.
select is(
  (select kind from ops.v_homeroom_drift),
  'thieu_ban_sao',
  'ops.v_homeroom_drift nêu đúng phần còn lệch (claim OIDC thiếu lớp) thay vì im lặng'
);

-- ── 6. Bản gốc đổi thì bản sao bị dọn theo ─────────────────────────────────
-- Chiều ngược lại của (b): gỡ phân công chủ nhiệm 6A2 mà quên xoá dòng vai trò của
-- Cô Hạnh. Không có trigger dọn rác thì dòng đó sống sót và tiếp tục chui vào claim
-- OIDC dưới dạng một lớp mà cô không còn chủ nhiệm.
delete from core.class_assignments
 where class_id = '30000000-0000-0000-0000-000000000002'
   and assignment_role = 'homeroom';

select is(
  (select count(*)::int from core.user_role_scopes
    where role_code = 'homeroom'
      and class_id = '30000000-0000-0000-0000-000000000002'),
  0,
  'Gỡ phân công chủ nhiệm → dòng core.user_role_scopes tương ứng bị trigger dọn theo'
);
select is(
  (select count(*)::int from ops.v_homeroom_drift where kind = 'thua_ban_sao'),
  0,
  'Không còn dòng vai trò "thừa" nào sau khi bản gốc bị gỡ'
);

select test_support.login_as('90000000-0000-0000-0000-000000000006'); -- Cô Hạnh
select is_empty(
  $$ select * from core.v_my_scopes where role_code = 'homeroom' $$,
  'Cô Hạnh không còn là GVCN ở CẢ HAI tầng — buồng lái đóng hẳn, không mở ra một lớp trống'
);
select test_support.logout();

select * from finish();
rollback;
