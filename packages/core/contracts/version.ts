// packages/core/contracts/version.ts — số phiên bản của HỢP ĐỒNG, không phải của app.
//
// Vì sao file này tồn tại (DEBT #13, `03-api.md` luật endpoint 6): `packages/core/contracts`
// là ranh giới giữa HAI ĐỘI khác nhau — 2 dev lõi viết contract, vibe team viết UI đọc
// contract. Không có số phiên bản thì vibe team chỉ phát hiện hợp đồng gãy lúc chạy thật
// trước mặt giáo viên, không phải lúc build. Trước 31/07/2026 hằng số này nằm lạc trong
// `contracts/checkin.ts` (một router cụ thể), không ai đọc, không có changelog và không có
// cổng nào phát hiện contract đổi — tức là "có version" chỉ trên danh nghĩa.
//
// Ba lớp cưỡng chế, đặt đúng ba thời điểm khác nhau:
//   1. Lúc review/CI  — `node tools/contracts-lint.mjs` (bản chụp bề mặt hợp đồng ở cuối file này).
//   2. Lúc đọc        — `CHANGELOG.md` cạnh file này, khuôn Keep a Changelog.
//   3. Lúc chạy       — client gửi header `x-contracts-version`; server so với
//                       MIN_SUPPORTED_CONTRACTS_VERSION rồi trả PRECONDITION_FAILED nếu quá cũ.
//      Lớp 3 dùng lại được nguyên vẹn cho ngày lên CH Play/App Store: app cài trên máy phụ
//      huynh có thể cũ hàng tháng, khác hẳn PWA luôn tải bản mới (`03-api.md`).
import { z } from "zod";

/**
 * MỘT NGUỒN SỰ THẬT: phải luôn bằng field `version` của `packages/core/package.json`.
 * Không `import ... with { type: "json" }` vì file này bị nuốt bởi cả bundler của Next
 * lẫn `tsc` của package lõi, mỗi nơi một luật về import JSON; thay vào đó
 * `tools/contracts-lint.mjs` kiểm hai giá trị bằng nhau và CI chặn merge khi lệch.
 */
export const CONTRACTS_VERSION = "0.2.0";

/**
 * Phiên bản contract cũ nhất mà server còn phục vụ. Tăng số này = chủ động cắt các client
 * chưa cập nhật, nên chỉ tăng sau khi đã đi trọn expand–contract (thêm mới → chuyển dần →
 * gỡ cũ) và đã ghi mục `### Removed` trong CHANGELOG.
 */
export const MIN_SUPPORTED_CONTRACTS_VERSION = "0.1.0";

/** Tên header client dùng để khai phiên bản hợp đồng nó được build cùng. */
export const CONTRACTS_VERSION_HEADER = "x-contracts-version";

/** Output của procedure `meta.contracts` — để client tự kiểm trước khi vẽ màn hình. */
export const ContractsMetaOutput = z.object({
  version: z.string(),
  minSupported: z.string(),
});
export type ContractsMetaOutput = z.infer<typeof ContractsMetaOutput>;

export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

/** Trả null nếu chuỗi không phải semver `major.minor.patch` — không đoán, không vá tạm. */
export function parseSemver(value: string): Semver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** -1 nếu a < b, 0 nếu bằng, 1 nếu a > b. Ném lỗi khi một trong hai không phải semver. */
export function compareContractsVersions(a: string, b: string): -1 | 0 | 1 {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) throw new Error(`Phiên bản hợp đồng không hợp lệ: ${!va ? a : b}`);
  for (const key of ["major", "minor", "patch"] as const) {
    if (va[key] !== vb[key]) return va[key] < vb[key] ? -1 : 1;
  }
  return 0;
}

/**
 * Client có được phục vụ không?
 *
 * Quy ước — ba ca, chọn có chủ đích chứ không phải mặc định của thư viện:
 *  · Không gửi header  → CHO QUA. Toàn bộ client GĐ1 (PWA hiện tại, server component,
 *    test) chưa gắn header; bật cổng chặt ngay hôm nay là tự đánh sập app đang chạy.
 *    Khi client đã gắn header đại trà thì đổi ca này thành từ chối, kèm ADR.
 *  · Gửi chuỗi rác     → TỪ CHỐI. Sai rõ ràng thì phải kêu, im lặng là mất luôn tác dụng.
 *  · Cũ hơn min        → TỪ CHỐI (server trả PRECONDITION_FAILED, client tự bảo người dùng tải lại).
 *  · Mới hơn server    → CHO QUA. Client luôn do server phát ra nên ca này chỉ xảy ra giữa
 *    lúc deploy dở dang; chặn nó là tự tạo sự cố cho chính mình.
 */
