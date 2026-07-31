-- pgTAP — vai trò có phạm vi, phân công lớp, sổ đối chiếu mã ngoài, alias app ngoài
begin;
select plan(8);
select test_support.seed_basic();

-- ── Một lớp chỉ một GVCN ───────────────────────────────────────────────────
-- Hai người cùng nhận chủ nhiệm = không ai thực sự chịu trách nhiệm.
select throws_ok(
  $$ insert into core.class_assignments (teacher_id, class_id, assignment_role)
     values ('50000000-0000-0000-0000-000000000002',
             '30000000-0000-0000-0000-000000000001', 'homeroom') $$,
  '23505', null,
  'Lớp đã có GVCN thì không nhận người thứ hai'
);

-- Giáo viên bộ môn thì nhiều người cùng một lớp là bình thường.
select lives_ok(
  $$ insert into core.class_assignments (teacher_id, class_id, assignment_role, subject)
     values ('50000000-0000-0000-0000-000000000003',
             '30000000-0000-0000-0000-000000000001', 'subject', 'Văn') $$,
  'Nhiều giáo viên bộ môn trong một lớp thì được'
);

-- ── Hàm phạm vi trả lời đúng ───────────────────────────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1
select ok(core.is_homeroom_of('70000000-0000-0000-0000-000000000001'),
  'Cô Lan là chủ nhiệm của Minh');
select ok(not core.is_homeroom_of('70000000-0000-0000-0000-000000000002'),
  'Cô Lan KHÔNG phải chủ nhiệm của Bình (lớp khác)');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000003');  -- cô Mai, tâm lý cụm
select ok(core.in_my_cluster('70000000-0000-0000-0000-000000000002'),
  'Tâm lý cụm phủ cả hai lớp trong cùng cơ sở');
select test_support.logout();

-- ── §1: sổ đối chiếu là sổ DỮ LIỆU, chỉ học sinh ───────────────────────────
select lives_ok(
  $$ insert into core.id_mappings (system, external_id, student_id)
     values ('tutor', 'tut-9911', '70000000-0000-0000-0000-000000000001') $$,
  'Map mã Tutor với học sinh'
);

-- ── ADR-017: alias do Hub sinh, idempotent, mỗi app một dải ────────────────
select is(
  core.issue_embed_alias('fitness', '70000000-0000-0000-0000-000000000001'),
  core.issue_embed_alias('fitness', '70000000-0000-0000-0000-000000000001'),
  'Gọi hai lần trả cùng một alias (§9)'
);

select isnt(
  core.issue_embed_alias('fitness', '70000000-0000-0000-0000-000000000001'),
  core.issue_embed_alias('canteen', '70000000-0000-0000-0000-000000000001'),
  'Cùng một em, hai app khác nhau -> hai alias khác nhau: không ghép chéo được (ADR-017)'
);

select * from finish();
rollback;
