-- pgTAP — phân quyền KHÔNG rò CHÉO KHỐI (gói khoi-7-8-va-kiem-cheo-khoi)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0046_cheo_khoi_test.sql
--
-- Bài này KHÔNG đi kèm migration nào — nó không dựng gì trong lược đồ, chỉ hỏi. Số 0046
-- ở đây là số thứ tự của BÀI TEST; migration mang số 0046 thuộc một gói khác và không
-- liên quan. Cả gói "khoi-7-8-va-kiem-cheo-khoi" cố ý không đổi một dòng schema nào:
-- thứ còn thiếu không phải là bảng mới mà là DỮ LIỆU đủ đa dạng để câu hỏi đặt ra được.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- VÌ SAO BÀI NÀY TỒN TẠI
--
-- Lộ trình go-live có hạng mục "bài kiểm nhiều lớp thuộc NHIỀU KHỐI: mỗi giáo viên
-- chỉ thấy lớp mình". Trước 01/08/2026 câu đó KHÔNG kiểm được: cả kho dữ liệu mẫu
-- chỉ có khối 6 (`select grade, count(*) from core.classes` → đúng một dòng `6|5`).
-- Mọi khẳng định "không thấy khối khác" khi ấy đều xanh, nhưng xanh vì MẪU SỐ RỖNG —
-- không có khối khác để mà thấy. Bài này chạy trên bộ test_support.seed_khoi_7_8():
-- ba khối, hai cơ sở, một giáo viên bộ môn dạy chéo khối.
--
-- LUẬT TỰ ÁP CHO CHÍNH BÀI NÀY: mọi khẳng định PHỦ ĐỊNH ("không thấy X") phải có một
-- khẳng định KHẲNG ĐỊNH đứng trước nói rõ X có bao nhiêu. Phần 0 làm đúng việc đó và
-- làm TRƯỚC KHI đăng nhập bất kỳ ai — nếu một ngày ai đó rút khối 7 khỏi bộ dữ liệu,
-- bài này phải ĐỎ ngay ở phần 0, chứ không được xanh mượt ở phần 1 vì đếm 0 = 0.
--
-- Con số cứng trong file (60 / 24 / 12) là số của BỘ DỮ LIỆU MẪU, không phải ngưỡng
-- nghiệp vụ — mệnh lệnh 7 cấm viết chết ngưỡng, không cấm viết rõ mẫu số của phép đo.
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(38);
select test_support.seed_khoi_7_8();

-- ══ 0 · MẪU SỐ — đo trước, chưa đăng nhập ai, chưa có RLS nào chen vào ═══════

select is(
  (select count(distinct grade)::int from core.classes),
  3,
  'MẪU SỐ: bộ dữ liệu có ĐÚNG 3 khối phân biệt — một khối thì cả bài này vô nghĩa'
);

select is(
  (select count(*)::int
     from core.enrollments e join core.classes c on c.id = e.class_id
    where e.valid_to is null and c.grade = 6),
  60,
  'MẪU SỐ: khối 6 có 60 em đang học'
);

select is(
  (select count(*)::int
     from core.enrollments e join core.classes c on c.id = e.class_id
    where e.valid_to is null and c.grade = 7),
  24,
  'MẪU SỐ: khối 7 có 24 em đang học'
);

select is(
  (select count(*)::int
     from core.enrollments e join core.classes c on c.id = e.class_id
    where e.valid_to is null and c.grade = 8
      and c.school_id = '20000000-0000-0000-0000-000000000001'),
  12,
  'MẪU SỐ: khối 8 cơ sở Quận 7 có 12 em'
);

select is(
  (select count(*)::int
     from core.enrollments e join core.classes c on c.id = e.class_id
    where e.valid_to is null and c.grade = 8
      and c.school_id = '20000000-0000-0000-0000-000000000002'),
  12,
  'MẪU SỐ: khối 8 cơ sở Quận 2 có 12 em — CÙNG KHỐI, KHÁC CƠ SỞ với 8A1'
);

-- Thầy Sơn phải dạy nhiều khối mà không dạy hết. Mất vế nào cũng làm phần 3 rỗng
-- mẫu số: dạy một khối thì "chéo khối" là chữ suông, dạy hết thì "không thấy lớp
-- mình không dạy" lại là 0 = 0.
select is(
  (select count(distinct c.grade)::int
     from core.class_assignments ca join core.classes c on c.id = ca.class_id
    where ca.teacher_id = '50000000-0000-0000-0000-00000000000b'
      and ca.assignment_role = 'subject'),
  2,
  'MẪU SỐ: giáo viên bộ môn chéo khối dạy lớp thuộc 2 khối khác nhau'
);

