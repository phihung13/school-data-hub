// Tab bar mobile — CHỈ ở Hub, vai trò học sinh. 3 mục cho GĐ1 (rút gọn từ 5),
// nút Check-in tròn vàng nổi giữa. Mini app KHÔNG có tab bar Hub (DESIGN-GUIDELINES §6).
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Ba đích của tab bar, khai ở một chỗ để tests/unit/nav-links.test.ts kiểm được là
 * mỗi đích có page.tsx thật — cùng luật với sidebar (gói "sidebar-dieu-huong"):
 * KHÔNG mục điều hướng nào được trỏ vào trang chưa tồn tại.
 */
export const STUDENT_TABBAR_HREFS = ["/home", "/checkin", "/ho-so"] as const;
const [HOME_HREF, CHECKIN_HREF, PROFILE_HREF] = STUDENT_TABBAR_HREFS;

export function StudentTabBar() {
  const pathname = usePathname();
  const isHome = pathname === HOME_HREF;
  const isProfile = pathname === PROFILE_HREF;

  return (
    <nav className="mt-auto flex items-end justify-between border-t border-[#E9ECF2] bg-white px-4 pb-2.5 pt-2">
      <Link href={HOME_HREF} className="flex w-[70px] flex-col items-center gap-0.5">
        <span className={`msr text-[22px] ${isHome ? "text-navy" : "text-caption2"}`}>home</span>
        <span className={`text-[9.5px] font-black ${isHome ? "text-navy" : "text-caption2"}`}>Trang chủ</span>
      </Link>

      <Link href={CHECKIN_HREF} className="-mt-7 flex w-[70px] flex-col items-center gap-0.5">
        <span className="flex h-[52px] w-[52px] animate-pulseDot items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-gold to-gold-dark shadow-[0_8px_18px_rgba(232,148,13,.42)]">
          <span className="msr text-[25px] text-navy">sentiment_satisfied</span>
        </span>
        <span className="text-[9.5px] font-black text-[#E8940D]">Check-in</span>
      </Link>

      <Link href={PROFILE_HREF} className="flex w-[70px] flex-col items-center gap-0.5">
        <span className={`msr text-[22px] ${isProfile ? "text-navy" : "text-caption2"}`}>person</span>
        <span className={`text-[9.5px] ${isProfile ? "font-black text-navy" : "text-caption2"}`}>Hồ sơ</span>
      </Link>
    </nav>
  );
}
