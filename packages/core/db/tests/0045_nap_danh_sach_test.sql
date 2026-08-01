-- pgTAP — nạp danh sách cả khối (0045)
-- Chạy: bash tools/run-db-tests.sh
--
-- Bốn điều file này khoá lại, theo thứ tự thiệt hại nếu vỡ:
--
--   1. GHI DANH KHÔNG ĐƯỢC NUỐT IM LẶNG. core.enrollments có ràng buộc EXCLUDE chứ
--      không có unique thường, và `on conflict do nothing` trên nó KHÔNG ném lỗi mà
--      trả `INSERT 0 0` — kể cả khi dòng mới là một LỚP KHÁC. Đo được trên một
--      database riêng ngày 01/08/2026. Chép nguyên dạng đó vào job nạp danh sách thì
--      mỗi em chuyển lớp giữa năm bị nuốt, job báo success 0 lỗi, cô mới không thấy
--      em, cô cũ vẫn thấy. Bài test dưới đây khẳng định ca đó cho ra MỘT DÒNG SỔ LỖI.
--
--   2. §9 THẬT, CẢ HAI NHÁNH. Gọi promote lần hai trên dòng đã vào kho trả
--      'already_promoted'; trên dòng đã hỏng trả 'already_failed' và KHÔNG đẻ thêm
--      dòng nào vào hàng đợi người-xử-tay.
--
--   3. KHÔNG TỰ ĐOÁN, KHÔNG TỰ NẮN. Mã sai khuôn thì vào sổ lỗi, không được nắn cho
--      qua. Lớp chưa có thì vào sổ lỗi, không được tự tạo trừ khi có cờ tường minh.
--
--   4. "VẮNG MẶT TRONG FILE" KHÔNG PHẢI "NGHỈ HỌC". core.doi_soat_vang_mat() chỉ ghi
--      một danh sách chờ người; status và kỳ học của em phải nguyên vẹn sau khi chạy.
--
--   5. (thêm 01/08/2026, `0048`) MỘT DÒNG LÀ MỘT ĐƠN VỊ. Dòng bị TỪ CHỐI không được
--      đổi một cột nào trong kho. Bản đầu của file này kiểm "có vào sổ lỗi không"
--      mà không kiểm "kho có đổi không", nên `0045` ghi đè họ tên + ngày sinh của
--      một dòng đã bị từ chối và vẫn xanh đủ 52 assertion. Bẫy chuyển lớp bên dưới
--      nay mang họ tên KHÁC seed để cái hỏng đó quan sát được. Kịch bản đầy đủ và
--      ca lớp ma nằm ở `0048_nap_mot_dong_la_mot_don_vi_test.sql`.

begin;
select plan(55);
select test_support.seed_basic();

-- ═══ Cấu trúc ════════════════════════════════════════════════════════════════
select has_column(
  'staging', 'raw_cor_imports', 'failed_at',
  'raw_cor_imports có cột failed_at — nhánh lỗi mới idempotent được (khuôn 0028)'
);
select has_table(
  'staging', 'import_limits',
  'Có staging.import_limits — ngưỡng dừng lô đọc từ bảng, không viết chết (mệnh lệnh 7)'
);
select has_function(
  'staging', 'nguong_loi_nap', ARRAY['text'],
  'Có staging.nguong_loi_nap để đọc ngưỡng theo nguồn'
);
select has_function(
  'staging', 'ingest_cor_row', ARRAY['text', 'jsonb'],
  'Có cửa vào staging.ingest_cor_row — connector không cần quyền đọc bảng thô (§8)'
);
select has_function(
  'staging', 'ghi_loi_nap', ARRAY['text', 'text', 'jsonb'],
  'Có staging.ghi_loi_nap cho lỗi cấp FILE (trùng mã trong cùng một file)'
);
select has_function(
  'core', 'record_cor_import_error',
  'Có core.record_cor_import_error — một chỗ duy nhất ghi sổ lỗi của nguồn cor'
);
select has_function(
  'core', 'promote_cor_row', ARRAY['bigint', 'boolean'],
  'Có core.promote_cor_row(raw_id, tao_lop_moi)'
);
select has_function(
  'core', 'doi_soat_vang_mat', ARRAY['text'],
  'Có core.doi_soat_vang_mat — đối soát em vắng mặt trong file mới'
);
select has_view(
  'staging', 'v_loi_nap_danh_sach',
  'Có view đọc sổ lỗi bằng mắt: dòng nào, em nào, vì sao'
);

