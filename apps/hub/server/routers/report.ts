// apps/hub/server/routers/report.ts — router `report`, read-only (03-api.md).
// GĐ1: nội dung lấy đúng từ dữ liệu đã có — điểm danh + mood.
// Không hứa dữ liệu evidence/tutor (GĐ2) — khớp Hub Giai Doan 1.dc.html P3.
//
// ĐƯỜNG AN TOÀN — vì sao báo cáo này KHÔNG đọc `attendance.help_requests`:
// màn "Mình cần gặp thầy cô" (help-request-view.tsx) IN RA LỜI HỨA với đứa trẻ —
// "Bạn cùng lớp · thầy cô khác · bố mẹ — KHÔNG nhìn thấy". Báo cáo Trưởng thành thì
// gửi thẳng cho PHỤ HUYNH đọc (`getMyStudentIdForReport` suy ra học sinh cho cả tài
// khoản học sinh lẫn tài khoản cha mẹ). Nên chỉ cần một mục Glow "em đã bấm cần gặp
// thầy cô" lọt vào đây là lời hứa kia thành lời nói dối — và với em bấm nút vì
// CHUYỆN Ở NHÀ (topic='nha') thì đó là rủi ro an toàn thật, không phải lỗi văn phong.
// Đây là lý do khối truy vấn bên dưới KHÔNG select help_requests: không đọc thì không
// có gì để lọt. "Đọc rồi lọc theo vai người gọi" từng là lựa chọn cân nhắc và đã bị
// loại — một nhánh if quên sót là một đứa trẻ bị lộ.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PoolClient } from "@hub/core/db";
import { GetGrowthReportOutput, IsoDateString } from "@hub/core/contracts";
import { mondayOf as mondayOfDate, toLocalIsoDate } from "@/lib/date";
import { protectedProcedure, roleProcedure, router } from "../trpc";

function mondayOf(date: Date): string {
  return toLocalIsoDate(mondayOfDate(date));
}

async function buildGrowthReport(client: PoolClient, studentId: string, weekStart: string) {
  // RLS (can_see_student: is_me/is_my_child/is_homeroom_of...) tự chặn nếu
  // người gọi không có quyền xem học sinh này — không tự viết điều kiện quyền ở đây.
  const studentRes = await client.query<{ full_name: string; class_code: string | null }>(
    `select s.full_name,
            (select c.code from core.enrollments e join core.classes c on c.id = e.class_id
              where e.student_id = s.id and e.valid_to is null limit 1) as class_code
       from core.students s where s.id = $1`,
    [studentId],
  );
  const student = studentRes.rows[0];
  if (!student) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học sinh (hoặc không có quyền xem)." });
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 4); // thứ Hai -> thứ Sáu

  // KHÔNG đọc attendance.help_requests ở đây — xem khối "ĐƯỜNG AN TOÀN" đầu file.
  const statsRes = await client.query<{
    checkin_days: number;
    happy_days: number;
    streak_days: number;
  }>(
    `select
       count(*) filter (where kind = 'in')::int as checkin_days,
       -- KHÔNG đọc cột mood ở đây, và KHÔNG đổi nguồn sang attendance.checkins_care.
       -- Lý do (0038): phụ huynh không có quyền đọc mood, nên đọc thẳng thì 42501, còn
       -- đổi sang view thì họ ra 0 dòng và mục "cả tuần tâm trạng vui vẻ" biến mất TRONG
       -- IM LẶNG — đúng thứ luật "im lặng không phải kết luận" cấm. Hàm tổng hợp
       -- attendance.happy_days (SECURITY DEFINER) trả SỐ ĐẾM chứ không trả tâm trạng
       -- từng ngày: bố mẹ biết "tuần này con vui 4/5 ngày", không biết ngày nào con buồn.
       attendance.happy_days($1, $2::date, $3::date) as happy_days,
       (select count(*)::int from (
          select occurred_on, occurred_on + row_number() over (order by occurred_on desc)::int as grp
            from attendance.checkins
           where student_id = $1 and kind = 'in' and status in ('present','late')
             and occurred_on <= current_date
        ) t where grp = current_date + 1) as streak_days
     from attendance.checkins
    where student_id = $1 and occurred_on between $2 and $3`,
    [studentId, weekStart, toLocalIsoDate(weekEnd)],
  );
  const stats = statsRes.rows[0] ?? { checkin_days: 0, happy_days: 0, streak_days: 0 };

  const glow: Array<{ title: string; detail: string; accentColor: "green" | "blue" | "amber" }> = [];
  if (stats.checkin_days >= 5) {
    glow.push({
      title: "Đi học đủ 5/5 ngày, check-in đúng giờ cả tuần",
      detail: `Điểm danh · chuỗi ${stats.streak_days} ngày`,
      accentColor: "green",
    });
  }
  if (stats.happy_days >= 3) {
    glow.push({
      title: "Cả tuần đến lớp với tâm trạng vui vẻ",
      detail: `Check-in cảm xúc · ${stats.happy_days}/5 ngày «Vui»`,
      accentColor: "blue",
    });
  }
  // (Ở đây từng có mục Glow thứ ba sinh từ `help_requests` — đã gỡ 31/07/2026.
  //  Hai lỗi trong một khối 6 dòng, nên ghi lại để không ai "khôi phục cho đẹp":
  //   1. Nó tố với bố mẹ việc con đã bấm nút cầu cứu — phá lời hứa in trên màn hình
  //      của chính đứa trẻ (xem khối ĐƯỜNG AN TOÀN đầu file).
  //   2. Nó khẳng định "thầy cô đã trò chuyện cùng em" chỉ dựa trên count(*) của
  //      bảng yêu cầu, KHÔNG hề đọc `handled_at`. Trên CSDL dev hôm nay có đúng một
  //      bản ghi với handled_at = NULL — chưa ai chạm tới em — mà báo cáo vẫn báo là
  //      đã trò chuyện. Đó là nói sai sự thật với phụ huynh về một việc chăm sóc.
  //  Muốn đưa tín hiệu này cho GVCN thì đường đúng là Buồng lái (care.ts), nơi có
  //  đọc `handled_at` thật — không phải báo cáo mà cha mẹ đọc.)

  const grow =
    stats.checkin_days < 5
      ? [{ title: "Đi học đều hơn", detail: "Tuần này có ngày vắng hoặc check-in muộn — cùng sắp xếp giờ giấc buổi sáng nhé." }]
      : [];

  const shareExpires = new Date();
  shareExpires.setDate(shareExpires.getDate() + 7); // link chia sẻ 7 ngày (GĐ1)

  return GetGrowthReportOutput.parse({
    studentName: student.full_name,
    className: student.class_code ?? "",
    weekLabel: `${weekStart} – ${toLocalIsoDate(weekEnd)}`,
    headline: glow.length >= 2 ? "Một tuần rực rỡ!" : "Một tuần ổn định",
    glow,
    grow,
    streakDays: stats.streak_days,
    shareTokenExpiresAt: shareExpires.toISOString(),
    checkinDaysThisWeek: stats.checkin_days,
    happyDaysThisWeek: stats.happy_days,
  });
}

