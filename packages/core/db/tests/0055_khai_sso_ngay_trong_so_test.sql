-- pgTAP — KHAI SSO NGAY TRONG SỔ MINI APP (migration 0055, ADR-032)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0055_khai_sso_ngay_trong_so_test.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CÂU HỎI LỚN NHẤT CỦA BÀI NÀY: "TẮT APP" CÓ TẮT ĐƯỢC ĐƯỜNG ĐĂNG NHẬP KHÔNG
--
-- Trước 0055, tắt một app trong sổ cắt được nhúng và webhook, nhưng client OIDC vẫn sống
-- — nó nằm trong một mảng TypeScript, không liên quan gì tới cột `enabled`. Nghĩa là công
-- tắc thu hồi thu hồi được hai phần ba, và không chỗ nào nói ra điều đó.
--
-- Mục 4 dưới đây là bài chính: dựng đủ BA loại app (bật+SSO · tắt+SSO · bật+không SSO) rồi
-- đòi `core.v_oidc_clients` chỉ chứa loại thứ nhất. Hai loại sau là hai kiểu "không được
-- cấp token" khác nhau, và nhầm loại nào cũng là một cánh cửa mở.
--
-- LUẬT TỰ ÁP (chép từ 0052): mọi khẳng định PHỦ ĐỊNH có một khẳng định KHẲNG ĐỊNH đứng
-- trước nói rõ có bao nhiêu dòng để mà thấy. Không có nó thì "view không chứa app tắt" và
-- "view rỗng" trông giống hệt nhau.
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(40);
select test_support.seed_basic();

-- ---------------------------------------------------------------------------
-- 0. Cột, khung nhìn, hàm có mặt
-- ---------------------------------------------------------------------------

select has_column('core', 'embedded_apps', 'sso_enabled', 'cột sso_enabled tồn tại');
select has_column('core', 'embedded_apps', 'sso_redirect_uris', 'cột sso_redirect_uris tồn tại');
select has_column('core', 'embedded_apps', 'sso_backchannel_logout_uri', 'cột sso_backchannel_logout_uri tồn tại');
select has_column('core', 'embedded_apps', 'sso_scopes', 'cột sso_scopes tồn tại');
select has_column('core', 'embedded_apps', 'sso_client_secret_env',
  'cột giữ TÊN biến môi trường chứa secret OIDC');

-- Cùng phép kiểm, cùng lý lẽ với `hasnt_column('webhook_secret')` của 0052: một ngày có
-- người thấy "tiện hơn nếu đổi được secret trên màn hình" thì bài này đỏ trước khi bản sao
-- lưu database bắt đầu mang secret OIDC đi theo.
select hasnt_column('core', 'embedded_apps', 'sso_client_secret',
  'KHÔNG có cột chứa secret OIDC thật — bản sao lưu không được mang secret đi theo');

select has_view('core', 'v_oidc_clients', 'core.v_oidc_clients tồn tại');
select has_function('core', 'moi_uri_la_https', array['text[]'], 'core.moi_uri_la_https(text[]) tồn tại');

-- ---------------------------------------------------------------------------
-- 1. Mặc định fail-closed — app khai tối thiểu KHÔNG phải là một RP
-- ---------------------------------------------------------------------------

insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on)
values ('app-khong-sso', 'App không SSO', 'xanh', 'đội thử', current_date + 180);

select is(
  (select sso_enabled from core.embedded_apps where app_id = 'app-khong-sso'),
  false,
  'app vừa khai KHÔNG phải RP — bật SSO là một quyết định riêng, không suy ra từ việc app tồn tại');

select is(
  (select sso_redirect_uris from core.embedded_apps where app_id = 'app-khong-sso'),
  '{}'::text[],
  'app vừa khai không có redirect_uri nào');

-- ---------------------------------------------------------------------------
-- 2. Từng ràng buộc có TỪ CHỐI thật
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_client_secret_env)
    values ('sso-thieu-uri', 'Bật SSO không redirect', 'xanh', 'ai đó', current_date,
            true, 'OIDC_CLIENT_SECRET_X')$$,
  '23514', null,
  'bật SSO mà không redirect_uri thì bị chặn — RP sẽ nhận redirect_uri mismatch, một câu lỗi không chỉ về ô bỏ trống');

