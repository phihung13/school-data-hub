// apps/hub/app/api/auth/refresh/route.ts — gia hạn phiên trượt (sliding renewal).
//
// BÀI TOÁN THẬT: token sống 15 phút (ADR-016, không nới) và trước đây KHÔNG có đường
// mint lại nào — grep `createSessionToken` chỉ ra đúng hai nơi, cả hai là đăng nhập.
// Hậu quả: GVCN gõ ghi chú can thiệp 16 phút rồi bấm gửi là mất trắng nội dung và bị
// đẩy về /login. Cách sửa KHÔNG phải là kéo dài token, mà là mint lại token ngắn khi
// người dùng còn đang làm việc — và mỗi lần mint lại là một lần kiểm tài khoản còn
// hoạt động không (RULES Rev F điều 7: "mỗi lần refresh kiểm core.users.status").
//
// Ai gọi: middleware.ts, khi token còn dưới 5 phút. Người dùng không bao giờ tự gọi.
// Vì sao tách ra route handler thay vì làm ngay trong middleware: middleware chạy Edge
// runtime, ở đó không có `pg` nên không hỏi được core.users.status — mà bỏ bước hỏi đó
// thì "khoá tài khoản là cắt quyền ngay" chỉ còn là câu chữ.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  createSessionToken,
  resolveIdentity,
  shouldRenewSession,
  verifySessionToken,
} from "@hub/core/auth-adapter";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { describeError, log, newRequestId } from "@/lib/logger";

/** 401 + xoá cookie: phiên này KHÔNG được sống tiếp (hết trần, hoặc tài khoản đã khoá). */
function denied(reason: string) {
  const res = NextResponse.json({ ok: false, reason }, { status: 401 });
  res.cookies.set(SESSION_COOKIE.name, "", { ...SESSION_COOKIE.options, maxAge: 0 });
  return res;
}

export async function POST() {
  const token = cookies().get(SESSION_COOKIE.name)?.value;
  if (!token) return denied("no-session");

  const claims = await verifySessionToken(token);
  if (!claims) return denied("invalid-or-expired");

  // Chạm trần tuyệt đối (12 giờ) thì không gia hạn nữa — phải đăng nhập lại thật.
  if (!shouldRenewSession(claims)) {
    return NextResponse.json({ ok: true, renewed: false, reason: "not-due-or-absolute-limit" });
  }

  const limit = checkRateLimit(`refresh:${claims.sub}`, RATE_LIMITS.sessionRefresh);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let identity: Awaited<ReturnType<typeof resolveIdentity>>;
  try {
    identity = await resolveIdentity(claims.sub);
  } catch (err) {
    // CSDL trục trặc KHÔNG được biến thành "đăng xuất toàn trường": giữ nguyên cookie,
    // token cũ còn hạn tới 5 phút nữa, middleware sẽ thử lại ở request kế tiếp.
    const requestId = newRequestId();
    log("error", "auth.refresh.db_error", { requestId, authUid: claims.sub, ...describeError(err) });
    return NextResponse.json({ ok: false, reason: "temporary-failure", requestId }, { status: 503 });
  }

  // resolveIdentity trả null khi không tìm thấy user HOẶC status !== 'active' —
  // đây chính là điểm thi hành "khoá là cắt".
  if (!identity) {
    log("warn", "auth.refresh.denied", { authUid: claims.sub, reason: "inactive-or-missing" });
    return denied("account-inactive");
  }

  // Vai và tên lấy LẠI từ DB, không chép từ token cũ: đây cũng là lúc một thay đổi
  // phân quyền (thêm/bớt vai) đi vào phiên đang chạy, chậm nhất sau 10 phút.
  const renewed = await createSessionToken({
    sub: identity.authUid,
    roles: identity.roles,
    displayName: identity.displayName,
    absoluteExpiresAt: claims.absoluteExpiresAt, // giữ nguyên trần — gia hạn không dời trần
  });

  const res = NextResponse.json({ ok: true, renewed: true });
  res.cookies.set(SESSION_COOKIE.name, renewed, SESSION_COOKIE.options);
  return res;
}
