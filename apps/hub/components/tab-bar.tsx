// Tab bar mobile — CHỈ ở Hub. Học sinh: 3 mục + nút Check-in tròn vàng nổi giữa.
// Người lớn (GVCN, phụ huynh, nhân viên): tối đa 4 mục, KHÔNG nút giữa
// (DESIGN-GUIDELINES §6). Mini app nhúng (capsule ⋯│✕) KHÔNG có tab bar Hub.
//
// Bổ sung 31/07/2026 (gói "dieu-huong-mobile-nguoi-lon"): trước đây file này chỉ
// export StudentTabBar, nên MỌI vai người lớn dùng điện thoại không có đường nào
// tới /ho-so — trang duy nhất có nút Đăng xuất. Phụ huynh mở link Zalo, GVCN đứng
// điểm danh ở lớp, kế toán mở trên máy nhỏ: cả ba đều bị khoá trong phiên đăng
// nhập của chính mình, không tự thoát ra được. Đó không phải lỗi thẩm mỹ.
//
// Bổ sung 31/07/2026 (gói "tuong-phan-vung-cham-icon") — hai thứ đo được, không phải
// khẩu vị:
//   · VÙNG CHẠM. Ba mục của thanh học sinh cao 38px (70×38). Ngón tay cái của một em
//     lớp 6 đang đi giữa sân trường ồn không trúng ô 38px — DESIGN-GUIDELINES §11 và
//     WCAG 2.5.8 đều lấy mốc 44px. Nay min-h-[44px] cho MỌI mục, cả hai thanh.
//   · TƯƠNG PHẢN. Nhãn mục KHÔNG đứng ở trang hiện tại dùng token caption2 (#9AA5B5):
//     2,49:1 trên nền trắng, ở cỡ chữ 9,5px. Đó là tên của những nơi người dùng có thể
//     đi tới — không phải chữ trang trí. Nay dùng token muted (#66707D, 5,03:1).
//
// CẬP NHẬT 01/08/2026 (gói "tuong-phan-man-hoc-sinh"): món nợ mà đoạn trên ghi lại
// ("Ba mục kia của app vẫn dùng caption2 và vẫn sai; việc nâng chính TOKEN nằm ở gói
// khác") ĐÃ TRẢ — apps/hub/tailwind.config.ts nay đặt caption #5F6B7D (4,90:1 ở nền tệ
// nhất) và caption2 #66707D (4,56:1), phủ cả 58 chỗ dùng trong apps/hub. File này giữ
// nguyên `text-muted` vì caption2 nay trỏ về đúng cùng một màu — không cần sửa lần hai.
// tests/unit/a11y.test.ts giữ cả hai luật, tính tỉ lệ tương phản từ tailwind.config.ts
// thật chứ không chép số vào test.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { HubRole } from "@hub/core/contracts";
import { UserMenu } from "./user-menu";

/**
 * Ba đích của tab bar, khai ở một chỗ để tests/unit/nav-links.test.ts kiểm được là
 * mỗi đích có page.tsx thật — cùng luật với sidebar (gói "sidebar-dieu-huong"):
 * KHÔNG mục điều hướng nào được trỏ vào trang chưa tồn tại.
 */
export const STUDENT_TABBAR_HREFS = ["/home", "/checkin"] as const;
const [HOME_HREF, CHECKIN_HREF] = STUDENT_TABBAR_HREFS;

