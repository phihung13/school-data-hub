import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, resolveIdentity } from "@hub/core/auth-adapter";

export async function POST() {
  // ADR-016 "thoát một nơi là thoát mọi nơi" — trước khi xoá phiên Hub, báo
  // mọi RP (app ngoài) đã đăng nhập qua OIDC bridge để họ tự đóng phiên phía họ.
  //
  // Gọi qua HTTP nội bộ tới server.mjs thay vì `import` thẳng provider.ts: Next.js
  // build route handler này bằng webpack riêng (module instance khác với bản
  // server.mjs nạp thẳng qua Node ESM) — import thẳng sẽ dựng MỘT Provider thứ hai
  // với khoá ký JWKS khác, ký logout_token bằng khoá không khớp JWKS đang phục vụ
  // thật ở /oidc/jwks. Chỉ có MỘT provider sống — của server.mjs — nên phải gọi vào đó.
  const token = cookies().get(SESSION_COOKIE.name)?.value;
  if (token) {
    const claims = await verifySessionToken(token);
    if (claims) {
      const identity = await resolveIdentity(claims.sub);
      if (identity) {
        const hubUrl = process.env.HUB_URL ?? "http://localhost:3000";
        await fetch(`${hubUrl}/internal/oidc/backchannel-logout`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-secret": process.env.AUTH_SESSION_SECRET ?? "dev-only-secret-do-not-use-in-prod",
          },
          body: JSON.stringify({ userId: identity.userId }),
        }).catch(() => {});
      }
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE.name, "", { ...SESSION_COOKIE.options, maxAge: 0 });
  return res;
}