/**
 * Suy ra học sinh của người đang gọi: chính mình (tài khoản học sinh) hoặc con mình
 * (tài khoản phụ huynh). Không nhận `studentId` từ client — xem `GetReportForWeekInput`.
 *
 * `order by` bên trong `limit 1` là bắt buộc, không phải cho gọn: `limit 1` không kèm
 * thứ tự thì Postgres trả hàng nào cũng đúng cú pháp, và với phụ huynh có HAI con thì
 * cùng một lần bấm có thể ra báo cáo của đứa này, lần sau ra đứa kia — tuỳ kế hoạch
 * truy vấn. Sắp theo (created_at, student_id) để một tài khoản luôn thấy cùng một em.
 * Hạn chế còn lại đã biết: phụ huynh nhiều con chỉ xem được em được gắn sớm nhất —
 * màn chọn con là việc của GĐ sau, và nó phải đi qua danh sách con thật chứ không
 * phải mở lại tham số `studentId` cho client tự gõ.
 */
async function getMyStudentIdForReport(client: PoolClient): Promise<string> {
  const meRes = await client.query<{ student_id: string | null }>(
    `select coalesce(
       (select id from core.students where user_id = core.current_user_id()),
       (select ps.student_id from core.parent_students ps
          join core.parents p on p.id = ps.parent_id
         where p.user_id = core.current_user_id()
         order by ps.created_at, ps.student_id
         limit 1)
     ) as student_id`,
  );
  const studentId = meRes.rows[0]?.student_id;
  if (!studentId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tài khoản này chưa gắn với học sinh nào." });
  }
  return studentId;
}

