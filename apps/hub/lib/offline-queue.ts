// apps/hub/lib/offline-queue.ts
// Hàng đợi check-in khi mất mạng (PWA offline-first, 05-capacity-ops.md + P2).
// "Offline vẫn lưu — tự gửi sau." — không hộp thoại, không mất thao tác của em.
"use client";

import { get, set, del, keys } from "idb-keyval";
import type { QueuedCheckinInput } from "@hub/core/contracts";

const KEY_PREFIX = "hub:queued-checkin:";

function randomClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueCheckin(input: Omit<QueuedCheckinInput, "clientOccurredAt" | "clientId">): Promise<void> {
  const clientId = randomClientId();
  const item: QueuedCheckinInput = {
    ...input,
    clientOccurredAt: new Date().toISOString(),
    clientId,
  };
  await set(KEY_PREFIX + clientId, item);
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
      // Còn offline hoặc lỗi tạm thời — để lại hàng đợi, thử lại lần sau.
      break;
    }
  }
  return sent;
}