-- Job nạp danh sách CỐ Ý không có dòng trong ops.job_schedule: nó chạy khi có người
-- yêu cầu, không theo lịch. Khai nó vào đó là bật một dòng qua_han vĩnh viễn giữa hai
-- đợt tuyển sinh — đúng cái bẫy 0011/ADR-016 mà 0041 chép lại thành luật.
select is(
  (select count(*)::int from ops.job_schedule where job_name = 'nap_danh_sach'), 0,
  'nap_danh_sach KHÔNG nằm trong ops.job_schedule — việc chạy tay, không có nhịp để mà quá hạn'
);

-- ═══ Ngưỡng dừng lô ══════════════════════════════════════════════════════════
select is(
  staging.nguong_loi_nap('cor'), 500,
  'Ngưỡng của nguồn cor đọc ra 500 (RB-09), từ bảng chứ không từ code'
);
select throws_ok(
  $$ select staging.nguong_loi_nap('nguon-chua-khai') $$,
  'P0001'::char(5),
  null,
  'Nguồn chưa khai ngưỡng thì NÉM LỖI — không có ngưỡng phải nổ, không được im lặng thành "chạy vô hạn"'
);

-- ═══ Cửa vào staging: chống trùng FILE (§9 tầng 1) ═══════════════════════════
select is(
  staging.ingest_cor_row('LO1:VA-2026-00500',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00500','ho_ten','Nguyễn Thị Hoa',
      'ngay_sinh','2015-03-02','ma_co_so','VA-Q7','ma_lop','6A1','khoi','6',
      'nam_hoc','2026-2027','hieu_luc_tu','2026-09-05','ma_lo','LO1','dong_trong_file',2)),
  staging.ingest_cor_row('LO1:VA-2026-00500',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00500','ho_ten','TÊN BỊ SỬA','ma_co_so','VA-Q7')),
  'Nạp lại CÙNG một dòng của CÙNG một lô trả đúng raw_id cũ (§9)'
);
select is(
  (select count(*)::int from staging.raw_cor_imports where external_id = 'LO1:VA-2026-00500'), 1,
  'Và chỉ có MỘT dòng thô — staging chặn trùng ở cửa'
);
select is(
  (select payload ->> 'ho_ten' from staging.raw_cor_imports where external_id = 'LO1:VA-2026-00500'),
  'Nguyễn Thị Hoa',
  'Bản ĐẦU TIÊN là bản có thẩm quyền — nạp lại không được sửa lịch sử'
);

-- ═══ Đường sạch: một em mới vào kho ══════════════════════════════════════════
select is(
  core.promote_cor_row((select id from staging.raw_cor_imports where external_id = 'LO1:VA-2026-00500')),
  'promoted',
  'Dòng hợp lệ đi thẳng vào kho chính'
);
select is(
  (select full_name from core.students where student_code = 'VA-2026-00500'),
  'Nguyễn Thị Hoa',
  'Em đã có mặt trong core.students'
);
select is(
  (select date_of_birth from core.students where student_code = 'VA-2026-00500'),
  '2015-03-02'::date,
  'Ngày sinh vào đúng chỗ'
);
select is(
  (select c.code
     from core.enrollments e join core.classes c on c.id = e.class_id
     join core.students s on s.id = e.student_id
    where s.student_code = 'VA-2026-00500' and e.valid_to is null),
  '6A1',
  'Và đã được ghi danh vào đúng lớp'
);

-- §9 tầng 2: gọi lại promote trên cùng dòng thô
select is(
  core.promote_cor_row((select id from staging.raw_cor_imports where external_id = 'LO1:VA-2026-00500')),
  'already_promoted',
  'Gọi lại promote trả already_promoted, không làm gì thêm (§9)'
);
select is(
  (select count(*)::int from core.enrollments e join core.students s on s.id = e.student_id
    where s.student_code = 'VA-2026-00500'), 1,
  'Và KHÔNG sinh thêm một kỳ ghi danh thứ hai'
);

