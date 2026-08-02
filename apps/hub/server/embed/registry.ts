// apps/hub/server/embed/registry.ts — App Manifest tĩnh (08-embedded-apps.md mục 5).
// Chưa xây bảng+màn hình quản trị (chỉ làm khi ≥5 app) — config file, review qua PR như vùng lõi.
// KHÔNG import "node:crypto" (hay bất kỳ module Node nào) trong file này.
//
// Lý do rất cụ thể, đã làm sập hệ thật ngày 31/07/2026: apps/hub/middleware.ts import
// findEmbedApp từ đây để dựng header CSP cho /embed/*, mà middleware của Next chạy trên
// Edge runtime. Webpack biên dịch bundle Edge và gặp `node:crypto` thì dừng với
// "UnhandledSchemeError: Reading from node:crypto is not handled by plugins" — build hỏng,
// và vì middleware phủ toàn site nên MỌI trang trả 500, kể cả /login.
//
// Đây là file cấu hình dùng chung cho ba runtime (Edge middleware · Server Component ·
// Route Handler Node). Giữ nó thuần TypeScript là điều kiện để nó ở được cả ba nơi.
import type { HubRole } from "@hub/core/contracts";

export interface EmbedAppConfig {
  appId: string;
  /**
   * `undefined` = app này CHƯA được cấp secret ⇒ cổng webhook đóng hoàn toàn với nó.
   *
   * Trước 31/07/2026 trường này là `string` và mặc định về `""` khi thiếu biến môi trường.
   * Hậu quả thật: `secret !== app.webhookSecret` so `""` với `""` ra false, nên chỉ cần gửi
   * header `x-embed-secret:` rỗng là qua được xác thực. Kiểu `undefined` khiến trạng thái
   * "chưa cấu hình" không thể trùng với bất kỳ giá trị nào người gửi đưa lên.
   */
  webhookSecret?: string;
  basket: "xanh" | "vang" | "do";
  /** ["*"] = nhận mọi event_type — chỉ hợp lệ cho rổ Xanh (không định danh học sinh nào để lộ). */
  allowedEventTypes: string[];
  /**
   * Vai được mở app này. Đây là hàng rào THẬT, không phải chuyện ẩn/hiện tile trên trang chủ:
   * mở app ngoài nghĩa là Hub cấp cho nó một mã OIDC thật kèm claim hub_profile.
   *
   * FAIL-CLOSED có chủ ý: thiếu trường này (hoặc để mảng rỗng) ⇒ KHÔNG AI mở được. App mới
   * quên khai sẽ hỏng ngay lần bấm đầu tiên, lúc còn người ngồi nhìn — thay vì mở toang cho
   * mọi vai rồi sáu tháng sau mới phát hiện một em học sinh vào được app nhân viên.
   *
   * Trước 31/07/2026 không có trường này: /embed/<app-id> chỉ kiểm "đã đăng nhập chưa", còn
   * việc giấu tile làm ở UI (mini-apps.ts) và còn suy sai chiều. Gõ thẳng URL là qua.
   */
  allowedRoles?: HubRole[];
  /** Tier 2 (08-embedded-apps.md mục 3) — bỏ trống nếu app chỉ có Đường A/B, chưa nhúng iframe. */
  embed?: {
    displayName: string;
    /** Origin CHÍNH XÁC (không path) — dùng làm frame-src CSP và kiểm postMessage. */
    origin: string;
    /** URL nạp vào iframe — trang riêng của app dành cho ngữ cảnh nhúng, không phải trang chủ thường. */
    iframeUrl: string;
    /**
     * Logo thật, tự host trong /public — không trỏ thẳng domain app ngoài (độc lập với app
     * còn sống hay không).
     *
     * PHẢI kèm `?v=<8 ký tự đầu sha256 của file>`: next.config.mjs gắn
     * `Cache-Control: public, max-age=31536000, immutable` cho mọi ảnh trong public/.
     * Immutable nghĩa là trình duyệt KHÔNG hỏi lại trong một năm — app ngoài đổi logo mà
     * URL giữ nguyên thì máy người dùng treo logo cũ tới hết năm và không có cách gỡ từ
     * phía Hub (thiếu chuỗi này từ 29/07 tới 31/07/2026).
     */
    iconImageUrl?: string;
    /**
     * Một câu nói app này LÀM GÌ, hiện trong lúc chờ app ngoài nạp (02/08/2026).
     *
     * Vì sao nằm ở manifest chứ không viết chết trong component: mỗi app một câu, và
     * người thêm app mới phải khai nó ở ĐÚNG chỗ khai mọi thứ khác về app đó. Để trong
     * component thì app thứ hai sẽ dùng nhờ câu của app thứ nhất — đúng kiểu hỏng mà
     * repo này gọi là "một nhãn hai đích".
     *
     * Bỏ trống được: lúc đó màn chờ chỉ hiện tên app. Thà không nói gì còn hơn nói một
     * câu chung chung đúng cho mọi app và vì thế không nói gì về app nào.
     */
    intro?: string;
  };
}

