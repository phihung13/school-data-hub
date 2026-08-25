// POST /api/auth/sso-google — đổi access_token Supabase (đăng nhập Google) lấy phiên Hub.
//
// Đây là "bước 1-2 mới" thế chỗ cửa dev (xem dev-login/route.ts): xác minh danh tính từ
// Supabase Auth + nối vào sổ người dùng, rồi TÁI DÙNG NGUYÊN bước 3-5 — resolveIdentity
// → createSessionToken → cookie. Toàn bộ phần Supabase nằm trong adapter
// (packages/core/auth-adapter/google-provider.ts), route này chỉ ráp.
//
// Luồng phía trình duyệt: nút Google → {SUPABASE_URL}/auth/v1/authorize?provider=google
// → Google → Supabase đưa người dùng về /dang-nhap/google#access_token=… → trang đó
// POST token vào đây. Token đi trong BODY của một POST cùng-origin — không nằm trong
// URL (không lọt log/proxy), không nằm trong cookie của ai khác.
//
// Câu lỗi cho người dùng CỐ Ý ít thông tin — chi tiết vào log máy chủ. Riêng hai ca
// "chưa có trong sổ" và "sai domain" thì nói thẳng: đó là câu người dùng tự xử được
// (dùng đúng tài khoản trường) hoặc phải mang đi hỏi (nhờ trường thêm vào sổ).
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  createSessionToken,
  laEmailTruong,
  noiTaiKhoanTruong,
  resolveIdentity,
  sessionCookieOptionsFor,
  supabaseUrl,
  verifySupabaseToken,
} from "@hub/core/auth-adapter";
import { log } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/client-ip";

const Body = z.object({ accessToken: z.string().min(20).max(8192) });

export async function POST(req: NextRequest) {
  // Chưa cấu hình Supabase thì cửa này KHÔNG TỒN TẠI — 404 như dev-login khi thiếu
  // biến: một endpoint xác thực chưa bật không được phép tự khai mình đang tồn tại.
  if (!supabaseUrl()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cùng khoá đếm với cửa dev — đây là một cửa ĐĂNG NHẬP, chịu cùng ngân sách dò.
  const ip = clientIpFrom(req);
  // 10 lượt/phút/IP — một người thật đăng nhập tối đa vài lượt; phần dư là ngân sách
  // cho mạng chập chờn, không phải cho kẻ dò.
  const verdict = checkRateLimit(`sso-google:${ip}`, 10);
  if (!verdict.allowed) {
    return NextResponse.json({ error: "Thử lại sau ít phút." }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Thiếu accessToken hợp lệ" }, { status: 400 });
  }

  const danhTinh = await verifySupabaseToken(parsed.data.accessToken);
  if (!danhTinh) {
    log("warn", "sso_google.token_khong_xac_minh", { ip });
    return NextResponse.json({ error: "Không xác minh được lượt đăng nhập Google." }, { status: 401 });
  }

  if (!danhTinh.emailVerified || !laEmailTruong(danhTinh.email)) {
    // Nói rõ luật, không nói rõ máy: người dùng chọn nhầm tài khoản Gmail cá nhân là
    // ca THƯỜNG GẶP NHẤT của màn này, và câu lỗi phải chỉ được đường ra.
    log("warn", "sso_google.email_ngoai_domain", { ip });
    return NextResponse.json(
      { error: "Hub chỉ nhận tài khoản do Trường Việt Anh cấp (@truongvietanh.com). Hãy chọn đúng tài khoản trường khi đăng nhập Google." },
      { status: 403 },
    );
  }

  const noi = await noiTaiKhoanTruong(danhTinh);
  if (noi.trangThai === "chua-co-trong-so") {
    return NextResponse.json(
      { error: "Email này chưa có trong sổ người dùng của trường. Nhắn quản trị/giáo viên chủ nhiệm để được thêm vào." },
      { status: 403 },
    );
  }
  if (noi.trangThai === "email-da-noi-tai-khoan-khac") {
    log("warn", "sso_google.email_da_noi_khac", { ip });
    return NextResponse.json(
      { error: "Tài khoản này đã được kích hoạt trên một tài khoản Google khác. Nhắn quản trị nếu bạn vừa đổi tài khoản." },
      { status: 409 },
    );
  }

  const identity = await resolveIdentity(danhTinh.authUid);
  if (!identity) {
    log("error", "sso_google.resolve_null_sau_noi", { userId: noi.userId });
    return NextResponse.json({ error: "Không dựng được phiên. Thử lại, hoặc báo quản trị." }, { status: 500 });
  }

  const token = await createSessionToken({
    sub: identity.authUid,
    roles: identity.roles,
    displayName: identity.displayName,
  });

  const res = NextResponse.json({ ok: true, displayName: identity.displayName, roles: identity.roles });
  res.cookies.set(SESSION_COOKIE.name, token, sessionCookieOptionsFor(req.url));
  return res;
}
