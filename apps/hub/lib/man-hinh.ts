// apps/hub/lib/man-hinh.ts — MỘT BẢN KHAI cho mọi màn hình của Hub.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO GOM LẠI (02/08/2026, chủ đầu tư: "trang home của mỗi người bị phân mảnh,
// tôi khó kiểm soát hết được")
// ═══════════════════════════════════════════════════════════════════════════════
// Trước hôm nay, câu hỏi "vai này thấy gì" được BA nơi tự trả lời riêng:
//
//     apps/hub/server/mini-apps.ts    11 dòng  → ô nào hiện trên lưới trang chủ
//     apps/hub/components/hub-sidebar.tsx  8   → mục nào hiện ở menu trái
//     apps/hub/components/tab-bar.tsx      7   → tab nào hiện dưới đáy điện thoại
//
// Ba nơi, một câu hỏi, ba câu trả lời viết tay. Hậu quả không phải giả định — nó đã xảy
// ra ba lần và mỗi lần đều IM LẶNG:
//
//   · Màn Điều hành (/dieu-hanh) chạy thật, dữ liệu đủ, quyền đủ — và suốt hai ngày
//     KHÔNG một mục điều hướng nào dẫn tới. Người duy nhất vào được là người đã biết
//     phải gõ URL. Với người dùng, màn đó không tồn tại.
//   · Cô Mai mở Hub trên máy tính thì thấy hộp việc tâm lý; mở trên ĐIỆN THOẠI — thiết
//     bị chính theo DESIGN-GUIDELINES §3 — thì không thấy đâu cả, vì tab-bar.tsx chưa
//     kịp thêm nhánh mà hub-sidebar.tsx đã có.
//   · Mục "Hồ sơ" đứng ở BA nơi cùng lúc cho cùng một người.
//
// Không cái nào trong ba cái đó làm hỏng build, hỏng test, hay in ra một dòng lỗi.
//
// ═══════════════════════════════════════════════════════════════════════════════
// MÔ HÌNH: GIỐNG HỆT SỔ ĐĂNG KÝ MINI APP, CHỈ KHÁC CHỖ CẤT
// ═══════════════════════════════════════════════════════════════════════════════
// `core.embedded_apps` (migration 0052) đã làm đúng cho app NGOÀI: mỗi app tự khai
// `allowed_roles`, và lưới tile chỉ là một phép lọc — không một dòng `if` nào theo vai.
// File này là đúng mô hình đó cho màn của CHÍNH Hub.
//
// KHÁC MỘT ĐIỀU, và điều đó có chủ ý: bản khai này nằm trong MÃ, không nằm trong CSDL.
//   · Quyền vào /tam-ly đã được chính `app/tam-ly/page.tsx` cưỡng chế bằng một câu
//     redirect. Thêm một bản trong CSDL là dựng HAI nguồn sự thật cho cùng một hàng rào
//     — và hai nguồn thì sẽ có ngày lệch, còn chỗ lệch là chỗ không ai kiểm.
//   · Không nên tồn tại một cái nút cho phép ai đó cấp cho học sinh quyền vào màn tâm lý
//     bằng một cú bấm. App ngoài thì khác: chúng KHÔNG có hàng rào nào ngoài bảng đó, và
//     chúng cần tắt được trong mười giây.
//
// Cổng `tests/unit/man-hinh.test.ts` đối chiếu `vai` ở đây với câu redirect thật trong
// từng `page.tsx`. Khai sai là CI đỏ — không phải người dùng bị đá ngược về /home.
import type { HubRole } from "@hub/core/contracts";

/** Vai nhân viên — dùng cho những màn mở cho "mọi người lớn". Liệt kê TƯỜNG MINH. */
export const VAI_NHAN_VIEN: HubRole[] = [
  "teacher",
  "homeroom",
  "counselor",
  "principal",
  "board",
  "admin",
];

