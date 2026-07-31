// apps/hub/server/oidc/secrets.ts — MỘT khoá cho MỘT việc.
//
// LỖI ĐƯỢC VÁ Ở ĐÂY (phát hiện 31/07/2026, đọc code):
// `AUTH_SESSION_SECRET` là khoá HS256 ký cookie `hub_session` — cầm nó là ký được
// phiên cho BẤT KỲ ai với BẤT KỲ vai nào. Trước bản vá này nó còn làm hai việc nữa:
//   1. `apps/hub/app/api/auth/logout/route.ts:25` gửi CHÍNH nó qua header
//      `x-internal-secret` tới `${HUB_URL}/internal/oidc/backchannel-logout`.
//      HUB_URL lúc chạy thật là tên miền công khai (đi qua tunnel của bên thứ ba),
//      nên mỗi lượt đăng xuất là một lần khoá ký phiên rời khỏi tiến trình, ra
//      internet, nằm trong log của bất kỳ proxy nào trên đường.
//   2. `provider.ts:131` dùng nó làm khoá ký cookie của oidc-provider.
// Cả ba chỗ đều có fallback hằng số nằm sẵn trong repo ("dev-only-secret-do-not-use-in-prod"),
// nên quên đặt biến môi trường thì máy chủ vẫn khởi động bình thường với một khoá
// ai đọc GitHub cũng có.
//
// LUẬT MỚI:
//   - `AUTH_SESSION_SECRET`  → CHỈ ký phiên Hub (packages/core/auth-adapter). Không đi ra mạng.
//   - `INTERNAL_RPC_SECRET`  → chỉ để gọi nội bộ trong cùng máy (loopback).
//   - `OIDC_COOKIE_KEYS`     → chỉ để oidc-provider ký cookie của nó.
// Ở production thiếu biến nào thì NÉM LỖI, không có fallback. Vì `buildProvider()`
// được `server.mjs` gọi ngay lúc khởi động, lỗi đó làm tiến trình từ chối lên —
// đúng yêu cầu "thiếu INTERNAL_RPC_SECRET thì server không khởi động được".
//
// Ở dev (NODE_ENV != production) không ép người viết code phải sinh ba secret mới:
// suy ra bằng SHA-256 từ `AUTH_SESSION_SECRET` kèm nhãn. Suy một chiều nên giá trị
// đi ra mạng KHÔNG còn dùng để ký phiên được nữa — vẫn tách được đúng thứ cần tách,
// mà không thêm bước cấu hình. Không phải hằng số trong repo, và có cảnh báo to.

import { createHash, timingSafeEqual } from "node:crypto";

/** Độ dài tối thiểu của mọi secret nhận từ môi trường. */
export const MIN_SECRET_LENGTH = 32;

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Nhắc một lần cho mỗi nhãn — không spam log mỗi request. */
const warnedLabels = new Set<string>();

function warnOnce(label: string, message: string): void {
  if (warnedLabels.has(label)) return;
  warnedLabels.add(label);
  console.warn(message);
}

/**
 * Suy secret dev từ `AUTH_SESSION_SECRET` + nhãn. Một chiều (SHA-256): giá trị suy ra
 * KHÔNG cho phép dựng ngược lại khoá ký phiên, nên kể cả khi nó lọt ra ngoài thì hậu
 * quả dừng ở đúng phạm vi của nhãn đó.
 */
