// apps/hub/app/api/quan-tri/ban-yeu-cau-dau-noi/route.ts
// Tải BẢN YÊU CẦU ĐẤU NỐI (.md) để đưa cho đội làm app.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO LÀ MỘT ROUTE, KHÔNG PHẢI MỘT FILE TĨNH TRONG public/
// ═══════════════════════════════════════════════════════════════════════════════
// Bản yêu cầu nói với đội làm app: "gửi webhook tới ĐỊA CHỈ NÀY", "issuer là ĐỊA CHỈ NÀY",
// "kiểm event.origin bằng ĐỊA CHỈ NÀY". Một file tĩnh không biết địa chỉ của chính Hub, nên
// nó chỉ còn hai đường, và cả hai đều hỏng:
//
//   (a) Viết chỗ trống `<ĐIỀN ĐỊA CHỈ HUB>` — người đọc phải tự thay ở tám chỗ. Thay sót
//       một chỗ là app kiểm `event.origin` bằng một chuỗi sai, tức là bỏ đúng cái hàng rào
//       chống đánh cắp token, và nó vẫn chạy được trên máy của họ.
//   (b) Ghi cứng `https://hub.truongvietanh.com` — hôm đổi tên miền thì tài liệu nói dối,
//       và nó nói dối với người ở ngoài tổ chức.
//
// Route thay `{{HUB_URL}}` bằng giá trị THẬT của máy chủ đang phục vụ. Bản tải xuống không
// còn chỗ trống nào để ai đó điền nhầm.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CHỈ QUẢN TRỊ — dù nội dung không phải bí mật
// ═══════════════════════════════════════════════════════════════════════════════
// Bản yêu cầu không chứa secret nào (nó nói TÊN biến, không nói giá trị — đúng luật của
// migration 0052/0055). Nhưng nó là bản đồ đầy đủ của mọi cửa ngoài: endpoint webhook, cách
// ký, luồng postMessage, các scope. Phát tự do cho cả internet là tiết kiệm công thăm dò cho
// người không có việc gì ở đây. Ba lớp cùng khuôn với `/quan-tri/mini-app`: chưa đăng nhập
// → 401, sai vai → 403.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";

/** Không đệm: file đọc mỗi lượt, và mỗi lượt tải là một lần hiếm. */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  if (!session.roles.includes("admin")) {
    return NextResponse.json({ error: "Chỉ quản trị tải được bản yêu cầu này." }, { status: 403 });
  }

  const hubUrl = process.env.HUB_URL ?? "http://localhost:3000";
  // `process.cwd()` là `apps/hub` — máy chủ chạy `node server.mjs` từ đúng thư mục đó
  // (xem tools/start-local.sh bước 2). Đường dẫn tương đối từ file này thì không dùng được:
  // Next đóng gói route handler nên `import.meta.url` trỏ vào `.next-prod/`, không trỏ vào
  // cây mã nguồn.
  const duong = join(process.cwd(), "server", "dau-noi", "ban-yeu-cau.md");

  let noiDung: string;
  try {
    noiDung = await readFile(duong, "utf8");
  } catch (err) {
    // Nói ĐÚNG BỆNH ra log. Ca này chỉ xảy ra khi cách triển khai đổi (standalone output,
    // container không mang theo thư mục server/), và khi đó người sửa cần biết nó tìm ở đâu
    // chứ không cần một dòng "500".
    console.error(`[ban-yeu-cau] không đọc được ${duong}:`, err);
    return NextResponse.json(
      { error: "Không đọc được bản yêu cầu trên máy chủ này — xem log máy chủ." },
      { status: 500 },
    );
  }

  const ngay = new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const ra = noiDung.replaceAll("{{HUB_URL}}", hubUrl).replaceAll("{{NGAY}}", ngay);

  return new NextResponse(ra, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      // Tên file mang ngày: người quản trị sẽ gửi nó qua email nhiều lần cho nhiều đội, và
      // ba file cùng tên `ban-yeu-cau.md` trong một hộp thư là ba file không phân biệt được.
      "content-disposition": `attachment; filename="dau-noi-mini-app-${new Date().toISOString().slice(0, 10)}.md"`,
      "cache-control": "no-store",
    },
  });
}
