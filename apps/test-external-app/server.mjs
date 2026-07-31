#!/usr/bin/env node
// apps/test-external-app/server.mjs
//
// App NGOÀI mẫu để cắm thử OIDC bridge của Hub (ADR-014) và Embed API webhook
// (ADR-017 mục 4.3, Đường B). KHÔNG sống trong monorepo build của Hub — chạy
// như một tiến trình Node hoàn toàn tách biệt (mô phỏng RP thật, vd Moodle),
// chỉ dùng chuẩn OIDC generic (PKCE, JWKS) — không SDK riêng của Hub.
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const HUB_URL = process.env.HUB_URL ?? "http://localhost:3000";
const CLIENT_ID = process.env.CLIENT_ID ?? "test-external-app";
const CLIENT_SECRET = process.env.CLIENT_SECRET ?? "dev-test-external-app-secret-not-for-prod";
const EMBED_SECRET = process.env.EMBED_SECRET ?? "dev-test-external-app-webhook-secret-not-for-prod";
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const jwks = createRemoteJWKSet(new URL(`${HUB_URL}/oidc/jwks`));

// Bộ nhớ tạm — demo một tiến trình, KHÔNG dùng cho production (giống ghi chú của oidc-provider phía Hub).
const pendingAuth = new Map(); // state -> { verifier }
const sessions = new Map(); // sid -> { sub, accessToken, claims }

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function page(body) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
  <title>App test ngoài — cắm SSO vào School Hub</title>
  <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#0A2A5E}
  .card{border:1px solid #EDF1F7;border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 3px 14px rgba(10,42,94,.06)}
  button,a.btn{display:inline-block;background:#0A2A5E;color:#fff;border:none;border-radius:8px;padding:10px 18px;text-decoration:none;cursor:pointer;font-size:14px}
  pre{background:#F7F9FC;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px}</style>
  </head><body><h1>🧪 App test ngoài</h1>
  <p style="color:#5B6B85">Tiến trình Node riêng biệt, KHÔNG sống trong repo Hub — mô phỏng một Relying Party thật (Moodle...) cắm SSO qua chuẩn OIDC.</p>
  ${body}</body></html>`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error("[test-external-app] lỗi không bắt được", err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page(`<div class="card">Lỗi phía app test ngoài — có thể do JWKS Hub vừa đổi (Hub mới restart, khoá ký ephemeral xoay). Đăng nhập lại.</div>`));
  }
});

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cookies = parseCookies(req.headers.cookie);
  const session = cookies.sid ? sessions.get(cookies.sid) : undefined;

  if (url.pathname === "/") {
    if (!session) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page(`<div class="card"><p>Chưa đăng nhập.</p><a class="btn" href="/login">Đăng nhập bằng School Hub (SSO)</a></div>`));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      page(`
      <div class="card">
        <p><strong>Đã đăng nhập qua Hub — không cần nhập lại mật khẩu ở đây.</strong></p>
        <pre>${JSON.stringify(session.claims, null, 2)}</pre>
      </div>
      <div class="card">
        <p>Đường B: gửi 1 sự kiện DEAR log mẫu về Hub qua Embed API webhook (chỉ hoạt động nếu tài khoản đang đăng nhập là <em>học sinh</em>).</p>
        <form method="POST" action="/demo/send-dear-log"><button type="submit">Gửi 1 buổi đọc sách mẫu về Hub</button></form>
      </div>
      <div class="card"><a href="/logout">Đăng xuất (chỉ ở app này)</a></div>
    `),
    );
    return;
  }

  if (url.pathname === "/login") {
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const state = b64url(randomBytes(16));
    pendingAuth.set(state, { verifier });

    const authUrl = new URL(`${HUB_URL}/oidc/auth`);
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid profile hub_profile");
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);

    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const pending = state ? pendingAuth.get(state) : undefined;
    if (!code || !pending) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page(`<div class="card">Thiếu code hoặc state không khớp (có thể đã dùng rồi).</div>`));
      return;
    }
    pendingAuth.delete(state);

    const tokenRes = await fetch(`${HUB_URL}/oidc/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: pending.verifier,
      }),
    });
    if (!tokenRes.ok) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page(`<div class="card">Đổi code lấy token thất bại: <pre>${await tokenRes.text()}</pre></div>`));
      return;
    }
    const tokens = await tokenRes.json();

    const { payload: idClaims } = await jwtVerify(tokens.id_token, jwks, {
      issuer: HUB_URL,
      audience: CLIENT_ID,
    });

    const userinfoRes = await fetch(`${HUB_URL}/oidc/me`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const profileClaims = userinfoRes.ok ? await userinfoRes.json() : idClaims;

    const sid = b64url(randomBytes(24));
    sessions.set(sid, { sub: idClaims.sub, accessToken: tokens.access_token, claims: profileClaims });

    res.writeHead(302, {
      Location: "/",
      "Set-Cookie": `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`,
    });
    res.end();
    return;
  }

  if (url.pathname === "/logout") {
    if (cookies.sid) sessions.delete(cookies.sid);
    res.writeHead(302, { Location: "/", "Set-Cookie": "sid=; Path=/; Max-Age=0" });
    res.end();
    return;
  }

  if (url.pathname === "/demo/send-dear-log" && req.method === "POST") {
    if (!session) {
      res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page(`<div class="card">Chưa đăng nhập.</div>`));
      return;
    }

    const aliasRes = await fetch(`${HUB_URL}/api/embed/alias`, {
      method: "POST",
      headers: { "x-embed-app": CLIENT_ID, authorization: `Bearer ${session.accessToken}` },
    });
    const aliasBody = await aliasRes.json();
    if (!aliasRes.ok) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page(`<div class="card">Không lấy được alias: <pre>${JSON.stringify(aliasBody, null, 2)}</pre></div>`));
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const webhookRes = await fetch(`${HUB_URL}/api/embed/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-embed-app": CLIENT_ID, "x-embed-secret": EMBED_SECRET },
      body: JSON.stringify({
        external_id: aliasBody.alias,
        event_type: "dear_log",
        payload: { logged_on: today, minutes: 25, book_title: "Dế Mèn phiêu lưu ký" },
      }),
    });
    const webhookBody = await webhookRes.json();

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      page(`<div class="card">
        <p>Alias do Hub sinh cho app này (app không tự khai): <code>${aliasBody.alias}</code></p>
        <p>Kết quả webhook → staging → promote():</p>
        <pre>${JSON.stringify(webhookBody, null, 2)}</pre>
        <p><a href="/">← Quay lại</a></p>
      </div>`),
    );
    return;
  }

  if (url.pathname === "/backchannel-logout" && req.method === "POST") {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const logoutToken = params.get("logout_token");
    if (!logoutToken) {
      res.writeHead(400).end("missing logout_token");
      return;
    }
    try {
      const { payload } = await jwtVerify(logoutToken, jwks, { issuer: HUB_URL, audience: CLIENT_ID });
      for (const [sid, s] of sessions) {
        if (s.sub === payload.sub) sessions.delete(sid);
      }
      console.log(`[backchannel-logout] đã xóa phiên cục bộ cho sub=${payload.sub}`);
      res.writeHead(200).end();
    } catch (err) {
      console.error("[backchannel-logout] logout_token không hợp lệ", err);
      res.writeHead(400).end("invalid logout_token");
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(page(`<div class="card">404</div>`));
}

server.listen(PORT, () => {
  console.log(`> App test ngoài chạy tại http://localhost:${PORT} (HUB_URL=${HUB_URL})`);
});
