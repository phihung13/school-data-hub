// packages/core/contracts/report.ts — router `report`, read-only (03-api.md).
// GĐ1: nội dung chỉ lấy từ dữ liệu đã có (điểm danh + mood) — không hứa dữ liệu
// evidence/tutor chưa xây (Hub Giai Doan 1.dc.html, P3).
import { z } from "zod";

/**
 * Một điều "tỏa sáng" trong báo cáo tuần.
 *
 * NGUỒN ĐƯỢC PHÉP: điểm danh (`attendance.checkins`). KHÔNG BAO GIỜ:
 * `attendance.help_requests` — báo cáo này phụ huynh đọc, mà màn "Mình cần gặp thầy
 * cô" đã hứa với đứa trẻ rằng bố mẹ không nhìn thấy (help-request-view.tsx). Việc em
 * bấm nút cầu cứu không phải thành tích để khoe, nó là đường an toàn tâm lý; khoe nó
 * lên là bịt đường đó lại. Khoá bằng `tests/db/bao-cao-rieng-tu.test.ts`.
 *
 * Câu chữ trong `detail` chỉ được khẳng định việc NGƯỜI LỚN ĐÃ LÀM (vd "thầy cô đã
 * trò chuyện cùng em") khi có cột dấu thời gian chứng minh (`handled_at is not null`).
 * Suy ra từ count(*) là nói với cha mẹ một việc chăm sóc chưa hề xảy ra.
 */
export const GlowItem = z.object({
  title: z.string(),
  detail: z.string(),
  accentColor: z.enum(["green", "blue", "amber"]),
});

export const GrowItem = z.object({
  title: z.string(),
  detail: z.string(),
});

/**
 * Ngày ISO `YYYY-MM-DD` — CÓ THẬT trên lịch, không chỉ đúng hình dạng.
 *
 * Vì sao chặt tay ở đây (31/07/2026): `report.getReportForWeek` là procedure duy nhất
 * nhận tham số ngày do người dùng gõ, tức là bề mặt dễ dò nhất của router `report`.
 * Trước bản này input khai `z.string()` nên chuỗi bất kỳ đều qua: 'abc' → `new Date('abc')`
 * → Invalid Date → `mondayOf` gọi `setDate(NaN)` → `toLocalIsoDate` trả 'NaN-NaN-NaN' →
 * xuống câu `occurred_on between $2 and $3` → Postgres 22007 → 500 kèm log lỗi rác.
 * Lỗi người dùng phải ra BAD_REQUEST ở biên (`03-api.md` luật 4), không để cơ sở dữ liệu
 * ném hộ.
 *
 * Vì sao KHÔNG chỉ dùng `Date.parse`: đo trên Node 20 ngày 31/07/2026 —
 * `Date.parse('2026-02-30')` KHÔNG trả NaN mà tự lăn sang `2026-03-02`. Tin vào nó thì
 * '2026-02-30' lọt qua rồi âm thầm đổi thành tuần khác, tệ hơn cả báo lỗi. Nên phải dựng
 * lại ngày rồi so từng thành phần: chỉ ngày có thật trên lịch mới sống sót.
 */
const isRealCalendarDate = (v: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};

export const IsoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD")
  .refine(isRealCalendarDate, "Ngày không có thật trên lịch");
export type IsoDateString = z.infer<typeof IsoDateString>;

/** Sớm nhất hệ chấp nhận — Hub chưa hề có dữ liệu trước mốc này, hỏi trước đó là dò. */
const EARLIEST_REPORT_WEEK = "2020-01-01";
/** Muộn nhất: tuần sau. Buồng lái có nút "Tuần sau" nên +7 ngày là hợp lệ; xa hơn là dò. */
const MAX_FUTURE_DAYS = 7;

/**
 * Chặn tuần tương lai xa. Không ném ở tầng SQL rồi mới biết: báo cáo tuần 2099 không sai
 * cú pháp, chỉ là không có ý nghĩa nghiệp vụ — trả rỗng thì người dùng tưởng mất dữ liệu.
 */
