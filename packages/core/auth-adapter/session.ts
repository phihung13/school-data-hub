// packages/core/auth-adapter/session.ts
//
// CHỖ DUY NHẤT ngoài 0001_schemas_and_context.sql được phép biết hình dạng của
// "JWT có sub claim" (01-architecture.md §4). Domain service không tự ký/giải mã token.
//
// Thiết kế để đổi nhà cung cấp không đau: token ở đây luôn có claim `sub` = authUid,
// đúng cấu trúc mà `core.current_auth_uid()` (đọc `request.jwt.claim.sub`) mong đợi.
// Khi nối Supabase Auth thật, phần verify đổi sang xác minh JWT của Supabase (cùng
// dạng claim `sub`) — packages/core/db/client.ts và mọi router không phải đổi gì.

import { SignJWT, jwtVerify } from "jose";
import type { HubRole } from "../contracts/auth.ts";

const COOKIE_NAME = "hub_session";

/** ADR-016 / RULES Rev F điều 7: token sống ≤15 phút. KHÔNG nới con số này. */
export const SESSION_TTL_SECONDS = 15 * 60;

/**
 * Trần tuyệt đối của một phiên: gia hạn trượt (xem `shouldRenewSession`) chỉ được
 * kéo dài phiên TRONG khoảng này, hết là phải đăng nhập lại.
 *
 * Vì sao 12 giờ: bài toán thật là "cô giáo mở buồng lái lúc 7h, gõ ghi chú can thiệp
 * lúc 16h30 vẫn không bị đá ra". Một ngày làm việc của trường nằm gọn trong 12 giờ.
 * Không có trần này thì cứ mỗi 10 phút lại gia hạn một lần = phiên sống vĩnh viễn,
 * và một máy tính phòng máy dùng chung quên đăng xuất là mở cửa mãi mãi.
 */
export const SESSION_ABSOLUTE_TTL_SECONDS = 12 * 60 * 60;

/**
 * Còn dưới ngần này giây thì mới gia hạn. Đặt 5 phút (1/3 tuổi thọ token) để một
 * người dùng bình thường chỉ tốn 1 lượt gia hạn mỗi ~10 phút, không phải mỗi request.
 */
export const SESSION_RENEW_BEFORE_SECONDS = 5 * 60;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET thiếu hoặc quá ngắn (≥32 ký tự) — xem README.md mục Chạy local.",
    );
  }
  return new TextEncoder().encode(secret);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Phần danh tính — thứ mà route handler đăng nhập biết và truyền vào để mint token. */
export interface SessionIdentity {
  sub: string; // authUid — khớp core.users.auth_uid
  roles: HubRole[];
  displayName: string;
  /**
   * Email hiển thị trên sidebar. Nằm trong token để 7 trang server component không
   * phải gọi `resolveIdentity()` (1 kết nối + begin/commit + truy vấn) chỉ để lấy
   * đúng chuỗi này trước khi render — đó là độ trễ cộng thẳng vào TTFB của mọi trang.
   *
   * Token chỉ sống 15 phút (ADR-016) nên độ trễ đồng bộ khi ai đó đổi email tối đa
   * là một lần gia hạn phiên. KHÔNG đưa thêm gì vào đây: token nằm trong cookie của
   * trình duyệt, mỗi trường thêm vào là một trường rò ra ngoài. Vai và tên hiển thị
   * đã ở đó vì màn hình nào cũng cần; email là trường hợp cuối cùng đủ tiêu chuẩn.
   *
   * Không bắt buộc: token mint trước 31/07/2026 không có claim này, và mã mời phụ
   * huynh có thể chưa gắn email.
   */
  email?: string | null;
}

/** Kết quả verify: danh tính + hai mốc thời gian mà lớp gia hạn cần biết. */
export interface SessionClaims extends SessionIdentity {
  /** epoch giây — hạn của CHÍNH token này (claim `exp`). */
  expiresAt: number;
  /** epoch giây — trần tuyệt đối của phiên (claim `abs`), gia hạn không vượt qua được. */
  absoluteExpiresAt: number;
}

export interface CreateSessionInput extends SessionIdentity {
  /**
   * Giữ nguyên trần tuyệt đối của phiên cũ khi gia hạn trượt. Bỏ trống = phiên MỚI
   * (đăng nhập lần đầu) → trần tính từ bây giờ.
   */
  absoluteExpiresAt?: number;
}

