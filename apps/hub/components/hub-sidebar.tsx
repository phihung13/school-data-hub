"use client";
// apps/hub/components/hub-sidebar.tsx — khung điều hướng desktop cố định 240px,
// khớp "Hub Sidebar.dc.html" (Hub Desktop V2, 29/07/2026). Thay cho cách điều
// hướng cũ (chỉ lưới mini app + icon thông báo) — desktop giờ có sidebar thật,
// dùng chung cho mọi trang học sinh/GVCN.
//
// Sửa 31/07/2026 (gói "sidebar-dieu-huong"), ba lỗi cùng một gốc "menu nói dối":
//   1. 4/6 mục của GVCN trỏ vào /gvcn/lop, /gvcn/diem-danh, /gvcn/duyet-bao-cao,
//      /gvcn/ghi-chu — chưa có page.tsx nào, bấm vào là 404. Nay nằm trong
//      TEACHER_SOON: render bằng <div> mờ + badge, KHÔNG phải <Link>. Chỉ trả lại
//      thành <Link> khi trang tương ứng ra đời (gói "gvcn-man-hinh").
//   2. Mã lớp của MỘT lớp cụ thể bị viết chết trong mã nguồn, nên GVCN lớp khác vẫn
//      thấy nhãn lớp không phải của mình. Sai mà trông như thật là loại lỗi tệ nhất ở
//      hệ dữ liệu học sinh — nay lớp đến từ prop `classCode`; KHÔNG có thì bỏ hẳn hậu
//      tố chứ không bịa.
//   3. Prop `role` chỉ có 2 giá trị trong khi HubRole có 8: phụ huynh và quản trị
//      rơi vào nhánh "teacher" nên thấy nguyên menu GVCN. Nay chọn menu theo
//      danh sách vai thật (`roles`).
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { HubRole } from "@hub/core/contracts";
import { UserMenu } from "./user-menu";

/** Giữ lại cho các màn chưa kịp truyền `roles` xuống — xem HubSidebarProps. */
type LegacyRole = "student" | "teacher";

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  /** "#" = chưa có trang thật. Mục href "#" BẮT BUỘC nằm ở mảng *_SOON. */
  href: string;
  badge?: number;
  /** Nhãn trên mục mờ. Mặc định "GĐ2"; việc trong giai đoạn này ghi rõ hơn. */
  soonBadge?: string;
}

export const STUDENT_ITEMS: NavItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: "/home" },
  { key: "week", label: "Tuần này của mình", icon: "insights", href: "/tuan-nay" },
  // "Lịch điểm danh" chứ không phải "Điểm danh" (31/07/2026, gói "menu-noi-dung-dich"):
  // tile trang chủ mang nhãn "Check-in cảm xúc" và dẫn tới /checkin (nơi GHI), mục này
  // dẫn tới /diem-danh (nơi XEM LẠI). Trước đó cả hai cùng tên "Điểm danh" nên trên máy
  // tính em nhìn thấy một nhãn ở hai chỗ dẫn đi hai nơi khác nhau.
  { key: "attendance", label: "Lịch điểm danh", icon: "fact_check", href: "/diem-danh" },
  { key: "report", label: "Báo cáo Trưởng thành", icon: "workspace_premium", href: "/bao-cao" },
];
export const STUDENT_SOON: NavItem[] = [
  { key: "study", label: "Học tập", icon: "menu_book", href: "#" },
  { key: "health", label: "Y tế", icon: "favorite", href: "#" },
];

