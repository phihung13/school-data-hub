// apps/hub/server/routers/checkin.ts — router `checkin` (03-api.md Đường 1).
import { TRPCError } from "@trpc/server";
import { RequestHelpInput, SubmitMoodInput, SubmitMoodOutput } from "@hub/core/contracts";
import type { PoolClient } from "@hub/core/db";
import { mondayOf, toLocalIsoDate } from "@/lib/date";
import { protectedProcedure, router } from "../trpc";

async function getMyStudentId(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "select id from core.students where user_id = core.current_user_id()",
  );
  const studentId = rows[0]?.id;
  if (!studentId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tài khoản này không phải học sinh." });
  }
  return studentId;
}

async function computeStreak(client: PoolClient, studentId: string): Promise<number> {
  // Chuỗi ngày liên tiếp có mặt (present/late), tính lùi từ hôm nay.
  // Mẹo nhóm chuỗi ngày liên tục: occurred_on + row_number() (thứ tự giảm dần)
  // là hằng số trong suốt một chuỗi liền mạch — hàng của hôm nay luôn có
  // rn=1 (vì vừa insert xong nên là ngày mới nhất), nên nhóm cần lấy là current_date+1.
  const { rows } = await client.query<{ streak: number }>(
    `select count(*)::int as streak from (
       select occurred_on,
              occurred_on + row_number() over (order by occurred_on desc)::int as grp
         from attendance.checkins
        where student_id = $1 and kind = 'in' and status in ('present','late')
          and occurred_on <= current_date
     ) t
     where grp = current_date + 1`,
    [studentId],
  );
  return rows[0]?.streak ?? 0;
}

