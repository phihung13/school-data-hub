// apps/hub/server/embed/registry-db.ts — SỔ ĐĂNG KÝ MINI APP ĐỌC TỪ CSDL (migration 0052).
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO LÀ MỘT FILE RIÊNG, KHÔNG NHÉT VÀO registry.ts
// ═══════════════════════════════════════════════════════════════════════════════
// `registry.ts` phải nạp được trên BA runtime, trong đó có Edge (middleware của Next).
// Edge không có `net`/`tls` nên không chạy được `pg`. Ngày 31/07/2026 một dòng
// `import "node:crypto"` trong file đó đã làm hỏng bundle Edge, và vì middleware phủ
// toàn site nên MỌI trang trả 500 — kể cả /login.
//
// Nên chia đôi theo đúng ranh giới runtime:
//   · `registry.ts`    — kiểu dữ liệu + hàm THUẦN (canOpenEmbedApp, verifyWebhookSecret).
//                        Nạp được ở cả ba nơi. KHÔNG chạm database.
//   · `registry-db.ts` — file này. CHỈ Node: Server Component, Route Handler, job nền.
//
// Middleware (Edge) không nhập file này. Nó lấy origin qua `/api/embed/manifest` —
// xem chú thích trong chính middleware.ts về việc vì sao fail-closed ở đó.
//
// ═══════════════════════════════════════════════════════════════════════════════
// BỘ NHỚ ĐỆM: 10 GIÂY, VÀ VÌ SAO ĐÚNG BẰNG ĐÓ
// ═══════════════════════════════════════════════════════════════════════════════
// Danh sách app được hỏi trên đường dựng của MỌI trang chủ và MỌI lượt mở /embed/*.
// Hỏi database mỗi lượt là thêm một vòng đi-về vào TTFB của trang bận nhất.
//
// Nhưng chú thích của migration 0052 hứa một điều cụ thể: "tắt ở đây là app biến khỏi hệ
// NGAY LƯỢT REQUEST KẾ TIẾP — không cần deploy". Bộ đệm dài làm lời hứa đó thành nói dối,
// và nó nói dối đúng lúc người ta cần nó nhất: lúc đang thu hồi một app vừa lộ dữ liệu.
// 10 giây là chỗ đứng giữa. Ngoài ra `xoaDem()` được gọi THẲNG sau mọi mutation của màn
// quản trị, nên trong cùng tiến trình thì thu hồi có hiệu lực tức thì; 10 giây chỉ là
// trần cho trường hợp có người sửa bảng bằng psql.
//
// Hub chạy MỘT tiến trình (modular monolith, 01-architecture.md §7) nên bộ đệm trong RAM
// chính là bộ đệm toàn hệ. Ngày nào chạy nhiều instance thì mỗi instance ôm bản riêng và
// trần 10 giây là thứ duy nhất còn bảo đảm — ghi ra đây để hôm đó không ai phải đoán.
import { withSystemContext } from "@hub/core/db";
import { xoaDemOidc } from "../oidc/clients";
import type { EmbedAppConfig } from "./registry";
import { DEV_ONLY_APPS } from "./registry";
import type { HubRole } from "@hub/core/contracts";

const DEM_SONG_MS = 10_000;

interface Dong {
  app_id: string;
  display_name: string;
  basket: string;
  allowed_roles: string[];
  allowed_event_types: string[];
  origin: string | null;
  iframe_url: string | null;
  icon_image_url: string | null;
  intro: string | null;
}

let dem: { luc: number; apps: EmbedAppConfig[] } | null = null;

