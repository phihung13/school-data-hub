// apps/hub/server/oidc/invite-guard.ts — khoá brute-force cho mã mời phụ huynh.
//
// VÌ SAO FILE NÀY NẰM Ở `server/oidc/`: mã mời không liên quan gì tới OIDC. Nó ở đây vì
// gói việc "oidc-dang-xuat" chỉ sở hữu thư mục này ở phía server, và logic dưới đây PHẢI
// tách khỏi route handler thì mới test được bằng test thuần (route handler kéo theo
// `next/server`). Chỗ đúng của nó là `apps/hub/server/auth/` — đã ghi vào canPhoiHop để
// người sở hữu thư mục đó dời sang, chỉ là đổi đường dẫn import.
//
// LỖI ĐƯỢC VÁ (phát hiện 31/07/2026): mã mời 6 ký tự là một tấm vé mang danh, và trước
// bản vá KHÔNG có gì đếm số lần thử — không ở route (`/api/auth/invite`), không ở hàm SQL
// (`0013:34-81`). Không gian mã là 36^6 ≈ 2,2 tỷ, nghe thì to, nhưng:
//   · Mỗi trường chỉ có vài nghìn mã sống cùng lúc, nên xác suất trúng mỗi lần thử là
//     vài nghìn / 2,2 tỷ. Với một máy bắn 100 request/giây, kỳ vọng trúng tính bằng NGÀY,
//     không phải bằng thế kỷ. Và mỗi lần trúng là một phiên phụ huynh xem được dữ liệu
//     của con NGƯỜI KHÁC.
//   · `06-resilience-security.md:67` đã ghi "khóa tạm sau N lần sai" là yêu cầu, chưa làm.
//
// HAI LỚP, ĐÁNH VÀO HAI THỨ KHÁC NHAU:
//   Lớp 1 (theo IP, dùng `RATE_LIMITS.inviteCode` sẵn có) — chặn MỘT máy quét nhiều mã.
//   Lớp 2 (theo mã, file này)                            — chặn NHIỀU máy cùng dò MỘT mã.
// Thiếu lớp 2 thì một botnet chia mã ra bắn, mỗi IP vài lần, không IP nào chạm hạn mức.
//
// GIỚI HẠN CÓ CHỦ Ý: bộ đếm nằm trong RAM tiến trình nên khởi động lại là quên. Khoá
// VĨNH VIỄN một mã cần cột `revoked_at`/`failed_attempts` trong `core.parent_invite_codes`
// — migration nằm ngoài phạm vi gói việc này (xem canPhoiHop). Trong RAM đã đủ đổi bài
// toán từ "dò tự do" thành "dò với trần 3 lần mỗi 15 phút", và đó là phần chặn được ngay
// hôm nay mà không phải chờ migration.

import { createHash } from "node:crypto";

/** Sai quá ngần này lần thì mã bị treo. 3 lần: người gõ nhầm thật vẫn còn cửa. */
export const INVITE_CODE_MAX_FAILURES = 3;

/** Treo bao lâu. 15 phút đủ để một đợt dò tự nguội, đủ ngắn để phụ huynh gõ nhầm không mất buổi. */
export const INVITE_CODE_LOCK_MS = 15 * 60 * 1000;

/** Trên ngần này mã đang bị theo dõi thì dọn các bản ghi đã hết hạn treo. */
const MAX_TRACKED_CODES = 50_000;

interface FailureRecord {
  failures: number;
  /** Lần sai gần nhất — mốc để tính hết hạn treo. */
  lastFailureAt: number;
}

const failuresByCode = new Map<string, FailureRecord>();

