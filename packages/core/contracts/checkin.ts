// packages/core/contracts/checkin.ts
// Router `checkin` (03-api.md). Contract có version theo §6 bổ sung 27/07/2026 —
// đổi phá tương thích phải đi expand–contract, không sửa thẳng field cũ.
import { z } from "zod";

export const CONTRACTS_VERSION = "0.1.0";

/** 1..4 khớp CHECK constraint attendance.checkins.mood (0004_attendance.sql). */
export const MoodValue = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type MoodValue = z.infer<typeof MoodValue>;

export const MOOD_LABEL: Record<MoodValue, string> = {
  1: "Buồn",
  2: "Mệt",
  3: "Bình thường",
  4: "Vui",
};

export const SubmitMoodInput = z.object({
  mood: MoodValue,
  wantsHelp: z.boolean().default(false),
});
export type SubmitMoodInput = z.infer<typeof SubmitMoodInput>;

export const SubmitMoodOutput = z.object({
  checkinId: z.string().uuid(),
  status: z.enum(["present", "late", "queued_late"]),
  streakDays: z.number().int().nonnegative(),
});
export type SubmitMoodOutput = z.infer<typeof SubmitMoodOutput>;

/** Ghi khi PWA phát hiện offline lúc bấm — client tự gắn cờ, server không suy đoán mạng. */
export const QueuedCheckinInput = SubmitMoodInput.extend({
  clientOccurredAt: z.string().datetime(),
  clientId: z.string().uuid(), // khóa idempotent phía client cho hàng đợi offline
});
export type QueuedCheckinInput = z.infer<typeof QueuedCheckinInput>;

/** V5 "Cần gặp thầy cô" (Hub Desktop V2). Khớp CHECK constraint 0020_help_request_details.sql. */
export const HelpRequestTopic = z.enum(["lop", "nha", "hoc", "suc_khoe", "khac"]);
export type HelpRequestTopic = z.infer<typeof HelpRequestTopic>;

export const HELP_REQUEST_TOPIC_LABEL: Record<HelpRequestTopic, string> = {
  lop: "Chuyện ở lớp",
  nha: "Chuyện ở nhà",
  hoc: "Việc học",
  suc_khoe: "Sức khỏe",
  khac: "Chuyện khác",
};

export const HelpRequestUrgency = z.enum(["urgent", "today", "this_week"]);
export type HelpRequestUrgency = z.infer<typeof HelpRequestUrgency>;

export const HELP_REQUEST_URGENCY_LABEL: Record<HelpRequestUrgency, string> = {
  urgent: "Càng sớm càng tốt",
  today: "Trong hôm nay",
  this_week: "Tuần này là được",
};

export const RequestHelpInput = z.object({
  topic: HelpRequestTopic,
  urgency: HelpRequestUrgency,
  note: z.string().trim().max(500).optional(),
});
export type RequestHelpInput = z.infer<typeof RequestHelpInput>;