export const TEACHER_ITEMS: NavItem[] = [
  // Sửa 31/07/2026 (gói "dieu-huong-mobile-nguoi-lon"): "Trang chủ" từng trỏ /gvcn.
  // Hệ quả: GVCN đang đứng ở /home nhìn xuống menu thấy "Trang chủ" — bấm vào thì
  // sang buồng lái, và từ đó KHÔNG mục nào đưa được về /home nữa. Trang chủ chung
  // (lưới mini app đổi theo quyền) thành trang một chiều, trái DESIGN-GUIDELINES
  // §1.1 "một cửa vào chung". Nay hai việc là hai mục: /home là trang chủ của mọi
  // vai, /gvcn là buồng lái — và tên mục nói đúng nơi nó dẫn tới.
  { key: "home", label: "Trang chủ", icon: "home", href: "/home" },
  { key: "cockpit", label: "Bảng điều khiển", icon: "space_dashboard", href: "/gvcn" },
  // Bốn mục dưới đây quay lại thành <Link> ngày 31/07/2026 (gói "gvcn-man-hinh"): bốn
  // trang tương ứng đã tồn tại thật, có procedure thật ở router `care` và có cả ba
  // trạng thái tải/lỗi/rỗng. Chúng từng nằm ở TEACHER_SOON vì trỏ vào trang 404.
  { key: "klass", label: "Lớp chủ nhiệm", icon: "groups", href: "/gvcn/lop" },
  { key: "attendance", label: "Điểm danh lớp", icon: "fact_check", href: "/gvcn/diem-danh" },
  { key: "review", label: "Duyệt báo cáo", icon: "rate_review", href: "/gvcn/duyet-bao-cao" },
  { key: "notes", label: "Ghi chú can thiệp", icon: "edit_note", href: "/gvcn/ghi-chu" },
];
/**
 * GVCN không còn mục mờ nào (31/07/2026, gói "menu-noi-dung-dich").
 *
 * Trước đó ở đây có "Tâm lý cụm" — hứa với GVCN một màn hình mà theo
 * DESIGN-GUIDELINES §9 họ KHÔNG được vào: ghi chú tư vấn là thứ GVCN và phụ huynh
 * không xem được. Mục mờ cũng là một lời hứa; hứa nhầm màn hình của vai khác thì
 * đến ngày mở màn đó ra, người bị từ chối lại chính là người đã được mời.
 * "Tâm lý cụm" nay nằm ở COUNSELOR_SOON, đúng vai sẽ dùng nó.
 *
 * Việc GVCN thật sự đang chờ là đường CHUYỂN một ca sang tâm lý cụm (gói
 * "vai-chua-co-man-hinh") — khi có procedure referToCounselor thật thì thêm vào
 * TEACHER_ITEMS như một mục bấm được, không phải thêm lại vào đây.
 */
export const TEACHER_SOON: NavItem[] = [];

/** Phụ huynh: xem báo cáo của con + hồ sơ. Không có màn điểm danh/check-in của riêng mình. */
export const GUARDIAN_ITEMS: NavItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: "/home" },
  { key: "report", label: "Báo cáo Trưởng thành", icon: "workspace_premium", href: "/bao-cao" },
];
export const GUARDIAN_SOON: NavItem[] = [
  { key: "health", label: "Y tế", icon: "favorite", href: "#" },
];

/**
 * Vai nhân viên chưa có màn hình riêng (quản trị, hiệu trưởng, BGH, tư vấn cụm,
 * giáo viên bộ môn). Cố tình TỐI THIỂU: thà 2 mục vào được còn hơn 6 mục dẫn tới
 * trang chặn quyền rồi đá ngược về /home mà không giải thích.
 */
export const STAFF_ITEMS: NavItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: "/home" },
];

/**
 * Mục mờ của nhân viên tách theo VAI THẬT (31/07/2026, gói "menu-noi-dung-dich").
 *
 * Trước đó mọi vai nhân viên dùng chung đúng một mục "Quản trị hệ thống", nên cô Mai
 * (tâm lý cụm) đăng nhập vào thấy hệ thống hứa với mình một màn quản trị mà cô sẽ
 * không bao giờ được vào, còn màn ĐANG CHỜ cô — hộp việc tâm lý cụm — thì không được
 * nhắc tới ở đâu cả. Menu mờ là bản đồ những gì sắp có CHO NGƯỜI ĐANG ĐỌC; chỉ đúng
 * khi nó đọc theo vai của họ.
 */
/**
 * Trang /tam-ly ĐÃ DỰNG THẬT (31/07/2026, gói "man-hinh-tam-ly-cum") nên mục này rời
 * khỏi nhóm mờ. Giữ nó ở "sắp có" trong khi trang đã tồn tại thì cùng một nhãn
 * "Tâm lý cụm" dẫn đi hai nơi — sidebar bảo chưa có, tile trên trang chủ lại mở được.
 * Bài test nav-links bắt đúng chuyện này, nên nhóm mờ của tâm lý cụm nay rỗng.
 */
export const COUNSELOR_ITEMS: NavItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: "/home" },
  { key: "psych", label: "Tâm lý cụm", icon: "psychology", href: "/tam-ly" },
];
export const COUNSELOR_SOON: NavItem[] = [];

