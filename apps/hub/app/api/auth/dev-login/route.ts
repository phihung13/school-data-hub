// apps/hub/app/api/auth/dev-login/route.ts
// DEV ONLY — thay Google SSO thật (xem packages/core/auth-adapter/dev-provider.ts).
import { NextResponse } from "next/server";
import { z } from "zod";
import { findDevAccount, resolveIdentity, createSessionToken, SESSION_COOKIE } from "@hub/core/auth-adapter";

const Body = z.object({ authUid: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
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
  res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);
  return res;
}
