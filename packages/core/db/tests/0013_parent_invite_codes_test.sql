-- pgTAP — core.parent_invite_codes + redeem_parent_invite_code (0013)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0013_parent_invite_codes_test.sql

begin;
select plan(9);
select test_support.seed_basic();

select has_table('core', 'parent_invite_codes', 'Bảng core.parent_invite_codes tồn tại');
select ok(
  (select relrowsecurity from pg_class where oid = 'core.parent_invite_codes'::regclass),
  'RLS đã bật trên core.parent_invite_codes'
);

insert into core.parent_invite_codes (code, student_id, expires_at, created_by)
     values ('ABC123', '70000000-0000-0000-0000-000000000002',
             now() + interval '7 days', '40000000-0000-0000-0000-000000000006');

-- ── Chiều từ chối: authenticated không đọc/ghi thẳng bảng ───────────────────
-- Khác core.identity_links (0010): bảng đó CÓ grant SELECT nên RLS lọc còn 0
-- dòng (is_empty). Ở đây KHÔNG có grant nào cả (deny ở tầng quyền, chặt hơn) —
-- nên truy vấn thẳng bảng phải NÉM lỗi permission denied, không phải trả rỗng.
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select throws_ok(
  $$ select 1 from core.parent_invite_codes $$,
  '42501',
  null,
  'authenticated KHÔNG đọc được bảng mã mời (không có grant nào, deny chặt hơn cả RLS)'
);
select throws_ok(
  $$ insert into core.parent_invite_codes (code, student_id, expires_at)
     values ('ZZZ999', '70000000-0000-0000-0000-000000000001', now() + interval '1 day') $$,
  '42501',
  null,
  'authenticated KHÔNG tự tạo được mã mời'
);
select test_support.logout();

-- ── Redeem lần đầu: tạo tài khoản phụ huynh mới ─────────────────────────────
select lives_ok(
  $$ select core.redeem_parent_invite_code('abc123') $$, -- chữ thường vẫn khớp (upper())
  'Redeem mã hợp lệ (không phân biệt hoa/thường) không lỗi'
);
select is(
  (select count(*)::int from core.parent_students ps
     join core.parents p on p.id = ps.parent_id
    where ps.student_id = '70000000-0000-0000-0000-000000000002'),
  1,
  'Redeem xong tạo đúng 1 quan hệ phụ huynh-học sinh cho Bình'
);

-- ── §9: redeem lần hai cùng mã -> trả lại đúng người cũ, không tạo thêm ─────
select (
  with a as (select core.redeem_parent_invite_code('ABC123') as u1),
       b as (select core.redeem_parent_invite_code('ABC123') as u2)
  select ok(
    (select u1 from a) = (select u2 from b),
    'Redeem lần hai trả về đúng auth_uid cũ (§9)'
  )
);
select is(
  (select count(*)::int from core.parent_invite_codes where code = 'ABC123' and redeemed_by is not null),
  1,
  'Mã mời được đánh dấu đã dùng, vẫn chỉ một dòng'
);

-- ── Mã hết hạn bị chặn ───────────────────────────────────────────────────────
insert into core.parent_invite_codes (code, student_id, expires_at)
     values ('OLD999', '70000000-0000-0000-0000-000000000001', now() - interval '1 day');
select throws_ok(
  $$ select core.redeem_parent_invite_code('OLD999') $$,
  null, null,
  'Mã hết hạn bị từ chối'
);

select * from finish();
rollback;
