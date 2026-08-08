-- 0057_mot_chuoi_cho_ca_dang_nhap.sql
-- Thi hành quyết định của chủ đầu tư 08/08/2026: **một chuỗi bí mật dùng chung cho mọi app,
-- và cho cả đường ĐĂNG NHẬP** — không chỉ đường webhook.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- QUYẾT ĐỊNH, VÀ CÁI ĐỔI LẤY
-- ═══════════════════════════════════════════════════════════════════════════════
-- Nguyên văn hai lượt: *"ko cần chuỗi bí mật nào đâu, mặc định chuỗi là vietanh2026, cho
-- mọi app, nào tôi đổi chuỗi thì mọi app đều cần đổi"* → rồi khi được nêu rủi ro của việc
-- gộp nốt đường đăng nhập: *"gộp đi"*.
--
-- Đổi lấy: khai một app mới nay KHÔNG còn bước nào chạm vào máy chủ. Trước file này còn
-- đúng một bước — đặt `OIDC_CLIENT_SECRET_<APP>` rồi khởi động lại — và đó là bước duy nhất
-- giữa "dán phiếu" và "app chạy đủ ba đường".
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- MẤT GÌ — nói bằng phép đo, không bằng lời doạ
-- ═══════════════════════════════════════════════════════════════════════════════
-- KHÔNG mất: người biết chuỗi vẫn KHÔNG tự chế được token. Hai hàng rào còn nguyên và cả
-- hai đều không đụng tới `client_secret`:
--   · PKCE bắt buộc (`provider.ts`: `pkce: { required: () => true }`) — phải có `code_verifier`
--     của chính phiên đã mở, mà chuỗi đó không rời trình duyệt người dùng.
--   · `redirect_uri` khớp tuyệt đối với `sso_redirect_uris` trong sổ — mã chỉ bay về đúng
--     tên miền quản trị đã khai, không bay về chỗ người lạ.
--
-- MẤT: ranh giới giữa các app ở tầng xác thực client.
--   · Đội làm app A cầm luôn chìa của app B. Một đội lộ là lộ cho tất cả.
--   · Ai có chuỗi thì gọi được `/oidc/token/revocation` và `/oidc/token/introspection` dưới
--     danh nghĩa app bất kỳ — tức là THU HỒI được token của app khác (quấy rối, không đọc
--     được dữ liệu), và soi được một token mình đã có là còn sống hay không.
--   · Xoay chuỗi phải xoay đồng loạt: cửa sổ chồng lấn `_PREVIOUS` (09-hop-dong-app-ngoai.md
--     §1b) vẫn chạy được, nhưng nay nó áp cho MỌI app cùng lúc chứ không cho từng app.
--
-- Chấp nhận được khi sau cửa còn 109 em bịa tên và trường mới có 1-2 app. Điều kiện thoát
-- ghi ở `DEBT.md` #65 — cùng mốc với #19 và #63, trước ngày nạp danh sách học sinh thật.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE NÀY CHỈ NỚI MỘT RÀNG BUỘC — phần còn lại ở tầng nạp
-- ═══════════════════════════════════════════════════════════════════════════════
-- `embedded_apps_sso_du_bo` đang đòi `sso_client_secret_env IS NOT NULL` khi bật SSO. Ràng
-- buộc đó đúng khi mỗi app một khoá: khai SSO mà không nói lấy khoá ở đâu thì client dựng
-- lên hỏng câm. Nay `NULL` có một nghĩa RÕ RÀNG và hợp lệ — "dùng chuỗi chung" — nên giữ
-- nguyên là cấm đúng cái đường mặc định.
--
-- Vế `cardinality(sso_redirect_uris) >= 1` GIỮ NGUYÊN, và nó là vế còn lại gánh việc: không
-- có redirect_uri thì RP không đăng nhập được, chuỗi nào cũng vô nghĩa.
begin;

alter table core.embedded_apps drop constraint if exists embedded_apps_sso_du_bo;

alter table core.embedded_apps add constraint embedded_apps_sso_du_bo
  check (not sso_enabled or cardinality(sso_redirect_uris) >= 1);

comment on column core.embedded_apps.sso_client_secret_env is
  'TÊN biến môi trường chứa client_secret RIÊNG của app này. NULL = dùng chuỗi chung của '
  'trường (quyết định 08/08/2026) — đó là đường mặc định. Khai tên ở đây nghĩa là app dùng '
  'khoá riêng, và khi đó chuỗi chung KHÔNG còn mở cửa cho nó; khai mà chưa đặt giá trị thì '
  'client không được nạp (fail-closed), xem apps/hub/server/oidc/clients.ts.';

-- Factory chuyển sang chuỗi chung cùng lượt này. Một-đổi-một, không đụng app nào khác:
-- đây là app RP duy nhất đang có, và để nó ở khoá riêng trong khi mọi app sau dùng chuỗi
-- chung là để lại đúng một ngoại lệ mà sáu tháng nữa không ai nhớ vì sao nó ngoại lệ.
update core.embedded_apps
   set sso_client_secret_env = null
 where app_id = 'factory';

commit;