/**
 * Hiệu trưởng cơ sở + ban điều hành: màn Điều hành (/dieu-hanh) dựng thật 31/07/2026
 * (gói "man-hinh-bgh", migration 0040).
 *
 * Thêm mục này ngày 01/08/2026 vì nghiệm thu đợt B bắt được đúng một lỗ: màn đã chạy,
 * cổng quyền đã đủ ba lớp, dữ liệu đã có — nhưng KHÔNG một mục điều hướng nào, KHÔNG
 * một tile nào dẫn tới. Người duy nhất vào được là người đã biết sẵn phải gõ /dieu-hanh
 * vào thanh địa chỉ, tức là chúng tôi. Một màn hình không có đường tới thì với người
 * dùng nó không tồn tại — và cái hỏng đó im lặng y hệt mọi cái hỏng khác trong hệ này:
 * hiệu trưởng đăng nhập, thấy Trang chủ + Hồ sơ, kết luận "GĐ1 chưa có gì cho tôi".
 */
export const BOARD_ITEMS: NavItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: "/home" },
  { key: "operations", label: "Điều hành", icon: "bar_chart", href: "/dieu-hanh" },
];
/**
 * Quản trị: màn Mini App dựng thật 02/08/2026 (migration 0052) nên nó rời khỏi nhóm MỜ.
 *
 * Trước đó ở đây có đúng một mục mờ "Quản trị hệ thống" trỏ href="#" — một lời hứa suông
 * đứng suốt từ ngày dựng sidebar. Nay có một màn thật, và nó phải có đường tới: một màn
 * hình không có đường tới thì với người dùng nó không tồn tại (đúng lỗi đã bắt được với
 * /dieu-hanh ngày 01/08 — màn chạy tốt, dữ liệu đủ, mà chỉ vào được bằng cách gõ URL).
 */
export const ADMIN_EXTRA: NavItem[] = [
  { key: "miniapp", label: "Mini App", icon: "space_dashboard", href: "/quan-tri/mini-app" },
];
export const ADMIN_SOON: NavItem[] = [];
/**
 * Hiệu trưởng, ban giám hiệu, giáo viên bộ môn: KHÔNG mục mờ nào.
 *
 * Cố ý để rỗng chứ không mượn tạm mục của vai khác. Màn tổng hợp theo lô cho BGH
 * (DESIGN-GUIDELINES §9) chưa được thiết kế xong, và "im lặng không phải kết luận":
 * chưa biết màn đó tên gì, hình gì thì không được vẽ sẵn một dòng mờ như thể đã biết.
 * Gói "vai-chua-co-man-hinh" sẽ nói thẳng bằng một dòng chữ rằng GĐ1 chưa có công cụ
 * cho vai này — đó là việc của một khối chữ, không phải của một mục điều hướng giả.
 */
export const STAFF_SOON: NavItem[] = [];

const ROLE_LABEL: Record<HubRole, string> = {
  student: "HỌC SINH",
  guardian: "PHỤ HUYNH",
  teacher: "GIÁO VIÊN",
  homeroom: "GVCN",
  counselor: "TÂM LÝ CỤM",
  principal: "HIỆU TRƯỞNG",
  board: "BAN GIÁM HIỆU",
  admin: "QUẢN TRỊ",
};
/** Thứ tự ưu tiên khi một người mang nhiều vai (vd giáo viên đồng thời là phụ huynh). */
const ROLE_PRIORITY: HubRole[] = ["student", "homeroom", "guardian", "counselor", "principal", "board", "admin", "teacher"];

export interface NavSet {
  items: NavItem[];
  soon: NavItem[];
  /** Vai hiển thị trên đầu sidebar, CHƯA gắn lớp. */
  roleLabel: string;
}

/**
 * Chọn bộ menu theo vai. Tách khỏi component để test được mà không cần dựng DOM
 * (tests/unit/nav-links.test.ts), và để chỗ duy nhất quyết định "ai thấy gì".
 */
