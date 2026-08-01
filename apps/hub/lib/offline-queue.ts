// apps/hub/lib/offline-queue.ts
// Hàng đợi check-in khi mất mạng (PWA offline-first, 05-capacity-ops.md + P2).
// "Offline vẫn lưu — tự gửi sau." — không hộp thoại, không mất thao tác của em.
//
// Sửa 31/07/2026 (gói "checkin-trang-thai") — MỘT NGÀY MỘT BẢN GHI, KỂ CẢ TRONG
// HÀNG ĐỢI:
//
// `enqueueCheckin` trước đây cấp `clientId` mới mỗi lần gọi, nên em bấm hai lần
// lúc mất mạng thì IndexedDB giữ HAI bản ghi cùng một ngày. Khi có mạng lại,
// `flushQueuedCheckins` gửi cả hai, và vì `submitMood` chạy `on conflict do update
// set mood`, bản tới sau đè lên bản tới trước — thứ tự `keys()` của idb-keyval
// quyết định tâm trạng nào của em được giữ. Đó là ghi đè im lặng do máy tự quyết,
// đúng loại lỗi §9 (idempotent) sinh ra để chặn.
//
// Nay hàng đợi giữ ĐÚNG MỘT bản ghi cho mỗi ngày địa phương: lần bấm sau ghi
// chồng lên bản cùng ngày và giữ nguyên `clientId` cũ (khoá idempotent), rồi TRẢ
// VỀ tâm trạng vừa bị thay để màn hình nói ra "đã đổi từ … sang …" thay vì im.
//
// ---------------------------------------------------------------------------
// Sửa 02/08/2026 (gói "hang-doi-offline-khong-tac", nợ #31) — HÀNG ĐỢI KHÔNG CÒN
// CHỖ CHO MỘT BẢN GHI NẰM LẠI MÃI MÃI.
//
// Ba chuyện đo được trong bản trước, xếp theo mức tệ:
//
//  1. Vòng lặp `break` ngay lỗi đầu tiên. Một bản ghi hỏng VĨNH VIỄN (401 hết
//     phiên, 400 ngày quá cũ bị `resolve_checkin` từ chối) khoá luôn mọi check-in
//     xếp sau — mãi mãi. Đã đổi sang `continue` hôm 31/07, nhưng đó mới là nửa
//     việc: bản ghi hỏng vẫn NẰM LẠI, và mỗi lần có mạng nó lại được gửi lại,
//     lại hỏng y hệt, không ai biết. Hàng đợi sạch dần là chuyện không bao giờ
//     xảy ra.
//  2. `submit()` xong là `dequeueCheckin` ngay, KHÔNG đọc `moodSaved`. Sau 0047
//     một lượt gửi có thể trả 2xx với `moodSaved=false` (nhà em chưa có phiếu
//     đồng ý): lượt điểm danh vào sổ, mức tâm trạng thì không. Hàng đợi đánh dấu
//     "đã gửi" cho một thứ không nằm trong kho — thành công giả, đúng con lỗi mà
//     `checkin.requestHelp` và màn /checkin đều đã phải sửa một lần rồi.
//  3. Luật phân loại lỗi có hai bản: màn hình dùng `shouldQueueOffline`, hàng đợi
//     thì không dùng gì cả (cứ lỗi là giữ). Hai bản luật cho cùng một câu hỏi thì
//     sớm muộn chúng trả lời khác nhau — và chỗ lệch nằm đúng trên đường dữ liệu
//     của một đứa trẻ đang cần giúp.
//
// Nay: MỘT luật (`shouldQueueOffline` ở ngay dưới, màn hình import lại từ đây),
// và mỗi bản ghi rời vòng lặp theo đúng một trong ba đường:
//   · gửi được, mức tâm trạng vào kho → rời hàng đợi, không nói gì thêm.
//   · lỗi tự khỏi khi có mạng (mạng/5xx/408/429) → Ở LẠI, thử lại lần sau.
//   · hỏng vĩnh viễn, HOẶC 2xx mà `moodSaved=false` → RỜI hàng đợi nhưng để lại
//     một DẤU VẾT em đọc được (`listFailedCheckins`). Không xoá im lặng (mất
//     thao tác của em), không giữ mãi (chặn bản ghi sau). Màn /checkin đọc dấu
//     vết đó và nói ra; em bấm "Đã hiểu" thì dấu vết mới mất.
"use client";

