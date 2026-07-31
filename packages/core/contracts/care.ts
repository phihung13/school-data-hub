// packages/core/contracts/care.ts — router `care`, phạm vi GĐ1: buồng lái GVCN rút gọn.
// GĐ2 (chuyển tâm lý cụm, cờ B/C học thuật-hành vi) chưa có contract ở đây — chưa xây (DESIGN-GUIDELINES).
import { z } from "zod";
import { MoodValue } from "./checkin.ts";

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

// ───────────────────────────────────────────────────────────────────────────
// Bốn màn hình GVCN (gói "gvcn-man-hinh", 31/07/2026): danh sách lớp · điểm danh lớp ·
// duyệt Báo cáo Trưởng thành · ghi chú can thiệp.
//
// Vì sao nằm trong `care.ts` chứ không tách file `roster.ts`: bốn màn này đều là buồng
// lái của CÙNG một người (GVCN) trên CÙNG một lớp, dùng chung `homeroomProcedure` và
// chung khái niệm "lớp chủ nhiệm". Tách file làm hai chỗ cùng định nghĩa "một dòng
// danh sách lớp" — và hai định nghĩa của cùng một thứ là cách hợp đồng bắt đầu lệch.
// ───────────────────────────────────────────────────────────────────────────

/** Khớp CHECK constraint `checkins_status_chk` (0004_attendance.sql). */
export const AttendanceStatus = z.enum(["present", "late", "absent", "excused", "queued_late"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

/**
 * Tập trạng thái GVCN được GHI. Hẹp hơn `AttendanceStatus` đúng một giá trị:
 * `queued_late` là trạng thái do hàng đợi offline sinh ra (máy), không phải thứ con
 * người ghi tay — cô ghi thẳng kết quả chứ không tự tạo việc chờ duyệt cho chính mình.
 * Cưỡng chế lại ở tầng DB bằng policy `checkins_insert_by_homeroom` (0032).
 */
export const TeacherAttendanceStatus = z.enum(["present", "late", "absent", "excused"]);
export type TeacherAttendanceStatus = z.infer<typeof TeacherAttendanceStatus>;

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Có mặt",
  late: "Đi muộn",
  absent: "Vắng",
  excused: "Có phép",
  queued_late: "Gửi muộn — chờ xác nhận",
};

export const HomeroomClass = z.object({
  classId: z.string().uuid(),
  classCode: z.string(),
  studentCount: z.number().int().nonnegative(),
});
export type HomeroomClass = z.infer<typeof HomeroomClass>;

/** Một người có thể chủ nhiệm nhiều lớp — màn hình phải cho chọn, không được đoán lớp đầu tiên. */
export const GetMyClassesOutput = z.object({ classes: z.array(HomeroomClass) });
export type GetMyClassesOutput = z.infer<typeof GetMyClassesOutput>;

/** `classId` để trống = lớp chủ nhiệm đầu tiên. Truyền lớp KHÔNG phải của mình → FORBIDDEN. */
export const GetClassRosterInput = z.object({
  classId: z.string().uuid().optional(),
  onDate: IsoDate.optional(),
});
export type GetClassRosterInput = z.infer<typeof GetClassRosterInput>;

export const ClassRosterEntry = z.object({
  studentId: z.string().uuid(),
  studentCode: z.string(), // §1 — mã hiển thị bất biến, không phải id nội bộ
  fullName: z.string(),
  status: AttendanceStatus.nullable(), // null = chưa có dòng điểm danh nào hôm đó
  mood: MoodValue.nullable(),
  checkedInAt: z.string().nullable(),
  /** Có hồ sơ chăm sóc đang mở — dấu hiệu để cô mở trước, KHÔNG phải nhãn dán lên em. */
  hasOpenCase: z.boolean(),
  /** Đã bấm «cần gặp thầy cô» và chưa ai xử lý. */
  helpPending: z.boolean(),
});
export type ClassRosterEntry = z.infer<typeof ClassRosterEntry>;

export const GetClassRosterOutput = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  asOfDate: IsoDate,
  students: z.array(ClassRosterEntry),
});
export type GetClassRosterOutput = z.infer<typeof GetClassRosterOutput>;

