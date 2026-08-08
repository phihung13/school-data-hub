// apps/hub/server/routers/care.ts — router `care`, GĐ1 rút gọn (buồng lái P4).
//
// ── 01/08/2026 · BA QUYẾT ĐỊNH CỦA CHỦ ĐẦU TƯ, phần tầng màn hình ────────────
//
// [QĐ-1] GVCN KHÔNG còn đọc nhật ký cảm xúc từng ngày. Tầng dữ liệu đã cắt (0044 —
//   `core.can_read_mood()` = `is_me ∨ in_my_cluster`); tầng này cắt nốt đường còn lại:
//   không câu SQL nào trong file này còn chọn cột `mood`, và không câu nào còn đọc
//   `attendance.checkins_care`. Cô VẪN nhận cờ (`care.flags`) và VẪN nhận tín hiệu "cần
//   gặp thầy cô" — biết CÓ CHUYỆN mà không đọc được CHUYỆN GÌ.
//
//   Ba chỗ từng đọc `checkins_care` cho CẢ cột điểm danh chứ không riêng mood, và cả ba
//   sẽ hỏng câm nếu để nguyên (view lọc theo DÒNG, không theo CỘT): `getClassRoster`,
//   `getStudentDetail`, `listReportApprovals`. Đo cùng câu LEFT JOIN dưới phiên Cô Lan:
//   nguồn `checkins_care` trả 5/5 em `status = NULL`, nguồn `attendance.checkins` trả
//   5/5 em `status = present`. Không đổi lại thì bảng lớp trắng toàn NULL và màn hình vẽ
//   NULL thành "Chưa điểm danh" — tức là hệ tự khai lớp chưa ai điểm danh.
//
// [QĐ-2] Em bấm nút cần gặp thì báo cô NGAY. E_URGENT vì thế vẫn được TÍNH THẲNG từ
//   `attendance.help_requests` trong lượt gọi, không chờ `care.run_flag_engine`. Còn
//   E_MOOD nay đọc từ `care.flags` (nợ #32, chốt chặn (a)–(d)) nên nó đi theo NHỊP QUÉT
//   ĐÊM. Hai nhịp trong cùng một danh sách, nên mỗi cờ mang `detail.cadence` và màn hình
//   phải nói ra — người đọc một bảng gộp hai nhịp mà không biết là đang bị chính bảng đó
//   đánh lừa.
//
// [QĐ-3] Bảng điểm danh hiện đủ trạng thái. Xem `ARRIVAL_BAND_UNAVAILABLE_NOTE` trong
//   contracts: bốn trạng thái có chỗ chứa thật, "đi sớm" thì KHÔNG — và chỗ này chọn nói
//   thẳng thay vì bịa một giá trị thứ sáu mà dữ liệu không đỡ nổi.
//
// Viết lại 31/07/2026. Sáu thứ đã sai, ghi ra để lần sau không ai "sửa lại như cũ":
//
//  1. LEO QUYỀN. `acknowledgeLate` là protectedProcedure — chỉ hỏi "đã đăng nhập
//     chưa". Học sinh gọi thẳng procedure này với id dòng queued_late của CHÍNH MÌNH
//     thì tự duyệt được mình thành 'present' và ghi tên mình vào confirmed_by (tái
//     hiện được trên máy dev, xem đầu migration 0025). Nay: procedure theo vai +
//     migration 0025 khoá ở tầng DB. Hai tầng, không tầng nào tin tầng kia tử tế.
//  2. §6 BỊ VI PHẠM. Ba con số viết chết trong câu SQL (mood xấu là từ mức 2 trở
//     xuống · cửa sổ 14 ngày · bật cờ từ ngày thứ 3) trong khi bảng care.thresholds
//     khai E_MOOD = 5 ngày. Nay mọi con số vào câu SQL đều là tham số đọc từ bảng
//     (care-thresholds.ts), kể cả "mood mức nào thì tính là xấu".
//  3. TÍN HIỆU KHẨN BỊ NUỐT. Truy vấn cũ lấy attendance.checkins làm gốc rồi
//     LEFT JOIN help_requests theo `h.requested_on = c.occurred_on`: em nghỉ ốm hoặc
//     quên check-in sáng rồi chiều bấm "cần gặp thầy cô" thì KHÔNG có hàng nào để
//     nối — tín hiệu rơi vào hư không. Nay gốc là DANH SÁCH LỚP (core.enrollments),
//     hai nguồn tín hiệu nối vào độc lập.
//  4. §9. `logIntervention` là INSERT trần trên bảng không có khoá duy nhất nào —
//     double-tap sinh hai dòng, mà mỗi dòng RESET đồng hồ leo thang 7 ngày.
//  5. CỜ KHÔNG TẮT ĐƯỢC. 03-api.md đòi acknowledgeFlag + closeCase, cả hai chưa
//     tồn tại; help_requests.handled_at chưa đường ghi nào chạm. Buồng lái đầy cờ
//     chết thì GVCN học cách phớt lờ nó — hỏng nặng hơn là không có cờ.
//  6. lastScanAt lấy `max(finished_at)` của MỌI job. Job dọn mood chạy muộn hơn là
//     buồng lái báo "quét đêm qua" bằng giờ của job dọn dẹp.
//
// Sửa 01/08/2026 (gói "debt-32-buong-lai-doc-care-flags"), hai việc — và MỘT VIỆC CỐ Ý
// KHÔNG LÀM:
//
//  A. TRẠNG THÁI BỘ QUÉT ĐI RA MÀN HÌNH, MỌI LÚC. Bản cũ trả đúng một `lastScanAt`, và
//     màn hình chỉ vẽ nó ở NHÁNH BẢNG TRỐNG (gvcn-dashboard.tsx cũ, dòng 470). Có một cờ
//     là mốc quét biến mất — tức đúng lúc GVCN đang đọc số thì màn hình thôi nói số đó
//     cũ hay mới. Nay `getDashboard` trả `scanHealth` đọc từ `ops.v_job_health` (0041) và
//     buồng lái có một dải cố định ở đầu trang. Xem `readScanHealth`.
//
//  B. "LỚP MÌNH ĐANG ỔN" THÔI ĐƯỢC NÓI KHI CÒN HỒ SƠ MỞ. Đo trên hub_dev 01/08/2026:
//     lớp 6A2 có `open_care_cases = 1` (em Trần Thị Bình, tier 2) và 0 cờ hôm nay, nên
//     buồng lái in "Hết việc rồi — lớp mình đang ổn!" ngay cạnh ô "1 hồ sơ chăm sóc đang
//     mở". Hai con số cùng màn nói ngược nhau. Điều kiện in câu đó nay có thêm vế
//     `openCareCases === 0` (xem components/gvcn/scan-status.ts).
//
//  C. CHƯA CHUYỂN sang đọc `care.flags` — nợ #32 CÒN NGUYÊN, và lý do nằm ở số đo, không
//     ở thiếu thời gian. Chạy `care.run_flag_engine(current_date,'live')` rồi FULL OUTER
//     JOIN hai tập (học sinh × mã luật). Đo ba lượt trong ngày (trước reseed · sau reseed ·
//     sau reseed lần hai): 7/10 · 7/11 · 6/11 dòng trùng. CON SỐ ĐỔI THEO SEED VÀ THEO THỜI
//     ĐIỂM CHẠY ENGINE, đừng dùng nó làm mốc — thứ KHÔNG đổi mới là kết luận:
//       · 0 dòng chỉ có ở buồng lái, cả ba lượt;
//       · mọi dòng lệch đều là A_ATTENDANCE (bốn em: Trần Thị Bình 6A2, Lê Gia Bảo 6A3,
//         Phạm Gia Bảo 6A4, Hoàng Gia Bảo 6A5) — cộng thêm E_URGENT của Nguyễn Văn Minh ở
//         lượt thứ ba, mà chính nó là chốt chặn (b) hiện ra sống: engine chạy trước, dữ
//         liệu help_request đổi sau, nên care.flags còn giữ cờ mà buồng lái đã thôi tính.
//     Phần E_MOOD/E_URGENT (khi engine và dữ liệu cùng nhịp) khớp
//     tuyệt đối — nhưng buồng lái hôm nay chỉ sinh được hai mã đó (dòng `ruleCode:
//     r.help_requested ? "E_URGENT" : "E_MOOD"` bên dưới), nên chuyển bên đọc là làm GVCN
//     lần đầu thấy cờ chuyên cần và hành vi. Đó là MỞ RỘNG PHẠM VI, phải có người quyết,
//     không phải một lần đổi câu SQL. Ba chỗ chặn khác đã ghi đủ trong DEBT.md #32.
//
// ── 06/08/2026 · ADR-029, khối "gửi muộn" của buồng lái ──────────────────────
//
// Trước hôm nay khối đó có ĐÚNG một nút: "Xác nhận cả N". Không giờ gửi, không chọn từng
// em, không chỗ ghi vì sao — và đúng một kết luận khả dĩ là `present`. Cô nhìn thấy chỗ
// ngồi trống mà không có đường nào ghi lại điều đó ngoài việc mở CSDL sửa tay.
//
// Ba thay đổi ở file này, và chúng phải đi cùng nhau:
//   1. `getDashboard` trả `occurredAtTime` — giờ em bấm, đọc từ `attendance.checkins.
//      occurred_at` (cột có từ 0004, chưa màn nào đọc). Đó là dữ kiện để quyết.
//   2. `decideLateCheckins` — ba kết luận, lý do bắt buộc khi khác `present`, mỗi lượt ghi
//      để lại một dòng `attendance.late_decisions`. Gọi hàm `attendance.
//      decide_late_checkins` (0053), KHÔNG tự viết UPDATE.
//   3. `acknowledgeLate` thành lối tắt của (2) với `decision: 'present'` — deprecated,
//      giữ cho client cũ, nhưng nay cũng để lại vết như mọi đường ghi khác.
//
// ADR-007 KHÔNG bị lật: máy vẫn không được tự suy ra vắng từ một lần gửi muộn. Thứ mở ra
// là quyền của một CON NGƯỜI biết chuyện gì đã xảy ra trong lớp mình — và mở quyền thì mở
// kèm sổ.
//
// ── 06/08/2026 · `decideReports`, cùng hình dạng cho màn Duyệt báo cáo ───────
//
// Chủ đầu tư cùng ngày: "báo cáo thì cũng có thể gửi hàng loạt, hoặc sửa, hoặc trả lại gì
// đó hàng loạt". `decideReports` nhận mảng `studentIds` và trả `{updated, skipped}` — đúng
// hình dạng `decideLateCheckins`, cố ý, vì đó là cùng một thao tác của cùng một người.
//
// ── 06/08/2026 · ADR-031, đường SỬA một quyết định đã ký ────────────────────
//
// Bản đầu của `decideReports` dừng ở "chỉ chạm dòng chưa ai quyết" và BÁO LẠI thay vì tự
// mở đường sửa, vì đo được rằng tầng dữ liệu không có chỗ ghi vết: sổ duyệt có
// `unique (student_id, week_start)` nên một lượt đè XOÁ cả bốn dữ kiện của chữ ký trước,
// còn `ops.audit_log` thì vai `authenticated` không có quyền ghi (0024 khai thẳng).
//
// ADR-031 (chủ đầu tư duyệt cùng ngày) trả lời bằng `0054`: bảng `report.report_decisions`
// sao khuôn `attendance.late_decisions`, và hàm `report.decide_reports(...)` invoker làm
// upsert + ghi sổ trong MỘT câu lệnh. Từ đây router KHÔNG còn câu `insert into
// report.growth_report_approvals` nào của riêng nó ở đường hàng loạt — một đường ghi bỏ
// qua hàm là một đường ghi không để lại vết.
import { TRPCError } from "@trpc/server";
import {
  AcknowledgeHelpRequestInput,
  AcknowledgeHelpRequestOutput,
  AcknowledgeLateInput,
  ApproveReportInput,
  ApproveReportOutput,
  CloseCaseInput,
  CloseCaseOutput,
  DecideLateCheckinsInput,
  DecideLateCheckinsOutput,
  DecideReportsInput,
  DecideReportsOutput,
  GetClassRosterInput,
  GetClassRosterOutput,
  GetClusterCaseDetailInput,
  GetClusterCaseDetailOutput,
  GetDashboardInput,
  GetDashboardOutput,
  GetMyClassesOutput,
  GetStudentDetailInput,
  GetStudentDetailOutput,
  ListClassInterventionsInput,
  ListClassInterventionsOutput,
  ListClusterCasesInput,
  ListClusterCasesOutput,
  ListReportApprovalsInput,
  ListReportApprovalsOutput,
  LogInterventionInput,
  LogInterventionOutput,
  MarkAttendanceInput,
  MarkAttendanceOutput,
  ScanState,
} from "@hub/core/contracts";
import type {
  AttendanceStatus,
  HelpRequestTopic,
  HelpRequestUrgency,
  ReportApprovalStatus,
  ScanHealth,
} from "@hub/core/contracts";
import type { PoolClient } from "@hub/core/db";
import { mondayOf, toLocalIsoDate } from "@/lib/date";
import { EMOTION_FALLBACK_RULE, URGENT_FALLBACK, readCareRules } from "../care-thresholds";
import { homeroomProcedure, roleProcedure, router } from "../trpc";

/**
 * Ai được chạm hồ sơ chăm sóc: GVCN của lớp, hoặc tâm lý cụm — đúng tập hợp mà
 * `core.can_see_care()` (0009) đã định nghĩa ở tầng DB. KHÔNG dùng homeroomProcedure
 * cho nhóm này: tâm lý cụm không chủ nhiệm lớp nào, siết theo GVCN là khoá luôn
 * người có nghề nhất trong hệ chăm sóc.
 *
 * LUẬT ĐI KÈM (31/07/2026 — gói "rls-ghi-chu-tu-van"): mọi procedure mang procedure
 * này phải có ÍT NHẤT MỘT đường ĐỌC cũng mang nó. Trước hôm nay ba mutation
 * (acknowledgeHelpRequest · logIntervention · closeCase) mở cho `counselor`, trong khi
 * MỌI query của router đều là `homeroomProcedure` — nên cô Mai (tâm lý cụm) tắt được
 * cờ khẩn và ĐÓNG được hồ sơ chăm sóc của một đứa trẻ mà không có một đường nào nhìn
 * thấy hồ sơ đó trước khi tắt. Quyền ghi mà không có quyền đọc không phải "chặt hơn":
 * đó là bắt người ta quyết định trong bóng tối, và với hồ sơ chăm sóc thì quyết định
 * mù là quyết định sai. `listClassInterventions` nay cũng mang procedure này.
 */
const careStaffProcedure = roleProcedure("homeroom", "counselor");

/**
 * Procedure của RIÊNG tâm lý cụm — hai màn `/tam-ly` (gói "man-hinh-tam-ly-cum").
 *
 * Vì sao KHÔNG dùng `careStaffProcedure` cho hai màn đó: phạm vi của chúng là CỤM (tập
 * cơ sở ghi trong vai `counselor` của chính người gọi), không phải "lớp chủ nhiệm". Mở
 * cho `homeroom` thì một GVCN không hề có vai counselor sẽ nhận về `scope.schools = []`
 * và một danh sách rỗng — rỗng vì không có phạm vi, hiển thị y hệt rỗng vì cụm đang yên.
 * Đó đúng là kiểu "im lặng bị đọc thành kết luận" mà repo này đã vấp bốn lần. Một GVCN
 * kiêm tâm lý cụm vẫn vào được, vì lúc đó vai `counselor` có thật trong `v_my_scopes`.
 */
