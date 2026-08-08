// apps/hub/components/chuong-viec-cho.tsx — chuông "việc đang chờ" ở góc phải hero.
//
// ═══════════════════════════════════════════════════════════════════════════════
// MỘT CÁI CHUÔNG ĐÃ BỊ GỠ KHỎI CHÍNH MÀN NÀY NGÀY 31/07/2026
// ═══════════════════════════════════════════════════════════════════════════════
// Bản cũ là `<Link href="/ho-so">` đội lốt chuông: bấm vào ra trang Hồ sơ. Bản mobile còn
// tệ hơn — một `<span>` trần, bấm không ra gì. Cả hai bị gỡ vì cùng một lý do, và lý do
// đó là điều kiện để dựng lại: **chuông phải đọc dữ liệu thật và phải dẫn tới thứ có thật.**
//
// Nguồn dữ liệu DUY NHẤT của khối này: `session.getPendingWork` — việc đang chờ của chính
// người đang đăng nhập (gửi muộn chờ xác nhận · cờ mới · báo cáo chờ duyệt · lời "cần gặp
// thầy cô" chưa ai đánh dấu). Mỗi mục mang sẵn `href` do MÁY CHỦ quyết định, nên màn hình
// không tự đoán đường đi: vai nào không mở được màn nào thì máy chủ đơn giản không trả mục
// đó về, thay vì client hiện ra rồi bấm vào bị 403.
//
// KHÔNG có "đã gửi tới Zalo" trong lớp nổi này (brief mục 6.5 hỏi tới): hạ tầng thông báo
// đẩy chưa mua, nên một dòng trạng thái gửi Zalo hôm nay là chữ không có dữ liệu đứng sau.
//
// ── VÌ SAO KHÔNG KHAI `aria-modal` VÀ KHÔNG GIAM FOCUS ─────────────────────────
// Cùng lý lẽ đã viết ở `user-menu.tsx`: khai một hợp đồng ARIA rồi không thi hành còn tệ
// hơn không khai. Lớp nổi này KHÔNG phủ nền, KHÔNG chặn phần còn lại của trang, nên
// `aria-modal="true"` (nghĩa: mọi thứ ngoài hộp là vô hiệu) sẽ là một lời nói sai với
// trình đọc màn hình. Thứ được thi hành đầy đủ và có thật ở đây: `role="dialog"` +
// `aria-labelledby`, `aria-expanded` trên nút, focus vào hộp khi mở, Escape đóng, bấm ra
// ngoài đóng, và TRẢ focus về nút chuông khi đóng.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import type { GetPendingWorkOutput, PendingWorkItem } from "@hub/core/contracts";
import { useDismissable } from "./user-menu";
import { MutationError, SkeletonBlock, StaffVoice } from "./ui/query-state";

// ---------------------------------------------------------------------------
// Hợp đồng: `packages/core/contracts/session.ts` (gói máy chủ, cùng ngày)
//
// KHÔNG khai lại hình dạng dữ liệu ở đây. Một bản chép tay của `PendingWorkItem` trong
// file màn hình là bản sẽ lạc hậu ở lần đổi hợp đồng đầu tiên, và lạc hậu im lặng — kiểu
// `any` không đỏ ở đâu cả. `ViecChoQuery` dưới đây chỉ khai NHỮNG GÌ KHỐI NÀY ĐỌC từ một
// truy vấn react-query, để test dựng được dữ liệu giả mà không phải dựng cả tRPC.
// ---------------------------------------------------------------------------

export type ViecCho = PendingWorkItem;

