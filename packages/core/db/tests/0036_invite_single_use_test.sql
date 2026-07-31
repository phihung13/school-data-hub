-- pgTAP — mã mời phụ huynh DÙNG MỘT LẦN + cửa sổ nhắc lại 15 phút (0036, ADR-024)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0036_invite_single_use_test.sql
--
-- Bài này kiểm đúng ranh giới mà ADR-024 vẽ ra, nên phải chứng minh CẢ HAI phía:
--   · phía thuận tiện — bấm hai lần / retry mạng trong 15 phút vẫn vào được (§9);
--   · phía chặn       — quá 15 phút, hoặc mã bị thu hồi, thì mã là giấy lộn.
-- Chỉ kiểm một phía là bỏ lọt đúng thứ 0036 sinh ra để sửa.
--
-- GHI CHÚ KỸ THUẬT: cả file chạy trong MỘT transaction nên `now()` đứng yên. Vì
-- vậy không thể "chờ" 15 phút — mọi mốc thời gian được dựng bằng cách sửa thẳng
-- `redeemed_at` lùi về quá khứ. Cũng vì vậy hai lời gọi đổi mã phải nằm ở HAI câu
-- lệnh riêng (qua bảng tạm): gộp vào một câu thì các nhánh CTE dùng chung một
-- snapshot, lượt tăng `redeemed_count` thứ hai không nhìn thấy lượt thứ nhất và
-- con số đếm được sẽ tuỳ kế hoạch thực thi.

begin;
select plan(18);
select test_support.seed_basic();

-- ── Cấu trúc ────────────────────────────────────────────────────────────────
select has_column('core', 'parent_invite_codes', 'redeemed_count', 'Có cột đếm lượt đổi mã');
select has_column('core', 'parent_invite_codes', 'revoked_at',     'Có cột thu hồi mã');
select has_column('core', 'parent_invite_codes', 'full_name',      'Có cột tên phụ huynh do GVCN nhập');

-- ── Lần đổi đầu: tạo tài khoản, LẤY ĐÚNG TÊN GVCN nhập ──────────────────────
insert into core.parent_invite_codes (code, student_id, expires_at, created_by, full_name)
     values ('SU0001', '70000000-0000-0000-0000-000000000002',
             now() + interval '7 days', '40000000-0000-0000-0000-000000000006',
             'Chị Trần Thị Hoa');

select lives_ok(
  $$ select core.redeem_parent_invite_code('su0001') $$,
  'Đổi mã lần đầu (chữ thường vẫn khớp) không lỗi'
);
select is(
  (select u.full_name
     from core.users u
     join core.parent_invite_codes c on c.redeemed_by = u.id
    where c.code = 'SU0001'),
  'Chị Trần Thị Hoa',
  'Tài khoản mới mang đúng tên GVCN nhập, không phải chuỗi viết chết "Phụ huynh"'
);

-- ── Trong cửa sổ 15 phút: nhận lại đúng người cũ (§9, retry mạng/bấm hai lần) ─
create temporary table t_redeem (n int primary key, uid uuid) on commit drop;
insert into t_redeem values (1, core.redeem_parent_invite_code('SU0001'));
insert into t_redeem values (2, core.redeem_parent_invite_code('SU0001'));

select is(
  (select uid from t_redeem where n = 1),
  (select uid from t_redeem where n = 2),
  'Trong cửa sổ 15 phút, đổi lại trả về ĐÚNG auth_uid cũ (§9)'
);
select is(
  (select count(*)::int from core.parent_students ps
     join core.parents p on p.id = ps.parent_id
    where ps.student_id = '70000000-0000-0000-0000-000000000002'),
  1,
  'Nhận lại trong cửa sổ KHÔNG sinh tài khoản phụ huynh thứ hai'
);
select is(
  (select redeemed_count from core.parent_invite_codes where code = 'SU0001'),
  3,
  'Mỗi lượt đổi thành công đều được đếm (1 lần đầu + 2 lần nhận lại)'
);