export const checkinRouter = router({
  /**
   * V7 Điểm danh (Hub Desktop V2). CHỈ trả số thật tính được từ dữ liệu đã ghi
   * nhận — KHÔNG có "chuyên cần %"/"ngày có mặt X/Y" vì GĐ1 chưa có lịch học kỳ
   * (không biết mẫu số "tổng số ngày học" thật). Thêm khi có bảng lịch học —
   * ghi DEBT, không tự bịa mẫu số.
   */
  getAttendanceOverview: protectedProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const studentId = await getMyStudentId(client);
      const streakDays = await computeStreak(client, studentId);

      const { rows: totals } = await client.query<{ present_days: number; late_count: number; longest_streak: number }>(
        `with days as (
           select occurred_on, status,
                  occurred_on + row_number() over (order by occurred_on desc)::int as grp
             from attendance.checkins
            where student_id = $1 and kind = 'in' and status in ('present','late')
         )
         select
           (select count(*)::int from attendance.checkins where student_id = $1 and kind = 'in' and status in ('present','late')) as present_days,
           (select count(*)::int from attendance.checkins where student_id = $1 and kind = 'in' and status in ('late','queued_late')) as late_count,
           coalesce((select max(cnt)::int from (select grp, count(*) as cnt from days group by grp) t), 0) as longest_streak`,
        [studentId],
      );
      const totalsRow = totals[0] ?? { present_days: 0, late_count: 0, longest_streak: 0 };

      const monday = mondayOf(new Date());
      const friday = new Date(monday);
      friday.setDate(friday.getDate() + 4);
      const { rows: weekRows } = await client.query<{
        occurred_on: string;
        mood: number | null;
        checked_in_at: string | null;
        status: string;
      }>(
        `select occurred_on::text, mood, to_char(occurred_at, 'HH24:MI') as checked_in_at, status
           from attendance.checkins
          where student_id = $1 and kind = 'in'
            and occurred_on between $2 and $3`,
        [studentId, toLocalIsoDate(monday), toLocalIsoDate(friday)],
      );
      const weekByDate = new Map(weekRows.map((r) => [r.occurred_on, r]));
      const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu"];
      const todayIso = toLocalIsoDate(new Date());
      const week = DAY_LABELS.map((label, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const iso = toLocalIsoDate(d);
        const row = weekByDate.get(iso);
        return {
          dateIso: iso,
          dayLabel: label,
          isToday: iso === todayIso,
          isFuture: iso > todayIso,
          mood: row?.mood ?? null,
          checkedInAt: row?.checked_in_at ?? null,
          status: row?.status ?? null,
        };
      });

      const { rows: history } = await client.query<{
        occurred_on: string;
        checked_in_at: string;
        status: string;
        mood: number | null;
      }>(
        `select occurred_on::text, to_char(occurred_at, 'HH24:MI') as checked_in_at, status, mood
           from attendance.checkins
          where student_id = $1 and kind = 'in'
          order by occurred_on desc
          limit 8`,
        [studentId],
      );

      return {
        streakDays,
        longestStreakDays: totalsRow.longest_streak,
        presentDays: totalsRow.present_days,
        lateCount: totalsRow.late_count,
        week,
        history,
      };
    });
  }),

  /** Trang chủ (P1) cần biết đã check-in hôm nay chưa + chuỗi ngày hiện có. */
  getTodayStatus: protectedProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const studentId = await getMyStudentId(client);
      const { rows } = await client.query<{ mood: number | null; checked_in_at: string | null }>(
        `select mood, to_char(occurred_at, 'HH24:MI') as checked_in_at
           from attendance.checkins
          where student_id = $1 and occurred_on = current_date and kind = 'in'`,
        [studentId],
      );
      const streakDays = await computeStreak(client, studentId);
      return {
        studentId,
        checkedInToday: rows.length > 0,
        mood: rows[0]?.mood ?? null,
        checkedInAt: rows[0]?.checked_in_at ?? null,
        streakDays,
      };
    });
  }),

  submitMood: protectedProcedure.input(SubmitMoodInput).mutation(async ({ ctx, input }) => {
    return ctx.runWithDb(async (client) => {
      const studentId = await getMyStudentId(client);

      // ADR-007 (migration 0027): ngày/trạng thái/nguồn KHÔNG còn viết cứng ở đây.
      // Trước 31/07/2026 dòng này ghi thẳng `'present', 'app'` cho mọi lần bấm, nên
      // em bấm lúc 11 giờ trưa từ nhà vẫn được ghi "có mặt đúng giờ", và hai thẻ
      // "Chờ xác nhận"/"Vắng" trên buồng lái GVCN luôn bằng 0 vì không đường nào
      // sinh ra `queued_late`. Nay hỏi `attendance.resolve_checkin` — nơi DUY NHẤT
      // biết khung giờ và dải IP của cơ sở, và đọc chúng từ bảng chứ không từ code.
      const resolved = await client.query<{
        occurred_on: string;
        status: string;
        source: string;
        rejected_reason: string | null;
      }>(
        "select * from attendance.resolve_checkin($1, now(), $2::inet, false)",
        [studentId, ctx.clientIp],
      );
      const rule = resolved.rows[0];
      if (!rule || rule.rejected_reason) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chưa ghi được lượt check-in này, em báo thầy cô giúp nhé.",
        });
      }

      // §9 idempotent: 1 học sinh 1 check-in/ngày — bấm lại trong ngày chỉ cập nhật mood.
      // KHÔNG cập nhật lại status: em bấm lần hai lúc 8 giờ không được phép biến bản
      // 'queued_late' lúc 11 giờ hôm trước thành 'present', và 0025 cũng đã thu quyền
      // UPDATE xuống đúng ba cột (mood, status, confirmed_by) ở tầng dữ liệu.
      const { rows } = await client.query<{ id: string; status: string }>(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1, $2::date, 'in', $3, $4, $5)
         on conflict (student_id, occurred_on, kind)
         do update set mood = excluded.mood
         returning id, status`,
        [studentId, rule.occurred_on, input.mood, rule.status, rule.source],
      );
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.wantsHelp) {
        await client.query(
          `insert into attendance.help_requests (student_id, requested_on)
           values ($1, current_date)
           on conflict (student_id, requested_on) do nothing`,
          [studentId],
        );
      }

      const streakDays = await computeStreak(client, studentId);

      return SubmitMoodOutput.parse({
        checkinId: row.id,
        status: row.status,
        streakDays,
      });
    });
  }),

  requestHelp: protectedProcedure.input(RequestHelpInput).mutation(async ({ ctx, input }) => {
    return ctx.runWithDb(async (client) => {
      const studentId = await getMyStudentId(client);
      // §9 idempotent: 1 học sinh 1 yêu cầu/ngày — bấm gửi lại trong ngày (khi cô
      // chưa xử lý, xem help_requests_update_self ở 0020) chỉ cập nhật nội dung.
      await client.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
         values ($1, current_date, $2, $3, $4)
         on conflict (student_id, requested_on)
         do update set topic = excluded.topic, urgency = excluded.urgency, note = excluded.note,
                       requested_at = now()
         where attendance.help_requests.handled_at is null`,
        [studentId, input.topic, input.urgency, input.note ?? null],
      );
      return { ok: true as const };
    });
  }),

  /**
   * Những lần em đã bấm «cần gặp thầy cô», và MỖI lần đó đã được thầy cô xác nhận chưa.
   *
   * Vì sao phải có (gói "man-hinh-con-thieu-gvcn-hs"): màn thành công của
   * /can-gap-thay-co chỉ sống trong state React. Tải lại trang, đóng máy, mở lại buổi
   * tối — em không còn một dấu vết nào cho biết lời mình gửi đã đi đâu. Với một đứa trẻ
   * vừa làm việc khó nhất là mở lời, "không thấy gì nữa" đọc ra thành "chắc không ai
   * nhận". Trước hôm nay MỌI đường đọc `attendance.help_requests` đều nằm sau
   * `homeroomProcedure` — tức là chính người gửi là người duy nhất không xem được.
   *
   * TRẢ VỀ ĐÚNG TRẠNG THÁI, KHÔNG TRẢ LẠI NỘI DUNG. Không `topic`, không `urgency`,
   * không `note`. Hai lý do, cả hai đều đủ một mình: (1) em đã viết rồi, hiện lại không
   * thêm thông tin nào cho em; (2) màn này mở trên điện thoại giữa sân trường, và câu em
   * viết là thứ riêng tư nhất trong cả app — không có lý do gì để nó xuất hiện thêm một
   * lần nữa trên một màn hình mà bạn cùng lớp có thể liếc qua.
   *
   * `acknowledged = false` KHÔNG có nghĩa là "chưa ai đọc": nó chỉ nói chưa ai bấm "cô
   * đã gặp em rồi". Chỗ hiển thị phải nói đúng như vậy — im lặng không phải kết luận.
   */
  getMyHelpRequests: protectedProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const studentId = await getMyStudentId(client);
      // RLS: `help_requests_scope` (0009) dùng core.can_see_student, trong đó có
      // core.is_me — em đọc được đúng dòng của mình, không cần policy mới.
      const { rows } = await client.query<{
        requested_on: string;
        requested_at_time: string;
        acknowledged_on: string | null;
        acknowledged_at_time: string | null;
      }>(
        `select requested_on::text,
                to_char(requested_at, 'HH24:MI') as requested_at_time,
                handled_at::date::text          as acknowledged_on,
                to_char(handled_at, 'HH24:MI')  as acknowledged_at_time
           from attendance.help_requests
          where student_id = $1
          order by requested_on desc
          limit 5`,
        [studentId],
      );

      return {
        requests: rows.map((r) => ({
          requestedOn: r.requested_on,
          requestedAtTime: r.requested_at_time,
          acknowledged: r.acknowledged_on !== null,
          acknowledgedOn: r.acknowledged_on,
          acknowledgedAtTime: r.acknowledged_at_time,
        })),
      };
    });
  }),

  /** V5 "gửi riêng cho cô X" — tên GVCN của lớp em đang học. */
  getMyHomeroomTeacher: protectedProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const { rows } = await client.query<{ full_name: string; class_code: string }>(
        "select full_name, class_code from core.v_my_homeroom_teacher limit 1",
      );
      return rows[0] ?? null;
    });
  }),
});