export const MarkAttendanceInput = z.object({
  classId: z.string().uuid().optional(),
  occurredOn: IsoDate,
  // Trần 60: lớp đông nhất của hệ chưa tới 45 em. Chặn ở đây để một payload dựng tay
  // không biến thành câu ghi hàng nghìn dòng.
  entries: z
    .array(z.object({ studentId: z.string().uuid(), status: TeacherAttendanceStatus }))
    .min(1)
    .max(60),
});
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceInput>;

export const MarkAttendanceOutput = z.object({
  /** Số em đã ghi đúng trạng thái yêu cầu. §9: gọi lại lần hai cho ĐÚNG con số này. */
  applied: z.number().int().nonnegative(),
  /** Em không thuộc lớp đó (hoặc bị RLS chặn) — bỏ qua im lặng, không làm hỏng cả lô. */
  skipped: z.number().int().nonnegative(),
});
export type MarkAttendanceOutput = z.infer<typeof MarkAttendanceOutput>;

export const ReportApprovalStatus = z.enum(["pending", "approved", "rejected"]);
export type ReportApprovalStatus = z.infer<typeof ReportApprovalStatus>;

/** `weekStart` để trống = tuần hiện tại. Server luôn nắn về thứ Hai, không tin ngày client gửi. */
export const ListReportApprovalsInput = z.object({
  classId: z.string().uuid().optional(),
  weekStart: IsoDate.optional(),
});
export type ListReportApprovalsInput = z.infer<typeof ListReportApprovalsInput>;

export const ReportApprovalRow = z.object({
  studentId: z.string().uuid(),
  studentCode: z.string(),
  fullName: z.string(),
  status: ReportApprovalStatus,
  reviewedAt: z.string().nullable(),
  note: z.string().nullable(),
  /** Hai con số để cô biết báo cáo tuần đó dựa trên bao nhiêu dữ liệu thật. */
  checkinDays: z.number().int().nonnegative(),
  happyDays: z.number().int().nonnegative(),
});
export type ReportApprovalRow = z.infer<typeof ReportApprovalRow>;

export const ListReportApprovalsOutput = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  weekStart: IsoDate,
  rows: z.array(ReportApprovalRow),
});
export type ListReportApprovalsOutput = z.infer<typeof ListReportApprovalsOutput>;

export const ApproveReportInput = z.object({
  studentId: z.string().uuid(),
  weekStart: IsoDate,
  decision: z.enum(["approved", "rejected"]),
  // Trả lại mà không nói vì sao thì tuần sau lặp lại đúng lỗi đó (cùng lý lẽ với
  // CloseCaseInput.resolution). Bắt buộc khi trả lại — kiểm ở router, không kiểm ở đây
  // để thông điệp lỗi còn ra tiếng Việt cho người dùng.
  note: z.string().max(2000).optional(),
});
export type ApproveReportInput = z.infer<typeof ApproveReportInput>;

export const ApproveReportOutput = z.object({
  studentId: z.string().uuid(),
  weekStart: IsoDate,
  status: ReportApprovalStatus,
  note: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /** true = quyết định y hệt đã có sẵn, lần gọi này không đổi gì (§9). */
  alreadyRecorded: z.boolean(),
});
export type ApproveReportOutput = z.infer<typeof ApproveReportOutput>;

export const ListClassInterventionsInput = z.object({
  classId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ListClassInterventionsInput = z.infer<typeof ListClassInterventionsInput>;

export const ClassInterventionRow = z.object({
  interventionId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  action: z.string(),
  note: z.string().nullable(),
  occurredAt: z.string(),
  actorName: z.string(),
  caseStatus: z.enum(["open", "closed"]),
});
export type ClassInterventionRow = z.infer<typeof ClassInterventionRow>;

export const ListClassInterventionsOutput = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  rows: z.array(ClassInterventionRow),
});
export type ListClassInterventionsOutput = z.infer<typeof ListClassInterventionsOutput>;
