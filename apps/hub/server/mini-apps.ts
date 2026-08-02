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
  // Sửa 31/07/2026 (gói "menu-noi-dung-dich"): học sinh và phụ huynh KHÔNG còn dùng chung
  // một nhánh. Trước đó phụ huynh nhận nguyên lưới của học sinh, trong đó tile "Điểm danh"
  // trỏ /checkin — mà app/checkin/page.tsx:10 chặn mọi vai không phải học sinh rồi đá về
  // /home. Phụ huynh bấm tile đầu tiên trên trang chủ của mình là bị đẩy ngược, không một
  // lời giải thích: đúng dạng "menu 404" mà chú thích ngay dưới đây đã cảnh báo cho
  // counselor nhưng lại không áp cho guardian.
  const isStudent = roles.includes("student");
  const isGuardian = roles.includes("guardian");
  // Buồng lái /gvcn tự chặn `roles.includes("homeroom")` rồi đá về /home (app/gvcn/page.tsx:9).
  // Nếu ở đây cấp tile cho cả tư vấn cụm thì Cô Mai bấm vào chỉ thấy mình bị đẩy ngược
  // ra trang chủ, không lời giải thích — tile dẫn tới trang mình không vào được cũng là
  // một dạng menu 404. Mở lại cho counselor khi buồng lái có phạm vi cụm thật.
  const isHomeroom = roles.includes("homeroom");
  // Tâm lý cụm có màn thật từ 31/07/2026 (gói "man-hinh-tam-ly-cum"): /tam-ly là hộp
  // việc của cụm, /tam-ly/ho-so/<em> là hồ sơ một em. Trước đó vai này đăng nhập vào
  // Hub là ngõ cụt — không một tile nào, không một mục điều hướng nào — trong khi cô
  // GHI được ba thứ nặng nhất của hệ chăm sóc (tắt cờ khẩn, ghi can thiệp, đóng hồ sơ).
  // Tile này mở đúng bằng thứ đã có màn: không cấp cho vai khác, vì app/tam-ly/page.tsx
  // tự chặn `roles.includes("counselor")` rồi đá về /home — tile dẫn tới trang mình
  // không vào được cũng là một dạng menu 404 (xem chú thích của isHomeroom ở trên).
  const isCounselor = roles.includes("counselor");
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r));

  const tiles: MiniAppTile[] = [];
  if (isStudent) {
    tiles.push(
      // Nhãn nói đúng VIỆC, không nói đúng MIỀN: /checkin là nơi em ghi tâm trạng sáng nay,
      // còn /diem-danh (sidebar, nhãn "Lịch điểm danh") là nơi xem lại lịch sử. Trước đây cả
      // hai đều mang nhãn "Điểm danh" nên trên máy tính em thấy hai mục cùng tên dẫn tới hai
      // trang khác nhau — một nhãn hai đích thì nhãn không còn nghĩa gì.
      { key: "checkin", label: "Check-in cảm xúc", icon: "sentiment_satisfied", href: "/checkin", available: true },
      { key: "report", label: "Báo cáo", icon: "workspace_premium", href: "/bao-cao", available: true },
      { key: "study", label: "Học tập · GĐ2", icon: "menu_book", href: "#", available: false },
      { key: "health", label: "Y tế · GĐ2", icon: "favorite", href: "#", available: false },
    );
  } else if (isGuardian) {
    // Phụ huynh: đúng MỘT màn có thật trong GĐ1 là Báo cáo Trưởng thành (khớp
    // GUARDIAN_ITEMS ở hub-sidebar.tsx và GUARDIAN_TABBAR_ITEMS ở tab-bar.tsx).
    //
    // "Điểm danh của con" giữ lại ở thể MỜ chứ không xoá hẳn: 02-database.md:56 đã cấp
    // quyền đọc attendance cho guardian nhưng chưa có màn hình nào, mà đây lại là câu hỏi
    // số một của phụ huynh buổi sáng. Tile mờ nói thật "chưa có"; xoá hẳn thì phụ huynh
    // tự đoán là hệ thống không theo dõi việc đó. Bấm được thì mới là hứa suông — ở đây
    // href "#" và available:false nên không bấm được (mini-app-tile.tsx render <div>).
    // Đổi thành <Link> thật khi gói "mobile-cho-man-con-thieu" dựng xong màn.
    tiles.push(
      { key: "report", label: "Báo cáo", icon: "workspace_premium", href: "/bao-cao", available: true },
      { key: "attendance", label: "Điểm danh của con · sắp", icon: "fact_check", href: "#", available: false },
      { key: "health", label: "Y tế · GĐ2", icon: "favorite", href: "#", available: false },
    );
  }
  if (isHomeroom) {
    tiles.push({ key: "cockpit", label: "Bảng điều khiển", icon: "space_dashboard", href: "/gvcn", available: true });
  }
  if (isCounselor) {
    tiles.push({ key: "counselor", label: "Tâm lý cụm", icon: "psychology", href: "/tam-ly", available: true });
  }
  // Màn Điều hành (/dieu-hanh) dựng thật 31/07/2026 cho hiệu trưởng cơ sở và ban điều
  // hành; tile này thêm 01/08/2026. Trước đó màn chạy được nhưng không có đường nào dẫn
  // tới — vào được chỉ bằng cách gõ URL. Cùng luật với hai nhánh trên: chỉ cấp cho đúng
  // vai mà app/dieu-hanh/page.tsx cho qua (principal/board), vì tile dẫn tới trang mình
  // bị đá ngược cũng là một dạng menu 404.
  if (roles.includes("principal") || roles.includes("board")) {
    tiles.push({ key: "operations", label: "Điều hành", icon: "bar_chart", href: "/dieu-hanh", available: true });
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