select cmp_ok(
  (select count(*)::int from core.class_assignments
    where teacher_id = '50000000-0000-0000-0000-00000000000b' and assignment_role = 'subject'),
  '<',
  (select count(*)::int from core.classes),
  'MẪU SỐ: giáo viên bộ môn chéo khối KHÔNG dạy hết mọi lớp'
);

-- Cô Yến chủ nhiệm 8A1 — khối 8, khối mà Thầy Sơn không dạy. Không có dòng này thì
-- phép giao "lớp của GVCN ∩ lớp thầy dạy" rỗng một cách tình cờ, không phải do thiết kế.
select is(
  (select count(*)::int
     from core.class_assignments ca join core.classes c on c.id = ca.class_id
    where ca.assignment_role = 'homeroom'
      and c.grade not in (select c2.grade
                            from core.class_assignments ca2
                            join core.classes c2 on c2.id = ca2.class_id
                           where ca2.teacher_id = '50000000-0000-0000-0000-00000000000b'
                             and ca2.assignment_role = 'subject')),
  2,
  'MẪU SỐ: có GVCN chủ nhiệm lớp thuộc khối mà giáo viên bộ môn chéo khối KHÔNG dạy'
);

-- ══ 1 · GVCN khối 7 (Cô Thu, 7A1) ═══════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-00000000000b');

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id = '30000000-0000-0000-0000-000000000701'),
  12,
  'Cô Thu thấy đủ 12 em lớp 7A1 của mình'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 6),
  0,
  'Cô Thu (khối 7) KHÔNG thấy một em nào trong 60 em khối 6'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 8),
  0,
  'Cô Thu KHÔNG thấy em nào khối 8, kể cả 8A1 cùng cơ sở Quận 7'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id = '30000000-0000-0000-0000-000000000702'),
  0,
  'Cô Thu KHÔNG thấy 7A2 — cùng khối, cùng cơ sở, vẫn là lớp của đồng nghiệp'
);

select test_support.logout();

-- ══ 2 · Chiều ngược lại: GVCN khối 6 (Cô Lan, 6A1) ══════════════════════════
-- Một chiều đúng không chứng minh được hàng rào: rất nhiều lỗi phân quyền chỉ rò
-- theo một hướng (ai ở "khối gốc" thì thấy hết, người mới thì không).
select test_support.login_as('90000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id = '30000000-0000-0000-0000-000000000001'),
  12,
  'Cô Lan thấy đủ 12 em lớp 6A1 của mình'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 7),
  0,
  'Cô Lan (khối 6) KHÔNG thấy một em nào trong 24 em khối 7'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 8),
  0,
  'Cô Lan KHÔNG thấy một em nào trong 24 em khối 8 (cả hai cơ sở)'
);

select test_support.logout();

-- ══ 3 · Giáo viên bộ môn dạy CHÉO KHỐI (Thầy Sơn: 6A5 + 7A1) ════════════════
-- Đây là vai khó nhất của cả bài. Thầy có mặt ở hai khối, nên một hàng rào cài theo
-- kiểu "chặn theo khối của giáo viên" sẽ vừa chặn nhầm 6A5 vừa mở nhầm 7A2. Phạm vi
-- đúng phải là DANH SÁCH LỚP ĐƯỢC PHÂN CÔNG, không phải khối.
select test_support.login_as('90000000-0000-0000-0000-00000000000f');

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id = '30000000-0000-0000-0000-000000000005'),
  12,
  'Thầy Sơn thấy đủ 12 em lớp 6A5 mình dạy'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id = '30000000-0000-0000-0000-000000000701'),
  12,
  'Thầy Sơn thấy đủ 12 em lớp 7A1 mình dạy — lớp ở KHỐI KHÁC'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 6),
  12,
  'Thầy Sơn chỉ thấy 12/60 em khối 6 — đúng lớp 6A5, không phải cả khối'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 7),
  12,
  'Thầy Sơn chỉ thấy 12/24 em khối 7 — đúng lớp 7A1, không lây sang 7A2'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 8),
  0,
  'Thầy Sơn KHÔNG thấy em nào khối 8 — khối thầy không có lớp nào'
);

select test_support.logout();

-- ══ 4 · GVCN 8A1 (Cô Yến) — phép giao với Thầy Sơn đúng bằng RỖNG ═══════════
select test_support.login_as('90000000-0000-0000-0000-00000000000d');

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id = '30000000-0000-0000-0000-000000000801'),
  12,
  'Cô Yến thấy đủ 12 em lớp 8A1 của mình'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id in ('30000000-0000-0000-0000-000000000005',
                         '30000000-0000-0000-0000-000000000701')),
  0,
  'Cô Yến KHÔNG thấy 24 em ở hai lớp Thầy Sơn dạy — giao rỗng vì phạm vi, không vì thiếu dữ liệu'
);

