// apps/hub/components/gvcn/gvcn-shell.tsx — khung chung cho BỐN màn hình GVCN
// (Lớp chủ nhiệm · Điểm danh lớp · Duyệt báo cáo · Ghi chú can thiệp).
//
// Vì sao tách khung ra một file: bốn màn dùng chung sidebar, chung tiêu đề, chung
// bộ chọn lớp. Chép khung bốn lần là bảo đảm sau ba lần sửa thì bốn màn lệch nhau —
// đúng cách "Lớp 6A1" viết chết từng sống được trong ba file khác nhau (labels.ts).
//
// Mã lớp trên sidebar KHÔNG lấy từ prop cứng mà từ chính lớp đang xem: sidebar nói
// "GVCN · 6A2" trong khi nội dung là lớp 6A1 thì đó là nói dối ở ngay chỗ dễ tin nhất.
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { HubSidebar } from "../hub-sidebar";

export function GvcnShell({
  active,
  title,
  subtitle,
  displayName,
  email,
  classCode,
  toolbar,
  children,
}: {
  /** Khớp `key` trong TEACHER_ITEMS (hub-sidebar.tsx) để mục đang xem sáng lên. */
  active: string;
  title: string;
  subtitle?: ReactNode;
  displayName: string;
  email: string;
  /** Lớp ĐANG XEM. Không biết → sidebar bỏ hậu tố lớp, không đoán. */
  classCode?: string | null;
  /** Bộ chọn lớp / nút hành động của riêng từng màn. */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full md:h-screen md:overflow-hidden">
      {/* Sidebar chỉ ở khung máy tính. Trên điện thoại thay bằng thanh trên cùng có
          nút quay lại — GVCN đứng trong lớp cầm điện thoại điểm danh là tình huống
          thật, không được khoá họ trong một trang không lối ra (DesktopOnlyNotice). */}
      <div className="hidden w-[240px] flex-none md:flex">
        <HubSidebar roles={["homeroom"]} active={active} fullName={displayName} email={email} classCode={classCode} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-line bg-white px-4 py-3 md:hidden">
          <Link
            href="/gvcn"
            aria-label="Về buồng lái"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-chip"
          >
            <span className="msr text-[20px] text-navy" aria-hidden>
              arrow_back
            </span>
          </Link>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-black text-navy">{title}</div>
            {subtitle && <div className="truncate text-[11px] font-semibold text-muted">{subtitle}</div>}
          </div>
        </div>

        <div className="flex flex-1 flex-col md:overflow-y-auto">
          <div className="flex flex-col gap-4 p-4 md:p-7">
            <div className="hidden flex-wrap items-end justify-between gap-3 md:flex">
              <div>
                <h1 className="text-[24px] font-black text-navy">{title}</h1>
                {subtitle && <div className="mt-1 text-[13px] font-semibold text-[#5B6B80]">{subtitle}</div>}
              </div>
              {toolbar}
            </div>
            <div className="md:hidden">{toolbar}</div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Thẻ trắng chuẩn của Hub (DESIGN.md §Components) — bo 20px, bóng nhẹ, không viền màu. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-[20px] bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-5 ${className}`}>
      {children}
    </div>
  );
}
