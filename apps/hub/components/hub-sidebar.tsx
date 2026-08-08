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
import { manChoMenu } from "@/lib/man-hinh";
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

// ═══════════════════════════════════════════════════════════════════════════════
// MỌI DANH SÁCH MỤC ĐÃ RỜI KHỎI FILE NÀY (02/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// Ở đây từng có bảy mảng — STUDENT_ITEMS, TEACHER_ITEMS, GUARDIAN_ITEMS, STAFF_ITEMS,
// COUNSELOR_ITEMS, BOARD_ITEMS, ADMIN_EXTRA — cùng bốn mảng "sắp có". Cùng lúc đó
// `tab-bar.tsx` có bộ mảng riêng và `mini-apps.ts` có bộ thứ ba, cả ba trả lời CÙNG một
// câu hỏi: vai này thấy gì.
//
// Ba câu trả lời viết tay cho một câu hỏi thì rồi sẽ lệch — và đã lệch ba lần, mỗi lần
// đều im lặng. Nguồn duy nhất nay là `apps/hub/lib/man-hinh.ts`; khối chú thích ở đầu
// file đó kể lại ba lần ấy.
//
// Thêm một màn mới = thêm MỘT dòng ở bản khai, và nó tự có mặt ở menu, lưới và thanh tab
// đúng như dòng đó khai.

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
  const muc = manChoMenu(roles);
  return {
    // Mục ĐÃ DỰNG và mục MỜ tách đôi tại đây. Bản khai giữ chúng chung một danh sách vì
    // chúng cùng là một loại thứ — một màn hình — chỉ khác trạng thái; tách ở tầng hiển
    // thị vì chúng render khác nhau (<Link> và <div aria-disabled>).
    items: muc
      .filter((m) => !m.sapCo)
      .map((m) => ({ key: m.key, label: m.nhan, icon: m.icon, href: m.href })),
    soon: muc
      .filter((m) => m.sapCo)
      .map((m) => ({ key: m.key, label: m.nhan, icon: m.icon, href: m.href, soonBadge: m.sapCo })),
    roleLabel: nhanVai(roles),
  };
}

/**
 * Nhãn vai in ở đầu menu. Tách riêng vì nó KHÔNG suy ra từ danh sách mục: một người mang
 * hai vai vẫn chỉ có MỘT nhãn, và nhãn đó phải là vai xếp trên trong ROLE_PRIORITY. Nhãn
 * nói một vai còn menu bày vai khác là cách nhanh nhất để người dùng thôi tin cả hai.
 */
function nhanVai(roles: HubRole[]): string {
  const known = ROLE_PRIORITY.find((r) => roles.includes(r));
  return known ? ROLE_LABEL[known] : "TÀI KHOẢN TRƯỜNG";
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
              <span className={`flex-1 text-[13.5px] ${isActive ? "font-extrabold text-white" : "font-bold text-cardtitle2"}`}>
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
          //
          // MỜ Ở ICON, KHÔNG MỜ Ở CHỮ (sửa 05/08/2026). Cả khối này từng mang `opacity-45`:
          // nhãn #5B6B80 tụt còn 1,91:1 và badge còn 1,80:1 trên nền trắng — dưới một nửa
          // chuẩn 4,5:1, tức là chữ nói "màn này chưa mở" lại chính là chữ khó đọc nhất
          // sidebar. DESIGN-GUIDELINES §3 cho phép mờ .45 để báo trạng thái tắt, nhưng §11
          // nói tương phản không có ngoại lệ; hai điều đó chỉ sống chung được khi tín hiệu
          // mờ nằm ở phần TRANG TRÍ. Nên icon giữ nguyên .45, chữ về đúng ngưỡng:
          //   nhãn  text-subtle #5B6B80 = 5,73:1 trên trắng
          //   badge text-muted  #66707D = 4,56:1 trên nền chip #F1F4F8
          <div
            key={item.key}
            aria-disabled="true"
            className="flex min-h-[44px] items-center gap-[11px] rounded-xl px-3 py-[11px]"
          >
            <span className="msr text-[20px] text-caption opacity-45" aria-hidden>
              {item.icon}
            </span>
            <span className="flex-1 text-[13.5px] font-bold text-subtle">
              {item.label}
              {/* `aria-disabled` nói với API trợ năng rằng mục bị vô hiệu, nhưng đây không
                  phải nút nên nhiều trình đọc màn hình bỏ qua. Câu này nói bằng lời. */}
              <span className="sr-only"> — sắp có, chưa mở</span>
            </span>
            <span className="rounded-full bg-chip px-[7px] py-[3px] text-[9px] font-black text-muted">
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
