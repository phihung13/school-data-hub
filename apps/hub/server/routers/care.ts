// apps/hub/server/routers/care.ts — router `care`, GĐ1 rút gọn (buồng lái P4).
//
// Flag engine (04-flag-engine.md) CHƯA chạy — chưa có pg_cron job tạo care.flags
// tự động, nên "priority flags" ở đây được TÍNH TRỰC TIẾP từ tín hiệu thô (mood,
// help_requests) thay vì đọc care.flags. Khi flag engine thật chạy, đổi phần này
// sang đọc care.flags (đã sẵn contract FlagSummary.flagId), không đổi UI.
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
import { TRPCError } from "@trpc/server";
import {
  AcknowledgeHelpRequestInput,
  AcknowledgeHelpRequestOutput,
  AcknowledgeLateInput,
  CloseCaseInput,
  CloseCaseOutput,
  GetDashboardOutput,
  LogInterventionInput,
  LogInterventionOutput,
} from "@hub/core/contracts";
import type { PoolClient } from "@hub/core/db";
import { toLocalIsoDate } from "@/lib/date";
import { readCareRules } from "../care-thresholds";
import { homeroomProcedure, roleProcedure, router } from "../trpc";

/**
 * Ai được chạm hồ sơ chăm sóc: GVCN của lớp, hoặc tâm lý cụm — đúng tập hợp mà
 * `core.can_see_care()` (0009) đã định nghĩa ở tầng DB. KHÔNG dùng homeroomProcedure
 * cho nhóm này: tâm lý cụm không chủ nhiệm lớp nào, siết theo GVCN là khoá luôn
 * người có nghề nhất trong hệ chăm sóc.
 */
const careStaffProcedure = roleProcedure("homeroom", "counselor");

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

