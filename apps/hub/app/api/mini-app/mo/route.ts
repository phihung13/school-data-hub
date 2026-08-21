// apps/hub/app/api/mini-app/mo/route.ts — ghi một lượt mở mini app (ADR-034, hạng mục
// "launcher tự ghim theo tần suất" lấy từ sơ đồ AI OS của cấp trên).
//
// ═══════════════════════════════════════════════════════════════════════════
// VÌ SAO LÀ MỘT ROUTE RIÊNG CHỨ KHÔNG PHẢI MỘT MUTATION tRPC
// ═══════════════════════════════════════════════════════════════════════════
// Luật của kho (§4) là "PWA/web chỉ đi qua tRPC + RLS", và route này KHÔNG phá luật đó:
// nó vẫn chạy dưới `withUserContext` nên RLS vẫn là hàng rào, không có `service_role`
// nào ở đây. Cái nó cần mà tRPC không cho là **`navigator.sendBeacon`**.
//
// Bài toán: người dùng chạm vào một ô app thì trình duyệt ĐIỀU HƯỚNG NGAY. Một
// `fetch()` thường (kể cả của tRPC) bị huỷ giữa chừng khi trang cũ bị tháo — nên số
// đếm sẽ hụt đúng ở những app được mở nhanh nhất, tức méo theo đúng chiều mà tính năng
// này quan tâm. `sendBeacon` sinh ra cho đúng việc này: trình duyệt nhận gói rồi tự gửi
// kể cả sau khi trang đã đi. Nó gửi `POST` với `Content-Type` do trình duyệt đặt và
// KHÔNG đọc được phản hồi — nên nó không hợp với giao thức tRPC.
//
// ═══════════════════════════════════════════════════════════════════════════
// BA ĐIỀU CỐ Ý
// ═══════════════════════════════════════════════════════════════════════════
// 1. LUÔN TRẢ 204, kể cả khi không ghi được gì. Người gọi là `sendBeacon` — nó không
//    đọc phản hồi, không thử lại, và không có ai để báo lỗi. Trả 4xx ở đây chỉ tạo
//    tiếng ồn trong log máy chủ mà không ai xử được. Cửa thật nằm trong SQL:
//    `ops.ghi_mo_mini_app` im lặng bỏ qua khi chưa đăng nhập.
// 2. KHÔNG TIN `app_key` GỬI LÊN, nhưng cũng không cần một danh sách trắng: bảng đếm
//    chỉ ghi cho CHÍNH người đang đăng nhập (policy `mini_app_usage_tu_ghi`), nên thứ
//    tệ nhất một người làm được là thổi số ghim của chính mình. Ràng buộc độ dài + CHECK
//    trong lược đồ chặn phần còn lại (rác dài, chuỗi rỗng).
// 3. LỖI CSDL KHÔNG ĐƯỢC NỔI LÊN THÀNH LỖI NGƯỜI DÙNG THẤY. Cùng luật với hai cổng ở
//    `app/home/page.tsx`: một con số thống kê không được làm hỏng một cú điều hướng.
import { NextResponse } from "next/server";
import { withUserContext } from "@hub/core/db";
import { getCurrentSession } from "@/lib/session";
import { log, describeError } from "@/lib/logger";

const KHONG_NOI_GI = new NextResponse(null, { status: 204 });

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return KHONG_NOI_GI;

  let appKey: string | null = null;
  try {
    // sendBeacon gửi Blob nên `Content-Type` không chắc là application/json — đọc thô
    // rồi tự phân tích, thay vì tin `req.json()` và nổ trên một thân hợp lệ.
    const raw = await req.text();
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const key = (parsed as { key?: unknown } | null)?.key;
    if (typeof key === "string" && key.trim() !== "" && key.length <= 64) appKey = key.trim();
  } catch {
    // Thân hỏng: bỏ qua trong im lặng, đúng điều cố ý số 1.
  }
  if (!appKey) return KHONG_NOI_GI;

  try {
    await withUserContext(session.authUid, (client) =>
      client.query("select ops.ghi_mo_mini_app($1)", [appKey]),
    );
  } catch (err) {
    log("error", "mini_app.ghi_luot_mo_that_bai", {
      authUid: session.authUid,
      appKey,
      ...describeError(err),
    });
  }
  return KHONG_NOI_GI;
}