/** Đúng năm thứ khối này đọc từ một truy vấn react-query. */
export interface ViecChoQuery {
  data: GetPendingWorkOutput | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * `bat = false` → truy vấn đứng yên. Vai học sinh không đọc khối này (trang chủ của em đã
 * có thẻ check-in và dải "Tuần này"), và bắn một request cho mỗi em mỗi sáng là 5.000
 * request không màn hình nào vẽ ra.
 */
export function useViecCho(bat: boolean): ViecChoQuery {
  return trpc.session.getPendingWork.useQuery(undefined, { enabled: bat });
}

// ---------------------------------------------------------------------------
// Phép đếm và câu chữ — tách khỏi JSX để đo được bằng test
// ---------------------------------------------------------------------------

/** Tổng số việc trên chuông. Cộng `count`, KHÔNG đếm số dòng: 3 loại việc có thể là 17 việc. */
export function tongViec(items: ViecCho[]): number {
  return items.reduce((n, v) => n + v.count, 0);
}

/**
 * Nhãn cho tai của nút chuông. Bốn trạng thái ra bốn câu KHÁC nhau — chấm đỏ là tín hiệu
 * cho mắt, và §11 cấm màu (hay một cái chấm) làm tín hiệu duy nhất.
 */
export function nhanChuong(q: { isPending: boolean; isError: boolean; tong: number }): string {
  if (q.isPending) return "Việc đang chờ: đang tải";
  if (q.isError) return "Việc đang chờ: chưa tải được";
  if (q.tong === 0) return "Việc đang chờ: không có";
  return `Việc đang chờ: ${q.tong}`;
}

/** "2026-08-06" → "06/08". Dạng ISO là dạng cho máy đọc. */
export function ngayNgan(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

const TONE_STYLE: Record<ViecCho["tone"], { chip: string; icon: string }> = {
  // Nền + chữ lấy từ token (surface-danger2 #FFF0F0 với dangerText #C7333A = 4,79:1;
  // surface-info #E2F0FC với domain-attendanceDark #0A4FBF = 6,28:1). Icon đi kèm để hai
  // mức đọc ra được khi không phân biệt màu.
  urgent: { chip: "bg-surface-danger2 text-dangerText", icon: "priority_high" },
  normal: { chip: "bg-surface-info text-domain-attendanceDark", icon: "schedule" },
};

// ---------------------------------------------------------------------------

export function ChuongViecCho({ work }: { work: ViecChoQuery }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const items = work.data?.items ?? [];
  const tong = tongViec(items);
  const co = !work.isPending && !work.isError && tong > 0;

  // Đóng thì TRẢ FOCUS về nút đã mở. Thiếu vế này, người dùng bàn phím bấm Escape xong
  // rơi về <body> và phải Tab lại từ đầu trang — trong khi chỗ họ vừa đứng là góc phải hero.
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  useDismissable(open, [boxRef, buttonRef], close);

  // Đưa focus VÀO hộp khi mở: hộp nằm sau nút trong thứ tự DOM nên Tab vẫn tới được, nhưng
  // trình đọc màn hình cần được đưa tới nội dung vừa hiện ra thay vì tự đi tìm.
  useEffect(() => {
    if (open) boxRef.current?.focus();
  }, [open]);

  return (
    <div className="relative flex-none">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={nhanChuong({ isPending: work.isPending, isError: work.isError, tong })}
        // h-11 w-11 = 44×44 (§11, WCAG 2.5.8). Icon trắng trên đầu SÁNG của hero (#1E5FB8)
        // đo 6,21:1; trên đầu navy (#0A2A5E) đo 13,95:1.
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
      >
        {/* HAI icon khác hẳn nhau cho "có việc" và "không có việc" — chấm đỏ chỉ là tín
            hiệu thứ hai, không phải tín hiệu duy nhất (§11). */}
        <span aria-hidden="true" className="msr text-[22px]">
          {co ? "notifications_active" : "notifications"}
        </span>
        {co && (
          // Số nằm TRONG chấm: một chấm trần không nói được 1 việc hay 17 việc.
          // Chữ trắng trên #C7333A = 5,30:1. Vòng trắng 2px tách chấm khỏi nền navy —
          // #C7333A trên #0A2A5E chỉ 2,63:1, dưới mốc 3:1 của WCAG 1.4.11 cho hình.
          <span
            aria-hidden="true"
            className="absolute right-0 top-0.5 min-w-[19px] rounded-full bg-dangerText px-1 text-center text-[10px] font-black leading-[19px] text-white ring-2 ring-white"
          >
            {tong}
          </span>
        )}
      </button>

      {open && (
        <StaffVoice>
          <div
            ref={boxRef}
            tabIndex={-1}
            role="dialog"
            aria-labelledby="chuong-viec-cho-tieu-de"
            // Neo mép PHẢI: nút nằm sát mép phải hero, neo trái sẽ đẩy hộp ra ngoài màn
            // hình 390px. max-w chặn tràn ở khổ điện thoại.
            className="absolute right-0 top-[52px] z-30 w-[292px] max-w-[calc(100vw-32px)] rounded-2xl border border-line bg-white p-3 text-left shadow-[0_16px_36px_rgba(10,42,94,.2)]"
          >
            <h2 id="chuong-viec-cho-tieu-de" className="px-1 text-[13.5px] font-black text-navy">
              Việc đang chờ
            </h2>
            <div className="mt-2 flex flex-col gap-1">
              {work.isPending && <DangTai />}
              {work.isError && (
                <div className="px-1 py-2">
                  <MutationError error={work.error} onRetry={work.refetch} />
                </div>
              )}
              {!work.isPending && !work.isError && items.length === 0 && (
                <TrongChuong asOfDate={work.data?.asOfDate} />
              )}
              {!work.isPending &&
                !work.isError &&
                items.map((v) => <DongViec key={v.key} viec={v} onDi={() => setOpen(false)} />)}
            </div>
          </div>
        </StaffVoice>
      )}
    </div>
  );
}

/** Khung xương, KHÔNG phải vòng xoay giữa hộp: hộp cao 3 dòng, một vòng xoay ở đó xô layout. */
function DangTai() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 px-1 py-2">
      <span className="sr-only">Đang tải việc đang chờ</span>
      <SkeletonBlock className="h-4 w-2/3" />
      <SkeletonBlock className="h-4 w-1/2" />
    </div>
  );
}