import { get, set, del, keys } from "idb-keyval";
import type { QueuedCheckinInput } from "@hub/core/contracts";
import { httpStatusOf, isNetworkError } from "@/components/ui/query-state";
import { toLocalIsoDate } from "./date";

const KEY_PREFIX = "hub:queued-checkin:";
/** Dấu vết "lần bấm này KHÔNG đi trọn vẹn" — xem khối `FailedCheckin` bên dưới. */
const FAILED_PREFIX = "hub:checkin-chua-gui:";

/**
 * Lỗi này có xứng đáng được giữ trong hàng đợi offline không?
 *
 * CHỈ khi nó có thể tự khỏi lúc có mạng lại: không có phản hồi nào từ máy chủ
 * (mạng/DNS/wifi cổng đăng nhập), hoặc máy chủ trả 5xx/408/429. Mọi lỗi 4xx khác
 * (401 hết phiên, 403 không đủ quyền, 400 sai dữ liệu) sẽ hỏng y hệt ở lần thử
 * sau, nên giữ lại chỉ là cách giấu mất thao tác của em cho thật êm.
 *
 * Vì sao hàm này nằm ở ĐÂY chứ không ở checkin-view.tsx như trước (02/08/2026):
 * có HAI nơi phải trả lời cùng một câu hỏi — màn hình lúc em vừa bấm, và hàng đợi
 * lúc gửi lại. Hai bản luật thì sẽ có ngày chúng lệch nhau, mà chỗ lệch nằm đúng
 * trên đường "em có được ghi nhận hay không". Một bản, hai nơi import.
 *
 * Thuần hàm để test được (tests/unit/frontend-trang-thai.test.ts).
 */
