// apps/hub/lib/viewport.ts — "màn hình này đang là khổ nào?" hỏi MỘT lần, dùng chung.
//
// Vì sao cần: trước 31/07/2026 các màn có hai bố cục thật sự khác nhau (trang chủ,
// báo cáo) dựng CẢ HAI cây rồi để CSS ẩn một cây (`md:hidden` / `hidden md:flex`).
// Hậu quả đo được trên bản chạy: HTML của /home chứa chữ "Mini App" HAI lần, mọi
// truy vấn con chạy hai lần số component, và mỗi lần dữ liệu đổi thì React đối chiếu
// hai cây — trong khi người dùng chỉ nhìn thấy một. Trên điện thoại Android rẻ tiền
// (bối cảnh dùng thật của học sinh theo PRODUCT.md) đó là phần việc trả tiền mà
// không ai xem.
//
// Mẫu này đã chạy đúng ở components/login-parallax-bg.tsx: trả về câu trả lời cho
// nơi gọi TỰ QUYẾT dựng nhánh nào — trả `null` (không dựng) rẻ hơn hẳn `display:none`.
//
// Bản ở server trả `false` — CÓ CHỦ Ý, không phải mặc định cho có:
//   - Server không biết bề rộng màn hình. Đoán "desktop" nghĩa là bắt mọi điện thoại
//     tải HTML của bố cục máy tính rồi vứt đi — đúng nhóm máy yếu nhất.
//   - Đoán "mobile" thì máy tính nhận HTML nhỏ hơn nó cần và dựng lại bố cục desktop
//     ngay sau hydrate. Dữ liệu trên các màn này đằng nào cũng tới sau hydrate (tRPC),
//     nên thứ bị đổi chỉ là khung, không phải nội dung.
// Đây là đánh đổi ĐÃ CHỌN: ưu tiên điện thoại, đúng thứ tự ưu tiên của PRODUCT.md.
"use client";

import { useSyncExternalStore } from "react";

/** Phải khớp breakpoint `md` của Tailwind — mọi tiền tố `md:` trong app dựa vào đúng số này. */
export const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * `true` khi khung hiện tại từ `md` trở lên. Đổi khi người dùng xoay máy hoặc kéo
 * cửa sổ — không cần listener resize thủ công, matchMedia chỉ bắn khi VƯỢT ngưỡng.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