/**
 * App test có secret ghi trần trong repo. Rổ VÀNG — nghĩa là ai cầm secret này ghi được
 * evidence.dear_logs của học sinh thật. Trước 31/07/2026 nó nằm trong danh sách vô điều kiện,
 * tức là bản production nào cũng mang theo một cửa hậu mà mật khẩu in sẵn trên GitHub.
 * tools/secret-scan.mjs không bắt được vì nó chỉ quét bundle CLIENT (§4), còn đây là server.
 *
 * Gate bằng NODE_ENV: ở production mảng này rỗng ⇒ findEmbedApp('test-external-app') trả
 * undefined ⇒ webhook trả 401 trước cả khi so secret.
 */
export const DEV_ONLY_APPS: EmbedAppConfig[] =
  process.env.NODE_ENV !== "production"
    ? [
        {
          appId: "test-external-app",
          webhookSecret: "dev-test-external-app-webhook-secret-not-for-prod",
          basket: "vang",
          allowedEventTypes: ["dear_log"],
          allowedRoles: [], // không có UI nhúng — app này chỉ đi Đường B (webhook)
        },
      ]
    : [];

// ═══════════════════════════════════════════════════════════════════════════════
// DANH SÁCH APP ĐÃ RỜI KHỎI FILE NÀY (02/08/2026, migration 0052)
// ═══════════════════════════════════════════════════════════════════════════════
// Trước đây ở đây có `EMBED_APPS` và `findEmbedApp()`. Nguồn sự thật nay là bảng
// `core.embedded_apps`; đọc nó qua `./registry-db.ts` (`timApp`, `napApps`) — file đó
// CHỈ nạp được trên Node.
//
// KHÔNG để lại một mảng "dự phòng" ở đây. Cám dỗ là giữ nó cho middleware dùng tạm, và
// hậu quả đúng bằng thứ cả kho này sợ nhất: hai nguồn sự thật cho một câu hỏi, rồi một
// hôm quản trị tắt app trên màn hình mà `frame-src` vẫn allowlist domain cũ — tắt trên
// giấy, còn sống trong header. Middleware lấy origin qua `/api/embed/manifest` và
// FAIL-CLOSED khi không lấy được.
//
// `DEV_ONLY_APPS` ở trên KHÔNG chuyển vào migration, có chủ ý: nó mang secret in trần
// trong kho. Migration chạy cả trên máy chủ thật.

/**
 * Người mang bộ vai này có được mở app ngoài đó không (Rev E điều 3 — không có đường ghi
 * thứ ba, và cũng không có đường ĐĂNG NHẬP thứ ba).
 *
 * Tách thành hàm riêng để MỌI cửa vào dùng chung một phép kiểm: trang /embed/<app-id> của Hub
 * VÀ đường RP tự dựng URL /oidc/auth (findAccount/loadExistingGrant trong oidc/provider.ts).
 * Chặn ở một cửa mà bỏ cửa kia thì hàng rào chỉ là trang trí.
 */
export function canOpenEmbedApp(app: EmbedAppConfig, roles: readonly HubRole[]): boolean {
  if (!app.allowedRoles || app.allowedRoles.length === 0) return false; // fail-closed
  return roles.some((role) => app.allowedRoles!.includes(role));
}

/**
 * So sánh hai chuỗi mà KHÔNG thoát sớm ở ký tự đầu tiên khác nhau.
 *
 * Vì sao cần: `a === b` của JS dừng ngay khi gặp ký tự khác, nên thời gian phản hồi tỉ lệ
 * với "đoán đúng được bao nhiêu ký tự đầu". Webhook là endpoint gọi được không giới hạn,
 * nên kẻ tấn công dò từng ký tự một — chậm nhưng chắc chắn tới đích.
 *
 * Viết tay thay vì dùng `timingSafeEqual` của node:crypto: xem ghi chú đầu file — module
 * này phải nạp được cả trên Edge runtime. Đánh đổi đã cân nhắc: bản này lộ ĐỘ DÀI secret
 * qua số vòng lặp (bản cũ băm SHA-256 trước nên giấu được). Chấp nhận vì secret là chuỗi
 * ngẫu nhiên ≥32 ký tự — biết độ dài không rút ngắn được việc dò nội dung, còn cả hệ 500
 * thì hỏng ngay lập tức.
 */
function constantTimeEquals(a: string, b: string): boolean {
  // charCodeAt vượt biên trả NaN; `NaN | 0` = 0 nên vòng lặp vẫn chạy đủ độ dài lớn nhất
  // mà không ném lỗi. Chênh lệch độ dài đã được gộp vào `diff` ngay từ đầu.
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

/**
 * Kiểm secret webhook của app ngoài. Trả về false trong MỌI trường hợp mập mờ:
 * app chưa cấu hình secret, người gửi không đưa header, hoặc chuỗi không khớp.
 */
export function verifyWebhookSecret(app: EmbedAppConfig, provided: string | null): boolean {
  if (!app.webhookSecret) return false; // chưa cấp secret ⇒ cổng đóng, không có ngoại lệ
  if (!provided) return false;
  return constantTimeEquals(app.webhookSecret, provided);
}