export function StudentTabBar({ fullName = "", email, roleTag }: TaiKhoanProps = {}) {
  const pathname = usePathname();
  const isHome = pathname === HOME_HREF;

  return (
    // aria-label trên <nav>: trang có thể có nhiều landmark điều hướng (menu trái +
    // tab bar), trình đọc màn hình liệt kê chúng bằng nhãn — không nhãn thì người dùng
    // nghe "navigation, navigation" và không biết cái nào là cái nào.
    <nav aria-label="Thanh điều hướng chính" className="mt-auto flex items-end justify-between border-t border-[#E9ECF2] bg-white px-4 pb-2.5 pt-2">
      {/* aria-hidden cho MỌI icon trang trí: nội dung DOM của .msr là chữ thô ("home",
          "person"...), font chỉ đổi HÌNH hiển thị chứ không đổi nội dung. Không ẩn thì
          trình đọc màn hình đọc nguyên "home Trang chủ person Hồ sơ" (WCAG 1.1.1/4.1.2).
          Ở đây icon luôn đi kèm nhãn chữ ngay bên cạnh nên ẩn là đúng, không mất thông tin.
          aria-current="page": tab đang đứng hiện đang chỉ được báo bằng MÀU — người mù màu
          và người dùng trình đọc màn hình không có tín hiệu nào. */}
      <Link
        href={HOME_HREF}
        aria-current={isHome ? "page" : undefined}
        className="flex min-h-[44px] w-[70px] flex-col items-center justify-center gap-0.5"
      >
        <span aria-hidden="true" className={`msr text-[22px] ${isHome ? "text-navy" : "text-muted"}`}>home</span>
        <span className={`text-[9.5px] font-black ${isHome ? "text-navy" : "text-muted"}`}>Trang chủ</span>
      </Link>

      <Link
        href={CHECKIN_HREF}
        aria-current={pathname === CHECKIN_HREF ? "page" : undefined}
        className="-mt-7 flex min-h-[44px] w-[70px] flex-col items-center justify-center gap-0.5"
      >
        <span
          aria-hidden="true"
          className="flex h-[52px] w-[52px] animate-pulseDot items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-gold to-gold-dark shadow-[0_8px_18px_rgba(232,148,13,.42)]"
        >
          <span className="msr text-[25px] text-navy">sentiment_satisfied</span>
        </span>
        {/* gold-textDark (#8A5A00) chứ không phải #E8940D: chữ cam trên nền trắng chỉ đạt
            2,42:1 — dưới chuẩn 4,5:1 và đúng ở nhãn của HÀNH ĐỘNG CHÍNH mỗi sáng của em.
            #8A5A00 là màu "chữ trên vàng" đã chốt ở DESIGN-GUIDELINES §3/§7, đạt 5,93:1.
            Vòng tròn vàng bên trên vẫn giữ nguyên — nó là hình khối, không phải chữ. */}
        <span className="text-[9.5px] font-black text-gold-textDark">Check-in</span>
      </Link>

      {/* Ô thứ ba KHÔNG còn là <Link> tới /ho-so (02/08/2026). Trước đó thanh tab chỉ có
          ba ô mà một ô dành cho "Hồ sơ" — một trang em mở vài lần một học kỳ — trong khi
          menu trái và lớp nổi avatar đã có sẵn đường tới đó. Nay ô này là chính avatar,
          mở ra lớp nổi tài khoản: cùng một chỗ, cùng một nội dung với bản máy tính. */}
      <div className="flex min-h-[44px] w-[70px] items-center justify-center">
        <UserMenu variant="avatar" placement="tren" fullName={fullName} email={email} roleTag={roleTag} />
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Người lớn — GVCN, phụ huynh, nhân viên
// ---------------------------------------------------------------------------

/** Danh tính để dựng avatar cuối thanh tab. Xem lý lẽ ở chỗ dựng <UserMenu>. */
export interface TaiKhoanProps {
  fullName?: string;
  email?: string | null;
  roleTag?: string | null;
}

export interface TabItem {
  key: string;
  label: string;
  icon: string;
  /** Luôn là trang có page.tsx thật — tests/unit/dieu-huong-mobile.test.ts đối chiếu. */
  href: string;
}

export const STUDENT_TABBAR_ITEMS: TabItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: HOME_HREF },
  { key: "checkin", label: "Check-in", icon: "sentiment_satisfied", href: CHECKIN_HREF },
];