export function isContractsVersionSupported(clientVersion: string | null | undefined): boolean {
  if (clientVersion === null || clientVersion === undefined || clientVersion.trim() === "") return true;
  if (!parseSemver(clientVersion)) return false;
  return compareContractsVersions(clientVersion, MIN_SUPPORTED_CONTRACTS_VERSION) >= 0;
}

// ---------------------------------------------------------------------------
// BẢN CHỤP BỀ MẶT HỢP ĐỒNG — do `node tools/contracts-lint.mjs --update` sinh ra.
// Đừng sửa tay. Đặt trong chú thích nên KHÔNG lọt vào bundle client (§4 không liên
// quan, nhưng không có lý do gì bắt trình duyệt tải danh sách field). Cổng CI so bản
// chụp này với mã nguồn: thêm field mà quên ghi CHANGELOG → fail; xoá field mà không
// tăng version → fail (expand–contract, `03-api.md` luật 6).
// <contracts-surface>
// {
//   "version": "0.2.0",
//   "schemas": {
//     "MiniAppBasket": [
//       "#enum#xanh",
//       "#enum#vang"
//     ],
//     "MiniAppRow": [
//       "appId",
//       "displayName",
//       "basket",
//       "enabled",
//       "allowedRoles",
//       "allowedEventTypes",
//       "origin",
//       "iframeUrl",
//       "iconImageUrl",
//       "intro",
//       "owner",
//       "reviewDueOn",
//       "overdueDays",
//       "webhookSecretEnv",
//       "daCapSecret",
//       "updatedAt"
//     ],
//     "CreateMiniAppInput": [
//       "appId",
//       "displayName",
//       "basket",
//       "owner",
//       "reviewDueOn",
//       "allowedRoles",
//       "allowedEventTypes",
//       "origin",
//       "iframeUrl",
//       "iconImageUrl",
//       "intro",
//       "webhookSecretEnv"
//     ],
//     "UpdateMiniAppInput": [
//       "appId"
//     ],
//     "MiniAppId": [
//       "#expr#z .string() .regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/, \"Mã app chỉ gồm chữ thường, số và dấu gạch ngang\")"
//     ],
//     "MiniAppOrigin": [
//       "#expr#z .string() .regex(/^https:\\/\\/[a-z0-9.-]+(:\\d{1,5})?$/, \"Origin phải dạng https://ten-mien — không kèm đường dẫn, không dấu / cuối\")"
//     ],
//     "MiniAppRole": [
//       "#enum#student",
//       "#enum#guardian",
//       "#enum#teacher",
//       "#enum#homeroom",
//       "#enum#counselor",
//       "#enum#principal",
//       "#enum#board",
//       "#enum#admin"
//     ],
//     "ListMiniAppsOutput": [
//       "apps",
//       "soAppCanRaLai"
//     ],
//     "SetMiniAppEnabledInput": [
//       "appId",
//       "enabled"
//     ],
//     "MiniAppMutationOutput": [
//       "app"
//     ],
//     "HubRole": [
//       "#enum#student",
//       "#enum#guardian",
//       "#enum#teacher",
//       "#enum#homeroom",
//       "#enum#counselor",
//       "#enum#principal",
//       "#enum#board",
//       "#enum#admin"
//     ],
//     "MiniAppTile": [
//       "key",
//       "label",
//       "icon",
//       "iconImageUrl",
//       "href",
//       "available"
//     ],
//     "MiniAppsOutput": [
//       "#expr#z.array(MiniAppTile)"
//     ],
//     "SessionMeOutput": [
//       "displayName",
//       "roles"
//     ],
//     "SessionUser": [
//       "userId",
//       "authUid",
//       "displayName",
//       "email",
//       "roles",
//       "studentId",
//       "homeroomClassId"
//     ],
//     "OpenHelpRequest": [
//       "helpRequestId",
//       "requestedOn",
//       "urgency"
//     ],
//     "FlagCadence": [
//       "#enum#tuc_thi",
//       "#enum#quet_dem"
//     ],
//     "FlagDetail": [
//       "cadence",
//       "openHelpRequests",
//       "recentlyHandled"
//     ],
//     "FlagSummary": [
//       "flagId",
//       "studentId",
//       "studentName",
//       "className",
//       "ruleCode",
//       "asOfDate",
//       "detail",
//       "caseId",
//       "caseStatus"
//     ],
//     "PendingLateCheckin": [
//       "checkinId",
//       "studentId",
//       "studentName",
//       "occurredOn"
//     ],
//     "MoodVisibility": [
//       "readable",
//       "reason"
//     ],
//     "RecentAction": [
//       "studentName",
//       "action",
//       "occurredAt"
//     ],
//     "GetDashboardInput": [
//       "classId"
//     ],
//     "SkippedRule": [
//       "ruleCode",
//       "lyDo"
//     ],
//     "ScanState": [
//       "#enum#ok",
//       "#enum#dang_chay",
//       "#enum#chua_chay",
//       "#enum#that_bai",
//       "#enum#treo",
//       "#enum#qua_han",
//       "#enum#tat",
//       "#enum#chua_khai",
//       "#enum#khong_doc_duoc"
//     ],
//     "ScanHealth": [
//       "jobName",
//       "state",
//       "needsAttention",
//       "lastSuccessAt",
//       "lastFinishedAt",
//       "expectedEveryHours",
//       "graceHours",
//       "rulesSkipped",
//       "degradedSources"
//     ],
//     "GetDashboardOutput": [
//       "classId",
//       "className",
//       "asOfDate",
//       "lastScanAt",
//       "scanHealth",
//       "staleSources",
//       "totals",
//       "totals.checkinCount",
//       "totals.pendingLateCount",
//       "totals.absentCount",
//       "totals.totalStudents",
//       "totals.openCareCases",
//       "totals.notCheckedInCount",
//       "moodVisibility",
//       "priorityFlags",
//       "pendingLateCheckins",
//       "recentActions"
//     ],
//     "AcknowledgeLateInput": [
//       "checkinIds"
//     ],
//     "LogInterventionInput": [
//       "caseId",
//       "action",
//       "note",
//       "clientMutationId"
//     ],
//     "LogInterventionOutput": [
//       "caseId",
//       "interventionId",
//       "deduplicated"
//     ],
//     "AcknowledgeHelpRequestInput": [
//       "studentId",
//       "helpRequestIds"
//     ],
//     "AcknowledgeHelpRequestOutput": [
//       "justHandled",
//       "alreadyHandled",
//       "notFound",
//       "remainingOpen",
//       "handledByMe",
//       "handledByName",
//       "handledAt"
//     ],
//     "CloseCaseInput": [
//       "caseId",
//       "resolution"
//     ],
//     "CloseCaseOutput": [
//       "caseId",
//       "closed",
//       "alreadyClosed"
//     ],
//     "AttendanceStatus": [
//       "#enum#present",
//       "#enum#late",
//       "#enum#absent",
//       "#enum#excused",
//       "#enum#queued_late"
//     ],
//     "TeacherAttendanceStatus": [
//       "#enum#present",
//       "#enum#late",
//       "#enum#absent",
//       "#enum#excused"
//     ],
//     "HomeroomClass": [
//       "classId",
//       "classCode",
//       "studentCount"
//     ],
//     "GetMyClassesOutput": [
//       "classes"
//     ],
//     "GetClassRosterInput": [
//       "classId",
//       "onDate"
//     ],
//     "ClassRosterEntry": [
//       "studentId",
//       "studentCode",
//       "fullName",
//       "status",
//       "checkedInAt",
//       "source",
//       "hasOpenCase",
//       "helpPending"
//     ],
//     "GetClassRosterOutput": [
//       "classId",
//       "className",
//       "asOfDate",
//       "students"
//     ],
//     "MarkAttendanceInput": [
//       "classId",
//       "occurredOn",
//       "entries",
//       "entries.studentId",
//       "entries.status"
//     ],
//     "MarkAttendanceOutput": [
//       "applied",
//       "skipped"
//     ],
//     "ReportApprovalStatus": [
//       "#enum#pending",
//       "#enum#approved",
//       "#enum#rejected"
//     ],
//     "ListReportApprovalsInput": [
//       "classId",
//       "weekStart"
//     ],
//     "ReportPreview": [
//       "headline",
//       "glow",
//       "grow",
//       "streakDays",
//       "glowIncomplete"
//     ],
//     "ReportApprovalRow": [
//       "studentId",
//       "studentCode",
//       "fullName",
//       "status",
//       "reviewedAt",
//       "note",
//       "checkinDays",
//       "happyDays",
//       "preview"
//     ],
//     "ListReportApprovalsOutput": [
//       "classId",
//       "className",
//       "weekStart",
//       "rows"
//     ],
//     "ApproveReportInput": [
//       "studentId",
//       "weekStart",
//       "decision",
//       "note"
//     ],
//     "ApproveReportOutput": [
//       "studentId",
//       "weekStart",
//       "status",
//       "note",
//       "reviewedAt",
//       "alreadyRecorded"
//     ],
//     "ListClassInterventionsInput": [
//       "classId",
//       "limit"
//     ],
//     "ClassInterventionRow": [
//       "interventionId",
//       "studentId",
//       "studentName",
//       "action",
//       "note",
//       "occurredAt",
//       "actorName",
//       "caseStatus"
//     ],
//     "ListClassInterventionsOutput": [
//       "classId",
//       "className",
//       "rows"
//     ],
//     "GetStudentDetailInput": [
//       "studentId",
//       "classId",
//       "days"
//     ],
//     "StudentCheckinDay": [
//       "occurredOn",
//       "status",
//       "checkedInAt",
//       "source"
//     ],
//     "StudentHelpRequest": [
//       "helpRequestId",
//       "requestedOn",
//       "requestedAt",
//       "topic",
//       "urgency",
//       "note",
//       "handledAt"
//     ],
//     "StudentCareCase": [
//       "caseId",
//       "status",
//       "openedAt",
//       "closedAt"
//     ],
//     "StudentReportApproval": [
//       "weekStart",
//       "status",
//       "reviewedAt",
//       "note"
//     ],
//     "GetStudentDetailOutput": [
//       "classId",
//       "className",
//       "asOfDate",
//       "window",
//       "window.days",
//       "window.fromDate",
//       "window.toDate",
//       "student",
//       "student.studentId",
//       "student.studentCode",
//       "student.fullName",
//       "checkins",
//       "helpRequests",
//       "careCases",
//       "interventions",
//       "reportApprovals"
//     ],
//     "ClusterSchool": [
//       "schoolId",
//       "schoolCode",
//       "schoolName"
//     ],
//     "ClusterCaseRow": [
//       "studentId",
//       "studentCode",
//       "fullName",
//       "className",
//       "schoolName",
//       "caseId",
//       "caseStatus",
//       "openedAt",
//       "helpPending",
//       "helpRequestedOn",
//       "helpTopic",
//       "helpUrgency",
//       "interventionCount",
//       "lastInterventionAt",
//       "daysSinceLastAction",
//       "overQuietWindow"
//     ],
//     "ListClusterCasesInput": [
//       "schoolId",
//       "includeClosed",
//       "limit"
//     ],
//     "ListClusterCasesOutput": [
//       "asOfDate",
//       "scope",
//       "scope.schools",
//       "totals",
//       "totals.openCases",
//       "totals.pendingHelp",
//       "totals.overQuietWindow",
//       "urgentWindowDays",
//       "quietDays",
//       "rows"
//     ],
//     "ClusterHelpSignal": [
//       "helpRequestId",
//       "requestedOn",
//       "requestedAt",
//       "topic",
//       "urgency",
//       "handledAt"
//     ],
//     "CounselorNote": [
//       "noteId",
//       "body",
//       "createdAt",
//       "authorName",
//       "mine"
//     ],
//     "GetClusterCaseDetailInput": [
//       "studentId",
//       "days"
//     ],
//     "GetClusterCaseDetailOutput": [
//       "asOfDate",
//       "window",
//       "window.days",
//       "window.fromDate",
//       "window.toDate",
//       "student",
//       "student.studentId",
//       "student.studentCode",
//       "student.fullName",
//       "student.className",
//       "student.schoolName",
//       "openCase",
//       "cases",
//       "interventions",
//       "counselorNotes",
//       "helpSignals",
//       "notesWritable"
//     ],
//     "ATTENDANCE_STATUS_LABEL": [
//       "present",
//       "late",
//       "absent",
//       "excused",
//       "queued_late"
//     ],
//     "ATTENDANCE_STATUS_ICON": [
//       "present",
//       "late",
//       "absent",
//       "excused",
//       "queued_late"
//     ],
//     "ATTENDANCE_UNKNOWN_LABEL": [
//       "#expr#\"Chưa điểm danh\""
//     ],
//     "ATTENDANCE_UNKNOWN_ICON": [
//       "#expr#\"remove\""
//     ],
//     "ARRIVAL_BAND_UNAVAILABLE_NOTE": [
//       "#expr#\"Bảng này hiện giờ em bấm nút, không hiện nhãn “đi sớm”. Hệ chỉ ghi được giờ máy chủ nhận lượt bấm, chưa ghi giờ em vào cổng, nên không nói chắc được em đến sớm hay đúng giờ.\""
//     ],
//     "MoodValue": [
//       "#expr#z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])"
//     ],
//     "SubmitMoodInput": [
//       "mood",
//       "wantsHelp"
//     ],
//     "SubmitMoodOutput": [
//       "checkinId",
//       "status",
//       "streakDays",
//       "moodSaved",
//       "moodBlockedReason"
//     ],
//     "QueuedCheckinInput": [
//       "#extends#SubmitMoodInput",
//       "clientOccurredAt",
//       "clientId"
//     ],
//     "HelpRequestTopic": [
//       "#enum#lop",
//       "#enum#nha",
//       "#enum#hoc",
//       "#enum#suc_khoe",
//       "#enum#khac"
//     ],
//     "HelpRequestUrgency": [
//       "#enum#urgent",
//       "#enum#today",
//       "#enum#this_week"
//     ],
//     "RequestHelpInput": [
//       "topic",
//       "urgency",
//       "note"
//     ],
//     "MOOD_LABEL": [
//       "1",
//       "2",
//       "3",
//       "4"
//     ],
//     "HELP_REQUEST_TOPIC_LABEL": [
//       "lop",
//       "nha",
//       "hoc",
//       "suc_khoe",
//       "khac"
//     ],
//     "HELP_REQUEST_URGENCY_LABEL": [
//       "urgent",
//       "today",
//       "this_week"
//     ],
//     "ConsentDecision": [
//       "#enum#granted",
//       "#enum#declined",
//       "#enum#withdrawn"
//     ],
//     "StudentAccountStatus": [
//       "#enum#no_account",
//       "#enum#pending",
//       "#enum#active",
//       "#enum#disabled"
//     ],
//     "TermsVersionOutput": [
//       "id",
//       "version",
//       "title",
//       "bodyMd",
//       "contentHash",
//       "requiresReconsent",
//       "publishedAt"
//     ],
//     "ConsentChildStatus": [
//       "studentId",
//       "studentCode",
//       "studentName",
//       "decision",
//       "decidedAt",
//       "termsVersion",
//       "requiredVersion",
//       "needsAction",
//       "accountStatus",
//       "moodEnabled"
//     ],
//     "ConsentGateOutput": [
//       "terms",
//       "children",
//       "needsAction"
//     ],
//     "RecordConsentInput": [
//       "studentIds",
//       "termsVersionId",
//       "decision",
//       "userAgent"
//     ],
//     "RecordConsentResult": [
//       "studentId",
//       "consentId",
//       "created",
//       "accountStatus",
//       "moodEnabled"
//     ],
//     "RecordConsentOutput": [
//       "results",
//       "needsAction"
//     ],
//     "IsoDateString": [
//       "#expr#z .string() .regex(/^\\d{4}-\\d{2}-\\d{2}$/, \"Ngày phải có dạng YYYY-MM-DD\") .refine(isRealCalendarDate, \"Ngày không có thật trên lịch\")"
//     ],
//     "GetGrowthReportInput": [
//       "studentId",
//       "weekStart"
//     ],
//     "GetReportForWeekInput": [
//       "weekStart"
//     ],
//     "GetGrowthReportOutput": [
//       "studentName",
//       "className",
//       "weekLabel",
//       "headline",
//       "glow",
//       "grow",
//       "streakDays",
//       "shareTokenExpiresAt",
//       "checkinDaysThisWeek",
//       "happyDaysThisWeek"
//     ],
//     "GetWeeklyReportOutput": [
//       "studentId",
//       "weekStart",
//       "report"
//     ],
//     "GuardianContact": [
//       "full_name",
//       "relation"
//     ],
//     "GuardianListOutput": [
//       "#expr#z.array(GuardianContact)"
//     ],
//     "GlowItem": [
//       "title",
//       "detail",
//       "accentColor"
//     ],
//     "GrowItem": [
//       "title",
//       "detail"
//     ],
//     "ReportWeekStart": [
//       "#expr#IsoDateString.refine(withinReportableRange, REPORT_WEEK_RANGE_MESSAGE)"
//     ],
//     "parseSemver": [
//       "#function#"
//     ],
//     "compareContractsVersions": [
//       "#function#"
//     ],
//     "isContractsVersionSupported": [
//       "#function#"
//     ],
//     "ContractsMetaOutput": [
//       "version",
//       "minSupported"
//     ],
//     "Semver": [
//       "#type#"
//     ],
//     "CONTRACTS_VERSION": [
//       "#expr#\"0.2.0\""
//     ],
//     "MIN_SUPPORTED_CONTRACTS_VERSION": [
//       "#expr#\"0.1.0\""
//     ],
//     "CONTRACTS_VERSION_HEADER": [
//       "#expr#\"x-contracts-version\""
//     ]
//   }
// }
// </contracts-surface>
