-- pgTAP — check-in cảm xúc + điểm danh (§3, §9, ADR-007)
begin;
select plan(7);
select test_support.seed_basic();

-- ── §9: double-tap không tạo bản ghi đôi ───────────────────────────────────
-- Đây là ca thật: mạng trường chập chờn, học sinh bấm hai lần.
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, mood, status)
     values ('70000000-0000-0000-0000-000000000001', current_date, 3, 'present') $$,
  'Check-in lần đầu'
);
select throws_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, mood, status)
     values ('70000000-0000-0000-0000-000000000001', current_date, 3, 'present') $$,
  '23505', null,
  'Bấm lần hai trong ngày bị chặn bởi khóa duy nhất (§9)'
);
select is(
  (select count(*)::int from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001'
      and occurred_on = current_date),
  1,
  'Vẫn đúng một dòng'
);

-- Check-out là bản ghi khác, không đụng nhau.
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, status)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'out', 'present') $$,
  'Check-out cùng ngày là bản ghi riêng'
);

-- ── Mood chỉ có 4 màu ──────────────────────────────────────────────────────
select throws_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, mood)
     values ('70000000-0000-0000-0000-000000000002', current_date, 9) $$,
  '23514', null,
  'Mood ngoài thang 1–4 bị chặn'
);

-- ── ADR-007: bản gửi muộn không tự tính chuyên cần ─────────────────────────
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, status, source)
     values ('70000000-0000-0000-0000-000000000002', current_date - 1, 'queued_late', 'offline_queue') $$,
  'Bản đồng bộ muộn ghi được với trạng thái queued_late'
);
select is(
  (select status from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000002'
      and occurred_on = current_date - 1),
  'queued_late',
  'Bản muộn KHÔNG tự thành present — chờ GVCN xác nhận (ADR-007)'
);

select * from finish();
rollback;
