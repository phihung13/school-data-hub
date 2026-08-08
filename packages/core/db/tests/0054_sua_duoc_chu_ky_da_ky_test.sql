-- pgTAP — 0054: sửa được một chữ ký đã ký, có cờ, có lý do, có vết (ADR-031).
--
-- Sáu câu hỏi mà ADR-031 đòi, mỗi câu đọc được thành lời:
--   (a) lượt ký ĐẦU TIÊN vẫn đi như cũ, và để lại một dòng sổ đủ dữ kiện
--   (b) KHÔNG bật cờ thì KHÔNG đè lên một chữ ký đã có — hành vi hiện hành, không đổi
--   (c) bật cờ mà thiếu lý do → LỖI, ở cả tầng hàm lẫn tầng bảng
--   (d) bật cờ kèm lý do → đè được, và sổ ghi đủ from_status / to_status / decided_by
--   (e) GVCN lớp KHÁC không đè được, và không ném lỗi (không kênh dò)
--   (f) gọi hai lần cùng client_mutation_id → sổ KHÔNG thêm dòng
--
-- ── MỘT CÁI BẪY ĐÃ GẶP KHI VIẾT BÀI NÀY, GHI LẠI ĐỂ AI SỬA SAU KHÔNG SẬP ───────
-- pgTAP chạy trọn một file trong MỘT transaction, nên `now()` (và `decided_at` mặc định)
-- BẰNG NHAU ở mọi dòng sổ do bài này sinh ra. Bản nháp đầu tiên gọi
-- `string_agg(… order by decided_at)` để kiểm hai dòng sổ theo thứ tự thời gian — thứ tự
-- đó KHÔNG xác định, và bài sẽ xanh/đỏ theo tâm trạng của trình tối ưu. Bài dưới đây vì
-- thế chỉ tay vào TỪNG dòng bằng một điều kiện xác định (`from_status = 'approved'`), và
-- đếm số dòng riêng. Cùng họ với cái bẫy "bộ test bịa được lịch sử chạy máy" ở nợ #41.
--
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0054_sua_duoc_chu_ky_da_ky_test.sql

begin;
select plan(33);
select test_support.seed_basic();

-- Tuần báo cáo: 2026-08-03 và 2026-08-10 đều là THỨ HAI (ràng buộc
-- growth_report_approvals_monday_chk của 0032 đòi đúng vậy).

-- ═══════════════════════════════════════════════════════════════════════════
-- Cấu trúc sổ
-- ═══════════════════════════════════════════════════════════════════════════
select has_table('report', 'report_decisions', 'Sổ report.report_decisions tồn tại');

select col_is_fk(
  'report', 'report_decisions', 'student_id',
  '§1 — student_id là khóa ngoại (về core.students, không có bản sao thực thể lõi)'
);

-- Đọc thẳng pg_indexes chứ không dùng has_index(): bản 4 tham số của has_index nhận tham
-- số thứ tư là TÊN CỘT ở một số phiên bản pgTAP và là MÔ TẢ ở phiên bản khác — một
-- assertion mà ý nghĩa đổi theo phiên bản thư viện thì không ghim được gì.
select is(
  (select count(*)::int from pg_indexes
    where schemaname = 'report'
      and indexname = 'report_decisions_mutation_uq'
      and indexdef ilike '%unique%'
      and indexdef ilike '%client_mutation_id%'
      and indexdef ilike '%week_start%'),
  1,
  '§9 — có chỉ mục DUY NHẤT (student_id, week_start, client_mutation_id) chống ghi đôi'
);

select is(
  has_table_privilege('authenticated', 'report.report_decisions', 'update'),
  false,
  'Sổ CHỈ THÊM: authenticated không có quyền UPDATE — sửa được sổ vết thì sổ vết hết nghĩa'
);

select is(
  has_table_privilege('authenticated', 'report.report_decisions', 'delete'),
  false,
  'Sổ CHỈ THÊM: authenticated không có quyền DELETE'
);