// ───────────────────────────────────────────────────────────────────────────
// Màn hình Điều hành (BGH) — CHỈ số tổng hợp theo lô
//
// DESIGN-GUIDELINES §9: "BGH/Điều hành: chỉ dữ liệu tổng hợp theo lô, ghi rõ không
// tra cứu học sinh cá nhân." Nên procedure dưới đây KHÔNG nhận `studentId`, KHÔNG
// nhận `classId`, và KHÔNG trả về bất kỳ trường nào nhận dạng một em. Toàn bộ phép
// đếm nằm trong `report.class_pulse` / `report.grade_pulse` (0040) — hai hàm đó tự
// mang cổng vai và ngưỡng ẩn danh, nên tầng này KHÔNG được tự viết câu SQL thứ hai
// đọc thẳng bảng chi tiết rồi "tự cộng lại cho nhanh": làm vậy là dựng một đường
// tổng hợp thứ hai không có cổng nào cả.
//
// Hình dạng dữ liệu ra đặt tại chỗ (không ở `packages/core/contracts`) vì gói việc
// này chỉ sở hữu file router; chuyển sang contracts là việc bàn giao — xem ghi chú
// bàn giao của gói "man-hinh-bgh".
// ───────────────────────────────────────────────────────────────────────────

/** Số đo bị che khi nhóm dưới ngưỡng ẩn danh: `null` ≠ `0`. Xem 0040. */
const SuppressibleCount = z.number().int().nonnegative().nullable();

const OperationsClassRow = z.object({
  classId: z.string().uuid(),
  classCode: z.string(),
  grade: z.number().int(),
  rosterCount: z.number().int().nonnegative(),
  /** true = lớp dưới `report.min_cohort()`; mọi số đo bên dưới là `null`, KHÔNG phải 0. */
  cohortTooSmall: z.boolean(),
  checkedInCount: SuppressibleCount,
  pendingLateCount: SuppressibleCount,
  absentCount: SuppressibleCount,
  excusedCount: SuppressibleCount,
  /** Em chưa có dòng check-in nào. KHÔNG phải vắng — hai cột khác nhau, cố ý. */
  noRecordCount: SuppressibleCount,
  moodReported: SuppressibleCount,
  moodHappy: SuppressibleCount,
  moodNormal: SuppressibleCount,
  moodTired: SuppressibleCount,
  moodSad: SuppressibleCount,
  openCareCount: SuppressibleCount,
});
export type OperationsClassRow = z.infer<typeof OperationsClassRow>;

const OperationsGradeRow = OperationsClassRow.omit({ classId: true, classCode: true }).extend({
  classCount: z.number().int().nonnegative(),
});
export type OperationsGradeRow = z.infer<typeof OperationsGradeRow>;

export const GetOperationsOverviewOutput = z.object({
  onDate: IsoDateString,
  /** Dấu thời gian máy chủ — "dữ liệu tính đến HH:mm" (02-database.md, luật dashboard). */
  asOf: z.string(),
  /** Ngưỡng ẩn danh đang áp dụng, đọc từ DB chứ không viết lại ở client. */
  minCohort: z.number().int().positive(),
  grades: z.array(OperationsGradeRow),
  classes: z.array(OperationsClassRow),
});
export type GetOperationsOverviewOutput = z.infer<typeof GetOperationsOverviewOutput>;

/** Xa nhất được phép hỏi về quá khứ. Xem chú thích `roster` trong 0040: sĩ số là sĩ số
 *  HIỆN TẠI, nên ghép nó với điểm danh của một ngày quá xa sẽ ra tỉ lệ vô nghĩa. */
const MAX_LOOKBACK_DAYS = 60;

type PulseRow = {
  class_id?: string;
  class_code?: string;
  grade: number;
  class_count?: number;
  roster_count: number;
  cohort_too_small: boolean;
  checked_in_count: number | null;
  pending_late_count: number | null;
  absent_count: number | null;
  excused_count: number | null;
  no_record_count: number | null;
  mood_reported: number | null;
  mood_happy: number | null;
  mood_normal: number | null;
  mood_tired: number | null;
  mood_sad: number | null;
  open_care_count: number | null;
};

function commonMeasures(r: PulseRow) {
  return {
    grade: Number(r.grade),
    rosterCount: Number(r.roster_count),
    cohortTooSmall: r.cohort_too_small,
    checkedInCount: r.checked_in_count,
    pendingLateCount: r.pending_late_count,
    absentCount: r.absent_count,
    excusedCount: r.excused_count,
    noRecordCount: r.no_record_count,
    moodReported: r.mood_reported,
    moodHappy: r.mood_happy,
    moodNormal: r.mood_normal,
    moodTired: r.mood_tired,
    moodSad: r.mood_sad,
    openCareCount: r.open_care_count,
  };
}

/**
 * 0040 ném `42501` khi người gọi không mang vai principal/board — cố ý ném thay vì
 * trả rỗng. Ở đây dịch nó thành FORBIDDEN; để nguyên thì người dùng nhận "lỗi kỹ
 * thuật, mã sự cố …" cho một tình huống phân quyền hoàn toàn bình thường.
 */