-- Nạp LÔ MỚI cùng em, cùng lớp: đây là đường đi thật của file tháng 12. staging không
-- chặn (ma_lo khác), nên tính idempotent lúc này do KHOÁ ĐÍCH gánh.
select is(
  core.promote_cor_row(staging.ingest_cor_row('LO2:VA-2026-00500',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00500','ho_ten','Nguyễn Thị Hoa','ngay_sinh','',
      'ma_co_so','VA-Q7','ma_lop','6A1','nam_hoc','2026-2027','hieu_luc_tu','2026-09-05',
      'ma_lo','LO2','dong_trong_file',2))),
  'promoted',
  'Lô MỚI cùng em cùng lớp vẫn promote được — staging chống trùng FILE, không chống trùng DỮ LIỆU'
);
select is(
  (select count(*)::int from core.enrollments e join core.students s on s.id = e.student_id
    where s.student_code = 'VA-2026-00500' and e.valid_to is null), 1,
  'Vẫn đúng MỘT kỳ ghi danh đang mở — đọc-rồi-quyết nhận ra "đúng lớp rồi" (§9 thật)'
);
select is(
  (select date_of_birth from core.students where student_code = 'VA-2026-00500'),
  '2015-03-02'::date,
  'File mới để trống ngày sinh KHÔNG xoá ngày sinh đã có — trống nghĩa là "lần này không gửi"'
);

-- ═══ BẪY LỚN NHẤT: em chuyển lớp ═════════════════════════════════════════════
-- Minh (VA-2026-00417) đang có kỳ mở ở 6A1. File mới xếp em vào 6A2.
-- Với `on conflict do nothing` thì dòng này biến mất không dấu vết và job báo 0 lỗi.
--
-- SỬA 01/08/2026 (0048): payload dưới đây cố tình mang HỌ TÊN KHÁC và NGÀY SINH mà
-- em chưa có. Trước đó nó chép nguyên tên trong seed, nên nhánh này không bao giờ
-- quan sát được việc 0045 ghi đè họ tên/ngày sinh của một dòng ĐÃ BỊ TỪ CHỐI — cái
-- hỏng đó sống qua 52 assertion xanh vì bẫy không phải bẫy thật.
select is(
  core.promote_cor_row(staging.ingest_cor_row('LO3:VA-2026-00417',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00417','ho_ten','Nguyễn Văn Minh SỬA TRONG FILE',
      'ngay_sinh','2016-12-31',
      'ma_co_so','VA-Q7','ma_lop','6A2','nam_hoc','2026-2027','hieu_luc_tu','2027-01-05',
      'ma_lo','LO3','dong_trong_file',7))),
  'import_error',
  'Em đang học lớp khác: KHÔNG nuốt im lặng, trả import_error'
);
select is(
  (select ly_do from staging.v_loi_nap_danh_sach where external_id = 'LO3:VA-2026-00417'),
  'em đang học lớp khác — chuyển lớp phải có người duyệt, hệ KHÔNG tự đóng kỳ học cũ và KHÔNG ghi một cột nào của em',
  'Sổ lỗi ghi lý do bằng tiếng Việt, đọc được'
);
-- MỘT DÒNG LÀ MỘT ĐƠN VỊ (0048). Dòng bị từ chối không được đổi một cột nào của em.
select is(
  (select full_name from core.students where student_code = 'VA-2026-00417'),
  'Nguyễn Văn Minh',
  'Họ tên của em KHÔNG bị ghi đè theo file — dòng bị từ chối là dòng không đổi gì'
);
select is(
  (select date_of_birth from core.students where student_code = 'VA-2026-00417'),
  null::date,
  'Ngày sinh cũng vậy — em vẫn chưa có ngày sinh, đúng như trước lô'
);
select is(
  (select ho_so_chua_ap_dung ->> 'ho_ten_trong_file' from staging.v_loi_nap_danh_sach
    where external_id = 'LO3:VA-2026-00417'),
  'Nguyễn Văn Minh SỬA TRONG FILE',
  'Nhưng sổ lỗi NÓI RA thứ file định đổi — từ chối không được kèm im lặng'
);
select is(
  (select payload ->> 'lop_dang_hoc' from staging.import_errors where external_id = 'LO3:VA-2026-00417'),
  '6A1',
  'Và ghi luôn LỚP CŨ — không có nó thì người xử phải tự đi tra'
);
select is(
  (select payload ->> 'lop_trong_file' from staging.import_errors where external_id = 'LO3:VA-2026-00417'),
  '6A2',
  'Cùng với lớp mà file muốn xếp em vào'
);
select is(
  (select c.code from core.enrollments e join core.classes c on c.id = e.class_id
    where e.student_id = '70000000-0000-0000-0000-000000000001' and e.valid_to is null),
  '6A1',
  'Kỳ học cũ NGUYÊN VẸN — job không tự đóng kỳ, đó là việc của người duyệt'
);
select is(
  (select count(*)::int from core.enrollments
    where student_id = '70000000-0000-0000-0000-000000000001'), 1,
  'Và không có kỳ thứ hai nào được mở'
);

