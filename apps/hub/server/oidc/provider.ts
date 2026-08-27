// apps/hub/server/oidc/provider.ts — Hub là Identity Provider cho hệ ngoài (ADR-014).
//
// Dùng thư viện chuẩn `oidc-provider` — không tự viết tay OAuth/OIDC (03-api.md).
// sub = core.users.id (không phải auth.users.id, không phải student_code).
// Bridge KHÔNG tự giữ mật khẩu: interaction bridge (interaction-bridge.ts) đọc session
// Hub hiện có (packages/core/auth-adapter) — không import SDK Supabase ở đây.
//
// Adapter lưu trữ: in-memory cho mọi model (đủ cho GĐ1/demo một tiến trình Node duy nhất,
// đúng kiến trúc modular monolith) — TRỪ model `Client`, đọc thẳng từ `core.v_oidc_clients`
// (ADR-032). KHÔNG dùng được nếu chạy nhiều instance — ghi DEBT khi cần scale ngang thật
// (05-capacity-ops.md bậc 2).
// Khai báo kiểu cho `oidc-provider` (package thuần JS) đi KÈM file này thay vì chỉ nằm
// trong thư mục — `tsconfig.tests.json` chỉ include `tests/**`, nên khi test import
// provider.ts thì file .d.ts cạnh bên KHÔNG được nạp và tsc báo TS7016. Tham chiếu tường
// minh làm mọi chương trình chạm tới provider.ts đều thấy khai báo, không phụ thuộc
// tsconfig nào đang chạy.
/// <reference path="./oidc-provider.d.ts" />
import { createHash, timingSafeEqual } from "node:crypto";
import Provider from "oidc-provider";
import MemoryAdapter from "oidc-provider/lib/adapters/memory_adapter.js";
import {
  loadPreviousSecretWindows,
  napOidcClients,
  sangMetadata,
  timOidcClient,
  type OidcClientConfig,
} from "./clients.ts";
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
function acceptPreviousSecrets(provider: Provider): void {
  provider.use(async (ctx: any, next: () => Promise<void>) => {
    const header: string | undefined = ctx.req.headers?.authorization;
    if (header?.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      if (sep > 0) {
        // RFC 6749 §2.3.1: hai phần được urlencode trước khi base64 — phải giải mã đúng thứ tự đó.
        const clientId = decodeURIComponent(decoded.slice(0, sep));
        const givenSecret = decodeURIComponent(decoded.slice(sep + 1));
        // TRA LẠI MỖI LƯỢT, không chụp một lần lúc dựng provider (sửa 07/08/2026 cùng ADR-032).
        // Bản cũ tính danh sách cửa sổ ĐÚNG MỘT LẦN ở `buildProvider()`, nên mở một cửa sổ xoay
        // khoá đòi khởi động lại máy chủ — mà cả gói này tồn tại để bỏ đúng cái ràng buộc đó.
        // Giá phải trả là một lượt đọc bộ đệm 10 giây trên mỗi request có Basic auth.
        const current = await timOidcClient(clientId);
        const window = current
          ? loadPreviousSecretWindows([current]).find((w) => w.client_id === clientId)
          : undefined;

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

/**
 * Adapter: model `Client` đọc từ sổ đăng ký, mọi model còn lại giữ nguyên bộ nhớ trong.
 *
 * ─── Vì sao đây là đường đúng, không phải "dựng lại provider mỗi lần sửa" ───────────────
 * Cám dỗ đơn giản hơn là giữ danh sách client tĩnh rồi `providerPromise = null` sau mỗi lần
 * quản trị bấm Lưu. KHÔNG làm, vì mọi thứ oidc-provider đang giữ trong RAM sẽ đi theo:
 * interaction đang dở, session, và toàn bộ refresh_token đã cấp. Đổi một ô "ngày rà lại"
 * của một app sẽ đá văng mọi người đang đăng nhập ở MỌI app khác.
 *
 * Đường của thư viện thì sạch hơn nhiều: `Client.find()` tra danh sách tĩnh trước, không có
 * thì gọi `adapter('Client').find(id)`, rồi cache theo BĂM của chính metadata trả về
 * (`lib/models/client.js`). Nghĩa là dòng trong CSDL đổi ⇒ băm đổi ⇒ client dựng lại; dòng
 * không đổi ⇒ dùng lại bản đã cache, không tốn gì. Thu hồi có hiệu lực trong ≤10 giây (trần
 * bộ đệm của `clients.ts`) mà không đụng tới một token nào của app khác.
 *
 * `adapter` khai bằng ARROW FUNCTION là có chủ ý: `initializeAdapter` phân biệt "constructor"
 * với "factory" bằng cách xem có `prototype` không (`lib/helpers/type_validators.js`). Arrow
 * function không có prototype nên nó đi nhánh factory — đúng nhánh cho phép trả về hai loại
 * adapter khác nhau tuỳ tên model. Viết thành `class` hay `function` thường là rơi vào nhánh
 * constructor và cả cơ chế này im lặng không chạy.
 */
class ClientAdapterSoDangKy {
  async find(id: string): Promise<Record<string, unknown> | undefined> {
    try {
      const c = await timOidcClient(id);
      return c ? sangMetadata(c) : undefined;
    } catch (err) {
      // Database trục trặc ⇒ không dựng được client ⇒ RP nhận `invalid_client`. Fail-closed,
      // và thực tế không mất gì thêm: `findAccount` cũng đọc `core.users`, nên CSDL chết là
      // không ai đăng nhập được dù client có dựng lên hay không. Điều KHÔNG được làm ở đây là
      // nuốt lỗi im lặng — một app biến mất khỏi hệ vì lý do hạ tầng phải để lại dấu vết.
      console.error(`[oidc] Không đọc được sổ đăng ký RP cho client "${id}":`, err);
      return undefined;
    }
  }

  // Ba phương thức dưới chỉ được gọi khi bật Dynamic Client Registration (RFC 7591) —
  // `features.registration` đang TẮT và không có kế hoạch bật: đăng ký RP là việc của một
  // người có quyền quản trị ngồi trước màn `/quan-tri/mini-app`, không phải của một request
  // ẩn danh. Ném lỗi thay vì lặng lẽ không làm gì, để hôm nào có người bật tính năng đó thì
  // họ gặp một câu nói rõ chuyện gì thiếu.
  async upsert(): Promise<never> {
    throw new Error("Sổ đăng ký RP chỉ ghi qua /quan-tri/mini-app — không qua Dynamic Client Registration.");
  }
  async destroy(): Promise<never> {
    throw new Error("Thu hồi RP bằng công tắc trên /quan-tri/mini-app (enabled hoặc sso_enabled).");
  }
  async revokeByGrantId(): Promise<void> {
    // Model Client không có grant để thu — no-op đúng nghĩa, không phải một chỗ chưa làm.
  }
}

const chonAdapter = (name: string) =>
  name === "Client" ? new ClientAdapterSoDangKy() : new MemoryAdapter(name);

async function buildProvider(): Promise<Provider> {
  // Khoá ký CỐ ĐỊNH, `kid` = thumbprint RFC 7638 (xem keys.ts để biết vì sao `kid` mới
  // là chi tiết chết người, chứ không phải việc khoá đổi). Ở production thiếu khoá thì
  // `loadSigningKeys()` ném lỗi — `server.mjs` await `getProvider()` lúc khởi động nên
  // tiến trình từ chối lên, thay vì lên rồi cấp token không ai verify được.
  const keys = await loadSigningKeys();
  signingKeys = keys;
  console.log(`[oidc] khoá ký: nguồn=${keys.source}, kid=${keys.activeKid}, số khoá công bố=${keys.jwks.length}`);

  // Đếm trước khi dựng: một máy chủ lên với 0 RP là một máy chủ mà mọi lượt đăng nhập từ app
  // ngoài sẽ nhận `invalid_client`, và đó là thứ phải thấy ngay ở dòng log khởi động chứ
  // không phải sau cuộc gọi đầu tiên của đối tác. (Cũng là phép đo duy nhất chứng minh
  // migration 0055 đã áp trên máy chủ này.)
  const rpDangCo = await napOidcClients().catch((err) => {
    console.error("[oidc] Không đọc được sổ đăng ký RP lúc khởi động:", err);
    return [] as OidcClientConfig[];
  });
  console.log(
    `[oidc] RP nạp từ sổ đăng ký: ${rpDangCo.length}` +
      (rpDangCo.length ? ` (${rpDangCo.map((c) => c.client_id).join(", ")})` : " — chưa app nào bật SSO"),
  );

  // SOI CỬA SỔ XOAY KHOÁ MỘT LẦN LÚC KHỞI ĐỘNG — không dùng kết quả, chỉ lấy phần log.
  //
  // Trước ADR-032, `loadPreviousSecretWindows()` chạy đúng một lần ở đây, nên người vận hành
  // thấy ngay dòng "Secret cũ của X đã hết hạn — không nhận nữa" và biết đi dọn hai dòng
  // `_PREVIOUS` chết trong `.env.local`. Sau ADR-032 nó chuyển vào giữa middleware, chỉ chạy
  // khi có request mang `Authorization: Basic` — tức là cảnh báo dọn dẹp KHÔNG bao giờ xuất
  // hiện nữa nếu không ai đăng nhập.
  //
  // Đo thật 08/08/2026: khoá cũ của Factory hết hạn từ 07/08, hai dòng đó vẫn nằm trong file
  // cấu hình, và log khởi động im lặng hoàn toàn. Một khoá đã chết mà trông như đang sống là
  // đúng loại rác nguy hiểm — nhất là khi chính nó là khoá phải xoay vì đã lộ.
  loadPreviousSecretWindows(rpDangCo);

  const provider = new Provider(getIssuer(), {
    // RỖNG là đúng: không còn client nào viết cứng. Mọi client đi qua `adapter('Client')`,
    // nên sửa một dòng trong sổ có hiệu lực mà không cần dựng lại provider — xem khối chú
    // thích ở `ClientAdapterSoDangKy`.
    clients: [],
    adapter: chonAdapter,
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
    // `email` (ADR-040, 25/08/2026): KHÔNG mặc định — trường cấp theo từng app qua
    // `sso_scopes` trong sổ đăng ký, cho app cần nối tài khoản Hub vào hồ sơ có sẵn
    // gắn theo email trường phát hành (ca đầu tiên: Việt Anh Class, 16 hồ sơ thật —
    // khớp theo tên+lớp bị bác vì trùng tên là nhập nhầm hồ sơ trẻ em).
    scopes: ["openid", "profile", "hub_profile", "email", "offline_access"],
    claims: {
      openid: ["sub"],
      profile: ["name"],
      hub_profile: ["hub_role", "hub_school", "hub_classes"],
      email: ["email"],
    },
    // Hợp đồng §7.1 ban-yeu-cau.md hứa các claim này nằm TRONG id_token. Mặc định của
    // thư viện (`true`) lại theo OIDC Core nghiêm ngặt: có bật userinfo thì claim xin qua
    // scope CHỈ trả ở /oidc/me, id_token chỉ còn `sub`. Ca thật 27/08/2026: Việt Anh Class
    // đổi mã thành công (audit `oidc_token_issued ok` 08:56:45Z) rồi chết ở nhánh
    // "id_token thiếu email" của chính họ — token thiếu email THẬT, dù sổ đăng ký đã cấp
    // scope. `false` = id_token mang đủ claim như hợp đồng đã phát cho các đội app.
    conformIdTokenClaims: false,
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
          if (scope.includes("email")) {
            // Chỉ đọc khi RP THẬT SỰ được cấp scope này (sso_scopes của sổ đăng ký đã
            // chặn từ /oidc/auth — đây là vòng hai). Email trong core.users là email
            // trường phát hành, không phải email cá nhân tự khai.
            base.email = await withSystemContext(async (client) => {
              const { rows } = await client.query<{ email: string | null }>(
                "select email from core.users where id = $1",
                [sub],
              );
              return rows[0]?.email ?? null;
            });
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
  acceptPreviousSecrets(provider);

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

  // ── Ghi SCOPE ĐÃ XIN, ở đúng chỗ nó tồn tại (thêm 07/08/2026, trả nợ #61) ──────
  //
  // ADR-032 nối `sso_scopes` xuống thư viện thật, nên từ nay RP xin ngoài phần đã khai sẽ
  // nhận `invalid_scope`. Câu hỏi đi kèm — "RP nào đang xin scope nào?" — hệ KHÔNG trả lời
  // được: audit duy nhất có scope nằm ở `grant.success` (endpoint token), mà ở đó
  // `params.scope` thường VẮNG MẶT. Đo trên hub_dev 07/08/2026: 3 dòng `oidc_token_issued`
  // cho `factory`, cột scope của cả ba đều rỗng.
  //
  // `authorization.success` là chỗ scope thật sự có: nó phát ở `lib/actions/authorization/
  // respond.js`, sau khi người dùng đã đồng ý, và `ctx.oidc.params.scope` là nguyên văn
  // chuỗi RP gửi lên. Ghi ở đây thì tuần sau đối chiếu được với `sso_scopes` của từng app:
  // lệch chỗ nào thì hoặc RP xin thừa, hoặc sổ khai thiếu — và biết được điều đó TRƯỚC khi
  // một siết chặt làm gãy ai.
  provider.on("authorization.success", (ctx: any) => {
    const clientId = ctx.oidc?.client?.clientId ?? "unknown";
    const accountId = ctx.oidc?.account?.accountId ?? ctx.oidc?.session?.accountId ?? null;
    void withSystemContext((client) =>
      client.query(
        `insert into ops.audit_log (actor_id, action, object_type, object_id, scope)
         values ($1, 'oidc_scope_requested', 'oidc_client', $2, $3)`,
        [accountId, clientId, JSON.stringify({ scope: ctx.oidc?.params?.scope ?? null })],
      ),
    ).catch(() => {}); // audit không được chặn đường đăng nhập nếu DB tạm trục trặc
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

  // ĐÈN SOI LỖI XÁC THỰC CLIENT (25/08/2026) — Factory báo "server responded with a
  // challenge in the WWW-Authenticate HTTP Header" nhưng log Hub câm lặng, không phân
  // biệt được ba ca cùng một triệu chứng: sai cách gửi (client_secret_post thay vì
  // Basic — §5.2 của phiếu đoán trước đúng ca này), sai chuỗi, hay sai client_id.
  // Ghi CÁCH GỬI + client_id + đường dẫn; KHÔNG bao giờ ghi giá trị secret.
  // Lớp SAU next(): bắt được cả lỗi xác thực client (invalid_client xảy ra TRƯỚC khâu
  // grant nên "grant.error" không thấy nó — đã thử bằng probe, sự kiện câm lặng).
  provider.use(async (ctx: any, next: () => Promise<void>) => {
    await next();
    if (!String(ctx.path ?? "").includes("token") || ctx.status < 400) return;
    const authHeader: string | undefined = ctx.req?.headers?.authorization;
    const coBasic = !!authHeader?.startsWith?.("Basic ");
    const coBodySecret = !!ctx.oidc?.body?.client_secret;
    let clientId = ctx.oidc?.body?.client_id ?? "(khong ro)";
    let chanDoanBasic = "";
    if (coBasic) {
      // Nấc hai của đèn (25/08, lượt thật của Factory ra "gửi Basic=true" mà vẫn 401):
      // giải mã header để phân biệt SAI client_id với SAI chuỗi. Ghi client_id, ĐỘ DÀI
      // chuỗi họ gửi và một boolean khớp/không — GIÁ TRỊ chuỗi không bao giờ vào log.
      try {
        const giaiMa = Buffer.from(authHeader!.slice(6), "base64").toString("utf8");
        const sep = giaiMa.indexOf(":");
        if (sep > 0) {
          const idGui = decodeURIComponent(giaiMa.slice(0, sep));
          const secretGui = decodeURIComponent(giaiMa.slice(sep + 1));
          clientId = idGui;
          const chuan = (process.env.EMBED_WEBHOOK_SECRET_CHUNG ?? "").trim() || "vietanh2026";
          chanDoanBasic =
            ` · secret dài ${secretGui.length} ký tự, khớp chuỗi chung=${secretGui === chuan}` +
            (secretGui !== chuan && secretGui.trim() === chuan ? " (LỆCH DO KHOẢNG TRẮNG thừa đầu/cuối)" : "");
        }
      } catch {
        chanDoanBasic = " · (không giải mã được Basic header)";
      }
    }
    console.warn(
      `[oidc] /token ${ctx.status} ${ctx.body?.error ?? ""} · client_id=${clientId} · ` +
        `gửi Basic=${coBasic} · secret trong body=${coBodySecret}` + chanDoanBasic +
        (coBodySecret && !coBasic ? " ← client_secret_post — hợp đồng §5.2 đòi client_secret_basic, đây là chỗ gãy" : ""),
    );
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
    // Tra sổ đăng ký thay vì một mảng viết cứng (ADR-032). Hệ quả đáng nói: app đã TẮT không
    // còn trong sổ, nên Hub không POST logout_token tới nó nữa — đúng, vì phiên bên đó không
    // còn được Hub công nhận từ giây bấm nút thu hồi.
    const rp = await timOidcClient(clientId);
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
