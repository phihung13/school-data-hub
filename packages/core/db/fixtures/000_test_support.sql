-- 000_test_support.sql
-- Dữ liệu mẫu dùng chung cho pgTAP. Nạp SAU migrations, TRƯỚC khi chạy test.
-- Mỗi bài test gọi test_support.seed_basic() trong transaction rồi rollback,
-- nên các bài không giẫm lên nhau.
--
-- Bốn lớp dữ liệu, chồng lên nhau, gọi thêm lớp nào thì có lớp đó:
--   seed_basic()       2 lớp khối 6 · đủ 7 vai của ma trận phân quyền
--   seed_khoi()      + cả khối 6 (5 lớp, 12 em/lớp, một cô chủ nhiệm hai lớp)
--   seed_khoi_7_8()  + khối 7 và khối 8 trên hai cơ sở, một GV bộ môn dạy chéo khối
--   seed_khoi_activity()  + điểm danh và cảm xúc 5 ngày gần nhất cho những gì đã có
--
-- SONG SINH với packages/core/db/seed/seed.mjs — file đó gieo ĐÚNG cùng bộ dữ liệu này
-- (cùng UUID, cùng mã lớp, cùng mã học sinh) vào hub_dev cho lớp test TypeScript. Sửa
-- một bên mà quên bên kia là mở lại một lỗ kiểm chứng: bài pgTAP và bài TypeScript sẽ
-- chạy trên hai thế giới khác nhau mà cả hai cùng báo xanh.

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
    ('40000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'gvbomon@va.edu.vn',   'Thầy Nam (bộ môn Toán)','active'),
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
-- Bộ CẢ KHỐI: khối 6 cơ sở Q7 — 5 lớp · 4 GVCN (một cô chủ nhiệm HAI lớp)
--             · 2 giáo viên bộ môn có phân công THẬT · 12 học sinh mỗi lớp (xem chú thích v_ten về ngưỡng ẩn danh 10).
--
-- VÌ SAO PHẢI CÓ, VÀ VÌ SAO LÀ HÀM RIÊNG chứ không nhét vào seed_basic():
--
-- (1) Vì sao phải có. Cho tới hôm nay cả kho fixture dựng đúng MỘT lớp cho mỗi giáo
--     viên và đúng MỘT giáo viên bộ môn dạy đúng MỘT lớp. Trong thế giới đó, phần lớn
--     câu hỏi của một khối thật không đặt ra được:
--       · "buồng lái mở lớp nào" vô nghĩa khi cô chỉ có một lớp;
--       · "giáo viên bộ môn KHÔNG thấy học sinh lớp mình không dạy" là XANH GIẢ nếu
--         thầy không dạy lớp nào — 0 dòng vì mẫu số rỗng, không phải vì policy chặn.
--         Đo được trên hub_dev 31/07/2026: core.class_assignments chỉ có 2 dòng, cả
--         hai đều là homeroom, không một dòng `subject` nào. Bộ này khoá lỗ đó bằng
--         cách cho mỗi giáo viên bộ môn dạy NHIỀU lớp nhưng KHÔNG dạy hết khối: mọi
--         khẳng định phủ định từ nay đều có mẫu số khác 0.
--
-- (2) Vì sao là hàm riêng. 36 file pgTAP đang chốt số đếm tuyệt đối trên seed_basic()
--     ("đúng 1 dòng", "rỗng", "count = 0"). Bơm thêm 38 học sinh vào seed_basic() sẽ
--     làm chúng đỏ — và sửa chúng theo là làm hỏng đúng thứ chúng sinh ra để giữ. Bộ
--     lớn vì thế là một LỚP CHỒNG THÊM: bài nào cần cả khối thì gọi thêm hàm này, bài
--     cũ không gọi thì thế giới của nó không đổi một dòng nào.
--
-- Cô Lan (GVCN 6A1) CỐ Ý giữ nguyên đúng một lớp: 0030_homeroom_source_test.sql và
-- tests/db/gvcn-screens.test.ts đọc `core.v_my_homeroom_classes` của cô bằng truy vấn
-- vô hướng (một dòng). Người chủ nhiệm hai lớp trong bộ này là Cô Vân (6A3 + 6A4).
--
-- Idempotent (§9): mọi INSERT đều `on conflict do nothing`, gọi hai lần không sinh
-- dòng đôi — cùng tính chất mà packages/core/db/seed/seed.mjs phải giữ.
--
-- SONG SINH: packages/core/db/seed/seed.mjs gieo ĐÚNG bộ này (cùng UUID, cùng mã lớp,
-- cùng mã học sinh) cho hub_dev. Sửa một bên phải sửa bên kia, nếu không thì bài pgTAP
-- và bài TypeScript lại chạy trên hai thế giới khác nhau — đúng chỗ đã lệch trước 31/07.
-- ---------------------------------------------------------------------------
create or replace function test_support.seed_khoi()
returns void
language plpgsql
as $$
declare
  v_q7 constant uuid := '20000000-0000-0000-0000-000000000001';
  -- Họ theo lớp + tên theo số thứ tự: cho ra 60 cái tên phân biệt được bằng mắt khi
  -- soi CSDL, và tên KHÔNG chứa dấu ngoặc (0022 cắt hậu tố "(...)" của người lớn).
  --
  -- Sĩ số 8 → 12 (01/08/2026). Không phải để "nhiều dữ liệu hơn": `report.min_cohort()`
  -- (`0040`) là 10, nên với 8 em MỌI lớp đều dưới ngưỡng ẩn danh và màn Điều hành của
  -- BGH hiện "—" ở tất cả các ô. Bộ demo mà mọi ô đều bị che thì không demo được gì,
  -- và tệ hơn: nó khiến "che vì nhóm quá nhỏ" trông y hệt "màn hình hỏng". 12 em là
  -- con số nhỏ nhất còn giữ được cả hai phía — trên ngưỡng đủ để thấy số thật, mà lớp
  -- test dựng riêng ở tests/db/bgh-tong-hop.test.ts vẫn là nơi kiểm chiều BỊ CHE.
  v_ho  constant text[] := array['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng'];
  v_ten constant text[] := array['Minh An', 'Gia Bảo', 'Ngọc Chi', 'Tiến Dũng',
                                 'Hương Giang', 'Thu Hà', 'Đăng Khôi', 'Khánh Linh',
                                 'Hải My', 'Bảo Nam', 'Anh Phương', 'Diễm Quỳnh'];
  c int;
  n int;
  v_class uuid;
  v_student uuid;
begin
  -- Gọi được độc lập: bài test chỉ cần cả khối không phải nhớ gọi hai hàm đúng thứ tự.
  if not exists (select 1 from core.schools where id = v_q7) then
    perform test_support.seed_basic();
  end if;

  -- ── Ba lớp mới của khối 6 (6A1, 6A2 đã có ở seed_basic) ───────────────────
  insert into core.classes (id, school_id, code, academic_year, grade) values
    ('30000000-0000-0000-0000-000000000003', v_q7, '6A3', '2026-2027', 6),
    ('30000000-0000-0000-0000-000000000004', v_q7, '6A4', '2026-2027', 6),
    ('30000000-0000-0000-0000-000000000005', v_q7, '6A5', '2026-2027', 6)
  on conflict do nothing;

  -- ── Ba người lớn mới: 2 GVCN + 1 giáo viên bộ môn thứ hai ─────────────────
  insert into core.users (id, auth_uid, email, full_name, status) values
    ('40000000-0000-0000-0000-000000000008', '90000000-0000-0000-0000-000000000008',
     'gvcn3@va.edu.vn',    'Cô Vân (GVCN 6A3 và 6A4)',   'active'),
    ('40000000-0000-0000-0000-000000000009', '90000000-0000-0000-0000-000000000009',
     'gvcn4@va.edu.vn',    'Thầy Kiên (GVCN 6A5)',       'active'),
    ('40000000-0000-0000-0000-00000000000a', '90000000-0000-0000-0000-00000000000a',
     'gvbomon2@va.edu.vn', 'Cô Diệp (bộ môn Ngữ văn)',  'active')
  on conflict do nothing;

  insert into core.teachers (id, user_id, employee_code, school_id) values
    ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000008', 'GV004', v_q7),
    ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000009', 'GV005', v_q7),
    ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-00000000000a', 'GV006', v_q7)
  on conflict do nothing;

  -- ── Phân công (NGUỒN SỰ THẬT của quan hệ GVCN ↔ lớp — 0030) ───────────────
  -- Chủ nhiệm: Cô Vân nhận HAI lớp. Đây là điểm cả bộ sinh ra để có.
  insert into core.class_assignments (teacher_id, class_id, assignment_role, subject) values
    ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', 'homeroom', null),
    ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', 'homeroom', null),
    ('50000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005', 'homeroom', null)
  on conflict do nothing;

  -- Bộ môn: mỗi thầy cô dạy VÀI lớp nhưng KHÔNG dạy hết khối. Chỗ trống là cố ý —
  -- nó là mẫu số của mọi câu "giáo viên bộ môn không thấy em ở lớp mình không dạy":
  --   · Thầy Nam (Toán):    6A1, 6A2, 6A3   → không dạy 6A4, 6A5
  --   · Cô Diệp (Ngữ văn): 6A3, 6A4, 6A5   → không dạy 6A1, 6A2
  -- (dòng Toán 6A1 của Thầy Nam đã nằm trong seed_basic).
  insert into core.class_assignments (teacher_id, class_id, assignment_role, subject) values
    ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'subject', 'Toán'),
    ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'subject', 'Toán'),
    ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000003', 'subject', 'Ngữ văn'),
    ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000004', 'subject', 'Ngữ văn'),
    ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000005', 'subject', 'Ngữ văn')
  on conflict do nothing;

  -- ── Bản sao vai trò (sổ B). PHẢI đi SAU class_assignments: trigger
  -- core.guard_homeroom_scope (0023) từ chối dòng homeroom chưa có phân công gốc.
  -- Đủ cả 3 dòng homeroom thì ops.v_homeroom_drift vẫn rỗng — sổ soi lệch không báo
  -- động giả, đúng điều 0030_homeroom_source_test.sql khẳng định.
  insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values
    ('40000000-0000-0000-0000-000000000008', 'homeroom', v_q7, '30000000-0000-0000-0000-000000000003'),
    ('40000000-0000-0000-0000-000000000008', 'homeroom', v_q7, '30000000-0000-0000-0000-000000000004'),
    ('40000000-0000-0000-0000-000000000009', 'homeroom', v_q7, '30000000-0000-0000-0000-000000000005'),
    ('40000000-0000-0000-0000-000000000002', 'teacher',  v_q7, '30000000-0000-0000-0000-000000000002'),
    ('40000000-0000-0000-0000-000000000002', 'teacher',  v_q7, '30000000-0000-0000-0000-000000000003'),
    ('40000000-0000-0000-0000-00000000000a', 'teacher',  v_q7, '30000000-0000-0000-0000-000000000003'),
    ('40000000-0000-0000-0000-00000000000a', 'teacher',  v_q7, '30000000-0000-0000-0000-000000000004'),
    ('40000000-0000-0000-0000-00000000000a', 'teacher',  v_q7, '30000000-0000-0000-0000-000000000005')
  on conflict do nothing;

  -- ── 12 học sinh mỗi lớp ────────────────────────────────────────────────────
  -- UUID suy ra được từ (lớp, số thứ tự): 70000000-…-000000001<c><nn>, mã học sinh
  -- VA-2026-1<c><nnn>. Bài test viết thẳng được id của "em thứ 3 lớp 6A4" mà không
  -- phải tra bảng. 6A1/6A2 bắt đầu từ số 2 vì Minh và Bình đã giữ chỗ số 1.
  for c in 1..5 loop
    v_class := ('30000000-0000-0000-0000-00000000000' || c::text)::uuid;
    for n in (case when c <= 2 then 2 else 1 end)..12 loop
      v_student := ('70000000-0000-0000-0000-000000001' || c::text || lpad(n::text, 2, '0'))::uuid;

      insert into core.students (id, student_code, school_id, full_name)
      values (v_student, 'VA-2026-1' || c::text || lpad(n::text, 3, '0'), v_q7,
              v_ho[c] || ' ' || v_ten[n])
      on conflict do nothing;

      insert into core.enrollments (student_id, class_id, valid_from)
      values (v_student, v_class, '2026-09-05')
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bộ KHỐI 7 + KHỐI 8: bốn lớp trên HAI cơ sở · 4 GVCN mới · 1 giáo viên bộ môn
--                     dạy CHÉO KHỐI · 12 học sinh mỗi lớp.
--
-- VÌ SAO PHẢI CÓ. Cho tới 01/08/2026 cả kho fixture chỉ dựng khối 6 — đo trên hub_dev:
-- `select grade, count(*) from core.classes` trả đúng một dòng `6|5`. Trong thế giới
-- một-khối, mọi khẳng định dạng "GVCN khối 7 KHÔNG thấy học sinh khối 6" đều xanh, và
-- xanh vì MẪU SỐ RỖNG: không có khối khác để mà thấy. Đây đúng loại xanh giả mà chú
-- thích của seed_khoi() ở trên đã cảnh báo cho giáo viên bộ môn, chỉ là ở mức KHỐI.
--
-- BỐ CỤC CÓ CHỦ Ý — từng mẩu đều là mẫu số của một câu hỏi cụ thể:
--   · 7A1, 7A2, 8A1 ở Quận 7; 8B1 ở Quận 2. Cặp 8A1/8B1 CÙNG KHỐI khác cơ sở là chỗ
--     duy nhất phân biệt được "cụm của tâm lý tính theo CƠ SỞ" với "tính theo khối":
--     trước khi có nó, hai giả thuyết cho ra cùng một đáp số trên mọi dữ liệu demo.
--   · Thầy Sơn (Tiếng Anh) dạy 6A5 và 7A1 — hai KHỐI khác nhau, nhưng chỉ 2 trong 9
--     lớp. Dạy một khối thì "chéo khối" là chữ suông; dạy hết thì câu "thầy không thấy
--     em ở lớp mình không dạy" lại rỗng mẫu số.
--   · Cô Yến chủ nhiệm 8A1 — khối 8, khối mà Thầy Sơn KHÔNG dạy. Nhờ vậy phép giao
--     "lớp của GVCN này ∩ lớp thầy dạy" bằng rỗng một cách THẬT, còn với Cô Thu (7A1)
--     thì khác rỗng. Hai chiều đều đo được.
--
-- VÌ SAO LÀ HÀM RIÊNG, không nhét vào seed_khoi(): cùng lý do seed_khoi() không nhét
-- vào seed_basic() — hàng chục file pgTAP đang chốt số đếm tuyệt đối trên thế giới cũ.
-- Bài nào cần nhiều khối thì gọi thêm hàm này; bài không gọi thì thế giới của nó không
-- đổi một dòng nào.
--
-- Idempotent (§9): mọi INSERT đều `on conflict do nothing`. Riêng core.enrollments phải
-- dùng dạng KHÔNG CÓ ĐÍCH: bảng đó không có ràng buộc duy nhất thường mà có EXCLUDE
-- chống chồng kỳ (enrollments_no_overlap), và Postgres không cho ON CONFLICT bám vào
-- một ràng buộc EXCLUDE — viết `on conflict (student_id, class_id)` ở đây là NÉM LỖI
-- chứ không phải im lặng bỏ qua.
--
-- SONG SINH: packages/core/db/seed/seed.mjs gieo ĐÚNG bộ này (cùng UUID, cùng mã lớp,
-- cùng mã học sinh) cho hub_dev. Sửa một bên mà quên bên kia là mở lại đúng lỗ kiểm
-- chứng mà cả hai file này sinh ra để bịt.
-- ---------------------------------------------------------------------------
create or replace function test_support.seed_khoi_7_8()
returns void
language plpgsql
as $$
declare
  v_q7 constant uuid := '20000000-0000-0000-0000-000000000001';
  v_q2 constant uuid := '20000000-0000-0000-0000-000000000002';
  -- (khối, số thứ tự lớp trong khối) đi thẳng vào UUID lớp và UUID học sinh:
  --   lớp     30000000-…-000000000<khối>0<lớp>      (7A1 → …000000000701)
  --   học sinh 70000000-…-00000000<khối><lớp><số>   (7A1 em 3 → …000000007103)
  --   mã HS    VA-2026-<khối><lớp><3 số>            (7A1 em 3 → VA-2026-71003)
  -- Khuôn mã HS phải khớp CHECK `^VA-\d{4}-\d{5}$` trên core.students.student_code —
  -- đúng 5 chữ số. Khối 6 giữ khuôn cũ `1<lớp><3 số>` nên hai bộ không đụng nhau.
  v_khoi constant int[]  := array[7, 7, 8, 8];
  v_lop  constant int[]  := array[1, 2, 1, 2];
  v_ma   constant text[] := array['7A1', '7A2', '8A1', '8B1'];
  v_ho   constant text[] := array['Vũ', 'Đặng', 'Bùi', 'Đỗ'];
  -- 8B1 ở Quận 2 — xem phần "BỐ CỤC CÓ CHỦ Ý" ở trên.
  v_truong constant uuid[] := array[v_q7, v_q7, v_q7, v_q2];
  v_ten constant text[] := array['Minh An', 'Gia Bảo', 'Ngọc Chi', 'Tiến Dũng',
                                 'Hương Giang', 'Thu Hà', 'Đăng Khôi', 'Khánh Linh',
                                 'Hải My', 'Bảo Nam', 'Anh Phương', 'Diễm Quỳnh'];
  k int;
  n int;
  v_class uuid;
  v_student uuid;
