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
  webhook_secret_env: string | null;
}

let dem: { luc: number; apps: EmbedAppConfig[] } | null = null;

/** Xoá bộ đệm ngay — gọi sau mọi lần màn quản trị sửa bảng. */
export function xoaDem(): void {
  dem = null;
}

function doiHang(r: Dong): EmbedAppConfig {
  // Secret KHÔNG nằm trong database (xem đầu 0052). Bảng chỉ nói tên biến; giá trị lấy từ
  // môi trường tại đây. Biến chưa đặt ⇒ `undefined` ⇒ `verifyWebhookSecret` đóng cổng —
  // KHÔNG rơi về chuỗi rỗng, vì `"" === ""` là true và đó đúng là lỗ hổng đã có thật hồi
  // 31/07/2026 (gửi header `x-embed-secret:` rỗng là qua được).
  const env = r.webhook_secret_env ? process.env[r.webhook_secret_env] : undefined;
  return {
    appId: r.app_id,
    webhookSecret: env && env.length > 0 ? env : undefined,
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
              origin, iframe_url, icon_image_url, intro, webhook_secret_env
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
