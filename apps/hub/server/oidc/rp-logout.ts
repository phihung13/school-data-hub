// apps/hub/server/oidc/rp-logout.ts — đăng xuất do app ngoài khởi xướng (chiều ngược).
//
// LỖI ĐƯỢC VÁ Ở ĐÂY (phát hiện 31/07/2026): đăng xuất chỉ chạy MỘT CHIỀU.
//
// Chiều đã có: bấm đăng xuất trong Hub → `/api/auth/logout` xoá cookie `hub_session`
// rồi báo mọi RP qua back-channel.
//
// Chiều CÒN THIẾU: bấm đăng xuất trong Factory → RP gọi `/oidc/session/end` → phiên
// OIDC kết thúc, nhưng cookie `hub_session` vẫn còn nguyên hạn. Hậu quả cụ thể, không
// phải lý thuyết: em học sinh trong phòng máy dùng chung bấm "Đăng xuất" ở app ngoài,
// thấy màn hình đăng xuất, đứng dậy đi — máy đó vẫn đang mở phiên Hub của em, và mở
// lại app ngoài là SSO im lặng đăng nhập lại NGAY, không hỏi gì. Ca vận hành này ghi
// rõ ở `03-api.md:67,115`.
//
// VÁ THẾ NÀO — và vì sao KHÔNG chỉ cắm vào một hàm hook.
//
// Đo thật trên thư viện (31/07/2026) cho thấy đường `/oidc/session/end` rẽ ba nhánh, và
// KHÔNG nhánh nào một mình phủ hết:
//   · `logoutSource`             — CHỈ chạy khi đang có phiên OIDC. Không có phiên thì thư
//                                  viện tự dựng trang "Submitting Callback" của nó và bỏ
//                                  qua hook này hoàn toàn.
//   · `postLogoutSuccessSource`  — CHỈ chạy khi RP KHÔNG khai `post_logout_redirect_uri`.
//                                  Factory có khai, nên với Factory nhánh này không bao
//                                  giờ tới.
//   · chuyển hướng thẳng về RP   — không gọi hook nào cả.
//
// Vì vậy việc xoá cookie phải bám vào ĐƯỜNG DẪN chứ không bám vào hook: một middleware
// gắn `Set-Cookie` cho mọi phản hồi của `/oidc/session/end*`, kể cả phản hồi 302. Hai hook
// vẫn giữ — chúng lo phần giao diện tiếng Việt và tự gửi form — nhưng chúng là lớp phụ,
// không phải lớp bảo đảm.
//
// Ba hàm dưới đây là hàm THUẦN (chuỗi vào, chuỗi ra) để test khoá được đúng ba thứ:
// cookie bị xoá thật (Max-Age=0), giữ nguyên thuộc tính bảo mật của cookie gốc, và
// trang xác nhận thực sự gửi `logout=yes` chứ không phải "ở lại".

import { SESSION_COOKIE } from "@hub/core/auth-adapter";

/**
 * Chuỗi `Set-Cookie` xoá `hub_session`.
 *
 * Trình duyệt chỉ ghi đè một cookie khi name + Path + Domain khớp CHÍNH XÁC bản đang
 * giữ. Vì vậy phải dựng lại từ chính `SESSION_COOKIE.options` — chép tay "Path=/" ở đây
 * là mở đường cho ngày ai đó đổi options trong auth-adapter mà cửa đăng xuất này âm
 * thầm hết tác dụng.
 *
 * `Max-Age=0` kèm `Expires` quá khứ: Max-Age đủ cho mọi trình duyệt hiện đại, Expires
 * là bản dự phòng cho client cũ bỏ qua Max-Age.
 */
export function clearHubSessionCookie(): string {
  const o = SESSION_COOKIE.options;
  const parts = [
    `${SESSION_COOKIE.name}=`,
    `Path=${o.path}`,
    "Max-Age=0",
    `Expires=${new Date(0).toUTCString()}`,
    `SameSite=${o.sameSite.charAt(0).toUpperCase()}${o.sameSite.slice(1)}`,
  ];
  if (o.httpOnly) parts.push("HttpOnly");
  if (o.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Đường dẫn end_session (khai trong `routes` của provider). Middleware bám theo hằng số này. */
export const END_SESSION_PATH = "/oidc/session/end";

/** Phản hồi này có phải của đường đăng xuất không — dùng cho middleware gắn Set-Cookie. */
export function isEndSessionPath(path: string): boolean {
  // Phủ cả `/oidc/session/end` (GET, trang xen giữa) lẫn `/oidc/session/end/confirm`
  // (POST, nơi phiên thật sự bị huỷ và cũng là nơi phát sinh 302 về RP).
  return path === END_SESSION_PATH || path.startsWith(`${END_SESSION_PATH}/`);
}

/**
 * Trang xen giữa của `/oidc/session/end`.
 *
 * Vì sao TỰ gửi thay vì hỏi "bạn có chắc muốn đăng xuất không": người dùng vừa bấm
 * đăng xuất ở app ngoài rồi — hỏi lại lần hai chỉ tạo thêm một nút để bỏ lỡ, và bỏ lỡ
 * ở đây nghĩa là phiên Hub sống tiếp trên máy dùng chung. Đúng thứ đang vá.
 *
 * `form` do thư viện đưa vào đã chứa token xsrf và action thật. Ta chỉ thêm
 * `logout=yes` — thiếu trường này thì thư viện hiểu là "ở lại, đừng đăng xuất".
 *
 * `<noscript>` giữ đường thoát cho trình duyệt tắt JS: hai nút bấm tay, mặc định
 * (autofocus) là nút đăng xuất.
 */
export function autoSubmitLogoutPage(form: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Đang đăng xuất…</title>
</head>
<body onload="document.getElementById('op.logoutForm').submit()">
<p>Đang đăng xuất khỏi Trường Việt Anh…</p>
${form}
<input type="hidden" name="logout" value="yes" form="op.logoutForm">
<noscript>
  <p>Trình duyệt đang tắt JavaScript. Bấm nút bên dưới để hoàn tất đăng xuất.</p>
  <button autofocus type="submit" name="logout" value="yes" form="op.logoutForm">Đăng xuất</button>
  <button type="submit" form="op.logoutForm">Ở lại</button>
</noscript>
</body>
</html>`;
}

/** Trang báo đã xong, chỉ hiện khi RP KHÔNG khai `post_logout_redirect_uri`. */
export function logoutDonePage(): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Đã đăng xuất</title>
</head>
<body>
<p>Bạn đã đăng xuất khỏi Trường Việt Anh và mọi ứng dụng liên kết.</p>
<p><a href="/login">Đăng nhập lại</a></p>
</body>
</html>`;
}
