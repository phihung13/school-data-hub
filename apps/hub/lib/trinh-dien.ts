// apps/hub/lib/trinh-dien.ts — công tắc trình diễn, phần QUYẾT ĐỊNH.
//
// File này KHÔNG có `"use client"` và KHÔNG import gì của Next — cùng lý do với
// `lib/kho-man.ts`: một module `"use client"` chỉ xuất ra tham chiếu client, nên phía
// máy chủ gọi vào sẽ nhận cái vỏ và nổ `TypeError: … is not a function`. Middleware chạy
// ở Edge runtime, còn bài test chạy ở Node — chỉ hàm thuần mới sống được ở cả ba chỗ.
//
// Middleware giữ phần THI HÀNH (đọc biến môi trường, dựng `rewrite`). Ở đây chỉ có luật.

/** Ba cửa vào bị che khi trình diễn. Mọi đường khác đi thẳng vào app thật. */
export const CUA_VAO_TRINH_DIEN = new Set(["/", "/login", "/home"]);

/**
 * Có phải lượt request này nhìn thấy trang trình diễn không.
 *
 * Ba điều kiện, và mỗi điều kiện tồn tại vì một lý do:
 *
 *   · `bat` — công tắc của chủ đầu tư. Tắt là app trở lại y nguyên, không hoàn tác gì.
 *   · `pathname` phải là MỘT TRONG BA CỬA VÀO. Không che cả site, để giữa buổi trình bày
 *     ai hỏi "cho xem màn điểm danh" thì vẫn mở được ngay, không phải đi tắt cờ.
 *   · `that !== "1"` — cửa sau vào app thật, ngay tại ba cửa đó.
 *
 * VÀ MỘT ĐIỀU KIỆN THỨ TƯ NẰM Ở PHÍA GỌI, không ở đây: `pathname` bắt đầu bằng
 * `/trinh-dien` thì không bao giờ tới được hàm này. `matcher` của middleware chỉ loại trừ
 * file có đuôi png/jpg/css/js… — KHÔNG loại `.html` và KHÔNG loại `.mp4`, nên chính trang
 * trình diễn và hai video của nó cũng chạy qua middleware. Không chặn là
 * `/trinh-dien/index.html` bị viết lại về chính nó, vòng vô tận, trang trắng.
 */
export function chieuTrinhDien(x: { bat: boolean; pathname: string; that: string | null }): boolean {
  if (!x.bat) return false;
  if (x.pathname.startsWith("/trinh-dien")) return false;
  if (!CUA_VAO_TRINH_DIEN.has(x.pathname)) return false;
  return x.that !== "1";
}