function deriveDevSecret(label: string): string {
  const base = process.env.AUTH_SESSION_SECRET;
  if (!base || base.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Thiếu ${label}, và cũng không suy được từ AUTH_SESSION_SECRET (chưa đặt hoặc ngắn hơn ${MIN_SECRET_LENGTH} ký tự). ` +
        `Xem apps/hub/.env.example.`,
    );
  }
  return createHash("sha256").update(`school-data-hub/dev-derived/${label}/${base}`).digest("hex");
}

/**
 * Đọc một secret bắt buộc. Production: thiếu/ngắn là ném lỗi (fail closed).
 * Dev: suy từ AUTH_SESSION_SECRET và cảnh báo.
 */
export function requireSecret(envName: string): string {
  const value = process.env[envName];
  if (value && value.length >= MIN_SECRET_LENGTH) return value;

  if (isProduction()) {
    throw new Error(
      `${envName} thiếu hoặc ngắn hơn ${MIN_SECRET_LENGTH} ký tự. ` +
        `Ở production KHÔNG có giá trị mặc định cho khoá bí mật — máy chủ từ chối khởi động. ` +
        `Sinh khoá: openssl rand -hex 32`,
    );
  }

  warnOnce(
    envName,
    `[secrets] ${envName} chưa đặt — DEV đang suy tạm từ AUTH_SESSION_SECRET. ` +
      `Trước khi lên production BẮT BUỘC đặt biến này (openssl rand -hex 32).`,
  );
  return deriveDevSecret(envName);
}

/** Khoá cho lời gọi nội bộ giữa route handler của Next và listener trong `server.mjs`. */
export function internalRpcSecret(): string {
  return requireSecret("INTERNAL_RPC_SECRET");
}

/**
 * Khoá ký cookie của oidc-provider. Nhiều khoá cách nhau bằng dấu phẩy để xoay khoá
 * không làm mất phiên đang mở: khoá ĐẦU dùng để ký, các khoá sau chỉ để đọc tiếp
 * cookie đã ký bằng khoá cũ.
 */
export function oidcCookieKeys(): string[] {
  const raw = process.env.OIDC_COOKIE_KEYS;
  if (raw) {
    const keys = raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const tooShort = keys.filter((k) => k.length < MIN_SECRET_LENGTH);
    if (keys.length === 0 || tooShort.length > 0) {
      throw new Error(
        `OIDC_COOKIE_KEYS sai định dạng: cần ít nhất một khoá ≥${MIN_SECRET_LENGTH} ký tự, ` +
          `nhiều khoá thì cách nhau bằng dấu phẩy (khoá đầu là khoá đang ký).`,
      );
    }
    return keys;
  }
  return [requireSecret("OIDC_COOKIE_KEYS")];
}

/**
 * Đích của lời gọi nội bộ: LUÔN là loopback của chính máy này, không bao giờ là
 * `HUB_URL`. Lý do: `HUB_URL` là tên miền công khai — gọi vào đó nghĩa là request
 * đi ra internet rồi vòng lại, mang theo secret qua hạ tầng của người khác, và sẽ
 * bị Cloudflare Access chặn ngay khi bật (DEBT #19) mà không ai biết.
 */
export function internalRpcOrigin(): string {
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}

/** So sánh không lộ thời gian; băm trước để hai chuỗi khác độ dài vẫn so được. */
export function secretEquals(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/**
 * Địa chỉ có phải chính máy này không. Node trả IPv4 dưới dạng IPv4-mapped IPv6
 * ("::ffff:127.0.0.1") khi socket là IPv6 dual-stack — bỏ sót dạng đó là chặn nhầm
 * lời gọi hợp lệ, nên phải xử đủ ba dạng.
 */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  const addr = address.trim().toLowerCase().replace(/^::ffff:/, "");
  if (addr === "::1") return true;
  if (addr === "localhost") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr);
}

export type InternalRequestVerdict =
  | { ok: true }
  | { ok: false; status: 404 | 401; reason: "not-loopback" | "bad-secret" };

/**
 * Cổng vào của mọi endpoint `/internal/*`. Dùng chung cho `server.mjs` để không
 * còn phải so chuỗi bằng tay ở đó.
 *
 * Hai lớp, theo đúng thứ tự:
 *  1. KHÔNG phải loopback → trả 404, không phải 401. 404 nói "không có gì ở đây";
 *     401 lại xác nhận với người quét rằng endpoint có thật và chỉ thiếu khoá.
 *  2. Sai khoá → 401, so sánh timing-safe.
 */
export function verifyInternalRequest(input: {
  remoteAddress: string | undefined | null;
  secretHeader: string | string[] | undefined;
}): InternalRequestVerdict {
  if (!isLoopbackAddress(input.remoteAddress)) {
    return { ok: false, status: 404, reason: "not-loopback" };
  }
  const given = Array.isArray(input.secretHeader) ? input.secretHeader[0] : input.secretHeader;
  if (!given || !secretEquals(given, internalRpcSecret())) {
    return { ok: false, status: 401, reason: "bad-secret" };
  }
  return { ok: true };
}

/** CHỈ dùng trong test — cho phép kiểm lại nhánh cảnh báo lần đầu. */
export function resetSecretWarningsForTest(): void {
  warnedLabels.clear();
}
