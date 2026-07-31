// apps/hub/server/routers/profile.ts — router `profile`, V9 Hồ sơ (Hub Desktop V2).
// Chỉ số liệu tính được thật từ attendance.checkins — KHÔNG có "huy hiệu"/"đọc
// sách tuần" như bản vẽ tay (chưa có bảng huy hiệu, evidence chưa chạy GĐ1).
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";

export const profileRouter = router({
  getMyStudentProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const { rows } = await client.query<{
        full_name: string;
        student_code: string;
        school_name: string;
        class_code: string | null;
      }>(
        `select s.full_name, s.student_code, sc.name as school_name,
                (select c.code from core.enrollments e join core.classes c on c.id = e.class_id
                  where e.student_id = s.id and e.valid_to is null limit 1) as class_code
           from core.students s
           join core.schools sc on sc.id = s.school_id
          where s.user_id = core.current_user_id()`,
      );
      const student = rows[0];
      if (!student) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tài khoản này không phải học sinh." });
      }

      const { rows: totals } = await client.query<{ present_days: number; streak_days: number }>(
        `with mine as (select id from core.students where user_id = core.current_user_id())
         select
           (select count(*)::int from attendance.checkins
             where student_id = (select id from mine) and kind = 'in' and status in ('present', 'late')) as present_days,
           (select count(*)::int from (
              select occurred_on, occurred_on + row_number() over (order by occurred_on desc)::int as grp
                from attendance.checkins
               where student_id = (select id from mine) and kind = 'in' and status in ('present','late')
                 and occurred_on <= current_date
            ) t where grp = current_date + 1) as streak_days`,
      );
      const t = totals[0] ?? { present_days: 0, streak_days: 0 };

      const { rows: teacherRows } = await client.query<{ full_name: string }>(
        "select full_name from core.v_my_homeroom_teacher limit 1",
      );

      return {
        fullName: student.full_name,
        studentCode: student.student_code,
        schoolName: student.school_name,
        classCode: student.class_code ?? "",
        presentDays: t.present_days,
        streakDays: t.streak_days,
        homeroomTeacherName: teacherRows[0]?.full_name ?? null,
      };
    });
  }),
});