select is(
  has_table_privilege('backup_reader', 'report.report_decisions', 'select'),
  true,
  'ADR-006 — backup_reader đọc được sổ: bản sao lưu phải ĐỦ, không thủng bảng'
);

-- §5 đo riêng ở đây (0053 không cần): `reporting` VẪN có usage trên schema report
-- (0009:264) để đọc view tổng hợp, khác hẳn schema attendance đã bị revoke usage. Nên
-- hàng rào §5 của bảng này chỉ còn đúng một lớp là quyền bảng — phải có assertion đo nó.
select is(
  has_table_privilege('reporting', 'report.report_decisions', 'select'),
  false,
  '§5 — role reporting KHÔNG đọc được sổ, dù vẫn có usage trên schema report'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (a) Lượt ký ĐẦU TIÊN — hành vi hiện hành, không đổi
-- ═══════════════════════════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, GVCN 6A1

select is(
  (select updated from report.decide_reports(
     array['70000000-0000-0000-0000-000000000001']::uuid[],
     '2026-08-03'::date, 'approved', null, false, null)),
  1,
  '(a1) Lượt ký đầu tiên: duyệt 1 em, không cần lý do, không cần cờ'
);

select is(
  (select status || '/' || reviewer_id::text
     from report.growth_report_approvals
    where student_id = '70000000-0000-0000-0000-000000000001'
      and week_start = '2026-08-03'),
  'approved/40000000-0000-0000-0000-000000000001',
  '(a2) Sổ duyệt (0032) mang đúng quyết định và đúng chữ ký của Cô Lan'
);

select is(
  (select from_status || '->' || to_status || '|' || coalesce(reason, '(trống)')
       || '|' || decided_by::text
     from report.report_decisions
    where student_id = '70000000-0000-0000-0000-000000000001'
      and week_start = '2026-08-03'),
  'pending->approved|(trống)|40000000-0000-0000-0000-000000000001',
  '(a3) Sổ vết ghi đủ: từ pending sang approved, chưa cần lý do, ký tên Cô Lan'
);

select is(
  (select count(*)::int from report.report_decisions),
  1,
  '(a4) Đúng MỘT dòng sổ cho một lượt bấm'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (b) KHÔNG bật cờ thì KHÔNG đè — hành vi hiện hành của care.decideReports
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select updated || '/' || skipped from report.decide_reports(
     array['70000000-0000-0000-0000-000000000001']::uuid[],
     '2026-08-03'::date, 'rejected', 'Thiếu phần nhận xét', false, null)),
  '0/1',
  '(b1) Không bật cờ → 0 dòng đổi, 1 dòng bỏ qua (không lỗi, không kênh dò)'
);

select is(
  (select status from report.growth_report_approvals
    where student_id = '70000000-0000-0000-0000-000000000001'
      and week_start = '2026-08-03'),
  'approved',
  '(b2) Chữ ký cũ còn nguyên — "chọn tất cả" trên màn cũ vài phút không lật ngược ai'
);

select is(
  (select count(*)::int from report.report_decisions),
  1,
  '(b3) Lượt bị bỏ qua KHÔNG ghi dòng sổ — sổ chỉ ghi thứ thật sự đã xảy ra'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (c) Bật cờ mà thiếu lý do → LỖI, ở cả tầng hàm lẫn tầng bảng
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ select * from report.decide_reports(
       array['70000000-0000-0000-0000-000000000001']::uuid[],
       '2026-08-03'::date, 'approved', null, true, null) $$,
  '22023', null,
  '(c1) Ghi đè mà không có lý do → hàm tự ném lỗi, không tin tầng trên'
);