/**
 * Xoá bộ đệm ngay — gọi sau mọi lần màn quản trị sửa bảng.
 *
 * Xoá CẢ HAI bộ đệm đang đọc `core.embedded_apps`: bộ này (nhúng + webhook) và bộ RP OIDC
 * trong `oidc/clients.ts`. Một bảng, hai người đọc, nên "xoá đệm sổ đăng ký" phải là MỘT
 * lời gọi — bắt bốn chỗ trong `routers/admin.ts` nhớ gọi hai hàm là thiết kế ra đúng cái
 * lỗi sẽ xảy ra: chỗ thứ năm quên hàm thứ hai, và app vừa thu hồi vẫn đăng nhập được thêm
 * mười giây nữa mà không ai giải thích nổi vì sao.
 */
export function xoaDem(): void {
  dem = null;
  xoaDemOidc();
}

/**
 * MỘT CHUỖI DÙNG CHUNG CHO MỌI APP — quyết định của chủ đầu tư 08/08/2026.
 *
 * Nguyên văn: *"ko cần chuỗi bí mật nào đâu, mặc định chuỗi là vietanh2026, cho mọi app,
 * nào tôi đổi chuỗi thì mọi app đều cần đổi"*.
 *
 * Đổi lấy gì: bỏ hẳn bước "đặt một biến môi trường cho mỗi app mới + khởi động lại". Đó là
 * bước duy nhất còn bắt người vận hành chạm vào máy chủ mỗi lần cắm một app, và nó là chỗ
 * quy trình hay tắc nhất.
 *
 * ─── RỦI RO, ĐO CHỨ KHÔNG ĐOÁN ────────────────────────────────────────────────────────
 * `vietanh2026` đoán được trong vài lần thử, và cổng webhook mở ra Internet. Người đoán
 * trúng làm được gì:
 *   · BƠM DỮ LIỆU RÁC vào `staging` + `ops.embedded_app_events` dưới tên app bất kỳ. Có
 *     thật, phải đi dọn.
 *   · KHÔNG đọc được gì — cổng này chỉ ghi, phản hồi chỉ có một mã trạng thái.
 *   · GẮN ĐƯỢC vào một em, nhưng chỉ em ĐÃ TỪNG ĐĂNG NHẬP vào chính app đó — ĐỔI TỪ
 *     21/08/2026 (ADR-038, migration 0061), và đổi theo chiều XẤU ĐI, nên ghi lại rõ.
 *     Bản cũ: alias là chuỗi ngẫu nhiên 32 ký tự, không đoán ra ⇒ "không gắn được vào
 *     em nào". Bản nay: app gửi `user_id` thật, mà id của một em lộ ra ở nhiều chỗ hơn
 *     hẳn một chuỗi ngẫu nhiên. Hàng rào còn lại là `core.identity_links` — người đoán
 *     trúng chuỗi chỉ ghi bậy được cho những người đã dùng app đó, không phải cho cả
 *     trường. `user_id` lạ hoặc chưa đăng nhập ⇒ hàng đợi lỗi, không lưu (0061).
 *   · KHÔNG tự chế được token đăng nhập — chuỗi này dùng cho CẢ đường đăng nhập từ 08/08
 *     (*"gộp đi"*, migration 0057), nhưng PKCE bắt buộc và `redirect_uri` khớp tuyệt đối
 *     vẫn gác, và cả hai không đụng tới `client_secret`.
 * Nên thiệt hại là rác phải dọn, không phải lộ dữ liệu. Chấp nhận được khi kho còn 109 em
 * bịa tên; PHẢI đổi sang chuỗi không đoán được trước ngày nạp danh sách thật (nợ #65).
 *
 * KHÔNG CÒN KHOÁ RIÊNG cho từng app (0058, *"thì bạn cứ yêu cầu app theo khoá của bạn"*).
 * Hai cột `webhook_secret_env`/`sso_client_secret_env` đã bị xoá khỏi bảng — một trường
 * còn tồn tại là một trường còn khai được, và ngày có người khai là ngày nó hỏng câm.
 */
const SECRET_CHUNG_MAC_DINH = "vietanh2026";

function secretChung(): string {
  const v = (process.env.EMBED_WEBHOOK_SECRET_CHUNG ?? "").trim();
  return v.length > 0 ? v : SECRET_CHUNG_MAC_DINH;
}