const counselorProcedure = roleProcedure("counselor");

/** Lỗi RLS chặn ghi (42501) → câu tiếng Việt cho người dùng, không lộ tên bảng/policy. */
function asScopeError(err: unknown): never {
  if ((err as { code?: string })?.code === "42501") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Em này không thuộc phạm vi chăm sóc của thầy cô.",
    });
  }
  throw err;
}

/**
 * Trả về care_cases.id đang mở cho một cờ.
 *
 * `input.caseId` có thể là id thật, hoặc flagId ghép tạm "studentId:asOfDate" (flag
 * engine chưa chạy — xem getDashboard). Bản cũ làm select-rồi-insert, mà 0005 có
 * `care_cases_one_open_idx unique (student_id) where status='open'`: hai request song
 * song → 23505 → người dùng nhận lỗi 500. Nay insert trước với ON CONFLICT DO NOTHING
 * rồi mới đọc lại — không nhánh nào ném khi có đua.
 *
 * Cố tình KHÔNG dùng `do update set student_id = excluded.student_id`: nhánh đó đòi
 * quyền UPDATE trên care.care_cases cho mọi người ghi can thiệp, mà cột owner_id
 * ("gán MỘT LẦN lúc tạo", 0005:41) thì không nên nằm trong tầm với của một câu upsert.
 */
async function resolveOpenCase(client: PoolClient, rawCaseId: string): Promise<string> {
  const isRealCaseId = /^[0-9a-f-]{36}$/i.test(rawCaseId) && !rawCaseId.includes(":");
  if (isRealCaseId) return rawCaseId;

  const studentId = rawCaseId.split(":")[0] ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Mã hồ sơ không hợp lệ." });
  }

  const created = await client
    .query<{ id: string }>(
      `insert into care.care_cases (student_id, owner_id)
       values ($1, core.current_user_id())
       on conflict do nothing
       returning id`,
      [studentId],
    )
    .catch(asScopeError);
  if (created.rows[0]) return created.rows[0].id;

  const existing = await client.query<{ id: string }>(
    "select id from care.care_cases where student_id = $1 and status = 'open'",
    [studentId],
  );
  const caseId = existing.rows[0]?.id;
  if (!caseId) {
    // Không tạo được mà cũng không đọc được: gần như chắc chắn là RLS chặn (em ngoài
    // phạm vi chăm sóc) chứ không phải lỗi máy — trả FORBIDDEN thay vì 500.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Em này không thuộc phạm vi chăm sóc của thầy cô.",
    });
  }
  return caseId;
}

/**
 * Nắn `classId` do client gửi về đúng một lớp mình CHỦ NHIỆM.
 *
 * Vì sao không tin thẳng `input.classId`: `homeroomProcedure` chỉ trả lời "người này có
 * chủ nhiệm lớp nào đó không", không trả lời "có phải lớp NÀY không". Thiếu bước đối
 * chiếu ở đây thì một GVCN đổi một tham số trong request là đọc/ghi được lớp của đồng
 * nghiệp — RLS vẫn chặn phần lớn, nhưng dựa vào một tầng duy nhất là cách lỗ hổng sinh ra
 * (xem 0025). Không truyền gì → lớp đầu tiên, đúng luồng người chỉ chủ nhiệm một lớp.
 */
function requireMyClass(myClassIds: string[], requested?: string): string {
  if (!requested) {
    const first = myClassIds[0];
    if (!first) throw new TRPCError({ code: "FORBIDDEN", message: "Mục này dành cho giáo viên chủ nhiệm." });
    return first;
  }
  if (!myClassIds.includes(requested)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Thầy cô không chủ nhiệm lớp này." });
  }
  return requested;
}

/**
 * Nắn `classId` cho một người CHĂM SÓC — GVCN hoặc tâm lý cụm. Bản mở rộng của
 * `requireMyClass` cho đúng một mục đích: mở đường ĐỌC cho tâm lý cụm, để vai đó thôi
 * ở trạng thái "ghi được mà không đọc được" (xem chú thích `careStaffProcedure`).
 *
 * Hai nhánh, và thứ tự giữa chúng có chủ ý:
 *
 *  1. CÓ LỚP CHỦ NHIỆM → giữ nguyên hành vi cũ từng nét: không truyền gì thì lấy lớp
 *     đầu tiên, truyền lớp của đồng nghiệp thì FORBIDDEN. Một người vừa chủ nhiệm vừa
 *     kiêm tâm lý cụm hỏi lớp NGOÀI danh sách chủ nhiệm sẽ rơi xuống nhánh 2 — đúng,
 *     vì lúc đó cô đang hỏi với tư cách tâm lý cụm.
 *  2. TÂM LÝ CỤM → KHÔNG có lớp mặc định. Cụm là nhiều lớp; đoán hộ một lớp rồi hiển
 *     thị như thể đó là "lớp của cô" là dạng sai trông như thật. Thiếu `classId` thì
 *     nói thẳng là thiếu, và lớp phải nằm trong cơ sở thuộc phạm vi `counselor` của
 *     chính người gọi — đối chiếu qua `core.v_my_scopes` (0015), không tin tham số.
 *
 * RLS ở tầng DB vẫn chặn độc lập (`core.can_see_care`): tầng này thêm vào một câu trả
 * lời RÕ RÀNG ("lớp này không thuộc cụm của thầy cô") thay vì một danh sách rỗng —
 * rỗng vì không có gì và rỗng vì không được phép là hai chuyện khác nhau.
 */
async function requireCareClass(
  client: PoolClient,
  scopes: { roleCode: string; classId: string | null }[],
  requested?: string,
): Promise<string> {
  const homeroomClassIds = scopes
    .filter((s) => s.roleCode === "homeroom")
    .map((s) => s.classId)
    .filter((id): id is string => id !== null);

  if (homeroomClassIds.length > 0 && (!requested || homeroomClassIds.includes(requested))) {
    return requireMyClass(homeroomClassIds, requested);
  }

  if (!scopes.some((s) => s.roleCode === "counselor")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Thầy cô không chủ nhiệm lớp này." });
  }

  if (!requested) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Chọn lớp cần xem — tâm lý cụm phụ trách nhiều lớp, hệ thống không tự đoán.",
    });
  }

  const { rows } = await client.query<{ ok: boolean }>(
    `select exists (
       select 1
         from core.classes c
         join core.v_my_scopes s on s.school_id = c.school_id
        where c.id = $1 and s.role_code = 'counselor'
     ) as ok`,
    [requested],
  );
  if (!rows[0]?.ok) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Lớp này không thuộc cụm của thầy cô." });
  }
  return requested;
}

/**
 * Cụm của người đang gọi = tập CƠ SỞ ghi trong vai `counselor` của chính họ, đọc lại từ
 * `core.schools` để có mã và tên thật.
 *
 * Đọc từ `core.v_my_scopes` (0015) chứ không từ JWT — cùng lý do đã ghi ở trpc.ts: token
 * sống 15 phút, một người vừa bị thu vai vẫn cầm token ghi đúng vai cũ, mà thứ quyết
 * định "được đọc hồ sơ chăm sóc của cơ sở nào" thì 15 phút là quá dài.
 *
 * Trả mảng RỖNG khi vai counselor chưa được gán cơ sở nào. Đó là một sự thật cần nói ra
 * (màn hình hiện "chưa được gán cơ sở nào"), không phải một lỗi để ném.
 */
async function readMyCluster(client: PoolClient): Promise<
  { schoolId: string; schoolCode: string; schoolName: string }[]
> {
  const { rows } = await client.query<{ id: string; code: string; name: string }>(
    `select s.id, s.code, s.name
       from core.schools s
       join core.v_my_scopes m on m.school_id = s.id
      where m.role_code = 'counselor'
      order by s.name`,
  );
  return rows.map((r) => ({ schoolId: r.id, schoolCode: r.code, schoolName: r.name }));
}

/**
 * Ngưỡng của TỪNG cơ sở trong cụm, đọc từ `care.thresholds` (§7 — không hằng số trong
 * code). Một cụm có thể gồm nhiều cơ sở khai ngưỡng khác nhau (0026 cho phép), nên trả
 * về theo cơ sở chứ không gộp thành một con số chung rồi áp cho tất cả.
 */
async function readClusterRules(
  client: PoolClient,
  schoolIds: string[],
): Promise<Map<string, { urgentWindowDays: number; quietDays: number }>> {
  const out = new Map<string, { urgentWindowDays: number; quietDays: number }>();
  for (const schoolId of schoolIds) {
    const rules = await readCareRules(client, schoolId);
    out.set(schoolId, {
      urgentWindowDays: rules.urgent.windowDays,
      quietDays: rules.emotion.quietDays,
    });
  }
  return out;
}

/**
 * Sức khoẻ bộ quét cờ đêm — MỘT câu trả lời cho câu hỏi "màn hình này đứng sau phép đo nào".
 *
 * Vì sao đọc `ops.v_job_health` chứ không đọc thẳng `ops.job_runs` như bản cũ (care.ts:539
 * trước 01/08/2026): câu cũ trả về đúng một dấu thời gian, `max(finished_at)` của các lần
 * `success`. Dấu thời gian đó KHÔNG phân biệt được năm tình huống mà buồng lái phải phân
 * biệt — chưa chạy lần nào · lần gần nhất hỏng · dòng `running` treo từ đêm qua · job bị
 * tắt · quá hạn theo nhịp đã khai. Cả năm đều cho ra `null` hoặc một giờ trông bình thường,
 * và cả năm đều hiện lên màn hình dưới dạng một bảng cờ trống. `0041` đã dựng sẵn view trả
 * lời đúng câu đó, kèm cột `needs_attention`; việc còn lại chỉ là ĐỌC nó.
 *
 * Quyền: `ops.v_job_health` + `ops.job_schedule` + `ops.job_runs` đều `grant select` cho
 * `authenticated` (0041 mục 7, policy `job_runs_read` qual = true) — đo lại 01/08/2026 bằng
 * `set role authenticated`, đọc được. Không cần migration mở quyền cho GVCN.
 *
 * BA nhánh trả về, và không nhánh nào được im lặng:
 *   1. Đọc được, có dòng  → trạng thái thật của view.
 *   2. Đọc được, KHÔNG có dòng → `chua_khai`. `ops.job_schedule` chưa biết job này tồn tại
 *      (database chạy `0041` mà thiếu `0039` là ca có thật — xem mệnh đề WHERE của 0041).
 *      Khác `chua_chay`: không có nhịp nào để mà quá hạn, nên không được báo "quá hạn".
 *   3. Câu đọc NÉM LỖI → `khong_doc_duoc`, và ghi log. Nuốt lỗi rồi trả `lastScanAt = null`
 *      là biến "mất quyền đọc sổ" thành "chưa quét lần nào" — hai chuyện khác hẳn nhau, mà
 *      cái sau còn làm màn hình đề nghị người dùng đi chạy lại một job vẫn đang chạy tốt.
 *      KHÔNG ném lên tRPC: mất dòng trạng thái không được kéo sập cả buồng lái của cô.
 */
async function readScanHealth(client: PoolClient): Promise<ScanHealth> {
  const trong: ScanHealth = {
    jobName: "flag_engine",
    state: "chua_khai",
    needsAttention: true,
    lastSuccessAt: null,
    lastFinishedAt: null,
    expectedEveryHours: null,
    graceHours: null,
    rulesSkipped: [],
    degradedSources: [],
  };

  try {
    const { rows } = await client.query<{
      state: string;
      needs_attention: boolean;
      last_success_at: string | null;
      last_finished_at: string | null;
      expected_every_hours: string | null;
      grace_hours: string | null;
      rules_skipped: unknown;
      degraded_sources: string[] | null;
    }>(
      // `to_jsonb(...) #>> '{}'` chứ KHÔNG phải `::text`, và đây không phải chuyện thẩm mỹ:
      // `::text` của Postgres cho ra "2026-08-01 08:38:25.009133+07" — có dấu cách thay vì
      // chữ T và múi giờ không có dấu hai chấm. Node parse được chuỗi đó, nhưng Safari trên
      // iPhone thì KHÔNG (nó bám sát ISO 8601), trả về Invalid Date. Mà GVCN là vai dùng
      // điện thoại nhiều nhất — mốc quét sẽ im lặng biến thành "không rõ" đúng trên thiết bị
      // đông người dùng nhất, và không ai thấy vì máy dev chạy Node. `to_jsonb` phát ra đúng
      // ISO 8601 ("2026-08-01T08:38:25.009133+07:00"), mọi trình duyệt đọc được.
      `select h.state,
              h.needs_attention,
              to_jsonb(h.last_success_at)  #>> '{}' as last_success_at,
              to_jsonb(h.last_finished_at) #>> '{}' as last_finished_at,
              (extract(epoch from h.expected_every) / 3600)::text as expected_every_hours,
              (extract(epoch from h.grace) / 3600)::text          as grace_hours,
              coalesce(h.last_metrics -> 'rules_skipped', '[]'::jsonb) as rules_skipped,
              h.degraded_sources
         from ops.v_job_health h
        where h.job_name = 'flag_engine'`,
    );

    const row = rows[0];
    if (!row) return trong;

    // `state` của view là một tập đóng bảy giá trị (0041 mục 7). Vẫn kiểm lại thay vì ép
    // kiểu: một bản view sau này thêm trạng thái thứ tám sẽ làm Zod ném ở `.parse()` cuối
    // procedure và giết cả buồng lái — ở đây thì nó thành `khong_doc_duoc`, tức "màn hình
    // không hiểu câu trả lời", đúng nghĩa hơn và không mất màn.
    const state = ScanState.safeParse(row.state);

    return {
      jobName: "flag_engine",
      state: state.success ? state.data : "khong_doc_duoc",
      needsAttention: row.needs_attention === true || !state.success,
      lastSuccessAt: row.last_success_at,
      lastFinishedAt: row.last_finished_at,
      expectedEveryHours: toFiniteNumber(row.expected_every_hours),
      graceHours: toFiniteNumber(row.grace_hours),
      rulesSkipped: parseSkippedRules(row.rules_skipped),
      degradedSources: row.degraded_sources ?? [],
    };
  } catch (err) {
    console.error("[care] Không đọc được ops.v_job_health cho flag_engine:", err);
    return { ...trong, state: "khong_doc_duoc" };
  }
}

function toFiniteNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * `metrics -> 'rules_skipped'` do `care.run_flag_engine` ghi: mảng `{rule_code, ly_do}`.
 * Đọc phòng thủ vì đây là JSON tự do trong một cột `jsonb` — một lần chạy cũ với khuôn khác
 * KHÔNG được làm sập buồng lái. Dòng đọc không nổi bị bỏ qua, phần đọc được vẫn hiện ra:
 * hiện 1 trong 2 luật bị bỏ qua vẫn tốt hơn hiện 0 và im lặng.
 */
function parseSkippedRules(raw: unknown): { ruleCode: string; lyDo: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { ruleCode: string; lyDo: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const ruleCode = typeof rec.rule_code === "string" ? rec.rule_code : null;
    if (!ruleCode) continue;
    out.push({ ruleCode, lyDo: typeof rec.ly_do === "string" ? rec.ly_do : "khong_ro" });
  }
  return out;
}

