// apps/hub/lib/session.ts — helper phía server (Server Component) đọc phiên hiện tại.
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE } from "@hub/core/auth-adapter";
import type { HubRole } from "@hub/core/contracts";

export interface CurrentSession {
  authUid: string;
  displayName: string;
  roles: HubRole[];
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const token = cookies().get(SESSION_COOKIE.name)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  return { authUid: claims.sub, displayName: claims.displayName, roles: claims.roles };
}