-- §9 nhánh lỗi
select is(
  core.promote_cor_row((select id from staging.raw_cor_imports where external_id = 'LO3:VA-2026-00417')),
  'already_failed',
  'Gọi lại trên dòng đã hỏng trả already_failed, không diễn lại vở kịch cũ (§9)'
);
select is(
  (select count(*)::int from staging.import_errors where external_id = 'LO3:VA-2026-00417'), 1,
  'Và hàng đợi người-xử-tay vẫn đúng MỘT dòng'
);

-- ═══ Không tự nắn, không tự đoán ═════════════════════════════════════════════
select is(
  core.promote_cor_row(staging.ingest_cor_row('LO3:VA-26-417',
    jsonb_build_object('ma_hoc_sinh','VA-26-417','ho_ten','Trần Sai Khuôn',
      'ma_co_so','VA-Q7','ma_lop','6A1','nam_hoc','2026-2027','hieu_luc_tu','2026-09-05',
      'ma_lo','LO3','dong_trong_file',9))),
  'import_error',
  'Mã học sinh sai khuôn vào sổ lỗi'
);
select is(
  (select count(*)::int from core.students where full_name = 'Trần Sai Khuôn'), 0,
  'Và TUYỆT ĐỐI không tự nắn thành một mã hợp lệ — nắn là bịa ra một em có thật'
);
select is(
  (select reason from staging.import_errors where external_id = 'LO3:VA-26-417'),
  'mã học sinh sai khuôn VA-YYYY-NNNNN — hệ KHÔNG tự nắn, nhà trường sửa rồi nạp lại',
  'Lý do nói rõ hệ đã KHÔNG làm gì và ai phải sửa'
);

select is(
  core.promote_cor_row(staging.ingest_cor_row('LO3:VA-2026-00501',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00501','ho_ten','Lê Lớp Lạ',
      'ma_co_so','VA-Q7','ma_lop','6A9','nam_hoc','2026-2027','hieu_luc_tu','2026-09-05',
      'ma_lo','LO3','dong_trong_file',10))),
  'import_error',
  'Lớp chưa tồn tại: vào sổ lỗi, KHÔNG tự tạo lớp'
);
select is(
  (select count(*)::int from core.classes where code = '6A9'), 0,
  'Một lỗi gõ 6A9 không được đẻ ra một lớp ma'
);
select is(
  (select count(*)::int from core.students where student_code = 'VA-2026-00501'), 0,
  'Và em cũng không được ghi vào kho khi chưa biết xếp vào đâu'
);

-- Cờ tường minh --tao-lop-moi, nhưng thiếu cột khối
select is(
  core.promote_cor_row(staging.ingest_cor_row('LO4:VA-2026-00502',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00502','ho_ten','Phạm Thiếu Khối',
      'ma_co_so','VA-Q7','ma_lop','7B1','nam_hoc','2026-2027','hieu_luc_tu','2026-09-05',
      'ma_lo','LO4','dong_trong_file',3)), true),
  'import_error',
  'Cho phép tạo lớp nhưng thiếu cột khối: vẫn là lỗi — hệ KHÔNG suy khối từ mã lớp'
);
select is(
  (select count(*)::int from core.classes where code = '7B1'), 0,
  'Suy "7B1 -> khối 7" đúng gần hết và sai IM LẶNG ở lớp đặt tên khác quy ước, nên không suy'
);

-- Có cờ và có khối: lớp mới được tạo
select is(
  core.promote_cor_row(staging.ingest_cor_row('LO5:VA-2026-00503',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00503','ho_ten','Vũ Lớp Mới',
      'ma_co_so','VA-Q7','ma_lop','7B1','khoi','7','nam_hoc','2026-2027',
      'hieu_luc_tu','2026-09-05','ma_lo','LO5','dong_trong_file',3)), true),
  'promoted',
  'Có cờ tường minh VÀ có cột khối thì mới tạo lớp'
);
select is(
  (select grade from core.classes where code = '7B1' and academic_year = '2026-2027'), 7::smallint,
  'Lớp mới mang đúng khối do nhà trường ghi ra, không do hệ đoán'
);

