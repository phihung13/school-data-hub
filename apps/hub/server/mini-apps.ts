// apps/hub/server/mini-apps.ts — lưới mini app trang chủ.
//
// Tách khỏi routers/session.ts để trang chủ (server component) gọi được trực tiếp mà không
// phải kéo cả cây tRPC vào: nhờ vậy lưới có sẵn ngay trong HTML lần đầu, không còn cảnh
// "Giai đoạn 1 · 0 app" nhấp nháy rồi mới nhảy thành 2 app (bắt gặp thật 30/07/2026).
//
// ═══════════════════════════════════════════════════════════════════════════════
// FILE NÀY KHÔNG CÒN QUYẾT ĐỊNH GÌ NỮA (02/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// Trước hôm nay nó có 11 dòng `if` theo vai, và hai file khác (`hub-sidebar.tsx`,
// `tab-bar.tsx`) cũng có bộ `if` riêng cho CÙNG một câu hỏi: "vai này thấy gì". Ba nơi
// trả lời một câu hỏi thì rồi sẽ có ngày ba câu trả lời khác nhau — và đã có, ba lần, mỗi
// lần đều im lặng (kể lại đầy đủ ở đầu `apps/hub/lib/man-hinh.ts`).
//
// Nay còn đúng hai việc, cả hai đều là phép LỌC chứ không phải phép quyết định:
//   · đọc bản khai màn hình của Hub (`manChoLuoi`);
//   · nối thêm Mini App NGOÀI từ `core.embedded_apps` (migration 0052).
//
// DESIGN-GUIDELINES §1: "phân quyền ở mini app, không ở trang chủ" — lưới này chỉ hiện/mờ
// theo vai, KHÔNG tự kiểm quyền nghiệp vụ. Hàng rào thật nằm ở chính trang đích.
import type { HubRole, MiniAppTile } from "@hub/core/contracts";
import { manChoLuoi } from "@/lib/man-hinh";
import { napApps } from "./embed/registry-db";
import { canOpenEmbedApp } from "./embed/registry";

/** Lưới của riêng Hub — CHƯA gồm app ngoài. Hàm thuần: test được mà không cần database. */
export function buildMiniApps(roles: HubRole[]): MiniAppTile[] {
  return manChoLuoi(roles).map((m) => ({
    key: m.key,
    label: m.nhan,
    icon: m.icon,
    href: m.href,
    // `sapCo` có giá trị = màn chưa dựng xong ⇒ ô MỜ, không bấm được
    // (mini-app-tile.tsx render <div> thay vì <Link>). Cho bấm được là hứa suông.
    available: !m.sapCo,
  }));
}

/**
 * Lưới đầy đủ = màn của Hub (bản khai) + Mini App NGOÀI (bảng `core.embedded_apps`, 0052).
 *
 * DÙNG LẠI `canOpenEmbedApp`, không tự viết phép so vai ở đây. Cùng một hàm quyết định
 * "ai mở được app này" ở cả ba cửa: lưới tile, trang /embed/<id>, và findAccount của OIDC.
 * Ba chỗ tự so vai là ba chỗ sẽ lệch, và chỗ lệch là chỗ tile hiện ra rồi bấm vào bị 404.
 */
export async function buildMiniAppsWithEmbedded(roles: HubRole[]): Promise<MiniAppTile[]> {
  const tiles = buildMiniApps(roles);
  let apps: Awaited<ReturnType<typeof napApps>>;
  try {
    apps = await napApps();
  } catch {
    // Sổ đăng ký hỏng: trả lưới của riêng Hub thay vì để cả trang chủ đổ. Người dùng mất
    // tile app ngoài — thấy được ngay — chứ không mất luôn Check-in và Báo cáo.
    return tiles;
  }
  for (const app of apps) {
    if (!app.embed) continue; // app chỉ đi Đường B (webhook), không có UI để mà mở
    if (!canOpenEmbedApp(app, roles)) continue;
    tiles.push({
      key: app.appId,
      label: app.embed.displayName,
      // `auto_awesome` là icon dự phòng khi app chưa tự host logo. Tên này CÓ trong font
      // đã cắt gọn (public/fonts/icon-names.txt) — tên ngoài danh sách vẽ ra ô trống.
      icon: "auto_awesome",
      iconImageUrl: app.embed.iconImageUrl,
      href: `/embed/${app.appId}`,
      available: true,
    });
  }
  return tiles;
}
