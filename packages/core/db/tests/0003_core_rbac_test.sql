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

-- ── ADR-038 (21/08/2026) — alias ĐÃ BỎ, và bỏ hẳn khỏi kho ─────────────────
-- Hai assertion cũ ở đây khoá hợp đồng của `core.issue_embed_alias` (gọi hai lần trả
-- cùng một alias · mỗi app một dải riêng). Chủ đầu tư quyết app ngoài dùng `user_id`
-- thật, nên hai hàm cấp alias bị DROP trong `0061`. Không xoá chỗ này mà LẬT: khẳng
-- định chúng không còn tồn tại. Lý do phải có người canh cả chiều "đã bỏ": một hàm
-- SECURITY DEFINER được dựng lại lặng lẽ là một đường ghi thứ hai vào `core.id_mappings`
-- mà không ADR nào nói tới.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core' and p.proname like 'issue_embed_alias%'),
  0,
  'ADR-038 — core.issue_embed_alias* KHÔNG còn tồn tại; app ngoài gọi tên em bằng user_id thật (0061)'
);

-- Chiều ngược, quan trọng ngang: bảng ánh xạ VẪN CÒN. `0061` ngừng cấp alias mới chứ
-- không xoá sổ cũ — xoá là mất khả năng đọc lại lịch sử của các connector khác
-- (`tutor`, `cor`…) vốn dùng chung bảng này và không liên quan gì tới app nhúng.
select has_table(
  'core', 'id_mappings',
  'core.id_mappings VẪN còn — 0061 chỉ ngừng cấp alias cho app nhúng, không đụng connector khác'
);

select * from finish();
rollback;
