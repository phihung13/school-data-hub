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
  ApproveReportInput,
  ApproveReportOutput,
  CloseCaseInput,
  CloseCaseOutput,
  GetClassRosterInput,
  GetClassRosterOutput,
  GetDashboardOutput,
  GetMyClassesOutput,
  ListClassInterventionsInput,
  ListClassInterventionsOutput,
  ListReportApprovalsInput,
  ListReportApprovalsOutput,
  LogInterventionInput,
  LogInterventionOutput,
  MarkAttendanceInput,
  MarkAttendanceOutput,
} from "@hub/core/contracts";
import type { AttendanceStatus } from "@hub/core/contracts";
import type { PoolClient } from "@hub/core/db";
import { mondayOf, toLocalIsoDate } from "@/lib/date";
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
        mood: number | null;
        checked_in_at: string | null;
        has_open_case: boolean;
        help_pending: boolean;
      }>(
        // Gốc là DANH SÁCH LỚP (core.enrollments) rồi LEFT JOIN các nguồn tín hiệu —
        // cùng lý do đã ghi ở getDashboard: lấy bảng check-in làm gốc thì em không
        // check-in sẽ biến mất khỏi chính danh sách lớp của mình.
        `select e.student_id,
                s.student_code,
                s.full_name,
                c.status,
                c.mood,
                c.occurred_at::text as checked_in_at,
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
          mood: r.mood as 1 | 2 | 3 | 4 | null,
          checkedInAt: r.checked_in_at,
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
   * Danh sách Báo cáo Trưởng thành của lớp trong một tuần, kèm trạng thái duyệt.
   * Em chưa có dòng nào trong sổ duyệt thì hiện `pending` — KHÔNG tạo sẵn dòng
   * `pending` trong bảng: sổ chỉ ghi việc con người đã quyết, im lặng không phải quyết định.
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
          happy_days: number;
        }>(
          `select e.student_id,
                  s.student_code,
                  s.full_name,
                  a.status,
                  a.reviewed_at::text as reviewed_at,
                  a.note,
                  coalesce(w.checkin_days, 0) as checkin_days,
                  coalesce(w.happy_days, 0) as happy_days
             from core.enrollments e
             join core.students s on s.id = e.student_id
             left join report.growth_report_approvals a
               on a.student_id = e.student_id and a.week_start = $2::date
             left join lateral (
               select count(*) filter (where c.kind = 'in')::int as checkin_days,
                      count(*) filter (where c.mood = 4)::int as happy_days
                 from attendance.checkins c
                where c.student_id = e.student_id
                  and c.occurred_on between $2::date and $2::date + 4
             ) w on true
            where e.class_id = $1 and e.valid_to is null
            order by s.full_name`,
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
            happyDays: r.happy_days,
          })),
        });
      });
    }),

  /**
   * Duyệt (hoặc trả lại) báo cáo một tuần của một em.
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

  /** Nhật ký can thiệp của cả lớp — màn "Ghi chú can thiệp" đọc từ đây. */
  listClassInterventions: homeroomProcedure
    .input(ListClassInterventionsInput)
    .query(async ({ ctx, input }) => {
      const classId = requireMyClass(ctx.homeroomClassIds, input.classId);

      return ctx.runWithDb(async (client) => {
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
});
