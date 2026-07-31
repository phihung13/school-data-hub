-- pgTAP — cờ, hồ sơ can thiệp, ngưỡng (§6, §9, luật gộp cờ)
begin;
select plan(7);
select test_support.seed_basic();

-- ── §6: ngưỡng nằm trong bảng, không trong code ────────────────────────────
select is(
  (select count(*)::int from care.thresholds where active),
  6,
  'Đủ 6 rule ngưỡng: A · B · C_MASTERY · C_CEFR · E_MOOD · E_URGENT (§6)'
);
select is(
  (select params->>'min_rate' from care.thresholds where rule_code = 'A_ATTENDANCE'),
  '0.90',
  'Ngưỡng chuyên cần đọc được từ bảng — đổi không cần deploy'
);

-- ── §9: chạy lại engine trong đêm là no-op ─────────────────────────────────
select lives_ok(
  $$ insert into care.flags (student_id, rule_code, as_of_date)
     values ('70000000-0000-0000-0000-000000000001', 'A_ATTENDANCE', current_date) $$,
  'Sinh cờ lần đầu'
);
select throws_ok(
  $$ insert into care.flags (student_id, rule_code, as_of_date)
     values ('70000000-0000-0000-0000-000000000001', 'A_ATTENDANCE', current_date) $$,
  '23505', null,
  'Chạy lại engine không sinh cờ đôi (§9)'
);

-- ── Một em một đầu mối ─────────────────────────────────────────────────────
select lives_ok(
  $$ insert into care.care_cases (id, student_id, owner_id, tier)
     values ('80000000-0000-0000-0000-000000000001',
             '70000000-0000-0000-0000-000000000001',
             '40000000-0000-0000-0000-000000000001', 2) $$,
  'Mở hồ sơ can thiệp cho Minh'
);
select throws_ok(
  $$ insert into care.care_cases (student_id, owner_id, tier)
     values ('70000000-0000-0000-0000-000000000001',
             '40000000-0000-0000-0000-000000000003', 3) $$,
  '23505', null,
  'Em đã có hồ sơ đang mở thì không mở hồ sơ thứ hai — nhiều cờ vẫn một đầu mối'
);

-- Đóng hồ sơ cũ rồi mới mở được hồ sơ mới.
select lives_ok(
  $$ update care.care_cases set status = 'closed', closed_at = now()
      where id = '80000000-0000-0000-0000-000000000001';
     insert into care.care_cases (student_id, owner_id, tier)
     values ('70000000-0000-0000-0000-000000000001',
             '40000000-0000-0000-0000-000000000003', 3) $$,
  'Đóng hồ sơ cũ rồi mở hồ sơ mới thì được'
);

select * from finish();
rollback;
