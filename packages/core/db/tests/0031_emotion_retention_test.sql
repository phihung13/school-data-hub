-- pgTAP — 0031: xoá chi tiết cảm xúc sau 12 tháng + độ tươi nguồn + updated_at
--
-- Câu hỏi bài test trả lời: "lời hứa công khai với phụ huynh (chi tiết cảm xúc bị
-- xoá sau 12 tháng, chỉ giữ xu hướng) có thứ gì thi hành nó không, hay chỉ nằm
-- trong comment?" — §3 RULES.md, mệnh lệnh 4 CLAUDE.md, Luật 91/2025.
--
-- Ba mốc thời gian dùng chung, đặt vào bảng tạm để mọi assertion nói cùng một ngày:
--   edge      = đầu tháng của (hôm nay - 12 tháng) — mốc mà job sẽ áp dụng
--   edge - 15/16/20 ngày = "chi tiết quá hạn" (nằm trong tháng liền trước edge)
--   hôm nay - 30 ngày    = "chi tiết còn hạn", phải sống sót qua mọi lần chạy

begin;
select plan(25);

select test_support.seed_basic();

create temp table t_dates as
  select (date_trunc('month', current_date) - interval '12 months')::date as edge;

-- ── 1. Hai hàm phải tồn tại và KHÔNG mở cho người dùng thường ────────────────
select has_function('attendance', 'rollup_mood_trends', array['date'],
  'Có attendance.rollup_mood_trends(date) — tổng hợp xu hướng trước khi xoá');
select has_function('attendance', 'purge_old_emotion_details', array['date'],
  'Có attendance.purge_old_emotion_details(date) — job xoá chi tiết 12 tháng');

-- Postgres cấp EXECUTE cho PUBLIC theo mặc định: quên REVOKE là mọi tài khoản học
-- sinh gọi được hàm xoá toàn bộ dữ liệu cảm xúc của trường.
set local role authenticated;
select throws_ok(
  $$ select attendance.purge_old_emotion_details('2100-01-01'::date) $$,
  '42501', null,
  'authenticated KHÔNG gọi được hàm xoá dữ liệu cảm xúc'
);
reset role;

-- ── 2. Độ tươi nguồn: băng vàng phải TẮT khi có dữ liệu thật ─────────────────
-- 0011 dựng bảng + view nhưng không ai ghi last_success_at, nên trạng thái ban đầu
-- (đúng chủ ý) là "quá hạn". Assertion này chốt điểm xuất phát.
select isnt_empty(
  $$ select 1 from ops.v_stale_sources where source = 'attendance' $$,
  'Chưa có check-in nào → nguồn attendance tính là quá hạn (chưa chạy ≠ đang ổn)'
);

insert into attendance.checkins (student_id, occurred_on, mood)
select '70000000-0000-0000-0000-000000000001', d.edge - v.days_back, v.m
  from t_dates d,
       (values (15, 2::smallint), (16, 4::smallint)) as v(days_back, m);

insert into attendance.checkins (student_id, occurred_on, mood)
     values ('70000000-0000-0000-0000-000000000001', current_date - 30, 3);

select is_empty(
  $$ select 1 from ops.v_stale_sources where source = 'attendance' $$,
  'Có check-in thật → nguồn attendance hết quá hạn, băng vàng tắt'
);

insert into evidence.dear_logs (student_id, logged_on, minutes, book_title)
     values ('70000000-0000-0000-0000-000000000001', current_date - 3, 20, 'Dế Mèn phiêu lưu ký');

select is_empty(
  $$ select 1 from ops.v_stale_sources where source = 'evidence' $$,
  'Có dấu chân hoạt động thật → nguồn evidence hết quá hạn'
);

-- ── 3. Chạy job lần 1 ───────────────────────────────────────────────────────
insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
select '70000000-0000-0000-0000-000000000001', d.edge - 15, 'hoc', 'today', 'em buồn vì bài kiểm tra'
  from t_dates d;

insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
     values ('70000000-0000-0000-0000-000000000001', current_date - 30,
             'nha', 'this_week', 'chuyện ở nhà em muốn kể');

create temp table t_run1 as
  select attendance.purge_old_emotion_details((select edge from t_dates)) as m;

select is(
  (select count(*)::int from attendance.checkins
    where occurred_on < (select edge from t_dates) and mood is not null),
  0,
  'Chi tiết mood quá 12 tháng đã bị xoá'
);
select is(
  (select count(*)::int from attendance.checkins where mood is not null),
  1,
  'Mood còn trong hạn KHÔNG bị đụng tới'
);
select is(
  (select (m ->> 'checkins_cleared')::int from t_run1),
  2,
  'Job báo đúng số dòng đã xoá — im lặng không tính là thành công'
);

select is(
  (select count(*)::int from attendance.mood_trends
    where student_id = '70000000-0000-0000-0000-000000000001'),
  1,
  'Đúng một dòng xu hướng cho tháng bị xoá chi tiết'
);
select is(
  (select avg_mood::text from attendance.mood_trends
    where student_id = '70000000-0000-0000-0000-000000000001'
      and period_month = date_trunc('month', (select edge from t_dates) - 15)::date),
  '3.00',
  'Xu hướng giữ đúng trung bình của mood đã xoá (2 và 4 → 3.00)'
);
select is(
  (select sample_count from attendance.mood_trends
    where student_id = '70000000-0000-0000-0000-000000000001'
      and period_month = date_trunc('month', (select edge from t_dates) - 15)::date),
  2,
  'Xu hướng ghi đúng số mẫu đã tổng hợp'
);

