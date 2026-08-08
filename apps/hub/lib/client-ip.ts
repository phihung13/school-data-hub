// apps/hub/lib/client-ip.ts — MỘT cách đọc IP cho những chỗ ĐẾM CHUNG một ngân sách.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO TÁCH RA (07/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// `/api/auth/dev-gate` và `/api/auth/dev-login` cùng canh MỘT ổ khoá (`DEV_LOGIN_SECRET`),
// nên từ hôm nay chúng tiêu chung một ngân sách đoán: `checkRateLimit("dev-gate:<ip>", 5)`.
// Ngân sách chung chỉ đúng khi hai bên tính ra CÙNG một chuỗi `<ip>` — hai bản sao của hàm
// này lệch nhau một dấu `.trim()` là hai xô đếm riêng, tức là gấp đôi số lượt đoán, và
// không có phép thử nào nhìn thấy điều đó.
//
// Hai chỗ khác trong kho vẫn giữ bản riêng (`/api/auth/invite`, `server/trpc.ts`) — chúng
// đếm theo khoá KHÁC nên bản riêng không sinh ra lỗi cộng dồn. Gộp nốt là việc dọn dẹp,
// không phải việc của bản vá này.
//
// ═══════════════════════════════════════════════════════════════════════════════
// KHÔNG DÙNG ĐỂ CẤP QUYỀN
// ═══════════════════════════════════════════════════════════════════════════════
// `x-forwarded-for` do proxy đặt và người gọi cũng đặt được. Nó CHỈ dùng để đếm số lần
// thử. Đường hầm Cloudflare trỏ hub.truongvietanh.com → http://localhost:3000, nên mọi
// request từ Internet tới Node đều mang địa chỉ nguồn 127.0.0.1 — một phép kiểm
// "đến từ loopback thì cho qua" ở đây sẽ xanh cho cả thế giới.
import type { NextRequest } from "next/server";

/**
 * IP thật sau đường hầm: chặng ĐẦU của `x-forwarded-for` (cloudflared đặt header này).
 * Không đọc được thì gom vào một xô chung — thà siết nhầm còn hơn để giấu IP là thoát.
 */
export function clientIpFrom(req: NextRequest): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "loopback";
}
