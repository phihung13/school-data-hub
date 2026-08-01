// apps/hub/app/api/auth/dev-gate/route.ts — cửa trước của đăng nhập tạm (nợ #19).
//
// Đọc `packages/core/auth-adapter/dev-gate.ts` trước: toàn bộ lý do và bốn lời hứa
// nằm ở đó. Route này chỉ làm phần dính tới HTTP — đọc cookie/header, đếm số lần thử
// theo IP, đặt cookie.
//
// GET  — màn đăng nhập hỏi "cửa đang ở trạng thái nào" để vẽ đúng thứ cần vẽ.
//        404 = cửa không tồn tại (production) · 503 = chưa cấu hình · 200 = locked/open.
// POST — nhập mã một lần. Đúng thì nhận cookie 30 ngày.
//
// KHÔNG có nhánh "đến từ localhost thì cho qua". Lý do đo được, không phải phỏng đoán:
// đường hầm Cloudflare trỏ hub.truongvietanh.com -> http://localhost:3000, nên request
// từ Internet tới Node cũng mang địa chỉ nguồn 127.0.0.1. Một phép kiểm loopback ở đây
// xanh cho cả thế giới.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  DEV_GATE_ATTEMPTS_PER_MINUTE,
  DEV_GATE_COOKIE_NAME,
  DEV_GATE_HEADER,
  DEV_GATE_TTL_SECONDS,
  DEV_SECRET_MIN_LENGTH,
  evaluateDevGate,
  issueDevGateToken,
  readDevLoginSecret,
  verifyDevSecret,
} from "@hub/core/auth-adapter";
import { checkRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

const Body = z.object({ secret: z.string().min(1).max(256) });

/** Câu nói với người vận hành khi máy chủ chưa được cấu hình. Không bao giờ in ra mã. */
const NOT_CONFIGURED =
  `Cửa đăng nhập thử đang đóng: máy chủ chưa đặt DEV_LOGIN_SECRET (ít nhất ${DEV_SECRET_MIN_LENGTH} ký tự) ` +
  "trong apps/hub/.env.local. Đóng là mặc định đúng — xem tools/start-local.sh.";

/** MỘT thông điệp cho mọi kiểu sai, cùng lý do với /api/auth/invite: đừng dạy người dò. */
const DENY = "Mã mở khoá không đúng.";

/**
 * IP thật sau đường hầm: chặng đầu của `x-forwarded-for` (cloudflared đặt header này).
 * Không đọc được thì gom vào một xô chung — thà siết nhầm còn hơn để giấu IP là thoát.
 * Đây CHỈ dùng để đếm số lần thử, KHÔNG dùng để cấp quyền (xem ghi chú đầu file).
 */
function clientIp(req: NextRequest): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "loopback";
}

function credentialsOf(req: NextRequest) {
  return {
    cookie: req.cookies.get(DEV_GATE_COOKIE_NAME)?.value ?? null,
    header: req.headers.get(DEV_GATE_HEADER),
  };
}

/**
 * Cookie chỉ gắn cờ `secure` khi request thật sự đi bằng https.
 *
 * Vì sao không bật cứng: chủ đầu tư vào bằng https qua đường hầm (phải có `secure`),
 * còn dev và `tools/start-local.sh` vào bằng http://localhost:3000 — ở đó một cookie
 * `Secure` được đặt xong rồi KHÔNG BAO GIỜ được gửi lại, tức là nhập mã đúng mà vẫn
 * đứng nguyên tại chỗ, không một thông báo lỗi nào. Đúng kiểu hỏng im lặng.
 */
function isHttps(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return proto ? proto === "https" : req.nextUrl.protocol === "https:";
}

export async function GET(req: NextRequest) {
  const state = evaluateDevGate(credentialsOf(req));
  if (state === "absent") {
    // 404 chứ không phải 403: ở production route này KHÔNG TỒN TẠI, và câu trả lời
    // không được tiết lộ rằng nó từng tồn tại.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (state === "misconfigured") {
    return NextResponse.json({ state, error: NOT_CONFIGURED }, { status: 503 });
  }
  return NextResponse.json({ state });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const state = evaluateDevGate(credentialsOf(req));

  if (state === "absent") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (state === "misconfigured") {
    log("error", "dev_gate.not_configured", { ip });
    return NextResponse.json({ state, error: NOT_CONFIGURED }, { status: 503 });
  }
  if (state === "open") return NextResponse.json({ state: "open" });

  // Đếm TRƯỚC khi đọc thân request: một vòng lặp bắn 10.000 lượt/phút không được phép
  // bắt máy chủ băm 10.000 chuỗi. Cùng thứ tự với /api/auth/invite.
  const verdict = checkRateLimit(`dev-gate:${ip}`, DEV_GATE_ATTEMPTS_PER_MINUTE);
  if (!verdict.allowed) {
    log("warn", "dev_gate.rate_limited", { ip });
    const res = NextResponse.json({ state: "locked", error: DENY }, { status: 429 });
    res.headers.set("retry-after", String(verdict.retryAfterSeconds));
    return res;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  // `readDevLoginSecret` không thể trả null ở đây (state đã loại nhánh đó), nhưng
  // TypeScript không biết — và một `!` ở chỗ canh cửa là chỗ tệ nhất để đặt dấu `!`.
  const secret = readDevLoginSecret();
  if (!parsed.success || !secret || !verifyDevSecret(parsed.data.secret, secret)) {
    log("warn", "dev_gate.wrong_secret", { ip });
    return NextResponse.json({ state: "locked", error: DENY }, { status: 401 });
  }

  log("info", "dev_gate.unlocked", { ip });
  const res = NextResponse.json({ state: "open" });
  res.cookies.set(DEV_GATE_COOKIE_NAME, issueDevGateToken(secret), {
    maxAge: DEV_GATE_TTL_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
  });
  return res;
}
