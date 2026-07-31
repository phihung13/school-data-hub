// apps/hub/server/oidc/provider.ts — Hub là Identity Provider cho hệ ngoài (ADR-014).
//
// Dùng thư viện chuẩn `oidc-provider` — không tự viết tay OAuth/OIDC (03-api.md).
// sub = core.users.id (không phải auth.users.id, không phải student_code).
// Bridge KHÔNG tự giữ mật khẩu: interaction bridge (interaction-bridge.ts) đọc session
// Hub hiện có (packages/core/auth-adapter) — không import SDK Supabase ở đây.
//
// Adapter lưu trữ: mặc định (in-memory) — đủ cho GĐ1/demo một tiến trình Node duy nhất
// (đúng kiến trúc modular monolith). KHÔNG dùng được nếu chạy nhiều instance — ghi DEBT
// khi cần scale ngang thật (05-capacity-ops.md bậc 2).
// Khai báo kiểu cho `oidc-provider` (package thuần JS) đi KÈM file này thay vì chỉ nằm
// trong thư mục — `tsconfig.tests.json` chỉ include `tests/**`, nên khi test import
// provider.ts thì file .d.ts cạnh bên KHÔNG được nạp và tsc báo TS7016. Tham chiếu tường
// minh làm mọi chương trình chạm tới provider.ts đều thấy khai báo, không phụ thuộc
// tsconfig nào đang chạy.
/// <reference path="./oidc-provider.d.ts" />
import { createHash, timingSafeEqual } from "node:crypto";
import Provider from "oidc-provider";
import { REGISTERED_CLIENTS, loadPreviousSecretWindows, type PreviousSecretWindow } from "./clients.ts";
import { resolveHubProfileClaims } from "./claims.ts";
import { loadSigningKeys, type SigningKeySet } from "./keys.ts";
import { oidcCookieKeys } from "./secrets.ts";
import { buildLogoutToken } from "./logout-token.ts";
import {
  autoSubmitLogoutPage,
  clearHubSessionCookie,
  isEndSessionPath,
  logoutDonePage,
} from "./rp-logout.ts";
import { withSystemContext } from "@hub/core/db";

function getIssuer(): string {
  return process.env.HUB_URL ?? "http://localhost:3000";
}

let providerPromise: Promise<Provider> | null = null;
let signingKeys: SigningKeySet | null = null;

