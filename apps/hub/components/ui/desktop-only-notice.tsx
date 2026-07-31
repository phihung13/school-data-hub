// apps/hub/components/ui/desktop-only-notice.tsx — màn hình "trang này chưa có bản
// điện thoại", nhưng CÓ ĐƯỜNG RA.
//
// Vì sao cần (31/07/2026, gói "frontend-trang-thai"): bốn trang học sinh
// (/ho-so, /diem-danh, /tuan-nay, /can-gap-thay-co) đang render một khối md:hidden
// gồm đúng một icon + một câu "Trang này đang tối ưu cho máy tính." — KHÔNG một
// <Link> nào, KHÔNG tab bar. "Hồ sơ" là 1 trong 3 tab chính của học sinh
// (tab-bar.tsx), nên em bấm tab là rơi vào màn trắng không lối ra; PWA đã thêm vào
// màn hình chính thì không có cả nút Back của trình duyệt để thoát.
//
// Hoãn bản mobile của một trang là quyết định sản phẩm chấp nhận được. Hoãn mà
// KHÓA NGƯỜI DÙNG LẠI TRONG ĐÓ thì không.
"use client";

import Link from "next/link";
import { StudentTabBar } from "../tab-bar";

export function DesktopOnlyNotice({
  title,
  hint,
  showTabBar,
}: {
  title: string;
  hint?: string;
  /** Chỉ học sinh mới có tab bar (DESIGN-GUIDELINES §6) — vai khác chỉ cần nút về Hub. */
  showTabBar: boolean;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col md:hidden">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="msr text-[40px] text-caption" aria-hidden>
          desktop_windows
        </span>
        <p className="text-[14px] font-bold text-ink">{title}</p>
        {hint && <p className="text-[12.5px] text-caption">{hint}</p>}
        <Link
          href="/home"
          className="mt-3 rounded-[14px] bg-gradient-to-br from-navy to-navy-light px-6 py-3 text-[13px] font-black text-white"
        >
          Về trang chủ
        </Link>
      </div>
      {showTabBar && <StudentTabBar />}
    </div>
  );
}
