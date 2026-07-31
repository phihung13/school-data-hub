// apps/hub/server/routers/report.ts — router `report`, read-only (03-api.md).
// GĐ1: nội dung lấy đúng từ dữ liệu đã có — điểm danh + mood + help_requests.
// Không hứa dữ liệu evidence/tutor (GĐ2) — khớp Hub Giai Doan 1.dc.html P3.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PoolClient } from "@hub/core/db";
import { GetGrowthReportOutput } from "@hub/core/contracts";
import { mondayOf as mondayOfDate, toLocalIsoDate } from "@/lib/date";
import { protectedProcedure, router } from "../trpc";

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

  const statsRes = await client.query<{
    checkin_days: number;
    happy_days: number;
    help_requests: number;
    streak_days: number;
  }>(
    `select
       count(*) filter (where kind = 'in')::int as checkin_days,
       count(*) filter (where mood = 4)::int as happy_days,
       (select count(*)::int from attendance.help_requests
         where student_id = $1 and requested_on between $2 and $3) as help_requests,
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
  const stats = statsRes.rows[0] ?? { checkin_days: 0, happy_days: 0, help_requests: 0, streak_days: 0 };

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
  if (stats.help_requests > 0) {
    glow.push({
      title: 'Chủ động bấm «cần gặp thầy cô» khi có chuyện khó',
      detail: "Một hành động dũng cảm — thầy cô đã trò chuyện cùng em",
      accentColor: "amber",
    });
  }

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

async function getMyStudentIdForReport(client: PoolClient): Promise<string> {
  const meRes = await client.query<{ student_id: string | null }>(
    `select coalesce(
       (select id from core.students where user_id = core.current_user_id()),
       (select ps.student_id from core.parent_students ps
          join core.parents p on p.id = ps.parent_id
         where p.user_id = core.current_user_id() limit 1)
     ) as student_id`,
  );
  const studentId = meRes.rows[0]?.student_id;
  if (!studentId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tài khoản này chưa gắn với học sinh nào." });
  }
  return studentId;
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
});