export function shouldQueueOffline(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  const status = httpStatusOf(error);
  if (status === null) return true;
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

/**
 * `clientId` phải là UUID — contract `QueuedCheckinInput` khai `z.string().uuid()`,
 * và server dùng nó làm khoá idempotent. Nhánh dự phòng (trình duyệt cũ, ngữ cảnh
 * không bảo mật nên không có `crypto.randomUUID`) vì thế cũng phải sinh ĐÚNG dạng
 * UUID v4, không được là một chuỗi tự chế: sai dạng thì bản ghi bị chặn ở tầng
 * kiểm tra đầu vào, mà nó lại là bản ghi offline — hỏng đúng lúc không ai nhìn.
 */
function randomClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(Math.floor(Math.random() * 256).toString(16).padStart(2, "0"));
  // Bit phiên bản (4) và biến thể (8/9/a/b) theo RFC 4122.
  hex[6] = ((parseInt(hex[6] as string, 16) & 0x0f) | 0x40).toString(16).padStart(2, "0");
  hex[8] = ((parseInt(hex[8] as string, 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Hai mốc thời gian này có cùng một NGÀY địa phương không (không đi vòng qua UTC — xem lib/date.ts). */
export function sameLocalDay(isoA: string, b: Date): boolean {
  const a = new Date(isoA);
  if (Number.isNaN(a.getTime())) return false;
  return toLocalIsoDate(a) === toLocalIsoDate(b);
}

export interface EnqueueResult {
  /**
   * Tâm trạng của bản ghi CÙNG NGÀY vừa bị lần bấm này thay trong hàng đợi, hoặc
   * `null` nếu hôm nay chưa có gì trong hàng đợi. Màn hình phải nói ra giá trị này
   * — ghi đè mà im lặng là điều gói "checkin-trang-thai" sinh ra để chấm dứt.
   */
  replacedMood: QueuedCheckinInput["mood"] | null;
}

export async function enqueueCheckin(
  input: Omit<QueuedCheckinInput, "clientOccurredAt" | "clientId">,
): Promise<EnqueueResult> {
  const now = new Date();
  const existing = (await listQueuedCheckins()).find((i) => sameLocalDay(i.clientOccurredAt, now));
  // Giữ nguyên clientId của bản cùng ngày: một ngày một khoá idempotent, và bản
  // mới ghi ĐÈ đúng chỗ cũ thay vì xếp thêm một hàng nữa cho cùng một ngày.
  const clientId = existing?.clientId ?? randomClientId();
  const item: QueuedCheckinInput = {
    ...input,
    clientOccurredAt: now.toISOString(),
    clientId,
  };
  await set(KEY_PREFIX + clientId, item);
  return { replacedMood: existing?.mood ?? null };
}

export async function listQueuedCheckins(): Promise<QueuedCheckinInput[]> {
  const allKeys = await keys();
  const queueKeys = allKeys.filter((k): k is string => typeof k === "string" && k.startsWith(KEY_PREFIX));
  const items = await Promise.all(queueKeys.map((k) => get<QueuedCheckinInput>(k)));
  return items.filter((i): i is QueuedCheckinInput => Boolean(i));
}

export async function dequeueCheckin(clientId: string): Promise<void> {
  await del(KEY_PREFIX + clientId);
}

// ---------------------------------------------------------------------------
// Dấu vết của một lần bấm KHÔNG đi trọn vẹn.
//
// Vì sao phải có một kho riêng thay vì cứ xoá: bản ghi hỏng vĩnh viễn mà xoá im
// lặng là XOÁ THAO TÁC CỦA EM — em đã bấm, màn hình đã nói "đã lưu, tự gửi sau",
// rồi một buổi tối nào đó nó biến mất và không ai biết. Còn giữ lại trong hàng đợi
// thì nó gửi lại mãi và (trước 31/07) chặn cả hàng. Đường thứ ba: rời hàng đợi,
// nằm ở đây, và màn hình PHẢI nói ra.
// ---------------------------------------------------------------------------

/**
 *  · `loi-vinh-vien`            — máy chủ từ chối bằng một lỗi không tự khỏi (401 hết
 *                                 phiên, 400 ngày quá cũ…). Lượt bấm này CHƯA vào sổ.
 *  · `tam-trang-chua-duoc-ghi`  — máy chủ nhận lượt điểm danh (2xx) nhưng trả
 *                                 `moodSaved=false`: nhà em chưa có phiếu đồng ý nên
 *                                 cột mood để trống (0047). Gửi lại cũng cho kết quả
 *                                 y hệt — thứ thiếu nằm ở phía người lớn, không ở
 *                                 phía mạng — nên bản ghi rời hàng đợi, nhưng em phải
 *                                 được biết phần tâm trạng KHÔNG nằm trong kho.
 */
export type FailedCheckinReason = "loi-vinh-vien" | "tam-trang-chua-duoc-ghi";

export interface FailedCheckin {
  clientId: string;
  mood: QueuedCheckinInput["mood"];
  wantsHelp: boolean;
  /** Mốc em bấm, ISO — màn hình đổi ra giờ địa phương để nói "lúc 07:32 hôm qua". */
  clientOccurredAt: string;
  reason: FailedCheckinReason;
  /** Câu tiếng Việt của máy chủ nếu có (errorFormatter đã viết sẵn), `null` nếu không. */
  message: string | null;
  /** Có để màn hình mời "đăng nhập lại" khi 401 thay vì mời bấm lại vô ích. */
  httpStatus: number | null;
}

function messageOf(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim().length > 0 ? message.trim() : null;
}

async function recordFailure(
  item: QueuedCheckinInput,
  reason: FailedCheckinReason,
  error: unknown,
): Promise<FailedCheckin> {
  const failed: FailedCheckin = {
    clientId: item.clientId,
    mood: item.mood,
    wantsHelp: item.wantsHelp,
    clientOccurredAt: item.clientOccurredAt,
    reason,
    message: messageOf(error),
    httpStatus: httpStatusOf(error),
  };
  // Cùng `clientId` = cùng một lần bấm: ghi đè đúng chỗ, không xếp thêm dấu vết
  // thứ hai cho một việc. Đây cũng là thứ giữ cho flush hai lần không nhân đôi
  // lời báo trên màn hình (§9).
  await set(FAILED_PREFIX + item.clientId, failed);
  return failed;
}

export async function listFailedCheckins(): Promise<FailedCheckin[]> {
  const allKeys = await keys();
  const failedKeys = allKeys.filter((k): k is string => typeof k === "string" && k.startsWith(FAILED_PREFIX));
  const items = await Promise.all(failedKeys.map((k) => get<FailedCheckin>(k)));
  return items
    .filter((i): i is FailedCheckin => Boolean(i))
    .sort((a, b) => b.clientOccurredAt.localeCompare(a.clientOccurredAt));
}

/** Em đã đọc và đã hiểu chuyện gì xảy ra với lần bấm đó — chỉ lúc này dấu vết mới được xoá. */
export async function clearFailedCheckin(clientId: string): Promise<void> {
  await del(FAILED_PREFIX + clientId);
}

// ---------------------------------------------------------------------------

export interface FlushResult {
  /** Gửi được TRỌN VẸN (máy chủ nhận, mức tâm trạng vào kho). */
  sent: number;
  /** Còn ở lại hàng đợi vì lỗi tự khỏi khi có mạng. */
  kept: number;
  /** Rời hàng đợi kèm dấu vết — em phải được nói cho biết. Xem `FailedCheckin`. */
  failed: FailedCheckin[];
}

/** Cái tối thiểu flush cần đọc từ kết quả gửi: 0047 trả `moodSaved`. */
export interface FlushSubmitResult {
  moodSaved?: boolean;
}

export type FlushSubmit = (input: {
  mood: QueuedCheckinInput["mood"];
  wantsHelp: boolean;
}) => Promise<FlushSubmitResult | void>;

/**
 * §9 — MỘT lượt flush tại một thời điểm.
 *
 * Vì sao cần: `tryFlush` chạy cả lúc gắn màn hình lẫn mỗi sự kiện `online`, và
 * trình duyệt bắn `online` nhiều lần khi wifi chập chờn. Hai lượt chạy chồng nhau
 * cùng đọc `listQueuedCheckins()` trước khi lượt nào kịp `dequeueCheckin`, nên
 * cùng một bản ghi được gửi HAI lần. Máy chủ idempotent theo
 * (student_id, occurred_on, kind) nên không sinh dòng đôi — nhưng gửi đôi vẫn là
 * gửi đôi: tốn hạn mức 429 của chính em, và nếu sau này có đường ghi nào không
 * idempotent thì lỗi nằm sẵn ở đây chờ. Lượt thứ hai dùng chung kết quả lượt đầu.
 */
let inFlight: Promise<FlushResult> | null = null;

/**
 * Gọi khi có mạng trở lại (window 'online' event), và một lần lúc mở màn.
 *
 * Mỗi item đi ra khỏi vòng lặp theo đúng một trong ba đường — xem khối chú thích
 * đầu file. Điều KHÔNG bao giờ được phép quay lại: một item nằm lại hàng đợi mà
 * không có đường nào rời đi.
 */
export async function flushQueuedCheckins(submit: FlushSubmit): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = runFlush(submit).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runFlush(submit: FlushSubmit): Promise<FlushResult> {
  const items = await listQueuedCheckins();
  const result: FlushResult = { sent: 0, kept: 0, failed: [] };

  for (const item of items) {
    let sendResult: FlushSubmitResult | void;
    try {
      sendResult = await submit({ mood: item.mood, wantsHelp: item.wantsHelp });
    } catch (error) {
      if (shouldQueueOffline(error)) {
        // Còn offline hoặc lỗi tạm thời — để lại hàng đợi, thử lại lần sau, nhưng
        // vẫn thử nốt những bản ghi khác thay vì bỏ dở cả hàng.
        result.kept++;
        continue;
      }
      // Hỏng y hệt ở lần sau: giữ lại là chặn mọi bản ghi phía sau (nợ #31), xoá
      // là mất thao tác của em. Đường thứ ba — rời hàng đợi, để lại dấu vết.
      //
      // Ghi dấu vết TRƯỚC rồi mới rời hàng đợi. Đảo thứ tự là mở ra một khe mất
      // trắng: tab bị đóng đúng giữa hai lệnh thì bản ghi đã ra khỏi hàng đợi mà
      // chưa có gì nói lại cho em.
      result.failed.push(await recordFailure(item, "loi-vinh-vien", error));
      await dequeueCheckin(item.clientId);
      continue;
    }

    // 2xx KHÔNG có nghĩa là mức tâm trạng đã vào kho (0047). Đọc thiếu cờ này là
    // đánh dấu "đã gửi" cho một giá trị không nằm ở đâu cả — thành công giả, lần
    // thứ ba trong cùng một luồng dữ liệu.
    if (sendResult && sendResult.moodSaved === false) {
      result.failed.push(await recordFailure(item, "tam-trang-chua-duoc-ghi", null));
      await dequeueCheckin(item.clientId);
      continue;
    }

    await dequeueCheckin(item.clientId);
    result.sent++;
  }

  return result;
}