export function resolveNav(roles: HubRole[]): NavSet {
  if (roles.includes("student")) return { items: STUDENT_ITEMS, soon: STUDENT_SOON, roleLabel: ROLE_LABEL.student };
  if (roles.includes("homeroom")) return { items: TEACHER_ITEMS, soon: TEACHER_SOON, roleLabel: ROLE_LABEL.homeroom };
  if (roles.includes("guardian")) return { items: GUARDIAN_ITEMS, soon: GUARDIAN_SOON, roleLabel: ROLE_LABEL.guardian };
  const known = ROLE_PRIORITY.find((r) => roles.includes(r));
  // Mục mờ theo vai thật, cùng THỨ TỰ ƯU TIÊN với `known` ở trên để nhãn vai và danh
  // sách mục mờ không bao giờ nói về hai người khác nhau.
  const soon = roles.includes("counselor") ? COUNSELOR_SOON : roles.includes("admin") ? ADMIN_SOON : STAFF_SOON;
  // Tâm lý cụm nay có màn hình nghiệp vụ thật (/tam-ly) nên nhận bộ menu riêng, không
  // còn dùng chung bộ nhân viên tối thiểu — trước đây cô Mai đăng nhập vào chỉ thấy
  // Trang chủ + Hồ sơ, tức là một ngõ cụt, dù việc đang chờ cô nằm ngay trong hệ.
  // Thứ tự ba nhánh này phải khớp ROLE_PRIORITY: counselor đứng trước principal/board,
  // nên người vừa là tâm lý cụm vừa là BGH nhận menu tâm lý — cùng vai với nhãn hiển thị
  // ở đầu sidebar. Nhãn nói một vai còn menu bày vai khác là cách nhanh nhất để người
  // dùng thôi tin cả hai.
  const items = roles.includes("counselor")
    ? COUNSELOR_ITEMS
    : roles.includes("principal") || roles.includes("board")
      ? BOARD_ITEMS
      : STAFF_ITEMS;

  // NỐI THÊM, KHÔNG THAY CẢ BỘ (02/08/2026).
  //
  // Mọi nhánh ở trên là loại trừ: một người nhận đúng MỘT bộ menu, chọn theo ROLE_PRIORITY.
  // Với vai quản trị thì cách đó hỏng, và hỏng theo một cách đo được: tài khoản quản trị
  // duy nhất của hệ là `admin.hung@va.edu.vn`, mang `admin+principal` — mà `principal`
  // đứng TRƯỚC `admin` trong ROLE_PRIORITY. Chọn loại trừ thì anh ấy nhận BOARD_ITEMS và
  // KHÔNG bao giờ thấy màn Mini App; đảo thứ tự thì anh ấy mất màn Điều hành. Một người
  // mang hai vai cần cả hai màn, không phải màn của vai xếp trên.
  //
  // Cũng vì thế `admin` KHÔNG có bộ menu riêng: quản trị ở trường này luôn kiêm một vai
  // khác. Bộ riêng sẽ là bộ chỉ đúng cho một người không tồn tại.
  const itemsDuMuc = roles.includes("admin")
    ? [...items, ...ADMIN_EXTRA.filter((x) => !items.some((i) => i.href === x.href))]
    : items;
  return { items: itemsDuMuc, soon, roleLabel: known ? ROLE_LABEL[known] : "TÀI KHOẢN TRƯỜNG" };
}

type HubSidebarBaseProps = {
  active: string;
  fullName: string;
  email: string;
  /**
   * Mã lớp thật của người đang xem (vd "6A2"), lấy từ resolveIdentity/care.getDashboard.
   * Tên là `classCode` chứ KHÔNG phải `className` để không lẫn với thuộc tính CSS
   * của React. Không truyền → sidebar bỏ hậu tố lớp, tuyệt đối không đoán.
   */
  classCode?: string | null;
};

/**
 * Hoặc truyền `roles` (đường đúng, mọi page.tsx đều có sẵn `session.roles`), hoặc
 * truyền `role` kiểu cũ — không được truyền cả hai. Nhánh `role` giữ tạm để các
 * màn chưa chuyển vẫn biên dịch được; bỏ khi mọi caller đã truyền `roles`.
 */
export type HubSidebarProps = HubSidebarBaseProps &
  ({ roles: HubRole[]; role?: never } | { role: LegacyRole; roles?: never });