-- ĐỔI CHỦ Ý 08/08/2026 (migration 0057, chủ đầu tư: *"gộp đi"*) — ghi lại thay vì xoá.
--
-- Bản gốc của phép kiểm này đòi database TỪ CHỐI một app bật SSO mà không khai tên biến
-- secret. Đúng khi mỗi app một khoá: khai SSO mà không nói lấy khoá ở đâu thì client dựng
-- lên hỏng câm.
--
-- Nay `NULL` có một nghĩa RÕ RÀNG và hợp lệ — "dùng chuỗi chung của trường" — và đó là
-- đường MẶC ĐỊNH của mọi app mới. Giữ nguyên phép kiểm cũ là cấm đúng cái đường mặc định.
-- Vế còn lại của ràng buộc (`cardinality(sso_redirect_uris) >= 1`) vẫn gánh việc và vẫn
-- được đo ở phép kiểm ngay trên.
select lives_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris)
    values ('sso-thieu-secret', 'Bật SSO dùng chuỗi chung', 'xanh', 'ai đó', current_date + 200,
            true, array['https://a.vn/cb'])$$,
  'bật SSO mà KHÔNG khai tên biến secret thì khai được — NULL nghĩa là dùng chuỗi chung (0057)');

select is(
  (select sso_client_secret_env from core.embedded_apps where app_id = 'sso-thieu-secret'),
  null,
  'và cột đó để trống, đúng dấu hiệu "app này dùng chuỗi chung"');

select lives_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris, sso_client_secret_env)
    values ('sso-du-bo', 'Bật SSO đủ bộ', 'xanh', 'ai đó', current_date + 200,
            true, array['https://a.vn/cb'], 'OIDC_CLIENT_SECRET_A')$$,
  'đủ redirect_uri và tên biến secret thì khai được');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, sso_redirect_uris)
    values ('redirect-http', 'Redirect http', 'xanh', 'ai đó', current_date, array['http://a.vn/cb'])$$,
  '23514', null,
  'redirect_uri http:// bị chặn — authorization_code đi qua đường không mã hoá là code cho không');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, sso_redirect_uris)
    values ('redirect-fragment', 'Redirect có #', 'xanh', 'ai đó', current_date, array['https://a.vn/cb#x'])$$,
  '23514', null,
  'redirect_uri mang dấu # bị chặn — OIDC Core 3.1.2.1 cấm fragment');

-- Một URI hỏng lẫn giữa hai URI tốt. Đây là ca mà ràng buộc viết bằng `~` trên cả mảng sẽ
-- bỏ lọt: phép kiểm phải chạy trên TỪNG phần tử, không phải trên phần tử đầu.
select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, sso_redirect_uris)
    values ('redirect-lan', 'Một URI hỏng lẫn vào', 'xanh', 'ai đó', current_date,
            array['https://a.vn/cb', 'http://a.vn/cb2', 'https://a.vn/cb3'])$$,
  '23514', null,
  'MỘT redirect_uri hỏng giữa các URI tốt vẫn bị chặn — phép kiểm chạy trên từng phần tử');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, sso_backchannel_logout_uri)
    values ('backchannel-http', 'Backchannel http', 'xanh', 'ai đó', current_date, 'http://a.vn/bcl')$$,
  '23514', null,
  'backchannel_logout_uri http:// bị chặn — logout_token là một JWT ký, không gửi qua đường trần');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, sso_client_secret_env)
    values ('env-thuong', 'Tên biến chữ thường', 'xanh', 'ai đó', current_date, 'oidc_secret_x')$$,
  '23514', null,
  'tên biến môi trường phải viết HOA — khớp đúng khuôn của webhook_secret_env');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris, sso_client_secret_env, sso_scopes)
    values ('scope-la', 'Scope lạ', 'xanh', 'ai đó', current_date,
            true, array['https://a.vn/cb'], 'OIDC_CLIENT_SECRET_B', array['openid','hub_profil'])$$,
  '23514', null,
  'scope provider không biết bị chặn — oidc-provider im lặng bỏ qua nó, RP đăng nhập được mà không bao giờ nhận vai');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris, sso_client_secret_env, sso_scopes)
    values ('scope-thieu-openid', 'Thiếu openid', 'xanh', 'ai đó', current_date,
            true, array['https://a.vn/cb'], 'OIDC_CLIENT_SECRET_C', array['profile'])$$,
  '23514', null,
  'thiếu scope openid bị chặn — không có nó thì đây là OAuth2 trần, không có id_token');

