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
import { MainContent } from "../page-shell";
import { HubTabBar } from "../tab-bar";
import { StaffVoice } from "../ui/query-state";

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
    // §8 hai giọng: người đọc màn này là hiệu trưởng / ban điều hành. Câu lỗi mặc định
    // của query-state viết cho học sinh ("Thử lại giúp nhé") — StaffVoice đổi sang bản
    // gọn cho cả ba trạng thái tải/lỗi/rỗng bên trong.
    <StaffVoice>
      <div className="flex min-h-screen w-full md:h-screen md:overflow-hidden">
        <div className="hidden w-[240px] flex-none md:flex">
          {/* `active="home"`: màn này chưa có mục riêng trong sidebar (thêm mục là việc
              của file hub-sidebar.tsx, ngoài phạm vi gói này — xem ghi chú bàn giao).
              Trỏ vào "home" để không có mục nào sáng lên sai chỗ. */}
          <HubSidebar roles={roles} active="home" fullName={displayName} email={email} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
          {/* 44px (§11) — trước 01/08/2026 là h-9 w-9 = đúng 36px. Đây là lối ra duy
              nhất của màn Điều hành trên điện thoại; nay có thêm chữ đứng cạnh mũi tên
              vì `aria-label` không nói gì với người NHÌN THẤY nút. */}
          <div className="flex items-center gap-2.5 border-b border-line bg-white px-4 py-3 md:hidden">
            <Link
              href="/home"
              aria-label="Về trang chủ"
              className="flex min-h-[44px] flex-none items-center gap-1.5 rounded-xl bg-chip px-3"
            >
              <span className="msr text-[20px] text-navy" aria-hidden>
                arrow_back
              </span>
              <span className="text-[12.5px] font-extrabold text-navy">Trang chủ</span>
            </Link>
          </div>

          {/* Landmark <main id="noi-dung"> + MỘT <h1> đổi cỡ theo khổ màn. Cùng một lỗi,
              cùng một cách sửa, cùng một phép đo với gvcn-shell.tsx (02/08/2026): đường
              tắt "Bỏ qua menu" in trên mọi trang mà `id="noi-dung"` không tồn tại, và
              <h1> nằm trong nhánh `hidden … md:flex` nên biến mất ở 375px — đúng khổ màn
              của một hiệu trưởng đứng ngoài sân trường, tình huống mà chú thích đầu file
              này gọi là tình huống thật. */}
          <MainContent className="flex flex-1 flex-col md:overflow-y-auto">
            <div className="flex flex-col gap-4 p-4 md:p-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-[19px] font-black leading-tight text-navy md:text-[24px]">{title}</h1>
                  {subtitle && (
                    <div className="mt-0.5 text-[12px] font-semibold text-muted md:mt-1 md:text-[13px]">
                      {subtitle}
                    </div>
                  )}
                </div>
                <div className="hidden md:block">{toolbar}</div>
              </div>
              <div className="md:hidden">{toolbar}</div>

              {children}
            </div>
          </MainContent>

          <div className="md:hidden">
            <HubTabBar roles={roles} />
          </div>
        </div>
      </div>
    </StaffVoice>
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
