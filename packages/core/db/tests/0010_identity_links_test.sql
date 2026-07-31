-- pgTAP — core.identity_links (ADR-016)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0010_identity_links_test.sql
-- Nghĩa vụ theo 02-database.md: mỗi policy test CẢ chiều cho phép LẪN chiều từ chối.

begin;
select plan(11);

-- ── Cấu trúc ────────────────────────────────────────────────────────────────
select has_table('core', 'identity_links', 'Bảng core.identity_links tồn tại');
select col_is_fk('core', 'identity_links', 'user_id', 'user_id FK về core.users');
select ok(
  (select relrowsecurity from pg_class
    where oid = 'core.identity_links'::regclass),
  'RLS đã bật trên core.identity_links'
);

-- ── Dữ liệu mẫu ─────────────────────────────────────────────────────────────
insert into core.users (id, email, full_name, status)
values ('11111111-1111-1111-1111-111111111111', 'gv.lan@truongvietanh.com', 'Cô Lan',  'active'),
       ('22222222-2222-2222-2222-222222222222', 'gv.hoa@truongvietanh.com', 'Cô Hoa', 'active');

-- ── §9: idempotent ──────────────────────────────────────────────────────────
select lives_ok(
  $$ select core.link_identity('moodle', 'mdl-4821', '11111111-1111-1111-1111-111111111111') $$,
  'Liên kết lần đầu thành công'
);
select lives_ok(
  $$ select core.link_identity('moodle', 'mdl-4821', '11111111-1111-1111-1111-111111111111') $$,
  'Gọi lại lần hai không lỗi (§9)'
);
select is(
  (select count(*)::int from core.identity_links where system = 'moodle'),
  1,
  'Gọi hai lần vẫn chỉ một dòng — không sinh bản ghi đôi (§9)'
);

-- ── Chiều 1: một mã ngoài không thuộc hai người ─────────────────────────────
select throws_ok(
  $$ select core.link_identity('moodle', 'mdl-4821', '22222222-2222-2222-2222-222222222222') $$,
  '23505',
  null,
  'Mã ngoài đã map người khác → chặn, không tự gán lại (§8)'
);

-- ── Chiều 2: một người không có hai tài khoản trong cùng hệ ─────────────────
-- Đây là ca mà bản spec cũ bỏ sót: sinh tài khoản Moodle trùng một cách âm thầm.
select throws_ok(
  $$ select core.link_identity('moodle', 'mdl-9999', '11111111-1111-1111-1111-111111111111') $$,
  '23505',
  null,
  'Người đã có tài khoản trong hệ đó → chặn tài khoản thứ hai'
);

-- Hệ ngoài KHÁC thì vẫn cho phép — không được chặn nhầm.
select lives_ok(
  $$ select core.link_identity('canteen', 'ct-77', '11111111-1111-1111-1111-111111111111') $$,
  'Cùng người, hệ ngoài khác → vẫn liên kết được'
);

-- ── RLS: chiều từ chối ──────────────────────────────────────────────────────
set local role authenticated;
select is_empty(
  $$ select 1 from core.identity_links $$,
  'authenticated KHÔNG đọc được sổ đăng nhập (deny by default)'
);
select throws_ok(
  $$ insert into core.identity_links (system, external_id, user_id)
     values ('moodle', 'mdl-hack', '22222222-2222-2222-2222-222222222222') $$,
  null, null,
  'authenticated KHÔNG tự chèn được liên kết'
);
reset role;

select * from finish();
rollback;