select lives_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris, sso_client_secret_env, sso_scopes)
    values ('scope-du', 'Scope đủ bốn', 'xanh', 'ai đó', current_date + 200,
            true, array['https://a.vn/cb'], 'OIDC_CLIENT_SECRET_D',
            array['openid','profile','hub_profile','offline_access'])$$,
  'bốn scope provider công bố thì nhận hết');

-- ---------------------------------------------------------------------------
-- 3. Hàm kiểm URI — ba ca, gồm cả ca mảng rỗng
-- ---------------------------------------------------------------------------

select is(core.moi_uri_la_https(array[]::text[]), true,
  'mảng rỗng ĐẠT — app chưa khai redirect_uri nào không phải là app khai sai');
select is(core.moi_uri_la_https(array['https://a.vn/cb', 'https://b.vn:8443/x?y=1']), true,
  'https có cổng và query đều đạt');
select is(core.moi_uri_la_https(array['https://a.vn/cb', 'ftp://a.vn/cb']), false,
  'một phần tử không phải https làm cả mảng trượt');

-- ---------------------------------------------------------------------------
-- 4. BÀI CHÍNH — v_oidc_clients chỉ chứa app BẬT VÀ có SSO
-- ---------------------------------------------------------------------------

-- Dựng loại thứ hai: có SSO đủ bộ nhưng app ĐANG TẮT (đúng tình huống vừa thu hồi).
insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                enabled, sso_enabled, sso_redirect_uris, sso_client_secret_env)
values ('sso-app-da-tat', 'App có SSO nhưng đã tắt', 'xanh', 'đội thử', current_date + 200,
        false, true, array['https://tat.vn/cb'], 'OIDC_CLIENT_SECRET_TAT');

-- Loại thứ ba: app ĐANG BẬT nhưng không khai SSO (app nhúng thuần, ví dụ trang tin).
update core.embedded_apps set enabled = true where app_id = 'app-khong-sso';

-- Loại thứ nhất: BẬT app `sso-du-bo` đã khai ở mục 2.
--
-- Dòng này phải viết ra vì bản đầu KHÔNG có nó, và bài test đỏ đúng ở phép kiểm 30 — một
-- app khai SSO đủ bộ vẫn không có mặt trong `v_oidc_clients`. Đó không phải lỗi của view:
-- `enabled` mặc định `false` (0052), nên "khai xong" không bao giờ đồng nghĩa với "đang
-- chạy". Giữ lại ghi chú này vì nó chính là điều màn quản trị phải nói cho người khai app.
update core.embedded_apps set enabled = true where app_id = 'sso-du-bo';

-- MẪU SỐ trước, phủ định sau.
select ok(
  (select count(*) from core.embedded_apps where enabled and sso_enabled) >= 1,
  'mẫu số: có ít nhất 1 app vừa bật vừa khai SSO — nếu không, mọi phép kiểm dưới xanh vì view rỗng');
select ok(
  (select count(*) from core.embedded_apps where sso_enabled and not enabled) >= 1,
  'mẫu số: có ít nhất 1 app khai SSO mà ĐANG TẮT');
select ok(
  (select count(*) from core.embedded_apps where enabled and not sso_enabled) >= 1,
  'mẫu số: có ít nhất 1 app đang bật mà KHÔNG khai SSO');

select is(
  (select count(*)::int from core.v_oidc_clients where client_id = 'sso-app-da-tat'),
  0,
  'TẮT APP LÀ CẮT LUÔN ĐĂNG NHẬP — app đã tắt không còn là RP, không đổi được code lấy token');

select is(
  (select count(*)::int from core.v_oidc_clients where client_id = 'app-khong-sso'),
  0,
  'app nhúng KHÔNG tự thành RP — cấp quyền bằng cách quên không khai là cấp quyền');

select is(
  (select count(*)::int from core.v_oidc_clients where client_id = 'sso-du-bo'),
  1,
  'app bật + khai SSO thì có mặt trong danh sách RP');

