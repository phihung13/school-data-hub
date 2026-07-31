#!/usr/bin/env node
// apps/hub/server.mjs — custom server: mount OIDC bridge (/oidc/*) TRONG CÙNG
// tiến trình Next.js, đúng "modular monolith, không phải service riêng" (ADR-014,
// 01-architecture.md §7). oidc-provider cần http.IncomingMessage/ServerResponse
// thô nên không đi qua route handler App Router được — bắt ở tầng server này.
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

const port = parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";

// Nạp .env.local NGAY tại đây, trước khi import provider.ts/clients.ts — clients.ts đọc
// process.env.OIDC_CLIENT_SECRET_FACTORY ở top-level (đánh giá lúc import, không phải lúc
// request), nên nếu import xảy ra trước khi env được nạp thì biến luôn "chưa tồn tại", dù
// giá trị có nằm sẵn trong .env.local. Bản thân `next({dev})` chỉ nạp env cho phía route
// handler ở app.prepare(), muộn hơn dòng import bên dưới nên không đủ (đã bắt lỗi này thật
// 30/07/2026: thêm đúng biến vào .env.local nhưng /oidc/auth vẫn báo invalid_client).
loadEnvConfig(process.cwd());

const app = next({ dev });
const handle = app.getRequestHandler();

const { getProvider, notifyBackchannelLogout } = await import("./server/oidc/provider.ts");
const { handleOidcInteraction } = await import("./server/oidc/interaction-handler.ts");

await app.prepare();
const provider = await getProvider();
const oidcCallback = provider.callback();

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

createServer((req, res) => {
  const parsedUrl = parse(req.url ?? "/", true);
  const pathname = parsedUrl.pathname ?? "/";

  // Chỉ tiến trình này giữ Provider thật (khoá JWKS thật) — route handler của Next
  // (build bằng webpack riêng) không được import thẳng provider.ts, phải gọi vào đây
  // (xem ghi chú trong apps/hub/app/api/auth/logout/route.ts).
  if (pathname === "/internal/oidc/backchannel-logout" && req.method === "POST") {
    const secret = req.headers["x-internal-secret"];
    if (secret !== (process.env.AUTH_SESSION_SECRET ?? "dev-only-secret-do-not-use-in-prod")) {
      res.writeHead(401).end("unauthorized");
      return undefined;
    }
    return readJsonBody(req)
      .then((body) => notifyBackchannelLogout(body.userId))
      .then(() => res.writeHead(200).end("ok"))
      .catch((err) => {
        console.error("[internal-backchannel-logout]", err);
        res.writeHead(500).end("error");
      });
  }

  if (pathname.startsWith("/oidc/interaction/")) {
    return handleOidcInteraction(req, res).catch((err) => {
      console.error("[oidc-interaction]", err);
      res.writeHead(500).end("Interaction error");
    });
  }

  if (pathname === "/oidc" || pathname.startsWith("/oidc/") || pathname === "/.well-known/openid-configuration") {
    return oidcCallback(req, res);
  }

  return handle(req, res, parsedUrl);
}).listen(port, () => {
  console.log(`> Ready on http://localhost:${port} (OIDC bridge tại /oidc/*)`);
});