function isRoleGateError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "42501";
}

export const reportRouter = router({
  /** Không cần studentId — tự suy ra học sinh của người gọi (chính mình hoặc con). */
  getMyLatestReport: protectedProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const studentId = await getMyStudentIdForReport(client);
      const weekStart = mondayOf(new Date());
      const report = await buildGrowthReport(client, studentId, weekStart);
      return { studentId, weekStart, report };
    });
  }),

  /** V8 "Các tuần trước" — điều hướng theo tuần, tự suy học sinh giống getMyLatestReport. */
  getReportForWeek: protectedProcedure
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.runWithDb(async (client) => {
        const studentId = await getMyStudentIdForReport(client);
        const weekStart = mondayOf(new Date(input.weekStart));
        const report = await buildGrowthReport(client, studentId, weekStart);
        return { studentId, weekStart, report };
      });
    }),

  /**
   * V8 "Báo cáo này gửi cho ai?" — CHỈ tên + quan hệ (mẹ/bố/người giám hộ), KHÔNG
   * có trạng thái đã đọc/chưa đọc — hệ chưa có bảng theo dõi đọc, không bịa.
   */
  getMyGuardians: protectedProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const { rows } = await client.query<{ full_name: string; relation: string }>(
        "select full_name, relation from core.v_my_guardians",
      );
      return rows;
    });
  }),

  /**
   * Màn hình Điều hành: nhịp của CẢ KHỐI và từng lớp trong phạm vi của người xem
   * (principal = cơ sở mình · board = toàn hệ). Hai lớp cổng, cả hai đều fail closed:
   * `roleProcedure` đối chiếu `core.v_my_scopes` ở tầng API, còn 0040 tự kiểm vai lần
   * nữa trong hàm SQL — vì hàm đó chạy SECURITY DEFINER nên nó không được phép tin
   * rằng người gọi đã bị chặn ở đâu đó phía trên.
   */
  getOperationsOverview: roleProcedure("principal", "board")
    .input(z.object({ onDate: IsoDateString.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const today = toLocalIsoDate(new Date());
      const onDate = input?.onDate ?? today;
      if (onDate > today) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Chưa có số liệu của ngày trong tương lai." });
      }
      const oldest = new Date();
      oldest.setDate(oldest.getDate() - MAX_LOOKBACK_DAYS);
      if (onDate < toLocalIsoDate(oldest)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Màn hình này chỉ tra được trong vòng ${MAX_LOOKBACK_DAYS} ngày gần đây.`,
        });
      }

      try {
        return await ctx.runWithDb(async (client) => {
          const [classRes, gradeRes, metaRes] = await Promise.all([
            client.query<PulseRow>(
              "select class_id, class_code, grade, roster_count, cohort_too_small, checked_in_count," +
                " pending_late_count, absent_count, excused_count, no_record_count, mood_reported," +
                " mood_happy, mood_normal, mood_tired, mood_sad, open_care_count" +
                " from report.class_pulse($1::date)",
              [onDate],
            ),
            client.query<PulseRow>(
              "select grade, class_count, roster_count, cohort_too_small, checked_in_count," +
                " pending_late_count, absent_count, excused_count, no_record_count, mood_reported," +
                " mood_happy, mood_normal, mood_tired, mood_sad, open_care_count" +
                " from report.grade_pulse($1::date)",
              [onDate],
            ),
            // Giờ máy chủ + ngưỡng lấy từ CHÍNH cơ sở dữ liệu: in "tính đến HH:mm" bằng
            // giờ máy người xem thì hai người ở hai máy lệch giờ sẽ đọc ra hai sự thật.
            client.query<{ as_of: string; min_cohort: number }>(
              "select now() as as_of, report.min_cohort() as min_cohort",
            ),
          ]);

          return GetOperationsOverviewOutput.parse({
            onDate,
            asOf: new Date(metaRes.rows[0]!.as_of).toISOString(),
            minCohort: Number(metaRes.rows[0]!.min_cohort),
            grades: gradeRes.rows.map((r) => ({ ...commonMeasures(r), classCount: Number(r.class_count) })),
            classes: classRes.rows.map((r) => ({
              ...commonMeasures(r),
              classId: r.class_id!,
              classCode: r.class_code!,
            })),
          });
        });
      } catch (err) {
        if (isRoleGateError(err)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Màn hình Điều hành dành cho hiệu trưởng cơ sở và ban điều hành.",
          });
        }
        throw err;
      }
    }),
});