/** Mã lớp để hiện trên màn hình. Không có thì trả chuỗi rỗng — KHÔNG bịa mã lớp. */
async function readClassCode(client: PoolClient, classId: string): Promise<string> {
  const { rows } = await client.query<{ code: string }>(
    "select code from core.classes where id = $1",
    [classId],
  );
  return rows[0]?.code ?? "";
}

/**
 * Thứ Hai của tuần chứa `date` (mặc định: hôm nay). Máy chủ luôn tự nắn, không tin ngày
 * client gửi: `report.growth_report_approvals` khoá duy nhất theo (em, tuần), nên hai
 * người gửi hai ngày khác nhau trong cùng một tuần mà lọt thì §9 mất nghĩa.
 */
function mondayIso(date?: string): string {
  return toLocalIsoDate(mondayOf(date ? new Date(`${date}T00:00:00`) : new Date()));
}

/**
 * Dựng lại ĐÚNG nội dung phụ huynh sẽ đọc, từ cùng ba con số mà `buildGrowthReport`
 * (routers/report.ts) dùng: số ngày có check-in trong tuần, số ngày tâm trạng "Vui",
 * và chuỗi ngày đi học liên tiếp tính tới hôm nay.
 *
 * VÌ SAO KHÔNG GỌI THẲNG `buildGrowthReport`: hàm đó chưa export, và nó dựng báo cáo cho
 * MỘT em tự suy ra từ người gọi (`getMyStudentIdForReport` — chính mình hoặc con mình),
 * trong khi màn duyệt cần cả lớp trong MỘT truy vấn và người gọi là GVCN, không phải phụ
 * huynh. Đây là chỗ dễ trôi lệch nhất của màn này: ngưỡng hay câu chữ bên report đổi mà
 * quên bên đây thì cô ký duyệt một bản KHÁC bản phụ huynh đọc — hỏng đúng thứ màn này
 * sinh ra để chữa. Việc gộp hai bên về một module dùng chung ghi ở `DEBT.md` (xem
 * canPhoiHop của gói "cong-duyet-bao-cao").
 *
 * KHÔNG có nhánh nào cho `attendance.help_requests`: "cần gặp thầy cô" là tín hiệu chăm
 * sóc, không phải thành tích để khoe với phụ huynh (mệnh lệnh 4 — không lọt ra ngoài
 * phạm vi đã hứa với đứa trẻ). Bản xem trước phải giống bản thật, nên nó cũng không đọc.
 */
export function buildReportPreview(stats: {
  checkinDays: number;
  /**
   * `null` = NGƯỜI ĐANG XEM không được đọc nguồn của con số này (ADR-026 — GVCN). Khác
   * hẳn `0`, và khác đúng ở chỗ nguy hiểm nhất: `0` làm mục Glow biến mất y như khi em
   * thật sự không có ngày vui nào, nên bản xem trước im lặng thiếu một mục so với bản
   * phụ huynh đọc. `null` làm mục đó biến mất KÈM một lời khai (`glowIncomplete`).
   */
  happyDays: number | null;
  streakDays: number;
}): {
  headline: string;
  glow: Array<{ title: string; detail: string; accentColor: "green" | "blue" | "amber" }>;
  grow: Array<{ title: string; detail: string }>;
  streakDays: number;
  glowIncomplete: boolean;
} {
  const glow: Array<{ title: string; detail: string; accentColor: "green" | "blue" | "amber" }> = [];
  if (stats.checkinDays >= 5) {
    glow.push({
      title: "Đi học đủ 5/5 ngày, check-in đúng giờ cả tuần",
      detail: `Điểm danh · chuỗi ${stats.streakDays} ngày`,
      accentColor: "green",
    });
  }
  // `stats.happyDays !== null && …` chứ không phải `(stats.happyDays ?? 0) >= 3`: viết
  // kiểu sau là đúng thứ vừa cấm — `null` rơi xuống 0 rồi so sánh, và cả hai ca cho ra
  // cùng một màn hình.
  const happyDays = stats.happyDays;
  const happyDaysUnknown = happyDays === null;
  if (happyDays !== null && happyDays >= 3) {
    glow.push({
      title: "Cả tuần đến lớp với tâm trạng vui vẻ",
      detail: `Check-in cảm xúc · ${happyDays}/5 ngày "Vui"`,
      accentColor: "blue",
    });
  }

  const grow =
    stats.checkinDays < 5
      ? [
          {
            title: "Đi học đều hơn",
            detail:
              "Tuần này có ngày vắng hoặc check-in muộn — cùng sắp xếp giờ giấc buổi sáng nhé.",
          },
        ]
      : [];

  return {
    // `headline` dựng từ SỐ MỤC GLOW DỰNG ĐƯỢC, nên bản của cô có thể nhẹ hơn bản phụ
    // huynh đọc ("Một tuần ổn định" thay vì "Một tuần rực rỡ!"). Đó chính là cái mà
    // `glowIncomplete` cảnh báo — không có cách nào dựng đúng headline mà không đọc được
    // số ngày vui, nên nói ra thay vì đoán.
    headline: glow.length >= 2 ? "Một tuần rực rỡ!" : "Một tuần ổn định",
    glow,
    grow,
    streakDays: stats.streakDays,
    glowIncomplete: happyDaysUnknown,
  };
}

