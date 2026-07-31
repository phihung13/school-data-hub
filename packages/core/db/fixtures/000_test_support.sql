-- 000_test_support.sql
-- Dữ liệu mẫu dùng chung cho pgTAP. Nạp SAU migrations, TRƯỚC khi chạy test.
-- Mỗi bài test gọi test_support.seed_basic() trong transaction rồi rollback,
-- nên các bài không giẫm lên nhau.

create schema if not exists test_support;

-- ---------------------------------------------------------------------------
-- Bộ nhỏ: 2 cơ sở · 2 lớp · 2 GVCN · 1 GV bộ môn · 1 tâm lý cụm · 1 phụ huynh
--         · 1 tài khoản quản trị kiêm hiệu trưởng cơ sở · 3 học sinh
-- Dùng UUID cố định để bài test viết được điều kiện rõ ràng.
-- ---------------------------------------------------------------------------
create or replace function test_support.seed_basic()
returns void
language plpgsql
as $$
begin
  insert into core.school_networks (id, code, name)
       values ('10000000-0000-0000-0000-000000000001', 'VA', 'Hệ thống Trường Việt Anh');

  insert into core.schools (id, network_id, code, name) values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'VA-Q7', 'Cơ sở Quận 7'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'VA-Q2', 'Cơ sở Quận 2');

  insert into core.classes (id, school_id, code, academic_year, grade) values
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '6A1', '2026-2027', 6),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '6A2', '2026-2027', 6);

  -- Người dùng
  insert into core.users (id, auth_uid, email, full_name, status) values
    ('40000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'gvcn@va.edu.vn',      'Cô Lan (GVCN 6A1)',    'active'),
    ('40000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'gvbomon@va.edu.vn',   'Thầy Nam (bộ môn 6A1)','active'),
    ('40000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 'tamly@va.edu.vn',     'Cô Mai (tâm lý cụm)',  'active'),
    ('40000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', 'ph@va.edu.vn',        'Phụ huynh của Minh',   'active'),
    ('40000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000005', 'minh@va.edu.vn',      'Học sinh Minh',        'active'),
    ('40000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000006', 'gvcn2@va.edu.vn',     'Cô Hạnh (GVCN 6A2)',   'active'),
    -- DEBT #16: ma trận RLS mới phủ 5 vai (student/guardian/teacher/homeroom/counselor).
    -- Thiếu tài khoản mang vai `principal` và `admin` là lý do KỸ THUẬT khiến hai ô cuối
    -- của ma trận (02-database.md) chưa test được — thêm ở đây để 0023 trả nợ.
    ('40000000-0000-0000-0000-000000000007', '90000000-0000-0000-0000-000000000007', 'admin.hung@va.edu.vn','Hùng (Quản trị)',      'active');

  insert into core.teachers (id, user_id, employee_code, school_id) values
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'GV001', '20000000-0000-0000-0000-000000000001'),
    ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'GV002', '20000000-0000-0000-0000-000000000001'),
    ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000006', 'GV003', '20000000-0000-0000-0000-000000000001');

  insert into core.parents (id, user_id)
       values ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004');

  -- Học sinh: Minh (6A1) và Bình (6A2) — dùng để test "không thấy lớp người khác".
  -- Cường ở CƠ SỞ KHÁC (Q2): trước đây cả hai em đều ở Q7 nên không có cách nào chứng
  -- minh phạm vi theo cơ sở (`principal` = campus) thật sự đóng. Cố tình KHÔNG ghi danh
  -- vào lớp nào: phạm vi hiệu trưởng tính theo students.school_id, không qua lớp — để
  -- đúng như vậy thì em này cũng không lọt vào bất kỳ phép đếm theo lớp nào của bài cũ.
  insert into core.students (id, student_code, user_id, school_id, full_name) values
    ('70000000-0000-0000-0000-000000000001', 'VA-2026-00417', '40000000-0000-0000-0000-000000000005',
     '20000000-0000-0000-0000-000000000001', 'Nguyễn Văn Minh'),
    ('70000000-0000-0000-0000-000000000002', 'VA-2026-00418', null,
     '20000000-0000-0000-0000-000000000001', 'Trần Thị Bình'),
    ('70000000-0000-0000-0000-000000000003', 'VA-2026-00419', null,
     '20000000-0000-0000-0000-000000000002', 'Lê Văn Cường');

  insert into core.parent_students (parent_id, student_id)
       values ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001');

  insert into core.enrollments (student_id, class_id, valid_from) values
    ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-09-05'),
    ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '2026-09-05');

  insert into core.class_assignments (teacher_id, class_id, assignment_role, subject) values
    ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'homeroom', null),
    ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'subject',  'Toán'),
    ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'homeroom', null);

  -- Vai trò kèm phạm vi
  insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values
    ('40000000-0000-0000-0000-000000000001', 'homeroom',  '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
    ('40000000-0000-0000-0000-000000000002', 'teacher',   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
    ('40000000-0000-0000-0000-000000000003', 'counselor', '20000000-0000-0000-0000-000000000001', null),
    ('40000000-0000-0000-0000-000000000004', 'guardian',  null, null),
    ('40000000-0000-0000-0000-000000000005', 'student',   null, null),
    ('40000000-0000-0000-0000-000000000006', 'homeroom',  '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
    -- Hai vai cuối của ma trận, cùng một người và cùng phạm vi cơ sở Q7.
    -- `admin` hiện KHÔNG xuất hiện trong bất kỳ policy nào (0009) — gộp chung một tài
    -- khoản là có chủ ý: mọi assertion "hiệu trưởng KHÔNG đọc được X" ở 0023 vì thế
    -- đồng thời chứng minh vai `admin` cũng không lặng lẽ mở cửa sau.
    ('40000000-0000-0000-0000-000000000007', 'admin',     '20000000-0000-0000-0000-000000000001', null),
    ('40000000-0000-0000-0000-000000000007', 'principal', '20000000-0000-0000-0000-000000000001', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Đóng vai một người dùng cụ thể để kiểm RLS.
-- Đặt claim đúng cách Supabase đặt, rồi hạ quyền xuống `authenticated`.
-- ---------------------------------------------------------------------------
create or replace function test_support.login_as(p_auth_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth_uid::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function test_support.logout()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Gọi promote() mà KHÔNG để exception thổi bay cả bài test.
--
-- pgTAP chạy trọn một file trong MỘT transaction: một lệnh raise là mọi assertion
-- phía sau chết theo và output không còn đọc được. core.promote_embedded_event()
-- hiện vẫn ném khi payload xấu (thiếu logged_on -> 23502) vì chưa có block
-- EXCEPTION — đúng thứ §8 cấm, và là thứ migration 0028 (gói embed-connector)
-- sẽ sửa. Block exception ở đây tạo subtransaction riêng nên phần ghi hỏng bị
-- rollback gọn, bài test đi tiếp và so sánh được bằng giá trị trả về.
-- ---------------------------------------------------------------------------
create or replace function test_support.try_promote(p_raw_id bigint)
returns text
language plpgsql
as $$
begin
  return core.promote_embedded_event(p_raw_id);
exception when others then
  return 'raised:' || sqlstate;
end;
$$;

-- Cho phép bài test (chạy bằng vai authenticated) gọi được hàm hạ quyền.
grant usage on schema test_support to public;