export const careRouter = router({
  getDashboard: homeroomProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const classId = ctx.homeroomClassId;

      const classRes = await client.query<{ code: string; school_id: string }>(
        "select code, school_id from core.classes where id = $1",
        [classId],
      );
      const className = classRes.rows[0]?.code ?? "";
      const schoolId = classRes.rows[0]?.school_id ?? null;

      // Ngưỡng theo ĐÚNG cơ sở của lớp (0026 cho phép khai riêng từng cơ sở), không
      // phải một con số toàn hệ viết trong code.
      const rules = await readCareRules(client, schoolId);

      const totalsRes = await client.query<{
        checkin_count: number;
        pending_late_count: number;
        absent_count: number;
      }>(
        `select
           count(*) filter (where c.kind = 'in')::int as checkin_count,
           count(*) filter (where c.status = 'queued_late')::int as pending_late_count,
           count(*) filter (where c.status = 'absent')::int as absent_count
         from attendance.checkins c
         join core.enrollments e on e.student_id = c.student_id and e.valid_to is null
         where e.class_id = $1 and c.occurred_on = current_date`,
        [classId],
      );

      const moodRes = await client.query<{ mood: number; count: string }>(
        `select c.mood, count(*)::int as count
           from attendance.checkins c
           join core.enrollments e on e.student_id = c.student_id and e.valid_to is null
          where e.class_id = $1 and c.occurred_on = current_date and c.mood is not null
          group by c.mood`,
        [classId],
      );

      const pendingRes = await client.query<{
        checkin_id: string;
        student_id: string;
        student_name: string;
        occurred_on: string;
      }>(
        `select c.id as checkin_id, s.id as student_id, s.full_name as student_name, c.occurred_on::text
           from attendance.checkins c
           join core.students s on s.id = c.student_id
           join core.enrollments e on e.student_id = c.student_id and e.valid_to is null
          where e.class_id = $1 and c.status = 'queued_late'
          order by c.occurred_on`,
        [classId],
      );

      // ── Cờ ưu tiên ────────────────────────────────────────────────────────
      // Gốc là DANH SÁCH LỚP, không phải bảng check-in: hai nguồn tín hiệu (mood,
      // "cần gặp thầy cô") nối vào độc lập nên không nguồn nào che nguồn kia.
      // Mọi con số trong câu này là THAM SỐ đọc từ care.thresholds (§6).
      const flagsRes = await client.query<{
        student_id: string;
        student_name: string;
        negative_days: number;
        negative_streak: number;
        help_requested: boolean;
        as_of_date: string;
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
         mood_days as (
           select r.student_id, c.occurred_on, c.mood,
                  row_number() over (partition by r.student_id order by c.occurred_on desc) as rn
             from roster r
             join attendance.checkins c
               on c.student_id = r.student_id
              and c.kind = 'in'
              and c.mood is not null
              and c.occurred_on >= current_date - $2::int
         ),
         mood_agg as (
           select student_id,
                  count(*) filter (where mood <= $3::int)::int as negative_days,
                  -- Chuỗi LIÊN TIẾP: hàng đầu tiên (tính lùi từ lần check-in gần nhất)
                  -- có mood TỐT nằm ở vị trí rn = k ⇒ chuỗi xấu dài đúng k-1.
                  -- Không có hàng tốt nào ⇒ cả cửa sổ đều xấu.
                  coalesce(min(rn) filter (where mood > $3::int) - 1, count(*))::int as negative_streak,
                  max(occurred_on) as last_checkin_on
             from mood_days
            group by student_id
         ),
         help_agg as (
           select r.student_id, max(h.requested_on) as last_help_on
             from roster r
             join attendance.help_requests h
               on h.student_id = r.student_id
              and h.requested_on >= current_date - $6::int
              and h.handled_at is null
            group by r.student_id
         ),
         last_action as (
           select cc.student_id, max(i.occurred_at) as last_intervention_at
             from care.care_cases cc
             join care.interventions i on i.case_id = cc.id
            group by cc.student_id
         )
         select r.student_id, r.full_name as student_name,
                coalesce(m.negative_days, 0) as negative_days,
                coalesce(m.negative_streak, 0) as negative_streak,
                (h.student_id is not null) as help_requested,
                coalesce(greatest(m.last_checkin_on, h.last_help_on), current_date)::text as as_of_date,
                cc.id as case_id, cc.status as case_status,
                coalesce(la.last_intervention_at >= now() - make_interval(days => $7::int), false) as recently_handled
           from roster r
           left join mood_agg m on m.student_id = r.student_id
           left join help_agg h on h.student_id = r.student_id
           left join care.care_cases cc on cc.student_id = r.student_id and cc.status = 'open'
           left join last_action la on la.student_id = r.student_id
          where h.student_id is not null
             or (case when $5 = 'streak' then coalesce(m.negative_streak, 0)
                      else coalesce(m.negative_days, 0) end) >= $4::int
          -- Cờ khẩn lên đầu; cờ vừa được xử lý xuống cuối (không xoá — vẫn phải thấy).
          order by (h.student_id is not null) desc,
                   coalesce(la.last_intervention_at >= now() - make_interval(days => $7::int), false) asc,
                   coalesce(m.negative_streak, 0) desc`,
        [
          classId,
          rules.emotion.windowDays,
          rules.emotion.badMoodMax,
          rules.emotion.negativeDays,
          rules.emotion.mode,
          rules.urgent.windowDays,
          rules.emotion.quietDays,
        ],
      );

      const staleRes = await client.query<{ label: string }>(
        "select label from ops.v_stale_sources where source in ('attendance','evidence')",
      );

      // Lọc theo job_name: contract nói "Quét đêm qua", nên phải là giờ của ĐÚNG bộ
      // quét cờ. Không lọc thì job dọn mood/backup chạy muộn hơn sẽ chiếm chỗ.
      const jobRes = await client.query<{ finished_at: string | null }>(
        `select max(finished_at)::text as finished_at
           from ops.job_runs
          where status = 'success' and job_name = 'flag_engine'`,
      );

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

      return GetDashboardOutput.parse({
        className,
        asOfDate: toLocalIsoDate(new Date()),
        lastScanAt: jobRes.rows[0]?.finished_at ?? null,
        staleSources: staleRes.rows.map((r) => r.label),
        totals: {
          checkinCount: totalsRes.rows[0]?.checkin_count ?? 0,
          pendingLateCount: totalsRes.rows[0]?.pending_late_count ?? 0,
          absentCount: totalsRes.rows[0]?.absent_count ?? 0,
          totalStudents: classSizeRes.rows[0]?.total_students ?? 0,
          openCareCases: classSizeRes.rows[0]?.open_care_cases ?? 0,
        },
        moodDistribution: moodRes.rows.map((r) => ({ mood: r.mood as 1 | 2 | 3 | 4, count: Number(r.count) })),
        priorityFlags: flagsRes.rows.map((r) => ({
          flagId: `${r.student_id}:${r.as_of_date}`, // tính trực tiếp, chưa có care.flags.id thật (xem ghi chú đầu file)
          studentId: r.student_id,
          studentName: r.student_name,
          className,
          ruleCode: r.help_requested ? "E_URGENT" : "E_MOOD",
          asOfDate: r.as_of_date,
          detail: {
            // `negativeDays` giữ đúng tên cũ vì màn hình GVCN đang đọc khoá này.
            negativeDays: r.negative_streak,
            negativeDaysInWindow: r.negative_days,
            negativeStreak: r.negative_streak,
            helpRequested: r.help_requested,
            recentlyHandled: r.recently_handled,
            mode: rules.emotion.mode,
            threshold: rules.emotion.negativeDays,
          },
          caseId: r.case_id,
          caseStatus: r.case_status as "open" | "closed" | null,
        })),
        pendingLateCheckins: pendingRes.rows.map((r) => ({
          checkinId: r.checkin_id,
          studentId: r.student_id,
          studentName: r.student_name,
          occurredOn: r.occurred_on,
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
   * Xác nhận check-in gửi muộn. `homeroomProcedure` là lớp gác THỨ HAI — lớp thứ nhất
   * là grant theo cột + trigger ở 0025. Bỏ một trong hai là lỗ leo quyền quay lại.
   */
  acknowledgeLate: homeroomProcedure.input(AcknowledgeLateInput).mutation(async ({ ctx, input }) => {
    return ctx.runWithDb(async (client) => {
      const { rowCount } = await client.query(
        `update attendance.checkins
            set status = 'present', confirmed_by = core.current_user_id()
          where id = any($1::uuid[]) and status = 'queued_late'`,
        [input.checkinIds],
      );
      // Gọi lại lần hai: điều kiện `status = 'queued_late'` không còn khớp → 0 dòng,
      // không lỗi. Idempotent tự nhiên (§9).
      return { updated: rowCount ?? 0 };
    });
  }),

  /**
   * "Đã gặp em rồi" — tắt tín hiệu khẩn khỏi buồng lái. Trước đây hai cột
   * handled_by/handled_at (có từ 0004) không có đường ghi nào, nên cờ khẩn nằm lại
   * tới khi hết cửa sổ dù cô đã gặp em ngay sáng hôm đó.
   */
  acknowledgeHelpRequest: careStaffProcedure
    .input(AcknowledgeHelpRequestInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.runWithDb(async (client) => {
        const { rowCount } = await client.query(
          `update attendance.help_requests
              set handled_by = core.current_user_id(), handled_at = now()
            where student_id = $1 and requested_on = $2::date and handled_at is null`,
          [input.studentId, input.requestedOn],
        );
        const updated = rowCount ?? 0;
        return AcknowledgeHelpRequestOutput.parse({ updated, alreadyHandled: updated === 0 });
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
});
