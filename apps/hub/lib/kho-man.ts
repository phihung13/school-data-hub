// apps/hub/lib/kho-man.ts — đọc khổ màn mà TRÌNH DUYỆT TỰ KHAI trong header.
//
// CỐ Ý KHÔNG có `"use client"`: hàm này chạy ở SERVER (đọc header trong `page.tsx`).
// Anh em của nó — `useIsDesktop()` — thì bắt buộc phải là client, nên hai thứ không ở
// chung một file được. Bản đầu để chung và trang chủ trả **500**: một Server Component
// import hàm từ module `"use client"` chỉ nhận về tham chiếu client, gọi vào thì
// `TypeError: … is not a function`.
//
// ═══════════════════════════════════════════════════════════════════════════
// VÌ SAO CÓ HÀM NÀY, và vì sao nó KHÔNG lật quyết định trong `lib/viewport.ts`
// ═══════════════════════════════════════════════════════════════════════════
// Quyết định cũ — "server không biết bề rộng nên trả `false`, ưu tiên điện thoại" —
// vẫn đúng nguyên vẹn CHỪNG NÀO server phải ĐOÁN. Chủ đầu tư đo bằng mắt: *"mới vào
// giao diện dạng mobile ở desktop hiện 1s, sau đó chuyển qua giao diện bình thường"*.
// Đó là cái giá của việc đoán, và nó có thật.
//
// `Sec-CH-UA-Mobile` là trình duyệt TỰ NÓI: `?1` = máy điện thoại, `?0` = không phải.
// Có nó thì không còn gì để đoán, nên không còn cú nháy. Chromium (Chrome, Edge, Cốc
// Cốc) gửi mặc định; Safari và Firefox KHÔNG gửi — ở đó hành vi rơi về đúng quyết định
// cũ, không xấu đi một chút nào.
//
// Giới hạn, nói rõ: header này nói "máy có phải điện thoại không", KHÔNG nói bề rộng
// cửa sổ. Một cửa sổ Chrome kéo hẹp trên máy tính vẫn khai `?0`. Vì thế nó chỉ dùng cho
// LƯỢT VẼ ĐẦU; ngay sau hydrate `useIsDesktop()` (đo bề rộng thật) giành lại quyền
// quyết định. Trường hợp xấu nhất bằng đúng hôm nay: một cú đổi bố cục.

/** `true` = máy tính · `false` = điện thoại · `null` = trình duyệt không khai. */
export function khoManTuHeader(secChUaMobile: string | null): boolean | null {
  if (secChUaMobile === "?0") return true;
  if (secChUaMobile === "?1") return false;
  return null;
}
