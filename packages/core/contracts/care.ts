// packages/core/contracts/care.ts — router `care`, phạm vi GĐ1: buồng lái GVCN rút gọn.
// GĐ2 (chuyển tâm lý cụm, cờ B/C học thuật-hành vi) chưa có contract ở đây — chưa xây (DESIGN-GUIDELINES).
import { z } from "zod";

export const FlagSummary = z.object({
  // KHÔNG ép .uuid(): flag engine (04-flag-engine.md) chưa chạy nên GĐ1 tính
  // trực tiếp từ tín hiệu thô, flagId là chuỗi ghép "studentId:asOfDate"
  // (xem care.ts). Khi flag engine thật chạy, giá trị này đổi thành care.flags.id
  // (UUID thật) — chữ ký contract giữ nguyên vì đã là string chung.
  flagId: z.string(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  className: z.string(),
  ruleCode: z.string(),
  asOfDate: z.string(), // date ISO
  detail: z.record(z.unknown()),
  caseId: z.string().uuid().nullable(),
  caseStatus: z.enum(["open", "closed"]).nullable(),
});
export type FlagSummary = z.infer<typeof FlagSummary>;

export const PendingLateCheckin = z.object({
  checkinId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  occurredOn: z.string(),
});
export type PendingLateCheckin = z.infer<typeof PendingLateCheckin>;

export const MoodBucket = z.object({
  mood: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  count: z.number().int().nonnegative(),
});

export const RecentAction = z.object({
  studentName: z.string(),
  action: z.string(),
  occurredAt: z.string(),
});
export type RecentAction = z.infer<typeof RecentAction>;

export const GetDashboardOutput = z.object({
  className: z.string(),
  asOfDate: z.string(),
  lastScanAt: z.string().nullable(), // ops.job_runs.finished_at gần nhất — "Quét đêm qua HH:mm"
  staleSources: z.array(z.string()), // ops.v_stale_sources — băng vàng ADR-016
  totals: z.object({
    checkinCount: z.number().int(),
    pendingLateCount: z.number().int(),
    absentCount: z.number().int(),
    totalStudents: z.number().int(), // 30/07/2026: "27/30" ở V10 cần mẫu số thật
    openCareCases: z.number().int(), // 30/07/2026: "hồ sơ chăm sóc đang mở"
  }),
  moodDistribution: z.array(MoodBucket),
  priorityFlags: z.array(FlagSummary), // origin='live' + case open, sắp theo mức độ
  pendingLateCheckins: z.array(PendingLateCheckin),
  recentActions: z.array(RecentAction), // 30/07/2026: care.interventions gần nhất — "Hành động gần đây"
});
export type GetDashboardOutput = z.infer<typeof GetDashboardOutput>;

export const AcknowledgeLateInput = z.object({
  checkinIds: z.array(z.string().uuid()).min(1),
});
export type AcknowledgeLateInput = z.infer<typeof AcknowledgeLateInput>;

export const LogInterventionInput = z.object({
  // KHÔNG ép .uuid(): GĐ1 nhận cả care_cases.id thật LẪN flagId ghép tạm
  // "studentId:asOfDate" (flag engine chưa chạy) — care.ts tự phân biệt hai dạng.
  caseId: z.string().min(1),
  action: z.string().min(1).max(200),
  note: z.string().max(2000).optional(),
  // §9 — mã do client sinh MỘT LẦN mỗi lần mở form (crypto.randomUUID()). Gửi lại
  // cùng mã = cùng một hành động, không phải hành động thứ hai. Để `optional` vì
  // client hiện tại (components/gvcn-dashboard.tsx) chưa gửi: khi thiếu, máy chủ tự
  // dựng khoá chống trùng từ (case, người ghi, nội dung, ngày) — xem care.ts.
  clientMutationId: z.string().uuid().optional(),
});
export type LogInterventionInput = z.infer<typeof LogInterventionInput>;

export const LogInterventionOutput = z.object({
  caseId: z.string().uuid(),
  interventionId: z.string().uuid().nullable(),
  /** true = lần gọi này rơi vào một hành động đã ghi trước đó (§9), không tạo dòng mới. */
  deduplicated: z.boolean(),
});
export type LogInterventionOutput = z.infer<typeof LogInterventionOutput>;

/** Ngày dạng ISO `YYYY-MM-DD` — không nhận timestamp để không lẫn múi giờ. */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải ở dạng YYYY-MM-DD");

export const AcknowledgeHelpRequestInput = z.object({
  studentId: z.string().uuid(),
  requestedOn: IsoDate,
});
export type AcknowledgeHelpRequestInput = z.infer<typeof AcknowledgeHelpRequestInput>;

export const AcknowledgeHelpRequestOutput = z.object({
  updated: z.number().int().nonnegative(),
  /** Người khác đã xử lý trước — gọi lại là no-op, KHÔNG phải lỗi (§9). */
  alreadyHandled: z.boolean(),
});
export type AcknowledgeHelpRequestOutput = z.infer<typeof AcknowledgeHelpRequestOutput>;

export const CloseCaseInput = z.object({
  caseId: z.string().uuid(),
  // Bắt buộc có: đóng hồ sơ mà không nói vì sao thì lần sau không ai học được gì từ nó.
  resolution: z.string().min(1).max(2000),
});
export type CloseCaseInput = z.infer<typeof CloseCaseInput>;

export const CloseCaseOutput = z.object({
  caseId: z.string().uuid(),
  closed: z.boolean(),
  alreadyClosed: z.boolean(),
});
export type CloseCaseOutput = z.infer<typeof CloseCaseOutput>;
