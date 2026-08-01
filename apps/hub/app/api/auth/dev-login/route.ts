// apps/hub/app/api/auth/dev-login/route.ts
// DEV ONLY — thay Google SSO thật (xem packages/core/auth-adapter/dev-provider.ts).
//
// KHOÁ 02/08/2026 (nợ #19). Trước hôm nay file này dài 34 dòng và không có MỘT phép
// kiểm nào: gửi một `authUid` trong danh sách mẫu là nhận cookie phiên đúng vai đó.
// Route nằm sau tên miền công khai `hub.truongvietanh.com`; đã đo thật — một lượt POST
// từ ngoài lấy được phiên hợp lệ, kể cả vai hiệu trưởng. Nay phải qua cửa
// `/api/auth/dev-gate` trước (bí mật trong biến môi trường, nhập một lần, nhớ bằng
// cookie riêng 30 ngày).
//
// Toàn bộ lý do — gồm vì sao KHÔNG chặn theo localhost, và bốn lời hứa của cửa — nằm
// ở `packages/core/auth-adapter/dev-gate.ts`. Đọc ở đó, đừng đoán lại ở đây.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  DEV_GATE_COOKIE_NAME,
  DEV_GATE_HEADER,
  evaluateDevGate,
  findDevAccount,
  resolveIdentity,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptionsFor,
} from "@hub/core/auth-adapter";
import { log } from "@/lib/logger";

const Body = z.object({ authUid: z.string().uuid() });

export async function POST(req: NextRequest) {
  // CỬA ĐẶT TRƯỚC MỌI THỨ KHÁC — trước cả việc đọc thân request. Người chưa qua cửa
  // không được làm máy chủ parse JSON, và nhất là không được biết `authUid` nào có
  // thật (404 "tài khoản không tồn tại" là một cửa dò danh sách tài khoản miễn phí).
  const gate = evaluateDevGate({
    cookie: req.cookies.get(DEV_GATE_COOKIE_NAME)?.value ?? null,
    header: req.headers.get(DEV_GATE_HEADER),
  });

  if (gate === "absent") {
    // NODE_ENV=production: route này không tồn tại. Không 403, không thông điệp —
    // câu trả lời phải giống hệt một đường dẫn gõ sai.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (gate === "misconfigured") {
    // Chưa đặt DEV_LOGIN_SECRET ⇒ ĐÓNG, không mở toang. Mặc định phải là đóng.
    log("error", "dev_login.gate_not_configured", {});
    return NextResponse.json(
      { state: gate, error: "Cửa đăng nhập thử chưa được cấu hình trên máy chủ." },
      { status: 503 },
    );
  }
  if (gate === "locked") {
    // Màn đăng nhập đọc `state` để bật ô nhập mã mở khoá rồi thử lại chính tài khoản
    // vừa bấm — nhờ vậy người dùng chỉ nhập bí mật ĐÚNG MỘT LẦN.
    return NextResponse.json(
      { state: gate, error: "Cần mã mở khoá bản thử trước khi đăng nhập." },
      { status: 401 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Thiếu authUid hợp lệ" }, { status: 400 });
  }

  const account = findDevAccount(parsed.data.authUid);
  if (!account) {
    return NextResponse.json({ error: "Tài khoản dev không tồn tại" }, { status: 404 });
  }

  const identity = await resolveIdentity(account.authUid);
  if (!identity) {
    return NextResponse.json({ error: "Không dựng được phiên — đã seed dữ liệu dev chưa?" }, { status: 500 });
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
