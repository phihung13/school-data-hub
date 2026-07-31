-- pgTAP — 0026: nền dữ liệu của router care.
--   · ngưỡng khai được theo từng cơ sở (§6, mệnh lệnh 7)
--   · E_MOOD khai được cả hai cách đếm, mặc định streak (quyết định 31/07/2026)
--   · ghi can thiệp hai lần ra một dòng (§9)
--   · đóng hồ sơ được, và chỉ theo một chiều
--   · học sinh KHÔNG tự tắt được tín hiệu khẩn của chính mình
--   · tín hiệu "cần gặp thầy cô" không còn bị nuốt khi em không check-in hôm đó
--
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0026_care_router_test.sql

begin;
select plan(19);
select test_support.seed_basic();

-- ── 1. Danh mục mã luật + khoá mới của bảng ngưỡng ──────────────────────────
select has_table('care', 'rules', 'care.rules tồn tại — mã luật tách khỏi bảng ngưỡng');
select col_is_pk('care', 'thresholds', 'id',
  'care.thresholds nhận khoá chính thay thế (id) — rule_code không còn khoá một dòng một luật');

select lives_ok(
  $$ insert into care.thresholds (rule_code, params, school_id)
     values ('E_MOOD', '{"negative_days_streak": 3, "mode": "streak"}'::jsonb,
             '20000000-0000-0000-0000-000000000001') $$,
  'Khai được ngưỡng RIÊNG cho một cơ sở — cột school_id (0005) từ nay có tác dụng thật'
);
select throws_ok(
  $$ insert into care.thresholds (rule_code, params) values ('E_MOOD', '{}'::jsonb) $$,
  '23505', null,
  'KHÔNG có hai dòng ngưỡng toàn hệ cùng một luật (nulls not distinct) — không mơ hồ "bản nào đang chạy"'
);

select is(
  (care.resolve_threshold('E_MOOD', '20000000-0000-0000-0000-000000000001') ->> 'negative_days_streak'),
  '3',
  'Cơ sở Q7 nhận ngưỡng RIÊNG của mình (3), không phải ngưỡng toàn hệ'
);
select is(
  (care.resolve_threshold('E_MOOD', '20000000-0000-0000-0000-000000000002') ->> 'negative_days_streak'),
  '5',
  'Cơ sở chưa khai riêng thì rơi về ngưỡng toàn hệ (5)'
);
select is(
  (care.resolve_threshold('E_MOOD') ->> 'mode'),
  'streak',
  'Mặc định là chuỗi LIÊN TIẾP — đúng quyết định nghiệp vụ 31/07/2026'
);

-- ── 2. §9 — ghi can thiệp hai lần ra một dòng ───────────────────────────────
insert into care.care_cases (id, student_id, owner_id) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001');

insert into care.interventions (case_id, actor_id, action, client_mutation_id) values
  ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'Đã trò chuyện', '11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ insert into care.interventions (case_id, actor_id, action, client_mutation_id) values
     ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
      'Đã trò chuyện', '11111111-1111-1111-1111-111111111111') $$,
  '23505', null,
  'Double-tap "Ghi can thiệp" (cùng client_mutation_id) KHÔNG sinh dòng thứ hai (§9)'
);
select lives_ok(
  $$ insert into care.interventions (case_id, actor_id, action) values
     ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Gọi phụ huynh'),
     ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Gọi phụ huynh') $$,
  'Dòng cũ (client_mutation_id NULL) vẫn ghi được — index là partial, không khoá nhầm nhật ký cũ'
);

-- ── 3. Đóng hồ sơ: được, và chỉ một chiều ───────────────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh, học sinh
with u as (
  update care.care_cases set status = 'closed', closed_at = now()
   where id = '80000000-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from u), 0,
  'HỌC SINH không đóng được hồ sơ chăm sóc của mình');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, GVCN
