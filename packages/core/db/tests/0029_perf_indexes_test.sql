-- pgTAP — bộ đệm ngữ cảnh phiên + 5 index đường nóng (0029)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0029_perf_indexes_test.sql
--
-- Tối ưu hiệu năng ở đúng lớp phân quyền là chỗ dễ mở cửa sau nhất trong cả hệ:
-- "nhớ sẵn ai đang đăng nhập" và "quên kiểm tài khoản còn hiệu lực không" chỉ cách
-- nhau một dòng. File này không đo tốc độ (đo bằng EXPLAIN — số liệu nằm ở đầu
-- migration) mà khoá bốn điều KHÔNG được phép sai:
--
--   1. Có đệm hay không có đệm đều ra CÙNG một câu trả lời.
--   2. Tài khoản status='disabled' vẫn bị chặn ngay cả khi vừa dựng đệm cho chính
--      nó (ADR-016 "khoá là cắt"). Đây là nhóm assertion quan trọng nhất file.
--   3. Đổi danh tính giữa transaction không dùng lại uid của người trước.
--   4. Đệm bịa đặt là vô hiệu: chỉ tin khi auth_uid trong đệm khớp claim đang mang.

begin;
select plan(18);
select test_support.seed_basic();

-- ── 1. Ba hàm mang đúng thuộc tính quyền ────────────────────────────────────
select has_function('core', 'begin_user_context', array['uuid'],
  'core.begin_user_context(uuid) tồn tại');

select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core' and p.proname = 'begin_user_context'),
  true,
  'begin_user_context là SECURITY DEFINER — phần tra core.users + kiểm status nằm trong database, ứng dụng không tự giải'
);

select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core' and p.proname = 'resolve_user_id_uncached'),
  true,
  'resolve_user_id_uncached là SECURITY DEFINER — core.users có RLS users_self gọi lại chính current_user_id(), đọc bằng quyền người gọi sẽ đệ quy'
);

-- ── 2. Đường CŨ (chỉ có claim.sub, không có đệm) vẫn đúng ───────────────────
-- Đây là đường mà toàn bộ pgTAP hiện có đang đi (test_support.login_as). Nhánh
-- fallback hỏng thì cả bộ test phân quyền hỏng theo mà không ai biết vì sao.
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select is(
  core.current_user_id(),
  '40000000-0000-0000-0000-000000000005'::uuid,
  'Không có đệm: current_user_id() vẫn tra bảng ra đúng người (đường của pgTAP và psql tay)'
);
select test_support.logout();

-- ── 3. Đường MỚI: begin_user_context dựng đệm, cho cùng câu trả lời ─────────
select is(
  core.begin_user_context('90000000-0000-0000-0000-000000000005'),
  '40000000-0000-0000-0000-000000000005'::uuid,
  'begin_user_context trả đúng core.users.id của Minh'
);

select is(
  core.current_user_id(),
  '40000000-0000-0000-0000-000000000005'::uuid,
  'Có đệm: current_user_id() ra CÙNG kết quả với đường tra bảng'
);

select is(
  current_setting('request.jwt.claim.sub', true),
  '90000000-0000-0000-0000-000000000005',
  'begin_user_context đặt luôn claim.sub — core.current_auth_uid() và mọi policy cũ không phải đổi gì'
);

-- ── 4. Đổi danh tính giữa transaction: KHÔNG được dùng lại uid người trước ──
-- Ca thật: pgTAP gọi login_as(A) rồi login_as(B) trong cùng một bài. Nếu đệm chỉ
-- ghi user_id mà không ghi kèm auth_uid, B sẽ chạy bằng quyền của A.
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan
select is(
  core.current_user_id(),
  '40000000-0000-0000-0000-000000000001'::uuid,
  'Đổi claim.sub sang người khác: đệm cũ bị bỏ qua, ra đúng người mới'
);
select test_support.logout();

-- ── 5. Đệm bịa đặt không có giá trị ─────────────────────────────────────────
-- Giả sử một đoạn code (hoặc kẻ có đường chạy SQL) đặt user_id của quản trị nhưng
-- mang claim của học sinh: cặp không khớp ⇒ rơi về tra bảng, không nâng được quyền.
select set_config('request.hub.user_id', '40000000-0000-0000-0000-000000000007', true);
select set_config('request.hub.auth_uid', '90000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000005', true);
select is(
  core.current_user_id(),
  '40000000-0000-0000-0000-000000000005'::uuid,
  'Đệm không khớp claim thì vô hiệu — đặt GUC tay không tự nâng quyền được'
);
select test_support.logout();

-- ── 6. ADR-016 "khoá là cắt" ────────────────────────────────────────────────
update core.users set status = 'disabled'
 where auth_uid = '90000000-0000-0000-0000-000000000005';

select is(
  core.begin_user_context('90000000-0000-0000-0000-000000000005'),
  null::uuid,
  'Tài khoản đã khoá: begin_user_context trả NULL, không dựng được đệm'
);

select is(
  core.current_user_id(),
  null::uuid,
  'Tài khoản đã khoá: current_user_id() vẫn NULL NGAY CẢ khi vừa gọi begin_user_context cho chính nó'
);

-- Hệ quả phải thấy được ở tầng dữ liệu, không chỉ ở giá trị trả về.
insert into attendance.checkins (student_id, occurred_on, mood)
     values ('70000000-0000-0000-0000-000000000001', current_date, 3);

select test_support.login_as('90000000-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from attendance.checkins),
  0,
  'Tài khoản đã khoá đọc check-in của chính mình ra 0 dòng — RLS vẫn đóng đúng'
);
select test_support.logout();

update core.users set status = 'active'
 where auth_uid = '90000000-0000-0000-0000-000000000005';

-- Đệm sống trong PHẠM VI TRANSACTION: đổi status ở giữa transaction không làm đệm
-- tự cập nhật. Trong ứng dụng, mỗi request tRPC là một transaction riêng và mở đầu
-- bằng đúng lời gọi dưới đây, nên "mở khoá" (và "khoá") có hiệu lực từ request kế
-- tiếp — đúng nghĩa vận hành của ADR-016. Test mô phỏng lại request kế tiếp đó.
select core.begin_user_context('90000000-0000-0000-0000-000000000005');
select test_support.login_as('90000000-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from attendance.checkins),
  1,
  'Request KẾ TIẾP sau khi mở khoá thì đọc được — chứng minh assertion trên chặn vì status, không phải vì test tự làm hỏng dữ liệu'
);
select test_support.logout();

-- ── 7. Năm index đường nóng có thật ─────────────────────────────────────────
select has_index('core', 'enrollments', 'enrollments_current_class_idx',
  'core.enrollments (student_id, class_id) where valid_to is null — cho core.teaches/is_homeroom_of');

select has_index('core', 'user_role_scopes', 'user_role_scopes_class_role_idx',
  'core.user_role_scopes (class_id, role_code) — cho core.v_my_homeroom_teacher (65 → 14 buffer)');

select has_index('ops', 'job_runs', 'job_runs_success_finished_idx',
  'ops.job_runs (finished_at desc) where status=success — cho "Quét đêm qua HH:mm" (734 → 3 buffer)');

select has_index('care', 'care_cases', 'care_cases_student_idx',
  'care.care_cases (student_id) — hai index cũ đều partial where status=open nên câu không mang vị từ đó phải quét cả bảng');

select has_index('care', 'interventions', 'interventions_recent_idx',
  'care.interventions (occurred_at desc) — cho recentActions (cùng index trên: 11.680 → 1.511 buffer)');

select * from finish();
rollback;
