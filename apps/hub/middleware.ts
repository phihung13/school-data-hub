import { NextResponse, type NextRequest } from "next/server";
// Import THẲNG file session.ts, không qua "@hub/core/auth-adapter" như mọi nơi khác:
// index.ts của adapter kéo theo dev-provider → db/client → `pg`, mà Edge runtime của
// middleware không có `net`/`tls` để chạy `pg`. session.ts chỉ phụ thuộc `jose` + một
// kiểu TypeScript nên nạp vào Edge được. Đi bằng đường dẫn tương đối vì `exports` của
// package @hub/core chỉ công bố ba lối vào, không có lối vào con cho session.ts.
// Đây vẫn là "một chỗ duy nhất biết hình dạng token" — không sao chép logic ra đây.
import {
  SESSION_COOKIE,
  peekSessionDeadlines,
  shouldRenewSession,
  sessionCookieOptionsFor,
} from "../../packages/core/auth-adapter/session.ts";

// apps/hub/middleware.ts — hai việc, chạy trước mọi request:
//
//   1. CSP/Referrer-Policy cho route Embed Bridge (08-embedded-apps.md mục 3
//      "CSP & sandbox bắt buộc"). Chỉ chạm /embed/*.
//   2. Gia hạn phiên trượt: token 15 phút (ADR-016) mà không có đường mint lại thì
//      cô giáo gõ ghi chú 16 phút là mất trắng. Middleware KHÔNG tự gia hạn — nó chỉ
//      phát hiện "sắp hết hạn" rồi nhờ /api/auth/refresh (Node runtime) làm phần
//      nặng: verify chữ ký, hỏi core.users.status, mint token mới.

/** Không gia hạn ở những đường này. */
const RENEW_SKIP_PREFIXES = [
  "/api/auth/", // chính nơi mint token — gia hạn ở đây là đệ quy
  "/api/embed/", // webhook từ app ngoài, không mang cookie người dùng
  "/oidc/", // server.mjs xử lý trước Next, để yên
  "/internal/",
  "/login", // chưa có phiên thì không có gì để gia hạn
  "/embed/relay", // iframe ẩn chuyển tiếp mã OIDC — không chen thêm gì vào luồng đó
];