export const careRouter = router({
  /**
   * Buồng lái GVCN, ĐÚNG MỘT lớp mỗi lần gọi.
   *
   * Sửa 31/07/2026 (gói "gvcn-nhieu-lop"). Bản cũ lấy `ctx.homeroomClassId` — tức phần tử
   * đầu của `core.v_my_scopes`, một câu SELECT KHÔNG có ORDER BY. Hai hệ quả, cái sau nặng
   * hơn cái trước:
   *
   *   1. Cô chủ nhiệm hai lớp chỉ thấy lớp một, và màn hình không nói đang xem lớp nào.
   *   2. "Lớp một" đó không cố định giữa hai lần tải. Bốn màn con đã có bộ chọn lớp và
   *      mặc định lấy lớp đầu THEO MÃ LỚP (getMyClasses `order by c.code`), nên buồng lái
   *      và bốn màn con hoàn toàn có thể mở hai lớp khác nhau trong cùng một phiên.
   *
   * Nay: có `classId` thì đối chiếu `ctx.homeroomClassIds` (không tin tham số — đổi một
   * tham số mà đọc được lớp đồng nghiệp là lỗ leo quyền ở 0025); không có thì chọn lớp đầu
   * THEO MÃ LỚP bằng chính câu truy vấn đã cần chạy để lấy `code`/`school_id`, nên không
   * tốn thêm vòng nào. `classId` cũng đi ra output để màn hình biết chắc mình đang xem lớp
   * nào thay vì suy từ mã lớp (mã lớp trùng giữa hai cơ sở là chuyện có thật).
   *
   * KHÔNG dùng `requireMyClass(ids)` cho nhánh mặc định: hàm đó trả `ids[0]`, đúng cái
   * thứ tự ngẫu nhiên vừa nói. Nhánh có tham số vẫn dùng nó để giữ nguyên câu từ chối.
   */
  getDashboard: homeroomProcedure.input(GetDashboardInput).query(async ({ ctx, input }) => {
    const requested = input?.classId;
    // Ném FORBIDDEN NGAY khi lớp không phải của mình — trước cả khi mở kết nối, và với
    // đúng câu từ chối mà năm procedure GVCN còn lại đang dùng.
    if (requested) requireMyClass(ctx.homeroomClassIds, requested);

    return ctx.runWithDb(async (client) => {
      const classRes = await client.query<{ id: string; code: string; school_id: string }>(
        `select id, code, school_id
           from core.classes
          where id = any($1::uuid[]) and ($2::uuid is null or id = $2::uuid)
          order by code
          limit 1`,
        [ctx.homeroomClassIds, requested ?? null],
      );
      // RLS che mất dòng lớp (chưa từng gặp, nhưng nếu xảy ra) → vẫn trả về đúng lớp đã
      // hỏi, `className` rỗng như hành vi cũ. KHÔNG bịa mã lớp.
      const classId = classRes.rows[0]?.id ?? requested ?? (ctx.homeroomClassIds[0] as string);
      const className = classRes.rows[0]?.code ?? "";
      const schoolId = classRes.rows[0]?.school_id ?? null;

      // Ngưỡng theo ĐÚNG cơ sở của lớp (0026 cho phép khai riêng từng cơ sở), không
      // phải một con số toàn hệ viết trong code.
      const rules = await readCareRules(client, schoolId);

      const totalsRes = await client.query<{
        checkin_count: number;
        pending_late_count: number;
        absent_count: number;
        students_with_row: number;
      }>(
        // `students_with_row` đếm SỐ EM có ít nhất một dòng hôm nay, không đếm số dòng:
        // nó là mẫu số của "chưa điểm danh" ([QĐ-3]). Đếm dòng thì một em có cả dòng 'in'
        // lẫn dòng khác sẽ tính hai lần và số "chưa điểm danh" tụt xuống âm thầm.
        `select
           count(*) filter (where c.kind = 'in')::int as checkin_count,
           count(*) filter (where c.status = 'queued_late')::int as pending_late_count,
           count(*) filter (where c.status = 'absent')::int as absent_count,
           count(distinct c.student_id)::int as students_with_row
         from attendance.checkins c
         join core.enrollments e on e.student_id = c.student_id and e.valid_to is null
         where e.class_id = $1 and c.occurred_on = current_date`,
        [classId],
      );

      const pendingRes = await client.query<{
        checkin_id: string;
        student_id: string;
        student_name: string;
        occurred_on: string;
        occurred_at_time: string;
      }>(
        // GIỜ GỬI đi ra màn hình (ADR-029, 06/08/2026). `attendance.checkins.occurred_at` có
        // từ 0004 mà buồng lái chưa bao giờ đọc: cô chỉ thấy "1 check-in gửi muộn" và không
        // có dữ kiện nào để quyết — mà bấm lúc 07:55 khác hẳn bấm lúc 10:20.
        //
        // `to_char(..., 'HH24:MI')` chứ KHÔNG phải `occurred_at::text`: đường thứ hai trả về
        // cả micro giây lẫn offset (`"2026-08-01 00:41:49.075267+07"` — đo thật 01/08/2026,
        // xem `ClassRosterEntry.checkedInAt`). Đổi múi giờ làm ở TẦNG KẾT NỐI: mọi phiên đều
        // `set time zone 'Asia/Ho_Chi_Minh'` (packages/core/db/client.ts:67, cưỡng chế bằng
        // tests/unit/mui-gio.test.ts), nên `to_char` trên timestamptz đã là giờ địa phương —
        // đúng cách `getClassRoster` và `getStudentDetail` đang làm, không thêm cách thứ ba.
        //
        // KHÔNG lọc `source = 'app'` như hai chỗ kia: ở đó giờ chỉ có nghĩa khi CHÍNH EM bấm,
        // còn dòng `queued_late` thì theo định nghĩa là dòng em gửi (hàng đợi offline hoặc
        // ngoài dải IP trường) — cô ghi hộ không bao giờ sinh ra trạng thái này (0032 cấm
        // GVCN ghi `queued_late`). Nên ở đây `occurred_at` LUÔN là giờ máy chủ nhận lượt bấm
        // của em, và trường trong hợp đồng là `z.string()` không nullable đúng vì thế.
        `select c.id as checkin_id, s.id as student_id, s.full_name as student_name,
                c.occurred_on::text,
                to_char(c.occurred_at, 'HH24:MI') as occurred_at_time
           from attendance.checkins c
           join core.students s on s.id = c.student_id
           join core.enrollments e on e.student_id = c.student_id and e.valid_to is null
          where e.class_id = $1 and c.status = 'queued_late'
          order by c.occurred_on, c.occurred_at`,
        [classId],
      );

      // ── Cờ ưu tiên: HAI NGUỒN, HAI NHỊP, NÓI RA CẢ HAI ────────────────────
      //
      // Viết lại 01/08/2026 theo [QĐ-1] (ADR-026) và [QĐ-2]. Bản cũ tự tính CẢ HAI mã cờ
      // từ `attendance.checkins_care` — tức là buồng lái tự đọc nhật ký cảm xúc của từng
      // em rồi tự đếm chuỗi ngày xấu. Sau 0044 cô không còn quyền đọc bảng đó (đo trên
      // hub_dev: cô Lan 75 dòng → 0), nên câu SQL cũ không trả về cờ E_MOOD nào nữa và
      // buồng lái sẽ sạch cờ trong im lặng — đúng loại hỏng nguy hiểm nhất, vì bảng cờ
      // trống đọc y hệt "lớp mình đang ổn".
      //
      // Nay:
      //   · E_MOOD  ← `care.flags` (do `care.run_flag_engine` sinh theo lượt quét đêm).
      //     Cô vẫn nhận cờ — đó là nửa còn lại của [QĐ-1]: cô biết CÓ CHUYỆN mà không đọc
      //     được CHUYỆN GÌ. Câu SELECT cố ý KHÔNG lấy `f.detail`: cột đó chứa
      //     `negative_days`/`negative_streak`/`nguong`, và DESIGN-GUIDELINES §9 cấm ba thứ
      //     đi ra phía GVCN — chiều của cảm xúc, SỐ NGÀY, mọi trích dẫn. Cắt ở đây là cắt
      //     tại contract; ẩn ở CSS thì số vẫn nằm trong tab Network của máy cô.
      //   · E_URGENT ← tính THẲNG từ `attendance.help_requests` ngay trong lượt gọi này.
      //     [QĐ-2] đòi báo NGAY, không chờ quét đêm. Đo đường đầy đủ qua HTTP trên hub_dev:
      //     em bấm nút 195 ms, lượt đọc kế tiếp của cô thấy cờ sau thêm 226 ms.
      //
      // Vì sao KHÔNG gộp một em thành một dòng như bản cũ: hai mã cờ nay có hai NHỊP khác
      // nhau, và gộp là in một thẻ mang nhãn "tức thì" cho một tín hiệu thật ra chờ tới
      // đêm. Em có cả hai thì có hai thẻ, mỗi thẻ tự khai nhịp của mình.
      const urgentRes = await client.query<{
        student_id: string;
        student_name: string;
        as_of_date: string;
        open_help_requests: Array<{ helpRequestId: string; requestedOn: string; urgency: string | null }>;
        case_id: string | null;
        case_status: string | null;
        recently_handled: boolean;
      }>(
        `with roster as (
           select e.student_id, s.full_name
             from core.enrollments e
             join core.students s on s.id = e.student_id
            where e.class_id = $1 and e.valid_to is null
         ),
         open_help as (
           select h.student_id, h.id as help_request_id, h.requested_on, h.urgency
             from roster r
             join attendance.help_requests h
               on h.student_id = r.student_id
              and h.requested_on >= current_date - $2::int
              and h.handled_at is null
         ),
         last_action as (
           select cc.student_id, max(i.occurred_at) as last_intervention_at
             from care.care_cases cc
             join care.interventions i on i.case_id = cc.id
            group by cc.student_id
         )
         select r.student_id,
                r.full_name as student_name,
                current_date::text as as_of_date,
                -- MẢNG ID THẬT, không phải một ngày gộp. Đây là thứ nút "Cô đã gặp em
                -- rồi" gửi lên, và là lý do lỗi cờ-khẩn-không-tắt-được không quay lại:
                -- màn hình chỉ đóng đúng những dòng nó đang vẽ.
                jsonb_agg(
                  jsonb_build_object(
                    'helpRequestId', oh.help_request_id,
                    'requestedOn', oh.requested_on::text,
                    'urgency', oh.urgency
                  ) order by oh.requested_on desc
                ) as open_help_requests,
                cc.id as case_id, cc.status as case_status,
                coalesce(la.last_intervention_at >= now() - make_interval(days => $3::int), false) as recently_handled
           from roster r
           join open_help oh on oh.student_id = r.student_id
           left join care.care_cases cc on cc.student_id = r.student_id and cc.status = 'open'
           left join last_action la on la.student_id = r.student_id
          group by r.student_id, r.full_name, cc.id, cc.status, la.last_intervention_at
          -- Cờ vừa được xử lý xuống cuối (KHÔNG xoá — cô vẫn phải thấy).
          order by coalesce(la.last_intervention_at >= now() - make_interval(days => $3::int), false) asc,
                   max(oh.requested_on) desc,
                   r.full_name`,
        [classId, rules.urgent.windowDays, rules.emotion.quietDays],
      );

      const moodFlagRes = await client.query<{
        student_id: string;
        student_name: string;
        as_of_date: string;
        case_id: string | null;
        case_status: string | null;
        recently_handled: boolean;
      }>(
        // `distinct on (student_id)` — một em một thẻ, lấy lượt quét mới nhất. Engine ghi
        // một dòng mỗi ngày (khoá `flags_uq (student_id, rule_code, as_of_date)`), nên
        // không lọc thì một em có cờ năm hôm liền sẽ thành năm thẻ giống hệt nhau.
        //
        // `origin = 'live'`: dòng `backfill` là kết quả chạy bù cho quá khứ (0039), không
        // phải tình hình hôm nay của lớp.
        `with roster as (
           select e.student_id, s.full_name
             from core.enrollments e
             join core.students s on s.id = e.student_id
            where e.class_id = $1 and e.valid_to is null
         ),
         last_action as (
           select cc.student_id, max(i.occurred_at) as last_intervention_at
             from care.care_cases cc
             join care.interventions i on i.case_id = cc.id
            group by cc.student_id
         )
         select distinct on (r.student_id)
                r.student_id,
                r.full_name as student_name,
                f.as_of_date::text as as_of_date,
                cc.id as case_id, cc.status as case_status,
                coalesce(la.last_intervention_at >= now() - make_interval(days => $3::int), false) as recently_handled
           from roster r
           join care.flags f
             on f.student_id = r.student_id
            and f.rule_code = 'E_MOOD'
            and f.origin = 'live'
            and f.as_of_date >= current_date - $2::int
           left join care.care_cases cc on cc.student_id = r.student_id and cc.status = 'open'
           left join last_action la on la.student_id = r.student_id
          order by r.student_id, f.as_of_date desc`,
        [classId, rules.emotion.windowDays, rules.emotion.quietDays],
      );

      const staleRes = await client.query<{ label: string }>(
        "select label from ops.v_stale_sources where source in ('attendance','evidence')",
      );

      // Trạng thái bộ quét cờ — xem `readScanHealth`. Lọc theo `job_name` vẫn là bắt buộc
      // (contract nói "Quét đêm qua", nên phải là giờ của ĐÚNG bộ quét cờ, không phải giờ
      // của job dọn mood chạy muộn hơn), nhưng nay câu trả lời là một TRẠNG THÁI chứ không
      // còn là một dấu thời gian trần.
      const scanHealth = await readScanHealth(client);

      const classSizeRes = await client.query<{ total_students: number; open_care_cases: number }>(
        `select
           (select count(*)::int from core.enrollments where class_id = $1 and valid_to is null) as total_students,
           (select count(*)::int from care.care_cases cc
             join core.enrollments e on e.student_id = cc.student_id and e.valid_to is null
            where e.class_id = $1 and cc.status = 'open') as open_care_cases`,
        [classId],
      );

      const recentActionsRes = await client.query<{
        student_name: string;
        action: string;
        occurred_at: string;
      }>(
        `select s.full_name as student_name, i.action, i.occurred_at::text as occurred_at
           from care.interventions i
           join care.care_cases cc on cc.id = i.case_id
           join core.students s on s.id = cc.student_id
           join core.enrollments e on e.student_id = cc.student_id and e.valid_to is null
          where e.class_id = $1
          order by i.occurred_at desc
          limit 5`,
        [classId],
      );

      const totalStudents = classSizeRes.rows[0]?.total_students ?? 0;
      const studentsWithRow = totalsRes.rows[0]?.students_with_row ?? 0;

      return GetDashboardOutput.parse({
        classId,
        className,
        asOfDate: toLocalIsoDate(new Date()),
        // Một sự thật, hai lối đọc: `lastScanAt` là bản rút gọn của `scanHealth.lastSuccessAt`
        // cho client cũ. Không tính lại từ câu SQL thứ hai — hai câu SQL cho cùng một con số
        // là cách chúng bắt đầu lệch nhau.
        lastScanAt: scanHealth.lastSuccessAt,
        scanHealth,
        staleSources: staleRes.rows.map((r) => r.label),
        totals: {
          checkinCount: totalsRes.rows[0]?.checkin_count ?? 0,
          pendingLateCount: totalsRes.rows[0]?.pending_late_count ?? 0,
          absentCount: totalsRes.rows[0]?.absent_count ?? 0,
          totalStudents,
          openCareCases: classSizeRes.rows[0]?.open_care_cases ?? 0,
          // `Math.max(0, …)`: sĩ số và số dòng điểm danh đến từ hai câu SQL, và một em vừa
          // chuyển lớp giữa hai câu đó cho ra số âm. Một con số âm trên thẻ "chưa điểm
          // danh" là thứ không ai đọc nổi, còn 0 thì ít nhất đọc được là "không thiếu ai".
          notCheckedInCount: Math.max(0, totalStudents - studentsWithRow),
        },
        // Cô không đọc được nhật ký cảm xúc nữa (ADR-026) — nhưng ô đó KHÔNG được biến
        // mất trong im lặng: màn hình in một câu nói rõ đây là quy định, không phải lỗi.
        moodVisibility: { readable: false, reason: "chi_tam_ly" },
        priorityFlags: [
          ...urgentRes.rows.map((r) => ({
            // Chuỗi ghép, KHÔNG phải một UUID: `resolveOpenCase` (logIntervention) coi mọi
            // chuỗi 36 ký tự không có dấu ":" là `care_cases.id` thật. Trả `care.flags.id`
            // ra đây sẽ khiến nút "Ghi can thiệp" gửi một mã cờ vào chỗ đợi mã hồ sơ.
            flagId: `${r.student_id}:E_URGENT:${r.as_of_date}`,
            studentId: r.student_id,
            studentName: r.student_name,
            className,
            ruleCode: "E_URGENT",
            asOfDate: r.as_of_date,
            detail: {
              cadence: "tuc_thi" as const,
              openHelpRequests: r.open_help_requests ?? [],
              recentlyHandled: r.recently_handled,
            },
            caseId: r.case_id,
            caseStatus: r.case_status as "open" | "closed" | null,
          })),
          ...moodFlagRes.rows.map((r) => ({
            flagId: `${r.student_id}:E_MOOD:${r.as_of_date}`,
            studentId: r.student_id,
            studentName: r.student_name,
            className,
            ruleCode: "E_MOOD",
            asOfDate: r.as_of_date,
            detail: {
              cadence: "quet_dem" as const,
              // Cờ cảm xúc KHÔNG mang yêu cầu gặp nào: nút "Cô đã gặp em rồi" chỉ tắt
              // `attendance.help_requests`, mà cờ này không sinh ra từ bảng đó. Mảng rỗng
              // ở đây là sự thật, không phải thiếu dữ liệu.
              openHelpRequests: [],
              recentlyHandled: r.recently_handled,
            },
            caseId: r.case_id,
            caseStatus: r.case_status as "open" | "closed" | null,
          })),
        ],
        pendingLateCheckins: pendingRes.rows.map((r) => ({
          checkinId: r.checkin_id,
          studentId: r.student_id,
          studentName: r.student_name,
          occurredOn: r.occurred_on,
          occurredAtTime: r.occurred_at_time,
        })),
        recentActions: recentActionsRes.rows.map((r) => ({
          studentName: r.student_name,
          action: r.action,
          occurredAt: r.occurred_at,
        })),
      });
    });
  }),

  /**
   * Kết luận một hoặc nhiều check-in gửi muộn: `present` · `late` · `absent` (ADR-029).
   *
   * ── VÌ SAO `homeroomProcedure`, KHÔNG PHẢI `protectedProcedure` ────────────────
   * Lỗi số 1 ở đầu file này là LEO QUYỀN, và nó xảy ra ở đúng đường ghi mà thủ tục này
   * thay thế: `acknowledgeLate` từng là `protectedProcedure` — chỉ hỏi "đã đăng nhập
   * chưa" — nên học sinh gọi thẳng với id dòng `queued_late` của CHÍNH MÌNH là tự duyệt
   * được mình thành `present` và ký tên mình vào `confirmed_by` (tái hiện được, xem đầu
   * migration 0025). Thủ tục mới mở RỘNG HƠN cũ (nay ghi được cả `absent`, tức là chạm
   * thẳng vào số chuyên cần), nên nó phải gác CHẶT HƠN chứ không được bằng:
   *
   *   · tầng vai   — `homeroomProcedure`: chỉ người đang chủ nhiệm một lớp mới gọi được.
   *   · tầng RLS   — policy trên `attendance.checkins` (0025, nới cho `absent` ở 0053):
   *                  cô chỉ động được vào dòng `queued_late` của lớp MÌNH chủ nhiệm.
   *   · tầng sổ    — `attendance.decide_late_checkins` ghi `attendance.late_decisions`
   *                  trong CÙNG giao dịch với lần đổi trạng thái.
   *
   * Ba tầng, không tầng nào tin tầng kia tử tế. Và KHÔNG có đường ghi thứ hai: router
   * này không còn câu `update attendance.checkins ... set status` nào của riêng nó — một
   * đường ghi trạng thái bỏ qua hàm là một đường ghi không để lại vết, mà "quyền không
   * có vết là quyền không ai soát được" (ADR-029).
   *
   * ── VÌ SAO GỌI HÀM SQL, KHÔNG VIẾT LẠI UPDATE Ở ĐÂY ──────────────────────────
   * Đổi trạng thái và ghi sổ phải là MỘT hành động nguyên tử. Viết hai câu lệnh ở tầng
   * này thì có một khoảnh khắc trạng thái đã đổi mà sổ chưa ghi, và mọi lỗi mạng rơi vào
   * đúng khoảnh khắc đó sinh ra thứ tệ nhất: một số chuyên cần đã đổi mà không ai biết ai
   * đổi. Hàm `attendance.decide_late_checkins` (0053) làm cả hai trong một giao dịch và
   * là nơi duy nhất biết cách làm việc đó.
   *
   * ── LÝ DO BẮT BUỘC, KIỂM Ở CẢ BA TẦNG ────────────────────────────────────────
   * ADR-029 đổi lấy quyền ghi `absent` bằng đúng một điều kiện: kết luận khác `present`
   * thì phải nói vì sao. Chặn ở `DecideLateCheckinsInput.refine` (hợp đồng), ở đây (một
   * màn khác gọi thẳng, hoặc hợp đồng bị nới sau này mà không ai để ý), và ở ràng buộc
   * trong 0053. Ba tầng CỐ Ý chồng nhau: tầng dưới không được suy ra rằng tầng trên đã
   * kiểm hộ mình rồi.
   *
   * §9 — idempotency nằm ở `clientMutationId`: gửi lại cùng mã là CÙNG một quyết định,
   * không phải quyết định thứ hai. Lần hai trả `updated = 0` và sổ KHÔNG thêm dòng.
   */
  decideLateCheckins: homeroomProcedure
    .input(DecideLateCheckinsInput)
    .mutation(async ({ ctx, input }) => {
      const reason = input.reason?.trim() ?? null;
      if (input.decision !== "present" && (reason === null || reason.length < 3)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Phải ghi lý do khi kết luận khác “Có mặt”.",
        });
      }

      return ctx.runWithDb(async (client) => {
        const { rows } = await client
          .query<{ updated: number; skipped: number }>(
            `select updated, skipped
               from attendance.decide_late_checkins($1::uuid[], $2::text, $3::text, $4::uuid)`,
            [input.checkinIds, input.decision, reason, input.clientMutationId ?? null],
          )
          .catch(asScopeError);

        // Hàm luôn trả đúng một dòng; `?? 0` chỉ để TypeScript không phải đoán, không
        // phải để nuốt một ca rỗng — rỗng ở đây là lỗi hàm, và nó sẽ lộ ra ở test.
        return DecideLateCheckinsOutput.parse({
          updated: rows[0]?.updated ?? 0,
          skipped: rows[0]?.skipped ?? 0,
        });
      });
    }),

  /**
   * @deprecated ADR-029 (06/08/2026) — dùng `decideLateCheckins` với
   * `{ decision: 'present' }`. Giữ lại vì client cũ (bản PWA đã cài trên máy thầy cô,
   * chưa cập nhật) vẫn đang gọi tên này; gỡ được khi không còn phiên bản nào gọi.
   *
   * Nay là LỐI TẮT, không phải đường ghi thứ hai: nó gọi ĐÚNG hàm SQL mà
   * `decideLateCheckins` gọi, nên mỗi cú bấm của client cũ cũng để lại một dòng
   * `attendance.late_decisions` như mọi quyết định khác. Trước ADR-029 nút này chạy một
   * câu `update` trần — tức là đường ghi duy nhất KHÔNG có vết, và là đúng thứ mà một
   * client cũ chưa cập nhật sẽ còn dùng lâu nhất.
   *
   * `homeroomProcedure` giữ nguyên: đây vẫn là lớp gác thứ hai bên cạnh RLS 0025.
   */
  acknowledgeLate: homeroomProcedure.input(AcknowledgeLateInput).mutation(async ({ ctx, input }) => {
    return ctx.runWithDb(async (client) => {
      const { rows } = await client
        .query<{ updated: number; skipped: number }>(
          // `p_reason = null` hợp lệ vì `p_to_status = 'present'` — đúng điều kiện duy
          // nhất mà ADR-029 cho phép bỏ trống lý do.
          `select updated, skipped
             from attendance.decide_late_checkins($1::uuid[], 'present', null, null)`,
          [input.checkinIds],
        )
        .catch(asScopeError);

      // Hình dạng trả về giữ nguyên `{ updated }` — client cũ đọc đúng khoá đó, thêm
      // khoá mới thì không sao nhưng đổi khoá cũ là làm hỏng màn hình đang chạy.
      // Gọi lại lần hai: dòng không còn `queued_late` → 0, không lỗi (§9).
      return { updated: rows[0]?.updated ?? 0 };
    });
  }),

  /**
   * "Đã gặp em rồi" — tắt ĐÚNG những tín hiệu khẩn đang hiện trên màn.
   *
   * Viết lại 01/08/2026 sau khi tái hiện được lỗi trên hub_dev. Nguyên văn phép đo, để
   * lần sau ai sửa lại như cũ thì biết mình đang mở lại cái gì:
   *
   *   Phiên Cô Vân (GVCN 6A3), em Lê Tiến Dũng có HAI yêu cầu treo 31/07 và 01/08. Buồng
   *   lái trả cờ E_URGENT với `asOfDate = 2026-08-01`. Bấm lần 1 (màn hình gửi
   *   `requestedOn = flag.asOfDate`) → `{"updated":1}`; DB còn dòng 31/07 chưa xử lý. Gọi
   *   lại buồng lái → VẪN E_URGENT, `asOfDate` VẪN 01/08, vì `asOfDate` cũ là
   *   `greatest(ngày check-in gần nhất, ngày yêu cầu treo gần nhất)` và em check-in 01/08
   *   với tâm trạng Vui — một buổi sáng vui đã che mất ngày của lời em gửi hôm trước. Bấm
   *   lần 2 → `{"updated":0,"alreadyHandled":true}` → màn hình in "Người khác đã xử lý
   *   trước rồi." trong khi KHÔNG AI xử lý gì cả. Bấm bao nhiêu lần nữa cũng vậy: cờ này
   *   không tắt được từ buồng lái, sống tới hết cửa sổ E_URGENT 14 ngày. Ba em trên
   *   hub_dev đang ở đúng tình trạng đó.
   *
   * Hai thứ đổi, và phải đổi CÙNG NHAU:
   *   1. Đầu vào là TẬP ID THẬT (`attendance.help_requests.id`), không còn là ngày suy từ
   *      một trường hiển thị. Bảng đã có khoá chính từ đầu; bản cũ không dùng.
   *   2. Đầu ra là bốn con số, không còn một boolean. Xem `AcknowledgeHelpRequestOutput`.
   *
   * §9 — MỘT câu SQL, một giao dịch: `target` chụp trạng thái TRƯỚC khi ghi, `done` ghi và
   * trả về đúng những dòng nó đổi. Gọi lần hai với cùng payload cho `justHandled = 0`,
   * `alreadyHandled = N`, `handledByMe = true` — không nhân đôi tác dụng, và trả lời khác
   * hẳn ca "gửi id sai" (`notFound = N`).
   */
  acknowledgeHelpRequest: careStaffProcedure
    .input(AcknowledgeHelpRequestInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.runWithDb(async (client) => {
        const { rows } = await client.query<{
          just_handled: number;
          already_handled: number;
          not_found: number;
          remaining_open: number;
          handled_by_me: boolean;
          handled_by_name: string | null;
          handled_at: string | null;
        }>(
          // `student_id = $1` là hàng rào thứ hai bên cạnh RLS `help_requests_handle_care`:
          // id đúng nhưng của em khác thì rơi vào `not_found`, không âm thầm tắt hộ.
          `with asked as (
             select unnest($2::uuid[]) as id
           ),
           target as (
             select a.id, h.handled_at, h.handled_by
               from asked a
               left join attendance.help_requests h
                 on h.id = a.id and h.student_id = $1
           ),
           done as (
             update attendance.help_requests h
                set handled_by = core.current_user_id(), handled_at = now()
               from target t
              where h.id = t.id
                and h.student_id = $1
                and h.handled_at is null
              returning h.id
           ),
           prior as (
             -- Dòng ĐÃ có người xử lý TRƯỚC lần gọi này. Lấy dòng gần nhất để nói được
             -- "ai, lúc mấy giờ" thay vì một câu chung chung.
             select t.handled_at, t.handled_by
               from target t
              where t.handled_at is not null
              order by t.handled_at desc
              limit 1
           )
           select
             (select count(*)::int from done) as just_handled,
             (select count(*)::int from target where handled_at is not null) as already_handled,
             -- Bằng phép trừ, KHÔNG bằng một điều kiện WHERE thứ ba: mọi id gửi lên phải
             -- rơi vào đúng một trong ba rổ, và phép trừ là cách duy nhất bảo đảm ba rổ
             -- cộng lại đúng bằng số id đã gửi. Rổ này gộp "id không có thật", "id của em
             -- khác" và "dòng RLS không cho ghi" — cả ba đều dẫn tới cùng một việc phải
             -- làm (tải lại màn hình), nên gộp ở đây là gộp có lý do, khác hẳn cái
             -- alreadyHandled cũ gộp "đã xong" với "trượt".
             ((select count(*)::int from asked)
               - (select count(*)::int from done)
               - (select count(*)::int from target where handled_at is not null)) as not_found,
             -- TRỪ ĐI done, không đếm thẳng. Trong cùng MỘT câu lệnh, các nhánh WITH chạy
             -- trên cùng một ảnh chụp dữ liệu và KHÔNG thấy tác dụng ghi của nhau: một
             -- câu đếm "handled_at is null" đặt ở đây sẽ đếm cả những dòng mà chính câu
             -- này vừa đóng. Bài test bắt được đúng chỗ đó — đóng dòng cuối cùng của em
             -- mà màn hình vẫn in "em còn 1 lời nhắn chưa xử lý", tức là một lời nhắc sai
             -- ngay sau một thao tác đúng.
             -- Phép trừ chính xác chứ không xấp xỉ: done chỉ trả về những dòng TRƯỚC ĐÓ
             -- đang mở, nên nó luôn là tập con của số đếm kia.
             ((select count(*)::int from attendance.help_requests
                where student_id = $1 and handled_at is null)
               - (select count(*)::int from done)) as remaining_open,
             coalesce((select p.handled_by = core.current_user_id() from prior p), false) as handled_by_me,
             -- core.users chỉ mở SELECT cho CHÍNH MÌNH (policy users_self, 0009): tên
             -- đồng nghiệp ra NULL. Không bịa tên — màn hình in "Thầy cô khác".
             (select u.full_name from prior p left join core.users u on u.id = p.handled_by) as handled_by_name,
             (select p.handled_at::text from prior p) as handled_at`,
          [input.studentId, input.helpRequestIds],
        ).catch(asScopeError);

        const r = rows[0];
        return AcknowledgeHelpRequestOutput.parse({
          justHandled: r?.just_handled ?? 0,
          alreadyHandled: r?.already_handled ?? 0,
          notFound: r?.not_found ?? 0,
          remainingOpen: r?.remaining_open ?? 0,
          handledByMe: r?.handled_by_me ?? false,
          handledByName: r?.handled_by_name ?? null,
          handledAt: r?.handled_at ?? null,
        });
      });
    }),

  logIntervention: careStaffProcedure.input(LogInterventionInput).mutation(async ({ ctx, input }) => {
    return ctx.runWithDb(async (client) => {
      const caseId = await resolveOpenCase(client, input.caseId);

      // §9 — khoá chống trùng là (case_id, client_mutation_id), unique index ở 0026.
      // Khi client CHƯA gửi clientMutationId (màn hình GVCN hiện tại), máy chủ tự dựng
      // khoá từ (case, người ghi, hành động, ghi chú, NGÀY). Đánh đổi đã cân nhắc: hai
      // lần ghi y hệt nhau trong cùng một ngày của cùng một người bị gộp làm một — mà
      // hai dòng y hệt nhau thì không phân biệt được với một cú double-tap, trong khi
      // mỗi dòng thừa lại RESET đồng hồ leo thang 7 ngày (0005:81). Gộp là phía an toàn.
      const inserted = await client
        .query<{ id: string }>(
          // `$1::uuid::text` chứ không phải `$1::text`: dùng cùng một tham số vừa làm
          // giá trị cột uuid vừa làm chuỗi cho md5 thì Postgres suy ra hai kiểu khác
          // nhau và từ chối ("inconsistent types deduced for parameter $1").
          `insert into care.interventions (case_id, actor_id, action, note, client_mutation_id)
           values ($1::uuid, core.current_user_id(), $2, $3,
                   coalesce($4::uuid,
                            md5($1::uuid::text || core.current_user_id()::text || $2 ||
                                coalesce($3, '') || current_date::text)::uuid))
           on conflict do nothing
           returning id`,
          [caseId, input.action, input.note ?? null, input.clientMutationId ?? null],
        )
        .catch(asScopeError);

      if (inserted.rows[0]) {
        return LogInterventionOutput.parse({
          caseId,
          interventionId: inserted.rows[0].id,
          deduplicated: false,
        });
      }

      // Không chèn được = đã có dòng mang đúng khoá đó (lần bấm trước, hoặc request
      // song song vừa commit). Đọc lại để trả cùng một kết quả cho cả hai lần gọi.
      const existing = await client.query<{ id: string }>(
        `select id from care.interventions
          where case_id = $1::uuid
            and client_mutation_id = coalesce($2::uuid,
                  md5($1::uuid::text || core.current_user_id()::text || $3 ||
                      coalesce($4, '') || current_date::text)::uuid)`,
        [caseId, input.clientMutationId ?? null, input.action, input.note ?? null],
      );
      return LogInterventionOutput.parse({
        caseId,
        interventionId: existing.rows[0]?.id ?? null,
        deduplicated: true,
      });
    });
  }),

  /**
   * Đóng hồ sơ chăm sóc. Không có đường này thì cờ chỉ mở ra chứ không tắt đi được,
   * buồng lái đầy "cờ chết" và GVCN học cách phớt lờ nó — hỏng nặng hơn không có cờ.
   * Lý do đóng ghi thành một dòng care.interventions: nhật ký hành động của con người
   * nằm chung một chỗ, không đẻ thêm cột chỉ để chứa một câu văn.
   */
  closeCase: careStaffProcedure.input(CloseCaseInput).mutation(async ({ ctx, input }) => {
    return ctx.runWithDb(async (client) => {
      const { rowCount } = await client
        .query(
          `update care.care_cases
              set status = 'closed', closed_at = now()
            where id = $1 and status = 'open'`,
          [input.caseId],
        )
        .catch(asScopeError);

      const closed = (rowCount ?? 0) > 0;
      if (closed) {
        // Chỉ ghi khi ĐÚNG lần đóng thật: gọi lại lần hai không đẻ thêm dòng nhật ký.
        await client
          .query(
            `insert into care.interventions (case_id, actor_id, action, note, client_mutation_id)
             values ($1::uuid, core.current_user_id(), 'Đóng hồ sơ chăm sóc', $2,
                     md5($1::uuid::text || 'close')::uuid)
             on conflict do nothing`,
            [input.caseId, input.resolution],
          )
          .catch(asScopeError);
      }

      return CloseCaseOutput.parse({ caseId: input.caseId, closed, alreadyClosed: !closed });
    });
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // BỐN MÀN HÌNH GVCN (gói "gvcn-man-hinh", 31/07/2026)
  //
  // Bốn mục sidebar của GVCN (Lớp chủ nhiệm · Điểm danh lớp · Duyệt báo cáo · Ghi chú
  // can thiệp) trước hôm nay trỏ vào trang không tồn tại, và phía máy chủ cũng không có
  // một procedure nào phục vụ chúng. Sáu procedure dưới đây là phần máy chủ của bốn màn
  // đó. Tất cả dùng `homeroomProcedure` — không dùng `careStaffProcedure`, vì bốn màn
  // này thao tác trên MỘT LỚP CỤ THỂ, mà tâm lý cụm thì không chủ nhiệm lớp nào.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Các lớp mình chủ nhiệm. Có procedure này thì màn hình mới hết phải đoán: một người
   * chủ nhiệm hai lớp mà giao diện chỉ hiện lớp đầu tiên là dạng "sai mà trông như thật".
   */
  getMyClasses: homeroomProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const { rows } = await client.query<{ id: string; code: string; student_count: number }>(
        `select c.id, c.code,
                (select count(*)::int from core.enrollments e
                  where e.class_id = c.id and e.valid_to is null) as student_count
           from core.classes c
          where c.id = any($1::uuid[])
          order by c.code`,
        [ctx.homeroomClassIds],
      );
      return GetMyClassesOutput.parse({
        classes: rows.map((r) => ({
          classId: r.id,
          classCode: r.code,
          studentCount: r.student_count,
        })),
      });
    });
  }),

  /** Danh sách lớp kèm tình hình hôm đó — MỘT truy vấn, không vòng lặp N+1 theo em. */
  getClassRoster: homeroomProcedure.input(GetClassRosterInput).query(async ({ ctx, input }) => {
    const classId = requireMyClass(ctx.homeroomClassIds, input.classId);
    const onDate = input.onDate ?? toLocalIsoDate(new Date());

    return ctx.runWithDb(async (client) => {
      const className = await readClassCode(client, classId);

      const { rows } = await client.query<{
        student_id: string;
        student_code: string;
        full_name: string;
        status: string | null;
        checked_in_at: string | null;
        source: string | null;
        has_open_case: boolean;
        help_pending: boolean;
      }>(
        // Gốc là DANH SÁCH LỚP (core.enrollments) rồi LEFT JOIN các nguồn tín hiệu —
        // cùng lý do đã ghi ở getDashboard: lấy bảng check-in làm gốc thì em không
        // check-in sẽ biến mất khỏi chính danh sách lớp của mình.
        //
        // NGUỒN LÀ `attendance.checkins`, KHÔNG phải `attendance.checkins_care` (đổi lại
        // 01/08/2026). View `checkins_care` gác cột `mood` sau `core.can_read_mood()`, mà
        // sau 0044 cô không qua được cổng đó nữa — và view lọc theo DÒNG, nên mất mood là
        // mất cả dòng. Đo thật, cùng câu LEFT JOIN, cùng phiên Cô Lan: nguồn
        // `checkins_care` trả 5/5 em `status = NULL`; nguồn `attendance.checkins` trả 5/5
        // em `status = present`. Không đổi lại thì bảng lớp trắng toàn NULL và UI vẽ NULL
        // thành "Chưa điểm danh" — đâm thẳng vào [QĐ-3]. RLS `can_see_student` vẫn cho cô
        // đọc bảng gốc; chỉ cột cảm xúc là đóng, và câu này không chọn cột đó.
        //
        // `checked_in_at` chỉ có giá trị khi `source = 'app'`: xem lời giải thích dài
        // trong contract `ClassRosterEntry.checkedInAt`. Trước đây câu này trả
        // `occurred_at::text` thô nên màn hình nhận cả micro giây lẫn offset — mà thật ra
        // không màn nào vẽ nó, nên lỗi nằm im.
        `select e.student_id,
                s.student_code,
                s.full_name,
                c.status,
                case when c.source = 'app' then to_char(c.occurred_at, 'HH24:MI') end as checked_in_at,
                c.source,
                (cc.id is not null) as has_open_case,
                (h.student_id is not null) as help_pending
           from core.enrollments e
           join core.students s on s.id = e.student_id
           left join attendance.checkins c
             on c.student_id = e.student_id and c.occurred_on = $2::date and c.kind = 'in'
           left join care.care_cases cc
             on cc.student_id = e.student_id and cc.status = 'open'
           left join attendance.help_requests h
             on h.student_id = e.student_id and h.requested_on = $2::date and h.handled_at is null
          where e.class_id = $1 and e.valid_to is null
          order by s.full_name`,
        [classId, onDate],
      );

      return GetClassRosterOutput.parse({
        classId,
        className,
        asOfDate: onDate,
        students: rows.map((r) => ({
          studentId: r.student_id,
          studentCode: r.student_code,
          fullName: r.full_name,
          status: r.status as AttendanceStatus | null,
          checkedInAt: r.checked_in_at,
          source: r.source,
          hasOpenCase: r.has_open_case,
          helpPending: r.help_pending,
        })),
      });
    });
  }),

  /**
   * GVCN ghi/sửa điểm danh cho cả lớp trong một lần bấm.
   *
   * §9 — idempotent theo `checkins_uq (student_id, occurred_on, kind)`: gọi lại cùng
   * payload cho ra ĐÚNG cùng một output, không sinh dòng thứ hai.
   *
   * Hai thứ cố tình KHÔNG có trong câu upsert:
   *   · `source` ở nhánh DO UPDATE — 0025 không cấp quyền ghi cột này cho người dùng
   *     cuối, và đó là chủ ý: sửa được source là giả được "cô ghi hộ" trên dòng do app
   *     của em tạo. Dòng mới thì mang source='teacher' ngay từ INSERT.
   *   · `mood` — điểm danh là việc của cô, cảm xúc là lời của em. Cô không đặt hộ tâm
   *     trạng cho học sinh (§3).
   */
  markAttendance: homeroomProcedure.input(MarkAttendanceInput).mutation(async ({ ctx, input }) => {
    const classId = requireMyClass(ctx.homeroomClassIds, input.classId);

    return ctx.runWithDb(async (client) => {
      // JOIN với core.enrollments là hàng rào thứ nhất (em phải thuộc ĐÚNG lớp này);
      // RLS + policy checkins_*_by_homeroom (0030) là hàng rào thứ hai. Không tầng nào
      // tin tầng kia tử tế — cùng nguyên tắc đã dùng ở acknowledgeLate.
      const { rows } = await client
        .query<{ student_id: string }>(
          `insert into attendance.checkins (student_id, occurred_on, kind, status, source, confirmed_by)
           select e.student_id, $2::date, 'in', w.status, 'teacher', core.current_user_id()
             from unnest($3::uuid[], $4::text[]) as w(student_id, status)
             join core.enrollments e
               on e.student_id = w.student_id and e.valid_to is null and e.class_id = $1
           on conflict (student_id, occurred_on, kind)
           do update set status = excluded.status, confirmed_by = core.current_user_id()
           returning student_id`,
          [
            classId,
            input.occurredOn,
            input.entries.map((e) => e.studentId),
            input.entries.map((e) => e.status),
          ],
        )
        .catch(asScopeError);

      const applied = rows.length;
      return MarkAttendanceOutput.parse({
        applied,
        skipped: input.entries.length - applied,
      });
    });
  }),

  /**
   * Danh sách Báo cáo Trưởng thành của lớp trong một tuần, kèm trạng thái duyệt VÀ bản
   * xem trước đúng thứ phụ huynh sẽ đọc.
   *
   * Em chưa có dòng nào trong sổ duyệt thì hiện `pending` — KHÔNG tạo sẵn dòng `pending`
   * trong bảng: sổ chỉ ghi việc con người đã quyết, im lặng không phải quyết định.
   *
   * Bản xem trước (`preview`) thêm 31/07/2026. Trước đó procedure này chỉ trả
   * `checkinDays`/`happyDays` — hai con số vận hành — nên GVCN bấm "Duyệt gửi phụ huynh"
   * mà chưa từng nhìn thấy câu chữ mình đang ký. Ký một thứ mình không đọc được là chữ
   * ký trang trí, và nó nằm ngay trên đường dữ liệu trẻ em đi ra khỏi trường.
   *
   * MỘT truy vấn cho cả lớp, không vòng lặp N+1: `roster` là gốc (danh sách lớp), ba
   * nguồn số liệu nối vào bằng LEFT JOIN nên em không có dữ liệu nào vẫn còn nguyên
   * trong danh sách — cùng nguyên tắc đã ghi ở getDashboard/getClassRoster.
   */
  listReportApprovals: homeroomProcedure
    .input(ListReportApprovalsInput)
    .query(async ({ ctx, input }) => {
      const classId = requireMyClass(ctx.homeroomClassIds, input.classId);
      const weekStart = mondayIso(input.weekStart);

      return ctx.runWithDb(async (client) => {
        const className = await readClassCode(client, classId);

        const { rows } = await client.query<{
          student_id: string;
          student_code: string;
          full_name: string;
          status: string | null;
          reviewed_at: string | null;
          note: string | null;
          checkin_days: number;
          streak_days: number;
        }>(
          `with roster as (
             select e.student_id, s.student_code, s.full_name
               from core.enrollments e
               join core.students s on s.id = e.student_id
              where e.class_id = $1 and e.valid_to is null
           ),
           -- attendance.checkins, KHÔNG phải checkins_care: view kia lọc theo DÒNG sau
           -- core.can_read_mood(), nên với cô nó trả 0 dòng và checkin_days tụt về 0 cho
           -- CẢ LỚP. Một bản xem trước ghi "0 ngày đi học" cho em đi đủ 5 buổi là thứ cô
           -- ký nhầm mà không có cách nào biết.
           --
           -- KHÔNG còn happy_days ở đây. Số ngày "Vui" đọc từ cột cảm xúc, mà ADR-026
           -- đóng cột đó với cô. Không thay bằng 0: xem ReportApprovalRow.happyDays.
           week_stats as (
             select r.student_id,
                    count(*) filter (where c.kind = 'in')::int as checkin_days
               from roster r
               left join attendance.checkins c
                 on c.student_id = r.student_id
                and c.occurred_on between $2::date and $2::date + 4
              group by r.student_id
           ),
           -- Chuỗi ngày đi học LIÊN TIẾP tính tới hôm nay — sao đúng cách đếm của
           -- buildGrowthReport (report.ts): ngày trừ đi thứ tự đếm lùi cho ra một hằng
           -- số chung cho mọi ngày liền mạch; chuỗi đang chạy là nhóm mang giá trị
           -- current_date + 1. Đây là số phụ huynh đọc trong dòng "chuỗi N ngày", nên
           -- nó KHÔNG bó trong tuần đang duyệt.
           streaks as (
             select t.student_id, count(*)::int as streak_days
               from (
                 select c.student_id,
                        c.occurred_on + row_number() over (
                          partition by c.student_id order by c.occurred_on desc
                        )::int as grp
                   from roster r
                   join attendance.checkins c on c.student_id = r.student_id
                  where c.kind = 'in'
                    and c.status in ('present','late')
                    and c.occurred_on <= current_date
               ) t
              where t.grp = current_date + 1
              group by t.student_id
           )
           select r.student_id,
                  r.student_code,
                  r.full_name,
                  a.status,
                  a.reviewed_at::text as reviewed_at,
                  a.note,
                  coalesce(w.checkin_days, 0) as checkin_days,
                  coalesce(st.streak_days, 0) as streak_days
             from roster r
             left join report.growth_report_approvals a
               on a.student_id = r.student_id and a.week_start = $2::date
             left join week_stats w on w.student_id = r.student_id
             left join streaks st on st.student_id = r.student_id
            order by r.full_name`,
          [classId, weekStart],
        );

        return ListReportApprovalsOutput.parse({
          classId,
          className,
          weekStart,
          rows: rows.map((r) => ({
            studentId: r.student_id,
            studentCode: r.student_code,
            fullName: r.full_name,
            status: (r.status ?? "pending") as "pending" | "approved" | "rejected",
            reviewedAt: r.reviewed_at,
            note: r.note,
            checkinDays: r.checkin_days,
            // `null` = "cô không được phép biết", KHÔNG phải "em không có ngày vui nào".
            happyDays: null,
            preview: buildReportPreview({
              checkinDays: r.checkin_days,
              happyDays: null,
              streakDays: r.streak_days,
            }),
          })),
        });
      });
    }),

  /**
   * Duyệt (hoặc trả lại) báo cáo của NHIỀU em trong một lời gọi (06/08/2026).
   *
   * Chủ đầu tư, cùng ngày với ADR-029: "báo cáo thì cũng có thể gửi hàng loạt, hoặc sửa,
   * hoặc trả lại gì đó hàng loạt". Màn duyệt bắt cô ký từng em một — một lớp 40 em là 40
   * cú bấm cho một quyết định cô đã ra từ lúc đọc xong danh sách.
   *
   * ── MẶC ĐỊNH KHÔNG GHI ĐÈ; SỬA LÀ MỘT ĐƯỜNG RIÊNG (ADR-031) ──────────────────
   * `p_ghi_de = false` (mặc định): hàm chỉ chạm dòng `status = 'pending'`. Đó là hàng rào,
   * không phải hạn chế tạm — "Chọn tất cả" trên một màn đã cũ vài phút sẽ ôm theo cả những
   * em vừa được đồng nghiệp (hoặc chính cô ở tab khác) TRẢ LẠI, và một cú bấm "Duyệt gửi
   * phụ huynh" không được lật ngược chữ ký người khác mà không ai thấy. Cùng ngữ nghĩa mà
   * `attendance.decide_late_checkins` (0053) đã chốt cho khối gửi muộn.
   *
   * `p_ghi_de = true`: đè được lên `approved`/`rejected`, và cái giá là lý do BẮT BUỘC —
   * kể cả khi đổi sang `approved` — cộng một dòng `report.report_decisions` cho mỗi lượt
   * (`from_status · to_status · decided_by · decided_at · reason · client_mutation_id`).
   * Cờ phải do người gọi khai tường minh: một mặc định "đè cho tiện" là đúng thứ ADR-031
   * sinh ra để chặn.
   *
   * ADR-031 ghi thẳng giới hạn, và không chỗ nào trong mã này được nói khác: sổ vết trả
   * lời được "ai đổi, lúc nào, vì sao", KHÔNG trả lời được "phụ huynh đã đọc bản nào".
   *
   * ── VÌ SAO GỌI HÀM SQL, KHÔNG VIẾT LẠI UPSERT Ở ĐÂY ──────────────────────────
   * Đổi trạng thái và ghi sổ phải là MỘT hành động nguyên tử. Viết hai câu ở tầng này thì
   * có một khoảnh khắc chữ ký đã đổi mà sổ chưa ghi, và mọi lỗi mạng rơi vào đúng khoảnh
   * khắc đó sinh ra thứ tệ nhất: một báo cáo đã đổi quyết định mà không ai biết ai đổi.
   * `report.decide_reports` (0054) làm cả hai trong một câu lệnh và là nơi DUY NHẤT biết
   * cách làm việc đó — y hệt vai trò `attendance.decide_late_checkins` ở ADR-029.
   *
   * Hàm là invoker (KHÔNG `security definer`), nên nó đi qua đúng RLS của người gọi:
   * `growth_report_approvals_write/_revise` (0032) và policy của sổ vết (0054). Phạm vi
   * TỪNG EM do `core.is_homeroom_of` trong chính hàm canh, không do một mệnh đề JOIN ở
   * tầng này — nên `classId` dưới đây KHÔNG còn là bộ lọc dòng, nó là lời khai của người
   * gọi và `requireMyClass` bác lời khai sai bằng FORBIDDEN. Em không thuộc lớp chủ nhiệm
   * nào của người gọi rơi vào `skipped`, KHÔNG ném lỗi: ném lỗi là dựng một kênh dò xem
   * một id có tồn tại và thuộc lớp nào.
   *
   * ── §9 ────────────────────────────────────────────────────────────────────────
   * `clientMutationId` NAY được lưu (0054: cột + unique một phần theo `(student_id,
   * week_start, client_mutation_id)`), nên gửi lại cùng mã là cùng MỘT quyết định trên cả
   * hai đường. Điều đó bắt buộc phải có trước đường ghi đè: ở đó không còn điều kiện
   * `status = 'pending'` nào để biến lượt thứ hai thành no-op.
   */
  decideReports: homeroomProcedure.input(DecideReportsInput).mutation(async ({ ctx, input }) => {
    // Không dùng giá trị trả về làm bộ lọc dòng (xem trên) — gọi để BÁC lời khai sai: một
    // GVCN khai lớp không phải của mình phải nhận FORBIDDEN rõ ràng, không phải một danh
    // sách rỗng trông như "lớp đó không có em nào".
    requireMyClass(ctx.homeroomClassIds, input.classId);
    const weekStart = mondayIso(input.weekStart);
    const note = input.note?.trim() || null;

    // Tầng chặn thứ hai của "phải có lý do" (tầng một là `.refine` trong hợp đồng, tầng ba
    // là chính hàm 0054). Cố ý chồng lên nhau: hợp đồng bị nới sau này mà không ai để ý thì
    // đây vẫn giữ. `ghiDeQuyetDinhDaCo` nằm trong điều kiện vì đổi một chữ ký ĐÃ GỬI sang
    // "đã duyệt" cũng là đổi — miễn lý do cho nhánh đó là mở lại đúng cửa vừa đóng.
    if ((input.decision === "rejected" || input.ghiDeQuyetDinhDaCo) && (note === null || note.length < 3)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: input.ghiDeQuyetDinhDaCo
          ? "Đổi một quyết định đã ký thì cần ghi lý do."
          : "Trả lại báo cáo thì cần ghi lý do để tuần sau sửa được.",
      });
    }

    // Bỏ id trùng TRƯỚC khi gọi hàm: `skipped` tính theo mảng thô sẽ dương một cách vô
    // nghĩa, và màn hình sẽ nói "bỏ qua 1 em" khi không có em nào bị bỏ (cùng lý lẽ với
    // `count(distinct)` ở 0053).
    const studentIds = [...new Set(input.studentIds)];

    return ctx.runWithDb(async (client) => {
      const { rows } = await client
        .query<{ updated: number; skipped: number }>(
          `select updated, skipped
             from report.decide_reports($1::uuid[], $2::date, $3::text, $4::text, $5::boolean, $6::uuid)`,
          [
            studentIds,
            weekStart,
            input.decision,
            note,
            input.ghiDeQuyetDinhDaCo,
            input.clientMutationId ?? null,
          ],
        )
        .catch(asScopeError);

      // Hàm luôn trả đúng một dòng; `?? 0` chỉ để TypeScript không phải đoán, không phải
      // để nuốt một ca rỗng — rỗng ở đây là lỗi hàm, và nó sẽ lộ ra ở test.
      return DecideReportsOutput.parse({
        updated: rows[0]?.updated ?? 0,
        skipped: rows[0]?.skipped ?? 0,
      });
    });
  }),

  /**
   * Duyệt (hoặc trả lại) báo cáo một tuần của một em.
   *
   * @deprecated 06/08/2026 — dùng `decideReports` (nhận mảng, kể cả mảng một phần tử).
   * Giữ lại vì client cũ (PWA đã cài trên máy thầy cô, chưa cập nhật) vẫn gọi tên này; gỡ
   * được khi không còn phiên bản nào gọi.
   *
   * KHÁC `decideReports` ở đúng một điểm, và điểm đó là lý do nó chưa gỡ được ngay: thủ
   * tục này GHI ĐÈ lên quyết định đã có, nên hôm nay nó là đường duy nhất sửa được một
   * chữ ký đã ký nhầm.
   *
   * §9 — upsert theo `(student_id, week_start)`. Nhánh DO UPDATE có điều kiện
   * `is distinct from`: bấm lại đúng quyết định cũ thì KHÔNG ghi đè `reviewed_at`, nên
   * lần gọi thứ hai trả về đúng dấu thời gian của lần quyết định thật — chứ không phải
   * giờ của cú double-tap. Đây là khác biệt giữa "idempotent" và "ghi đè cho giống".
   */
  approveReport: homeroomProcedure.input(ApproveReportInput).mutation(async ({ ctx, input }) => {
    const weekStart = mondayIso(input.weekStart);
    const note = input.note?.trim() || null;

    if (input.decision === "rejected" && !note) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Trả lại báo cáo thì cần ghi lý do để tuần sau sửa được.",
      });
    }

    return ctx.runWithDb(async (client) => {
      // `returning` chỉ trả dòng khi thật sự có GHI (chèn mới, hoặc update thoả WHERE).
      // Nhờ vậy "đã ghi lần này hay chưa" là một sự thật do Postgres trả lời, không phải
      // suy đoán theo dấu thời gian — bản đầu tiên so `reviewed_at` với `now() - 2s` và
      // sai ngay ở ca thường gặp nhất: double-tap trong vòng hai giây.
      const written = await client
        .query<{ id: string }>(
          `insert into report.growth_report_approvals
             (student_id, week_start, status, reviewer_id, reviewed_at, note)
           values ($1, $2::date, $3, core.current_user_id(), now(), $4)
           on conflict (student_id, week_start) do update
              set status = excluded.status,
                  reviewer_id = excluded.reviewer_id,
                  reviewed_at = now(),
                  note = excluded.note
            where report.growth_report_approvals.status is distinct from excluded.status
               or report.growth_report_approvals.note is distinct from excluded.note
           returning id`,
          [input.studentId, weekStart, input.decision, note],
        )
        .catch(asScopeError);

      // Đọc lại để hai lần gọi trả về CÙNG một output (lần hai không có `returning`).
      const { rows } = await client.query<{
        status: string;
        note: string | null;
        reviewed_at: string | null;
      }>(
        `select status, note, reviewed_at::text as reviewed_at
           from report.growth_report_approvals
          where student_id = $1 and week_start = $2::date`,
        [input.studentId, weekStart],
      );

      const row = rows[0];
      if (!row) {
        // Không chèn được mà cũng không đọc được: RLS chặn (em không thuộc lớp mình).
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Em này không thuộc lớp chủ nhiệm của thầy cô.",
        });
      }

      return ApproveReportOutput.parse({
        studentId: input.studentId,
        weekStart,
        status: row.status as "pending" | "approved" | "rejected",
        note: row.note,
        reviewedAt: row.reviewed_at,
        alreadyRecorded: written.rows.length === 0,
      });
    });
  }),

  /**
   * Nhật ký can thiệp của cả lớp — màn "Ghi chú can thiệp" đọc từ đây.
   *
   * Đây là ĐƯỜNG ĐỌC của tâm lý cụm (`careStaffProcedure`, không phải
   * `homeroomProcedure` như năm procedure GVCN phía trên). Vai đó ghi được can thiệp,
   * tắt được cờ khẩn và đóng được hồ sơ; không có đường này thì cô làm cả ba việc mà
   * chưa từng nhìn thấy hồ sơ. GVCN không mất gì: nhánh 1 của `requireCareClass` giữ
   * nguyên hành vi cũ (mặc định lớp chủ nhiệm, lớp đồng nghiệp → FORBIDDEN).
   *
   * Cột `note` ở đây là nhật ký HÀNH ĐỘNG ("đã gọi phụ huynh"), KHÔNG phải
   * `care.counselor_notes` — nội dung buổi tư vấn nằm ở bảng khác, phạm vi khác, và
   * migration 0035 vừa đóng nó lại với GVCN.
   */
  listClassInterventions: careStaffProcedure
    .input(ListClassInterventionsInput)
    .query(async ({ ctx, input }) => {
      return ctx.runWithDb(async (client) => {
        const classId = await requireCareClass(client, ctx.myScopes, input.classId);
        const className = await readClassCode(client, classId);

        const { rows } = await client.query<{
          id: string;
          student_id: string;
          student_name: string;
          action: string;
          note: string | null;
          occurred_at: string;
          actor_name: string | null;
          case_status: string;
        }>(
          // `core.users` chỉ mở SELECT cho CHÍNH MÌNH (policy users_self, 0009), nên
          // join thẳng lấy tên người ghi sẽ ra NULL với đồng nghiệp. Không bịa tên:
          // NULL → "Thầy cô khác" ở bước map bên dưới.
          `select i.id, cc.student_id, s.full_name as student_name,
                  i.action, i.note, i.occurred_at::text as occurred_at,
                  u.full_name as actor_name, cc.status as case_status
             from care.interventions i
             join care.care_cases cc on cc.id = i.case_id
             join core.students s on s.id = cc.student_id
             join core.enrollments e on e.student_id = cc.student_id and e.valid_to is null
             left join core.users u on u.id = i.actor_id
            where e.class_id = $1
            order by i.occurred_at desc
            limit $2::int`,
          [classId, input.limit],
        );

        return ListClassInterventionsOutput.parse({
          classId,
          className,
          rows: rows.map((r) => ({
            interventionId: r.id,
            studentId: r.student_id,
            studentName: r.student_name,
            action: r.action,
            note: r.note,
            occurredAt: r.occurred_at,
            actorName: r.actor_name ?? "Thầy cô khác",
            caseStatus: r.case_status as "open" | "closed",
          })),
        });
      });
    }),

  /**
   * MỘT em, mọi tín hiệu về em, trên một màn (gói "man-hinh-con-thieu-gvcn-hs").
   *
   * Vì sao cần: bảng "Lớp chủ nhiệm" và buồng lái đều CHỈ RA một cái tên ("Cần gặp thầy
   * cô", "Hồ sơ đang mở") rồi dừng ở đó — không có màn nào trả lời câu hỏi kế tiếp mà
   * giáo viên luôn hỏi: "em này mấy hôm nay thế nào?". Dấu hiệu hiện ra rồi trôi qua là
   * cách một hệ chăm sóc chết dần mà vẫn xanh trên mọi dashboard.
   *
   * BA HÀNG RÀO, không hàng nào tin hàng nào:
   *   1. `homeroomProcedure` — người gọi phải đang chủ nhiệm một lớp nào đó.
   *   2. `requireMyClass` — `classId` client gửi phải là lớp CỦA MÌNH.
   *   3. Câu SELECT đầu tiên đối chiếu em có ghi danh ĐANG HIỆU LỰC ở đúng lớp đó. Thiếu
   *      bước này thì đổi một tham số `studentId` trong request là đọc được hồ sơ chăm
   *      sóc của em lớp khác — RLS (`core.can_see_care`) vẫn chặn phần lớn, nhưng dựa
   *      vào một tầng duy nhất là cách lỗ hổng sinh ra (xem 0025).
   *
   * SÁU truy vấn nhỏ theo MỘT em thay vì một truy vấn ghép: đây là màn mở theo từng em
   * (không phải danh sách 40 dòng), nên không có N+1 nào để tránh, và mỗi câu đọc đúng
   * một bảng thì lần sau sửa một mục không kéo theo cả khối.
   */
  getStudentDetail: homeroomProcedure.input(GetStudentDetailInput).query(async ({ ctx, input }) => {
    const classId = requireMyClass(ctx.homeroomClassIds, input.classId);

    return ctx.runWithDb(async (client) => {
      const studentRes = await client.query<{
        student_code: string;
        full_name: string;
        class_code: string;
      }>(
        `select s.student_code, s.full_name, c.code as class_code
           from core.enrollments e
           join core.students s on s.id = e.student_id
           join core.classes c on c.id = e.class_id
          where e.class_id = $1 and e.valid_to is null and e.student_id = $2`,
        [classId, input.studentId],
      );
      const student = studentRes.rows[0];
      if (!student) {
        // FORBIDDEN chứ không phải NOT_FOUND: hai câu trả lời khác nhau cho "em không
        // tồn tại" và "em tồn tại nhưng ở lớp khác" là một kênh dò danh sách học sinh.
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Em này không có trong danh sách lớp chủ nhiệm của thầy cô.",
        });
      }

      const boundsRes = await client.query<{ from_date: string; to_date: string }>(
        "select (current_date - ($1::int - 1))::text as from_date, current_date::text as to_date",
        [input.days],
      );
      const bounds = boundsRes.rows[0] ?? { from_date: "", to_date: "" };

      const checkinRes = await client.query<{
        occurred_on: string;
        status: string | null;
        checked_in_at: string | null;
        source: string | null;
      }>(
        // Nguồn đổi từ `attendance.checkins_care` về `attendance.checkins` (01/08/2026),
        // cùng lý do đã ghi dài ở `getClassRoster`: view kia lọc theo DÒNG, nên sau 0044
        // lịch của cô trắng trơn và mọi ngày em đi học đầy đủ đọc ra thành "chưa có dữ
        // liệu". Cột `mood` biến mất khỏi câu SELECT — đó là [QĐ-1], không phải sơ suất.
        //
        // `checked_in_at` chỉ có nghĩa khi `source = 'app'`: dòng cô ghi hộ mang giờ cô
        // bấm Lưu (đo thật: một ngày cách đây 30 hôm mang "giờ check-in" là 03:28 sáng
        // nay), dòng gửi bù mang giờ máy chủ nhận. In giờ đó như giờ em vào lớp là bịa.
        `select occurred_on::text,
                status,
                case when source = 'app' then to_char(occurred_at, 'HH24:MI') end as checked_in_at,
                source
           from attendance.checkins
          where student_id = $1 and kind = 'in' and occurred_on >= $2::date
          order by occurred_on desc`,
        [input.studentId, bounds.from_date],
      );

      // Cùng cửa sổ với dải check-in để hai khối trên màn nói về cùng một quãng thời
      // gian. `note` đi ra ở đây — xem lời giải thích dài trong contract StudentHelpRequest.
      const helpRes = await client.query<{
        id: string;
        requested_on: string;
        requested_at: string;
        topic: string | null;
        urgency: string | null;
        note: string | null;
        handled_at: string | null;
      }>(
        // `id` đi ra màn hình từ 01/08/2026: nút "Cô đã gặp em rồi" gửi khoá chính, không
        // còn gửi ngày suy từ một trường hiển thị (xem `acknowledgeHelpRequest`).
        `select id, requested_on::text, requested_at::text, topic, urgency, note, handled_at::text
           from attendance.help_requests
          where student_id = $1 and requested_on >= $2::date
          order by requested_on desc`,
        [input.studentId, bounds.from_date],
      );

      // KHÔNG bó trong cửa sổ ngày: một hồ sơ mở từ tháng trước mà chưa đóng là thứ cô
      // phải thấy đầu tiên, không phải thứ biến mất vì lịch sử đã trôi quá 14 ngày.
      const caseRes = await client.query<{
        id: string;
        status: string;
        opened_at: string;
        closed_at: string | null;
      }>(
        `select id, status, opened_at::text, closed_at::text
           from care.care_cases
          where student_id = $1
          order by (status = 'open') desc, opened_at desc
          limit 10`,
        [input.studentId],
      );

      const interventionRes = await client.query<{
        id: string;
        action: string;
        note: string | null;
        occurred_at: string;
        actor_name: string | null;
        case_status: string;
      }>(
        // `core.users` chỉ mở SELECT cho CHÍNH MÌNH (policy users_self, 0009) → tên đồng
        // nghiệp ra NULL. Không bịa tên: NULL → "Thầy cô khác" ở bước map.
        `select i.id, i.action, i.note, i.occurred_at::text as occurred_at,
                u.full_name as actor_name, cc.status as case_status
           from care.interventions i
           join care.care_cases cc on cc.id = i.case_id
           left join core.users u on u.id = i.actor_id
          where cc.student_id = $1
          order by i.occurred_at desc
          limit 20`,
        [input.studentId],
      );

      // Chỉ những tuần CÓ quyết định. Không dựng sẵn 6 dòng 'pending' cho 6 tuần gần
      // nhất: im lặng không phải một quyết định, và màn duyệt báo cáo (listReportApprovals)
      // mới là nơi trả lời "tuần này đã ký chưa".
      const approvalRes = await client.query<{
        week_start: string;
        status: string;
        reviewed_at: string | null;
        note: string | null;
      }>(
        `select week_start::text, status, reviewed_at::text, note
           from report.growth_report_approvals
          where student_id = $1
          order by week_start desc
          limit 6`,
        [input.studentId],
      );

      return GetStudentDetailOutput.parse({
        classId,
        className: student.class_code,
        asOfDate: toLocalIsoDate(new Date()),
        window: { days: input.days, fromDate: bounds.from_date, toDate: bounds.to_date },
        student: {
          studentId: input.studentId,
          studentCode: student.student_code,
          fullName: student.full_name,
        },
        checkins: checkinRes.rows.map((r) => ({
          occurredOn: r.occurred_on,
          status: r.status as AttendanceStatus | null,
          checkedInAt: r.checked_in_at,
          source: r.source,
        })),
        helpRequests: helpRes.rows.map((r) => ({
          helpRequestId: r.id,
          requestedOn: r.requested_on,
          requestedAt: r.requested_at,
          topic: r.topic as HelpRequestTopic | null,
          urgency: r.urgency as HelpRequestUrgency | null,
          note: r.note,
          handledAt: r.handled_at,
        })),
        careCases: caseRes.rows.map((r) => ({
          caseId: r.id,
          status: r.status as "open" | "closed",
          openedAt: r.opened_at,
          closedAt: r.closed_at,
        })),
        interventions: interventionRes.rows.map((r) => ({
          interventionId: r.id,
          studentId: input.studentId,
          studentName: student.full_name,
          action: r.action,
          note: r.note,
          occurredAt: r.occurred_at,
          actorName: r.actor_name ?? "Thầy cô khác",
          caseStatus: r.case_status as "open" | "closed",
        })),
        reportApprovals: approvalRes.rows.map((r) => ({
          weekStart: r.week_start,
          status: r.status as ReportApprovalStatus,
          reviewedAt: r.reviewed_at,
          note: r.note,
        })),
      });
    });
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // HAI MÀN CỦA TÂM LÝ CỤM (gói "man-hinh-tam-ly-cum", 31/07/2026)
  //
  // Vai `counselor` GHI được ba thứ nặng nhất của hệ chăm sóc — tắt cờ khẩn, ghi can
  // thiệp, ĐÓNG hồ sơ của một đứa trẻ — nhưng cho tới hôm nay không có màn nghiệp vụ
  // nào. `listClassInterventions` (mở 31/07 sáng) là một khe đọc, nhưng nó đòi biết
  // trước `classId`, mà cụm là nhiều lớp: cô không có đường nào để bắt đầu từ câu hỏi
  // thật của mình — "hôm nay ai đang chờ tôi?". Hai query dưới đây là đường đó.
  //
  // Cả hai đều là ĐỌC. Ba nút hành động trên màn dùng lại đúng ba mutation đã có
  // (acknowledgeHelpRequest · logIntervention · closeCase) — không viết đường ghi thứ
  // hai cho cùng một việc, và nhờ vậy §9 (idempotency) không phải kiểm lại từ đầu.
  //
  // HAI THỨ KHÔNG ĐỌC Ở ĐÂY — và sau ADR-026 chúng có HAI lý do khác hẳn nhau, đừng gộp:
  //
  //   · `attendance.checkins_care.mood` — KHÔNG phải bị cấm. Từ 01/08/2026 nhãn tại chỗ
  //     em nhập là "Chỉ thầy cô tâm lý đọc", và `core.can_read_mood()` = `is_me ∨
  //     in_my_cluster`: tâm lý cụm là vai DUY NHẤT còn đọc được nhật ký cảm xúc. Hai màn
  //     này không hiện nó chỉ vì chúng là màn QUẢN LÝ VIỆC ("hôm nay ai đang chờ tôi" ·
  //     "đọc gì trước khi đóng hồ sơ"), chưa phải màn đọc nhật ký. Đây là MỘT MÀN CÒN
  //     THIẾU, không phải một quyền bị chặn. Lý lẽ cũ ở chỗ này ("tâm lý cụm không phải
  //     thầy cô chủ nhiệm") nay ngược hướng, và để nguyên là dựng sẵn lý do cho người đọc
  //     sau cắt nốt quyền của vai cuối cùng còn nhìn thấy chuỗi ngày em không vui.
  //
  //   · `attendance.help_requests.note` — ĐÚNG là đang bị lời hứa chặn. Màn
  //     /can-gap-thay-co in cho em đọc trước khi gửi rằng phòng tâm lý chỉ đọc SAU một
  //     lần chuyển tuyến em đã đồng ý, và đường chuyển tuyến đó chưa tồn tại. RLS hiện
  //     cho phép; lời hứa in trên màn hình thì không, và lời hứa thắng.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Hộp việc của tâm lý cụm: mọi em trong cụm đang có hồ sơ chăm sóc mở HOẶC có tín
   * hiệu "cần gặp thầy cô" chưa ai xử lý.
   *
   * GỐC LÀ HỢP CỦA HAI NGUỒN, không phải bảng care_cases: một em vừa bấm "cần gặp thầy
   * cô" thì chưa có hồ sơ nào (hồ sơ chỉ sinh ra ở `resolveOpenCase`, tức khi đã có
   * người ghi can thiệp). Lấy hồ sơ làm gốc thì đúng nhóm cần gấp nhất lại là nhóm biến
   * mất khỏi danh sách — cùng lỗi "tín hiệu khẩn bị nuốt" đã ghi ở đầu file (số 3).
   *
   * BA HÀNG RÀO: `counselorProcedure` (có vai thật trong v_my_scopes) → lọc tường minh
   * theo `st.school_id = any(cụm)` → RLS `care_cases_scope`/`help_requests_scope`
   * (`core.can_see_care` = homeroom OR in_my_cluster). Không tầng nào tin tầng kia.
   */
  listClusterCases: counselorProcedure.input(ListClusterCasesInput).query(async ({ ctx, input }) => {
    return ctx.runWithDb(async (client) => {
      const cluster = await readMyCluster(client);

      // Vai counselor chưa được gán cơ sở nào: trả về rỗng KÈM `scope.schools = []` để
      // màn hình phân biệt được "cụm đang yên" với "chưa ai gán cụm cho tôi". Hai thứ
      // đó nhìn giống hệt nhau nếu chỉ trả một mảng rỗng.
      if (cluster.length === 0) {
        return ListClusterCasesOutput.parse({
          asOfDate: toLocalIsoDate(new Date()),
          scope: { schools: [] },
          totals: { openCases: 0, pendingHelp: 0, overQuietWindow: 0 },
          urgentWindowDays: URGENT_FALLBACK.windowDays,
          quietDays: EMOTION_FALLBACK_RULE.quietDays,
          rows: [],
        });
      }

      const requested = input.schoolId;
      if (requested && !cluster.some((s) => s.schoolId === requested)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cơ sở này không thuộc cụm của thầy cô." });
      }
      const schools = requested ? cluster.filter((s) => s.schoolId === requested) : cluster;
      const schoolIds = schools.map((s) => s.schoolId);

      const rules = await readClusterRules(client, schoolIds);
      const urgentWindows = schoolIds.map((id) => rules.get(id)?.urgentWindowDays ?? URGENT_FALLBACK.windowDays);
      const quietWindows = schoolIds.map((id) => rules.get(id)?.quietDays ?? EMOTION_FALLBACK_RULE.quietDays);

      const { rows } = await client.query<{
        student_id: string;
        student_code: string;
        full_name: string;
        class_code: string | null;
        school_name: string;
        case_id: string | null;
        case_status: string | null;
        opened_at: string | null;
        help_pending: boolean;
        help_requested_on: string | null;
        help_topic: string | null;
        help_urgency: string | null;
        intervention_count: number;
        last_intervention_at: string | null;
        days_since_last_action: number | null;
        over_quiet_window: boolean;
      }>(
        // Ngưỡng đi vào câu SQL dưới dạng THAM SỐ THEO TỪNG CƠ SỞ (bảng `rules` dựng từ
        // unnest), không phải một con số chung áp cho cả cụm: 0026 cho phép mỗi cơ sở
        // khai riêng, và gộp lại thành một số là làm hỏng đúng thứ §7 sinh ra để giữ.
        `with rules as (
           select * from unnest($1::uuid[], $2::int[], $3::int[])
             as r(school_id, urgent_window_days, quiet_days)
         ),
         open_help as (
           select h.student_id,
                  max(h.requested_on) as requested_on
             from attendance.help_requests h
             join core.students st on st.id = h.student_id
             join rules r on r.school_id = st.school_id
            where h.handled_at is null
              and h.requested_on >= current_date - r.urgent_window_days
            group by h.student_id
         ),
         cases as (
           select cc.student_id, cc.id, cc.status, cc.opened_at,
                  row_number() over (
                    partition by cc.student_id
                    order by (cc.status = 'open') desc, cc.opened_at desc
                  ) as rn
             from care.care_cases cc
             join core.students st on st.id = cc.student_id
             join rules r on r.school_id = st.school_id
            where cc.status = 'open' or $4::boolean
         ),
         inter as (
           select cc.student_id,
                  count(*)::int as n,
                  max(i.occurred_at) as last_at
             from care.interventions i
             join care.care_cases cc on cc.id = i.case_id
            group by cc.student_id
         ),
         subjects as (
           select student_id from open_help
           union
           select student_id from cases where rn = 1
         )
         select st.id as student_id,
                st.student_code,
                st.full_name,
                cl.code as class_code,
                sc.name as school_name,
                c.id as case_id,
                c.status as case_status,
                c.opened_at::text as opened_at,
                (oh.student_id is not null) as help_pending,
                oh.requested_on::text as help_requested_on,
                hr.topic as help_topic,
                hr.urgency as help_urgency,
                coalesce(iv.n, 0) as intervention_count,
                iv.last_at::text as last_intervention_at,
                case when iv.last_at is null then null
                     else (current_date - iv.last_at::date) end as days_since_last_action,
                coalesce(iv.last_at::date <= current_date - r.quiet_days, true) as over_quiet_window
           from subjects s
           join core.students st on st.id = s.student_id
           join core.schools sc on sc.id = st.school_id
           join rules r on r.school_id = st.school_id
           left join core.enrollments e on e.student_id = st.id and e.valid_to is null
           left join core.classes cl on cl.id = e.class_id
           left join cases c on c.student_id = st.id and c.rn = 1
           left join open_help oh on oh.student_id = st.id
           -- Chủ đề/mức khẩn của ĐÚNG lần bấm gần nhất còn treo. Cố tình KHÔNG lấy
           -- cột note: xem lời giải thích (b) ở contracts/care.ts.
           left join attendance.help_requests hr
             on hr.student_id = oh.student_id and hr.requested_on = oh.requested_on
           left join inter iv on iv.student_id = st.id
          order by (oh.student_id is not null) desc,
                   coalesce(iv.last_at, 'epoch'::timestamptz) asc,
                   st.full_name
          limit $5::int`,
        [schoolIds, urgentWindows, quietWindows, input.includeClosed, input.limit],
      );

      const mapped = rows.map((r) => ({
        studentId: r.student_id,
        studentCode: r.student_code,
        fullName: r.full_name,
        className: r.class_code,
        schoolName: r.school_name,
        caseId: r.case_id,
        caseStatus: r.case_status as "open" | "closed" | null,
        openedAt: r.opened_at,
        helpPending: r.help_pending,
        helpRequestedOn: r.help_requested_on,
        helpTopic: r.help_topic as HelpRequestTopic | null,
        helpUrgency: r.help_urgency as HelpRequestUrgency | null,
        interventionCount: Number(r.intervention_count),
        lastInterventionAt: r.last_intervention_at,
        daysSinceLastAction:
          r.days_since_last_action === null ? null : Number(r.days_since_last_action),
        overQuietWindow: r.over_quiet_window,
      }));

      return ListClusterCasesOutput.parse({
        asOfDate: toLocalIsoDate(new Date()),
        scope: { schools },
        totals: {
          openCases: mapped.filter((r) => r.caseStatus === "open").length,
          pendingHelp: mapped.filter((r) => r.helpPending).length,
          overQuietWindow: mapped.filter((r) => r.overQuietWindow).length,
        },
        // Cụm nhiều cơ sở khai ngưỡng khác nhau thì hai con số này là con số RỘNG NHẤT
        // trong cụm — dùng để viết một câu chú thích trên đầu màn ("đang nhìn lại N
        // ngày"). Việc đánh dấu từng dòng vẫn theo ngưỡng của CHÍNH cơ sở em đó
        // (`over_quiet_window` tính trong SQL), không theo con số gộp này.
        urgentWindowDays: Math.max(...urgentWindows),
        quietDays: Math.max(...quietWindows),
        rows: mapped,
      });
    });
  }),

  /**
   * MỘT em trong cụm: hồ sơ, nhật ký can thiệp, ghi chú tư vấn, tín hiệu khẩn.
   *
   * Đây là màn phải mở TRƯỚC KHI bấm "đóng hồ sơ" — chính lỗ hổng mà gói việc này vá:
   * trước hôm nay tâm lý cụm đóng được hồ sơ của một đứa trẻ mà không có đường nào nhìn
   * thấy hồ sơ đó. Quyền ghi rộng hơn quyền đọc không phải "chặt hơn"; đó là bắt người
   * ta quyết định trong bóng tối.
   *
   * `ghi chú tư vấn` (care.counselor_notes) CÓ mặt ở đây và chỉ ở đây: policy 0035 mở
   * đúng cho TÁC GIẢ và TÂM LÝ CỤM. Màn GVCN (`getStudentDetail`) không đọc bảng này —
   * hai màn trông giống nhau nhưng đọc hai tập dữ liệu khác nhau, và đó là chủ ý.
   */
  getClusterCaseDetail: counselorProcedure
    .input(GetClusterCaseDetailInput)
    .query(async ({ ctx, input }) => {
      return ctx.runWithDb(async (client) => {
        const cluster = await readMyCluster(client);
        const schoolIds = cluster.map((s) => s.schoolId);

        const studentRes = await client.query<{
          student_code: string;
          full_name: string;
          class_code: string | null;
          school_name: string;
        }>(
          `select st.student_code, st.full_name, cl.code as class_code, sc.name as school_name
             from core.students st
             join core.schools sc on sc.id = st.school_id
             left join core.enrollments e on e.student_id = st.id and e.valid_to is null
             left join core.classes cl on cl.id = e.class_id
            where st.id = $1 and st.school_id = any($2::uuid[])`,
          [input.studentId, schoolIds],
        );
        const student = studentRes.rows[0];
        if (!student) {
          // FORBIDDEN chứ không NOT_FOUND, và cùng một câu cho cả hai ca ("không tồn
          // tại" / "tồn tại nhưng ngoài cụm"): hai câu trả lời khác nhau là một kênh dò
          // danh sách học sinh (cùng lý lẽ với getStudentDetail).
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Em này không thuộc cụm chăm sóc của thầy cô.",
          });
        }

        const boundsRes = await client.query<{ from_date: string; to_date: string }>(
          "select (current_date - ($1::int - 1))::text as from_date, current_date::text as to_date",
          [input.days],
        );
        const bounds = boundsRes.rows[0] ?? { from_date: "", to_date: "" };

        // KHÔNG bó trong cửa sổ ngày: một hồ sơ mở từ tháng trước mà chưa đóng là thứ
        // phải thấy đầu tiên, không phải thứ biến mất vì lịch sử đã trôi quá cửa sổ.
        const caseRes = await client.query<{
          id: string;
          status: string;
          opened_at: string;
          closed_at: string | null;
        }>(
          `select id, status, opened_at::text, closed_at::text
             from care.care_cases
            where student_id = $1
            order by (status = 'open') desc, opened_at desc
            limit 10`,
          [input.studentId],
        );

        const interventionRes = await client.query<{
          id: string;
          action: string;
          note: string | null;
          occurred_at: string;
          actor_name: string | null;
          case_status: string;
        }>(
          // `core.users` chỉ mở SELECT cho CHÍNH MÌNH (policy users_self, 0009) → tên
          // đồng nghiệp ra NULL. Không bịa tên: NULL → "Thầy cô khác" ở bước map.
          `select i.id, i.action, i.note, i.occurred_at::text as occurred_at,
                  u.full_name as actor_name, cc.status as case_status
             from care.interventions i
             join care.care_cases cc on cc.id = i.case_id
             left join core.users u on u.id = i.actor_id
            where cc.student_id = $1
            order by i.occurred_at desc
            limit 50`,
          [input.studentId],
        );

        const noteRes = await client.query<{
          id: string;
          body: string;
          created_at: string;
          author_name: string | null;
          mine: boolean;
        }>(
          `select n.id, n.body, n.created_at::text as created_at,
                  u.full_name as author_name,
                  (n.author_id = core.current_user_id()) as mine
             from care.counselor_notes n
             join care.care_cases cc on cc.id = n.case_id
             left join core.users u on u.id = n.author_id
            where cc.student_id = $1
            order by n.created_at desc
            limit 50`,
          [input.studentId],
        );

        // KHÔNG chọn cột `note`. Xem lời giải thích (b) ở contracts/care.ts — lời hứa
        // in trên màn /can-gap-thay-co là ràng buộc kỹ thuật, và chỗ dễ vi phạm nhất
        // chính là một màn "gộp mọi thứ về một em" như màn này.
        const helpRes = await client.query<{
          id: string;
          requested_on: string;
          requested_at: string;
          topic: string | null;
          urgency: string | null;
          handled_at: string | null;
        }>(
          `select id, requested_on::text, requested_at::text, topic, urgency, handled_at::text
             from attendance.help_requests
            where student_id = $1 and requested_on >= $2::date
            order by requested_on desc`,
          [input.studentId, bounds.from_date],
        );

        const cases = caseRes.rows.map((r) => ({
          caseId: r.id,
          status: r.status as "open" | "closed",
          openedAt: r.opened_at,
          closedAt: r.closed_at,
        }));

        return GetClusterCaseDetailOutput.parse({
          asOfDate: toLocalIsoDate(new Date()),
          window: { days: input.days, fromDate: bounds.from_date, toDate: bounds.to_date },
          student: {
            studentId: input.studentId,
            studentCode: student.student_code,
            fullName: student.full_name,
            className: student.class_code,
            schoolName: student.school_name,
          },
          openCase: cases.find((c) => c.status === "open") ?? null,
          cases,
          interventions: interventionRes.rows.map((r) => ({
            interventionId: r.id,
            studentId: input.studentId,
            studentName: student.full_name,
            action: r.action,
            note: r.note,
            occurredAt: r.occurred_at,
            actorName: r.actor_name ?? "Thầy cô khác",
            caseStatus: r.case_status as "open" | "closed",
          })),
          counselorNotes: noteRes.rows.map((r) => ({
            noteId: r.id,
            body: r.body,
            createdAt: r.created_at,
            authorName: r.author_name ?? "Thầy cô khác",
            mine: r.mine,
          })),
          helpSignals: helpRes.rows.map((r) => ({
            helpRequestId: r.id,
            requestedOn: r.requested_on,
            requestedAt: r.requested_at,
            topic: r.topic as HelpRequestTopic | null,
            urgency: r.urgency as HelpRequestUrgency | null,
            handledAt: r.handled_at,
          })),
          // Hằng số, và cố ý không đọc từ DB: 0009 chỉ cấp policy SELECT cho
          // care.counselor_notes, không có INSERT nào — Hub CHƯA ghi được ghi chú tư
          // vấn. Nói thẳng bằng một cờ còn hơn hiện ô soạn thảo rồi bắn 42501 vào mặt
          // người dùng. Đổi thành true trong CÙNG PR với migration mở đường ghi.
          notesWritable: false,
        });
      });
    }),
});