select throws_ok(
  $$ select * from report.decide_reports(
       array['70000000-0000-0000-0000-000000000001']::uuid[],
       '2026-08-03'::date, 'approved', '  a  ', true, null) $$,
  '22023', null,
  '(c2) Lý do còn 1 ký tự sau khi cắt khoảng trắng → vẫn là thiếu lý do'
);

select is(
  (select status from report.growth_report_approvals
    where student_id = '70000000-0000-0000-0000-000000000001'
      and week_start = '2026-08-03')
  || '/' || (select count(*)::int from report.report_decisions)::text,
  'approved/1',
  '(c3) Sau hai lần bị từ chối: quyết định nguyên vẹn, sổ không thêm dòng nửa vời'
);

select throws_ok(
  $$ insert into report.report_decisions
       (student_id, week_start, from_status, to_status, reason, decided_by)
     values ('70000000-0000-0000-0000-000000000001', '2026-08-03',
             'approved', 'rejected', null,
             '40000000-0000-0000-0000-000000000001') $$,
  '23514', null,
  '(c4) THỬ NGƯỢC tầng hàm: chèn thẳng một lượt ghi đè thiếu lý do → chính BẢNG từ chối'
);

select throws_ok(
  $$ insert into report.report_decisions
       (student_id, week_start, from_status, to_status, reason, decided_by)
     values ('70000000-0000-0000-0000-000000000001', '2026-08-03',
             'pending', 'rejected', null,
             '40000000-0000-0000-0000-000000000001') $$,
  '23514', null,
  '(c5) Trả lại báo cáo thiếu lý do cũng bị BẢNG từ chối — luật màn hiện hành, nay có răng'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (d) Bật cờ kèm lý do → đè được, và sổ ghi đủ dữ kiện
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select updated from report.decide_reports(
     array['70000000-0000-0000-0000-000000000001']::uuid[],
     '2026-08-03'::date, 'rejected', 'Nhận xét thiếu phần rèn luyện', true, null)),
  1,
  '(d1) Bật cờ + có lý do → đè được lên chữ ký đã ký (cửa ADR-031 mở)'
);

select is(
  (select status || '|' || coalesce(note, '(trống)')
     from report.growth_report_approvals
    where student_id = '70000000-0000-0000-0000-000000000001'
      and week_start = '2026-08-03'),
  'rejected|Nhận xét thiếu phần rèn luyện',
  '(d2) Sổ duyệt mang quyết định mới, và lý do vào ô ghi chú của chính dòng đó'
);

-- Chỉ tay vào ĐÚNG dòng ghi đè bằng from_status, không dựa vào thứ tự thời gian
-- (xem cái bẫy ghi ở đầu file: decided_at của cả bài bằng nhau).
select is(
  (select from_status || '->' || to_status || '|' || coalesce(reason, '(trống)')
       || '|' || decided_by::text
     from report.report_decisions
    where student_id = '70000000-0000-0000-0000-000000000001'
      and week_start = '2026-08-03'
      and from_status = 'approved'),
  'approved->rejected|Nhận xét thiếu phần rèn luyện|40000000-0000-0000-0000-000000000001',
  '(d3) Sổ vết giữ lại TRẠNG THÁI CŨ — đúng dữ kiện mà lượt ghi đè xoá mất ở sổ duyệt'
);