-- ── Cửa sổ tính từ lần đổi ĐẦU, không gia hạn theo lần dùng cuối ─────────────
-- Nếu gia hạn thì mã sống vô hạn miễn cứ 15 phút bấm một lần — tức là dựng lại
-- đúng lỗ hổng 0013 bằng một cách vòng vo hơn.
update core.parent_invite_codes
   set redeemed_at = now() - interval '10 minutes'
 where code = 'SU0001';
select lives_ok(
  $$ select core.redeem_parent_invite_code('SU0001') $$,
  'Mốc 10 phút vẫn còn trong cửa sổ — nhận lại được'
);
select ok(
  (select redeemed_at from core.parent_invite_codes where code = 'SU0001')
    < now() - interval '9 minutes',
  'redeemed_at giữ nguyên mốc lần đổi đầu (cửa sổ KHÔNG được gia hạn)'
);

-- ── Quá cửa sổ: mã chết ─────────────────────────────────────────────────────
update core.parent_invite_codes
   set redeemed_at = now() - interval '20 minutes'
 where code = 'SU0001';
select throws_ok(
  $$ select core.redeem_parent_invite_code('SU0001') $$,
  '28000',
  null,
  'Quá 15 phút: mã đã dùng bị TỪ CHỐI (lỗ hổng 0013 đã đóng)'
);
select is(
  (select count(*)::int from core.parent_students ps
     join core.parents p on p.id = ps.parent_id
    where ps.student_id = '70000000-0000-0000-0000-000000000002'),
  1,
  'Lần bị từ chối không để lại tài khoản/quan hệ rác'
);

-- ── Thu hồi: chết ngay, kể cả khi chưa ai dùng và chưa hết hạn ───────────────
insert into core.parent_invite_codes (code, student_id, expires_at, created_by, revoked_at, revoked_by)
     values ('SU0002', '70000000-0000-0000-0000-000000000002',
             now() + interval '7 days', '40000000-0000-0000-0000-000000000006',
             now(), '40000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ select core.redeem_parent_invite_code('SU0002') $$,
  '28000',
  null,
  'Mã bị thu hồi bị từ chối dù còn hạn và chưa ai dùng'
);

-- ── Mặc định cũ vẫn còn: không nhập tên thì vẫn là "Phụ huynh" ───────────────
insert into core.parent_invite_codes (code, student_id, expires_at, created_by)
     values ('SU0003', '70000000-0000-0000-0000-000000000001',
             now() + interval '7 days', '40000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select core.redeem_parent_invite_code('SU0003') $$,
  'Mã không có tên phụ huynh vẫn đổi được (cột full_name không chặn luồng cũ)'
);
select is(
  (select u.full_name
     from core.users u
     join core.parent_invite_codes c on c.redeemed_by = u.id
    where c.code = 'SU0003'),
  'Phụ huynh',
  'Không nhập tên thì rơi về mặc định "Phụ huynh"'
);

-- ── Hai nhánh từ chối cũ giữ nguyên mã lỗi (route đọc bằng SQLSTATE) ─────────
insert into core.parent_invite_codes (code, student_id, expires_at)
     values ('SU0004', '70000000-0000-0000-0000-000000000001', now() - interval '1 day');
select throws_ok(
  $$ select core.redeem_parent_invite_code('SU0004') $$,
  '22000',
  null,
  'Mã hết hạn vẫn ném data_exception (22000) như 0013'
);
select throws_ok(
  $$ select core.redeem_parent_invite_code('ZZZZZZ') $$,
  'P0002',
  null,
  'Mã không tồn tại vẫn ném no_data_found (PL/pgSQL: P0002) như 0013'
);

-- ── Bảng vẫn đóng với người đã đăng nhập (kiểm lại sau khi ALTER thêm cột) ───
select test_support.login_as('90000000-0000-0000-0000-000000000005'); -- Minh
select throws_ok(
  $$ select 1 from core.parent_invite_codes $$,
  '42501',
  null,
  'Thêm cột không vô tình mở quyền: authenticated vẫn không đọc được bảng mã mời'
);
select test_support.logout();

select * from finish();
rollback;
