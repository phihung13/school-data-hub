// apps/hub/components/ui/hop-thoai.tsx — LỚP NỔI dùng chung.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO TÁCH RA (07/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// Chủ đầu tư mở `/quan-tri/mini-app`, bấm "Khai app mới", và nói: form "nằm ở bên phải,
// đè khối kia xuống". Đúng — `NutThemApp` được truyền vào slot `toolbar` của
// `OperationsShell`, mà slot đó ở khổ máy tính nằm cuối một hàng `md:justify-between`.
// Nút thì vừa; một form mười ô thì biến hàng tiêu đề thành một cột dài 700px và đẩy toàn
// bộ danh sách app xuống dưới màn hình. Người khai app mất luôn ngữ cảnh "app nào đã có".
//
// Lời giải đúng cho một form khai-một-thứ-mới là lớp nổi, không phải một chỗ khác trong
// dòng chảy: nó không đụng vào bố cục nào, và nó tự nói rằng "đang làm một việc, xong thì
// quay lại".
//
// ═══════════════════════════════════════════════════════════════════════════════
// HỢP ĐỒNG CỦA MỘT HỘP THOẠI — SAO CHÉP TỪ `CheckinModal` (home-view.tsx)
// ═══════════════════════════════════════════════════════════════════════════════
// Bốn thứ đã phải vá bằng tay ở màn học sinh hôm 01/08/2026, gói lại ở đây để màn thứ ba
// không phải phát hiện lại từ đầu:
//   1. `role="dialog"` + `aria-modal` + `aria-labelledby` — trình đọc màn hình phải biết
//      vừa có gì mở ra, và nó tên gì.
//   2. Đưa tiêu điểm vào hộp khi mở, TRẢ tiêu điểm về đúng nút vừa mở khi đóng. Vế trả về
//      là vế hay quên: thiếu nó thì đóng xong tiêu điểm rơi về <body> và người dùng bàn
//      phím phải Tab lại từ đầu trang.
//   3. Escape đóng.
//   4. Tab quẩn trong hộp — danh sách phần tử tính LẠI mỗi lần bấm phím, không chụp một
//      lần lúc mở, vì nội dung hộp đổi được (form hiện lỗi, khối hướng dẫn mở ra).
//
// KHÔNG dùng `<dialog>` + `showModal()` dù trình duyệt lo hộ cả bốn: nó kéo theo
// `::backdrop` và một tầng z-index riêng của trình duyệt, đủ để lệch khỏi lớp phủ mà mọi
// màn khác trong kho đang dùng — và việc hôm nay là chuẩn hoá hành vi, không phải đổi hình.
"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HopThoai({
  tieuDe,
  moTa,
  onDong,
  rong = "max-w-[560px]",
  batBuoc = false,
  children,
}: {
  tieuDe: string;
  /** Một dòng dưới tiêu đề. Bỏ trống nếu tiêu đề đã đủ — §1.5 nói chữ nào không mang tin thì cắt. */
  moTa?: string;
  onDong: () => void;
  /** Lớp Tailwind quyết định bề ngang tối đa. Form khai app hẹp; bản hướng dẫn thì rộng. */
  rong?: string;
  /**
   * KHOÁ CỨNG: không nút đóng, Escape không đóng, bấm ra ngoài không đóng (ADR-036).
   *
   * Đây là chế độ NGOẠI LỆ và nó phá một quy ước tốt — mọi hộp thoại đều phải có đường
   * ra. Nó tồn tại cho đúng một việc: cổng check-in cảm xúc, nơi chủ đầu tư chốt "chặn
   * thật" ngày 21/08/2026. Dùng nó cho bất cứ thứ gì khác là nhốt người dùng trong một
   * lớp phủ, và đó là thứ tệ nhất một giao diện làm được.
   *
   * `onDong` VẪN được gọi khi nơi dùng tự quyết định đóng (ví dụ: em đã ghi xong) —
   * cờ này chỉ bỏ những đường ra do NGƯỜI DÙNG chủ động bấm.
   */
  batBuoc?: boolean;
  children: ReactNode;
}) {
  const khungRef = useRef<HTMLDivElement>(null);
  const nutDongRef = useRef<HTMLButtonElement>(null);
  const tieuDeId = `hop-thoai-${tieuDe.replace(/\s+/g, "-").toLowerCase()}`;

  useEffect(() => {
    const nguoiMo = document.activeElement as HTMLElement | null;
    // Chế độ bắt buộc không có nút đóng, nên focus rơi vào phần tử bấm được ĐẦU TIÊN
    // trong hộp. Không đặt focus thì nó ở lại trên trang phía sau — người dùng bàn phím
    // gõ Tab và đi lạc trong một trang đang bị phủ mờ mà không biết mình ở đâu.
    if (nutDongRef.current) nutDongRef.current.focus();
    else
      khungRef.current
        ?.querySelector<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ?.focus();
    // Khoá cuộn nền: mở một hộp thoại rồi lăn chuột mà trang phía sau chạy là tín hiệu
    // "cái này không phải một lớp riêng" — và ở khổ điện thoại nó làm mất luôn hộp.
    const cuOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = cuOverflow;
      nguoiMo?.focus?.();
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // Chặn LUÔN CẢ khi bắt buộc: stopPropagation để Escape không rơi xuống lớp dưới
      // và đóng một thứ khác — nhưng không gọi onDong.
      event.stopPropagation();
      if (!batBuoc) onDong();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = khungRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const dau = focusables[0]!;
    const cuoi = focusables[focusables.length - 1]!;
    if (!event.shiftKey && document.activeElement === cuoi) {
      event.preventDefault();
      dau.focus();
    } else if (event.shiftKey && document.activeElement === dau) {
      event.preventDefault();
      cuoi.focus();
    }
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0A1A32]/50 p-4 backdrop-blur-[2px] sm:p-6"
    >
      <div
        ref={khungRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tieuDeId}
        className={`relative my-auto w-full ${rong} rounded-[24px] bg-white shadow-[0_30px_70px_rgba(6,20,45,.4)]`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={tieuDeId} className="text-[16px] font-black leading-tight text-navy">
              {tieuDe}
            </h2>
            {moTa && <p className="mt-0.5 text-[12px] font-semibold text-muted">{moTa}</p>}
          </div>
          {/* 44px (§11). Nút ✕ 36px là đúng lỗi đã đo trên popup check-in hôm 01/08/2026.
              Chế độ bắt buộc: KHÔNG dựng nút này — một nút đóng không đóng được thì tệ
              hơn hẳn không có nút, vì nó mời người ta bấm rồi không phản hồi. */}
          {!batBuoc && (
            <button
              ref={nutDongRef}
              type="button"
              onClick={onDong}
              aria-label="Đóng"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-chip text-navy"
            >
              <span className="msr text-[20px]" aria-hidden>
                close
              </span>
            </button>
          )}
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
