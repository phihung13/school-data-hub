// apps/hub/server/oidc/clients.ts — đăng ký RP (03-api.md "Đăng ký Relying Party").
// Config tĩnh (JSON/TS) — chưa xây bảng + màn hình quản trị (chỉ cần khi ≥3-4 RP thật).
// Đây là PR chạm packages lõi qua adapter chung — thêm RP mới cần 2 chữ ký (§10).
export interface OidcClientConfig {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  backchannel_logout_uri?: string;
  scopes: string[];
  /** Chỉ cho phép khai "hub_profile" nếu app thật sự cần vai trò — mặc định ít quyền nhất. */
}

/**
 * Cửa sổ chồng lấn secret khi xoay khóa (yêu cầu Factory 30/07/2026).
 *
 * Vì sao cần: mỗi client trong thư viện oidc-provider chỉ giữ ĐƯỢC MỘT secret. Không có
 * cơ chế này thì đổi khóa nghĩa là Hub và RP phải đổi đúng cùng một khoảnh khắc — lệch bao
 * nhiêu giây là RP gãy im lặng bấy nhiêu giây, mà RP không hề biết trước.
 *
 * Cách dùng: đặt secret CŨ vào `OIDC_CLIENT_SECRET_<ID>_PREVIOUS` và hạn chót vào
 * `..._PREVIOUS_UNTIL` (ISO 8601). Trong khoảng đó Hub nhận cả hai khóa, RP đổi lúc nào
 * cũng được. Hết hạn thì khóa cũ tự chết, không cần ai nhớ đi dọn.
 *
 * BẮT BUỘC có hạn chót: cửa sổ không có ngày đóng thì không phải cửa sổ — nó là hai khóa
 * sống song song vĩnh viễn. Thiếu/sai `_PREVIOUS_UNTIL` thì overlap KHÔNG bật, và server
 * báo lỗi to lúc khởi động thay vì âm thầm bỏ qua.
 */
export interface PreviousSecretWindow {
  client_id: string;
  secret: string;
  until: Date;
}

function envKey(clientId: string): string {
  return clientId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function loadPreviousSecretWindows(clients: OidcClientConfig[]): PreviousSecretWindow[] {
  const windows: PreviousSecretWindow[] = [];
  for (const client of clients) {
    const key = envKey(client.client_id);
    const secret = process.env[`OIDC_CLIENT_SECRET_${key}_PREVIOUS`];
    if (!secret) continue;

    const rawUntil = process.env[`OIDC_CLIENT_SECRET_${key}_PREVIOUS_UNTIL`];
    const until = rawUntil ? new Date(rawUntil) : null;
    if (!until || Number.isNaN(until.getTime())) {
      console.error(
        `[oidc] Bỏ qua secret cũ của "${client.client_id}": thiếu hoặc sai OIDC_CLIENT_SECRET_${key}_PREVIOUS_UNTIL ` +
          `(cần ISO 8601, ví dụ 2026-08-06T00:00:00+07:00). Cửa sổ chồng lấn KHÔNG bật.`,
      );
      continue;
    }
    if (until.getTime() <= Date.now()) {
      console.warn(`[oidc] Secret cũ của "${client.client_id}" đã hết hạn ${until.toISOString()} — không nhận nữa.`);
      continue;
    }
    if (secret === client.client_secret) continue; // cũ trùng mới: không có gì để chồng lấn

    console.warn(
      `[oidc] Đang mở cửa sổ chồng lấn secret cho "${client.client_id}" tới ${until.toISOString()} — ` +
        `nhận cả khóa cũ lẫn khóa mới cho tới lúc đó.`,
    );
    windows.push({ client_id: client.client_id, secret, until });
  }
  return windows;
}

/**
 * RP test có secret ghi trần trong repo. "Chấp nhận được vì chạy local" chỉ đúng khi nó THẬT SỰ
 * chỉ tồn tại ở local — trước 31/07/2026 client này được đăng ký VÔ ĐIỀU KIỆN, nên bản production
 * cũng nhận nó, với một secret ai đọc GitHub cũng có. Cầm secret đó là đổi được authorization_code
 * lấy id_token/access_token hợp lệ của Hub, kèm scope hub_profile (vai + cơ sở + lớp).
 *
 * Client `factory` ngay dưới đã biết tự tắt khi thiếu env — dòng gate này chỉ là làm cho app test
 * tuân theo đúng chuẩn đó.
 */
const DEV_ONLY_CLIENTS: OidcClientConfig[] =
  process.env.NODE_ENV !== "production"
    ? [
        {
          client_id: "test-external-app",
          client_secret: "dev-test-external-app-secret-not-for-prod",
          redirect_uris: ["http://localhost:4000/callback"],
          backchannel_logout_uri: "http://localhost:4000/backchannel-logout",
          scopes: ["openid", "profile", "hub_profile"],
        },
      ]
    : [];

export const REGISTERED_CLIENTS: OidcClientConfig[] = [
  ...DEV_ONLY_CLIENTS,
  // RP thật đầu tiên (29/07/2026). Rổ Xanh (không định danh học sinh), Đường A (chỉ đăng nhập,
  // chưa cấp quyền đọc/ghi dữ liệu Hub). Báo cáo tích hợp: openid-client v6.8.4 (được OpenID
  // Foundation chứng nhận) + jose v6.2.4 kiểm logout_token, 38/38 tự kiểm đạt phía Factory.
  // secret KHÔNG nằm trong file này (RP thật, khác app test ở trên) — đọc từ biến môi trường
  // OIDC_CLIENT_SECRET_FACTORY khi chạy server.mjs. Không set thì client này không tồn tại —
  // /oidc/auth sẽ từ chối client_id=factory thay vì chạy với secret rỗng.
  ...(process.env.OIDC_CLIENT_SECRET_FACTORY
    ? [
        {
          client_id: "factory",
          client_secret: process.env.OIDC_CLIENT_SECRET_FACTORY,
          redirect_uris: [
            "https://factory.vietanh.org/api/auth/oidc/callback",
            // Đường A (top-level) dùng URI trên. URI dưới là RIÊNG cho Embed Bridge (Tier 2,
            // 08-embedded-apps.md mục 3) — thuộc về Hub, không phải Factory, nên đăng ký được
            // ngay không cần hỏi Factory: /embed/relay chỉ đọc `code` khỏi URL rồi postMessage
            // lên đúng trang /embed/factory (cùng origin Hub) — code không rời khỏi trình
            // duyệt của Hub cho tới khi Factory tự đón lấy nó, đúng kiểu "trao mã qua khe cửa".
            "https://hub.truongvietanh.com/embed/relay",
          ],
          backchannel_logout_uri: "https://factory.vietanh.org/api/auth/oidc/backchannel-logout",
          scopes: ["openid", "profile"],
        },
      ]
    : []),
];