/**
 * Một màn hiện ra ở một BỀ MẶT (lưới tile · menu trái · thanh tab).
 *
 * `vai` ở đây KHÔNG phải quyền truy cập — quyền nằm ở `ManHinh.vai`. Nó là phép THU HẸP
 * thêm cho riêng bề mặt này, và chỉ dùng khi có lý do thật:
 *   · Thanh tab của học sinh có trần 3 ô và ô giữa là nút Check-in tròn nổi (hành động
 *     chính mỗi sáng của em). Thêm "Báo cáo" vào đó là phá bố cục đã thiết kế, nên
 *     /bao-cao khai `tab: { vai: ["guardian"] }` — phụ huynh có, học sinh không.
 *   · Không dùng nó để giấu bớt cho gọn. Giấu một màn khỏi mọi bề mặt = màn đó không
 *     tồn tại với người dùng, và đó phải là một quyết định được viết ra.
 */
export interface BeMat {
  /** Thu hẹp thêm so với `ManHinh.vai`. Bỏ trống = mọi vai vào được đều thấy. */
  vai?: HubRole[];
  /** Nhãn riêng cho bề mặt này. Bỏ trống = dùng `ManHinh.nhan`. */
  nhan?: string;
  /** Thứ tự trong bề mặt. Nhỏ đứng trước. */
  thuTu: number;
}

export interface ManHinh {
  key: string;
  /** `"#"` = chưa dựng xong (mục mờ). Xem `sapCo`. */
  href: string;
  icon: string;
  /** Nhãn đầy đủ. Từng bề mặt đè lại được nếu chỗ đó chật (thanh tab ~70px). */
  nhan: string;
  /**
   * AI VÀO ĐƯỢC. `"moi-nguoi"` = mọi người đã đăng nhập.
   *
   * PHẢI KHỚP câu redirect thật trong `app/<...>/page.tsx`. Khai rộng hơn hàng rào thật
   * thì người dùng bấm vào và bị đá ngược về /home không một lời giải thích — "menu 404",
   * lỗi mà kho này đã sửa ba lần. Khai hẹp hơn thì màn có thật mà không ai tới được.
   * `tests/unit/man-hinh.test.ts` đối chiếu hai bên.
   */
  vai: HubRole[] | "moi-nguoi";
  luoi?: BeMat;
  menu?: BeMat;
  tab?: BeMat;
  /**
   * Nhãn trạng thái cho màn CHƯA dựng xong ("GĐ2", "sắp"). Có giá trị ⇒ mục mờ, KHÔNG
   * bấm được. Cho bấm được là hứa suông; và mục mờ cũng là một lời hứa, nên nó chỉ được
   * hiện với đúng vai sẽ dùng nó.
   */
  sapCo?: string;
}

/**
 * TOÀN BỘ màn của Hub. Thêm một màn = thêm MỘT dòng ở đây, và nó tự có mặt ở lưới, menu
 * và thanh tab theo đúng những gì dòng đó khai.
 *
 * Mini App NGOÀI không nằm ở đây — chúng đọc từ `core.embedded_apps` (0052) và được nối
 * vào lưới trong `buildMiniAppsWithEmbedded`.
 */
