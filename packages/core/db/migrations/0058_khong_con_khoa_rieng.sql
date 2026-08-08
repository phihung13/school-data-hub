-- 0058_khong_con_khoa_rieng.sql
-- Thi hành quyết định của chủ đầu tư 08/08/2026: *"thì bạn cứ yêu cầu app theo khoá của bạn"*.
-- Bỏ HẲN khái niệm "khoá riêng cho từng app". Mọi app dùng chuỗi chung của trường, không có
-- ngoại lệ và không có đường xin.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- VÌ SAO XOÁ CỘT CHỨ KHÔNG CHỈ "THÔI DÙNG"
-- ═══════════════════════════════════════════════════════════════════════════════
-- Đường rẻ hơn là để hai cột đó nằm im và tầng nạp thôi đọc chúng. Không làm, vì đó đúng là
-- thứ `0052` đã viết ra một lời cảnh báo cho chính nó, ở chỗ giải thích vì sao rổ Đỏ không có
-- mặt trong CHECK:
--
--   "để lộ ra một trạng thái hợp lệ trên giấy — và mọi thứ hợp lệ trên giấy rồi sẽ có
--    người thử."
--
-- Một cột `webhook_secret_env` còn tồn tại nghĩa là còn khai được. Còn khai được nghĩa là
-- một ngày nào đó có người khai — bằng psql, bằng một bản vá vội, bằng một agent đọc lược đồ
-- rồi suy ra rằng trường đó dùng được. Và ngày đó nó sẽ hỏng đúng kiểu đã hỏng hai lần trong
-- hôm nay: app khai tên biến, không ai đặt giá trị, cổng đóng câm.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- MẤT GÌ, VÀ CÁI KHÔNG MẤT
-- ═══════════════════════════════════════════════════════════════════════════════
-- MẤT: khả năng xoay khoá cho MỘT app mà không đụng app khác. Từ nay xoay chuỗi là xoay cho
-- tất cả — đúng hệ quả chủ đầu tư đã nhận khi quyết dùng chung ("nào tôi đổi chuỗi thì mọi
-- app đều cần đổi").
--
-- KHÔNG MẤT — và đây mới là điều đáng nói: **thu hồi một app vẫn nguyên vẹn và vẫn nhanh
-- hơn**. Công tắc `enabled` cắt CẢ BA đường (nhúng · webhook · đăng nhập) trong ≤10 giây,
-- không cần chạm máy chủ, không đụng app nào khác (`0055` + `core.v_oidc_clients`). Khoá
-- riêng chưa bao giờ là công cụ thu hồi thật — nó chỉ trông giống thế.
--
-- Ngày nào cần khoá riêng lại: một migration thêm cột, và ADR ghi lý do. Chậm hơn, và chậm
-- ở đây là cố ý — giống hệt lý lẽ của `app_id` và `basket` không sửa được (`0052`).
begin;

-- ---------------------------------------------------------------------------
-- 1. Khung nhìn phải bỏ cột TRƯỚC, nếu không `drop column` bị nó giữ lại
-- ---------------------------------------------------------------------------

-- `drop` rồi `create`, KHÔNG `create or replace`: Postgres từ chối bỏ bớt cột của một view
-- đang có (`cannot drop columns from view`) — đo được ngay lượt chạy đầu của file này. Kèm
-- theo: `drop view` xoá luôn quyền đã cấp, nên câu `grant` ở cuối mục này là bắt buộc chứ
-- không phải chép cho đủ.
drop view if exists core.v_oidc_clients;

create view core.v_oidc_clients as
  select app_id                     as client_id,
         display_name,
         sso_redirect_uris          as redirect_uris,
         sso_backchannel_logout_uri as backchannel_logout_uri,
         sso_scopes                 as scopes,
         origin,
         owner,
         review_due_on
    from core.embedded_apps
   where enabled and sso_enabled;

comment on view core.v_oidc_clients is
  'RP OIDC đang hiệu lực. Điều kiện enabled AND sso_enabled nằm ở đây, một chỗ duy nhất — '
  'tắt app trong sổ là cắt luôn đường đăng nhập. KHÔNG còn cột secret: mọi app dùng chuỗi '
  'chung của trường (0058), giá trị đọc từ môi trường ở apps/hub/server/oidc/clients.ts.';

grant select on core.v_oidc_clients to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Xoá hai cột, và ràng buộc còn tham chiếu tới chúng
-- ---------------------------------------------------------------------------
-- `embedded_apps_sso_secret_env_hoa` chỉ kiểm khuôn tên biến — cột đi thì nó hết việc.
-- Postgres tự xoá ràng buộc khi cột bị xoá, nhưng viết ra để lịch sử đọc được là nó đi đâu.

alter table core.embedded_apps drop constraint if exists embedded_apps_sso_secret_env_hoa;

alter table core.embedded_apps
  drop column if exists webhook_secret_env,
  drop column if exists sso_client_secret_env;

comment on table core.embedded_apps is
  'Sổ đăng ký Mini App ngoài (App Manifest, ADR-015 mục 5). Thay apps/hub/server/embed/registry.ts. '
  'KHÔNG chứa secret VÀ KHÔNG chứa tên biến secret nữa (0058): mọi app dùng MỘT chuỗi chung của '
  'trường cho cả webhook lẫn đăng nhập, đọc từ EMBED_WEBHOOK_SECRET_CHUNG trên máy chủ.';

commit;
