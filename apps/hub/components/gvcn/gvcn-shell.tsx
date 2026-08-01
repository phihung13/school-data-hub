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
import { MainContent } from "../page-shell";
import { HubTabBar } from "../tab-bar";
import { StaffVoice } from "../ui/query-state";

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
    // StaffVoice bọc CẢ khung: bốn màn con này là buồng lái của người lớn, nên câu lỗi
    // chung của query-state phải bỏ giọng dỗ trẻ ("Thử lại giúp nhé" → "Thử lại") —
    // DESIGN-GUIDELINES §8, hai giọng. Bọc ở khung thay vì truyền prop xuống từng
    // ErrorState để màn GVCN thứ sáu dựng sau này không thể quên.
    <StaffVoice>
      <div className="flex min-h-screen w-full md:h-screen md:overflow-hidden">
        {/* Sidebar chỉ ở khung máy tính. Trên điện thoại thay bằng thanh trên cùng có
            nút quay lại + tab bar dưới đáy — GVCN đứng trong lớp cầm điện thoại điểm
            danh là tình huống thật, không được khoá họ trong một trang không lối ra
            (DesktopOnlyNotice). Nút quay lại đưa về buồng lái; tab bar là đường tới
            /home và /ho-so (nơi có nút Đăng xuất), đúng vai trò sidebar làm ở md. */}
        <div className="hidden w-[240px] flex-none md:flex">
          <HubSidebar
            roles={["homeroom"]}
            active={active}
            fullName={displayName}
            email={email}
            classCode={classCode}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
          {/* Thanh trên của điện thoại nay CHỈ còn đường ra, không còn tiêu đề — xem lý
              do ở khối <h1> bên dưới. Nút mọc thêm chữ "Buồng lái" đứng cạnh mũi tên:
              nút chỉ có icon buộc người dùng phải đoán, và `aria-label` chỉ cứu được
              người dùng trình đọc màn hình chứ không cứu người nhìn thấy nó.
              min-h-[44px] (§11, WCAG 2.5.5) — trước 01/08/2026 là h-9 w-9 = đúng 36px,
              mà đây là đường ra DUY NHẤT của năm màn con trên điện thoại. */}
          <div className="flex items-center gap-2.5 border-b border-line bg-white px-4 py-3 md:hidden">
            <Link
              href="/gvcn"
              aria-label="Về buồng lái"
              className="flex min-h-[44px] flex-none items-center gap-1.5 rounded-xl bg-chip px-3"
            >
              <span className="msr text-[20px] text-navy" aria-hidden>
                arrow_back
              </span>
              <span className="text-[12.5px] font-extrabold text-navy">Buồng lái</span>
            </Link>
          </div>

          {/* LANDMARK <main id="noi-dung"> — thêm 02/08/2026, gói "audit-giao-dien-chay-tron".
              Đo trên bản đang chạy: `curl /gvcn/diem-danh` và `curl /gvcn/hoc-sinh/<id>` với
              phiên Cô Vân trả về chuỗi "skip-link" ĐÚNG HAI LẦN (đường tắt "Bỏ qua menu, tới
              nội dung chính" nằm ở app/layout.tsx, in trên mọi trang) nhưng `id="noi-dung"`
              ĐÚNG KHÔNG LẦN NÀO. Tức là trên cả năm màn GVCN, phần tử bấm được ĐẦU TIÊN của
              trang là một lời hứa không có đích: Tab một lần, Enter, và không đi tới đâu —
              không lỗi, không log, người dùng chuột không bao giờ chạm tới nên không ai báo.
              Trên desktop cái giá là 9 mục sidebar phải Tab qua trên MỖI màn con.
              Dùng <MainContent> chứ không tự viết <main id="noi-dung">: id gõ tay sai một ký
              tự thì đường tắt vẫn "bấm được" và vẫn chết (page-shell.tsx giải thích dài).
              Sidebar, thanh trên và tab bar nằm NGOÀI nó — nếu không thì "bỏ qua menu"
              không bỏ qua được gì. */}
          <MainContent className="flex flex-1 flex-col md:overflow-y-auto">
            <div className="flex flex-col gap-4 p-4 md:p-7">
              {/* MỘT <h1> DUY NHẤT, đổi cỡ theo khổ màn — không phải hai bản ẩn nhau.
                  Bản cũ đặt <h1> trong nhánh `hidden … md:flex`, nên ở 375px (khổ dùng
                  thật: cô đứng trong lớp cầm điện thoại) nó là display:none — mất khỏi cả
                  mắt lẫn cây trợ năng — còn thứ nhìn thấy là một <div> trong thanh trên.
                  Trình đọc màn hình mở /gvcn/diem-danh trên điện thoại không có heading
                  nào để biết đây là trang gì.
                  Vì sao KHÔNG viết hai <h1> (một mobile, một desktop): cả hai đều nằm
                  trong DOM, và tests/unit/a11y-nen.test.ts gọi đúng cái bẫy đó bằng tên. */}
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

          {/* Bốn màn con luôn thuộc vai GVCN (page.tsx của chúng chặn `homeroom` rồi
              mới render), nên bộ tab ở đây là bộ GVCN — không suy từ prop nào cả. */}
          <div className="md:hidden">
            <HubTabBar roles={["homeroom"]} />
          </div>
        </div>
      </div>
    </StaffVoice>
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