export async function createSessionToken(claims: CreateSessionInput): Promise<string> {
  const now = nowSeconds();
  const absoluteExpiresAt = claims.absoluteExpiresAt ?? now + SESSION_ABSOLUTE_TTL_SECONDS;
  // Token không bao giờ sống lâu hơn trần tuyệt đối — nếu không, 5 phút cuối phiên
  // sẽ mint ra một token còn hạn 15 phút vượt qua trần, tức trần chỉ là trang trí.
  const expiresAt = Math.min(now + SESSION_TTL_SECONDS, absoluteExpiresAt);

  return new SignJWT({
    roles: claims.roles,
    displayName: claims.displayName,
    email: claims.email ?? null,
    abs: absoluteExpiresAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || typeof payload.exp !== "number") return null;

    // Token cũ (mint trước 31/07/2026) không có claim `abs`. Không coi là vô hạn:
    // suy trần từ thời điểm phát hành, để không tồn tại loại token nào gia hạn được mãi.
    const issuedAt = typeof payload.iat === "number" ? payload.iat : nowSeconds();
    const absoluteExpiresAt =
      typeof payload.abs === "number" ? payload.abs : issuedAt + SESSION_ABSOLUTE_TTL_SECONDS;
    if (absoluteExpiresAt <= nowSeconds()) return null;

    return {
      sub: payload.sub,
      roles: (payload.roles as HubRole[] | undefined) ?? [],
      displayName: (payload.displayName as string | undefined) ?? "",
      // Token cũ không có claim này ⇒ null, và trang gọi phải chịu được null
      // (bỏ dòng email đi, không bịa chuỗi rỗng trông như email hợp lệ).
      email: (payload.email as string | undefined) ?? null,
      expiresAt: payload.exp,
      absoluteExpiresAt,
    };
  } catch {
    return null; // hết hạn/chữ ký sai -> coi như chưa đăng nhập, không throw ra UI
  }
}

/**
 * Đã đến lúc mint token mới chưa? Dùng ở /api/auth/refresh (và ở middleware qua
 * `peekSessionDeadlines`). Trả false khi phiên đã chạm trần tuyệt đối — lúc đó phải
 * đăng nhập lại, không gia hạn.
 */
export function shouldRenewSession(
  deadlines: { expiresAt: number; absoluteExpiresAt: number },
  now: number = nowSeconds(),
): boolean {
  if (deadlines.absoluteExpiresAt <= now) return false;
  return deadlines.expiresAt - now <= SESSION_RENEW_BEFORE_SECONDS;
}

/**
 * Đọc hai mốc thời gian trong token mà KHÔNG xác minh chữ ký.
 *
 * Chỉ dùng cho MỘT việc: Next.js middleware chạy trên Edge runtime, ở đó không có
 * `pg` (nên không import được index.ts của adapter) và biến môi trường bí mật bị
 * webpack nội suy lúc build — verify chữ ký ở đó vừa khó vừa dễ hỏng thầm lặng.
 * Middleware chỉ cần biết "token này SẮP hết hạn chưa" để quyết định có gọi
 * /api/auth/refresh hay không; mọi quyết định an ninh (chữ ký, trạng thái tài khoản,
 * mint token mới) nằm ở route handler đó, chạy Node runtime và verify đầy đủ.
 *
 * Kẻ tấn công bịa một payload "sắp hết hạn" chỉ tự làm mình tốn một lượt gọi refresh
 * và nhận 401 — không có gì để lấy.
 */
export function peekSessionDeadlines(
  token: string,
): { expiresAt: number; absoluteExpiresAt: number } | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
      ),
    ) as { exp?: unknown; abs?: unknown; iat?: unknown };
    if (typeof json.exp !== "number") return null;
    const issuedAt = typeof json.iat === "number" ? json.iat : nowSeconds();
    return {
      expiresAt: json.exp,
      absoluteExpiresAt:
        typeof json.abs === "number" ? json.abs : issuedAt + SESSION_ABSOLUTE_TTL_SECONDS,
    };
  } catch {
    return null;
  }
}

/**
 * `name` dùng để đọc cookie (`cookies().get(SESSION_COOKIE.name)`); phần còn lại
 * là options chuẩn của Next.js (`res.cookies.set(name, value, SESSION_COOKIE.options)`).
 */
export const SESSION_COOKIE = {
  name: COOKIE_NAME,
  options: {
    maxAge: SESSION_TTL_SECONDS,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

/**
 * Options của cookie phiên cho MỘT request cụ thể.
 *
 * Vì sao không dùng thẳng `SESSION_COOKIE.options`: cờ `secure` ở đó suy từ `NODE_ENV`,
 * mà máy dev hôm nay phục vụ CẢ HAI đường — `http://localhost:3000` và
 * `https://hub.truongvietanh.com` qua đường hầm Cloudflare. Với `NODE_ENV=development`
 * thì cookie phiên đi qua đường hầm KHÔNG mang cờ `Secure`; đo được 02/08/2026 bằng
 * cách đọc cookie jar. Trình duyệt vì thế được phép gửi lại nó trên một request http
 * tới cùng tên miền — một cookie phiên của hệ dữ liệu trẻ em không việc gì phải đi trên
 * đường không mã hoá.
 *
 * Ngược lại, gắn cứng `secure: true` thì đăng nhập ở `http://localhost:3000` gãy IM
 * LẶNG: máy chủ trả 200 kèm Set-Cookie, trình duyệt lặng lẽ vứt cookie đi, người dùng
 * bấm xong vẫn đứng nguyên ở trang đăng nhập, không một dòng lỗi. Đúng cái bẫy mà cửa
 * `dev-gate` đã gặp và đã lường (xem dev-gate.ts).
 *
 * Nên hỏi CHÍNH REQUEST: đi https thì bật `Secure`, còn lại theo `NODE_ENV` như cũ.
 */
export function sessionCookieOptionsFor(requestUrl: string | URL | null | undefined) {
  let isHttps = false;
  try {
    if (requestUrl) isHttps = new URL(String(requestUrl)).protocol === "https:";
  } catch {
    isHttps = false;
  }
  return { ...SESSION_COOKIE.options, secure: SESSION_COOKIE.options.secure || isHttps };
}
