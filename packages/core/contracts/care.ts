// packages/core/contracts/care.ts — router `care`, phạm vi GĐ1: buồng lái GVCN rút gọn.
// GĐ2 (chuyển tâm lý cụm, cờ B/C học thuật-hành vi) chưa có contract ở đây — chưa xây (DESIGN-GUIDELINES).
import { z } from "zod";
import { HelpRequestTopic, HelpRequestUrgency, MoodValue } from "./checkin.ts";
import { GlowItem, GrowItem } from "./report.ts";

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

/**
 * Buồng lái nhìn ĐÚNG MỘT lớp mỗi lần.
 *
 * Trước 31/07/2026 procedure không nhận tham số nào: nó lấy cứng lớp chủ nhiệm đầu tiên
 * (`ctx.homeroomClassId`). Một người chủ nhiệm hai lớp mở buồng lái chỉ thấy lớp một, và
 * màn hình không nói đang xem lớp nào — cả khối thì chuyện đó xảy ra thật. Bốn màn con
 * (/gvcn/lop, diem-danh, duyet-bao-cao, ghi-chu) đã có bộ chọn lớp từ trước; buồng lái là
 * chỗ cuối cùng còn đoán hộ.
 *
 * `classId` để trống KHÔNG còn nghĩa là "lớp bất kỳ": máy chủ chọn lớp đầu theo MÃ LỚP,
 * đúng thứ tự `GetMyClassesOutput` trả về, nên bộ chọn của bốn màn con và buồng lái luôn
 * mở cùng một lớp. Truyền lớp không phải của mình → FORBIDDEN (đối chiếu
 * `ctx.homeroomClassIds`, không tin tham số).
 *
 * Cả object là `.optional()` có chủ ý — `care.getDashboard()` gọi không tham số vẫn hợp lệ,
 * nên client cũ và `home-view` prefetch không gãy.
 */
export const GetDashboardInput = z
  .object({ classId: z.string().uuid().optional() })
  .optional();
export type GetDashboardInput = z.infer<typeof GetDashboardInput>;

export const GetDashboardOutput = z.object({
  /**
   * Lớp mà MỌI con số bên dưới thuộc về. Bắt buộc, không optional: thiếu nó thì màn hình
   * chỉ có `className` để đối chiếu, mà mã lớp trùng nhau giữa hai cơ sở là chuyện có
   * thật — bộ chọn lớp sẽ sáng nhầm nút và không ai nhận ra.
   */
  classId: z.string().uuid(),
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

/**
 * ĐÚNG nội dung phụ huynh sẽ đọc, không phải bản tóm tắt cho người trong nghề.
 *
 * Vì sao có mặt trong contract của `care` chứ không phải `report`: sổ duyệt
 * (`report.growth_report_approvals`) chỉ lưu QUYẾT ĐỊNH, không lưu nội dung — nội dung
 * vẫn sinh lại từ dữ liệu thô. Nhưng một chữ ký duyệt đặt lên thứ người ký chưa từng
 * nhìn thấy thì không phải chữ ký, chỉ là một cú bấm. Nên màn duyệt phải trả về kèm bản
 * xem trước, dựng bằng CÙNG bộ luật với `buildGrowthReport` (apps/hub/server/routers/report.ts).
 *
 * Giọng ở đây là giọng "Glow & Grow" của phụ huynh (DESIGN-GUIDELINES §8) — cố ý, vì
 * đây là bản sao nguyên văn thứ phụ huynh đọc. Từ vựng vận hành (cờ/ngưỡng/leo thang)
 * KHÔNG được lẫn vào khối này, kể cả khi nó hiện trên màn hình GVCN.
 */
export const ReportPreview = z.object({
  headline: z.string(),
  glow: z.array(GlowItem),
  /** GĐ1: tối đa 1 gợi ý — giống hệt `GetGrowthReportOutput.grow`, tránh liệt kê nặng nề. */
  grow: z.array(GrowItem).max(1),
  streakDays: z.number().int().nonnegative(),
});
export type ReportPreview = z.infer<typeof ReportPreview>;

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
  /** Bản xem trước bắt buộc — không optional: thiếu nó thì màn duyệt quay lại ký mù. */
  preview: ReportPreview,
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

// ───────────────────────────────────────────────────────────────────────────
// MÀN CHI TIẾT MỘT HỌC SINH (gói "man-hinh-con-thieu-gvcn-hs", 31/07/2026)
//
// Bốn màn GVCN phía trên đều là màn CỦA CẢ LỚP. Bảng "Lớp chủ nhiệm" hiện được dấu
// «Cần gặp thầy cô» và «Hồ sơ đang mở» trên từng dòng, buồng lái hiện thẻ cờ mang tên
// từng em — nhưng không có một màn nào trả lời câu hỏi tiếp theo mà giáo viên luôn hỏi:
// "em này mấy hôm nay thế nào?". Không có nó thì cô phải mở bốn màn lớp rồi tự lọc mắt
// theo một cái tên, và phần lớn sẽ không làm — dấu hiệu hiện ra rồi trôi qua.
//
// Bốn nguồn gộp vào MỘT màn, đúng bốn thứ đã tồn tại thật trong CSDL (không bịa thêm
// mục nào chưa có dữ liệu):
//   1. check-in 7–30 ngày (attendance.checkins)
//   2. tín hiệu «cần gặp thầy cô» + hồ sơ chăm sóc mở/đóng (attendance.help_requests,
//      care.care_cases)
//   3. nhật ký can thiệp CỦA RIÊNG EM (care.interventions)
//   4. trạng thái duyệt Báo cáo Trưởng thành mấy tuần gần đây
//      (report.growth_report_approvals)
//
// KHÔNG có `care.counselor_notes` ở đây: 0035 vừa đóng ghi chú tư vấn lại với GVCN, và
// một màn "gộp mọi thứ về một em" là đúng chỗ dễ vô tình mở lại nhất.
// ───────────────────────────────────────────────────────────────────────────

/** `classId` để trống = lớp chủ nhiệm đầu tiên, giống GetClassRosterInput. */
export const GetStudentDetailInput = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  /**
   * Cửa sổ ngày của dải check-in. Trần 30 và sàn 7 là giới hạn CỦA MÀN HÌNH, không phải
   * ngưỡng cảnh báo — §6 không đụng tới ở đây: mọi ngưỡng sinh cờ vẫn đọc từ
   * `care.thresholds` trong getDashboard, màn này chỉ vẽ lại dữ liệu thô.
   */
  days: z.number().int().min(7).max(30).default(14),
});
export type GetStudentDetailInput = z.infer<typeof GetStudentDetailInput>;