select is(
  (select count(*)::int from attendance.help_requests
    where requested_on < (select edge from t_dates)
      and (note is not null or topic is not null or urgency is not null)),
  0,
  'Nội dung "cần gặp thầy cô" quá hạn đã bị xoá (0020:25)'
);
select is(
  (select count(*)::int from attendance.help_requests
    where requested_on < (select edge from t_dates)),
  1,
  'Dòng yêu cầu vẫn còn — chỉ nội dung bị quên, dữ kiện vận hành thì không'
);
select is(
  (select note from attendance.help_requests where requested_on = current_date - 30),
  'chuyện ở nhà em muốn kể',
  'Lời nhắn trong hạn KHÔNG bị đụng tới'
);

select isnt_empty(
  $$ select 1 from ops.job_runs
      where job_name = 'emotion_retention' and status = 'success' and finished_at is not null $$,
  'Job ghi lại vào ops.job_runs — có bằng chứng đã chạy, không suy tin tốt từ im lặng'
);

-- ── 4. §9 — chạy lần hai là no-op ───────────────────────────────────────────
create temp table t_run2 as
  select attendance.purge_old_emotion_details((select edge from t_dates)) as m;

select is(
  (select (m ->> 'checkins_cleared')::int from t_run2),
  0,
  '§9 — chạy purge lần hai không xoá thêm dòng nào'
);
select is(
  (select (m ->> 'help_requests_cleared')::int from t_run2),
  0,
  '§9 — lần hai cũng không đụng tới help_requests'
);
select is(
  (select avg_mood::text from attendance.mood_trends
    where student_id = '70000000-0000-0000-0000-000000000001'
      and period_month = date_trunc('month', (select edge from t_dates) - 15)::date),
  '3.00',
  '§9 — xu hướng giữ nguyên sau lần chạy thứ hai (không bị ghi đè bằng NULL)'
);

-- ── 5. Bản ghi bù muộn rơi vào tháng đã xoá không được làm hỏng xu hướng ─────
insert into attendance.checkins (student_id, occurred_on, mood)
     values ('70000000-0000-0000-0000-000000000001', (select edge from t_dates) - 20, 1);

create temp table t_run3 as
  select attendance.purge_old_emotion_details((select edge from t_dates)) as m;

select is(
  (select avg_mood::text from attendance.mood_trends
    where student_id = '70000000-0000-0000-0000-000000000001'
      and period_month = date_trunc('month', (select edge from t_dates) - 15)::date),
  '3.00',
  'Một bản ghi bù muộn (1 mẫu) KHÔNG ghi đè xu hướng đã tổng hợp từ 2 mẫu'
);
select is(
  (select sample_count from attendance.mood_trends
    where student_id = '70000000-0000-0000-0000-000000000001'
      and period_month = date_trunc('month', (select edge from t_dates) - 15)::date),
  2,
  'Số mẫu của xu hướng không bị tụt vì một dòng đến muộn'
);

-- ── 6. Mốc mặc định 12 tháng không chạm dữ liệu còn hạn ─────────────────────
create temp table t_run4 as
  select attendance.purge_old_emotion_details() as m;

select is(
  (select count(*)::int from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001' and mood is not null),
  1,
  'Chạy với mốc mặc định (12 tháng) → mood 30 ngày trước vẫn nguyên'
);

-- ── 7. §9 cho chính hàm tổng hợp ────────────────────────────────────────────
-- Dùng tháng của dòng còn hạn (hôm nay - 30 ngày) chứ không phải "tháng hiện tại":
-- chạy bài test vào ngày mùng 2 thì tháng hiện tại chưa chắc có dòng nào.
create temp table t_roll1 as select attendance.rollup_mood_trends(current_date - 30) as n;
create temp table t_roll2 as select attendance.rollup_mood_trends(current_date - 30) as n;

select is(
  (select sample_count from attendance.mood_trends
    where student_id = '70000000-0000-0000-0000-000000000001'
      and period_month = date_trunc('month', current_date - 30)::date),
  1,
  '§9 — gọi rollup hai lần không nhân đôi số mẫu'
);

-- ── 8. core.users.updated_at phải nói thật (0002:45 chưa từng được cập nhật) ─
insert into core.users (id, auth_uid, email, full_name, status, created_at, updated_at) values
  ('40000000-0000-0000-0000-000000000098', '90000000-0000-0000-0000-000000000098',
   'touch1@va.edu.vn', 'Người thử 1', 'active', now() - interval '2 days', now() - interval '2 days'),
  ('40000000-0000-0000-0000-000000000099', '90000000-0000-0000-0000-000000000099',
   'touch2@va.edu.vn', 'Người thử 2', 'active', now() - interval '2 days', now() - interval '2 days');

update core.users set full_name = 'Người thử 1 (đã đổi tên)'
 where id = '40000000-0000-0000-0000-000000000098';

select ok(
  (select updated_at > created_at from core.users
    where id = '40000000-0000-0000-0000-000000000098'),
  'Đổi full_name → updated_at được dời tới hiện tại'
);

-- UPDATE không đổi gì (rất phổ biến với upsert) không được dời mốc thời gian, nếu
-- không thì bên đọc "có gì đổi từ lần đồng bộ trước" sẽ luôn thấy mọi hàng đều mới.
update core.users set full_name = full_name
 where id = '40000000-0000-0000-0000-000000000099';

select ok(
  (select updated_at < now() - interval '1 day' from core.users
    where id = '40000000-0000-0000-0000-000000000099'),
  'UPDATE không thay đổi gì → updated_at giữ nguyên'
);

select * from finish();
rollback;
