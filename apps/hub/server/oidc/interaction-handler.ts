// apps/hub/server/oidc/interaction-handler.ts
//
// Cầu nối SSO im lặng: KHÔNG có màn hình đăng nhập/consent riêng cho OIDC.
// Nếu trình duyệt đã có phiên Hub hợp lệ, hoàn tất interaction ngay lập tức —
// đây chính là cơ chế "mở app ngoài, vào thẳng không cần đăng nhập lại".
// Chưa có phiên → đưa sang /login của Hub, xong quay lại đúng interaction này.
//
// Chạy ngoài Next.js route handler vì oidc-provider cần http.IncomingMessage/
// ServerResponse thô (không phải Web Request) — gọi trực tiếp từ server.mjs.
import type { IncomingMessage, ServerResponse } from "node:http";
import { getProvider } from "./provider.ts";
import { verifySessionToken, resolveIdentity, SESSION_COOKIE } from "@hub/core/auth-adapter";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = value;
  }
  return out;
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

export async function handleOidcInteraction(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const provider = await getProvider();
  const details = await provider.interactionDetails(req, res);
  const { uid, prompt, params } = details;

  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[SESSION_COOKIE.name];
  const claims = sessionToken ? await verifySessionToken(sessionToken) : null;

  if (!claims) {
    redirect(res, `/login?then=${encodeURIComponent(`/oidc/interaction/${uid}`)}`);
    return;
  }

  const identity = await resolveIdentity(claims.sub);
  if (!identity) {
    // Tài khoản bị khóa (ADR-016) hoặc phiên hỏng — đưa lại /login, không đoán.
    redirect(res, "/login");
    return;
  }

  if (prompt.name === "login") {
    await provider.interactionFinished(
      req,
      res,
      { login: { accountId: identity.userId } },
      { mergeWithLastSubmission: false },
    );
    return;
  }

  if (prompt.name === "consent") {
    // Đường A: bridge chỉ cấp định danh (openid profile [hub_profile]) — không hỏi
    // người dùng, đúng "một chạm" đã ghi trong 09-hop-dong-app-ngoai.md.
    const grantId = details.grantId;
    const Grant = provider.Grant;
    const grant = grantId
      ? await Grant.find(grantId)
      : new Grant({ accountId: identity.userId, clientId: params.client_id as string });

    if (!grant) {
      redirect(res, "/login");
      return;
    }

    const missingScopes = (prompt.details.missingOIDCScope as string[] | undefined) ?? [];
    if (missingScopes.length) grant.addOIDCScope(missingScopes.join(" "));

    const newGrantId = await grant.save();
    await provider.interactionFinished(
      req,
      res,
      { consent: { grantId: newGrantId } },
      { mergeWithLastSubmission: true },
    );
    return;
  }

  redirect(res, "/login");
}