begin
  -- Gọi được độc lập: bài test chỉ cần nhiều khối không phải nhớ gọi ba hàm đúng thứ tự.
  -- Điều kiện là 6A5 — lớp mà Thầy Sơn dạy — chứ không phải cơ sở Q7: thiếu 6A5 thì
  -- phân công chéo khối bên dưới sẽ vi phạm khoá ngoại, và bài test nhận một lỗi
  -- 23503 khó hiểu thay vì một thế giới đầy đủ.
  if not exists (select 1 from core.classes where id = '30000000-0000-0000-0000-000000000005') then
    perform test_support.seed_khoi();
  end if;

  for k in 1..4 loop
    insert into core.classes (id, school_id, code, academic_year, grade)
    values (('30000000-0000-0000-0000-000000000' || v_khoi[k]::text || '0' || v_lop[k]::text)::uuid,
            v_truong[k], v_ma[k], '2026-2027', v_khoi[k])
    on conflict do nothing;
  end loop;

  -- ── Năm người lớn mới ─────────────────────────────────────────────────────
  insert into core.users (id, auth_uid, email, full_name, status) values
    ('40000000-0000-0000-0000-00000000000b', '90000000-0000-0000-0000-00000000000b',
     'gvcn5@va.edu.vn',    'Cô Thu (GVCN 7A1)',                 'active'),
    ('40000000-0000-0000-0000-00000000000c', '90000000-0000-0000-0000-00000000000c',
     'gvcn6@va.edu.vn',    'Thầy Phúc (GVCN 7A2)',              'active'),
    ('40000000-0000-0000-0000-00000000000d', '90000000-0000-0000-0000-00000000000d',
     'gvcn7@va.edu.vn',    'Cô Yến (GVCN 8A1)',                 'active'),
    ('40000000-0000-0000-0000-00000000000e', '90000000-0000-0000-0000-00000000000e',
     'gvcn8@va.edu.vn',    'Thầy Lộc (GVCN 8B1, cơ sở Quận 2)', 'active'),
    ('40000000-0000-0000-0000-00000000000f', '90000000-0000-0000-0000-00000000000f',
     'gvbomon3@va.edu.vn', 'Thầy Sơn (bộ môn Tiếng Anh)',       'active')
  on conflict do nothing;

  -- Thầy Lộc thuộc biên chế CƠ SỞ QUẬN 2. Không phải chi tiết trang trí: để thầy ở Q7
  -- thì "giáo viên cơ sở khác" và "giáo viên cùng cơ sở" là một người, và mọi khẳng
  -- định về biên cơ sở đo trên thầy đều không nói lên điều gì.
  insert into core.teachers (id, user_id, employee_code, school_id) values
    ('50000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-00000000000b', 'GV007', v_q7),
    ('50000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-00000000000c', 'GV008', v_q7),
    ('50000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-00000000000d', 'GV009', v_q7),
    ('50000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000e', 'GV010', v_q2),
    ('50000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-00000000000f', 'GV011', v_q7)
  on conflict do nothing;

  -- ── Phân công (NGUỒN SỰ THẬT của quan hệ GVCN ↔ lớp — 0030) ───────────────
  insert into core.class_assignments (teacher_id, class_id, assignment_role, subject) values
    ('50000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000701', 'homeroom', null),
    ('50000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000702', 'homeroom', null),
    ('50000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000801', 'homeroom', null),
    ('50000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000802', 'homeroom', null),
    -- Chéo khối: 6A5 (khối 6) + 7A1 (khối 7). Khối 8 CỐ Ý bỏ trống.
    ('50000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000005', 'subject', 'Tiếng Anh'),
    ('50000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000701', 'subject', 'Tiếng Anh')
  on conflict do nothing;

  -- ── Bản sao vai trò (sổ B). PHẢI đi SAU class_assignments: trigger
  -- core.guard_homeroom_scope (0023) từ chối dòng homeroom chưa có phân công gốc.
  -- Thầy Lộc mang school_id = Q2 vì lớp của thầy ở Q2; ghi Q7 vào đây là tự tay mở một
  -- cửa mà bản gốc không hề mở, và ops.v_homeroom_drift sẽ không bắt được vì nó soi lớp.
  insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values
    ('40000000-0000-0000-0000-00000000000b', 'homeroom', v_q7, '30000000-0000-0000-0000-000000000701'),
    ('40000000-0000-0000-0000-00000000000c', 'homeroom', v_q7, '30000000-0000-0000-0000-000000000702'),
    ('40000000-0000-0000-0000-00000000000d', 'homeroom', v_q7, '30000000-0000-0000-0000-000000000801'),
    ('40000000-0000-0000-0000-00000000000e', 'homeroom', v_q2, '30000000-0000-0000-0000-000000000802'),
    ('40000000-0000-0000-0000-00000000000f', 'teacher',  v_q7, '30000000-0000-0000-0000-000000000005'),
    ('40000000-0000-0000-0000-00000000000f', 'teacher',  v_q7, '30000000-0000-0000-0000-000000000701')
  on conflict do nothing;

  -- ── 12 học sinh mỗi lớp ───────────────────────────────────────────────────
  -- Cùng con số PER_CLASS với khối 6 và vì cùng lý do: dưới report.min_cohort() (= 10)
  -- thì màn Điều hành che sạch mọi ô của khối mới, và "che vì nhóm quá nhỏ" trông y hệt
  -- "màn hình hỏng".
  for k in 1..4 loop
    v_class := ('30000000-0000-0000-0000-000000000' || v_khoi[k]::text || '0' || v_lop[k]::text)::uuid;
    for n in 1..12 loop
      v_student := ('70000000-0000-0000-0000-00000000' || v_khoi[k]::text || v_lop[k]::text
                    || lpad(n::text, 2, '0'))::uuid;

      insert into core.students (id, student_code, school_id, full_name)
      values (v_student,
              'VA-2026-' || v_khoi[k]::text || v_lop[k]::text || lpad(n::text, 3, '0'),
              v_truong[k], v_ho[k] || ' ' || v_ten[n])
      on conflict do nothing;

      insert into core.enrollments (student_id, class_id, valid_from)
      values (v_student, v_class, '2026-09-05')
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lớp HOẠT ĐỘNG của bộ cả khối — check-in, cảm xúc, "cần gặp thầy cô".
--
-- Tách khỏi seed_khoi() vì nó phụ thuộc current_date. seed_khoi() cố ý không phụ
-- thuộc thời gian để bài pgTAP nào gọi cũng cho cùng một thế giới; ai cần dữ liệu
-- "hôm nay" thì gọi thêm hàm này và tự chịu ràng buộc ngày tháng.
--
-- Gieo 5 ngày gần nhất. Em số 7 của 6A3/6A4/6A5 mang chuỗi cảm xúc xấu liên tiếp —
-- đủ để bộ quét dựng cờ. CỐ Ý không đặt em nào như vậy ở 6A1/6A2: hai lớp đó là sân
-- của loạt bài test hiện có, thêm cờ vào đó là đổi kết quả của bài không liên quan.
--
-- Khối 7/8 (01/08/2026): CHỈ điểm danh đủ và tâm trạng LÀNH — không một em nào mang
-- chuỗi cảm xúc xấu, không một lượt "cần gặp thầy cô". Lý do là kỹ thuật chứ không
-- phải lười: A_ATTENDANCE chỉ dựng cờ cho em CÓ điểm danh mà tỉ lệ dưới min_rate,
-- E_MOOD cần chuỗi ngày mood xấu — cho khối mới một em "xấu" là thêm cờ vào mọi phép
-- đếm cờ tuyệt đối đang xanh, và đỏ vì dữ liệu demo đổi là loại đỏ dạy người ta bỏ qua
-- màu đỏ. Sân để dựng cờ vẫn là khối 6 và các lớp mà từng bài test tự dựng riêng.
-- Phần khối 7/8 tự bỏ qua nếu lớp chưa tồn tại, nên bài nào chỉ gọi seed_khoi() thì
-- thế giới của nó không đổi một dòng nào.
-- ---------------------------------------------------------------------------
create or replace function test_support.seed_khoi_activity()
returns void
language plpgsql
as $$
declare
  c int;
  n int;
  d int;
  k int;
  v_khoi constant int[] := array[7, 7, 8, 8];
  v_lop  constant int[] := array[1, 2, 1, 2];
  v_student uuid;
  v_mood smallint;
