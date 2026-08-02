// apps/hub/lib/vai-app-ngoai.ts — phép so vai cho Mini App NGOÀI, dùng được ở CLIENT.
//
// Vì sao không gọi thẳng `canOpenEmbedApp` của `server/embed/registry.ts`: hàm đó nhận
// nguyên `EmbedAppConfig` — hình dạng của tầng máy chủ, mang theo cả `webhookSecret`.
// Màn xem trước chạy ở trình duyệt và chỉ có `MiniAppRow` (hình dạng hợp đồng, không có
// secret). Kéo kiểu của tầng máy chủ xuống client là mở đường cho một trường bí mật đi
// theo, dù hôm nay chưa ai đọc nó.
//
// Nên tách ĐÚNG cái lõi — một phép so mảng vai — và để cả hai bên gọi cùng một luật.
// KHÔNG chép luật sang chỗ khác: chép là ngày nào đó hai bản sẽ trả lời khác nhau, và
// chỗ khác nhau sẽ là màn xem trước — tức là cái công cụ sinh ra để canh lại là cái nói
// dối.
import type { HubRole } from "@hub/core/contracts";

/**
 * Người mang bộ vai này có mở được app ngoài đó không.
 *
 * FAIL-CLOSED: mảng vai RỖNG = KHÔNG AI. Cùng ngữ nghĩa với `canOpenEmbedApp` ở tầng máy
 * chủ và với mặc định `allowed_roles = '{}'` của bảng `core.embedded_apps` (0052). App
 * mới quên cấp vai hỏng ngay lần bấm đầu tiên, lúc còn người ngồi nhìn — thay vì mở toang
 * cho mọi vai rồi sáu tháng sau mới phát hiện một em học sinh vào được app nhân viên.
 */
export function canOpenEmbedAppRoles(
  allowedRoles: readonly string[] | null | undefined,
  roles: readonly HubRole[],
): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return false;
  return roles.some((r) => allowedRoles.includes(r));
}
