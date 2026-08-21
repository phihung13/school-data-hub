// packages/core/contracts/care.ts — router `care`, phạm vi GĐ1: buồng lái GVCN rút gọn.
// GĐ2 (chuyển tâm lý cụm, cờ B/C học thuật-hành vi) chưa có contract ở đây — chưa xây (DESIGN-GUIDELINES).
import { z } from "zod";
import { HelpRequestTopic, HelpRequestUrgency } from "./checkin.ts";
import { GlowItem, GrowItem } from "./report.ts";

/**
 * Ngày dạng ISO `YYYY-MM-DD` — không nhận timestamp để không lẫn múi giờ.
 *
 * Khai ngay đầu file (dời lên 01/08/2026): trước đó nó nằm giữa file nên mọi schema đứng
 * trước phải dùng `z.string()` trần, và một trường ngày không được kiểm hình dạng là chỗ
 * `"2026-8-1"` hay một timestamp đầy đủ lọt vào rồi so sánh chuỗi sai lặng lẽ.
 */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải ở dạng YYYY-MM-DD");

/**
 * Một lần em bấm "cần gặp thầy cô" mà chưa ai xử lý — ĐI KÈM ID THẬT.
 *
 * Vì sao phải có `helpRequestId` (lỗi tái hiện được trên hub_dev 01/08/2026): nút "Cô đã
 * gặp em rồi" trước đây gửi `{ studentId, requestedOn: flag.asOfDate }`, mà `asOfDate`
 * của buồng lái là `greatest(ngày check-in gần nhất, ngày yêu cầu treo gần nhất)`. Em Lê
 * Tiến Dũng có hai yêu cầu treo (31/07 và 01/08) và một buổi sáng 01/08 vui vẻ; cú bấm
 * đầu tắt dòng 01/08, rồi `asOfDate` VẪN là 01/08 vì ngày check-in che mất ngày yêu cầu
 * còn lại — mọi cú bấm sau đó khớp 0 dòng và màn hình in "Người khác đã xử lý trước rồi."
 * trong khi yêu cầu 31/07 treo nguyên tới hết cửa sổ 14 ngày. Cờ khẩn KHÔNG tắt được từ
 * buồng lái.
 *
 * `attendance.help_requests` đã có khoá chính `id uuid` từ đầu. Khoá tự nhiên suy từ một
 * trường hiển thị là cách lỗi này sinh ra; gửi thẳng id là cách nó không sinh lại được.
 */
export const OpenHelpRequest = z.object({
  helpRequestId: z.string().uuid(),
  requestedOn: IsoDate,
  urgency: HelpRequestUrgency.nullable(),
});
export type OpenHelpRequest = z.infer<typeof OpenHelpRequest>;

/**
 * Nhịp sinh ra một cờ. Buồng lái GVCN trộn HAI nhịp trong cùng một danh sách, nên
 * mỗi thẻ phải tự khai mình thuộc nhịp nào ([QĐ-2], 01/08/2026).
 *
 *   · `tuc_thi`  — tính thẳng từ nguồn ngay trong lượt gọi này (`attendance.help_requests`).
 *                  Em bấm nút lúc 09:00 thì lượt tải kế tiếp đã thấy. Đo trên hub_dev:
 *                  ghi 195 ms + lượt đọc kế tiếp 226 ms = 421 ms từ nút em tới màn cô.
 *   · `quet_dem` — do `care.run_flag_engine` sinh ra theo lượt quét (`ops.job_schedule`
 *                  khai `flag_engine` mỗi 1 ngày). Dữ liệu hôm nay chỉ thành cờ ở lượt
 *                  chạy sau; engine ngủ một đêm là cô không có cờ E_MOOD nào cả.
 *
 * Người đọc một bảng gộp hai nhịp mà không biết là đang bị chính bảng đó đánh lừa: cờ
 * khẩn vắng mặt nghĩa là "chưa em nào bấm", còn cờ cảm xúc vắng mặt có thể chỉ nghĩa là
 * "bộ quét chưa chạy". Hai sự vắng mặt khác nghĩa nhau thì không được vẽ giống nhau.
 */
export const FlagCadence = z.enum(["tuc_thi", "quet_dem"]);
export type FlagCadence = z.infer<typeof FlagCadence>;

/**
 * `detail` của một cờ, NHÌN TỪ PHÍA GVCN. Trước 01/08/2026 đây là `z.record(z.unknown())`
 * và router nhồi vào đó `negativeDays`, `negativeDaysInWindow`, `negativeStreak`, `mode`,
 * `threshold` — tức là số ngày em có tâm trạng xấu, đi thẳng ra trình duyệt của cô.
 *
 * ADR-026 (quyết định chủ đầu tư 01/08/2026) cắt quyền đọc nhật ký cảm xúc của GVCN.
 * DESIGN-GUIDELINES §9 ghi ba thứ CẤM in phía GVCN vì cả ba đều nói nhiều hơn "cần để
 * ý": chiều của cảm xúc, SỐ NGÀY, và mọi trích dẫn từ ô nhập của em. Và ghi rõ: cắt tại
 * contract, không chỉ ẩn bằng CSS — ẩn bằng CSS thì số vẫn đi tới máy của cô, chỉ cần mở
 * tab Network là đọc được.
 *
 * Nên hình dạng này là schema ĐÓNG (`.strict()` ở chỗ dùng không cần thiết vì zod mặc
 * định bỏ field lạ, nhưng cái quan trọng là: không có khoá nào ở đây chở con số cảm xúc).
 * Ai muốn thêm khoá mới phải đọc lại §9 trước.
 */
