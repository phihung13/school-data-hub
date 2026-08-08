-- pgTAP — MỘT CHUỖI CHO CẢ ĐĂNG NHẬP (migration 0057)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0057_mot_chuoi_cho_ca_dang_nhap_test.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BÀI NÀY ĐO ĐÚNG MỘT THỨ: RÀNG BUỘC ĐÃ NỚI ĐÚNG CHỖ, VÀ CHỈ ĐÚNG CHỖ ĐÓ
--
-- `0057` bỏ vế "phải khai tên biến secret" khỏi `embedded_apps_sso_du_bo` để `NULL` mang
-- nghĩa "dùng chuỗi chung của trường". Nới một ràng buộc là việc dễ nới quá tay, nên bài
-- này khẳng định cả hai chiều: vế bị bỏ thì THẬT SỰ hết chặn, còn vế phải giữ thì VẪN chặn.
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(8);
select test_support.seed_basic();

-- ── Vế ĐÃ BỎ: khai SSO không kèm tên biến secret ────────────────────────────
select lives_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris)
    values ('t57-chung', 'Dùng chuỗi chung', 'xanh', 'bài test', current_date + 200,
            true, array['https://a.vn/cb'])$$,
  'bật SSO mà KHÔNG khai tên biến secret thì khai được — đó là đường MẶC ĐỊNH từ 0057');

select is(
  (select sso_client_secret_env from core.embedded_apps where app_id = 't57-chung'),
  null,
  'cột để trống — dấu hiệu duy nhất phân biệt "dùng chuỗi chung" với "dùng khoá riêng"');

-- ── Vế PHẢI GIỮ: không redirect_uri thì vẫn chặn ────────────────────────────
-- Đây là vế còn lại gánh việc. Không có redirect_uri thì RP không đăng nhập được, chuỗi nào
-- cũng vô nghĩa — nới nốt vế này là cho phép khai một RP không bao giờ dùng được.
select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, sso_enabled)
    values ('t57-khong-uri', 'Không redirect', 'xanh', 'bài test', current_date, true)$$,
  '23514', null,
  'bật SSO mà không redirect_uri thì VẪN bị chặn — vế này 0057 giữ nguyên');

-- ── Khoá RIÊNG vẫn khai được, và vẫn phải đúng khuôn ────────────────────────
select lives_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris, sso_client_secret_env)
    values ('t57-rieng', 'Dùng khoá riêng', 'xanh', 'bài test', current_date + 200,
            true, array['https://a.vn/cb'], 'OIDC_CLIENT_SECRET_T57')$$,
  'app cần khoá RIÊNG vẫn khai được — 0057 thêm một lựa chọn, không bỏ lựa chọn cũ');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris, sso_client_secret_env)
    values ('t57-thuong', 'Tên biến chữ thường', 'xanh', 'bài test', current_date,
            true, array['https://a.vn/cb'], 'oidc_secret_thuong')$$,
  '23514', null,
  'tên biến vẫn phải viết HOA — nới ràng buộc này không nới ràng buộc kia');

-- ── Factory đã chuyển sang chuỗi chung ──────────────────────────────────────
-- Một-đổi-một. Để Factory ở khoá riêng trong khi mọi app sau dùng chuỗi chung là để lại
-- đúng một ngoại lệ mà sáu tháng nữa không ai nhớ vì sao nó ngoại lệ.
select is(
  (select sso_client_secret_env from core.embedded_apps where app_id = 'factory'),
  null,
  'Factory chuyển sang chuỗi chung cùng lượt này');

select is(
  (select sso_enabled from core.embedded_apps where app_id = 'factory'),
  true,
  'và vẫn là RP — đổi cách lấy khoá, không đổi việc nó có đăng nhập hay không');

-- ── Khung nhìn vẫn cho ra Factory ───────────────────────────────────────────
-- `core.v_oidc_clients` đọc `sso_client_secret_env`; NULL không được làm hàng biến mất khỏi
-- danh sách RP, nếu không thì "chuyển sang chuỗi chung" thành "mất đăng nhập".
select is(
  (select count(*)::int from core.v_oidc_clients where client_id = 'factory'),
  1,
  'Factory VẪN có mặt trong danh sách RP — NULL không làm nó rơi khỏi khung nhìn');

select * from finish();
rollback;