function shouldTryRenew(pathname: string): boolean {
  return !RENEW_SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/** Dựng lại header Cookie nhưng bỏ hub_session — dùng khi phiên vừa bị từ chối. */
function cookieHeaderWithoutSession(req: NextRequest): string {
  return req.cookies
    .getAll()
    .filter((c) => c.name !== SESSION_COOKIE.name)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * Gọi vào chính mình qua loopback thay vì qua tên miền công khai: ở production tên
 * miền đi qua tunnel Cloudflare, nên một lời gọi nội bộ sẽ vòng ra Internet rồi quay
 * lại (chậm, và sẽ bị Cloudflare Access chặn khi bọc Access theo DEBT #19).
 * `req.nextUrl.origin` chỉ dùng làm đường lui khi loopback không tới được.
 */
async function callRefresh(req: NextRequest): Promise<Response | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const candidates = [
    process.env.HUB_INTERNAL_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`,
    req.nextUrl.origin,
  ];
  for (const base of candidates) {
    try {
      return await fetch(new URL("/api/auth/refresh", base), {
        method: "POST",
        headers: { cookie },
        redirect: "manual",
      });
    } catch {
      // Thử đường kế tiếp. Hết đường thì trả null — request vẫn đi tiếp bình thường,
      // token cũ còn hạn vài phút, người dùng không thấy gì bất thường.
    }
  }
  return null;
}

/**
 * Origin của app nhúng — lấy qua `/api/embed/manifest`, KHÔNG đọc thẳng database.
 *
 * Middleware chạy trên Edge runtime: không `net`, không `tls`, nên không chạy được `pg`.
 * Nguồn sự thật là bảng `core.embedded_apps` (migration 0052), và đường duy nhất chạm
 * tới nó từ đây là một lời gọi HTTP vào chính Hub.
 *
 * ── FAIL-CLOSED, và vì sao đó là lựa chọn đúng chứ không phải lựa chọn an toàn ──
 * Không lấy được danh sách thì hàm này trả `null`, và chỗ gọi đặt `frame-src 'self'` —
 * tức app ngoài KHÔNG nạp được. Người dùng thấy màn chờ rồi thấy trạng thái "quá lâu"
 * của embed-intro.tsx.
 *
 * Đường kia (fail-open: bỏ hẳn header CSP khi không hỏi được) nghe có vẻ "nhẹ nhàng hơn
 * với người dùng", nhưng nó biến một sự cố database thành một lần gỡ bỏ allowlist trên
 * TOÀN BỘ route /embed/* — đúng lúc hệ đang hỏng là lúc hàng rào biến mất. Một app không
 * mở được thì có người kêu ngay; một allowlist bị gỡ thì không ai biết.
 *
 * Bộ đệm 10 giây, cùng con số với `registry-db.ts`. Module scope của Edge sống qua nhiều
 * request trong cùng một isolate nên đây là bộ đệm thật, không phải bộ đệm một lần.
 */
const MANIFEST_DEM_MS = 10_000;
let manifestDem: { luc: number; theo: Map<string, string> } | null = null;

async function originCuaApp(req: NextRequest, appId: string): Promise<string | null> {
  const now = Date.now();
  if (!manifestDem || now - manifestDem.luc >= MANIFEST_DEM_MS) {
    const candidates = [
      process.env.HUB_INTERNAL_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`,
      req.nextUrl.origin,
    ];
    let theo: Map<string, string> | null = null;
    for (const base of candidates) {
      try {
        const res = await fetch(new URL("/api/embed/manifest", base), { cache: "no-store" });
        if (!res.ok) continue;
        const body = (await res.json()) as { apps?: Array<{ appId: string; origin: string }> };
        if (!Array.isArray(body.apps)) continue;
        theo = new Map(body.apps.map((a) => [a.appId, a.origin]));
        break;
      } catch {
        // Thử đường kế tiếp.
      }
    }
    // KHÔNG ghi bộ đệm khi hỏi hỏng: ghi một Map rỗng vào đây là khoá cứng trạng thái
    // "không có app nào" suốt 10 giây kế tiếp, kể cả sau khi database đã sống lại.
    if (!theo) return null;
    manifestDem = { luc: now, theo };
  }
  return manifestDem.theo.get(appId) ?? null;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  let res = NextResponse.next();

  if (shouldTryRenew(pathname)) {
    const token = req.cookies.get(SESSION_COOKIE.name)?.value;
    // `peek` KHÔNG xác minh chữ ký — chỉ để quyết định có nhờ /api/auth/refresh hay
    // không. Mọi phán quyết an ninh nằm ở route handler đó (xem ghi chú trong session.ts).
    const deadlines = token ? peekSessionDeadlines(token) : null;

    if (deadlines && shouldRenewSession(deadlines)) {
      const refreshed = await callRefresh(req);

      if (refreshed?.ok) {
        // 200: có cookie mới → gắn vào response để trình duyệt nhận ngay trong chính
        // request này (kể cả khi đây là một lời gọi tRPC).
        const setCookies = refreshed.headers.getSetCookie?.() ?? [];
        for (const c of setCookies) res.headers.append("set-cookie", c);
      } else if (refreshed?.status === 401) {
        // Tài khoản đã bị khoá hoặc phiên chạm trần 12 giờ. Gỡ cookie khỏi request
        // ĐANG đi tiếp, để tRPC/Server Component phía sau nhìn thấy "chưa đăng nhập"
        // ngay lập tức thay vì đợi token cũ hết hạn nốt vài phút cuối.
        const headers = new Headers(req.headers);
        headers.set("cookie", cookieHeaderWithoutSession(req));
        res = NextResponse.next({ request: { headers } });
        res.cookies.set(SESSION_COOKIE.name, "", { ...sessionCookieOptionsFor(req.url), maxAge: 0 });
      }
      // 503/429/không gọi được: im lặng bỏ qua — token cũ vẫn còn hạn.
    }
  }

  const match = pathname.match(/^\/embed\/([^/]+)$/);
  const appId = match?.[1];
  if (!appId) return res;

  const origin = await originCuaApp(req, appId);
  res.headers.set("Referrer-Policy", "no-referrer");
  if (origin) {
    // frame-src allowlist đúng MỘT domain đã khai trong Manifest — không wildcard.
    // BẮT BUỘC thêm 'self': trang /embed/<app-id> còn tự dựng một iframe ẨN trỏ /oidc/auth
    // của chính Hub (embed-frame.tsx, bước lấy mã ngắn hạn) — thiếu 'self' thì CSP chặn luôn
    // iframe ẩn đó, embed:ready tới nhưng không bao giờ có embed:token trả lại (đã bắt lỗi
    // này thật ngày 29/07/2026: Factory xác nhận gửi đúng, Hub xác nhận nhận đúng, nhưng
    // không có gì xảy ra ở giữa — chính là CSP tự chặn chính mình).
    res.headers.set("Content-Security-Policy", `frame-src 'self' ${origin}`);
  } else {
    // Không biết origin (app tắt, app không tồn tại, hoặc chưa hỏi được sổ đăng ký):
    // KHÔNG khung ngoài nào được nạp. Trang /embed/<app> tự trả 404 cho hai ca đầu; ca
    // thứ ba hiện màn "quá lâu" của embed-intro.tsx. Cả ba đều ồn hơn một allowlist
    // biến mất trong im lặng.
    res.headers.set("Content-Security-Policy", "frame-src 'self'");
  }
  return res;
}

export const config = {
  // Mở ra toàn site (trước đây chỉ /embed/*) để lớp gia hạn phiên chạm được mọi trang
  // và cả /api/trpc. Loại trừ: tài nguyên tĩnh của Next, favicon, và mọi file có phần
  // mở rộng (ảnh, css, js trong /public) — những thứ đó không mang phiên và chạy
  // middleware chỉ tốn CPU.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|xml|json|webmanifest)$).*)",
  ],
};