/**
 * GVCN — 4 mục, đúng trần của DESIGN-GUIDELINES §6.
 *
 * Vì sao "Trang chủ" chiếm một ô mà "Lớp chủ nhiệm" thì không: §1.1 là "một cửa
 * vào chung", và trên điện thoại tab bar là thứ DUY NHẤT thay được sidebar. Bỏ
 * /home ra khỏi đây thì GVCN vào vùng /gvcn là mất luôn lưới mini app (Factory,
 * các app sau này) — đúng loại ngõ cụt gói này sinh ra để dẹp. Bốn màn con của
 * buồng lái vẫn tới được đủ: lưới tắt trên chính trang /gvcn (gvcn-dashboard.tsx)
 * dẫn tới cả bốn, và mỗi màn con có nút quay lại (gvcn-shell.tsx).
 */
export const TEACHER_TABBAR_ITEMS: TabItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: HOME_HREF },
  { key: "cockpit", label: "Bảng điều khiển", icon: "space_dashboard", href: "/gvcn" },
  { key: "attendance", label: "Điểm danh", icon: "fact_check", href: "/gvcn/diem-danh" },
];

/**
 * Phụ huynh — 3 mục. Chỉ từ vựng Glow & Grow (§8): không "buồng lái", không
 * "cờ", không "ngưỡng". /bao-cao chặn đúng hai vai học sinh + phụ huynh
 * (app/bao-cao/page.tsx), nên mục này không dẫn ai vào trang bị đá ngược.
 */
export const GUARDIAN_TABBAR_ITEMS: TabItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: HOME_HREF },
  { key: "report", label: "Báo cáo", icon: "workspace_premium", href: "/bao-cao" },
];

/**
 * Tâm lý cụm và BGH — thêm 01/08/2026.
 *
 * Chú thích của `resolveTabs()` ngay dưới đây đã tự đặt luật: "cùng THỨ TỰ ƯU TIÊN
 * với resolveNav() của sidebar — hai thanh điều hướng của cùng một người mà nói
 * khác nhau thì bản thân điều đó đã là lỗi". Luật đúng, nhưng hàm thì chưa theo:
 * sidebar đã có COUNSELOR_ITEMS (/tam-ly) và BOARD_ITEMS (/dieu-hanh), còn ở đây
 * cả hai vai vẫn rơi vào nhánh nhân viên tối thiểu. Hệ quả: cô Mai mở Hub trên
 * MÁY TÍNH thì thấy hộp việc tâm lý; mở trên ĐIỆN THOẠI — thứ mà §3 nói là thiết
 * bị chính — thì không thấy đâu cả, và không có gì báo là nó tồn tại.
 */
export const COUNSELOR_TABBAR_ITEMS: TabItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: HOME_HREF },
  { key: "psych", label: "Tâm lý cụm", icon: "psychology", href: "/tam-ly" },
];
export const BOARD_TABBAR_ITEMS: TabItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: HOME_HREF },
  { key: "operations", label: "Điều hành", icon: "bar_chart", href: "/dieu-hanh" },
];

/**
 * Mục thêm cho vai quản trị — NỐI vào bộ của vai kia, không thay nó.
 *
 * Cùng lý lẽ với ADMIN_EXTRA của sidebar: tài khoản quản trị của hệ mang `admin+principal`,
 * nên một bộ tab loại trừ sẽ làm mất một trong hai màn. Hai thanh điều hướng của cùng một
 * người phải nói cùng một điều (luật tự đặt ở resolveTabs) — nên chỗ này đi theo chỗ kia.
 */
export const ADMIN_TABBAR_EXTRA: TabItem[] = [
  { key: "miniapp", label: "Mini App", icon: "space_dashboard", href: "/quan-tri/mini-app" },
];

/**
 * Vai nhân viên chưa có màn riêng (giáo viên bộ
 * môn, quản trị) và cả tài khoản CHƯA được gán vai nào. Tối thiểu 2 mục — cùng
 * chủ ý với STAFF_ITEMS của sidebar: thà ít mục vào được còn hơn nhiều mục dẫn
 * tới trang chặn quyền. Nhưng "ít" không bao giờ được ít tới mức mất /ho-so:
 * không biết anh là ai thì ra ít quyền hơn, KHÔNG phải mất lối tự đăng xuất.
 */