const withinReportableRange = (v: string): boolean => {
  if (!isRealCalendarDate(v)) return false;
  const t = Date.parse(v);
  if (t < Date.parse(EARLIEST_REPORT_WEEK)) return false;
  return t <= Date.now() + MAX_FUTURE_DAYS * 86_400_000;
};

const REPORT_WEEK_RANGE_MESSAGE = "Tuần báo cáo nằm ngoài khoảng hệ thống có dữ liệu";

/** Thứ Hai của tuần báo cáo. Server vẫn tự chuẩn hoá về thứ Hai — client gửi ngày nào trong tuần cũng được. */
export const ReportWeekStart = IsoDateString.refine(withinReportableRange, REPORT_WEEK_RANGE_MESSAGE);

export const GetGrowthReportInput = z.object({
  studentId: z.string().uuid(),
  weekStart: ReportWeekStart,
});
export type GetGrowthReportInput = z.infer<typeof GetGrowthReportInput>;

/**
 * V8 "Các tuần trước". Không có `studentId`: server tự suy học sinh của người gọi (chính
 * mình hoặc con mình) — thêm tham số đó vào đây là mở đường cho việc đoán id em khác.
 */
export const GetReportForWeekInput = z.object({
  weekStart: ReportWeekStart,
});
export type GetReportForWeekInput = z.infer<typeof GetReportForWeekInput>;

export const GetGrowthReportOutput = z.object({
  studentName: z.string(),
  className: z.string(),
  weekLabel: z.string(), // "tuần 42 (21–25/07)"
  headline: z.string(), // "Một tuần rực rỡ!"
  glow: z.array(GlowItem),
  grow: z.array(GrowItem).max(1), // GĐ1: tối đa 1 gợi ý, tránh liệt kê nặng nề
  streakDays: z.number().int().nonnegative(),
  shareTokenExpiresAt: z.string(), // link chia sẻ 7 ngày
  // Thêm 29/07/2026 cho rail "Tuần này của mình" (Hub Desktop V2) — số thật đã có
  // sẵn trong buildGrowthReport, trước đây tính xong rồi bỏ. Additive, không phá
  // hợp đồng cũ (03-api.md luật 6).
  checkinDaysThisWeek: z.number().int().nonnegative(),
  happyDaysThisWeek: z.number().int().nonnegative(),
});
export type GetGrowthReportOutput = z.infer<typeof GetGrowthReportOutput>;

/**
 * Vỏ ngoài mà `report.getMyLatestReport` và `report.getReportForWeek` cùng trả về.
 * Client cần `weekStart` đã chuẩn hoá (server dời về thứ Hai) để bấm "Tuần trước" tiếp,
 * và `studentId` để đặt cache key — không có hai field này thì UI phải tự đoán lại lịch.
 */
export const GetWeeklyReportOutput = z.object({
  studentId: z.string().uuid(),
  weekStart: IsoDateString,
  report: GetGrowthReportOutput,
});
export type GetWeeklyReportOutput = z.infer<typeof GetWeeklyReportOutput>;

/**
 * V8 "Báo cáo này gửi cho ai?" — CHỈ tên + quan hệ, KHÔNG trạng thái đã đọc/chưa đọc
 * (hệ chưa có bảng theo dõi đọc; bịa ra là nói dối phụ huynh).
 *
 * Vì sao snake_case ở đây trong khi cả kho dùng camelCase: đây là hình dạng ĐANG CHẠY
 * THẬT trên dây — `report.getMyGuardians` trả thẳng cột của view `core.v_my_guardians`,
 * và `growth-report-view.tsx:282` đang đọc `g.full_name`. Hợp đồng phải mô tả sự thật
 * hôm nay; đổi tên field là thay đổi phá tương thích, phải đi expand–contract
 * (`03-api.md` luật 6): thêm `fullName` song song → client chuyển dần → gỡ `full_name`
 * ở một phiên bản sau, mỗi bước một mục trong CHANGELOG.
 */
export const GuardianContact = z.object({
  full_name: z.string(),
  relation: z.string(),
});
export type GuardianContact = z.infer<typeof GuardianContact>;

export const GuardianListOutput = z.array(GuardianContact);
export type GuardianListOutput = z.infer<typeof GuardianListOutput>;
