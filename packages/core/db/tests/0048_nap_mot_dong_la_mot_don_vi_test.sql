-- pgTAP — một dòng nạp là một đơn vị (0048)
-- Chạy: bash tools/run-db-tests.sh
--
-- File này khoá đúng MỘT lời hứa, và lời hứa đó được in ra màn hình của người vận
-- hành nên nó là ràng buộc kỹ thuật chứ không phải lời quảng cáo:
--
--   Khi core.promote_cor_row() trả 'import_error' thì core.students, core.classes
--   và core.enrollments KHÔNG ĐỔI MỘT CỘT NÀO.
--
-- Vì sao phải có file riêng thay vì nhét vào 0045_nap_danh_sach_test.sql: 0045 kiểm
-- "dòng bị từ chối có vào sổ lỗi không, lý do có đọc được không". Nó KHÔNG kiểm
-- "kho có đổi không", và chính vì không kiểm nên cái hỏng dưới đây sống được qua
-- 52 assertion màu xanh.
--
-- ══ CÁI HỎNG THẬT, ĐO ĐƯỢC 01/08/2026 trên hub_dev (trước 0048) ══════════════
--   Em VA-2026-97001 trước lô: 'Bùi Thị Lan, Jr' · 2015-02-02 · đang học 6A1.
--   Nạp một lô xếp em sang 6A2 kèm tên khác và ngày sinh khác:
--     promote() -> 'import_error'          (ĐÚNG: chuyển lớp phải có người duyệt)
--     full_name -> 'TÊN TRONG FILE'        (SAI)
--     date_of_birth -> 2016-12-31          (SAI)
--   Màn hình in "Đã vào kho: 0 · Vào sổ lỗi: 1", người vận hành đọc là "không có gì
--   đổi". Kho đã đổi. Ghi một phần trong im lặng.
--
--   Chỗ thứ hai cùng gốc, rà ra trong cùng lượt: với cờ --tao-lop-moi, một dòng bị
--   từ chối vì em thuộc cơ sở khác VẪN để lại một LỚP MA trong core.classes, vì
--   0045 tạo lớp (dòng 374) trước khi tra học sinh (dòng 390).
--
-- ══ THỬ NGƯỢC ═══════════════════════════════════════════════════════════════
--   Bài test này chỉ bắt được lỗi nếu file nạp thật sự MANG THEO một thay đổi hồ
--   sơ — nếu tên trong file trùng tên trong sổ thì "không đổi" là xanh giả. Nên có
--   một assertion `isnt` canh đúng chỗ đó (đánh dấu THỬ NGƯỢC bên dưới): ai sửa
--   payload cho trùng tên sẽ làm bài test ĐỎ chứ không làm nó thành vô nghĩa.
--   Đã kiểm bằng tay theo chiều ngược lại: chạy đúng kịch bản này trên định nghĩa
--   0045 cũ thì assertion "họ tên KHÔNG ĐỔI" đỏ; chạy trên 0048 thì xanh.

begin;
select plan(34);
select test_support.seed_basic();

-- ═══ Dựng đúng kịch bản đo được ══════════════════════════════════════════════
-- Tên có dấu phẩy là cố ý: đây là hình dạng thật của một dòng xuất từ Excel, và
-- cũng là em đã có tên + ngày sinh SẴN trong sổ — chỉ khi có sẵn thì "ghi đè" mới
-- là một hành vi quan sát được.
insert into core.students (id, student_code, school_id, full_name, date_of_birth)
values ('79000000-0000-0000-0000-000000097001', 'VA-2026-97001',
        '20000000-0000-0000-0000-000000000001', 'Bùi Thị Lan, Jr', '2015-02-02');
insert into core.enrollments (student_id, class_id, valid_from)
values ('79000000-0000-0000-0000-000000097001',
        '30000000-0000-0000-0000-000000000001', '2026-09-05');

-- Ảnh chụp TRƯỚC lô, khẳng định tường minh. Không có hai dòng này thì lúc bài test
-- đỏ không biết là "lô ghi đè" hay "dựng cảnh sai".
select is(
  (select full_name from core.students where student_code = 'VA-2026-97001'),
  'Bùi Thị Lan, Jr',
  'TRƯỚC LÔ: họ tên trong sổ là Bùi Thị Lan, Jr'
);
select is(
  (select date_of_birth from core.students where student_code = 'VA-2026-97001'),
  '2015-02-02'::date,
  'TRƯỚC LÔ: ngày sinh trong sổ là 2015-02-02'
);