-- client_id CHÍNH LÀ app_id. Không có cột thứ hai để lệch.
select is(
  (select client_id from core.v_oidc_clients where client_id = 'sso-du-bo'),
  'sso-du-bo',
  'client_id chính là app_id — một app, một dòng, không có hai sổ để lệch nhau');

-- ---------------------------------------------------------------------------
-- 5. Chuyển Factory một-đổi-một khỏi clients.ts
-- ---------------------------------------------------------------------------
-- Sai một ký tự ở đây là Factory mất đăng nhập. Bốn phép kiểm này là bản đối chiếu với
-- đúng bốn dòng đang nằm trong apps/hub/server/oidc/clients.ts trước gói này.

select is(
  (select sso_enabled from core.embedded_apps where app_id = 'factory'),
  true,
  'Factory được nạp thành RP — đúng như clients.ts đang khai');
select is(
  (select sso_redirect_uris from core.embedded_apps where app_id = 'factory'),
  array['https://factory.vietanh.org/api/auth/oidc/callback']::text[],
  'redirect_uri của Factory đúng một cái — /embed/relay KHÔNG nằm trong bảng, clients.ts tự thêm từ HUB_URL');
select is(
  (select sso_backchannel_logout_uri from core.embedded_apps where app_id = 'factory'),
  'https://factory.vietanh.org/api/auth/oidc/backchannel-logout',
  'backchannel_logout_uri của Factory giữ nguyên — ADR-016 "thoát Hub = thoát mọi RP" dựa vào nó');
-- ĐỔI 08/08/2026 bởi migration `0057` — ghi lại thay vì sửa lặng.
--
-- Khi `0055` viết ra, phép kiểm này khoá đúng một điều: tên biến secret của Factory không
-- được đổi, vì đổi là Factory mất đăng nhập lúc deploy. Nó đúng khi mỗi app một khoá.
--
-- `0057` chuyển Factory sang CHUỖI CHUNG của trường (quyết định chủ đầu tư), nên cột này
-- nay là `NULL` — và `NULL` chính là dấu hiệu "dùng chuỗi chung". Điều đáng khoá vẫn được
-- khoá, chỉ đổi giá trị: một thay đổi ngoài ý muốn ở cột này vẫn làm bài test đỏ.
-- Chi tiết đo riêng ở `0057_mot_chuoi_cho_ca_dang_nhap_test.sql`.
select is(
  (select sso_client_secret_env from core.embedded_apps where app_id = 'factory'),
  null,
  'Factory dùng CHUỖI CHUNG của trường (0057) — cột để trống là dấu hiệu của điều đó');
select is(
  (select sso_scopes from core.embedded_apps where app_id = 'factory'),
  array['openid','profile']::text[],
  'Factory KHÔNG xin hub_profile — giữ đúng mức ít quyền nhất mà clients.ts đang khai');

-- ---------------------------------------------------------------------------
-- 6. RLS — ai sửa được cấu hình SSO
-- ---------------------------------------------------------------------------
-- Cấu hình SSO là cấu hình cấp token. Nó phải nằm sau đúng hàng rào đang canh cột
-- `enabled`, không phải một hàng rào lỏng hơn vì nó là cột mới.

select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- Cô Lan, GVCN 6A1
-- Vẫn là "lọc hàng, không ném lỗi" — xem khối chú thích dài trong 0052 về vì sao hình dạng
-- "0 dòng" này phải được giữ nguyên thay vì sửa cho đẹp.
with sua as (
  update core.embedded_apps
     set sso_redirect_uris = array['https://ke-gian.vn/cb']
   where app_id = 'factory'
  returning 1
)
select is((select count(*)::int from sua), 0,
  'giáo viên KHÔNG chèn được redirect_uri của mình vào Factory — 0 dòng, và không lỗi nào nổ ra');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000007');  -- Hùng, quản trị
select lives_ok(
  $$update core.embedded_apps set sso_enabled = false where app_id = 'factory'$$,
  'quản trị tắt được SSO của một app — đây là đường thu hồi riêng cho đăng nhập');
select is(
  (select count(*)::int from core.v_oidc_clients where client_id = 'factory'),
  0,
  'tắt SSO xong thì Factory rời danh sách RP ngay trong cùng transaction — không chờ deploy');
select test_support.logout();

select * from finish();
rollback;
