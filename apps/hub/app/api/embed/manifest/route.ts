// apps/hub/app/api/embed/manifest/route.ts
//
// Cửa duy nhất để MIDDLEWARE (Edge runtime) biết origin của app nhúng.
//
// Vì sao phải có một endpoint chỉ để làm việc này: middleware dựng header CSP
// `frame-src` cho `/embed/<app-id>`, mà nguồn sự thật nay là bảng `core.embedded_apps`
// (migration 0052) — và Edge runtime không có `net`/`tls` nên không chạy được `pg`.
// Đường duy nhất còn lại là một lời gọi HTTP tới chính Hub, tới một route chạy Node.
//
// Đây KHÔNG phải giải pháp đẹp. Nó là giải pháp có MỘT nguồn sự thật, và đó là tiêu chí
// thắng: bản thay thế (giữ một mảng tĩnh trong mã cho middleware dùng) sẽ cho ra cảnh
// quản trị tắt app trên màn hình mà `frame-src` vẫn allowlist domain cũ — tắt trên giấy,
// còn sống trong header, và không một lỗi nào nổ ra.
//
// ── Ba thứ endpoint này CỐ Ý không làm ──────────────────────────────────────────
//  1. KHÔNG đòi đăng nhập. Middleware chạy trước mọi phiên và không có cookie của ai để
//     đưa. Bù lại, thứ đi ra hẹp hết mức: chỉ `appId` + `origin` của app ĐANG BẬT — đúng
//     hai trường mà bất kỳ ai mở /embed/<app> cũng nhìn thấy trong header CSP. Không có
//     secret, không có vai, không có tên biến môi trường.
//  2. KHÔNG nhận tham số. Không lọc, không tìm, không phân trang — không có bề mặt nào
//     để mà bơm dữ liệu vào.
//  3. KHÔNG cache HTTP. Bộ đệm nằm ở `registry-db.ts` (10 giây) và ở chính middleware.
//     Thêm một tầng đệm nữa của trình duyệt/CDN là thêm một chỗ giữ lại app đã bị thu hồi.
import { NextResponse } from "next/server";
import { napOriginNhung } from "@/server/embed/registry-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const apps = await napOriginNhung();
    return NextResponse.json({ apps }, { headers: { "cache-control": "no-store" } });
  } catch {
    // Database hỏng: trả 503 chứ KHÔNG trả danh sách rỗng. Rỗng và "không biết" là hai
    // câu trả lời khác nhau, và middleware xử hai câu đó khác nhau — trả rỗng ở đây sẽ
    // khiến nó tưởng "hệ không có app nhúng nào" thay vì "chưa hỏi được".
    return NextResponse.json({ error: "chưa đọc được sổ đăng ký" }, { status: 503 });
  }
}
