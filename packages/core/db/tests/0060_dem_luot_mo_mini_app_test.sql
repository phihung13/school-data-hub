-- pgTAP — bộ đếm lượt mở mini app cho tầng ghim (0060, ADR-034)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0060_dem_luot_mo_mini_app_test.sql
--
-- Bảng này nhỏ và không gác dữ liệu học sinh nào, nên cám dỗ là viết hai câu cho xong.
-- Bốn nhóm dưới đây tồn tại vì bốn cách nó hỏng mà không ai thấy:
--
--   1. §9 — cửa sổ nguội. Hỏng thì double-tap thổi số, và thứ tự ghim thành thứ tự
--      "app nào hay bị bấm hụt nhất". Không có bài kiểm nào khác bắt được chuyện đó.
--   2. NGƯỠNG ≥3 + CỬA SỔ 30 NGÀY. Hỏng thì hàng ghim nhảy mỗi lần người dùng thử một
--      app mới — ghim mà nhảy thì tệ hơn không ghim.
--   3. RLS. "Em nào mở app nào lúc mấy giờ" là dữ liệu hành vi của trẻ và KHÔNG nằm
--      trong lời hứa nào của trường với ai. Bảng mới trong `ops` rất dễ bị quên bật RLS.
--   4. HÌNH DẠNG — hàm ghi không được là SECURITY DEFINER, nếu không thì ba policy ở
--      trên thành trang trí.

begin;
select plan(14);
select test_support.seed_basic();

-- ═══ 1. §9 — CỬA SỔ NGUỘI 30 GIÂY ══════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, chính em

select lives_ok(
  $$ select ops.ghi_mo_mini_app('checkin') $$,
  'Học sinh tự ghi được lượt mở của mình — policy mini_app_usage_tu_ghi cho phép');

select is(
  (select so_lan from ops.mini_app_usage where app_key = 'checkin'),
  1,
  'Lượt đầu tiên đếm 1 dòng, so_lan = 1');

select ops.ghi_mo_mini_app('checkin');
select is(
  (select so_lan from ops.mini_app_usage where app_key = 'checkin'),
  1,
  '§9 — gọi LẦN HAI ngay sau đó vẫn là 1: double-tap và gửi lại beacon không thổi số');

-- Đẩy `lan_cuoi` lùi lại để giả một lượt mở THẬT sau đó, không phải chờ 30 giây thật.
update ops.mini_app_usage set lan_cuoi = now() - interval '5 minutes' where app_key = 'checkin';
select ops.ghi_mo_mini_app('checkin');
select is(
  (select so_lan from ops.mini_app_usage where app_key = 'checkin'),
  2,
  'Mở lại sau khi nguội thì CÓ đếm — cửa sổ chặn retry, không chặn lượt dùng thật');

select is(
  (select count(*)::int from ops.mini_app_usage where app_key = 'checkin'),
  1,
  'Vẫn đúng MỘT dòng cho (người · app · ngày) — gộp tại chỗ ghi, không giữ từng cú chạm');

-- ═══ 2. NGƯỠNG ≥3 VÀ CỬA SỔ 30 NGÀY ════════════════════════════════════════
select is_empty(
  $$ select 1 from ops.app_dung_nhieu_nhat(4) $$,
  'Mới 2 lượt thì CHƯA ghim — một app mở vì tò mò không được đẩy app dùng hằng ngày ra khỏi hàng ghim');

update ops.mini_app_usage set so_lan = 3 where app_key = 'checkin';
select is(
  (select app_key from ops.app_dung_nhieu_nhat(4)),
  'checkin',
  'Đủ 3 lượt thì vào hàng ghim');

-- Một app dùng nhiều hơn phải đứng trước.
insert into ops.mini_app_usage (user_id, app_key, ngay, so_lan)
     values (core.current_user_id(), 'bao-cao', current_date, 9);
select is(
  (select array_agg(app_key order by so_lan desc) from ops.app_dung_nhieu_nhat(4)),
  array['bao-cao', 'checkin'],
  'Xếp giảm dần theo số lượt — app dùng nhiều nhất đứng đầu hàng ghim');

-- Dòng 40 ngày trước KHÔNG được tính: thói quen đổi thì ghim phải đổi theo.
insert into ops.mini_app_usage (user_id, app_key, ngay, so_lan)
     values (core.current_user_id(), 'app-cu', current_date - 40, 99);
select is(
  (select count(*)::int from ops.app_dung_nhieu_nhat(10) where app_key = 'app-cu'),
  0,
  'App dùng nhiều nhưng đã 40 ngày không đụng thì KHÔNG còn ghim — cửa sổ 30 ngày có thật');

select is(
  (select count(*)::int from ops.app_dung_nhieu_nhat(1)),
  1,
  'Tham số số lượng có tác dụng — trang chủ xin 4 thì không nhận về cả danh sách');
select test_support.logout();

-- ═══ 3. RLS — HÀNH VI CỦA MỘT ĐỨA TRẺ KHÔNG PHẢI CHUYỆN CỦA NGƯỜI KHÁC ═════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN của Minh

select is_empty(
  $$ select 1 from ops.mini_app_usage
      where user_id <> core.current_user_id() $$,
  'GVCN CỦA EM cũng KHÔNG đọc được em mở app nào — không lời hứa nào của trường nói tới dữ liệu này, nên nó không mở cho ai ngoài chính chủ');

select throws_ok(
  $$ insert into ops.mini_app_usage (user_id, app_key, ngay)
     values ('40000000-0000-0000-0000-000000000005', 'checkin', current_date) $$,
  '42501',
  null,
  'Không ai ghi hộ người khác được — with check của policy chặn, nên thứ tệ nhất một người làm được là thổi số ghim của CHÍNH MÌNH');
select test_support.logout();

-- ═══ 4. HÌNH DẠNG ══════════════════════════════════════════════════════════
select is(
  (select prosecdef from pg_proc where oid = 'ops.ghi_mo_mini_app(text)'::regprocedure),
  false,
  'ops.ghi_mo_mini_app KHÔNG phải SECURITY DEFINER — nó chạy bằng quyền người gọi, nếu không thì ba policy ở trên chỉ còn là trang trí');

select ok(
  (select relrowsecurity from pg_class where oid = 'ops.mini_app_usage'::regclass),
  'ops.mini_app_usage đã BẬT row level security — bảng mới trong ops rất dễ quên bước này, và quên thì mọi assertion RLS ở trên xanh vì lý do sai');

select * from finish();
rollback;