-- Cơ sở không có thật
select is(
  core.promote_cor_row(staging.ingest_cor_row('LO5:VA-2026-00504',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00504','ho_ten','Đỗ Cơ Sở Lạ',
      'ma_co_so','VA-QX','ma_lop','6A1','nam_hoc','2026-2027','hieu_luc_tu','2026-09-05',
      'ma_lo','LO5','dong_trong_file',4))),
  'import_error',
  'Mã cơ sở không tra ra: vào sổ lỗi'
);

-- Em đang thuộc cơ sở khác — chuyển cơ sở là quyết định hành chính
select is(
  core.promote_cor_row(staging.ingest_cor_row('LO5:VA-2026-00419',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00419','ho_ten','Lê Văn Cường',
      'ma_co_so','VA-Q7','ma_lop','6A1','nam_hoc','2026-2027','hieu_luc_tu','2026-09-05',
      'ma_lo','LO5','dong_trong_file',5))),
  'import_error',
  'Em đang thuộc cơ sở Q2 mà file xếp sang Q7: cần người duyệt, không tự chuyển'
);
select is(
  (select s.code from core.students st join core.schools s on s.id = st.school_id
    where st.student_code = 'VA-2026-00419'),
  'VA-Q2',
  'Cơ sở của em nguyên vẹn'
);

-- ═══ Vắng mặt trong file mới — KHÔNG được kết luận là nghỉ học ════════════════
-- Lô LO6 chỉ có MỘT em của lớp 6A1 (em mới). Minh đang học 6A1 nhưng không có trong lô.
select is(
  core.promote_cor_row(staging.ingest_cor_row('LO6:VA-2026-00505',
    jsonb_build_object('ma_hoc_sinh','VA-2026-00505','ho_ten','Ngô Em Mới',
      'ma_co_so','VA-Q7','ma_lop','6A1','nam_hoc','2026-2027','hieu_luc_tu','2026-09-05',
      'ma_lo','LO6','dong_trong_file',2))),
  'promoted',
  'Lô LO6 nạp một em mới vào 6A1'
);
-- Lớp 6A1 lúc này có ba kỳ mở: Minh (seed), Hoa (LO1/LO2), Em Mới (LO6). Lô LO6 chỉ
-- nhắc Em Mới, nên Minh và Hoa đều "vắng mặt". Con số 2 là con số phải ra — nếu ra 0
-- thì phép đối soát đã im lặng, và im lặng ở đây nghĩa là không ai biết mình đang
-- thiếu ai trong danh sách vừa nhận.
select is(
  core.doi_soat_vang_mat('LO6'), 2,
  'Đối soát tìm đúng HAI em có trong sổ lớp 6A1 mà không có trong file (Minh và Hoa)'
);
select is(
  (select ho_ten from staging.v_loi_nap_danh_sach where ma_hoc_sinh = 'VA-2026-00417'
     and ly_do like 'vắng mặt%'),
  'Nguyễn Văn Minh',
  'Danh sách chờ người gọi đúng tên em, không phải một mã trần'
);
select is(
  (select status from core.students where student_code = 'VA-2026-00417'),
  'active',
  'Và TUYỆT ĐỐI không tự đặt status = left — thiếu tên trong file không phải bằng chứng nghỉ học'
);
select is(
  (select count(*)::int from core.enrollments
    where student_id = '70000000-0000-0000-0000-000000000001' and valid_to is null), 1,
  'Kỳ học của em vẫn mở — cắt em khỏi tầm nhìn của cô là thiệt hại lớn hơn hẳn một dòng chờ xử'
);
select is(
  core.doi_soat_vang_mat('LO6'), 0,
  'Chạy lại đối soát trả 0 — không đẻ thêm dòng vào hàng đợi (§9)'
);
select is(
  (select count(*)::int from core.students where school_id = '20000000-0000-0000-0000-000000000002'), 1,
  'Lớp/cơ sở không nằm trong lô không bị đối soát chạm tới (Cường ở Q2 vẫn nguyên)'
);

select * from finish();
rollback;
