-- pgTAP — 0053: kết luận gửi muộn (ADR-029).
--
-- Sáu câu hỏi mà giao việc đòi, mỗi câu một assertion đọc được thành lời:
--   (a) GVCN của lớp đổi được sang CẢ BA trạng thái present / late / absent
--   (b) thiếu lý do khi kết luận khác present → LỖI, ở cả tầng hàm lẫn tầng bảng
--   (c) GVCN lớp KHÁC không đổi được
--   (d) HỌC SINH không đổi được
--   (e) gọi hai lần cùng client_mutation_id → updated lần hai = 0, sổ không thêm dòng
--   (f) dòng không còn queued_late bị BỎ QUA chứ không ném lỗi
--
-- Cộng hai assertion về policy `checkins_confirm_late`. Chúng phải bỏ policy
-- `checkins_update_by_homeroom` (0032) đi mới đo được, và lý do nằm ở phép đo chép
-- trong đầu file migration: hai policy này PERMISSIVE nên Postgres OR chúng lại — đo
-- "GVCN đổi được sang absent" khi cả hai còn nguyên thì KHÔNG chứng minh được policy
-- nào cho phép. Bỏ policy kia đi trong chính transaction của bài test (rollback ở cuối
-- trả lại nguyên trạng) là cách duy nhất tách được hai nhánh của phép OR.
--
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0053_ket_luan_gui_muon_test.sql

begin;
select plan(27);
select test_support.seed_basic();

-- Chín dòng gửi muộn của Minh (6A1, GVCN = Cô Lan), mỗi ngày một dòng để khoá duy nhất
-- checkins_uq (student_id, occurred_on, kind) không đụng nhau. Chèn dưới vai chủ schema:
-- bài này kiểm đường KẾT LUẬN, không kiểm đường tạo dòng gửi muộn (0027 đã kiểm).
insert into attendance.checkins (id, student_id, occurred_on, kind, status, source)
select ('c0000000-0000-0000-0000-00000000000' || d::text)::uuid,
       '70000000-0000-0000-0000-000000000001',
       current_date - d, 'in', 'queued_late', 'offline_queue'
  from generate_series(0, 8) as d;

-- ═══════════════════════════════════════════════════════════════════════════
-- Cấu trúc sổ
-- ═══════════════════════════════════════════════════════════════════════════
select has_table('attendance', 'late_decisions', 'Sổ attendance.late_decisions tồn tại');

select col_is_fk(
  'attendance', 'late_decisions', 'student_id',
  '§1 — student_id là khóa ngoại (về core.students, không có bản sao thực thể lõi)'
);

-- Đọc thẳng pg_indexes chứ không dùng has_index(): bản 4 tham số của has_index nhận
-- tham số thứ tư là TÊN CỘT ở một số phiên bản pgTAP và là MÔ TẢ ở phiên bản khác —
-- một assertion mà ý nghĩa đổi theo phiên bản thư viện thì không ghim được gì.
select is(
  (select count(*)::int from pg_indexes
    where schemaname = 'attendance'
      and indexname = 'late_decisions_mutation_uq'
      and indexdef ilike '%unique%'
      and indexdef ilike '%client_mutation_id%'),
  1,
  '§9 — có chỉ mục DUY NHẤT (checkin_id, client_mutation_id) chống ghi đôi'
);

select is(
  has_table_privilege('authenticated', 'attendance.late_decisions', 'update'),
  false,
  'Sổ CHỈ THÊM: authenticated không có quyền UPDATE — sửa được sổ vết thì sổ vết hết nghĩa'
);

