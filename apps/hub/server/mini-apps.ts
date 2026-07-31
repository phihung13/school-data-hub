// apps/hub/server/mini-apps.ts — lưới mini app trang chủ, suy ra THUẦN TÚY từ vai trò.
// Tách khỏi routers/session.ts để trang chủ (server component) gọi được trực tiếp mà không
// phải kéo cả cây tRPC vào: nhờ vậy lưới có sẵn ngay trong HTML lần đầu, không còn cảnh
// "Giai đoạn 1 · 0 app" nhấp nháy rồi mới nhảy thành 2 app (bắt gặp thật 30/07/2026).
//
// DESIGN-GUIDELINES §1: "phân quyền ở mini app, không ở trang chủ" — chỉ trả về danh sách
// tile hiện/mờ theo vai trò, KHÔNG tự kiểm tra quyền nghiệp vụ.
import type { HubRole, MiniAppTile } from "@hub/core/contracts";

/**
 * Vai nhân viên — liệt kê TƯỜNG MINH, không suy bằng phép phủ định.
 * Trước 31/07/2026: `isStaff = !isStudentOrGuardian`, nên tài khoản chưa được gán
 * vai nào (roles = []) cũng thành nhân viên và nhận tile Factory. Ở hệ dữ liệu trẻ
 * em, "không biết anh là ai" phải ra ÍT quyền hơn, không phải nhiều hơn.
 */
const STAFF_ROLES: HubRole[] = ["teacher", "homeroom", "counselor", "principal", "board", "admin"];

export function buildMiniApps(roles: HubRole[]): MiniAppTile[] {
  const isStudentOrGuardian = roles.includes("student") || roles.includes("guardian");
  // Buồng lái /gvcn tự chặn `roles.includes("homeroom")` rồi đá về /home (app/gvcn/page.tsx:9).
  // Nếu ở đây cấp tile cho cả tư vấn cụm thì Cô Mai bấm vào chỉ thấy mình bị đẩy ngược
  // ra trang chủ, không lời giải thích — tile dẫn tới trang mình không vào được cũng là
  // một dạng menu 404. Mở lại cho counselor khi buồng lái có phạm vi cụm thật.
  const isHomeroom = roles.includes("homeroom");
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r));

  const tiles: MiniAppTile[] = [];
  if (isStudentOrGuardian) {
    tiles.push(
      { key: "attendance", label: "Điểm danh", icon: "fact_check", href: "/checkin", available: true },
      { key: "report", label: "Báo cáo", icon: "workspace_premium", href: "/bao-cao", available: true },
      { key: "study", label: "Học tập · GĐ2", icon: "menu_book", href: "#", available: false },
      { key: "health", label: "Y tế · GĐ2", icon: "favorite", href: "#", available: false },
    );
  }
  if (isHomeroom) {
    tiles.push({ key: "cockpit", label: "Buồng lái", icon: "space_dashboard", href: "/gvcn", available: true });
  }
  if (isStaff) {
    // Tier 2 — Embed Bridge (08-embedded-apps.md mục 3), app ngoài factory.vietanh.org.
    // Logo thật, tự host tại public/factory-icon.svg (tải về từ factory.vietanh.org/icon.svg
    // 29/07/2026) — không trỏ thẳng domain ngoài để không phụ thuộc Factory còn sống hay không.
    tiles.push({
      key: "factory",
      label: "Factory",
      icon: "auto_awesome",
      iconImageUrl: "/factory-icon.svg",
      href: "/embed/factory",
      available: true,
    });
  }
  return tiles;
}