export const STAFF_TABBAR_ITEMS: TabItem[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: HOME_HREF },
];

/**
 * Chọn bộ tab theo vai thật. Cùng THỨ TỰ ƯU TIÊN với resolveNav() của sidebar
 * (hub-sidebar.tsx) — hai thanh điều hướng của cùng một người mà nói khác nhau
 * thì bản thân điều đó đã là lỗi.
 *
 * Hàm thuần, không đụng DOM, để test được ở môi trường node (vitest chạy
 * environment: "node").
 */
export function resolveTabs(roles: HubRole[]): TabItem[] {
  const co = roles.includes("student")
    ? STUDENT_TABBAR_ITEMS
    : roles.includes("homeroom")
      ? TEACHER_TABBAR_ITEMS
      : roles.includes("guardian")
        ? GUARDIAN_TABBAR_ITEMS
        : roles.includes("counselor")
          ? COUNSELOR_TABBAR_ITEMS
          : roles.includes("principal") || roles.includes("board")
            ? BOARD_TABBAR_ITEMS
            : STAFF_TABBAR_ITEMS;
  if (!roles.includes("admin")) return co;
  // Trần 4 mục của DESIGN-GUIDELINES §6 vẫn giữ: bộ dài nhất trong các bộ trên là 3 mục
  // (tab "Hồ sơ" đã rời sang avatar 02/08/2026), cộng một là 4. Ô avatar không tính vào
  // đây — nó do chính thanh tab dựng, không đi qua danh sách này.
  return [...co, ...ADMIN_TABBAR_EXTRA.filter((x) => !co.some((i) => i.href === x.href))];
}

/**
 * Thanh điều hướng mobile của MỌI vai. Học sinh giữ nguyên bản riêng (có nút
 * Check-in tròn nổi giữa — hành động chính mỗi sáng của em); người lớn dùng bản
 * phẳng, không nút giữa.
 *
 * Dùng ở mọi màn Hub bản mobile. KHÔNG dùng trong app nhúng (/embed/*): ở đó
 * đường ra là capsule ⋯│✕ (§6).
 */
export function HubTabBar({ roles, fullName = "", email, roleTag }: { roles: HubRole[] } & TaiKhoanProps) {
  if (roles.includes("student"))
    return <StudentTabBar fullName={fullName} email={email} roleTag={roleTag} />;
  return <AdultTabBar roles={roles} fullName={fullName} email={email} roleTag={roleTag} />;
}

function AdultTabBar({ roles, fullName = "", email, roleTag }: { roles: HubRole[] } & TaiKhoanProps) {
  const pathname = usePathname();
  const items = resolveTabs(roles);

  return (
    <nav
      aria-label="Thanh điều hướng chính"
      className="mt-auto flex items-stretch justify-around border-t border-[#E9ECF2] bg-white px-2 pb-2.5 pt-2"
    >
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          // min-h-[44px]: vùng chạm tối thiểu của §11. Nhãn chữ luôn đi kèm icon
          // nên icon là trang trí thuần — aria-hidden, xem ghi chú ở StudentTabBar.
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5"
          >
            <span aria-hidden="true" className={`msr text-[22px] ${isActive ? "text-navy" : "text-muted"}`}>
              {item.icon}
            </span>
            <span className={`text-[9.5px] ${isActive ? "font-black text-navy" : "font-bold text-muted"}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
      {/* Avatar luôn là ô CUỐI, ở MỌI vai. Đây là điều kiện để bỏ được tab "Hồ sơ": chú
          thích của STAFF_TABBAR_ITEMS đã đặt luật "ít mục thế nào cũng không được mất lối
          tự đăng xuất". Đặt trong chính thanh tab (chứ không phải đầu mỗi trang) là cách
          duy nhất bảo đảm điều đó — hễ có thanh tab thì có avatar, không màn nào quên. */}
      <div className="flex min-h-[44px] flex-1 items-center justify-center">
        <UserMenu variant="avatar" placement="tren" fullName={fullName} email={email} roleTag={roleTag} />
      </div>
    </nav>
  );
}
