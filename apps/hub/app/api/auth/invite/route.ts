// apps/hub/app/api/auth/invite/route.ts — đăng nhập phụ huynh bằng mã mời (M2).
//
// LỖI ĐƯỢC VÁ Ở ĐÂY (phát hiện 31/07/2026): cửa này nhận một mã 6 ký tự rồi trả THẲNG
// một phiên phụ huynh, không đếm số lần thử, không delay, không log lần sai nào. Hàm SQL
// phía dưới (`0013:34-81`) cũng không đếm. Nghĩa là toàn hệ thống không có một chỗ nào
// biết được rằng có người đang dò mã — kể cả sau khi họ dò trúng.
//
// Ba lớp thêm vào, theo đúng thứ tự rẻ-trước-đắt-sau (chưa chạm DB thì chưa tốn gì):
//   1. Hạn mức theo IP  — chặn một máy quét nhiều mã (`RATE_LIMITS.inviteCode`).
//   2. Treo theo mã     — chặn nhiều máy cùng dò một mã (invite-guard.ts).
//   3. Ghi `ops.audit_log` mọi lần sai — để lần sau có người đọc được "đêm qua có ai dò".
//
// Xem `apps/hub/server/oidc/invite-guard.ts` để biết vì sao cần cả lớp 1 lẫn lớp 2.
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { redeemInviteCode, resolveIdentity, createSessionToken, SESSION_COOKIE } from "@hub/core/auth-adapter";
import { withSystemContext } from "@hub/core/db";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  checkInviteCode,
  clearInviteFailures,
  inviteCodeFingerprint,
  normalizeInviteCode,
  recordInviteFailure,
} from "@/server/oidc/invite-guard";
import { describeError, log } from "@/lib/logger";

// Nhận rộng ở tầng schema (chỉ chặn thân request rác), rồi chuẩn hoá + kiểm chặt bằng
// `normalizeInviteCode`. Tách hai bước vì phải ĐẾM theo mã đã chuẩn hoá — xem invite-guard.
const Body = z.object({ code: z.string().min(1).max(64) });

/** Một thông điệp duy nhất cho mọi kiểu thất bại — xem ghi chú ở `deny()`. */
const DENY_MESSAGE = "Mã mời không hợp lệ hoặc đã hết hạn";

/**
 * Lấy IP thật sau proxy (cloudflared/Nginx, ADR-018): chặng ĐẦU của `x-forwarded-for`.
 * Không đọc được thì gom hết vào một xô `unknown` — thà siết nhầm người dùng chung xô
 * còn hơn để một kẻ dò giấu IP là thoát hạn mức.
 */
function clientIp(): string {
  const h = headers();
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || h.get("x-real-ip") || "unknown";
}

/**
 * Ghi lại một lần đổi mã thất bại. Không `await` ở đường trả về: audit chậm không được
 * làm chậm phản hồi, nhưng lỗi audit thì phải hiện ra log chứ không nuốt im lặng.
 *
 * KHÔNG ghi mã trần — chỉ vân tay 8 ký tự (invite-guard.ts giải thích vì sao).
 */
function auditFailure(reason: string, fingerprint: string | null, ip: string): void {
  void withSystemContext((client) =>
    client.query(
      `insert into ops.audit_log (actor_id, action, object_type, object_id, scope, result)
       values (null, 'parent_invite_redeem_failed', 'parent_invite_code', $1, $2, 'denied')`,
      [fingerprint, JSON.stringify({ reason, ip })],
    ),
  ).catch((err) => log("error", "invite.audit_write_failed", { reason, ...describeError(err) }));
}

/**
 * MỘT thông điệp cho mọi kiểu thất bại (mã sai, hết hạn, đang bị treo, sai định dạng).
 * Phân biệt ra là tặng người dò đúng thứ họ cần: "mã này có tồn tại không". Riêng trường
 * hợp bị treo/quá hạn mức thì trả 429 kèm `Retry-After` — mã trạng thái đó nói về NGƯỜI
 * GỌI, không tiết lộ gì về mã.
 */
function deny(status: 400 | 429, retryAfterSeconds?: number): NextResponse {
  const res = NextResponse.json({ error: DENY_MESSAGE }, { status });
  if (retryAfterSeconds) res.headers.set("retry-after", String(retryAfterSeconds));
  return res;
}

export async function POST(req: Request) {
  const ip = clientIp();

  // Lớp 1 — theo IP. Đặt TRƯỚC cả việc đọc thân request: một vòng lặp bắn 10.000
  // request/phút không được phép ép máy chủ parse 10.000 lần JSON.
  const ipVerdict = checkRateLimit(`invite:${ip}`, RATE_LIMITS.inviteCode);
  if (!ipVerdict.allowed) {
    log("warn", "invite.rate_limited", { ip });
    // Ghi audit TỐI ĐA 1 dòng/phút/IP cho nhánh này. Nếu ghi mọi lần thì chính cái bẫy
    // chống dò lại trở thành đường khuếch đại: kẻ dò bắn càng nhiều, Hub càng ghi nhiều
    // vào `ops.audit_log` — họ hết mã để thử nhưng vẫn có một cách làm phình DB miễn phí.
    if (checkRateLimit(`invite-audit:${ip}`, 1).allowed) auditFailure("rate_limited_ip", null, ip);
    return deny(429, ipVerdict.retryAfterSeconds);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  const code = parsed.success ? normalizeInviteCode(parsed.data.code) : null;
  if (!code) {
    auditFailure("malformed_code", null, ip);
    return deny(400);
  }

  const fingerprint = inviteCodeFingerprint(code);

  // Lớp 2 — theo mã. Kiểm trước khi chạm DB: mã đang bị treo thì không có lý do gì phải
  // mở một kết nối Postgres cho người dò.
  const codeVerdict = checkInviteCode(code);
  if (codeVerdict.locked) {
    log("warn", "invite.code_locked", { fingerprint, ip, failures: codeVerdict.failures });
    auditFailure("code_locked", fingerprint, ip);
    return deny(429, codeVerdict.retryAfterSeconds);
  }

  let authUid: string;
  try {
    authUid = await redeemInviteCode(code);
  } catch {
    const failures = recordInviteFailure(code);
    log("warn", "invite.redeem_failed", { fingerprint, ip, failures });
    auditFailure("invalid_or_expired", fingerprint, ip);
    return deny(400);
  }

  const identity = await resolveIdentity(authUid);
  if (!identity) {
    // Mã ĐÚNG nhưng không dựng được danh tính — lỗi phía mình, không phải lỗi người dùng:
    // không tính vào bộ đếm sai, và trả 500 để giám sát nhìn thấy.
    log("error", "invite.identity_missing", { fingerprint, ip });
    return NextResponse.json({ error: "Không dựng được phiên phụ huynh" }, { status: 500 });
  }

  // §9: mã đúng thì xoá sạch bộ đếm — lần bấm thứ hai (retry mạng, bấm đúp) phải qua được.
  clearInviteFailures(code);

  const token = await createSessionToken({
    sub: identity.authUid,
    roles: identity.roles,
    displayName: identity.displayName,
  });

  log("info", "invite.redeemed", { fingerprint, userId: identity.userId });

  const res = NextResponse.json({ ok: true, displayName: identity.displayName, roles: identity.roles });
  res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);
  return res;
}
