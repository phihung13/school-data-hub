import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, resolveIdentity } from "@hub/core/auth-adapter";
// CHỈ import từ `secrets.ts` (file lá). Import `internal-endpoint.ts` sẽ kéo theo
// `provider.ts` + thư viện `oidc-provider` vào bundle webpack của Next — đúng cái bẫy
// "hai Provider, hai bộ khoá" mà ghi chú bên dưới dặn phải tránh.
import {
  INTERNAL_BACKCHANNEL_LOGOUT_PATH,
  internalRpcOrigin,
  internalRpcSecret,
} from "@/server/oidc/secrets";
import { describeError, log } from "@/lib/logger";

/** RP chậm không được giữ chân nút đăng xuất của người dùng. */
const INTERNAL_CALL_TIMEOUT_MS = 6_000;

export async function POST() {
  // ADR-016 "thoát một nơi là thoát mọi nơi" — trước khi xoá phiên Hub, báo
  // mọi RP (app ngoài) đã đăng nhập qua OIDC bridge để họ tự đóng phiên phía họ.
  //
  // Gọi qua HTTP nội bộ tới server.mjs thay vì `import` thẳng provider.ts: Next.js
  // build route handler này bằng webpack riêng (module instance khác với bản
  // server.mjs nạp thẳng qua Node ESM) — import thẳng sẽ dựng MỘT Provider thứ hai
  // với khoá ký JWKS khác, ký logout_token bằng khoá không khớp JWKS đang phục vụ
  // thật ở /oidc/jwks. Chỉ có MỘT provider sống — của server.mjs — nên phải gọi vào đó.
  //
  // HAI THỨ ĐÃ SỬA Ở ĐÂY (31/07/2026):
  //
  //  1. ĐÍCH GỌI. Trước đây là `${HUB_URL}/internal/...`. HUB_URL lúc chạy thật là tên
  //     miền công khai đi qua tunnel của bên thứ ba, nên mỗi lượt đăng xuất là một lần
  //     request rời khỏi máy, ra internet rồi vòng lại — mang theo header bí mật qua hạ
  //     tầng của người khác. Nay luôn là loopback của chính máy này (127.0.0.1:$PORT).
  //     Đổi này cũng là điều kiện để phía nhận chặn được mọi lời gọi không phải loopback.
  //
  //  2. KHOÁ GỬI ĐI. Trước đây là `AUTH_SESSION_SECRET` — chính khoá HS256 ký cookie
  //     `hub_session`. Ai đọc được header đó ký được phiên cho BẤT KỲ ai với BẤT KỲ vai
  //     nào. Nay là `INTERNAL_RPC_SECRET`, một khoá chỉ dùng cho đúng việc này, và không
  //     còn giá trị mặc định nằm sẵn trong repo.
  //
  // Không còn `.catch(() => {})`: thất bại được GHI LOG và báo về client qua
  // `remoteLogout`, vì "im lặng" ở đây từng là cách back-channel logout tắt hẳn mà
  // không ai biết.
  let remoteLogout: "ok" | "failed" | "skipped" = "skipped";
  let userId: string | null = null;

  const token = cookies().get(SESSION_COOKIE.name)?.value;
  if (token) {
    const claims = await verifySessionToken(token);
    if (claims) {
      const identity = await resolveIdentity(claims.sub);
      if (identity) {
        userId = identity.userId;
        try {
          const res = await fetch(`${internalRpcOrigin()}${INTERNAL_BACKCHANNEL_LOGOUT_PATH}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-internal-secret": internalRpcSecret(),
            },
            body: JSON.stringify({ userId: identity.userId }),
            signal: AbortSignal.timeout(INTERNAL_CALL_TIMEOUT_MS),
          });
          remoteLogout = res.ok ? "ok" : "failed";
          if (!res.ok) {
            log("error", "logout.backchannel_failed", {
              userId: identity.userId,
              status: res.status,
              // 404 ở đây gần như luôn có đúng một nguyên nhân: server.mjs chưa được đổi
              // sang `handleInternalBackchannelLogout` nên vẫn so với AUTH_SESSION_SECRET.
              hint:
                res.status === 404 || res.status === 401
                  ? "server.mjs phải dùng handleInternalBackchannelLogout (apps/hub/server/oidc/internal-endpoint.ts) và INTERNAL_RPC_SECRET"
                  : undefined,
            });
          }
        } catch (err) {
          remoteLogout = "failed";
          log("error", "logout.backchannel_error", { userId: identity.userId, ...describeError(err) });
        }
      }
    }
  }

  // Dù báo RP thành công hay không, phiên Hub LUÔN bị xoá: người bấm đăng xuất phải
  // được đăng xuất khỏi máy trước mặt họ. `remoteLogout` chỉ để phía giao diện biết có
  // cần nhắc "hãy đóng cả các ứng dụng liên kết" hay không.
  const res = NextResponse.json({ ok: true, remoteLogout });
  res.cookies.set(SESSION_COOKIE.name, "", { ...SESSION_COOKIE.options, maxAge: 0 });
  log("info", "logout.done", { userId, remoteLogout });
  return res;
}
