// apps/hub/components/tam-ly/tam-ly-shell.tsx — khung chung cho HAI màn của tâm lý cụm.
//
// Vì sao KHÔNG mượn `GvcnShell`: khung đó dựng quanh sidebar GVCN (`HubSidebar` với
// `roles={["homeroom"]}`), tức là mọi màn dùng nó sẽ hiện menu "Lớp chủ nhiệm · Điểm
// danh lớp · Duyệt báo cáo" — ba trang mà tâm lý cụm bấm vào sẽ bị đá ngược về /home.
// Menu dẫn tới trang mình không vào được là "menu 404", đúng lỗi mà mini-apps.ts đã ghi.
//
// Khung ở đây là khuôn MINI APP của DESIGN-GUIDELINES §6: header riêng theo màu chủ của
// app (tím `domain-counselor` — "tím = riêng tư") + capsule ⋯│✕ để thoát về Hub, và
// KHÔNG có tab bar Hub. Điều hướng trong app là một nút quay lại duy nhất.
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MiniAppHeader } from "../mini-app-header";
import { MainContent } from "../page-shell";

export function TamLyShell({
  title,
  subtitle,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  /** Dòng nhỏ dưới tiêu đề app — dùng để NÓI RA phạm vi đang xem, không để trang trí. */
  subtitle?: string;
  /** Có thì hiện nút quay lại trong app (màn chi tiết). Không có thì thôi — không vẽ nút chết. */
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-pagebgDesktop">
      <MiniAppHeader
        title={title}
        subtitle={subtitle}
        icon="psychology"
        gradient="from-domain-counselor to-domain-counselorDark"
      />
      <MainContent className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-4 p-4 md:p-7">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2.5 text-[12.5px] font-extrabold text-[#33507C] hover:bg-[#F5F8FC]"
          >
            <span className="msr text-[18px]" aria-hidden>
              arrow_back
            </span>
            {backLabel ?? "Quay lại"}
          </Link>
        )}
        {children}
      </MainContent>
    </div>
  );
}

/** Thẻ trắng chuẩn của Hub — cùng hình dạng với `Card` của khung GVCN, không tự chế kiểu mới. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-[20px] bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-5 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Khối nói rõ HAI THỨ MÀN NÀY CỐ TÌNH KHÔNG HIỆN, đặt ngay trên dữ liệu chứ không giấu
 * dưới chân trang.
 *
 * Đây không phải chú thích pháp lý cho đẹp: người dùng màn này là người có nghề, và họ
 * PHẢI biết mình đang nhìn một bản KHÔNG đầy đủ — nếu không, "không thấy gì bất thường"
 * sẽ bị đọc thành "em không có gì bất thường". Im lặng vì bị che khác im lặng vì yên ổn.
 */
export function ScopeNotice() {
  return (
    <div className="flex items-start gap-2 rounded-[16px] border-[1.5px] border-[#E4D9FB] bg-[#F7F3FF] px-4 py-3">
      <span className="msr mt-[1px] flex-none text-[18px] text-domain-counselor" aria-hidden>
        visibility_off
      </span>
      <div className="min-w-0 text-[11.5px] font-semibold leading-relaxed text-[#4B3B7A]">
        Trang này KHÔNG hiện tâm trạng hằng ngày và KHÔNG hiện nội dung lời em viết khi bấm «cần gặp
        thầy cô». Thầy cô thấy loại tín hiệu và ngày, không thấy lời kể. Muốn đọc nội dung thì GVCN
        phải hỏi ý em rồi chuyển tuyến — Hub chưa có đường đó.
      </div>
    </div>
  );
}
