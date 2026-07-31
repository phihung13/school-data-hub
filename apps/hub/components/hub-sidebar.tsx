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
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { HubRole } from "@hub/core/contracts";

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
  { key: "attendance", label: "Điểm danh", icon: "fact_check", href: "/diem-danh" },
  { key: "report", label: "Báo cáo Trưởng thành", icon: "workspace_premium", href: "/bao-cao" },
  { key: "profile", label: "Hồ sơ", icon: "person", href: "/ho-so" },
];
export const STUDENT_SOON: NavItem[] = [
  { key: "study", label: "Học tập", icon: "menu_book", href: "#" },
  { key: "health", label: "Y tế", icon: "favorite", href: "#" },
];

export const TEACHER_ITEMS: NavItem[] = [
  { key: "home", label: "Trang chủ", icon: "space_dashboard", href: "/gvcn" },
  // Bốn mục dưới đây quay lại thành <Link> ngày 31/07/2026 (gói "gvcn-man-hinh"): bốn
  // trang tương ứng đã tồn tại thật, có procedure thật ở router `care` và có cả ba
  // trạng thái tải/lỗi/rỗng. Chúng từng nằm ở TEACHER_SOON vì trỏ vào trang 404.
  { key: "klass", label: "Lớp chủ nhiệm", icon: "groups", href: "/gvcn/lop" },
  { key: "attendance", label: "Điểm danh lớp", icon: "fact_check", href: "/gvcn/diem-danh" },
  { key: "review", label: "Duyệt báo cáo", icon: "rate_review", href: "/gvcn/duyet-bao-cao" },
  { key: "notes", label: "Ghi chú can thiệp", icon: "edit_note", href: "/gvcn/ghi-chu" },
  { key: "profile", label: "Hồ sơ", icon: "person", href: "/ho-so" },
];
export const TEACHER_SOON: NavItem[] = [
  { key: "psych", label: "Tâm lý cụm", icon: "psychology", href: "#" },
];

/** Phụ huynh: xem báo cáo của con + hồ sơ. Không có màn điểm danh/check-in của riêng mình. */
export const GUARDIAN_ITEMS: NavItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: "/home" },
  { key: "report", label: "Báo cáo Trưởng thành", icon: "workspace_premium", href: "/bao-cao" },
  { key: "profile", label: "Hồ sơ", icon: "person", href: "/ho-so" },
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
  { key: "profile", label: "Hồ sơ", icon: "person", href: "/ho-so" },
];
export const STAFF_SOON: NavItem[] = [
  { key: "admin", label: "Quản trị hệ thống", icon: "admin_panel_settings", href: "#" },
];

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
  return { items: STAFF_ITEMS, soon: STAFF_SOON, roleLabel: known ? ROLE_LABEL[known] : "TÀI KHOẢN TRƯỜNG" };
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useDismissable(menuOpen, [menuRef, menuButtonRef], () => setMenuOpen(false));

  const effectiveRoles: HubRole[] = roles ?? (role === "student" ? ["student"] : ["homeroom"]);
  const { items, soon, roleLabel } = resolveNav(effectiveRoles);
  const trimmedClass = classCode?.trim();
  const roleTag = trimmedClass ? `${roleLabel} · ${trimmedClass}` : roleLabel;
  const initial = fullName.trim().slice(0, 1).toUpperCase() || "?";

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
          <div className="text-[9.5px] font-extrabold tracking-wide text-caption2">{roleTag}</div>
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
              className={
                isActive
                  ? "flex items-center gap-[11px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-3 py-[11px] shadow-[0_6px_14px_rgba(10,42,94,.24)]"
                  : "flex items-center gap-[11px] rounded-xl px-3 py-[11px] hover:bg-[#F5F8FC]"
              }
            >
              <span className={`msr text-[20px] ${isActive ? "text-gold" : "text-caption"}`}>{item.icon}</span>
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
            className="flex items-center gap-[11px] rounded-xl px-3 py-[11px] opacity-45"
          >
            <span className="msr text-[20px] text-caption">{item.icon}</span>
            <span className="flex-1 text-[13.5px] font-bold text-[#5B6B80]">{item.label}</span>
            <span className="rounded-full bg-[#F1F4F8] px-[7px] py-[3px] text-[9px] font-black text-caption">
              {item.soonBadge ?? "GĐ2"}
            </span>
          </div>
        ))}
      </div>

      <div className="relative border-t border-[#F1F4F8] p-2.5 pb-[14px]">
        <button
          type="button"
          ref={menuButtonRef}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-[9px] hover:bg-[#F5F8FC]"
        >
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-[13px] font-black text-navy">
            {initial}
          </span>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[12.5px] font-extrabold text-[#0F172A]">{fullName}</div>
            <div className="truncate text-[10px] text-caption2">{email}</div>
          </div>
          <span className="msr text-[18px] text-caption">unfold_more</span>
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute bottom-[62px] left-2.5 right-2.5 z-20 flex flex-col gap-px rounded-2xl border border-line bg-white p-[7px] shadow-[0_16px_36px_rgba(10,42,94,.2)]"
          >
            {/* "Cài đặt" và "Trợ giúp" đã bỏ 31/07/2026: mục đầu trỏ trùng /ho-so với
                "Hồ sơ của tôi", mục sau là href="#" — cả hai là nút bấm không dẫn đi đâu. */}
            <Link
              href="/ho-so"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-[12.5px] font-bold text-[#1F2A3A] hover:bg-[#F7F9FC]"
            >
              <span className="msr text-[18px] text-caption">person</span>
              Hồ sơ của tôi
            </Link>
            <div className="mx-0.5 my-1 h-px bg-[#F1F4F8]" />
            <LogoutMenuItem />
          </div>
        )}
      </div>
    </nav>
  );
}

/**
 * Đóng lớp nổi khi bấm ra ngoài hoặc bấm Escape. Mẫu gốc nằm ở
 * embed-floating-menu.tsx:12-18 nhưng ở đó chỉ bắt mousedown và luôn gắn listener;
 * bản này thêm phím Escape (bàn phím/đọc màn hình cũng thoát được) và chỉ gắn
 * listener khi menu đang mở.
 *
 * Nhận nhiều ref vì nút mở nằm NGOÀI hộp menu: bấm lại vào nút mà tính là "bấm ra
 * ngoài" thì hook đóng menu rồi onClick mở lại ngay — menu không bao giờ tắt bằng nút.
 */
function useDismissable(
  open: boolean,
  refs: Array<RefObject<HTMLElement>>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onDismiss();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs/onDismiss dựng lại mỗi lần render; phụ thuộc thật chỉ là trạng thái mở
  }, [open]);
}

function LogoutMenuItem() {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        fetch("/api/auth/logout", { method: "POST" }).finally(() => {
          window.location.href = "/login";
        });
      }}
      className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left text-[12.5px] font-extrabold text-[#D2383E] hover:bg-[#FFF3F3]"
    >
      <span className="msr text-[18px] text-[#D2383E]">logout</span>
      Đăng xuất
    </button>
  );
}
