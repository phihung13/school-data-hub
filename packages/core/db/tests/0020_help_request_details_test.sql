-- pgTAP — attendance.help_requests: chủ đề/mức khẩn + tự sửa trong ngày (0020)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0020_help_request_details_test.sql
--
-- 0020 thêm 2 CHECK và 1 policy UPDATE lên đúng luồng khẩn cấp của các em
-- ("cần gặp thầy cô") mà không có assertion nào. Hai thứ phải khoá:
--
--   1. Bộ giá trị topic/urgency là HỢP ĐỒNG với contracts/checkin.ts. Lệch một chữ
--      ('hoc-tap' thay vì 'hoc') là 23514 ném ra giữa lúc em đang cần giúp.
--   2. help_requests_update_self chỉ mở khi handled_at IS NULL. Nếu để lọt, em
--      sửa lại được nội dung SAU khi GVCN đã đọc/xử lý — thầy cô đọc một đằng,
--      hồ sơ ghi một nẻo.

begin;
select plan(7);
select test_support.seed_basic();

-- ── CHECK tồn tại đúng cột ──────────────────────────────────────────────────
select col_has_check(
  'attendance', 'help_requests', 'topic',
  'Cột topic có CHECK — bộ giá trị được cưỡng chế ở tầng DB, không chỉ ở zod'
);

-- ── Chiều từ chối: giá trị ngoài bộ đã duyệt ────────────────────────────────
select throws_ok(
  $$ insert into attendance.help_requests (student_id, requested_on, topic)
     values ('70000000-0000-0000-0000-000000000002', current_date, 'hoc-tap') $$,
  '23514', null,
  'topic sai khuôn (hoc-tap) bị chặn — bộ đã duyệt là lop/nha/hoc/suc_khoe/khac'
);
select throws_ok(
  $$ insert into attendance.help_requests (student_id, requested_on, urgency)
     values ('70000000-0000-0000-0000-000000000002', current_date, 'normal') $$,
  '23514', null,
  'urgency sai khuôn (normal) bị chặn — bộ đã duyệt là urgent/today/this_week'
);

-- ── Chiều cho phép ──────────────────────────────────────────────────────────
select lives_ok(
  $$ insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'hoc', 'today',
             'Em thấy khó theo kịp môn Toán') $$,
  'Giá trị đúng bộ (hoc/today) thì ghi được'
);

-- ── Tự sửa lại trong ngày khi GVCN CHƯA xử lý ───────────────────────────────
-- Đây là nhánh ON CONFLICT DO UPDATE của checkin.requestHelp: em bấm gửi lần hai
-- với nội dung khác trong cùng ngày.
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
update attendance.help_requests set note = 'Em đổi ý, muốn nói chuyện về chuyện ở nhà'
 where student_id = '70000000-0000-0000-0000-000000000001' and requested_on = current_date;
select test_support.logout();
select is(
  (select note from attendance.help_requests
    where student_id = '70000000-0000-0000-0000-000000000001' and requested_on = current_date),
  'Em đổi ý, muốn nói chuyện về chuyện ở nhà',
  'Em sửa được lời nhắn của chính mình khi handled_at còn NULL'
);

-- ── Sau khi GVCN đã xử lý thì khoá lại ──────────────────────────────────────
update attendance.help_requests
   set handled_by = '40000000-0000-0000-0000-000000000001', handled_at = now()
 where student_id = '70000000-0000-0000-0000-000000000001' and requested_on = current_date;

select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
-- RLS LỌC dòng theo USING chứ không ném lỗi: câu lệnh chạy được nhưng 0 dòng đổi.
update attendance.help_requests set note = 'Ghi đè sau khi cô đã đọc'
 where student_id = '70000000-0000-0000-0000-000000000001' and requested_on = current_date;
select test_support.logout();
select is(
  (select note from attendance.help_requests
    where student_id = '70000000-0000-0000-0000-000000000001' and requested_on = current_date),
  'Em đổi ý, muốn nói chuyện về chuyện ở nhà',
  'GVCN đã handled_at — nội dung KHÔNG bị ghi đè nữa (0 dòng đổi)'
);

-- ── Không sửa được yêu cầu của bạn khác ─────────────────────────────────────
insert into attendance.help_requests (student_id, requested_on, topic, note)
     values ('70000000-0000-0000-0000-000000000002', current_date, 'nha', 'Lời nhắn của Bình');

select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
update attendance.help_requests set note = 'Minh sửa hộ Bình'
 where student_id = '70000000-0000-0000-0000-000000000002' and requested_on = current_date;
select test_support.logout();
select is(
  (select note from attendance.help_requests
    where student_id = '70000000-0000-0000-0000-000000000002' and requested_on = current_date),
  'Lời nhắn của Bình',
  'Minh KHÔNG sửa được yêu cầu của bạn khác (0 dòng đổi)'
);

select * from finish();
rollback;