select is(
  (select count(*)::int from report.report_decisions
    where student_id = '70000000-0000-0000-0000-000000000001'
      and week_start = '2026-08-03'),
  2,
  '(d4) Hai lượt quyết định = hai dòng sổ; không lượt nào đè lên vết của lượt kia'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (e) GVCN lớp KHÁC không đè được
-- ═══════════════════════════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000006'); -- Cô Hạnh, GVCN 6A2

select is(
  (select updated || '/' || skipped from report.decide_reports(
     array['70000000-0000-0000-0000-000000000001']::uuid[],
     '2026-08-03'::date, 'approved', 'Tôi thấy báo cáo này ổn', true, null)),
  '0/1',
  '(e1) GVCN lớp KHÁC bật cờ ghi đè → 0 dòng đổi, 1 dòng bỏ qua, KHÔNG ném lỗi'
);

select test_support.logout();

select is(
  (select status from report.growth_report_approvals
    where student_id = '70000000-0000-0000-0000-000000000001'
      and week_start = '2026-08-03')
  || '/' || (select count(*)::int from report.report_decisions)::text,
  'rejected/2',
  '(e2) Quyết định của Cô Lan còn nguyên và sổ không thêm dòng nào cho lượt bấm lớp khác'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (f) §9 — gọi hai lần cùng client_mutation_id
-- ═══════════════════════════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan

select is(
  (select updated from report.decide_reports(
     array['70000000-0000-0000-0000-000000000001']::uuid[],
     '2026-08-10'::date, 'approved', null, false,
     'bbbbbbbb-0000-0000-0000-000000000001')),
  1,
  '(f1) Lần bấm thứ nhất của tuần sau: 1 dòng đổi'
);

select is(
  (select updated from report.decide_reports(
     array['70000000-0000-0000-0000-000000000001']::uuid[],
     '2026-08-10'::date, 'approved', null, false,
     'bbbbbbbb-0000-0000-0000-000000000001')),
  0,
  '(f2) §9 — gửi lại cùng client_mutation_id: updated = 0, no-op ÊM chứ không phải lỗi'
);

select is(
  (select skipped from report.decide_reports(
     array['70000000-0000-0000-0000-000000000001']::uuid[],
     '2026-08-10'::date, 'approved', null, false,
     'bbbbbbbb-0000-0000-0000-000000000001')),
  1,
  '(f3) Lượt gửi lại báo đúng 1 em bỏ qua — màn hình không nói dối về số em đã xử'
);

select is(
  (select count(*)::int from report.report_decisions
    where week_start = '2026-08-10'),
  1,
  '(f4) Sau BA lượt gọi cùng mã, sổ vẫn đúng MỘT dòng — không có quyết định thứ hai'
);

-- Ca mà khe hở CHANGELOG đã ghi: lượt gửi lại tới MUỘN, sau khi dòng đã bị lật sang
-- quyết định khác. Trước 0054 nó rơi vào `skipped` vì đoán theo trạng thái; nay nó được
-- nhận ra là BẢN SAO của lượt cũ, nhờ chính mã lượt bấm.
select is(
  (select updated || '/' || skipped from report.decide_reports(
     array['70000000-0000-0000-0000-000000000001']::uuid[],
     '2026-08-10'::date, 'rejected', 'Gửi lại tới muộn', true,
     'bbbbbbbb-0000-0000-0000-000000000001')),
  '0/1',
  '(f5) Lượt gửi lại tới MUỘN kèm cờ ghi đè vẫn là no-op — mã lượt bấm thắng cả cờ'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Cổng đầu vào của hàm — hàm không tin tầng trên
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ select * from report.decide_reports(
       array['70000000-0000-0000-0000-000000000001']::uuid[],
       '2026-08-03'::date, 'pending', 'Không phải một quyết định', false, null) $$,
  '22023', null,
  'Quyết định ngoài {approved, rejected} bị từ chối — pending là trạng thái, không phải quyết định'
);

select throws_ok(
  $$ select * from report.decide_reports(
       array['70000000-0000-0000-0000-000000000001']::uuid[],
       '2026-08-04'::date, 'approved', null, false, null) $$,
  '22023', null,
  'week_start không phải thứ Hai bị chặn ngay ở hàm, nói thành lời — không để 23514 của 0032 nói hộ'
);

select is(
  (select updated || '/' || skipped from report.decide_reports(
     array[]::uuid[], '2026-08-03'::date, 'approved', null, false, null)),
  '0/0',
  'Lô rỗng trả 0/0 — không ném lỗi, không ghi gì'
);

select test_support.logout();

select * from finish();
rollback;