with u as (
  update care.care_cases set status = 'closed', closed_at = now()
   where id = '80000000-0000-0000-0000-000000000001' and status = 'open' returning 1
)
select is((select count(*)::int from u), 1,
  'GVCN đóng được hồ sơ — cờ tắt đi được, buồng lái không đầy cờ chết');

with u as (
  update care.care_cases set status = 'open', closed_at = null
   where id = '80000000-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from u), 0,
  'KHÔNG mở lại được qua đường này (WITH CHECK ép status mới là closed)');
select test_support.logout();

-- ── 4. Tín hiệu khẩn: chỉ người lớn trong phạm vi care mới tắt được ─────────
insert into attendance.help_requests (student_id, requested_on, topic, urgency)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'nha', 'urgent');

select is(
  has_column_privilege('authenticated', 'attendance.help_requests', 'requested_on', 'update'),
  false,
  'KHÔNG ai sửa được ngày của yêu cầu "cần gặp thầy cô"'
);

select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
with u as (
  update attendance.help_requests
     set handled_by = core.current_user_id(), handled_at = now()
   where student_id = '70000000-0000-0000-0000-000000000001' and requested_on = current_date
  returning 1
)
select is((select count(*)::int from u), 0,
  'HỌC SINH không tự đánh dấu "đã xử lý" — không tự tắt được tín hiệu khẩn của chính mình');
select test_support.logout();

select is(
  (select handled_at is null from attendance.help_requests
    where student_id = '70000000-0000-0000-0000-000000000001' and requested_on = current_date),
  true,
  'Yêu cầu vẫn đang mở sau lần thử của học sinh'
);

select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan
with u as (
  update attendance.help_requests
     set handled_by = core.current_user_id(), handled_at = now()
   where student_id = '70000000-0000-0000-0000-000000000001'
     and requested_on = current_date and handled_at is null
  returning 1
)
select is((select count(*)::int from u), 1,
  'GVCN đánh dấu "đã gặp em rồi" — 1 dòng');
select test_support.logout();

-- ── 5. View tín hiệu cảm xúc: không nuốt tín hiệu khẩn, đếm đúng chuỗi ──────
-- Bình (6A2) KHÔNG check-in hôm nay nhưng bấm "cần gặp thầy cô" — đúng ca mà bản cũ
-- (lấy checkins làm gốc, nối theo requested_on = occurred_on) làm tín hiệu biến mất.
insert into attendance.help_requests (student_id, requested_on, urgency)
     values ('70000000-0000-0000-0000-000000000002', current_date, 'urgent');
select is(
  (select help_requested from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000002'),
  true,
  'Em KHÔNG check-in hôm đó mà bấm "cần gặp thầy cô" vẫn hiện tín hiệu khẩn (lỗi nuốt tín hiệu đã hết)'
);

-- Minh: mood theo ngày, mới nhất trước — 1, 1, 1, 3(tốt), 1, 1
-- ⇒ đếm trong cửa sổ = 5 ngày xấu, nhưng chuỗi LIÊN TIẾP chỉ có 3.
insert into attendance.checkins (student_id, occurred_on, kind, mood, status) values
  ('70000000-0000-0000-0000-000000000001', current_date,     'in', 1, 'present'),
  ('70000000-0000-0000-0000-000000000001', current_date - 1, 'in', 1, 'present'),
  ('70000000-0000-0000-0000-000000000001', current_date - 2, 'in', 1, 'present'),
  ('70000000-0000-0000-0000-000000000001', current_date - 3, 'in', 3, 'present'),
  ('70000000-0000-0000-0000-000000000001', current_date - 4, 'in', 1, 'present'),
  ('70000000-0000-0000-0000-000000000001', current_date - 5, 'in', 1, 'present');

select is(
  (select negative_days::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000001'),
  5,
  'negative_days đếm mọi ngày xấu trong cửa sổ = 5'
);
select is(
  (select negative_streak::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000001'),
  3,
  'negative_streak chỉ đếm chuỗi LIÊN TIẾP = 3 — hai con số phải khác nhau, nếu bằng nhau là streak giả'
);

select * from finish();
rollback;