export const FlagDetail = z.object({
  cadence: FlagCadence,
  /**
   * Rỗng = không có yêu cầu "cần gặp thầy cô" nào đang treo. Nút "Cô đã gặp em rồi" gửi
   * ĐÚNG tập id đang nằm trong mảng này, không gửi mệnh lệnh đóng-hết: buồng lái không
   * tự làm tươi liên tục, nên "đóng hết yêu cầu treo của em" sẽ nuốt mất lời em vừa gửi
   * sau lần tải màn hình gần nhất — và em nhận dấu "cô đã gặp em rồi" cho một lời chưa
   * ai đọc.
   */
  openHelpRequests: z.array(OpenHelpRequest),
  /** Đã có người ghi can thiệp trong cửa sổ "yên" (`care.thresholds`) — xuống cuối danh sách, KHÔNG xoá. */
  recentlyHandled: z.boolean(),
});
export type FlagDetail = z.infer<typeof FlagDetail>;

export const FlagSummary = z.object({
  // KHÔNG ép .uuid(): cờ E_MOOD nay đọc từ `care.flags` nên mang UUID thật, nhưng cờ
  // E_URGENT vẫn được tính trực tiếp trong lượt gọi ([QĐ-2] — báo NGAY, không chờ quét
  // đêm) nên flagId của nó là chuỗi ghép "studentId:urgent:requestedOn". Hai nguồn, một
  // kiểu chung: string.
  flagId: z.string(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  className: z.string(),
  ruleCode: z.string(),
  asOfDate: z.string(), // date ISO
  detail: FlagDetail,
  caseId: z.string().uuid().nullable(),
  caseStatus: z.enum(["open", "closed"]).nullable(),
});
export type FlagSummary = z.infer<typeof FlagSummary>;

export const PendingLateCheckin = z.object({
  checkinId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  occurredOn: z.string(),
  // GIỜ GỬI, thêm 06/08/2026. Cột `attendance.checkins.occurred_at` có từ 0004 nhưng buồng
  // lái chưa bao giờ đọc nó, nên cô chỉ thấy "1 check-in gửi muộn" mà không biết em bấm lúc
  // mấy giờ — trong khi đó chính là dữ kiện để quyết định có xác nhận hay không (bấm lúc
  // 07:55 khác hẳn bấm lúc 10:20). Chuỗi "HH:MM" giờ địa phương, máy chủ đã đổi múi giờ.
  occurredAtTime: z.string(),
});
export type PendingLateCheckin = z.infer<typeof PendingLateCheckin>;

/**
 * Ba kết luận cô có thể ghi cho một check-in gửi muộn.
 *
 * `absent` là quyết định MỚI ngày 06/08/2026 (ADR-029) và nó sửa một điều đã chốt: ADR-007
 * cấm GVCN chuyển thẳng sang `absent` với lý lẽ "gửi muộn ≠ vắng". Lý lẽ đó vẫn đúng ở chỗ
 * nó sinh ra — MÁY không được tự suy ra vắng từ việc gửi muộn. Cái ADR-029 mở là quyền của
 * một CON NGƯỜI biết chuyện gì đã xảy ra trong lớp mình: cô nhìn thấy chỗ ngồi trống, và
 * hôm nay cô không có cách nào ghi lại điều đó ngoài việc mở CSDL lên sửa tay.
 *
 * Đổi lại, mở quyền thì phải mở kèm sổ: mọi kết luận khác `present` đều BẮT BUỘC có lý do
 * và được ghi vào `attendance.late_decisions` (ai · lúc nào · từ trạng thái nào sang trạng
 * thái nào · vì sao). Quyền không có vết là quyền không ai soát được.
 */
export const LATE_DECISIONS = ["present", "late", "absent"] as const;
export const LateDecision = z.enum(LATE_DECISIONS);
export type LateDecision = z.infer<typeof LateDecision>;

/** Nhãn tiếng Việt dùng chung cho nút bấm và cho sổ — không chép tay ở từng màn. */
export const LATE_DECISION_LABEL: Record<LateDecision, string> = {
  present: "Có mặt",
  late: "Đi muộn",
  absent: "Vắng",
};

export const DecideLateCheckinsInput = z
  .object({
    // Trần 60: một GVCN có tối đa ~45 em; con số này chặn một lệnh quét cả trường lọt qua
    // vì lỗi phía client, chứ không phải để hạn chế cô.
    checkinIds: z.array(z.string().uuid()).min(1).max(60),
    decision: LateDecision,
    reason: z.string().trim().min(3).max(300).optional(),
    // §9 idempotency: gửi lại cùng mã = cùng một quyết định, không phải quyết định thứ hai.
    clientMutationId: z.string().uuid().optional(),
  })
  .refine((v) => v.decision === "present" || (v.reason?.length ?? 0) >= 3, {
    // Bắt ở TẦNG HỢP ĐỒNG chứ không chỉ ở ô nhập: một màn hình khác gọi thẳng API vẫn phải
    // đưa lý do. Ràng buộc tương ứng còn được database canh lần nữa (0053).
    message: "Phải ghi lý do khi kết luận khác 'Có mặt'",
    path: ["reason"],
  });
export type DecideLateCheckinsInput = z.infer<typeof DecideLateCheckinsInput>;

export const DecideLateCheckinsOutput = z.object({
  /** Số dòng THẬT SỰ đổi trạng thái trong lượt này. */
  updated: z.number().int().min(0),
  /** Số dòng bỏ qua vì không còn ở `queued_late` (ai đó đã xử trước, hoặc gọi lại lần hai). */
  skipped: z.number().int().min(0),
});
export type DecideLateCheckinsOutput = z.infer<typeof DecideLateCheckinsOutput>;

/**
 * Vì sao buồng lái GVCN KHÔNG còn ô "Cảm xúc lớp hôm nay".
 *
 * Bỏ một ô khỏi màn hình rồi im lặng là hỏng theo kiểu khác: cô mở buồng lái quen thuộc,
 * thấy thiếu một ô, và kết luận màn hình đang lỗi. Nên chỗ đó nay có MỘT câu nói rõ đây
 * là quy định, kèm mã lý do do máy chủ phát ra — màn hình không tự suy.
 *
 * `readable = false` KHÔNG đồng nghĩa "hôm nay chưa em nào ghi tâm trạng". Đó chính là
 * hai câu trả lời mà một mảng rỗng gộp làm một, và là lý do trường này là một object có
 * `reason` chứ không phải một mảng rỗng.
 */
export const MoodVisibility = z.object({
  readable: z.boolean(),
  /**
   * `chi_tam_ly` — chỉ chính em và thầy cô tâm lý cụm đọc được nhật ký cảm xúc
   * (`core.can_read_mood()`, migration 0044, ADR-026). `null` khi `readable = true`.
   */
  reason: z.enum(["chi_tam_ly"]).nullable(),
});
export type MoodVisibility = z.infer<typeof MoodVisibility>;

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

/**
 * Một luật mà bộ quét KHÔNG chấm trong lần chạy vừa rồi, kèm lý do.
 *
 * Vì sao đi ra tới màn hình chứ không nằm lại trong `ops.job_runs.metrics`: đo thật trên
 * hub_dev ngày 01/08/2026, mỗi lần quét bỏ qua HAI luật (`C_CEFR` = chưa cài đặt,
 * `C_MASTERY` = chưa khai nguồn tươi) và **không màn hình nào nói ra**. Một GVCN nhìn
 * buồng lái sạch cờ hôm nay đang đọc kết quả của 4/6 luật mà tưởng là 6/6 — đó là
 * "im lặng bị đọc thành kết luận" ở đúng mức nguy hiểm nhất: mức nội dung.
 *
 * `lyDo` giữ nguyên mã tiếng Việt do `care.run_flag_engine` sinh (`chua_cai_dat`,
 * `chua_khai_nguon_tuoi`, `khong_co_nguong_dang_bat`, `nguon_het_tuoi`) — KHÔNG dịch ở
 * tầng hợp đồng: engine là nơi duy nhất biết vì sao nó bỏ qua, dịch ở đây là tạo bản
 * thứ hai của một sự thật.
 */
export const SkippedRule = z.object({
  ruleCode: z.string(),
  lyDo: z.string(),
});
export type SkippedRule = z.infer<typeof SkippedRule>;

/**
 * Trạng thái bộ quét cờ, đọc từ `ops.v_job_health` (0041) — KHÔNG phải một dấu thời gian trần.
 *
 * Vì sao chín giá trị chứ không phải một `lastScanAt: string | null`: `null` gộp làm một
 * ba câu trả lời hoàn toàn khác nhau — "chưa ai quét lần nào", "bộ quét vừa hỏng", và
 * "màn hình không đọc nổi sổ nhật ký". Cả ba đều hiện ra dưới dạng một bảng cờ trống, và
 * bảng cờ trống thì đọc y hệt "lớp mình đang ổn". Đó là hình dạng hỏng mà RULES Rev F
 * điều 8 cấm, và là lý do buồng lái phải phân biệt được chúng ngay trên màn.
 *
 * Bảy giá trị đầu là `state` của `ops.v_job_health`; hai giá trị cuối do tầng API thêm vì
 * view không thể tự nói ra chúng:
 *   · `chua_khai`      — `ops.job_schedule` KHÔNG có dòng nào cho `flag_engine`. Khác
 *                        `chua_chay`: ở đây không phải "job chưa chạy" mà là "hệ chưa
 *                        biết job này tồn tại", nên cũng không có gì quá hạn để báo.
 *   · `khong_doc_duoc` — câu đọc `ops.v_job_health` ném lỗi (mất quyền, view bị xoá).
 *                        Trả về đây thay vì nuốt lỗi rồi để `lastScanAt = null`: không
 *                        đọc được KHÔNG phải là chưa quét.
 */
export const ScanState = z.enum([
  "ok",
  "dang_chay",
  "chua_chay",
  "that_bai",
  "treo",
  "qua_han",
  "tat",
  "chua_khai",
  "khong_doc_duoc",
]);
export type ScanState = z.infer<typeof ScanState>;

export const ScanHealth = z.object({
  jobName: z.string(),
  state: ScanState,
  /** Cột duy nhất màn hình trực cần đọc để biết "có phải kêu lên không" (0041). */
  needsAttention: z.boolean(),
  /** Lần chạy XONG THÀNH CÔNG gần nhất — con số đứng sau câu "Quét lúc HH:mm". */
  lastSuccessAt: z.string().nullable(),
  /** Lần chạy gần nhất KẾT THÚC (kể cả hỏng). Khác `lastSuccessAt` là dấu hiệu vừa có lỗi. */
  lastFinishedAt: z.string().nullable(),
  /**
   * Nhịp chạy đã khai trong `ops.job_schedule`, đổi ra giờ. Đi ra màn hình để câu cảnh báo
   * nói được "đáng lẽ chạy mỗi 24 giờ" mà KHÔNG viết chết con số nào trong mã (mệnh lệnh 7):
   * ngưỡng quá hạn là `expected_every + grace`, khai trong bảng, không khai trong TypeScript.
   */
  expectedEveryHours: z.number().nullable(),
  graceHours: z.number().nullable(),
  rulesSkipped: z.array(SkippedRule),
  /** `ops.job_runs.degraded_sources` của LẦN CHẠY ĐÓ — nguồn mà engine đã thật sự bỏ qua. */
  degradedSources: z.array(z.string()),
});
export type ScanHealth = z.infer<typeof ScanHealth>;

export const GetDashboardOutput = z.object({
  /**
   * Lớp mà MỌI con số bên dưới thuộc về. Bắt buộc, không optional: thiếu nó thì màn hình
   * chỉ có `className` để đối chiếu, mà mã lớp trùng nhau giữa hai cơ sở là chuyện có
   * thật — bộ chọn lớp sẽ sáng nhầm nút và không ai nhận ra.
   */
  classId: z.string().uuid(),
  className: z.string(),
  asOfDate: z.string(),
  /**
   * Giữ nguyên nghĩa cũ: `ops.job_runs.finished_at` của lần quét THÀNH CÔNG gần nhất.
   * Bằng đúng `scanHealth.lastSuccessAt` — không phải hai sự thật, chỉ là một lối đọc cũ
   * cho client chưa cập nhật. Client mới đọc `scanHealth`: `null` ở đây không phân biệt
   * được "chưa quét" với "không đọc được sổ", mà hai chuyện đó khác nhau.
   */
  lastScanAt: z.string().nullable(),
  /** Bộ quét cờ đêm có chạy không, chạy lúc nào, bỏ qua luật nào — xem `ScanHealth`. */
  scanHealth: ScanHealth,
  staleSources: z.array(z.string()), // ops.v_stale_sources — băng vàng ADR-016
  totals: z.object({
    checkinCount: z.number().int(),
    pendingLateCount: z.number().int(),
    absentCount: z.number().int(),
    totalStudents: z.number().int(), // 30/07/2026: "27/30" ở V10 cần mẫu số thật
    openCareCases: z.number().int(), // 30/07/2026: "hồ sơ chăm sóc đang mở"
    /**
     * Sĩ số trừ số em ĐÃ CÓ một dòng điểm danh hôm nay ([QĐ-3], 01/08/2026).
     *
     * Vì sao phải là một con số riêng chứ không để cô tự trừ hai thẻ: thẻ "Vắng" đếm
     * `status = 'absent'`, nên buổi sáng chưa ai điểm danh thì nó bằng 0 và phụ đề in
     * "không có ai vắng" — một câu kết luận dựng từ im lặng. "Chưa ai ghi gì" và "đã ghi
     * và không ai vắng" là hai sự thật khác nhau, và chỉ con số này tách được chúng.
     */
    notCheckedInCount: z.number().int(),
  }),
  /** Vì sao không còn ô "Cảm xúc lớp hôm nay" — xem `MoodVisibility`. */
  moodVisibility: MoodVisibility,
  priorityFlags: z.array(FlagSummary), // E_URGENT tức thì + E_MOOD từ care.flags, sắp theo mức độ
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

/**
 * "Cô đã gặp em rồi" — tắt ĐÚNG những tín hiệu đang hiện trên màn.
 *
 * `requestedOn` (khoá tự nhiên suy từ một trường hiển thị) bị gỡ 01/08/2026. Lý do đầy
 * đủ ở `OpenHelpRequest`; tóm tắt: `flag.asOfDate` không phải ngày của yêu cầu, nên nút
 * khớp nhầm dòng rồi tự khoá vĩnh viễn.
 *
 * Vì sao là MẢNG id chứ không phải một id: một em có thể có nhiều yêu cầu treo (ba em ở
 * đúng tình trạng đó trên hub_dev hôm nay), và cô nhìn thấy cả cụm rồi bấm một lần.
 * Nhưng cũng vì sao KHÔNG phải chỉ `{ studentId }` với nghĩa "đóng hết": buồng lái có
 * thể đang vẽ trạng thái của mười phút trước, nên "đóng hết" sẽ đóng luôn yêu cầu em vừa
 * gửi mà cô chưa từng thấy — và em nhận xác nhận "cô đã gặp em rồi" cho một lời chưa ai
 * đọc. Gửi đúng tập id ĐANG HIỆN TRÊN MÀN là cách duy nhất không có ca đó.
 */
export const AcknowledgeHelpRequestInput = z.object({
  studentId: z.string().uuid(),
  helpRequestIds: z.array(z.string().uuid()).min(1),
});
export type AcknowledgeHelpRequestInput = z.infer<typeof AcknowledgeHelpRequestInput>;

/**
 * Bốn con số thay cho một boolean.
 *
 * `alreadyHandled: boolean` cũ gộp ÍT NHẤT bốn nguyên nhân khác hẳn nhau vào một câu trên
 * màn ("Người khác đã xử lý trước rồi."): người khác bấm trước · chính cô bấm trước
 * (double-tap §9, đúng và vô hại) · id gửi lên không khớp dòng nào (chính là lỗi vừa vá)
 * · dòng nằm ngoài phạm vi RLS. Đo được cả bốn đều trả về đúng một chuỗi giống hệt nhau.
 * Đó là "im lặng bị đọc thành kết luận" ở ngay chỗ cô cần biết mình vừa làm được gì.
 */
export const AcknowledgeHelpRequestOutput = z.object({
  /** Số dòng CHÍNH LẦN GỌI NÀY chuyển từ chưa xử lý sang đã xử lý. Gọi lần hai = 0 (§9). */
  justHandled: z.number().int().nonnegative(),
  /** Trong tập id gửi lên, số dòng ĐÃ có `handled_at` từ trước lần gọi này. */
  alreadyHandled: z.number().int().nonnegative(),
  /** Số id gửi lên mà người gọi không đọc thấy dòng nào — sai id, hoặc ngoài phạm vi RLS. */
  notFound: z.number().int().nonnegative(),
  /**
   * Sau lời gọi, em này CÒN mấy yêu cầu chưa xử lý. `> 0` nghĩa là em vừa gửi thêm sau
   * lần màn hình được tải — màn hình phải nói ra, không được im.
   */
  remainingOpen: z.number().int().nonnegative(),
  /** Người đã xử lý là CHÍNH người đang bấm (tính trên các dòng đã xử lý từ trước). */
  handledByMe: z.boolean(),
  /**
   * Tên người đã xử lý trước. `null` khi không ai xử lý trước, HOẶC khi `core.users` không
   * mở tên đồng nghiệp (policy `users_self`) — màn hình in "Thầy cô khác", KHÔNG bịa tên.
   */
  handledByName: z.string().nullable(),
  /** Dấu thời gian của lần xử lý trước gần nhất trong tập id gửi lên. */
  handledAt: z.string().nullable(),
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

/**
 * Icon cho từng trạng thái, và cho ca "chưa ai ghi gì" (`null`).
 *
 * Vì sao bảng này nằm trong contract chứ không trong từng component ([QĐ-3], 01/08/2026):
 * hai màn của CÙNG một người đang nói hai kiểu về cùng một dữ liệu. `AttendanceBadge`
 * (dùng ở bảng lớp và màn điểm danh) cho `late` icon `schedule` và `queued_late` icon
 * `hourglass_top`; còn lịch trong hồ sơ học sinh gộp cả hai vào `schedule`, đồng thời để
 * `present` và `excused` KHÔNG có icon nào — nên ngày cô ghi "có mặt" vẽ y hệt ngày chưa
 * ai ghi gì. DESIGN-GUIDELINES §11: hai trạng thái khác nghĩa không được chỉ khác màu
 * nền; PRODUCT.md gọi "gửi muộn ngược với vắng" là ràng buộc không thương lượng.
 *
 * Một bảng, hai người đọc: lần sau đổi một icon là đổi cả hai màn.
 */
export const ATTENDANCE_STATUS_ICON: Record<AttendanceStatus, string> = {
  present: "how_to_reg",
  late: "schedule",
  absent: "person_off",
  excused: "event_available",
  queued_late: "hourglass_top",
};

/** Chưa có dòng điểm danh nào. KHÔNG phải "vắng" — một đằng là chưa biết, một đằng là đã biết. */
export const ATTENDANCE_UNKNOWN_LABEL = "Chưa điểm danh";
export const ATTENDANCE_UNKNOWN_ICON = "remove";

/**
 * Câu nói thẳng thứ hệ CHƯA nói được, in một lần dưới bảng điểm danh ([QĐ-3]).
 *
 * [QĐ-3] đòi năm trạng thái: đi sớm · đúng giờ · muộn · vắng · chưa điểm danh. Bốn cái
 * sau có chỗ chứa thật trong `attendance.checkins.status`. "Đi sớm" thì KHÔNG:
 *
 *   · `attendance.resolve_checkin` (0027) đọc `closes_at`, `campus_cidrs`,
 *     `queue_max_age_days` — và KHÔNG đọc `opens_at` ở bất kỳ nhánh nào. Đo thật trên
 *     hub_dev trong một giao dịch đã rollback (chèn tạm luật 06:45–07:30): 05:30 →
 *     present · 07:00 → present · 07:29 → present · 07:31 → late. Em đến lúc 5 rưỡi
 *     sáng và em đến lúc 7:29 nằm chung một ô dữ liệu.
 *   · Cột duy nhất tách được hai ca đó là `occurred_at`, mà nó là GIỜ MÁY CHỦ NHẬN LƯỢT
 *     BẤM, không phải giờ vào cổng: dòng cô ghi hộ mang giờ cô bấm Lưu, dòng gửi bù mang
 *     giờ đồng bộ. Nên giờ chỉ được trình bày như giờ em bấm khi `source = 'app'`.
 *   · `attendance.checkin_rules` trên hub_dev hôm nay có 0 dòng, nên kể cả muốn so với
 *     `opens_at` cũng không có mốc nào để so.
 *
 * Bịa một trạng thái thứ sáu là in lên màn một thứ dữ liệu không đỡ nổi. Chọn cách còn
 * lại: hiện GIỜ THẬT em bấm, và nói thẳng vì sao không có nhãn "đi sớm".
 */
export const ARRIVAL_BAND_UNAVAILABLE_NOTE =
  "Bảng này hiện giờ em bấm nút, không hiện nhãn “đi sớm”. Hệ chỉ ghi được giờ máy chủ nhận lượt bấm, chưa ghi giờ em vào cổng, nên không nói chắc được em đến sớm hay đúng giờ.";

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
  /**
   * `"HH:MM"` giờ em bấm nút, CHỈ khi `source = 'app'`. `null` ở mọi ca khác — và mỗi ca
   * đó đã có `source` nói ra mình là ca nào, nên `null` ở đây không gộp hai nghĩa.
   *
   * Trước 01/08/2026 câu SQL trả `occurred_at::text` thô: gọi thật qua HTTP bằng phiên Cô
   * Lan cho ra `"2026-08-01 00:41:49.075267+07"` — cả micro giây lẫn offset. Đồng thời
   * contract đã hứa "null khi dòng do cô ghi hộ" trong khi cột là `not null default now()`
   * nên không bao giờ null: dòng cô đánh vắng cho một ngày cách đây 30 hôm vẫn mang "giờ
   * check-in" là 3 giờ sáng nay, và nhãn cho trình đọc màn hình ghép ra "… vắng — lúc
   * 03:28 — thầy cô ghi hộ". Nay lời hứa và câu SQL nói cùng một thứ.
   */
  checkedInAt: z.string().nullable(),
  /**
   * `'app'` (em tự bấm) | `'teacher'` (cô ghi hộ) | `'offline_queue'` (gửi bù khi có
   * mạng lại) | `null` (chưa có dòng nào). Đi ra màn hình vì `checkedInAt` chỉ có nghĩa
   * ở đúng một trong ba giá trị đó — thiếu nó thì một ô trống không phân biệt được "cô
   * ghi hộ nên không có giờ" với "chưa ai ghi gì".
   */
  source: z.string().nullable(),
  /** Có hồ sơ chăm sóc đang mở — dấu hiệu để cô mở trước, KHÔNG phải nhãn dán lên em. */
  hasOpenCase: z.boolean(),
  /** Đã bấm "cần gặp thầy cô" và chưa ai xử lý. */
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
  /**
   * Bản xem trước này CÓ THỂ thiếu một mục Glow so với bản phụ huynh đọc, và người ký
   * phải biết điều đó.
   *
   * `report.buildGrowthReport` thêm mục "Cả tuần đến lớp với tâm trạng vui vẻ" khi em có
   * từ 3 ngày "Vui" trở lên. Số ngày Vui đọc từ nhật ký cảm xúc, mà ADR-026 đã đóng nguồn
   * đó với GVCN — nên bản xem trước của CÔ không dựng được mục ấy. Để nó lặng lẽ biến mất
   * là quay lại đúng thứ màn duyệt sinh ra để chữa: ký một bản khác bản người khác đọc.
   *
   * `true` = "có thể còn một mục Glow nữa mà màn này không dựng được", KHÔNG phải "chắc
   * chắn có". Màn hình in đúng nghĩa đó, không in mạnh hơn.
   */
  glowIncomplete: z.boolean(),
});
export type ReportPreview = z.infer<typeof ReportPreview>;

export const ReportApprovalRow = z.object({
  studentId: z.string().uuid(),
  studentCode: z.string(),
  fullName: z.string(),
  status: ReportApprovalStatus,
  reviewedAt: z.string().nullable(),
  note: z.string().nullable(),
  /** Số ngày em CÓ dòng điểm danh trong tuần — đọc từ `attendance.checkins`. */
  checkinDays: z.number().int().nonnegative(),
  /**
   * Số ngày tâm trạng "Vui". Với GVCN: `null` từ ADR-026 (01/08) → SỐ THẬT trở lại từ
   * ADR-035 (21/08, migration 0059) — nguồn là `attendance.happy_days(em, thứ Hai, thứ
   * Sáu)`, cổng của hàm nay có nhánh chủ nhiệm.
   *
   * `.nullable()` GIỮ NGUYÊN: hàm vẫn trả NULL cho người ngoài phạm vi, và `0` vẫn không
   * được phép thay thế nó — `0` ở đây là một lời nói dối thay cho "không được phép biết",
   * loại nói dối tệ nhất vì trông giống hệt một phép đo.
   */
  happyDays: z.number().int().nonnegative().nullable(),
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

/**
 * Hai quyết định GVCN ký được trên một Báo cáo Trưởng thành.
 *
 * `pending` KHÔNG có mặt ở đây, và đó là ranh giới giữa hai khái niệm: `ReportApprovalStatus`
 * là TRẠNG THÁI đọc ra từ sổ (gồm cả "chưa ai quyết"), còn tập này là những thứ một con
 * người ký được. Cho phép ký `pending` là dựng một đường "rút chữ ký" không ai định nghĩa
 * hậu quả — báo cáo đã gửi phụ huynh rồi thì đưa dòng sổ về `pending` không gọi nó về.
 */
export const REPORT_DECISIONS = ["approved", "rejected"] as const;
export const ReportDecision = z.enum(REPORT_DECISIONS);
export type ReportDecision = z.infer<typeof ReportDecision>;

/** Nhãn tiếng Việt dùng chung cho nút bấm và cho câu xác nhận — không chép tay ở từng màn. */
export const REPORT_DECISION_LABEL: Record<ReportDecision, string> = {
  approved: "Duyệt gửi phụ huynh",
  rejected: "Trả lại",
};

/**
 * Duyệt / trả lại báo cáo của NHIỀU em trong một lời gọi (06/08/2026).
 *
 * Cùng hình dạng với `DecideLateCheckinsInput` (ADR-029) và cố ý: hai màn của cùng một cô
 * làm cùng một việc — chọn vài em, chọn một kết luận, ghi. Hai hình dạng khác nhau cho
 * cùng một thao tác là hai chỗ để client lệch nhau.
 *
 * ── `ghiDeQuyetDinhDaCo` — ĐƯỜNG SỬA, ADR-031 (06/08/2026) ────────────────────
 * Mặc định `false`: thủ tục chỉ chạm dòng CHƯA ai quyết. Đó là hàng rào, không phải một
 * hạn chế tạm — "Chọn tất cả" trên một màn đã cũ vài phút sẽ ôm theo cả những em đồng
 * nghiệp vừa trả lại, và một cú bấm không được lật ngược chữ ký người khác.
 *
 * Bật `true` là một hành động KHÁC, khai riêng: đè lên `approved`/`rejected` đã ký. Cờ
 * phải tường minh vì đây là sửa một thứ ĐÃ GỬI RA NGOÀI NHÀ TRƯỜNG — và ADR-031 ghi thẳng
 * giới hạn: sổ vết trả lời được "ai đổi, lúc nào, vì sao", KHÔNG trả lời được "phụ huynh
 * đã đọc bản nào". Không ai được tưởng sổ vết là bảo hiểm.
 *
 * Cờ bật thì lý do BẮT BUỘC, kể cả khi `decision` là `approved`. Đổi một chữ ký đã gửi
 * sang "đã duyệt" cũng là đổi — miễn lý do cho nhánh đó là mở lại đúng cửa mà cả điều
 * khoản này sinh ra để đóng.
 *
 * ── §9 ─────────────────────────────────────────────────────────────────────────
 * `clientMutationId` NAY ĐƯỢC LƯU: `report.report_decisions` (0054, ADR-031) có cột +
 * unique một phần `(student_id, week_start, client_mutation_id)`. Trước 0054 trường này
 * nhận vào mà không có chỗ ghi, và chống trùng chỉ dựa vào khoá `(student_id, week_start)`
 * cộng điều kiện "chỉ ghi lên dòng chưa ai quyết" — đủ cho đường mặc định nhưng KHÔNG đủ
 * cho đường ghi đè, vì ở đó không còn điều kiện trạng thái nào để chặn lượt thứ hai.
 */
export const DecideReportsInput = z
  .object({
    classId: z.string().uuid().optional(),
    // Trần 60 = trần của `MarkAttendanceInput` và `DecideLateCheckinsInput`: một GVCN có
    // tối đa ~45 em. Con số này chặn một lệnh quét cả trường lọt qua vì lỗi phía client.
    studentIds: z.array(z.string().uuid()).min(1).max(60),
    weekStart: IsoDate,
    decision: ReportDecision,
    note: z.string().trim().min(3).max(2000).optional(),
    /** ADR-031 — đè lên quyết định ĐÃ KÝ. Mặc định `false`; bật thì lý do bắt buộc. */
    ghiDeQuyetDinhDaCo: z.boolean().default(false),
    clientMutationId: z.string().uuid().optional(),
  })
  .refine(
    (v) => (v.decision !== "rejected" && !v.ghiDeQuyetDinhDaCo) || (v.note?.length ?? 0) >= 3,
    {
      // Bắt ở TẦNG HỢP ĐỒNG chứ không chỉ ở ô nhập: một màn khác gọi thẳng API vẫn phải đưa
      // lý do. Router kiểm lại lần nữa, và hàm `report.decide_reports` (0054) kiểm lần thứ
      // ba — tầng dưới không suy ra rằng tầng trên đã kiểm hộ mình.
      message: "Trả lại — hoặc đổi một quyết định đã ký — thì phải ghi lý do",
      path: ["note"],
    },
  );
export type DecideReportsInput = z.infer<typeof DecideReportsInput>;

export const DecideReportsOutput = z.object({
  /** Số em THẬT SỰ được ghi quyết định trong lượt này. */
  updated: z.number().int().min(0),
  /**
   * Số em bỏ qua. Nghĩa của nó ĐỔI THEO `ghiDeQuyetDinhDaCo`, và màn hình phải nói đúng
   * nghĩa đang dùng:
   *   · cờ tắt — đã có người ký trước (kể cả chính cô ở tab khác, kể cả đây là lượt gửi
   *     lại), hoặc em không thuộc lớp chủ nhiệm của người gọi.
   *   · cờ bật — chỉ còn hai lý do: em không thuộc lớp chủ nhiệm, hoặc đây là lượt gửi
   *     lại cùng `clientMutationId` (0054 chặn ở tầng bảng).
   * KHÔNG ném lỗi cho những em này — ném lỗi là dựng một kênh dò xem một id có tồn tại và
   * thuộc lớp nào.
   */
  skipped: z.number().int().min(0),
});
export type DecideReportsOutput = z.infer<typeof DecideReportsOutput>;

/**
 * @deprecated 06/08/2026 — dùng `DecideReportsInput` (một lời gọi cho nhiều em). Giữ lại
 * vì client cũ (PWA đã cài trên máy thầy cô) còn gọi `care.approveReport`; gỡ được khi
 * không còn phiên bản nào gọi, đúng luật expand–contract.
 */
export const ApproveReportInput = z.object({
  studentId: z.string().uuid(),
  weekStart: IsoDate,
  decision: ReportDecision,
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
// "Cần gặp thầy cô" và "Hồ sơ đang mở" trên từng dòng, buồng lái hiện thẻ cờ mang tên
// từng em — nhưng không có một màn nào trả lời câu hỏi tiếp theo mà giáo viên luôn hỏi:
// "em này mấy hôm nay thế nào?". Không có nó thì cô phải mở bốn màn lớp rồi tự lọc mắt
// theo một cái tên, và phần lớn sẽ không làm — dấu hiệu hiện ra rồi trôi qua.
//
// Bốn nguồn gộp vào MỘT màn, đúng bốn thứ đã tồn tại thật trong CSDL (không bịa thêm
// mục nào chưa có dữ liệu):
//   1. check-in 7–30 ngày (attendance.checkins)
//   2. tín hiệu "cần gặp thầy cô" + hồ sơ chăm sóc mở/đóng (attendance.help_requests,
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
  /**
   * "HH:MM" giờ em bấm, CHỈ khi `source = 'app'` — cùng luật với `ClassRosterEntry`,
   * xem lời giải thích dài ở đó.
   */
  checkedInAt: z.string().nullable(),
  /** 'app' | 'teacher' | … — để phân biệt "em tự bấm" với "cô ghi hộ" (ADR-007). */
  source: z.string().nullable(),
  /**
   * Mức cảm xúc em ghi hôm đó (1 "Buồn" … 4 "Vui"). TRỞ LẠI 21/08/2026 (ADR-035,
   * migration 0059 — đảo ADR-026): GVCN của em đọc lại được nhật ký cảm xúc. Nguồn là
   * `attendance.checkins_care` (LEFT JOIN theo id), KHÔNG phải cột `mood` của bảng gốc —
   * cột đó vẫn nằm ngoài grant của authenticated (0038), nên với người xem không thuộc
   * `core.can_read_mood()` giá trị này là `null` chứ không phải lỗi. `null` gộp hai
   * nghĩa "em không ghi" và "không được đọc" — chấp nhận Ở ĐÂY vì màn này chỉ mở được
   * bởi đúng GVCN của lớp (homeroomProcedure), tức người luôn thuộc phạm vi đọc.
   */
  mood: z.number().int().min(1).max(4).nullable(),
});
export type StudentCheckinDay = z.infer<typeof StudentCheckinDay>;

/**
 * Một lần em bấm "cần gặp thầy cô".
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
  /** Khoá chính thật của dòng. Nút "Cô đã gặp em rồi" gửi id này — xem `OpenHelpRequest`. */
  helpRequestId: z.string().uuid(),
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
//      đang mở + tín hiệu "cần gặp thầy cô" chưa ai xử lý), gộp theo TỪNG EM.
//   2. `GetClusterCaseDetailOutput` — một em, đủ thứ cần đọc TRƯỚC KHI bấm ba nút kia.
//
// ── HAI THỨ CỐ TÌNH KHÔNG CÓ TRONG HAI HỢP ĐỒNG NÀY ───────────────────────
//
// (a) `mood` / dải check-in cảm xúc — LÝ DO VIẾT LẠI 01/08/2026, ADR-026.
//
//     Lý lẽ cũ ở đây là: màn check-in hứa với em "Chỉ thầy cô chủ nhiệm thấy", mà tâm lý
//     cụm không phải chủ nhiệm, nên tâm lý cụm không được đọc. Lý lẽ đó nay NGƯỢC HƯỚNG
//     và phải gỡ, không phải sửa nhẹ: nhãn trên màn check-in đã đổi thành "Chỉ thầy cô
//     tâm lý đọc", và `core.can_read_mood()` (migration 0044) nay là
//     `is_me ∨ in_my_cluster` — tâm lý cụm là vai DUY NHẤT còn đọc được nhật ký cảm xúc.
//     Để nguyên câu cũ là dựng sẵn lý do cho người đọc sau cắt nốt quyền của vai ấy, và
//     khi đó không còn ai nhìn thấy chuỗi ngày em không vui.
//
//     Vì sao hai hợp đồng NÀY vẫn không có `mood`: đây là hai màn QUẢN LÝ VIỆC ("hôm nay
//     ai đang chờ tôi" · "đọc gì trước khi đóng hồ sơ của em"), không phải màn đọc nhật
//     ký cảm xúc. Tâm lý cụm có quyền đọc mood ở tầng dữ liệu; hai màn này chưa dựng chỗ
//     hiển thị nó. Đó là MỘT MÀN CÒN THIẾU, không phải một quyền bị chặn — khác hẳn ca
//     (b) bên dưới, nơi lời hứa với đứa trẻ là thứ đang chặn.
//
// (b) `note` của "cần gặp thầy cô" — nguyên văn lời em viết. Màn /can-gap-thay-co in
//     cho em đọc TRƯỚC KHI gửi: dấu tích xanh cho ĐÚNG một người (GVCN của em), dấu đỏ
//     cho "thầy cô khác", và một câu nữa ở dưới: "Nếu chuyện cần người chuyên môn hỗ
//     trợ, cô sẽ hỏi ý con trước khi chuyển tới phòng tâm lý". Nghĩa là phòng tâm lý
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
 * Vì sao khoá là học sinh chứ không phải `care_cases.id`: một em vừa bấm "cần gặp thầy
 * cô" thì CHƯA có hồ sơ nào (hồ sơ chỉ sinh ra khi có người ghi can thiệp đầu tiên —
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
  /** Có tín hiệu "cần gặp thầy cô" chưa ai bấm "đã gặp em rồi". */
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
 * Một lần em bấm "cần gặp thầy cô", NHÌN TỪ PHÍA TÂM LÝ CỤM.
 *
 * Giống `StudentHelpRequest` (màn GVCN) đúng mọi field trừ MỘT: không có `note`. Xem
 * lời giải thích (b) ở đầu khối. Đây là chỗ duy nhất trong hợp đồng mà hai vai nhìn
 * cùng một hàng dữ liệu bằng hai hình dạng khác nhau, và sự khác nhau đó là cố ý —
 * gộp lại làm một schema là mở lại đúng thứ vừa đóng.
 */
export const ClusterHelpSignal = z.object({
  /**
   * Khoá chính thật. Cũng là khoá React của từng dòng: `key={requestedOn}` chỉ hợp lệ nhờ
   * `unique(student_id, requested_on)` — một khoá React trỏ vào khoá tự nhiên là thứ gãy
   * im lặng ngay khi bảng cho phép hai yêu cầu trong một ngày.
   */
  helpRequestId: z.string().uuid(),
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
 * được dùng trong bất kỳ output nào của màn GVCN — xem ghi chú cuối khối "màn chi tiết
 * một học sinh": 0035 vừa đóng ghi chú tư vấn lại với GVCN.
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