/** So sánh không lộ thời gian: băm trước để hai chuỗi khác độ dài vẫn so được bằng timingSafeEqual. */
function secretEquals(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/**
 * Nhận secret CŨ trong thời hạn chồng lấn (xem clients.ts). Cách làm: chen một lớp trước
 * khâu xác thực client của thư viện — thấy RP đưa đúng khóa cũ còn hạn thì đổi thầm sang
 * khóa mới rồi mới cho đi tiếp. Thư viện phía sau không hề biết có khóa thứ hai, nên không
 * phải vá vào ruột nó (dễ vỡ khi nâng cấp), và mọi luật khác của nó giữ nguyên.
 *
 * GIỚI HẠN CÓ CHỦ Ý — chỉ áp dụng cho cách gửi khóa qua header `Authorization: Basic`, đúng
 * cách đã ghi trong hợp đồng RP (`token_endpoint_auth_method: client_secret_basic`). RP nào
 * nhét secret vào thân request thì phải đổi khóa đúng giờ hẹn, không có chồng lấn. Lý do:
 * muốn đọc thân request ở đây thì phải nuốt rồi dựng lại luồng dữ liệu gốc — rủi ro làm hỏng
 * đúng đường cấp token, đắt hơn nhiều so với thứ nó mua được.
 *
 * Mỗi lần khóa cũ được dùng đều ghi cảnh báo ra log, để biết còn ai chưa đổi trước khi hết hạn.
 */
function acceptPreviousSecrets(provider: Provider, windows: PreviousSecretWindow[]): void {
  if (windows.length === 0) return;

  provider.use(async (ctx: any, next: () => Promise<void>) => {
    const header: string | undefined = ctx.req.headers?.authorization;
    if (header?.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      if (sep > 0) {
        // RFC 6749 §2.3.1: hai phần được urlencode trước khi base64 — phải giải mã đúng thứ tự đó.
        const clientId = decodeURIComponent(decoded.slice(0, sep));
        const givenSecret = decodeURIComponent(decoded.slice(sep + 1));
        const window = windows.find((w) => w.client_id === clientId);
        const current = REGISTERED_CLIENTS.find((c) => c.client_id === clientId);

        if (window && current && window.until.getTime() > Date.now() && secretEquals(givenSecret, window.secret)) {
          const swapped = `${encodeURIComponent(clientId)}:${encodeURIComponent(current.client_secret)}`;
          ctx.req.headers.authorization = `Basic ${Buffer.from(swapped, "utf8").toString("base64")}`;
          console.warn(
            `[oidc] "${clientId}" vẫn đang dùng secret CŨ — còn được nhận tới ${window.until.toISOString()}. ` +
              `Nhắc RP đổi sang khóa mới trước mốc đó.`,
          );
        }
      }
    }
    await next();
  });
}

async function buildProvider(): Promise<Provider> {
  // Khoá ký CỐ ĐỊNH, `kid` = thumbprint RFC 7638 (xem keys.ts để biết vì sao `kid` mới
  // là chi tiết chết người, chứ không phải việc khoá đổi). Ở production thiếu khoá thì
  // `loadSigningKeys()` ném lỗi — `server.mjs` await `getProvider()` lúc khởi động nên
  // tiến trình từ chối lên, thay vì lên rồi cấp token không ai verify được.
  const keys = await loadSigningKeys();
  signingKeys = keys;
  console.log(`[oidc] khoá ký: nguồn=${keys.source}, kid=${keys.activeKid}, số khoá công bố=${keys.jwks.length}`);

  const provider = new Provider(getIssuer(), {
    clients: REGISTERED_CLIENTS.map((c) => ({
      client_id: c.client_id,
      client_secret: c.client_secret,
      redirect_uris: c.redirect_uris,
      backchannel_logout_uri: c.backchannel_logout_uri,
      // `refresh_token` bật ở đây để CHẤM DỨT mâu thuẫn tài liệu/code: `03-api.md:68,116`
      // hứa có refresh và dựa vào chính nó để thực thi "khoá là cắt" (ADR-016), trong khi
      // `grant_types` cũ chỉ có `authorization_code` — nghĩa là dòng `ttl.RefreshToken`
      // bên dưới là cấu hình chết, và điểm thực thi "khoá là cắt" thật ra không tồn tại.
      // Bật rồi thì mỗi lần RP đổi refresh_token, thư viện gọi lại `findAccount` — hàm đó
      // trả `undefined` khi `core.users.status <> 'active'` → grant bị từ chối. Đó chính
      // là chỗ "khoá tài khoản trong Hub = cắt app ngoài trong ≤15 phút".
      // Tương thích ngược: RP không xin scope `offline_access` thì không có gì đổi.
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    })),
    jwks: { keys: keys.jwks },
    // server.mjs chỉ chuyển tiếp path bắt đầu bằng /oidc/* sang provider — mọi endpoint
    // (kể cả mặc định của thư viện như /auth, /token) phải nằm dưới /oidc/ để khớp routing đó.
    routes: {
      authorization: "/oidc/auth",
      token: "/oidc/token",
      userinfo: "/oidc/me",
      jwks: "/oidc/jwks",
      end_session: "/oidc/session/end",
      revocation: "/oidc/token/revocation",
      introspection: "/oidc/token/introspection",
      device_authorization: "/oidc/device/auth",
      pushed_authorization_request: "/oidc/request",
    },
    // MỘT cách gửi khóa duy nhất, và phải là cách vùng đệm xoay khóa phủ được (clients.ts).
    // Mặc định thư viện quảng cáo 5 cách (basic, post, client_secret_jwt, private_key_jwt,
    // none). Bẫy có thật (Factory báo 30/07/2026): openid-client v6 mặc định chọn
    // client_secret_post, Hub nhận bình thường nên tích hợp chạy ngon — tới lúc xoay khóa mới
    // lộ ra là RP đó không được hưởng cửa sổ chồng lấn, gãy im lặng đúng lúc dở nhất. Quảng
    // cáo một cách thôi thì RP nào cấu hình sai sẽ hỏng NGAY hôm đấu nối, lúc còn người ngồi
    // nhìn — thà vậy còn hơn hỏng lặng lẽ sáu tháng sau.
    clientAuthMethods: ["client_secret_basic"],
    pkce: { required: () => true },
    // `offline_access` là scope RP phải xin thì mới được refresh_token (mặc định của thư
    // viện). Không tự phát cho mọi phiên: app chỉ cần đăng nhập một lần thì không có lý
    // do giữ một chiếc chìa quay lại dùng được 12 tiếng.
    scopes: ["openid", "profile", "hub_profile", "offline_access"],
    claims: {
      openid: ["sub"],
      profile: ["name"],
      hub_profile: ["hub_role", "hub_school", "hub_classes"],
    },
    ttl: {
      AccessToken: 900, // 15 phút (ADR-016)
      IdToken: 900,
      AuthorizationCode: 60, // §bảo mật 03-api.md — dùng một lần, hết hạn ≤60s
      // Refresh dài hơn access token là CỐ Ý và là toàn bộ mục đích của nó: access token
      // chết sau 15 phút (ADR-016), refresh cho phép xin cái mới mà không bắt người dùng
      // đăng nhập lại — VÀ mỗi lần xin lại là một lần Hub kiểm `core.users.status`.
      // 12 giờ = đúng trần tuyệt đối của phiên Hub (SESSION_ABSOLUTE_TTL_SECONDS), để app
      // ngoài không bao giờ sống dai hơn phiên đã sinh ra nó.
      RefreshToken: 12 * 60 * 60,
      Grant: 60 * 60 * 24 * 30,
      Interaction: 600,
      Session: 900,
    },
    // Khoá ký cookie CỦA RIÊNG oidc-provider. Trước bản vá chỗ này dùng chung
    // `AUTH_SESSION_SECRET` (khoá ký `hub_session`) và có sẵn giá trị mặc định nằm trong
    // repo — xem secrets.ts. `oidcCookieKeys()` ném lỗi ở production khi thiếu biến;
    // nhiều khoá cách nhau bằng dấu phẩy để xoay khoá không đá văng phiên đang mở.
    cookies: { keys: oidcCookieKeys() },
    features: {
      devInteractions: { enabled: false }, // tự dựng interaction bridge, không dùng UI mẫu của thư viện
      backchannelLogout: { enabled: true }, // ADR-016 — thoát Hub = thoát mọi RP
      // Chiều ngược lại: thoát app ngoài = thoát Hub. Xem rp-logout.ts để biết vì sao
      // phải xoá cookie ở `logoutSource` chứ không phải ở `postLogoutSuccessSource`.
      rpInitiatedLogout: {
        enabled: true,
        async logoutSource(ctx: any, form: string) {
          ctx.append("set-cookie", clearHubSessionCookie());
          ctx.type = "html";
          ctx.body = autoSubmitLogoutPage(form);
        },
        async postLogoutSuccessSource(ctx: any) {
          // Xoá lần nữa: nhánh này chỉ chạy khi RP không khai post_logout_redirect_uri,
          // nhưng lặp lại một header vô hại còn hơn phụ thuộc vào việc nhánh trên đã chạy.
          ctx.append("set-cookie", clearHubSessionCookie());
          ctx.type = "html";
          ctx.body = logoutDonePage();
        },
      },
    },
    interactions: {
      url(_ctx: unknown, interaction: { uid: string }) {
        return `/oidc/interaction/${interaction.uid}`;
      },
    },
    async findAccount(_ctx: unknown, sub: string) {
      const active = await withSystemContext(async (client) => {
        const { rows } = await client.query<{ id: string }>(
          "select id from core.users where id = $1 and status = 'active'",
          [sub],
        );
        return rows.length > 0;
      });
      if (!active) return undefined; // ADR-016 "khóa là cắt" — disabled thì không tìm thấy account nữa

      return {
        accountId: sub,
        async claims(_use: string, scope: string) {
          const base: Record<string, unknown> = { sub };
          if (scope.includes("hub_profile")) {
            Object.assign(base, await resolveHubProfileClaims(sub));
          }
          return base;
        },
      };
    },
  });

  // Sau TLS-terminating proxy (cloudflared tunnel, hoặc Nginx khi lên VPS thật, ADR-018) —
  // Provider (Koa app) tự thấy socket là HTTP thường, tự sinh sai http:// cho mọi endpoint
  // discovery nếu không tin X-Forwarded-Proto. `issuer` tĩnh đã đúng, nhưng authorization_endpoint/
  // token_endpoint/... đọc theo request thật nên cần dòng này.
  provider.proxy = true;

  // Cửa sổ chồng lấn khi xoay secret (yêu cầu Factory 30/07/2026) — đặt TRƯỚC mọi thứ khác
  // của thư viện, xem acceptPreviousSecrets.
  acceptPreviousSecrets(provider, loadPreviousSecretWindows(REGISTERED_CLIENTS));

  // LỚP BẢO ĐẢM của đăng xuất chiều ngược: gắn `Set-Cookie` xoá `hub_session` cho MỌI
  // phản hồi trên đường `/oidc/session/end*`, không phụ thuộc nhánh nào của thư viện chạy.
  // Lý do đầy đủ ở đầu rp-logout.ts — tóm tắt: `logoutSource` bị bỏ qua khi chưa có phiên
  // OIDC, `postLogoutSuccessSource` bị bỏ qua khi RP có `post_logout_redirect_uri`, và
  // nhánh chuyển hướng thẳng về RP thì không gọi hook nào. Chỉ đường dẫn là chắc chắn.
  // `Set-Cookie` đi kèm được cả phản hồi 302 nên nhánh chuyển hướng vẫn xoá được cookie.
  provider.use(async (ctx: any, next: () => Promise<void>) => {
    await next();
    if (isEndSessionPath(ctx.path)) ctx.append("set-cookie", clearHubSessionCookie());
  });

  // Đăng ký (idempotent, §9) "user này đã đăng nhập RP này" — 03-api.md "Khớp tài khoản".
  // sub = core.users.id luôn (public subject) nên external_id trùng user_id; giá trị của
  // dòng này là sổ audit "ai đã liên kết app nào", không phải để suy ngược danh tính.
  provider.on("grant.success", (ctx: any) => {
    const clientId = ctx.oidc?.client?.clientId ?? "unknown";
    const accountId = ctx.oidc?.account?.accountId ?? null;
    if (accountId) {
      void withSystemContext((client) =>
        client.query("select core.link_identity($1, $2, $3)", [`embed-login:${clientId}`, accountId, accountId]),
      ).catch(() => {}); // đã có (idempotent) hay lỗi tạm — không chặn luồng cấp token
    }
  });

  // Audit log mọi lần cấp token (03-api.md "bảo mật bắt buộc").
  provider.on("grant.success", (ctx: any) => {
    const clientId = ctx.oidc?.client?.clientId ?? "unknown";
    const accountId = ctx.oidc?.account?.accountId ?? null;
    void withSystemContext((client) =>
      client.query(
        `insert into ops.audit_log (actor_id, action, object_type, object_id, scope)
         values ($1, 'oidc_token_issued', 'oidc_client', $2, $3)`,
        [accountId, clientId, JSON.stringify({ scope: ctx.oidc?.params?.scope ?? null })],
      ),
    ).catch(() => {}); // audit không được chặn luồng cấp token nếu DB tạm trục trặc
  });

  return provider;
}

export function getProvider(): Promise<Provider> {
  if (!providerPromise) providerPromise = buildProvider();
  return providerPromise;
}

/**
 * Đăng xuất chung (ADR-016): "thoát Hub = thoát mọi RP đang mở". Tra
 * `core.identity_links` để biết user đã đăng nhập những RP nào (ghi lại lúc
 * cấp token, xem `grant.success` ở trên), tự ký logout_token theo chuẩn OIDC
 * Back-Channel Logout (RFC) bằng đúng khóa JWKS của Provider, POST tới
 * `backchannel_logout_uri` đã khai trong client config. Không dựa vào cơ chế
 * Session nội bộ của oidc-provider (adapter in-memory không tra được theo
 * accountId) — cách này tương đương về kết quả: RP nhận token hợp lệ, xác
 * minh được bằng JWKS của Hub, biết chính xác ai vừa đăng xuất.
 */
export interface BackchannelLogoutReport {
  /** RP đã nhận và trả 2xx. */
  delivered: string[];
  /** RP từ chối, lỗi mạng, hoặc quá hạn chờ — CẦN thử lại, xem ghi chú bên dưới. */
  failed: { clientId: string; reason: string }[];
}

/** RP chậm không được giữ chân người đang đăng xuất. 5s là rộng cho một POST không thân dài. */
const BACKCHANNEL_TIMEOUT_MS = 5_000;

export async function notifyBackchannelLogout(userId: string): Promise<BackchannelLogoutReport> {
  await getProvider(); // đảm bảo signingKeys đã khởi tạo
  const report: BackchannelLogoutReport = { delivered: [], failed: [] };
  if (!signingKeys) return report;

  const linkedClients = await withSystemContext(async (client) => {
    const { rows } = await client.query<{ system: string }>(
      "select system from core.identity_links where user_id = $1 and system like 'embed-login:%'",
      [userId],
    );
    return rows.map((r) => r.system.replace(/^embed-login:/, ""));
  });

  const issuer = getIssuer();
  for (const clientId of linkedClients) {
    const rp = REGISTERED_CLIENTS.find((c) => c.client_id === clientId);
    if (!rp?.backchannel_logout_uri) continue;

    try {
      const logoutToken = await buildLogoutToken({
        issuer,
        clientId,
        userId,
        key: signingKeys.activeKey,
        kid: signingKeys.activeKid,
      });

      const res = await fetch(rp.backchannel_logout_uri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ logout_token: logoutToken }),
        signal: AbortSignal.timeout(BACKCHANNEL_TIMEOUT_MS),
      });

      // TRƯỚC BẢN VÁ chỗ này bỏ qua hoàn toàn mã trả về: RP trả 401/500 cũng tính là
      // xong. Cộng với `.catch(() => {})` ở phía gọi, back-channel logout có thể TẮT
      // HOÀN TOÀN (ví dụ ngày bật Cloudflare Access — DEBT #19) mà không một dòng log nào.
      if (res.ok) {
        report.delivered.push(clientId);
      } else {
        report.failed.push({ clientId, reason: `http_${res.status}` });
      }
    } catch (err) {
      // RP đang tắt / mạng lỗi / quá hạn chờ — KHÔNG chặn đăng xuất phía Hub vì thế,
      // nhưng phải kể lại để người gọi ghi log và (khi có hàng đợi) xếp lịch thử lại.
      report.failed.push({ clientId, reason: err instanceof Error ? err.name : "unknown" });
    }
  }

  if (report.failed.length > 0) {
    console.error(
      `[oidc] Đăng xuất chung KHÔNG tới được ${report.failed.length} RP cho user ${userId}: ` +
        report.failed.map((f) => `${f.clientId}(${f.reason})`).join(", ") +
        `. Phiên phía RP đó có thể còn sống — cần hàng đợi thử lại (xem canPhoiHop: ops.job_runs).`,
    );
  }
  return report;
}
