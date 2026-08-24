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
  active,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  displayName: string;
  email: string;
  /** Vai THẬT của người đang xem — sidebar và tab bar đều đọc từ đây, không đoán. */
  roles: HubRole[];
  /**
   * `key` của màn đang mở, lấy từ bản khai `lib/man-hinh.ts` ("operations" · "miniapp" ·
   * "xem-truoc"). BẮT BUỘC truyền, không có giá trị mặc định.
   *
   * Vì sao (đo 05/08/2026): chỗ này từng viết chết `active="home"` cho MỌI màn dùng khung
   * này. Sidebar sáng một mục theo `active` và một mục nữa theo `pathname === item.href`,
   * nên trên /dieu-hanh, /quan-tri/mini-app và /quan-tri/xem-truoc có ĐÚNG HAI phần tử
   * cùng mang aria-current="page". Trình đọc màn hình đọc ra hai "trang hiện tại" và
   * người dùng bàn phím không còn cách nào biết mình đang đứng đâu.
   */
  active: string;
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
          {/* `active` đến từ nơi gọi, không viết chết ở đây — xem lý lẽ ở khai báo prop. */}
          <HubSidebar roles={roles} active={active} fullName={displayName} email={email} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-pagebg s-home-md md:overflow-hidden">
          {/* 44px (§11) — trước 01/08/2026 là h-9 w-9 = đúng 36px. Đây là lối ra duy
              nhất của màn Điều hành trên điện thoại; nay có thêm chữ đứng cạnh mũi tên
              vì `aria-label` không nói gì với người NHÌN THẤY nút. */}
          <div className="flex items-center gap-2.5 border-b border-line bg-card px-4 py-3 md:hidden">
            <Link
              href="/home"
              aria-label="Về trang chủ"
              className="flex min-h-[44px] flex-none items-center gap-1.5 rounded-xl bg-chip px-3"
            >
              <span className="msr text-[20px] text-cardtitle" aria-hidden>
                arrow_back
              </span>
              <span className="text-[12.5px] font-extrabold text-cardtitle">Trang chủ</span>
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
              {/* MỘT lần render `toolbar`, đổi chỗ bằng flex chứ không bằng hai nhánh
                  hiển thị (sửa 05/08/2026).
                  Bản cũ đặt `{toolbar}` ở HAI nơi — một trong `hidden md:block`, một trong
                  `md:hidden`. `display:none` không gỡ phần tử khỏi DOM, nên trang luôn có
                  hai bản: hai ô `input type="date"` cùng lúc ở màn Điều hành, và ở sổ Mini
                  App là hai `NutThemApp` với state React ĐỘC LẬP — mở form khai app ở khổ
                  hẹp rồi xoay ngang là form biến mất cùng mọi chữ vừa gõ, vì bản đang hiện
                  ra là bản kia, bản chưa ai bấm.
                  Xếp dọc dưới tiêu đề ở khổ hẹp, về cuối hàng từ `md` — đúng hai vị trí cũ. */}
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
                <div className="min-w-0">
                  <h1 className="text-[19px] font-black leading-tight text-cardtitle md:text-[24px]">{title}</h1>
                  {subtitle && (
                    <div className="mt-0.5 text-[12px] font-semibold text-muted md:mt-1 md:text-[13px]">
                      {subtitle}
                    </div>
                  )}
                </div>
                {toolbar}
              </div>

              {children}
            </div>
          </MainContent>

          <div className="md:hidden">
            <HubTabBar roles={roles} fullName={displayName} email={email} />
          </div>
        </div>
      </div>
    </StaffVoice>
  );
}

/** Thẻ trắng chuẩn của Hub — cùng hình dạng với Card của GvcnShell. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`hv-card-toi p-4 md:p-5 ${className}`}>
      {children}
    </div>
  );
}