/**
 * MỘT ngày CÓ dòng check-in. Ngày không có dòng KHÔNG xuất hiện trong mảng — màn hình tự
 * dựng lưới ngày từ `window` rồi vẽ ô trống là "chưa có dữ liệu". Cố tình không trả sẵn
 * ngày rỗng mang `status: null`: một hàng có mặt trong mảng trông như một sự thật đã ghi
 * nhận, mà "chưa ai ghi gì" thì không phải sự thật đã ghi nhận.
 */
export const StudentCheckinDay = z.object({
  occurredOn: IsoDate,
  status: AttendanceStatus.nullable(),
  mood: MoodValue.nullable(),
  /** "HH:MM" giờ máy chủ, hoặc null khi dòng do cô ghi hộ (không có giờ em bấm). */
  checkedInAt: z.string().nullable(),
  /** 'app' | 'teacher' | … — để phân biệt "em tự bấm" với "cô ghi hộ" (ADR-007). */
  source: z.string().nullable(),
});
export type StudentCheckinDay = z.infer<typeof StudentCheckinDay>;

/**
 * Một lần em bấm «cần gặp thầy cô».
 *
 * `note` CÓ mặt ở đây, và đó là quyết định có cân nhắc. Màn /can-gap-thay-co in thẳng
 * lên mặt em một lời hứa: dưới câu "Ai đọc được lời con?" là tên GVCN với dấu tích xanh.
 * Trước hôm nay lời hứa đó không đúng theo chiều ngược lại — `note` được ghi vào CSDL và
 * KHÔNG có một màn hình nào đọc nó, kể cả của cô. Lời hứa in trên màn hình là ràng buộc
 * kỹ thuật: hoặc cô đọc được, hoặc phải bỏ câu hứa đi. Chọn cách thứ nhất.
 *
 * Phạm vi vẫn đúng bằng lời hứa, không rộng hơn một milimet: procedure mang
 * `homeroomProcedure` + đối chiếu em thuộc ĐÚNG lớp mình chủ nhiệm, nên nội dung này
 * không đi tới tâm lý cụm, không đi tới phụ huynh, không vào báo cáo (§5), và không được
 * sao chép sang `care.flags.detail` (luật "cờ E gọn" — cờ chỉ ghi LOẠI tín hiệu).
 */