export const MAN_HINH: ManHinh[] = [
  // ── Chung cho mọi vai ──────────────────────────────────────────────────────
  {
    key: "home",
    href: "/home",
    icon: "home",
    nhan: "Trang chủ",
    vai: "moi-nguoi",
    menu: { thuTu: 0 },
    tab: { thuTu: 0 },
    // KHÔNG có `luoi`: một ô "Trang chủ" nằm trên chính trang chủ là một ô dẫn về chỗ
    // đang đứng.
  },

  // ── Học sinh ───────────────────────────────────────────────────────────────
  {
    key: "checkin",
    href: "/checkin",
    icon: "sentiment_satisfied",
    nhan: "Check-in cảm xúc",
    vai: ["student"],
    luoi: { thuTu: 10 },
    // Thanh tab: đây là ô GIỮA, nút tròn nổi — hành động chính mỗi sáng của em. Nhãn rút
    // gọn vì ô rộng ~70px.
    tab: { thuTu: 10, nhan: "Check-in" },
    // KHÔNG có `menu`: menu trái đã có "Lịch điểm danh" (/diem-danh) là nơi XEM LẠI. Hai
    // mục cùng miền mà khác việc thì phải khác nhãn, và trước 31/07/2026 cả hai cùng tên
    // "Điểm danh" nên trên máy tính em thấy một nhãn ở hai chỗ dẫn đi hai nơi.
  },
  {
    key: "week",
    href: "/tuan-nay",
    icon: "insights",
    nhan: "Tuần này của mình",
    vai: ["student"],
    menu: { thuTu: 20 },
  },
  {
    key: "attendance",
    href: "/diem-danh",
    icon: "fact_check",
    nhan: "Lịch điểm danh",
    vai: ["student"],
    menu: { thuTu: 30 },
  },
  {
    key: "report",
    href: "/bao-cao",
    icon: "workspace_premium",
    nhan: "Báo cáo Trưởng thành",
    vai: ["student", "guardian"],
    luoi: { thuTu: 20, nhan: "Báo cáo" },
    menu: { thuTu: 40 },
    // Chỉ phụ huynh — xem lý lẽ ở `BeMat.vai`.
    tab: { thuTu: 20, vai: ["guardian"], nhan: "Báo cáo" },
  },

  // ── Phụ huynh ──────────────────────────────────────────────────────────────
  {
    key: "attendance-con",
    href: "#",
    icon: "fact_check",
    nhan: "Điểm danh của con",
    vai: ["guardian"],
    // Giữ ở thể MỜ chứ không xoá hẳn: 02-database.md đã cấp quyền đọc attendance cho phụ
    // huynh nhưng chưa có màn nào, mà đây lại là câu hỏi số một của phụ huynh buổi sáng.
    // Ô mờ nói thật "chưa có"; xoá hẳn thì phụ huynh tự đoán là trường không theo dõi.
    sapCo: "sắp",
    luoi: { thuTu: 30, nhan: "Điểm danh của con · sắp" },
  },

  // ── Chủ nhiệm ──────────────────────────────────────────────────────────────
  {
    key: "cockpit",
    href: "/gvcn",
    icon: "space_dashboard",
    nhan: "Bảng điều khiển",
    vai: ["homeroom"],
    luoi: { thuTu: 40 },
    menu: { thuTu: 10 },
    tab: { thuTu: 10 },
  },
  {
    key: "klass",
    href: "/gvcn/lop",
    icon: "groups",
    nhan: "Lớp chủ nhiệm",
    vai: ["homeroom"],
    menu: { thuTu: 20 },
  },
  {
    key: "attendance-lop",
    href: "/gvcn/diem-danh",
    icon: "fact_check",
    nhan: "Điểm danh lớp",
    vai: ["homeroom"],
    menu: { thuTu: 30 },
    tab: { thuTu: 20, nhan: "Điểm danh" },
  },
  {
    key: "review",
    href: "/gvcn/duyet-bao-cao",
    icon: "rate_review",
    nhan: "Duyệt báo cáo",
    vai: ["homeroom"],
    menu: { thuTu: 40 },
  },
  {
    key: "notes",
    href: "/gvcn/ghi-chu",
    icon: "edit_note",
    nhan: "Ghi chú can thiệp",
    vai: ["homeroom"],
    menu: { thuTu: 50 },
  },

  // ── Tâm lý cụm ─────────────────────────────────────────────────────────────
  {
    key: "psych",
    href: "/tam-ly",
    icon: "psychology",
    nhan: "Tâm lý cụm",
    vai: ["counselor"],
    luoi: { thuTu: 50 },
    menu: { thuTu: 10 },
    tab: { thuTu: 10 },
  },

  // ── Hiệu trưởng / ban giám hiệu ────────────────────────────────────────────
  {
    key: "operations",
    href: "/dieu-hanh",
    icon: "bar_chart",
    nhan: "Điều hành",
    vai: ["principal", "board"],
    luoi: { thuTu: 60 },
    menu: { thuTu: 10 },
    tab: { thuTu: 10 },
  },

  // ── Quản trị ───────────────────────────────────────────────────────────────
  {
    key: "xem-truoc",
    href: "/quan-tri/xem-truoc",
    icon: "visibility",
    nhan: "Trang chủ theo vai",
    vai: ["admin"],
    menu: { thuTu: 55 },
    // KHÔNG ở thanh tab: trần 4 ô của DESIGN-GUIDELINES §6, và đây là màn ngồi đọc bằng
    // mắt trên màn rộng — sáu cột trên một máy 360px thì không đọc được gì.
  },
  {
    key: "miniapp",
    href: "/quan-tri/mini-app",
    icon: "space_dashboard",
    nhan: "Mini App",
    vai: ["admin"],
    menu: { thuTu: 60 },
    tab: { thuTu: 30 },
    // KHÔNG có `luoi`: lưới trang chủ là nơi làm VIỆC HÀNG NGÀY. Sổ đăng ký app là việc
    // vài tháng một lần — đặt nó cạnh Check-in là sai nhịp.
  },

  // ── Chưa dựng — mục mờ, theo đúng vai sẽ dùng ──────────────────────────────
  {
    key: "study",
    href: "#",
    icon: "menu_book",
    nhan: "Học tập",
    vai: ["student"],
    sapCo: "GĐ2",
    luoi: { thuTu: 70, nhan: "Học tập · GĐ2" },
    menu: { thuTu: 70 },
  },
  {
    key: "health",
    href: "#",
    icon: "favorite",
    nhan: "Y tế",
    vai: ["student", "guardian"],
    sapCo: "GĐ2",
    luoi: { thuTu: 80, nhan: "Y tế · GĐ2" },
    menu: { thuTu: 80 },
  },
];

