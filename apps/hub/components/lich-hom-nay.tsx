// Thẻ "Lịch hôm nay" trên trang chủ — ADR-034, hạng mục lấy từ sơ đồ AI OS của cấp trên.
//
// ═══════════════════════════════════════════════════════════════════════════
// BA TRẠNG THÁI, BA CÂU KHÁC NHAU — và đây là toàn bộ lý do thẻ này khó hơn vẻ ngoài
// ═══════════════════════════════════════════════════════════════════════════
//   · đang tải          → "…"
//   · có sự kiện        → danh sách
//   · KHÔNG có sự kiện  → "Hôm nay không có lịch gì đặc biệt" **kèm** một dòng nói rõ
//                          đây là lịch trường tự nhập, Google chưa nối.
//
// Trạng thái thứ ba là chỗ dễ nói dối nhất. Một thẻ trống trơn đọc thành "hôm nay không
// có gì" — trong khi sự thật có thể là "trường chưa nhập lịch" hoặc "lịch nằm bên Google
// mà Hub chưa nối" (nợ #19). Ba chuyện khác nhau dẫn tới ba hành động khác nhau, và gộp
// chúng lại là đúng thứ Rev B/C điều 3 cấm: suy tin tốt từ im lặng.
"use client";

import { trpc } from "@/lib/trpc-client";
import type { GetLichHomNayOutput } from "@hub/core/contracts";

/** Icon theo loại. Tên đều CÓ trong font đã cắt gọn (public/fonts/icon-names.txt). */
const ICON: Record<string, string> = {
  chung: "campaign",
  hoc: "menu_book",
  hop: "groups",
  nghi: "beach_access",
  hoat_dong: "sports_soccer",
};

export function LichHomNay({ ban_dau }: { ban_dau: GetLichHomNayOutput | null }) {
  // `initialData` từ máy chủ: HTML lần đầu đã có lịch thật, không nhấp nháy qua "…".
  // Query vẫn chạy và vẫn là nguồn sự thật — nó chỉ xác nhận lại thứ đã hiện.
  const q = trpc.lich.getHomNay.useQuery(undefined, ban_dau ? { initialData: ban_dau } : undefined);
  const d = q.data;

  // Hỏng thì KHÔNG vẽ gì: lịch là thứ phụ trên trang chủ, và một khối đỏ "không tải
  // được lịch" giữa trang chủ làm người dùng tưởng cả trang hỏng. Lỗi đã vào log máy
  // chủ, chỗ người trực đọc.
  if (q.error) return null;

  return (
    <section className="rounded-[18px] border border-[#E4E9F0] bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className="msr text-[19px] text-[#2C7BF2]">event</span>
        <h2 className="text-[14px] font-black text-navy">Lịch hôm nay</h2>
      </div>

      {q.isPending && <p className="text-[12.5px] text-muted2">…</p>}

      {d && d.suKien.length > 0 && (
        <ul className="flex flex-col">
          {d.suKien.map((e) => (
            <li key={e.id} className="flex min-h-[44px] items-center gap-3 rounded-xl px-1">
              {/* Giờ đứng ĐẦU DÒNG và cố định bề rộng: mắt quét một cột giờ thẳng hàng
                  nhanh hơn hẳn một cột giờ so le theo độ dài tiêu đề. */}
              <span className="w-[42px] flex-none text-[12.5px] font-black text-navy">{e.gio}</span>
              <span aria-hidden className="msr flex-none text-[17px] text-caption">
                {ICON[e.loai] ?? "event"}
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] font-bold text-ink">
                {e.tieuDe}
                {/* Địa điểm và lớp là chi tiết phụ — nhạt hơn, cùng dòng, không xuống dòng
                    thành một khối chữ thứ hai. §1.5: ít chữ trên màn. */}
                {(e.diaDiem || !e.caTruong) && (
                  <span className="ml-1.5 text-[11px] font-semibold text-caption">
                    {[e.caTruong ? null : e.lop, e.diaDiem].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              {e.gioKetThuc && (
                <span className="flex-none text-[11px] text-caption">đến {e.gioKetThuc}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {d && d.suKien.length === 0 && (
        <p className="text-[12.5px] text-muted2">Hôm nay không có lịch gì đặc biệt.</p>
      )}

      {/* Dòng khai nguồn — hiện ở CẢ hai nhánh có và không có sự kiện. Bỏ nó khi có sự
          kiện là để người đọc tưởng đây đã là lịch đầy đủ của mình. */}
      {d && !d.daNoiGoogle && (
        <p className="mt-2 flex items-start gap-1.5 border-t border-[#F1F4F8] pt-2 text-[11px] text-caption">
          <span aria-hidden className="msr flex-none text-[14px]">info</span>
          Đây là lịch do trường nhập. Lịch Google chưa được nối.
        </p>
      )}
    </section>
  );
}