export const StudentHelpRequest = z.object({
  requestedOn: IsoDate,
  requestedAt: z.string(),
  topic: HelpRequestTopic.nullable(),
  urgency: HelpRequestUrgency.nullable(),
  note: z.string().nullable(),
  /** null = chưa ai bấm "cô đã gặp em rồi". KHÔNG đồng nghĩa với "chưa ai đọc". */
  handledAt: z.string().nullable(),
});
export type StudentHelpRequest = z.infer<typeof StudentHelpRequest>;

export const StudentCareCase = z.object({
  caseId: z.string().uuid(),
  status: z.enum(["open", "closed"]),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
});
export type StudentCareCase = z.infer<typeof StudentCareCase>;

export const StudentReportApproval = z.object({
  weekStart: IsoDate,
  status: ReportApprovalStatus,
  reviewedAt: z.string().nullable(),
  note: z.string().nullable(),
});
export type StudentReportApproval = z.infer<typeof StudentReportApproval>;

export const GetStudentDetailOutput = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  asOfDate: IsoDate,
  /** Khoảng ngày đã HỎI. Màn hình dựng lưới ngày từ đây, không tự đoán cửa sổ. */
  window: z.object({ days: z.number().int(), fromDate: IsoDate, toDate: IsoDate }),
  student: z.object({
    studentId: z.string().uuid(),
    studentCode: z.string(),
    fullName: z.string(),
  }),
  checkins: z.array(StudentCheckinDay),
  helpRequests: z.array(StudentHelpRequest),
  careCases: z.array(StudentCareCase),
  /**
   * Dùng lại `ClassInterventionRow` thay vì định nghĩa một dòng nhật ký thứ hai: hai
   * định nghĩa của cùng một thứ là cách hợp đồng bắt đầu lệch (xem ghi chú đầu khối
   * bốn màn GVCN). Ở đây mọi dòng đều của cùng một em, `studentId`/`studentName` lặp lại.
   */
  interventions: z.array(ClassInterventionRow),
  reportApprovals: z.array(StudentReportApproval),
});
export type GetStudentDetailOutput = z.infer<typeof GetStudentDetailOutput>;

// ───────────────────────────────────────────────────────────────────────────
// HAI MÀN HÌNH CỦA TÂM LÝ CỤM (gói "man-hinh-tam-ly-cum", 31/07/2026)
//
// Vai `counselor` cho tới hôm nay có ĐÚNG 0 màn nghiệp vụ: đăng nhập vào là ngõ cụt,
// trong khi cô GHI ĐƯỢC ba thứ nặng nhất của hệ chăm sóc — tắt cờ khẩn
// (`acknowledgeHelpRequest`), ghi can thiệp (`logIntervention`) và ĐÓNG hồ sơ của một
// đứa trẻ (`closeCase`). `listClassInterventions` đã mở một khe đọc, nhưng nó bắt phải
// biết trước `classId`, mà cụm là nhiều lớp: cô không có đường nào để bắt đầu từ câu
// hỏi thật của mình — "hôm nay ai đang chờ tôi?".
//
// Hai màn ở đây trả lời đúng câu đó:
//   1. `ListClusterCasesOutput` — danh sách việc đang chờ trong CỤM (hồ sơ chăm sóc
//      đang mở + tín hiệu «cần gặp thầy cô» chưa ai xử lý), gộp theo TỪNG EM.
//   2. `GetClusterCaseDetailOutput` — một em, đủ thứ cần đọc TRƯỚC KHI bấm ba nút kia.
//
// ── HAI THỨ CỐ TÌNH KHÔNG CÓ TRONG HAI HỢP ĐỒNG NÀY ───────────────────────
//
// (a) `mood` / dải check-in cảm xúc. Màn check-in in cho học sinh đọc, ngay tại chỗ
//     nhập: «Chỉ thầy cô chủ nhiệm thấy» (checkin-view.tsx). DESIGN-GUIDELINES §9 nói
//     lại đúng câu đó. Tâm lý cụm KHÔNG nằm trong "thầy cô chủ nhiệm".
//
// (b) `note` của «cần gặp thầy cô» — nguyên văn lời em viết. Màn /can-gap-thay-co in
//     cho em đọc TRƯỚC KHI gửi: dấu tích xanh cho ĐÚNG một người (GVCN của em), dấu đỏ
//     cho "thầy cô khác", và một câu nữa ở dưới: «Nếu chuyện cần người chuyên môn hỗ
//     trợ, cô sẽ hỏi ý con trước khi chuyển tới phòng tâm lý». Nghĩa là phòng tâm lý
//     đọc lời em SAU một lần chuyển tuyến mà em đã đồng ý — và đường chuyển tuyến đó
//     chưa tồn tại (GĐ2, xem `intervention-notes-view.tsx`). Nên ở đây tâm lý cụm chỉ
//     nhận LOẠI tín hiệu (chủ đề, mức khẩn, ngày, đã xử lý chưa) — đúng bằng luật "cờ E
//     gọn" của `care.flags.detail`, không hơn một milimet. Đó là lý do có
//     `ClusterHelpSignal` riêng thay vì dùng lại `StudentHelpRequest`.
//
// Lời hứa in trên màn hình là ràng buộc kỹ thuật: hoặc hợp đồng giữ đúng nó, hoặc phải
// đi bỏ câu hứa. Ở đây chọn cách thứ nhất — hình dạng dữ liệu không cho phép màn hình
// lỡ tay hiện ra thứ đã hứa là không hiện.
// ───────────────────────────────────────────────────────────────────────────