// ---------------------------------------------------------------------------
// Ba phép lọc — ba bề mặt, MỘT nguồn
// ---------------------------------------------------------------------------

function voiVai(m: ManHinh, roles: readonly HubRole[]): boolean {
  if (m.vai === "moi-nguoi") return true;
  return roles.some((r) => (m.vai as HubRole[]).includes(r));
}

function beMatChoVai(b: BeMat | undefined, roles: readonly HubRole[]): boolean {
  if (!b) return false;
  if (!b.vai) return true;
  return roles.some((r) => b.vai!.includes(r));
}

/** Một mục đã dựng xong, dùng chung cho cả ba bề mặt. */
export interface MucDieuHuong {
  key: string;
  href: string;
  icon: string;
  nhan: string;
  /** Có giá trị = mục mờ, không bấm được. */
  sapCo?: string;
}

function dungMuc(m: ManHinh, b: BeMat): MucDieuHuong {
  return {
    key: m.key,
    href: m.href,
    icon: m.icon,
    nhan: b.nhan ?? m.nhan,
    ...(m.sapCo ? { sapCo: m.sapCo } : {}),
  };
}

function loc(roles: readonly HubRole[], lay: (m: ManHinh) => BeMat | undefined): MucDieuHuong[] {
  return MAN_HINH.filter((m) => voiVai(m, roles) && beMatChoVai(lay(m), roles))
    .sort((a, b) => (lay(a)!.thuTu ?? 0) - (lay(b)!.thuTu ?? 0))
    .map((m) => dungMuc(m, lay(m)!));
}

/** Ô trên lưới trang chủ — CHƯA gồm Mini App ngoài (xem `buildMiniAppsWithEmbedded`). */
export function manChoLuoi(roles: readonly HubRole[]): MucDieuHuong[] {
  return loc(roles, (m) => m.luoi);
}

/** Mục menu trái. Mục đã dựng xong và mục mờ trả về CHUNG một danh sách, phân biệt bằng `sapCo`. */
export function manChoMenu(roles: readonly HubRole[]): MucDieuHuong[] {
  return loc(roles, (m) => m.menu);
}

/** Ô thanh tab điện thoại. Ô avatar do chính thanh tab dựng, không đi qua đây. */
export function manChoTab(roles: readonly HubRole[]): MucDieuHuong[] {
  return loc(roles, (m) => m.tab);
}

/** Tra một màn theo đường dẫn — dùng cho cổng đối chiếu và cho màn xem trước. */
export function timMan(href: string): ManHinh | undefined {
  return MAN_HINH.find((m) => m.href === href);
}
