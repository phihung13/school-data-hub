// apps/hub/components/dieu-hanh/operations-shell.tsx — khung màn Điều hành (BGH).
//
// Cùng kiểu khung với GvcnShell (sidebar 240px trên desktop · thanh trên + tab bar
// trên điện thoại) chứ không phải một khung thứ ba tự chế: DESIGN-GUIDELINES §1.4
// nói mọi màn phải hình dung được ở cả hai khổ, và hiệu trưởng cầm điện thoại đứng
// ngoài sân trường là tình huống thật.
//
// Không chép `GvcnShell` vào đây được vì khung đó viết chết `roles={["homeroom"]}`
// cho sidebar và nút quay lại trỏ `/gvcn` — dùng lại nguyên si thì hiệu trưởng nhìn
// xuống menu thấy nguyên bộ mục của GVCN, tức là một menu nói dối về chính vai mình.
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { HubRole } from "@hub/core/contracts";
import { HubSidebar } from "../hub-sidebar";
import { HubTabBar } from "../tab-bar";

export function OperationsShell({
  title,
  subtitle,
  displayName,
  email,
  roles,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  displayName: string;
  email: string;
  /** Vai THẬT của người đang xem — sidebar và tab bar đều đọc từ đây, không đoán. */
  roles: HubRole[];
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full md:h-screen md:overflow-hidden">
      <div className="hidden w-[240px] flex-none md:flex">
        {/* `active="home"`: màn này chưa có mục riêng trong sidebar (thêm mục là việc
            của file hub-sidebar.tsx, ngoài phạm vi gói này — xem ghi chú bàn giao).
            Trỏ vào "home" để không có mục nào sáng lên sai chỗ. */}
        <HubSidebar roles={roles} active="home" fullName={displayName} email={email} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-line bg-white px-4 py-3 md:hidden">
          <Link
            href="/home"
            aria-label="Về trang chủ"
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

        <div className="md:hidden">
          <HubTabBar roles={roles} />
        </div>
      </div>
    </div>
  );
}

/** Thẻ trắng chuẩn của Hub — cùng hình dạng với Card của GvcnShell. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-[20px] bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-5 ${className}`}>
      {children}
    </div>
  );
}