function doiHang(r: Dong): EmbedAppConfig {
  // Secret KHÔNG nằm trong database (xem đầu 0052) — và từ 0058 thì cả TÊN biến cũng không.
  //
  // MỌI app dùng chuỗi chung — không còn nhánh nào khác (0058, chủ đầu tư: *"thì bạn cứ
  // yêu cầu app theo khoá của bạn"*). Hai cột `webhook_secret_env`/`sso_client_secret_env`
  // đã bị xoá khỏi bảng, nên ở đây không còn gì để tra và không còn ca nào để phân biệt.
  //
  // KHÔNG bao giờ rơi về chuỗi rỗng: `"" === ""` là true, và đó đúng là lỗ hổng đã có thật
  // hồi 31/07/2026 (gửi header `x-embed-secret:` rỗng là qua được). `secretChung()` luôn
  // trả một chuỗi khác rỗng nên nhánh đó không tồn tại nữa.
  return {
    appId: r.app_id,
    webhookSecret: secretChung(),
    basket: r.basket as EmbedAppConfig["basket"],
    allowedEventTypes: r.allowed_event_types,
    allowedRoles: r.allowed_roles as HubRole[],
    embed:
      r.origin && r.iframe_url
        ? {
            displayName: r.display_name,
            origin: r.origin,
            iframeUrl: r.iframe_url,
            iconImageUrl: r.icon_image_url ?? undefined,
            intro: r.intro ?? undefined,
          }
        : undefined,
  };
}

/**
 * Mọi app ĐANG BẬT. Kèm các app chỉ-dev của `registry.ts` (chúng không có trong migration
 * — đưa một app có secret in sẵn trong kho vào migration là đưa nó lên cả máy chủ thật).
 *
 * Chạy bằng `withSystemContext` (không SET ROLE): đây là tầng hạ tầng trả lời "app nào
 * tồn tại", nó chạy cả trên đường webhook — nơi KHÔNG có người dùng nào để đặt vào RLS.
 * Chính sách RLS của bảng lo việc che app tắt với người dùng cuối; ở đây câu truy vấn tự
 * lọc `enabled` một cách tường minh, không dựa vào RLS để làm hộ.
 */
export async function napApps(): Promise<EmbedAppConfig[]> {
  const now = Date.now();
  if (dem && now - dem.luc < DEM_SONG_MS) return dem.apps;

  const rows = await withSystemContext(async (client) => {
    const { rows } = await client.query<Dong>(
      `select app_id, display_name, basket, allowed_roles, allowed_event_types,
              origin, iframe_url, icon_image_url, intro
         from core.embedded_apps
        where enabled
        order by display_name`,
    );
    return rows;
  });

  const apps = [...DEV_ONLY_APPS, ...rows.map(doiHang)];
  dem = { luc: now, apps };
  return apps;
}

/** Một app theo mã. `undefined` = không tồn tại HOẶC đang tắt — hai thứ đó cố ý không phân biệt. */
export async function timApp(appId: string): Promise<EmbedAppConfig | undefined> {
  return (await napApps()).find((a) => a.appId === appId);
}

/**
 * Danh sách cho middleware: chỉ mã app + origin của app CÓ NHÚNG.
 *
 * Cố ý hẹp. Middleware chỉ cần đúng hai trường để dựng `frame-src`, mà endpoint phục vụ
 * nó (`/api/embed/manifest`) không yêu cầu đăng nhập — càng ít trường đi ra thì càng ít
 * thứ phải cân nhắc mỗi lần thêm cột vào bảng.
 */
export async function napOriginNhung(): Promise<Array<{ appId: string; origin: string }>> {
  return (await napApps())
    .filter((a): a is EmbedAppConfig & { embed: NonNullable<EmbedAppConfig["embed"]> } => !!a.embed)
    .map((a) => ({ appId: a.appId, origin: a.embed.origin }));
}
