// apps/hub/lib/read-json.ts
//
// `await req.json()` ném SyntaxError khi body không phải JSON hợp lệ — và ném TRƯỚC khi
// zod kịp chạy, nên safeParse không cứu được. Next bắt exception đó và trả 500.
//
// Vì sao 500 ở đây là lỗi thật sự tốn tiền: với webhook app ngoài, 5xx là tín hiệu quy ước
// "lỗi tạm, cứ gửi lại". App ngoài sẽ retry mãi một body vĩnh viễn hỏng — vòng lặp vô tận
// tiêu CPU của Hub cho một request không bao giờ thành công. 400 nói đúng sự thật: lỗi nằm
// ở phía người gửi, gửi lại y hệt cũng vậy thôi.
import { NextResponse } from "next/server";

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

export async function readJsonBody(req: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "body không đọc được như JSON",
          hint: "Kiểm tra header Content-Type: application/json và cú pháp JSON. Gửi lại y hệt sẽ vẫn hỏng.",
        },
        { status: 400 },
      ),
    };
  }
}