/**
 * Thể rỗng. Điều 18 đòi nói được VÌ SAO trống — ở đây lý do là một MỐC THỜI GIAN, không
 * phải một lời biện minh: "không có việc nào" chỉ đúng tính tới lúc máy chủ chốt số.
 * Không có mốc thì người đọc không phân biệt được "sáng nay sạch việc" với "số của hôm kia".
 */
function TrongChuong({ asOfDate }: { asOfDate?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-2 px-1 py-2">
      <span aria-hidden="true" className="msr text-[20px] text-successText">
        task_alt
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-extrabold text-ink">Không có việc nào đang chờ</div>
        {asOfDate && <div className="mt-0.5 text-[10.5px] text-caption">Tính đến {ngayNgan(asOfDate)}</div>}
      </div>
    </div>
  );
}

function DongViec({ viec, onDi }: { viec: ViecCho; onDi: () => void }) {
  const style = TONE_STYLE[viec.tone];
  const ruot = (
    <>
      <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${style.chip}`}>
        <span aria-hidden="true" className="msr text-[17px]">
          {style.icon}
        </span>
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] font-bold text-ink">{viec.label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${style.chip}`}>{viec.count}</span>
      {/* Mũi tên CHỈ vẽ cho dòng bấm được. Vẽ nó trên một dòng không đi đâu là hứa một cú
          bấm không tồn tại — mà mũi tên là thứ mắt đọc trước cả chữ. */}
      {viec.href !== null && (
        <span aria-hidden="true" className="msr text-[18px] text-line2">
          chevron_right
        </span>
      )}
    </>
  );

  // `href === null`: việc có thật nhưng chưa có màn nào xử — xem chú thích ở contract.
  // Dựng bằng <div> chứ không phải <Link> tới một đường dẫn gần đúng: bàn phím sẽ không
  // dừng ở đây (đúng, vì không có gì để bấm), và không ai bị dẫn sang nhầm màn.
  if (viec.href === null) {
    return <div className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-2 py-2">{ruot}</div>;
  }

  return (
    <Link
      href={viec.href}
      onClick={onDi}
      className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-pagebg"
    >
      {ruot}
    </Link>
  );
}
