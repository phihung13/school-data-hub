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
"use client";

import { get, set, del, keys } from "idb-keyval";
import type { QueuedCheckinInput } from "@hub/core/contracts";
import { toLocalIsoDate } from "./date";

const KEY_PREFIX = "hub:queued-checkin:";

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

/**
 * Gọi khi có mạng trở lại (window 'online' event). Mỗi item gửi qua
 * checkin.submitMood — idempotent theo (student_id, occurred_on, kind) nên
 * gửi lại không tạo dòng đôi kể cả nếu flush chạy hai lần (tab kép, race).
 *
 * Một item hỏng KHÔNG được chặn các item còn lại: trước đây vòng lặp `break` ngay
 * lần lỗi đầu tiên, nên một bản ghi hỏng vĩnh viễn (ngày cũ, phiên khác) khoá luôn
 * cả hàng đợi và mọi check-in sau đó không bao giờ tới máy chủ — buồng lái GVCN
 * đọc im lặng đó thành "em ổn". Hàng đợi giờ tối đa một bản ghi mỗi ngày nên đi
 * hết cũng chỉ vài request.
 */
export async function flushQueuedCheckins(
  submit: (input: { mood: QueuedCheckinInput["mood"]; wantsHelp: boolean }) => Promise<unknown>,
): Promise<number> {
  const items = await listQueuedCheckins();
  let sent = 0;
  for (const item of items) {
    try {
      await submit({ mood: item.mood, wantsHelp: item.wantsHelp });
      await dequeueCheckin(item.clientId);
      sent++;
    } catch {
      // Còn offline hoặc lỗi tạm thời — để lại hàng đợi, thử lại lần sau, nhưng
      // vẫn thử nốt những bản ghi khác thay vì bỏ dở cả hàng.
      continue;
    }
  }
  return sent;
}
