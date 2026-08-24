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
//     đi tới — không phải chữ trang trí. Nay dùng token muted (#8298B8, 5,03:1).
//
// CẬP NHẬT 01/08/2026 (gói "tuong-phan-man-hoc-sinh"): món nợ mà đoạn trên ghi lại
// ("Ba mục kia của app vẫn dùng caption2 và vẫn sai; việc nâng chính TOKEN nằm ở gói
// khác") ĐÃ TRẢ — apps/hub/tailwind.config.ts nay đặt caption #93A9C8 (4,90:1 ở nền tệ
// nhất) và caption2 #8298B8 (4,56:1), phủ cả 58 chỗ dùng trong apps/hub. File này giữ
// nguyên `text-muted` vì caption2 nay trỏ về đúng cùng một màu — không cần sửa lần hai.
// tests/unit/a11y.test.ts giữ cả hai luật, tính tỉ lệ tương phản từ tailwind.config.ts
// thật chứ không chép số vào test.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { HubRole } from "@hub/core/contracts";
import { manChoTab } from "@/lib/man-hinh";
import { useCongCheckin } from "./cong-checkin";
import { UserMenu } from "./user-menu";

/**
 * Đích điều hướng của tab bar học sinh, khai ở một chỗ để tests/unit/nav-links.test.ts
 * kiểm được là mỗi đích có page.tsx thật — cùng luật với sidebar: KHÔNG mục điều hướng
 * nào được trỏ vào trang chưa tồn tại.
 *
 * Từ 21/08/2026 danh sách còn ĐÚNG MỘT đích. Nút tròn giữa không còn dẫn đi đâu cả —
 * nó MỞ POPUP check-in ngay tại chỗ (ADR-036 bản popup), nên nó là `<button>` chứ không
 * phải `<Link>`, và không có href để mà kiểm.
 */
export const STUDENT_TABBAR_HREFS = ["/home"] as const;
const [HOME_HREF] = STUDENT_TABBAR_HREFS;

export function StudentTabBar({ fullName = "", email, roleTag }: TaiKhoanProps = {}) {
  const pathname = usePathname();
  const isHome = pathname === HOME_HREF;
  const { moCheckin } = useCongCheckin();

  return (
    // aria-label trên <nav>: trang có thể có nhiều landmark điều hướng (menu trái +
    // tab bar), trình đọc màn hình liệt kê chúng bằng nhãn — không nhãn thì người dùng
    // nghe "navigation, navigation" và không biết cái nào là cái nào.
    <nav aria-label="Thanh điều hướng chính" className="mt-auto flex items-end justify-between border-t border-[#16294B] bg-card px-4 pb-2.5 pt-2">
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
        <span aria-hidden="true" className={`msr text-[22px] ${isHome ? "text-cardtitle" : "text-muted"}`}>home</span>
        <span className={`text-[9.5px] font-black ${isHome ? "text-cardtitle" : "text-muted"}`}>Trang chủ</span>
      </Link>

      {/* NÚT, KHÔNG PHẢI LINK (21/08/2026). Trước đây nó dẫn sang `/checkin` — một trang
          riêng cho một việc mất bốn giây. Chủ đầu tư: *"vô trang checkin làm gì"*. Nay nó
          mở popup ngay trên trang em đang đứng, nên em không mất chỗ mình đang xem.
          KHÔNG `aria-current` nữa: nút này không dẫn tới trang nào để mà "đang ở đó". */}
      <button
        type="button"
        onClick={moCheckin}
        aria-haspopup="dialog"
        className="-mt-7 flex min-h-[44px] w-[70px] flex-col items-center justify-center gap-0.5"
      >
        <span
          aria-hidden="true"
          className="flex h-[52px] w-[52px] animate-pulseDot items-center justify-center rounded-full border-4 border-cardline bg-gradient-to-br from-gold to-gold-dark shadow-[0_8px_18px_rgba(232,148,13,.42)]"
        >
          <span className="msr text-[25px] text-cardtitle">sentiment_satisfied</span>
        </span>
        {/* gold-textDark (#FFD98A) chứ không phải #E8940D: chữ cam trên nền trắng chỉ đạt
            2,42:1 — dưới chuẩn 4,5:1 và đúng ở nhãn của HÀNH ĐỘNG CHÍNH mỗi sáng của em.
            #FFD98A là màu "chữ trên vàng" đã chốt ở DESIGN-GUIDELINES §3/§7, đạt 5,93:1.
            Vòng tròn vàng bên trên vẫn giữ nguyên — nó là hình khối, không phải chữ. */}
        <span className="text-[9.5px] font-black text-gold-textDark">Check-in</span>
      </button>

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

// ═══════════════════════════════════════════════════════════════════════════════
// SÁU MẢNG TAB ĐÃ RỜI KHỎI FILE NÀY (02/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT/TEACHER/GUARDIAN/COUNSELOR/BOARD/STAFF_TABBAR_ITEMS + ADMIN_TABBAR_EXTRA đều
// nằm ở đây, trong khi `hub-sidebar.tsx` có bộ mảng riêng cho CÙNG câu hỏi. Chú thích
// của `resolveTabs` bên dưới đã tự đặt luật từ lâu — "hai thanh điều hướng của cùng một
// người mà nói khác nhau thì bản thân điều đó đã là lỗi" — nhưng luật đó không có gì thi
// hành, và nó đã bị vi phạm thật: cô Mai thấy hộp việc tâm lý trên máy tính, không thấy
// trên điện thoại, suốt từ 31/07 tới 01/08.
//
// Nay luật ấy được thi hành bằng cấu trúc, không bằng lời dặn: cả hai đọc chung
// `apps/hub/lib/man-hinh.ts`, nên chúng KHÔNG THỂ nói khác nhau.

export function resolveTabs(roles: HubRole[]): TabItem[] {
  return manChoTab(roles).map((m) => ({ key: m.key, label: m.nhan, icon: m.icon, href: m.href }));
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
      className="mt-auto flex items-stretch justify-around border-t border-[#16294B] bg-card px-2 pb-2.5 pt-2"
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
            <span aria-hidden="true" className={`msr text-[22px] ${isActive ? "text-cardtitle" : "text-muted"}`}>
              {item.icon}
            </span>
            <span className={`text-[9.5px] ${isActive ? "font-black text-cardtitle" : "font-bold text-muted"}`}>
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
