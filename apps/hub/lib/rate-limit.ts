// apps/hub/lib/rate-limit.ts — token bucket trong bộ nhớ tiến trình.
//
// Luật gốc: `03-api.md` luật endpoint 5 — 60 req/phút mặc định, `checkin` 10 req/phút,
// Embed API 30 req/phút/app. Trước file này, Hub KHÔNG có giới hạn tốc độ ở bất kỳ đâu:
// một vòng lặp trong tab trình duyệt của một em học sinh đủ để kéo sập buồng lái của
// cả trường, và cửa mã mời 6 ký tự (/api/auth/invite) là bãi thử brute-force miễn phí.
//
// VÌ SAO ĐẾM TRONG BỘ NHỚ TIẾN TRÌNH, KHÔNG DÙNG REDIS:
// Hub là modular monolith chạy MỘT deployable (01-architecture.md §7) — mọi request đi
// qua đúng một tiến trình Node, nên bộ đếm trong RAM là bộ đếm toàn hệ. Thêm Redis lúc
// này là thêm một dịch vụ phải vận hành cho hai dev, đổi lại không thêm độ đúng nào.
// ĐIỀU KIỆN PHẢI TRẢ MÓN NỢ NÀY: ngày Hub chạy >1 instance (rolling deploy, autoscale)
// thì mỗi instance đếm riêng, hạn mức thật nhân lên theo số instance — lúc đó bắt buộc
// chuyển sang bộ đếm chung. Đã đề nghị ghi vào danh-cho-may/DEBT.md (file ngoài phạm vi
// gói việc này).
//
// Thuật toán: token bucket. Bình chứa `limit` token, tự đầy lại đều trong 60 giây.
// Chọn token bucket thay vì cửa sổ cố định vì nó cho phép một cụm request ngắn (mở
// buồng lái = ~13 truy vấn cùng lúc) mà vẫn chặn được dòng đều đặn vượt hạn mức.

const WINDOW_MS = 60_000;

/** Trên ngần này khoá thì dọn các bình đã đầy lại (người dùng đã đi). ~5k user × vài path. */
const MAX_TRACKED_KEYS = 20_000;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitDecision {
  allowed: boolean;
  /** Số token còn lại (làm tròn xuống) — hữu ích khi muốn trả header X-RateLimit-Remaining. */
  remaining: number;
  /** Số giây người gọi nên chờ trước khi thử lại. 0 khi được phép. */
  retryAfterSeconds: number;
  limit: number;
}

/**
 * Dọn rác: xoá mọi bình đã hồi đầy (tức chủ nhân của nó đã ngừng gọi ít nhất một cửa
 * sổ). Không dùng timer nền — hàm chạy ngay trong luồng request, chỉ khi Map phình to,
 * để không giữ tiến trình sống chỉ vì một setInterval.
 */
function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt >= WINDOW_MS) buckets.delete(key);
  }
}

/**
 * Tiêu một token của `key`. `limitPerMinute` là sức chứa bình VÀ tốc độ hồi.
 * `now` tách ra thành tham số để test bơm thời gian giả mà không cần fake timer.
 */
export function checkRateLimit(
  key: string,
  limitPerMinute: number,
  now: number = Date.now(),
): RateLimitDecision {
  if (buckets.size >= MAX_TRACKED_KEYS) prune(now);

  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { tokens: limitPerMinute - 1, updatedAt: now });
    return { allowed: true, remaining: limitPerMinute - 1, retryAfterSeconds: 0, limit: limitPerMinute };
  }

  const refilled = Math.min(
    limitPerMinute,
    bucket.tokens + ((now - bucket.updatedAt) / WINDOW_MS) * limitPerMinute,
  );
  bucket.updatedAt = now;

  if (refilled < 1) {
    bucket.tokens = refilled;
    // Thời gian để bình có lại đúng 1 token.
    const msToOneToken = (1 - refilled) * (WINDOW_MS / limitPerMinute);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(msToOneToken / 1000)),
      limit: limitPerMinute,
    };
  }

  bucket.tokens = refilled - 1;
  return {
    allowed: true,
    remaining: Math.floor(bucket.tokens),
    retryAfterSeconds: 0,
    limit: limitPerMinute,
  };
}

/**
 * Helper cho Route Handler (không đi qua tRPC): `/api/auth/invite`, `/api/embed/webhook`…
 *
 *   const inviteLimit = rateLimit((req: Request) => `invite:${clientIp(req)}`, 10);
 *   const verdict = inviteLimit(req);
 *   if (!verdict.allowed) return new Response(..., { status: 429 });
 */
export function rateLimit<T>(
  keyFn: (arg: T) => string,
  limitPerMinute: number,
): (arg: T, now?: number) => RateLimitDecision {
  return (arg, now) => checkRateLimit(keyFn(arg), limitPerMinute, now);
}

/** Hạn mức theo `03-api.md` luật endpoint 5. Không viết số này rải rác nơi khác. */
export const RATE_LIMITS = {
  /** Mặc định cho mọi procedure tRPC. */
  default: 60,
  /**
   * Đường GHI check-in. Chỉ áp cho mutation: đọc trạng thái hôm nay/tổng quan điểm danh
   * là truy vấn màn hình bình thường (một lần mở trang có thể gọi vài cái), còn thứ cần
   * chặn là dòng GHI lặp lại — đúng mục tiêu chống gian lận điểm danh của ADR-007.
   */
  checkinMutation: 10,
  /** Embed API của app ngoài: 30 req/phút/app (08-embedded-apps.md mục 4). */
  embedApp: 30,
  /** Cửa mã mời phụ huynh — brute-force 6 ký tự. Siết theo IP, không theo người dùng. */
  inviteCode: 10,
  /** Gia hạn phiên trượt: bình thường ~6 lượt/giờ/người, 20 là đã rất rộng tay. */
  sessionRefresh: 20,
} as const;

/** Hạn mức cho một lời gọi tRPC cụ thể. Tách ra để `server/trpc.ts` không chứa số. */
export function limitForTrpcCall(path: string, type: "query" | "mutation" | "subscription"): number {
  if (type === "mutation" && path.startsWith("checkin.")) return RATE_LIMITS.checkinMutation;
  return RATE_LIMITS.default;
}

/** CHỈ dùng trong test — xoá sạch bộ đếm giữa hai ca kiểm thử. */
export function resetRateLimits(): void {
  buckets.clear();
}
