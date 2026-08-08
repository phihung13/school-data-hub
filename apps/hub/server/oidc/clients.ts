// apps/hub/server/oidc/clients.ts — đăng ký Relying Party ĐỌC TỪ SỔ MINI APP (ADR-032).
//
// ═══════════════════════════════════════════════════════════════════════════════
// FILE NÀY TỪNG LÀ MỘT MẢNG TYPESCRIPT — VÀ ĐÓ LÀ MỘT LỖ THU HỒI
// ═══════════════════════════════════════════════════════════════════════════════
// Trước 07/08/2026 danh sách RP nằm ngay đây, viết cứng. Dòng thứ hai của file cũ tự ghi:
// "chưa xây bảng + màn hình quản trị (chỉ cần khi ≥3-4 RP thật)". Ngưỡng ấy đặt lúc chưa
// ai đấu nối app thứ hai, và cái giá của nó không phải là bất tiện:
//
//   TẮT MỘT APP TRONG SỔ CẮT ĐƯỢC NHÚNG VÀ WEBHOOK, NHƯNG KHÔNG CẮT ĐĂNG NHẬP.
//   Client OIDC vẫn sống, vẫn đổi được authorization_code lấy token, cho tới lần deploy
//   tiếp theo. Công tắc thu hồi thu hồi được hai phần ba — và không chỗ nào nói ra điều đó.
//
// Nay danh sách đến từ `core.v_oidc_clients` (migration 0055), nơi phép lọc
// `enabled and sso_enabled` nằm ở ĐÚNG MỘT CHỖ. Tắt app trên màn quản trị là cắt cả ba
// đường trong ≤10 giây, không cần deploy.
//
// ═══════════════════════════════════════════════════════════════════════════════
// SECRET VẪN KHÔNG NẰM TRONG DATABASE
// ═══════════════════════════════════════════════════════════════════════════════
// Bảng giữ TÊN biến (`sso_client_secret_env`); giá trị đọc từ `process.env` tại đây, đúng
// khuôn `webhook_secret_env` của migration 0052. Biến chưa đặt ⇒ client KHÔNG được nạp —
// không rơi về chuỗi rỗng, không nạp "một client không có secret". Kèm một dòng log to,
// vì đây là ca người khai app tin rằng mình đã xong.
import { withSystemContext } from "@hub/core/db";

export interface OidcClientConfig {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  backchannel_logout_uri?: string;
  scopes: string[];
  /**
   * TÊN biến môi trường chứa secret. Cần ở đây (chứ không suy từ `client_id`) vì cửa sổ
   * xoay khoá đọc `<tên biến>_PREVIOUS`, và từ 0055 tên biến do người khai app đặt chứ
   * không còn là một quy ước viết trong code.
   */
  secret_env: string;
}

/**
 * Cửa sổ chồng lấn secret khi xoay khóa (yêu cầu Factory 30/07/2026).
 *
 * Vì sao cần: mỗi client trong thư viện oidc-provider chỉ giữ ĐƯỢC MỘT secret. Không có
 * cơ chế này thì đổi khóa nghĩa là Hub và RP phải đổi đúng cùng một khoảnh khắc — lệch bao
 * nhiêu giây là RP gãy im lặng bấy nhiêu giây, mà RP không hề biết trước.
 *
 * Cách dùng: đặt secret CŨ vào `<TÊN_BIẾN>_PREVIOUS` và hạn chót vào
 * `<TÊN_BIẾN>_PREVIOUS_UNTIL` (ISO 8601). Trong khoảng đó Hub nhận cả hai khóa, RP đổi lúc
 * nào cũng được. Hết hạn thì khóa cũ tự chết, không cần ai nhớ đi dọn.
 *
 * BẮT BUỘC có hạn chót: cửa sổ không có ngày đóng thì không phải cửa sổ — nó là hai khóa
 * sống song song vĩnh viễn. Thiếu/sai `_PREVIOUS_UNTIL` thì overlap KHÔNG bật, và server
 * báo lỗi to thay vì âm thầm bỏ qua.
 */
export interface PreviousSecretWindow {
  client_id: string;
  secret: string;
  until: Date;
}