-- THỬ NGƯỢC — bẫy phải là bẫy thật.
select isnt(
  'TÊN TRONG FILE'::text,
  (select full_name from core.students where student_code = 'VA-2026-97001'),
  'THỬ NGƯỢC: tên trong file KHÁC tên trong sổ, nếu không thì "không đổi" là xanh giả'
);

-- ═══ Dòng bị TỪ CHỐI: vào sổ lỗi, và kho không đổi một cột nào ════════════════
select is(
  core.promote_cor_row(staging.ingest_cor_row('LOX:VA-2026-97001',
    jsonb_build_object('ma_hoc_sinh','VA-2026-97001','ho_ten','TÊN TRONG FILE',
      'ngay_sinh','2016-12-31','ma_co_so','VA-Q7','ma_lop','6A2','nam_hoc','2026-2027',
      'hieu_luc_tu','2027-01-05','ma_lo','LOX','dong_trong_file',2))),
  'import_error',
  'Lô xếp em sang lớp khác bị TỪ CHỐI — đúng thiết kế, chuyển lớp phải có người duyệt'
);
select is(
  (select full_name from core.students where student_code = 'VA-2026-97001'),
  'Bùi Thị Lan, Jr',
  'SAU LÔ: họ tên KHÔNG ĐỔI — đây chính là assertion mà 0045 thiếu'
);
select is(
  (select date_of_birth from core.students where student_code = 'VA-2026-97001'),
  '2015-02-02'::date,
  'SAU LÔ: ngày sinh KHÔNG ĐỔI'
);
select is(
  (select count(*)::int from core.students where full_name = 'TÊN TRONG FILE'), 0,
  'Không em nào trong kho mang tên lấy từ dòng đã bị từ chối'
);
select is(
  (select c.code from core.enrollments e join core.classes c on c.id = e.class_id
    where e.student_id = '79000000-0000-0000-0000-000000097001' and e.valid_to is null),
  '6A1',
  'Kỳ học vẫn ở lớp cũ — người duyệt mới được chuyển'
);
select is(
  (select count(*)::int from core.enrollments
    where student_id = '79000000-0000-0000-0000-000000097001'), 1,
  'Và không có kỳ học thứ hai nào được mở'
);

-- ═══ Từ chối thì phải NÓI RA thứ file định đổi ════════════════════════════════
-- Gộp cứng (không ghi một nửa) mà im luôn là giấu mất việc file có mang theo một
-- thay đổi hồ sơ. Người xử phải đọc được đủ hai vế rồi tự quyết.
select is(
  (select ly_do from staging.v_loi_nap_danh_sach where external_id = 'LOX:VA-2026-97001'),
  'em đang học lớp khác — chuyển lớp phải có người duyệt, hệ KHÔNG tự đóng kỳ học cũ và KHÔNG ghi một cột nào của em',
  'Lý do nói thẳng cả hai vế: chưa chuyển lớp, VÀ chưa ghi cột nào'
);
select has_column(
  'staging', 'v_loi_nap_danh_sach', 'ho_so_chua_ap_dung',
  'View sổ lỗi có cột ho_so_chua_ap_dung — bới jsonb mới thấy là không ai thấy'
);
select is(
  (select ho_so_chua_ap_dung ->> 'ho_ten_trong_so' from staging.v_loi_nap_danh_sach
    where external_id = 'LOX:VA-2026-97001'),
  'Bùi Thị Lan, Jr',
  'Sổ lỗi ghi tên ĐANG NẰM TRONG SỔ'
);
select is(
  (select ho_so_chua_ap_dung ->> 'ho_ten_trong_file' from staging.v_loi_nap_danh_sach
    where external_id = 'LOX:VA-2026-97001'),
  'TÊN TRONG FILE',
  'Và tên MÀ FILE MUỐN ĐỔI THÀNH — hai vế cạnh nhau thì người xử quyết được'
);
select is(
  (select ho_so_chua_ap_dung ->> 'ngay_sinh_trong_so' from staging.v_loi_nap_danh_sach
    where external_id = 'LOX:VA-2026-97001'),
  '2015-02-02',
  'Ngày sinh trong sổ cũng vậy'
);
select is(
  (select ho_so_chua_ap_dung ->> 'ngay_sinh_trong_file' from staging.v_loi_nap_danh_sach
    where external_id = 'LOX:VA-2026-97001'),
  '2016-12-31',
  'Và ngày sinh trong file'
);

