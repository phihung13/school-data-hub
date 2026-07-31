-- pgTAP — care.flags.origin (ADR-016)
-- Câu hỏi bài test trả lời: "nạp bù 3 tháng dữ liệu có làm care team ngập không?"

begin;
select plan(8);
select test_support.seed_basic();

select has_column('care', 'flags', 'origin', 'care.flags có cột origin');
select col_has_check('care', 'flags', 'origin', 'origin có CHECK ràng buộc giá trị');
select col_default_is('care', 'flags', 'origin', 'live',
  'Mặc định là live — quét thường không phải khai gì thêm');

-- ── Chỉ nhận hai giá trị ────────────────────────────────────────────────────
select throws_ok(
  $$ insert into care.flags (student_id, rule_code, as_of_date, origin)
     values ('70000000-0000-0000-0000-000000000001', 'A_ATTENDANCE', current_date, 'linh tinh') $$,
  '23514',
  null,
  'Giá trị origin lạ bị chặn'
);

-- ── Dữ liệu mẫu: Minh có một cờ thường và một cờ sinh từ nạp bù ─────────────
insert into care.flags (id, student_id, rule_code, as_of_date, origin) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
   'A_ATTENDANCE', current_date, 'live'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001',
   'A_ATTENDANCE', current_date - 60, 'backfill');

insert into care.care_cases (id, student_id, tier, status)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        '70000000-0000-0000-0000-000000000001', 2, 'open');

-- ── Cờ live gắn vào ca bình thường ──────────────────────────────────────────
select lives_ok(
  $$ insert into care.care_case_flags (case_id, flag_id)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'Cờ live gắn vào care_case bình thường'
);

-- ── Cờ backfill bị chặn ở tầng database ─────────────────────────────────────
-- Chặn ở đây chứ không chỉ ở tầng ứng dụng: luật này quan trọng tới mức
-- không được phụ thuộc vào việc người viết code nhớ kiểm tra.
select throws_ok(
  $$ insert into care.care_case_flags (case_id, flag_id)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514',
  null,
  'Cờ backfill KHÔNG gắn được vào care_case — dù gọi từ đâu'
);

-- ── §9: chạy lại vẫn no-op ──────────────────────────────────────────────────
select throws_ok(
  $$ insert into care.flags (student_id, rule_code, as_of_date, origin)
     values ('70000000-0000-0000-0000-000000000001', 'A_ATTENDANCE', current_date, 'live') $$,
  '23505',
  null,
  'UNIQUE(student, rule, date) giữ nguyên — chạy lại engine là no-op (§9)'
);

-- ── Kiểm chứng bằng con số: nạp bù không sinh ca mới ────────────────────────
select is(
  (select count(*)::int
     from care.care_case_flags ccf
     join care.flags f on f.id = ccf.flag_id
    where f.origin = 'backfill'),
  0,
  'Không có cờ backfill nào nằm trong bất kỳ care_case nào'
);

select * from finish();
rollback;
