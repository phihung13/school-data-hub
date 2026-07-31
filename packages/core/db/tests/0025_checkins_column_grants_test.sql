-- pgTAP — 0025: học sinh KHÔNG tự duyệt được check-in gửi muộn của chính mình.
--
-- Bài này khoá lại đúng câu lệnh đã khai thác được ngày 31/07/2026 (xem đầu file
-- migration 0025), chạy dưới đúng vai học sinh, trên đúng dòng của chính em đó.
-- Hai bài cũ đi sát cạnh mà không chạm: 0014 chỉ thử GVCN LỚP KHÁC, 0017 chỉ thử
-- sửa dòng NGƯỜI KHÁC. Không bài nào thử "chính mình, cột status".
--
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0025_checkins_column_grants_test.sql

begin;
select plan(13);
select test_support.seed_basic();

-- Dòng gửi muộn của Minh, đúng trạng thái mà buồng lái GVCN chờ xác nhận.
insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 2, 'queued_late', 'offline_queue');

-- ── GRANT theo cột: bề mặt ghi của người dùng cuối ──────────────────────────
select is(
  has_column_privilege('authenticated', 'attendance.checkins', 'mood', 'update'),
  true,
  'authenticated vẫn ghi được cột mood — submitMood (ON CONFLICT DO UPDATE) không gãy'
);
select is(
  has_column_privilege('authenticated', 'attendance.checkins', 'status', 'update'),
  true,
  'Cột status vẫn trong grant — GVCN xác nhận gửi muộn qua đúng bảng này (lọc tiếp bằng RLS + trigger)'
);
select is(
  has_column_privilege('authenticated', 'attendance.checkins', 'occurred_on', 'update'),
  false,
  'KHÔNG ai sửa được ngày của check-in — sửa được ngày là dựng lại được lịch sử điểm danh'
);
select is(
  has_column_privilege('authenticated', 'attendance.checkins', 'source', 'update'),
  false,
  'KHÔNG ai sửa được source — sửa được source là giả được "cô ghi hộ" (ADR-007)'
);
select is(
  has_column_privilege('authenticated', 'attendance.checkins', 'student_id', 'update'),
  false,
  'KHÔNG ai chuyển dòng check-in sang tên bạn khác'
);

-- ── Lỗ leo quyền: chính câu UPDATE của care.acknowledgeLate, chạy dưới vai HỌC SINH ──
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
with u as (
  update attendance.checkins
     set status = 'present', confirmed_by = core.current_user_id()
   where student_id = '70000000-0000-0000-0000-000000000001'
     and occurred_on = current_date
     and status = 'queued_late'
  returning 1
)
select is(
  (select count(*)::int from u),
  0,
  'HỌC SINH chạy đúng câu UPDATE của acknowledgeLate trên dòng CỦA CHÍNH MÌNH → 0 dòng bị đổi'
);

-- Vẫn phải sửa được mood của chính mình trên ĐÚNG dòng đó: nếu vá làm hỏng đường này
-- thì em check-in offline xong mở app bấm lại mood sẽ gặp lỗi — đổi lỗ hổng lấy lỗi.
with u as (
  update attendance.checkins set mood = 4
   where student_id = '70000000-0000-0000-0000-000000000001'
     and occurred_on = current_date
  returning 1
)
select is(
  (select count(*)::int from u),
  1,
  'Học sinh vẫn sửa được mood của chính mình trên chính dòng queued_late đó (submitMood không gãy)'
);
select test_support.logout();

select is(
  (select status from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date),
  'queued_late',
  'Dòng vẫn nguyên queued_late — em không tự tính chuyên cần cho mình được'
);
select is(
  (select confirmed_by from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date),
  null,
  'confirmed_by vẫn trống — không có chữ ký giả của chính em đó'
);
select is(
  (select mood::int from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date),
  4,
  'Mood đã đổi thật (4) — chỉ hai cột status/confirmed_by bị chặn, không chặn nhầm cả hàng'
);

-- ── GVCN lớp khác vẫn 0 dòng (giữ nguyên hành vi 0014) ──────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000006'); -- Cô Hạnh, GVCN 6A2
with u as (
  update attendance.checkins
     set status = 'present', confirmed_by = core.current_user_id()
   where student_id = '70000000-0000-0000-0000-000000000001'
     and occurred_on = current_date
     and status = 'queued_late'
  returning 1
)
select is(
  (select count(*)::int from u),
  0,
  'GVCN lớp khác → 0 dòng (RLS chặn trước, trigger không phải là lớp gác duy nhất)'
);
select test_support.logout();

-- ── GVCN đúng lớp: đường nghiệp vụ thật phải còn chạy ───────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, GVCN 6A1
with u as (
  update attendance.checkins
     set status = 'present', confirmed_by = core.current_user_id()
   where student_id = '70000000-0000-0000-0000-000000000001'
     and occurred_on = current_date
     and status = 'queued_late'
  returning 1
)
select is(
  (select count(*)::int from u),
  1,
  'GVCN của em đó xác nhận gửi muộn → 1 dòng (đường nghiệp vụ thật không bị vá chặn nhầm)'
);
select test_support.logout();

select is(
  (select status || ' / ' || confirmed_by::text from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date),
  'present / 40000000-0000-0000-0000-000000000001',
  'Sau xác nhận: present, và chữ ký là CÔ LAN — không phải học sinh'
);

select * from finish();
rollback;