/** Một cơ sở trong cụm phụ trách. Màn hình phải NÓI RA cụm gồm những gì, không để cô đoán. */
export const ClusterSchool = z.object({
  schoolId: z.string().uuid(),
  schoolCode: z.string(),
  schoolName: z.string(),
});
export type ClusterSchool = z.infer<typeof ClusterSchool>;

/**
 * Một EM đang có việc trong cụm — không phải "một hồ sơ".
 *
 * Vì sao khoá là học sinh chứ không phải `care_cases.id`: một em vừa bấm «cần gặp thầy
 * cô» thì CHƯA có hồ sơ nào (hồ sơ chỉ sinh ra khi có người ghi can thiệp đầu tiên —
 * `resolveOpenCase` trong routers/care.ts). Lấy hồ sơ làm gốc thì đúng nhóm cần gấp
 * nhất lại là nhóm biến mất khỏi danh sách.
 */
export const ClusterCaseRow = z.object({
  studentId: z.string().uuid(),
  studentCode: z.string(),
  fullName: z.string(),
  /** null = em không có ghi danh đang hiệu lực. KHÔNG bịa mã lớp (labels.ts). */
  className: z.string().nullable(),
  schoolName: z.string(),
  /** null = chưa ai mở hồ sơ cho em. Đây là trạng thái THẬT, không phải dữ liệu thiếu. */
  caseId: z.string().uuid().nullable(),
  caseStatus: z.enum(["open", "closed"]).nullable(),
  openedAt: z.string().nullable(),
  /** Có tín hiệu «cần gặp thầy cô» chưa ai bấm "đã gặp em rồi". */
  helpPending: z.boolean(),
  helpRequestedOn: IsoDate.nullable(),
  helpTopic: HelpRequestTopic.nullable(),
  helpUrgency: HelpRequestUrgency.nullable(),
  interventionCount: z.number().int().nonnegative(),
  lastInterventionAt: z.string().nullable(),
  /**
   * Số ngày kể từ hành động gần nhất. `null` = CHƯA CÓ hành động nào — khác hẳn 0, và
   * màn hình phải nói ra sự khác nhau đó ("chưa ai làm gì" ≠ "vừa làm hôm nay").
   */
  daysSinceLastAction: z.number().int().nonnegative().nullable(),
  /**
   * Quá ngưỡng im lặng (`care.thresholds.E_MOOD.quiet_days`, §7 — KHÔNG viết số trong
   * code). Đây là con số của ĐÚNG cơ sở em đang học, không phải một hằng số toàn hệ.
   */
  overQuietWindow: z.boolean(),
});
export type ClusterCaseRow = z.infer<typeof ClusterCaseRow>;

export const ListClusterCasesInput = z.object({
  /** Lọc theo một cơ sở trong cụm. Không truyền = cả cụm. Cơ sở ngoài cụm → FORBIDDEN. */
  schoolId: z.string().uuid().optional(),
  /** Xem cả hồ sơ đã đóng. Mặc định chỉ việc ĐANG chờ — màn này là hộp việc, không phải kho lưu trữ. */
  includeClosed: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(100),
});
export type ListClusterCasesInput = z.infer<typeof ListClusterCasesInput>;

export const ListClusterCasesOutput = z.object({
  asOfDate: IsoDate,
  /** Cụm gồm những cơ sở nào — rỗng nghĩa là vai counselor chưa được gán cơ sở nào. */
  scope: z.object({ schools: z.array(ClusterSchool) }),
  totals: z.object({
    openCases: z.number().int().nonnegative(),
    pendingHelp: z.number().int().nonnegative(),
    /** Trong số trên, bao nhiêu em đã quá ngưỡng im lặng — cột "leo thang" của màn. */
    overQuietWindow: z.number().int().nonnegative(),
  }),
  /** Cửa sổ nhìn lại của tín hiệu khẩn, đọc từ `care.thresholds` — hiện lên màn để cô biết mình đang nhìn bao xa. */
  urgentWindowDays: z.number().int().positive(),
  quietDays: z.number().int().positive(),
  rows: z.array(ClusterCaseRow),
});
export type ListClusterCasesOutput = z.infer<typeof ListClusterCasesOutput>;