-- ═══ Cửa từ chối THƯỜNG GẶP NHẤT cũng phải nói ra ════════════════════════════
-- Nghiệm thu 01/08/2026 đo được: bản đầu của 0048 chỉ gắn ho_so_chua_ap_dung vào hai
-- cửa (lệch cơ sở · đang học lớp khác). Cửa "lớp chưa tồn tại" — tức ca gõ nhầm
-- '6A11' thay '6A1', ca hay gặp nhất — trả về NULL. Mà màn hình của người vận hành
-- thì bảo họ ĐỌC cột đó, nên NULL bị đọc thành "file không định đổi gì": im lặng
-- biến thành kết luận. Hai assertion dưới khoá lại cửa đó.
select is(
  core.promote_cor_row(staging.ingest_cor_row('LOP-MA:VA-2026-97001',
    jsonb_build_object('ma_hoc_sinh','VA-2026-97001','ho_ten','TÊN GÕ NHẦM',
      'ngay_sinh','2016-12-31','ma_co_so','VA-Q7','ma_lop','6A11','nam_hoc','2026-2027',
      'hieu_luc_tu','2026-09-05','ma_lo','LOPMA','dong_trong_file',7))),
  'import_error',
  'Gõ nhầm mã lớp: từ chối, KHÔNG tự tạo lớp'
);
select is(
  (select ho_so_chua_ap_dung ->> 'ho_ten_trong_file' from staging.v_loi_nap_danh_sach
    where external_id = 'LOP-MA:VA-2026-97001'),
  'TÊN GÕ NHẦM',
  'Và cửa này CŨNG nói ra thứ file định đổi — không để người xử đọc NULL thành "không có gì"'
);

-- ═══ §9 — gọi lại không đổi gì thêm ══════════════════════════════════════════
select is(
  core.promote_cor_row((select id from staging.raw_cor_imports where external_id = 'LOX:VA-2026-97001')),
  'already_failed',
  '§9: gọi lại trên dòng đã hỏng trả already_failed'
);
select is(
  (select count(*)::int from staging.import_errors where external_id = 'LOX:VA-2026-97001'), 1,
  'Hàng đợi người-xử vẫn đúng MỘT dòng'
);
select is(
  (select full_name from core.students where student_code = 'VA-2026-97001'),
  'Bùi Thị Lan, Jr',
  'Và kho vẫn không đổi sau lần gọi thứ hai'
);

-- ═══ LỚP MA — chỗ thứ hai, cùng gốc ══════════════════════════════════════════
-- Cường (VA-2026-00419) thuộc cơ sở Q2. File xếp em sang Q7 vào một lớp CHƯA CÓ,
-- kèm cờ tạo lớp. 0045 tạo lớp trước rồi mới phát hiện lệch cơ sở -> lớp ma ở lại.
select is(
  core.promote_cor_row(staging.ingest_cor_row('LOX:VA-2026-00419',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00419','ho_ten','Lê Văn Cường',
      'ma_co_so','VA-Q7','ma_lop','9Z9','khoi','9','nam_hoc','2026-2027',
      'hieu_luc_tu','2026-09-05','ma_lo','LOX','dong_trong_file',3)), true),
  'import_error',
  'Em đang thuộc cơ sở khác: bị từ chối dù có cờ --tao-lop-moi'
);
select is(
  (select count(*)::int from core.classes where code = '9Z9'), 0,
  'Và KHÔNG còn lớp ma 9Z9 — một dòng bị từ chối không được để lại lớp trống nào'
);
select is(
  (select s.code from core.students st join core.schools s on s.id = st.school_id
    where st.student_code = 'VA-2026-00419'),
  'VA-Q2',
  'Cơ sở của em nguyên vẹn'
);

-- Cùng ca lớp ma nhưng lý do từ chối nằm ở CUỐI đường (chuyển lớp), tức xa lệnh
-- tạo lớp nhất — nếu chỗ nào trong khối con rò rỉ thì ca này bắt được.
select is(
  core.promote_cor_row(staging.ingest_cor_row('LOY:VA-2026-97001',
    jsonb_build_object('ma_hoc_sinh','VA-2026-97001','ho_ten','Bùi Thị Lan, Jr',
      'ma_co_so','VA-Q7','ma_lop','8K8','khoi','8','nam_hoc','2026-2027',
      'hieu_luc_tu','2027-01-05','ma_lo','LOY','dong_trong_file',4)), true),
  'import_error',
  'Lớp mới tạo được nhưng em đang học lớp khác: vẫn từ chối'
);
select is(
  (select count(*)::int from core.classes where code = '8K8'), 0,
  'Lớp 8K8 vừa tạo trong khối con cũng bị hoàn tác theo — không có lớp trống nào ở lại'
);

