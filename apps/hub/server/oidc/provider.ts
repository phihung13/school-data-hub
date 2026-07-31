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
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import Provider from "oidc-provider";
import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from "jose";
import { REGISTERED_CLIENTS, loadPreviousSecretWindows, type PreviousSecretWindow } from "./clients.ts";
import { resolveHubProfileClaims } from "./claims.ts";
import { withSystemContext } from "@hub/core/db";

function getIssuer(): string {
  return process.env.HUB_URL ?? "http://localhost:3000";
}

let providerPromise: Promise<Provider> | null = null;
let signingKey: KeyLike | null = null;

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
  // JWKS ephemeral cho dev — xoay theo mặc định thư viện khi có key thật (§ bảo mật 03-api.md).
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  signingKey = privateKey;
  const jwk = await exportJWK(privateKey);
  jwk.alg = "RS256";
  jwk.use = "sig";
  jwk.kid = "dev-1";

  const provider = new Provider(getIssuer(), {
    clients: REGISTERED_CLIENTS.map((c) => ({
      client_id: c.client_id,
      client_secret: c.client_secret,
      redirect_uris: c.redirect_uris,
      backchannel_logout_uri: c.backchannel_logout_uri,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    })),
    jwks: { keys: [jwk] },
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
    scopes: ["openid", "profile", "hub_profile"],
    claims: {
      openid: ["sub"],
      profile: ["name"],
      hub_profile: ["hub_role", "hub_school", "hub_classes"],
    },
    ttl: {
      AccessToken: 900, // 15 phút (ADR-016)
      IdToken: 900,
      AuthorizationCode: 60, // §bảo mật 03-api.md — dùng một lần, hết hạn ≤60s
      RefreshToken: 900,
      Grant: 60 * 60 * 24 * 30,
      Interaction: 600,
      Session: 900,
    },
    cookies: {
      keys: [process.env.AUTH_SESSION_SECRET ?? "dev-only-secret-do-not-use-in-prod"],
    },
    features: {
      devInteractions: { enabled: false }, // tự dựng interaction bridge, không dùng UI mẫu của thư viện
      backchannelLogout: { enabled: true }, // ADR-016 — thoát Hub = thoát mọi RP
      rpInitiatedLogout: { enabled: true },
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
export async function notifyBackchannelLogout(userId: string): Promise<void> {
  await getProvider(); // đảm bảo signingKey đã khởi tạo
  if (!signingKey) return;

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
      const logoutToken = await new SignJWT({
        events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      })
        .setProtectedHeader({ alg: "RS256", kid: "dev-1" })
        .setIssuer(issuer)
        .setAudience(clientId)
        .setSubject(userId)
        .setIssuedAt()
        .setJti(randomUUID())
        .sign(signingKey);

      await fetch(rp.backchannel_logout_uri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ logout_token: logoutToken }),
      });
    } catch {
      // RP không phản hồi (đang tắt, mạng lỗi) — không chặn đăng xuất phía Hub vì đó.
    }
  }
}