/**
 * Một lần em bấm «cần gặp thầy cô», NHÌN TỪ PHÍA TÂM LÝ CỤM.
 *
 * Giống `StudentHelpRequest` (màn GVCN) đúng mọi field trừ MỘT: không có `note`. Xem
 * lời giải thích (b) ở đầu khối. Đây là chỗ duy nhất trong hợp đồng mà hai vai nhìn
 * cùng một hàng dữ liệu bằng hai hình dạng khác nhau, và sự khác nhau đó là cố ý —
 * gộp lại làm một schema là mở lại đúng thứ vừa đóng.
 */
export const ClusterHelpSignal = z.object({
  requestedOn: IsoDate,
  requestedAt: z.string(),
  topic: HelpRequestTopic.nullable(),
  urgency: HelpRequestUrgency.nullable(),
  /** null = chưa ai bấm "đã gặp em rồi". KHÔNG đồng nghĩa với "chưa ai đọc". */
  handledAt: z.string().nullable(),
});
export type ClusterHelpSignal = z.infer<typeof ClusterHelpSignal>;

/**
 * Một ghi chú tư vấn (`care.counselor_notes`) — hẹp nhất trong care.
 *
 * Chỉ TÁC GIẢ và TÂM LÝ CỤM đọc được, cưỡng chế ở tầng dữ liệu bởi policy
 * `counselor_notes_scope` (0035). Hợp đồng này nằm trong `contracts/care.ts` nhưng KHÔNG
 * được dùng trong bất kỳ output nào của màn GVCN — xem ghi chú cuối khối «màn chi tiết
 * một học sinh»: 0035 vừa đóng ghi chú tư vấn lại với GVCN.
 */
export const CounselorNote = z.object({
  noteId: z.string().uuid(),
  body: z.string(),
  createdAt: z.string(),
  /** Tên người viết; "Thầy cô khác" khi `core.users` không mở tên đồng nghiệp (policy users_self). */
  authorName: z.string(),
  /** Do CHÍNH người đang xem viết — để màn hình khỏi phải so id ở client. */
  mine: z.boolean(),
});
export type CounselorNote = z.infer<typeof CounselorNote>;

export const GetClusterCaseDetailInput = z.object({
  studentId: z.string().uuid(),
  /** Cửa sổ ngày của tín hiệu khẩn hiển thị. Giới hạn CỦA MÀN HÌNH, không phải ngưỡng cảnh báo (§6). */
  days: z.number().int().min(7).max(90).default(30),
});
export type GetClusterCaseDetailInput = z.infer<typeof GetClusterCaseDetailInput>;

export const GetClusterCaseDetailOutput = z.object({
  asOfDate: IsoDate,
  window: z.object({ days: z.number().int(), fromDate: IsoDate, toDate: IsoDate }),
  student: z.object({
    studentId: z.string().uuid(),
    studentCode: z.string(),
    fullName: z.string(),
    className: z.string().nullable(),
    schoolName: z.string(),
  }),
  /** Hồ sơ đang mở, nếu có. `null` = em chưa có hồ sơ nào đang mở (trạng thái thật). */
  openCase: StudentCareCase.nullable(),
  /** Lịch sử hồ sơ, mới nhất trước. Rỗng = chưa ai từng mở hồ sơ cho em. */
  cases: z.array(StudentCareCase),
  /** Nhật ký HÀNH ĐỘNG của người lớn — không phải lời em kể. Dùng lại `ClassInterventionRow`. */
  interventions: z.array(ClassInterventionRow),
  counselorNotes: z.array(CounselorNote),
  helpSignals: z.array(ClusterHelpSignal),
  /**
   * Hub CHƯA có đường ghi `care.counselor_notes` (0009 chỉ cấp policy SELECT; không có
   * INSERT nào). Cờ này để màn hình nói THẲNG điều đó thay vì hiện một ô soạn thảo mà
   * bấm Lưu sẽ báo lỗi quyền — và cũng để không ai đọc ô trống thành "em chưa từng được
   * tư vấn". Sự thật là: chỗ này chưa ghi được, không phải chưa có gì để ghi.
   */
  notesWritable: z.boolean(),
});
export type GetClusterCaseDetailOutput = z.infer<typeof GetClusterCaseDetailOutput>;