begin
  for c in 1..5 loop
    for n in (case when c <= 2 then 2 else 1 end)..12 loop
      v_student := ('70000000-0000-0000-0000-000000001' || c::text || lpad(n::text, 2, '0'))::uuid;
      if not exists (select 1 from core.students where id = v_student) then
        continue;
      end if;

      for d in 0..4 loop
        v_mood := case
          when c >= 3 and n = 7 then 1 + (d % 2)          -- Buồn / Mệt liên tiếp
          when n % 3 = 0 then 3                            -- Bình thường
          else 4                                           -- Vui
        end;
        insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
        values (v_student, current_date - d, 'in', v_mood, 'present', 'app')
        on conflict (student_id, occurred_on, kind) do nothing;
      end loop;

      -- Một em mỗi lớp mới bấm "cần gặp thầy cô" và chưa ai xử lý.
      if c >= 3 and n = 4 then
        insert into attendance.help_requests (student_id, requested_on)
        values (v_student, current_date)
        on conflict do nothing;
      end if;

      -- Một em mỗi lớp mới gửi muộn — "gửi muộn ≠ vắng", buồng lái phải có gì để chờ
      -- xác nhận (DESIGN-GUIDELINES §8).
      if c >= 3 and n = 2 then
        insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
        values (v_student, current_date, 'out', null, 'queued_late', 'offline_queue')
        on conflict (student_id, occurred_on, kind) do nothing;
      end if;
    end loop;
  end loop;

  -- ── Khối 7 và khối 8: điểm danh đủ, tâm trạng lành (xem chú thích ở trên) ──
  for k in 1..4 loop
    for n in 1..12 loop
      v_student := ('70000000-0000-0000-0000-00000000' || v_khoi[k]::text || v_lop[k]::text
                    || lpad(n::text, 2, '0'))::uuid;
      if not exists (select 1 from core.students where id = v_student) then
        continue;
      end if;

      for d in 0..4 loop
        v_mood := case when n % 3 = 0 then 3 else 4 end;   -- Bình thường / Vui
        insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
        values (v_student, current_date - d, 'in', v_mood, 'present', 'app')
        on conflict (student_id, occurred_on, kind) do nothing;
      end loop;
    end loop;
  end loop;
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
