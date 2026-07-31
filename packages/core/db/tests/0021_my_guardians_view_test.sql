-- pgTAP — core.v_my_guardians (0021)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0021_my_guardians_view_test.sql
--
-- View này được `grant select ... to authenticated`, tức MỌI tài khoản đăng nhập
-- đều gọi được. Thứ duy nhất giữ nó an toàn là mệnh đề
-- `where st.user_id = core.current_user_id()` trong thân view — view chạy bằng
-- quyền chủ sở hữu (PostgreSQL 16 mặc định security definer) nên RLS của
-- core.parents/core.users KHÔNG đỡ thêm lớp nào. Gõ nhầm một chữ ở mệnh đề đó là
-- lộ danh bạ phụ huynh toàn trường mà không có cảnh báo nào.
--
-- Ba chiều phải khoá: đúng người → thấy đúng phần mình; sai vai → rỗng;
-- không có phiên → rỗng (fail closed, không phải fail open ra cả bảng).

begin;
select plan(4);
select test_support.seed_basic();

-- ── Chiều cho phép: học sinh tra phụ huynh của chính mình ───────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select is(
  (select count(*)::int from core.v_my_guardians),
  1,
  'Minh thấy đúng 1 dòng — không phải danh bạ phụ huynh toàn trường'
);
select is(
  (select full_name || '|' || relation from core.v_my_guardians),
  'Phụ huynh của Minh|guardian',
  'Dòng thấy được đúng là phụ huynh đã gắn với Minh, kèm quan hệ'
);
select test_support.logout();

-- ── Chiều từ chối: GVCN không phải học sinh nên không có "phụ huynh của mình" ─
select test_support.login_as('90000000-0000-0000-0000-000000000001'); -- Cô Lan
select is_empty(
  $$ select * from core.v_my_guardians $$,
  'GVCN gọi view → rỗng (view chỉ trả lời câu hỏi của học sinh về chính em)'
);
select test_support.logout();

-- ── Không có phiên: claim.sub rỗng → current_user_id() NULL ─────────────────
-- Đây là ca nguy hiểm nhất: nếu WHERE bị viết hỏng, NULL sẽ khớp mọi dòng.
select is_empty(
  $$ select * from core.v_my_guardians $$,
  'Chưa đăng nhập (không có claim.sub) → rỗng, không phải trả về toàn bộ bảng'
);

select * from finish();
rollback;