-- ═══ Ghi danh chồng lấn — cửa từ chối cuối cùng, sau cả lệnh ghi học sinh ═════
-- Em có kỳ học ĐÃ ĐÓNG mà daterange '[]' vẫn phủ ngày hiệu lực mới: v_lop_dang là
-- NULL (kỳ đã đóng) nên hệ đi nhánh insert trần, và 23P01 nổ. 0045 lúc đó đã kịp
-- ghi đè họ tên rồi mới nổ.
insert into core.students (id, student_code, school_id, full_name, date_of_birth)
values ('79000000-0000-0000-0000-000000097002', 'VA-2026-97002',
        '20000000-0000-0000-0000-000000000001', 'Đỗ Văn Cũ', '2014-01-01');
insert into core.enrollments (student_id, class_id, valid_from, valid_to)
values ('79000000-0000-0000-0000-000000097002',
        '30000000-0000-0000-0000-000000000002', '2026-09-05', '2027-06-01');

select is(
  core.promote_cor_row(staging.ingest_cor_row('LOZ:VA-2026-97002',
    jsonb_build_object('ma_hoc_sinh','VA-2026-97002','ho_ten','TÊN KHÁC HẲN',
      'ma_co_so','VA-Q7','ma_lop','6A2','nam_hoc','2026-2027','hieu_luc_tu','2027-01-05',
      'ma_lo','LOZ','dong_trong_file',5))),
  'import_error',
  'Kỳ học chồng lấn ngoài dự kiến: từ chối, không nuốt'
);
select matches(
  (select ly_do from staging.v_loi_nap_danh_sach where external_id = 'LOZ:VA-2026-97002'),
  '^không ghi danh được vào lớp',
  'Lý do gọi đúng tên cái hỏng, kèm nguyên văn lỗi Postgres'
);
select is(
  (select full_name from core.students where student_code = 'VA-2026-97002'),
  'Đỗ Văn Cũ',
  'Và họ tên KHÔNG bị ghi đè — lệnh ghi học sinh chạy trước lệnh ghi danh, khối con cuốn cả hai'
);
select is(
  (select count(*)::int from core.enrollments
    where student_id = '79000000-0000-0000-0000-000000097002'), 1,
  'Vẫn đúng một kỳ học, là kỳ cũ đã đóng'
);

-- ═══ Đường đúng KHÔNG bị chặn oan ════════════════════════════════════════════
-- Sửa lỗi chính tả tên em mà KHÔNG đổi lớp là ca có thật, và nó đã có đường đi sẵn:
-- dòng đó promote bình thường và tên vào kho. Đây là lý do 0048 chọn gộp cứng thay
-- vì đẻ ra một trạng thái "vào một nửa" — nếu đường này gãy thì lựa chọn đó sai.
select is(
  core.promote_cor_row(staging.ingest_cor_row('LOW:VA-2026-97001',
    jsonb_build_object('ma_hoc_sinh','VA-2026-97001','ho_ten','Bùi Thị Lan Jr.',
      'ngay_sinh','','ma_co_so','VA-Q7','ma_lop','6A1','nam_hoc','2026-2027',
      'hieu_luc_tu','2026-09-05','ma_lo','LOW','dong_trong_file',2))),
  'promoted',
  'Sửa chính tả tên mà không đổi lớp: vẫn vào kho như cũ'
);
select is(
  (select full_name from core.students where student_code = 'VA-2026-97001'),
  'Bùi Thị Lan Jr.',
  'Và tên ĐƯỢC cập nhật — gộp cứng không có nghĩa là khoá luôn đường sửa hồ sơ'
);
select is(
  (select date_of_birth from core.students where student_code = 'VA-2026-97001'),
  '2015-02-02'::date,
  'File để trống ngày sinh vẫn không xoá ngày sinh đã có'
);
select is(
  (select count(*)::int from core.enrollments
    where student_id = '79000000-0000-0000-0000-000000097001' and valid_to is null), 1,
  'Vẫn đúng một kỳ đang mở — đúng lớp rồi thì không mở thêm kỳ nào'
);
select is(
  (select count(*)::int from staging.import_errors where external_id = 'LOW:VA-2026-97001'), 0,
  'Và dòng sạch không để lại dòng nào trong hàng đợi người-xử'
);

select * from finish();
rollback;
