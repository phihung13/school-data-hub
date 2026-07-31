// apps/hub/server/oidc/internal-endpoint.ts — cổng `/internal/*` gom về một chỗ.
//
// LỖI ĐƯỢC VÁ Ở ĐÂY (phát hiện 31/07/2026, đọc `server.mjs:55-68`):
// endpoint nội bộ `/internal/oidc/backchannel-logout` được phục vụ trên CHÍNH listener
// công khai, và cửa duy nhất là một phép so chuỗi thường:
//     if (secret !== (process.env.AUTH_SESSION_SECRET ?? "dev-only-secret-do-not-use-in-prod"))
// Ba lỗ trong một dòng:
//   1. Không giới hạn loopback — ai trên internet cũng gọi được, chỉ cần đoán đúng khoá.
//   2. So sánh `!==` lộ thời gian, và trả 401 nên xác nhận luôn "endpoint này CÓ THẬT".
//   3. Có giá trị mặc định nằm sẵn trong repo — quên đặt biến thì cửa mở toang.
//
// Vá: mọi kiểm tra dồn vào `verifyInternalRequest` (secrets.ts) — không phải loopback
// thì 404 (không xác nhận endpoint tồn tại), sai khoá thì 401 timing-safe, và ở
// production thiếu `INTERNAL_RPC_SECRET` thì hàm đó NÉM LỖI ngay lúc khởi động.
//
// ⚠️ ĐỂ BẢN VÁ CÓ HIỆU LỰC, `server.mjs` PHẢI GỌI HÀM NÀY thay cho khối inline cũ:
//
//     import { INTERNAL_BACKCHANNEL_LOGOUT_PATH, handleInternalBackchannelLogout }
//       from "./server/oidc/internal-endpoint.ts";
//     ...
//     if (pathname === INTERNAL_BACKCHANNEL_LOGOUT_PATH && req.method === "POST") {
//       return handleInternalBackchannelLogout(req, res);
//     }
//
// (`server.mjs` nằm ngoài phạm vi gói việc này nên không sửa ở đây — xem canPhoiHop.)

import type { IncomingMessage, ServerResponse } from "node:http";
import { INTERNAL_BACKCHANNEL_LOGOUT_PATH, verifyInternalRequest } from "./secrets.ts";
import { notifyBackchannelLogout, type BackchannelLogoutReport } from "./provider.ts";

export { INTERNAL_BACKCHANNEL_LOGOUT_PATH };

/** Thân request nội bộ luôn nhỏ; chặn trước để không ai bơm phình bộ nhớ tiến trình. */
const MAX_BODY_BYTES = 4 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer | string) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) {
        reject(new Error("Thân request nội bộ vượt quá 4KB."));
        req.destroy();
      }
    });
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

export async function handleInternalBackchannelLogout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const verdict = verifyInternalRequest({
    remoteAddress: req.socket?.remoteAddress,
    secretHeader: req.headers["x-internal-secret"],
  });

  if (!verdict.ok) {
    // 404 cho người ngoài loopback: không xác nhận endpoint có thật. 401 chỉ dành cho
    // lời gọi ĐÃ ở đúng máy — lúc đó thông tin "sai khoá" là hữu ích cho người vận hành
    // chứ không còn hữu ích cho người quét.
    if (verdict.status === 404) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
    } else {
      console.error("[internal-backchannel-logout] sai INTERNAL_RPC_SECRET — đăng xuất chung KHÔNG chạy.");
      sendJson(res, 401, { error: "unauthorized" });
    }
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "bad_json" });
    return;
  }

  const userId = (body as { userId?: unknown } | null)?.userId;
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    sendJson(res, 400, { error: "userId phải là UUID của core.users" });
    return;
  }

  let report: BackchannelLogoutReport;
  try {
    report = await notifyBackchannelLogout(userId);
  } catch (err) {
    // Không nuốt im lặng: đây chính là kiểu lỗi trước đây biến mất sau `.catch(() => {})`.
    console.error("[internal-backchannel-logout] lỗi khi báo RP", { userId, err });
    sendJson(res, 500, { error: "internal_error" });
    return;
  }

  // 200 kèm báo cáo chi tiết để phía gọi (logout route) ghi log được RP nào không nhận.
  sendJson(res, 200, report);
}
