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
import { StaffVoice } from "../ui/query-state";

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
    // §8 hai giọng: người đọc là cán bộ tâm lý cụm, không phải học sinh.
    <StaffVoice>
      <div className="flex min-h-screen w-full flex-col bg-pagebg s-home-md">
        <MiniAppHeader
          title={title}
          subtitle={subtitle}
          icon="psychology"
          gradient="from-domain-counselor to-domain-counselorDark"
        />
        <MainContent className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-4 p-4 md:p-7">
          {backHref && (
            // min-h-[44px] (§11): trước 01/08/2026 nút này cao ~40px. Đây là đường quay
            // lại duy nhất trong app — mini app không có tab bar Hub (§6).
            <Link
              href={backHref}
              className="inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[12.5px] font-extrabold text-cardtitle2 hover:bg-chip"
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
    </StaffVoice>
  );
}

/** Thẻ trắng chuẩn của Hub — cùng hình dạng với `Card` của khung GVCN, không tự chế kiểu mới. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`hv-card p-4 md:p-5 ${className}`}>
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
      {/*
        GẤP LẠI, KHÔNG CẮT BỚT (01/08/2026, gói "tiep-can-man-nguoi-lon").

        Dựng lại đúng chuỗi lớp và đúng chuỗi chữ này ở bề rộng 360px rồi đo: khối cũ cao
        138px — bảy dòng chữ 11,5px. Cộng với header mini app 68px, khối tiêu đề 104px và
        ba StatTile xếp dọc, ca đầu tiên của /tam-ly bắt đầu ở khoảng y = 586px, trong khi
        vùng nhìn thấy của một máy 360×640 sau thanh URL và toolbar Safari chỉ còn ~520–
        560px (DESIGN-GUIDELINES §2). Nghĩa là cô mở hộp việc trên điện thoại và thấy: một
        khối cảnh báo quyền riêng tư dài, ba con số, KHÔNG một cái tên nào — trong khi câu
        hỏi màn này sinh ra để trả lời là "hôm nay ai đang chờ tôi?". Cũng trái §1.5
        ("Ít chữ — Caption tối đa 1 dòng").

        Cách sửa KHÔNG được là xoá bớt sự thật: hai điều bị che là ràng buộc quyền riêng tư
        thật, và người dùng màn này PHẢI biết mình đang nhìn một bản không đầy đủ. Nên câu
        chốt ở lại trên mặt màn hình, phần giải thích vào <details> — thông tin còn nguyên,
        chiều cao còn khoảng 40px, và <details>/<summary> là phần tử gốc: bàn phím tới
        được, trình đọc màn hình đọc được trạng thái đóng/mở, không cần một dòng JavaScript.
      */}
      <details className="min-w-0 flex-1 text-[11.5px] font-semibold leading-relaxed text-[#4B3B7A]">
        {/* GIỮ tam giác mở/đóng mặc định của trình duyệt, không `list-none`: nó là dấu
            hiệu "bấm được" mà ai cũng đọc ra, và ẩn nó thì Chrome ẩn còn Safari vẫn hiện
            (Safari cần thêm ::-webkit-details-marker) — hai trình duyệt hai kiểu. Chữ
            "vì sao?" là lớp thứ hai, không phải lớp duy nhất. */}
        {/* min-h-[44px] (05/08/2026): đo thật ở 375px được 268×37, ở 1440px được 984×19 —
            dưới mốc 44px của §11/WCAG 2.5.5. Đây là phần tử BẤM ĐƯỢC duy nhất của cả khối
            cảnh báo quyền riêng tư, tức là đường duy nhất để thầy cô mở ra đọc VÌ SAO màn
            này thiếu dữ liệu. `flex items-center` để chiều cao mới không đẩy chữ lệch lên. */}
        {/* RÚT GỌN THÊM 06/08/2026, KHÔNG BỎ. Khối này là một trong số ít chỗ luật cắt
            giữ lại nguyên trách nhiệm: nó nói ra HAI thứ màn cố tình không hiện, và người
            có nghề PHẢI biết mình đang nhìn bản không đầy đủ. Cái bị cắt là ĐỘ DÀI —
            dòng tóm tắt cũ 55 ký tự nên vẫn xuống hai dòng ở 360px, và đoạn trong
            <details> có ba câu thì câu giữa kể quy trình chuyển tuyến (cơ chế) chứ không
            nói thêm gì về phạm vi đang nhìn. */}
        <summary className="flex min-h-[44px] cursor-pointer items-center">
          KHÔNG hiện tâm trạng và lời em viết
          <span className="ml-1 font-black text-domain-counselor">— vì sao?</span>
        </summary>
        <p className="mt-1.5">
          Thầy cô thấy loại tín hiệu và ngày, không thấy lời kể. Nên "không thấy gì bất thường" ở đây KHÔNG
          đọc được thành "em không có gì bất thường": im lặng vì bị che khác im lặng vì yên ổn.
        </p>
      </details>
    </div>
  );
}