export function HubSidebar({ role, roles, active, fullName, email, classCode }: HubSidebarProps) {
  const pathname = usePathname();


  const effectiveRoles: HubRole[] = roles ?? (role === "student" ? ["student"] : ["homeroom"]);
  const { items, soon, roleLabel } = resolveNav(effectiveRoles);
  const trimmedClass = classCode?.trim();
  const roleTag = trimmedClass ? `${roleLabel} · ${trimmedClass}` : roleLabel;

  return (
    <nav className="flex h-full w-full flex-col border-r border-line bg-white">
      <div className="flex items-center gap-[11px] border-b border-[#F1F4F8] px-[18px] pb-[14px] pt-[18px]">
        {/* Logo WebP 180×180, 3.870 B. Đổi từ /logo.jpg (74.181 B) ngày 31/07/2026: bản
            WebP đã được tạo từ đợt trước nhưng KHÔNG ai tham chiếu tới, nên mọi lần mở
            trang vẫn kéo về bản JPEG nặng gấp 19 lần cho một ô 36×36 — 70 KB thừa trên
            mỗi lượt tải nguội, đúng trên đường 3G của phụ huynh. 180px vẫn dư cho ô
            36×36 kể cả màn hình 3× DPR.
            ?v=<8 ký tự đầu sha256>: next.config.mjs phục vụ ảnh trong public/ với
            Cache-Control immutable 1 năm — đổi logo mà giữ nguyên URL thì máy người dùng
            giữ bản cũ tới hết năm. Đổi file thì đổi cả chuỗi này. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- logo tĩnh, kích thước cố định nhỏ */}
        <img src="/logo.webp?v=ddafa976" alt="" className="h-9 w-9 flex-none rounded-[10px]" />
        <div className="min-w-0">
          <div className="text-[15px] font-black leading-[1.15] text-navy">School Hub</div>
          <div className="text-[9.5px] font-extrabold tracking-wide text-muted">{roleTag}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[3px] overflow-y-auto p-2.5">
        {items.map((item) => {
          const isActive = item.key === active || pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              // min-h-[44px]: py-[11px] + chữ 13,5px cho ra ~40px. §11 đòi 44px cho MỌI
              // đích bấm, và sidebar này cũng hiện trên máy bảng cảm ứng.
              className={
                isActive
                  ? "flex min-h-[44px] items-center gap-[11px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-3 py-[11px] shadow-[0_6px_14px_rgba(10,42,94,.24)]"
                  : "flex min-h-[44px] items-center gap-[11px] rounded-xl px-3 py-[11px] hover:bg-[#F5F8FC]"
              }
            >
              <span className={`msr text-[20px] ${isActive ? "text-gold" : "text-caption"}`} aria-hidden>
                {item.icon}
              </span>
              <span className={`flex-1 text-[13.5px] ${isActive ? "font-extrabold text-white" : "font-bold text-[#33507C]"}`}>
                {item.label}
              </span>
              {!isActive && item.badge ? (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FFF1C9] px-1.5 text-[10.5px] font-black text-gold-textDark">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
        {soon.map((item) => (
          // Cố tình KHÔNG phải <Link>: trang chưa tồn tại, cho bấm được là hứa suông.
          <div
            key={item.key}
            aria-disabled="true"
            className="flex min-h-[44px] items-center gap-[11px] rounded-xl px-3 py-[11px] opacity-45"
          >
            <span className="msr text-[20px] text-caption" aria-hidden>
              {item.icon}
            </span>
            <span className="flex-1 text-[13.5px] font-bold text-[#5B6B80]">{item.label}</span>
            <span className="rounded-full bg-[#F1F4F8] px-[7px] py-[3px] text-[9px] font-black text-muted">
              {item.soonBadge ?? "GĐ2"}
            </span>
          </div>
        ))}
      </div>

      {/* Hàng tài khoản. Gỡ ra thành <UserMenu> 02/08/2026 khi lớp nổi này có chỗ đứng
          thứ hai (đầu trang điện thoại) — xem lý lẽ ở đầu user-menu.tsx. Mục "Hồ sơ" đã
          rời khỏi danh sách điều hướng bên trên và về đây, nên đây KHÔNG còn là lối tắt
          tiện tay mà là đường DUY NHẤT tới hồ sơ và tới nút đăng xuất. */}
      <div className="border-t border-[#F1F4F8] p-2.5 pb-[14px]">
        <UserMenu variant="sidebar" fullName={fullName} email={email} roleTag={roleTag} />
      </div>
    </nav>
  );
}
