-- pgTAP — đường ghi GĐ1 (0014): checkins, help_requests, care_cases, interventions
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0014_mutation_policies_test.sql

begin;
select plan(12);
select test_support.seed_basic();

-- 0047 (ADR-027 bản 2): ghi TÂM TRẠNG đòi phiếu đồng ý còn hiệu lực của người đại diện —
-- `checkins_insert_self` nay là `is_me AND (mood is null OR core.has_student_consent(...))`.
-- Bài này kiểm ĐƯỜNG GHI chứ không kiểm cổng đồng ý (cổng có bài riêng: 0046/0047), nên
-- dựng sẵn phiếu cho Minh bằng vai chủ schema. KHÔNG bỏ cột mood khỏi các câu dưới: chính
-- cặp "có mood / không mood" là thứ phân biệt hai lời hứa khác nhau ở đây.
insert into core.consent_records (user_id, student_id, terms_version_id, decision, content_hash)
select '40000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001',
       tv.id, 'granted', tv.content_hash
  from core.terms_versions tv where tv.version = 1;

-- ── attendance.checkins: chỉ tự check-in cho chính mình ─────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 4, 'present') $$,
  'Minh tự check-in cho chính mình — cho phép'
);
select throws_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status)
     values ('70000000-0000-0000-0000-000000000002', current_date, 'in', 4, 'present') $$,
  null, null,
  'Minh KHÔNG check-in hộ Bình'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- GVCN Cô Lan
select throws_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status)
     values ('70000000-0000-0000-0000-000000000001', current_date + 1, 'in', 3, 'present') $$,
  null, null,
  'GVCN KHÔNG tự ý check-in hộ học sinh (GĐ1 chưa mở điểm danh tay)'
);
select test_support.logout();

-- ── Xác nhận gửi muộn: chỉ homeroom, chỉ từ queued_late ─────────────────────
insert into attendance.checkins (student_id, occurred_on, kind, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date - 5, 'in', 'queued_late', 'offline_queue');

-- RLS trên UPDATE lọc theo USING: hàng không khớp bị bỏ qua ÂM THẦM (0 dòng),
-- KHÔNG ném lỗi (khác INSERT/hàm SECURITY DEFINER ở trên) — đây là ngữ nghĩa
-- chuẩn của Postgres RLS, không phải lỗ hổng. Test đúng phải kiểm 0 dòng đổi.
select test_support.login_as('90000000-0000-0000-0000-000000000006'); -- Cô Hạnh, GVCN 6A2 (không phải lớp Minh)
select lives_ok(
  $$ update attendance.checkins set status = 'present'
     where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date - 5 $$,
  'UPDATE không lỗi (RLS lọc theo USING, không ném exception)'
);
select test_support.logout();

select is(
  (select status from attendance.checkins
     where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date - 5),
  'queued_late',
  'GVCN lớp khác KHÔNG xác nhận được gửi muộn của Minh — dòng vẫn nguyên queued_late (0 dòng bị đổi)'
);

select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, đúng homeroom
select lives_ok(
  $$ update attendance.checkins set status = 'present'
     where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date - 5 $$,
  'Cô Lan (đúng homeroom) xác nhận gửi muộn — cho phép'
);
select test_support.logout();

-- ── help_requests: tự bấm cho chính mình ────────────────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select lives_ok(
  $$ insert into attendance.help_requests (student_id, requested_on) values
     ('70000000-0000-0000-0000-000000000001', current_date) $$,
  'Minh tự bấm "cần gặp thầy cô" — cho phép'
);
select test_support.logout();
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- GVCN
select throws_ok(
  $$ insert into attendance.help_requests (student_id, requested_on) values
     ('70000000-0000-0000-0000-000000000001', current_date + 1) $$,
  null, null,
  'GVCN KHÔNG bấm hộ nút cần gặp thầy cô'
);
select test_support.logout();

-- ── care.care_cases: chỉ trong phạm vi can_see_care ──────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000002'); -- Thầy Nam, chỉ 'teacher' (không homeroom/counselor)
select throws_ok(
  $$ insert into care.care_cases (id, student_id, owner_id) values
     ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002') $$,
  null, null,
  'Giáo viên bộ môn (không phải homeroom/counselor) KHÔNG mở được case'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan, homeroom của Minh
select lives_ok(
  $$ insert into care.care_cases (id, student_id, owner_id) values
     ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001') $$,
  'Cô Lan (homeroom) mở case cho Minh — cho phép'
);

-- ── care.interventions: actor_id phải đúng người đang đăng nhập ─────────────
select throws_ok(
  format(
    $$ insert into care.interventions (case_id, actor_id, action) values
       ('80000000-0000-0000-0000-000000000001', %L, 'Đã trò chuyện') $$,
    '40000000-0000-0000-0000-000000000003' -- giả actor_id là Cô Mai trong khi đang đăng nhập là Cô Lan
  ),
  null, null,
  'KHÔNG ghi can thiệp dưới tên người khác (actor_id phải khớp current_user_id())'
);
select lives_ok(
  $$ insert into care.interventions (case_id, actor_id, action) values
     ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Đã trò chuyện với Minh') $$,
  'Cô Lan ghi can thiệp đúng tên mình — cho phép'
);
select test_support.logout();

select * from finish();
rollback;
