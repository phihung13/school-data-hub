// apps/hub/app/api/auth/invite/route.ts — đăng nhập phụ huynh bằng mã mời (M2).
import { NextResponse } from "next/server";
import { z } from "zod";
import { redeemInviteCode, resolveIdentity, createSessionToken, SESSION_COOKIE } from "@hub/core/auth-adapter";

const Body = z.object({ code: z.string().length(6) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Mã mời phải đủ 6 ký tự" }, { status: 400 });
  }

  let authUid: string;
  try {
    authUid = await redeemInviteCode(parsed.data.code);
  } catch {
    return NextResponse.json({ error: "Mã mời không hợp lệ hoặc đã hết hạn" }, { status: 400 });
  }

  const identity = await resolveIdentity(authUid);
  if (!identity) {
    return NextResponse.json({ error: "Không dựng được phiên phụ huynh" }, { status: 500 });
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