select test_support.logout();

-- ══ 5 · Tâm lý cụm (Cô Mai) — cụm tính theo CƠ SỞ, KHÔNG theo khối ══════════
-- Đây là chỗ cặp 8A1 (Q7) / 8B1 (Q2) trả công. Hai giả thuyết "cụm = cơ sở" và
-- "cụm = khối" cho ra cùng một đáp số trên mọi dữ liệu chỉ có một khối; chỉ khi có
-- hai lớp CÙNG KHỐI ở HAI CƠ SỞ thì chúng mới tách nhau ra.
select test_support.login_as('90000000-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 6),
  60,
  'Cô Mai thấy ĐỦ 60 em khối 6 trong cụm Quận 7'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 7),
  24,
  'Cô Mai thấy ĐỦ 24 em khối 7 — cụm không dừng ở khối 6'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 8 and c.school_id = '20000000-0000-0000-0000-000000000001'),
  12,
  'Cô Mai thấy ĐỦ 12 em khối 8 ở Quận 7'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade = 8 and c.school_id = '20000000-0000-0000-0000-000000000002'),
  0,
  'Cô Mai KHÔNG thấy 12 em khối 8 ở Quận 2 — cụm là CƠ SỞ, cùng khối cũng không qua được'
);

select test_support.logout();

-- ══ 6 · Hiệu trưởng (Hùng, cơ sở Quận 7) ════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000007');

select is(
  (select count(*)::int from core.students
    where school_id = '20000000-0000-0000-0000-000000000001'),
  96,
  'Hiệu trưởng Quận 7 thấy ĐỦ 96 em của cơ sở mình, trải cả ba khối'
);

select is(
  (select count(distinct c.grade)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id),
  3,
  'Phạm vi hiệu trưởng cắt theo CƠ SỞ nên vẫn phủ đủ 3 khối — không bị bó vào một khối'
);

select is(
  (select count(*)::int from core.students
    where school_id = '20000000-0000-0000-0000-000000000002'),
  0,
  'Hiệu trưởng Quận 7 KHÔNG thấy một em nào trong 13 em cơ sở Quận 2'
);

select test_support.logout();

-- ══ 7 · GVCN 8B1 ở cơ sở Quận 2 (Thầy Lộc) — đối xứng với phần 6 ════════════
select test_support.login_as('90000000-0000-0000-0000-00000000000e');

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id = '30000000-0000-0000-0000-000000000802'),
  12,
  'Thầy Lộc thấy đủ 12 em lớp 8B1 của mình ở Quận 2'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
    where e.class_id = '30000000-0000-0000-0000-000000000801'),
  0,
  'Thầy Lộc KHÔNG thấy 8A1 — CÙNG KHỐI 8, khác cơ sở'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade in (6, 7)),
  0,
  'Thầy Lộc KHÔNG thấy 84 em khối 6 và khối 7'
);

select test_support.logout();

-- ══ 8 · Phụ huynh chỉ thấy con mình ═════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000004');

select is(
  (select count(*)::int from core.students),
  1,
  'Phụ huynh thấy ĐÚNG 1 em trong 109 em toàn hệ thống'
);

select is(
  (select id::text from core.students),
  '70000000-0000-0000-0000-000000000001',
  'Và em đó là con mình, không phải một em ngẫu nhiên lọt qua'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade in (7, 8)),
  0,
  'Phụ huynh KHÔNG thấy một em nào trong 48 em khối 7 và khối 8'
);

select test_support.logout();

-- ══ 9 · Học sinh chỉ thấy chính mình, khối mới không mở thêm cửa nào ════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');

select is(
  (select count(*)::int from core.students),
  1,
  'Học sinh Minh thấy ĐÚNG 1 em — chính em'
);

select is(
  (select count(*)::int from core.students st
     join core.enrollments e on e.student_id = st.id and e.valid_to is null
     join core.classes c on c.id = e.class_id
    where c.grade in (7, 8)),
  0,
  'Minh KHÔNG thấy em nào khối 7/8 — thêm khối không thêm cửa cho vai học sinh'
);

select test_support.logout();

-- ══ 10 · Chưa đăng nhập thì không có gì hết ═════════════════════════════════
-- Chốt cuối: nếu vì lý do nào đó `request.jwt.claim.sub` rỗng mà bảng vẫn trả dòng,
-- thì mọi con số ở trên chỉ đang đo một CSDL không bật RLS.
select test_support.login_as('00000000-0000-0000-0000-000000000000');
select is(
  (select count(*)::int from core.students),
  0,
  'Danh tính không tồn tại → 0 dòng, không phải 109'
);
select test_support.logout();

select * from finish();
rollback;