/**
 * Chuẩn hoá mã người dùng nhập. Trả `null` nếu không thể là mã hợp lệ.
 *
 * Vì sao chặn ở đây chứ không để hàm SQL chặn: `core.redeem_parent_invite_code` gọi
 * `upper(p_code)` rồi mới tra, nên "abc123" và "ABC123" là CÙNG một mã. Nếu tầng trên
 * đếm theo chuỗi thô thì kẻ dò chỉ cần đổi hoa/thường là có thêm 63 lần thử miễn phí
 * cho mỗi mã. Chuẩn hoá trước khi đếm, không phải sau.
 *
 * `z.string().length(6)` cũ còn nhận cả "!!!!!!" và "      " — những chuỗi đó không bao
 * giờ khớp `^[A-Z0-9]{6}$` của bảng, nên tốt nhất là chặn trước khi chạm cơ sở dữ liệu.
 */
export function normalizeInviteCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

/**
 * Định danh mã trong log/audit. KHÔNG BAO GIỜ ghi mã trần vào `ops.audit_log`: mã đó là
 * tấm vé đăng nhập còn dùng được, và audit log có nhiều người đọc hơn bảng mã mời nhiều.
 * 8 ký tự đầu của SHA-256 đủ để đối chiếu "có phải cùng một mã bị dò không".
 */
export function inviteCodeFingerprint(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 8);
}

function prune(now: number): void {
  for (const [code, record] of failuresByCode) {
    if (now - record.lastFailureAt >= INVITE_CODE_LOCK_MS) failuresByCode.delete(code);
  }
}

export interface InviteCodeVerdict {
  locked: boolean;
  failures: number;
  retryAfterSeconds: number;
}

/** Mã này còn được thử không? Gọi TRƯỚC khi chạm cơ sở dữ liệu. */
export function checkInviteCode(code: string, now: number = Date.now()): InviteCodeVerdict {
  const record = failuresByCode.get(code);
  if (!record) return { locked: false, failures: 0, retryAfterSeconds: 0 };

  const elapsed = now - record.lastFailureAt;
  if (elapsed >= INVITE_CODE_LOCK_MS) {
    // Hết hạn treo — xoá luôn để lần sau không phải tính lại.
    failuresByCode.delete(code);
    return { locked: false, failures: 0, retryAfterSeconds: 0 };
  }

  if (record.failures < INVITE_CODE_MAX_FAILURES) {
    return { locked: false, failures: record.failures, retryAfterSeconds: 0 };
  }

  return {
    locked: true,
    failures: record.failures,
    retryAfterSeconds: Math.max(1, Math.ceil((INVITE_CODE_LOCK_MS - elapsed) / 1000)),
  };
}

/**
 * Ghi một lần thử SAI. Trả về số lần sai tích luỹ.
 *
 * Đồng hồ treo tính từ lần sai GẦN NHẤT, không phải lần sai đầu: kẻ dò bắn liên tục thì
 * cửa không bao giờ mở lại, còn phụ huynh gõ nhầm rồi đi pha ấm trà thì 15 phút sau vào
 * được. Đúng hai hành vi cần phân biệt.
 */
export function recordInviteFailure(code: string, now: number = Date.now()): number {
  if (failuresByCode.size >= MAX_TRACKED_CODES) prune(now);

  const record = failuresByCode.get(code);
  if (!record || now - record.lastFailureAt >= INVITE_CODE_LOCK_MS) {
    failuresByCode.set(code, { failures: 1, lastFailureAt: now });
    return 1;
  }
  record.failures += 1;
  record.lastFailureAt = now;
  return record.failures;
}

/**
 * Xoá bộ đếm sau một lần đổi mã THÀNH CÔNG.
 *
 * Cần thiết vì §9: cùng một mã đổi lần hai vẫn phải trả đúng người cũ (retry mạng, phụ
 * huynh bấm hai lần). Nếu lần sai trước đó còn treo trong bộ đếm thì đúng người có mã
 * thật lại bị chặn ở lần bấm thứ hai.
 */
export function clearInviteFailures(code: string): void {
  failuresByCode.delete(code);
}

/** CHỈ dùng trong test — xoá sạch bộ đếm giữa hai ca kiểm thử. */
export function resetInviteGuardForTest(): void {
  failuresByCode.clear();
}