export function loadPreviousSecretWindows(clients: OidcClientConfig[]): PreviousSecretWindow[] {
  const windows: PreviousSecretWindow[] = [];
  for (const client of clients) {
    const secret = process.env[`${client.secret_env}_PREVIOUS`];
    if (!secret) continue;

    const rawUntil = process.env[`${client.secret_env}_PREVIOUS_UNTIL`];
    const until = rawUntil ? new Date(rawUntil) : null;
    if (!until || Number.isNaN(until.getTime())) {
      console.error(
        `[oidc] Bỏ qua secret cũ của "${client.client_id}": thiếu hoặc sai ${client.secret_env}_PREVIOUS_UNTIL ` +
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
 * Ở LẠI trong mã, KHÔNG chuyển vào migration 0055 — cùng lý do `test-external-app` không có mặt
 * trong migration 0052: một app có secret in sẵn trong kho mà nằm trong migration thì nó lên cả
 * máy chủ thật. Chỗ đúng của nó là sau hàng rào `NODE_ENV`, tức là ở đây.
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
          secret_env: "OIDC_CLIENT_SECRET_TEST_EXTERNAL_APP",
        },
      ]
    : [];

// ---------------------------------------------------------------------------
// Nạp từ sổ đăng ký
// ---------------------------------------------------------------------------

/**
 * 10 GIÂY, đúng con số của `registry-db.ts` và vì đúng một lý do.
 *
 * Danh sách RP được hỏi trên mọi lượt `/oidc/auth` và `/oidc/token`. Hỏi database mỗi lượt
 * là thêm một vòng đi-về vào đúng đường cấp token. Nhưng bộ đệm dài làm lời hứa "tắt app là
 * cắt đăng nhập ngay" thành nói dối, đúng lúc người ta cần nó nhất. `xoaDemOidc()` được gọi
 * thẳng sau mọi mutation của màn quản trị, nên trong cùng tiến trình thì thu hồi có hiệu lực
 * tức thì; 10 giây chỉ là trần cho trường hợp có người sửa bảng bằng psql.
 */
const DEM_SONG_MS = 10_000;

interface Dong {
  client_id: string;
  redirect_uris: string[];
  backchannel_logout_uri: string | null;
  scopes: string[];
  client_secret_env: string | null;
  origin: string | null;
}

let dem: { luc: number; clients: OidcClientConfig[] } | null = null;

/** Xoá bộ đệm ngay — gọi sau mọi lần sổ đăng ký đổi. */
export function xoaDemOidc(): void {
  dem = null;
}

function hubUrl(): string {
  return process.env.HUB_URL ?? "http://localhost:3000";
}

/**
 * URI của Embed Bridge, dựng từ HUB_URL chứ KHÔNG lưu trong bảng.
 *
 * `/embed/relay` thuộc về Hub, không thuộc về app ngoài: nó chỉ đọc `code` khỏi URL rồi
 * postMessage lên đúng trang `/embed/<appId>` (cùng origin Hub) — code không rời khỏi trình
 * duyệt của Hub cho tới khi app tự đón lấy nó. Bắt người khai app tự gõ tên miền của Hub vào
 * ô redirect là bắt họ khai hộ Hub một thứ Hub tự biết, và là ghi cứng một tên miền của chính
 * mình vào dữ liệu — hôm đổi tên miền thì Embed Bridge chết mà không ai nghĩ tới việc đi sửa
 * một hàng trong CSDL.
 *
 * Chỉ thêm cho app CÓ NHÚNG (`origin` khác null): app đi Đường A thuần không bao giờ chạy
 * trong iframe của Hub, nên một redirect_uri thừa ở đó là một cửa thừa.
 */
function themUriCauNoi(uris: string[], coNhung: boolean): string[] {
  if (!coNhung) return uris;
  return [...new Set([...uris, `${hubUrl()}/embed/relay`])];
}

function doiHang(r: Dong): OidcClientConfig | null {
  // Ràng buộc `embedded_apps_sso_du_bo` đã chặn ca này ở tầng bảng; kiểm lại ở đây vì
  // TypeScript không biết điều đó, và vì một cột nullable thì kiểu của nó là nullable.
  if (!r.client_secret_env) return null;

  const secret = process.env[r.client_secret_env];
  if (!secret || secret.length === 0) {
    // KHÔNG nạp, và nói to. Đây đúng là ca người khai app điền xong form, thấy mọi thứ hiện
    // lên đẹp đẽ, rồi RP nhận `invalid_client` mà không ai nối được hai việc đó với nhau.
    // Màn `/quan-tri/mini-app` hiện đúng câu này cạnh app, nhưng log là thứ người vận hành
    // đọc lúc 11 giờ đêm.
    console.error(
      `[oidc] RP "${r.client_id}" KHÔNG được nạp: biến môi trường ${r.client_secret_env} chưa đặt trên máy chủ này. ` +
        `Mọi lượt đăng nhập qua app đó sẽ nhận invalid_client.`,
    );
    return null;
  }

  return {
    client_id: r.client_id,
    client_secret: secret,
    redirect_uris: themUriCauNoi(r.redirect_uris, !!r.origin),
    backchannel_logout_uri: r.backchannel_logout_uri ?? undefined,
    scopes: r.scopes,
    secret_env: r.client_secret_env,
  };
}

/**
 * Mọi RP đang hiệu lực. Kèm client chỉ-dev (chúng không có trong migration — xem trên).
 *
 * Chạy bằng `withSystemContext` (không SET ROLE): đây là tầng hạ tầng trả lời "client nào
 * tồn tại", và nó chạy trên đường `/oidc/token` — nơi chưa có người dùng nào để đặt vào RLS.
 * Phép lọc `enabled and sso_enabled` nằm trong chính khung nhìn, không dựa vào RLS làm hộ.
 */
export async function napOidcClients(): Promise<OidcClientConfig[]> {
  const now = Date.now();
  if (dem && now - dem.luc < DEM_SONG_MS) return dem.clients;

  const rows = await withSystemContext(async (client) => {
    const { rows } = await client.query<Dong>(
      `select client_id, redirect_uris, backchannel_logout_uri, scopes, client_secret_env, origin
         from core.v_oidc_clients
        order by client_id`,
    );
    return rows;
  });

  const clients = [...DEV_ONLY_CLIENTS, ...rows.map(doiHang).filter((c): c is OidcClientConfig => c !== null)];
  dem = { luc: now, clients };
  return clients;
}

/** Một RP theo client_id. `undefined` = không tồn tại, đang tắt, HOẶC chưa đặt secret. */
export async function timOidcClient(clientId: string): Promise<OidcClientConfig | undefined> {
  return (await napOidcClients()).find((c) => c.client_id === clientId);
}

/**
 * Hình dạng metadata mà `oidc-provider` nhận (snake_case, theo OIDC Dynamic Registration).
 *
 * MỘT chỗ dịch duy nhất, dùng chung cho cả hai đường nạp — client tĩnh lúc dựng provider và
 * client động qua adapter. Hai bản dịch nghĩa là hai bộ `grant_types` sẽ có ngày lệch nhau,
 * và bên lệch sẽ là bên không ai kiểm.
 */
export function sangMetadata(c: OidcClientConfig): Record<string, unknown> {
  return {
    client_id: c.client_id,
    client_secret: c.client_secret,
    redirect_uris: c.redirect_uris,
    ...(c.backchannel_logout_uri ? { backchannel_logout_uri: c.backchannel_logout_uri } : {}),
    // `refresh_token` bật để CHẤM DỨT mâu thuẫn tài liệu/code: `03-api.md:68,116` hứa có
    // refresh và dựa vào chính nó để thực thi "khoá là cắt" (ADR-016), trong khi `grant_types`
    // cũ chỉ có `authorization_code` — nghĩa là dòng `ttl.RefreshToken` trong provider.ts là
    // cấu hình chết, và điểm thực thi "khoá là cắt" thật ra không tồn tại. Bật rồi thì mỗi
    // lần RP đổi refresh_token, thư viện gọi lại `findAccount` — hàm đó trả `undefined` khi
    // `core.users.status <> 'active'` → grant bị từ chối.
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_basic",
    // ĐÂY LÀ MỘT SIẾT CHẶT THẬT, ghi ra để không ai tưởng là dọn dẹp (07/08/2026).
    //
    // Bản cũ khai `scopes` trong config rồi KHÔNG bao giờ truyền nó xuống thư viện. Nghĩa là
    // dòng chú thích "chỉ cho phép khai hub_profile nếu app thật sự cần vai trò — mặc định ít
    // quyền nhất" mô tả một hàng rào chưa từng tồn tại: mọi RP xin được cả bốn scope provider
    // công bố, kể cả `hub_profile` (vai + cơ sở + lớp) và `offline_access`.
    // Từ nay `scope` đi xuống thật. RP xin ngoài danh sách sẽ nhận `invalid_scope` — một lỗi
    // NGAY tại /oidc/auth, thấy được, chứ không phải một quyền lặng lẽ cấp thừa. Và cái giá
    // của việc siết nhầm nay là một ô tích trên màn quản trị, không phải một lần deploy.
    scope: c.scopes.join(" "),
  };
}