select is(
  has_table_privilege('backup_reader', 'attendance.late_decisions', 'select'),
  true,
  'ADR-006 — backup_reader đọc được sổ: bản sao lưu phải ĐỦ, không thủng bảng'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (a) GVCN của lớp đổi được sang CẢ BA trạng thái
-- ═══════════════════════════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, GVCN 6A1

select is(
  (select updated from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000000']::uuid[], 'present', null, null)),
  1,
  '(a1) GVCN kết luận CÓ MẶT — không cần lý do, 1 dòng đổi'
);

select is(
  (select updated from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000001']::uuid[], 'late', 'Em vào lớp lúc 7g50', null)),
  1,
  '(a2) GVCN kết luận ĐI MUỘN kèm lý do — 1 dòng đổi'
);

select is(
  (select updated from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000002']::uuid[], 'absent', 'Chỗ ngồi trống cả buổi', null)),
  1,
  '(a3) GVCN kết luận VẮNG kèm lý do — cửa mà ADR-029 mở, 1 dòng đổi'
);

select is(
  (select string_agg(status, ',' order by occurred_on desc)
     from attendance.checkins
    where id in ('c0000000-0000-0000-0000-000000000000',
                 'c0000000-0000-0000-0000-000000000001',
                 'c0000000-0000-0000-0000-000000000002')),
  'present,late,absent',
  '(a4) Ba dòng check-in mang đúng ba trạng thái đã kết luận'
);

select is(
  (select string_agg(d.from_status || '->' || d.to_status || '|' || coalesce(d.reason, '(trống)'),
                     ' ; ' order by c.occurred_on desc)
     from attendance.late_decisions d
     join attendance.checkins c on c.id = d.checkin_id
    where d.decided_by = '40000000-0000-0000-0000-000000000001'),
  'queued_late->present|(trống) ; queued_late->late|Em vào lớp lúc 7g50 ; queued_late->absent|Chỗ ngồi trống cả buổi',
  '(a5) Sổ ghi đủ ba lượt: từ trạng thái nào, sang trạng thái nào, vì sao'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (b) Thiếu lý do khi kết luận khác present → LỖI
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ select * from attendance.decide_late_checkins(
       array['c0000000-0000-0000-0000-000000000003']::uuid[], 'absent', null, null) $$,
  '22023', null,
  '(b1) Kết luận VẮNG mà không có lý do → hàm tự ném lỗi, không tin tầng trên'
);

select throws_ok(
  $$ select * from attendance.decide_late_checkins(
       array['c0000000-0000-0000-0000-000000000003']::uuid[], 'late', '  a  ', null) $$,
  '22023', null,
  '(b2) Lý do chỉ còn 1 ký tự sau khi cắt khoảng trắng → vẫn là thiếu lý do'
);

select is(
  (select status from attendance.checkins where id = 'c0000000-0000-0000-0000-000000000003'),
  'queued_late',
  '(b3) Sau hai lần bị từ chối, dòng vẫn nguyên queued_late — không đổi nửa vời'
);

select throws_ok(
  $$ insert into attendance.late_decisions
       (checkin_id, student_id, from_status, to_status, reason, decided_by)
     values ('c0000000-0000-0000-0000-000000000003',
             '70000000-0000-0000-0000-000000000001',
             'queued_late', 'absent', null,
             '40000000-0000-0000-0000-000000000001') $$,
  '23514', null,
  '(b4) THỬ NGƯỢC tầng hàm: chèn thẳng vào sổ thiếu lý do → chính BẢNG từ chối'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (c) GVCN lớp KHÁC không đổi được
-- ═══════════════════════════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000006'); -- Cô Hạnh, GVCN 6A2

select is(
  (select updated || '/' || skipped from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000004']::uuid[], 'absent', 'Tôi thấy em vắng', null)),
  '0/1',
  '(c1) GVCN lớp KHÁC → 0 dòng đổi, 1 dòng bỏ qua (không lỗi, không kênh dò)'
);

select is(
  (select count(*)::int from attendance.late_decisions
    where checkin_id = 'c0000000-0000-0000-0000-000000000004'),
  0,
  '(c2) Sổ không thêm dòng nào cho lượt bấm của GVCN lớp khác'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (d) HỌC SINH không đổi được
-- ═══════════════════════════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh, chính chủ dòng

select is(
  (select updated || '/' || skipped from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000005']::uuid[], 'present', null, null)),
  '0/1',
  '(d1) HỌC SINH tự kết luận dòng CỦA CHÍNH MÌNH → 0 dòng đổi (lỗ leo quyền 0025 không mở lại)'
);

select test_support.logout();
select is(
  (select status || '/' || coalesce(confirmed_by::text, 'NULL')
     from attendance.checkins where id = 'c0000000-0000-0000-0000-000000000005'),
  'queued_late/NULL',
  '(d2) Dòng vẫn queued_late và không có chữ ký giả của chính em đó'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (e) §9 — gọi hai lần cùng client_mutation_id
-- ═══════════════════════════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan

select is(
  (select updated from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000006']::uuid[], 'absent', 'Em nghỉ không phép',
     'aaaaaaaa-0000-0000-0000-000000000001')),
  1,
  '(e1) Lần bấm thứ nhất: 1 dòng đổi'
);

select is(
  (select updated from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000006']::uuid[], 'absent', 'Em nghỉ không phép',
     'aaaaaaaa-0000-0000-0000-000000000001')),
  0,
  '(e2) §9 — gửi lại cùng client_mutation_id: updated = 0, no-op ÊM chứ không phải lỗi'
);

select is(
  (select skipped from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000006']::uuid[], 'absent', 'Em nghỉ không phép',
     'aaaaaaaa-0000-0000-0000-000000000001')),
  1,
  '(e3) Lượt gửi lại báo đúng 1 dòng bỏ qua — màn hình không nói dối về số em đã xử'
);

select is(
  (select count(*)::int from attendance.late_decisions
    where checkin_id = 'c0000000-0000-0000-0000-000000000006'),
  1,
  '(e4) Sau BA lượt gọi cùng mã, sổ vẫn đúng MỘT dòng — không có quyết định thứ hai'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- (f) Dòng không còn queued_late bị BỎ QUA, không ném lỗi
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select updated || '/' || skipped from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000000']::uuid[], 'absent', 'Nghĩ lại thấy em vắng', null)),
  '0/1',
  '(f1) Dòng đã kết luận present từ (a1) → bỏ qua, KHÔNG ném lỗi'
);

select is(
  (select status from attendance.checkins where id = 'c0000000-0000-0000-0000-000000000000'),
  'present',
  '(f2) Kết luận cũ không bị ghi đè qua đường này — sửa lại phải đi đường điểm danh (0032)'
);

select is(
  (select updated || '/' || skipped from attendance.decide_late_checkins(
     array['c0000000-0000-0000-0000-000000000000',
           'c0000000-0000-0000-0000-000000000007']::uuid[], 'absent', 'Vắng cả buổi', null)),
  '1/1',
  '(f3) Lô TRỘN (1 dòng còn hạn + 1 dòng đã xử): đổi 1, bỏ qua 1 — cả lô không đổ theo một dòng'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Policy checkins_confirm_late — tách khỏi phép OR của các policy permissive
-- ═══════════════════════════════════════════════════════════════════════════
select test_support.logout();
drop policy checkins_update_by_homeroom on attendance.checkins;  -- rollback cuối bài trả lại
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan

with u as (
  update attendance.checkins
     set status = 'absent', confirmed_by = core.current_user_id()
   where id = 'c0000000-0000-0000-0000-000000000008' and status = 'queued_late'
  returning 1
)
select is(
  (select count(*)::int from u),
  1,
  'Policy checkins_confirm_late TỰ NÓ cho phép kết luận absent (ADR-029) — đo khi policy 0032 đã bỏ'
);

with u as (
  update attendance.checkins
     set status = 'absent', confirmed_by = core.current_user_id()
   where id = 'c0000000-0000-0000-0000-000000000000'
  returning 1
)
select is(
  (select count(*)::int from u),
  0,
  'Vế USING giữ nguyên từ 0014: dòng KHÔNG còn queued_late thì policy này không chạm tới'
);

select test_support.logout();

select * from finish();
rollback;
