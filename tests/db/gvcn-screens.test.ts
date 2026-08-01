// tests/db/gvcn-screens.test.ts
//
// Khoá lại phần máy chủ của BỐN màn hình GVCN (gói "gvcn-man-hinh"): danh sách lớp,
// điểm danh lớp, duyệt Báo cáo Trưởng thành, ghi chú can thiệp.
//
// Chạy trên Postgres thật với RLS thật, qua đúng đường trình duyệt đi (tRPC caller →
// withUserContext). Ba nhóm câu hỏi, không nhóm nào bỏ được:
//
//   1. PHÂN QUYỀN — GVCN lớp khác và học sinh chạm được gì? Câu trả lời đúng phải là
//      "không gì cả", ở CẢ tầng API lẫn tầng DB. Migration 0032 nới quyền ghi
//      attendance.checkins cho GVCN, nên đây cũng là bài kiểm tra rằng lỗ leo quyền đã
//      vá ở 0025 không mở lại theo đường mới.
//   2. §9 IDEMPOTENT — markAttendance và approveReport bắn hai lần cùng payload: số
//      dòng không đổi, output không đổi.
//   3. SỰ THẬT — im lặng không được trình bày thành kết luận: em chưa check-in phải ra
//      `status = null`, không phải 'absent'.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Học sinh riêng của bài này — không mượn Minh để khỏi giẫm lên dữ liệu seed. */
const TEST_STUDENT = "71000000-0000-0000-0000-0000000000bb";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const gvcn = () => careRouter.createCaller(ctxFor(DEV.gvcn)); // Cô Lan — GVCN 6A1
const gvcn2 = () => careRouter.createCaller(ctxFor(DEV.gvcn2)); // Cô Hạnh — GVCN 6A2
const student = () => careRouter.createCaller(ctxFor(DEV.student));
const counselor = () => careRouter.createCaller(ctxFor(DEV.counselor));

async function codeOfRejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "KHÔNG NÉM LỖI";
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `LỖI KHÁC: ${String(err)}`;
  }
}

async function today(): Promise<string> {
  const { rows } = await asSystem((c) => c.query<{ d: string }>("select current_date::text as d"));
  return rows[0]!.d;
}

/** Thứ Hai của tuần hiện tại, tính bằng chính Postgres để không lệch múi giờ với server. */
async function thisMonday(): Promise<string> {
  const { rows } = await asSystem((c) =>
    c.query<{ d: string }>("select date_trunc('week', current_date)::date::text as d"),
  );
  return rows[0]!.d;
}

async function checkinRowCount(studentId: string, onDate: string): Promise<number> {
  const { rows } = await asSystem((c) =>
    c.query<{ n: string }>(
      "select count(*)::text as n from attendance.checkins where student_id = $1 and occurred_on = $2::date",
      [studentId, onDate],
    ),
  );
  return Number(rows[0]?.n ?? 0);
}

async function approvalRowCount(studentId: string): Promise<number> {
  const { rows } = await asSystem((c) =>
    c.query<{ n: string }>(
      "select count(*)::text as n from report.growth_report_approvals where student_id = $1",
      [studentId],
    ),
  );
  return Number(rows[0]?.n ?? 0);
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99002', $2, 'Em Thử Nghiệm (gvcn-screens.test)')`,
      [TEST_STUDENT, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 30)`,
      [TEST_STUDENT, FIXTURE.classA],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  // checkins / approvals / care_cases đều ON DELETE CASCADE theo học sinh.
  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query("delete from report.growth_report_approvals where student_id = $1", [
      FIXTURE.studentMinh,
    ]);
  });
});

beforeEach(async () => {
  if (!ready) return;
  await asSystem(async (c) => {
    await c.query("delete from attendance.checkins where student_id = $1", [TEST_STUDENT]);
    await c.query("delete from report.growth_report_approvals where student_id = $1", [TEST_STUDENT]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("màn 1 · danh sách lớp", () => {
  it("GVCN thấy đúng lớp mình chủ nhiệm, kèm sĩ số thật", async ({ skip }) => {
    if (!ready) return skip();
    const { classes } = await gvcn().getMyClasses();
    expect(classes.map((c) => c.classCode)).toEqual(["6A1"]);
    expect(classes[0]!.studentCount).toBeGreaterThanOrEqual(2); // Minh + em thử nghiệm
  });

  it("danh sách lớp có mọi em, kể cả em CHƯA check-in — và em đó là null chứ không phải 'absent'", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Đây là ca dễ sai nhất: lấy bảng check-in làm gốc thì em chưa bấm gì biến mất khỏi
    // chính danh sách lớp của mình; điền sẵn 'absent' thì máy tự kết luận thay con người.
    const roster = await gvcn().getClassRoster({});
    const row = roster.students.find((s) => s.studentId === TEST_STUDENT);
    expect(row).toBeDefined();
    expect(row!.status).toBeNull();
    // `mood` đã bị GỠ khỏi hợp đồng (ADR-026) chứ không phải trả về null: null ở đây sẽ
    // gộp "chưa ai ghi" với "không được phép đọc" vào cùng một giá trị. Khẳng định bằng
    // hình dạng object — nếu ai đó nối lại cột này thì test đỏ.
    expect(Object.keys(row!)).not.toContain("mood");
    expect(row!.source).toBeNull();
    expect(row!.checkedInAt).toBeNull();
    expect(row!.studentCode).toBe("VA-2026-99002");
  });

  it("GVCN lớp khác KHÔNG đọc được lớp 6A1", async ({ skip }) => {
    if (!ready) return skip();
    expect(await codeOfRejection(() => gvcn2().getClassRoster({ classId: FIXTURE.classA }))).toBe(
      "FORBIDDEN",
    );
  });

  it("học sinh và tâm lý cụm không mở được danh sách lớp (procedure dành cho GVCN)", async ({ skip }) => {
    if (!ready) return skip();
    expect(await codeOfRejection(() => student().getClassRoster({}))).toBe("FORBIDDEN");
    expect(await codeOfRejection(() => counselor().getMyClasses())).toBe("FORBIDDEN");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("màn 2 · điểm danh lớp", () => {
  it("GVCN ghi được điểm danh hộ, dòng mới mang source='teacher' và chữ ký của cô", async ({ skip }) => {
    if (!ready) return skip();
    const day = await today();

    const res = await gvcn().markAttendance({
      occurredOn: day,
      entries: [{ studentId: TEST_STUDENT, status: "absent" }],
    });
    expect(res).toEqual({ applied: 1, skipped: 0 });

    const { rows } = await asSystem((c) =>
      c.query<{ status: string; source: string; confirmed_by: string | null }>(
        "select status, source, confirmed_by from attendance.checkins where student_id = $1 and occurred_on = $2::date",
        [TEST_STUDENT, day],
      ),
    );
    expect(rows[0]?.status).toBe("absent");
    expect(rows[0]?.source).toBe("teacher");
    expect(rows[0]?.confirmed_by).toBe("40000000-0000-0000-0000-000000000001"); // Cô Lan
  });

  it("§9 — gọi hai lần cùng payload: 1 dòng, output y hệt", async ({ skip }) => {
    if (!ready) return skip();
    const day = await today();
    const payload = {
      occurredOn: day,
      entries: [{ studentId: TEST_STUDENT, status: "present" as const }],
    };

    const first = await gvcn().markAttendance(payload);
    const second = await gvcn().markAttendance(payload);

    expect(second).toEqual(first);
    expect(await checkinRowCount(TEST_STUDENT, day)).toBe(1);
  });

  it("sửa lại trạng thái đã ghi thì ghi đè, không đẻ dòng thứ hai", async ({ skip }) => {
    if (!ready) return skip();
    const day = await today();
    await gvcn().markAttendance({ occurredOn: day, entries: [{ studentId: TEST_STUDENT, status: "absent" }] });
    await gvcn().markAttendance({ occurredOn: day, entries: [{ studentId: TEST_STUDENT, status: "late" }] });

    expect(await checkinRowCount(TEST_STUDENT, day)).toBe(1);
    const roster = await gvcn().getClassRoster({ onDate: day });
    expect(roster.students.find((s) => s.studentId === TEST_STUDENT)?.status).toBe("late");
  });

  it("em KHÔNG thuộc lớp bị bỏ qua im lặng, và dòng của em đó KHÔNG bị đụng tới", async ({ skip }) => {
    if (!ready) return skip();
    const day = await today();
    // Bình học 6A2 và seed đã gieo sẵn một dòng check-in hôm nay (source='app'). Đây
    // đúng là ca nguy hiểm nhất: nếu câu upsert lọt qua ranh giới lớp thì nó không chỉ
    // ghi thêm, nó GHI ĐÈ dữ liệu thật của lớp đồng nghiệp. Vì vậy so nguyên vẹn cả
    // dòng trước/sau chứ không chỉ đếm số dòng.
    const rowOf = async (studentId: string) => {
      const { rows } = await asSystem((c) =>
        c.query<{ status: string; source: string; confirmed_by: string | null }>(
          "select status, source, confirmed_by from attendance.checkins where student_id = $1 and occurred_on = $2::date",
          [studentId, day],
        ),
      );
      return rows[0] ?? null;
    };

    const before = await rowOf(FIXTURE.studentBinh);
    const res = await gvcn().markAttendance({
      occurredOn: day,
      entries: [
        { studentId: TEST_STUDENT, status: "present" },
        { studentId: FIXTURE.studentBinh, status: "absent" }, // lớp 6A2 — không phải lớp cô Lan
      ],
    });
    expect(res).toEqual({ applied: 1, skipped: 1 });
    expect(await rowOf(FIXTURE.studentBinh)).toEqual(before);
    expect(await checkinRowCount(TEST_STUDENT, day)).toBe(1);
  });

  it("GVCN lớp khác gọi markAttendance vào lớp 6A1 → FORBIDDEN", async ({ skip }) => {
    if (!ready) return skip();
    const day = await today();
    expect(
      await codeOfRejection(() =>
        gvcn2().markAttendance({
          classId: FIXTURE.classA,
          occurredOn: day,
          entries: [{ studentId: TEST_STUDENT, status: "present" }],
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(await checkinRowCount(TEST_STUDENT, day)).toBe(0);
  });

  it("TẦNG DB · học sinh chạy đúng câu ghi hộ đó bằng SQL → 0 dòng (0025 vẫn còn hiệu lực)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const day = await today();
    // 0032 nới quyền ghi cho GVCN. Bài này khẳng định nó KHÔNG nới cho ai khác: học sinh
    // Minh thử tự tạo một dòng 'present' mang dấu 'teacher' cho chính mình.
    const inserted = await asUser(DEV.student, async (c) => {
      try {
        const res = await c.query(
          `insert into attendance.checkins (student_id, occurred_on, kind, status, source, confirmed_by)
           values ($1, $2::date, 'in', 'present', 'teacher', core.current_user_id())
           on conflict (student_id, occurred_on, kind) do nothing`,
          [TEST_STUDENT, day],
        );
        return res.rowCount ?? 0;
      } catch (err) {
        // RLS từ chối INSERT bằng exception (42501) — cũng là kết quả đúng.
        expect((err as { code?: string }).code).toBe("42501");
        return 0;
      }
    });
    expect(inserted).toBe(0);
    expect(await checkinRowCount(TEST_STUDENT, day)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("màn 3 · duyệt báo cáo", () => {
  it("chưa quyết định gì thì trạng thái là 'pending' — KHÔNG tạo sẵn dòng trong sổ", async ({ skip }) => {
    if (!ready) return skip();
    const list = await gvcn().listReportApprovals({});
    const row = list.rows.find((r) => r.studentId === TEST_STUDENT);
    expect(row?.status).toBe("pending");
    expect(row?.reviewedAt).toBeNull();
    // Im lặng không phải là một quyết định: sổ chỉ ghi việc con người đã quyết.
    expect(await approvalRowCount(TEST_STUDENT)).toBe(0);
  });

  it("§9 — duyệt hai lần: 1 dòng, cùng trạng thái, cùng dấu thời gian", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();

    const first = await gvcn().approveReport({ studentId: TEST_STUDENT, weekStart: week, decision: "approved" });
    const second = await gvcn().approveReport({ studentId: TEST_STUDENT, weekStart: week, decision: "approved" });

    expect(first.status).toBe("approved");
    expect(first.alreadyRecorded).toBe(false);
    expect(second.alreadyRecorded).toBe(true);
    expect(second.reviewedAt).toBe(first.reviewedAt); // không ghi đè giờ quyết định thật
    expect(await approvalRowCount(TEST_STUDENT)).toBe(1);
  });

  it("ngày giữa tuần được nắn về thứ Hai — không sinh dòng thứ hai cho cùng một tuần", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const wednesday = await asSystem(async (c) => {
      const { rows } = await c.query<{ d: string }>("select ($1::date + 2)::text as d", [week]);
      return rows[0]!.d;
    });

    await gvcn().approveReport({ studentId: TEST_STUDENT, weekStart: week, decision: "approved" });
    const again = await gvcn().approveReport({
      studentId: TEST_STUDENT,
      weekStart: wednesday,
      decision: "approved",
    });

    expect(again.weekStart).toBe(week);
    expect(await approvalRowCount(TEST_STUDENT)).toBe(1);
  });

  it("đổi quyết định thì cập nhật đúng dòng đó, và trả lại BẮT BUỘC có lý do", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    await gvcn().approveReport({ studentId: TEST_STUDENT, weekStart: week, decision: "approved" });

    expect(
      await codeOfRejection(() =>
        gvcn().approveReport({ studentId: TEST_STUDENT, weekStart: week, decision: "rejected" }),
      ),
    ).toBe("BAD_REQUEST");

    const rejected = await gvcn().approveReport({
      studentId: TEST_STUDENT,
      weekStart: week,
      decision: "rejected",
      note: "Tuần này em nghỉ ốm 3 ngày, báo cáo chưa phản ánh đúng.",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.alreadyRecorded).toBe(false);
    expect(await approvalRowCount(TEST_STUDENT)).toBe(1);
  });

  it("GVCN lớp khác và học sinh không duyệt được báo cáo của em này", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    expect(
      await codeOfRejection(() =>
        gvcn2().approveReport({ studentId: TEST_STUDENT, weekStart: week, decision: "approved" }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOfRejection(() =>
        student().approveReport({ studentId: FIXTURE.studentMinh, weekStart: week, decision: "approved" }),
      ),
    ).toBe("FORBIDDEN");
    expect(await approvalRowCount(TEST_STUDENT)).toBe(0);
  });

  it("TẦNG DB · học sinh không tự ghi được vào sổ duyệt, cũng không đọc được sổ", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    await gvcn().approveReport({ studentId: TEST_STUDENT, weekStart: week, decision: "approved" });

    const seen = await asUser(DEV.student, async (c) => {
      const res = await c.query("select id from report.growth_report_approvals");
      return res.rowCount ?? 0;
    });
    expect(seen).toBe(0);

    const written = await asUser(DEV.student, async (c) => {
      try {
        const res = await c.query(
          `insert into report.growth_report_approvals (student_id, week_start, status, reviewer_id, reviewed_at)
           values ($1, $2::date, 'approved', core.current_user_id(), now())
           on conflict (student_id, week_start) do nothing`,
          [FIXTURE.studentMinh, week],
        );
        return res.rowCount ?? 0;
      } catch (err) {
        expect((err as { code?: string }).code).toBe("42501");
        return 0;
      }
    });
    expect(written).toBe(0);
    expect(await approvalRowCount(FIXTURE.studentMinh)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("màn 4 · ghi chú can thiệp", () => {
  it("ghi xong thì thấy ngay trong nhật ký của lớp", async ({ skip }) => {
    if (!ready) return skip();
    const flagId = `${TEST_STUDENT}:${await today()}`;
    const mutationId = "33333333-3333-3333-3333-333333333333";

    await gvcn().logIntervention({
      caseId: flagId,
      action: "Đã gọi điện cho phụ huynh",
      note: "Gia đình sẽ đưa em đi khám",
      clientMutationId: mutationId,
    });

    const log = await gvcn().listClassInterventions({ limit: 50 });
    const row = log.rows.find((r) => r.studentId === TEST_STUDENT);
    expect(row?.action).toBe("Đã gọi điện cho phụ huynh");
    expect(row?.caseStatus).toBe("open");

    // §9 — bấm lại cùng mã không đẻ dòng thứ hai trong nhật ký.
    await gvcn().logIntervention({
      caseId: flagId,
      action: "Đã gọi điện cho phụ huynh",
      note: "Gia đình sẽ đưa em đi khám",
      clientMutationId: mutationId,
    });
    const again = await gvcn().listClassInterventions({ limit: 50 });
    expect(again.rows.filter((r) => r.studentId === TEST_STUDENT).length).toBe(1);

    await asSystem((c) => c.query("delete from care.care_cases where student_id = $1", [TEST_STUDENT]));
  });

  it("GVCN lớp khác không đọc được nhật ký lớp 6A1; học sinh cũng không", async ({ skip }) => {
    if (!ready) return skip();
    expect(
      await codeOfRejection(() => gvcn2().listClassInterventions({ classId: FIXTURE.classA, limit: 50 })),
    ).toBe("FORBIDDEN");
    expect(await codeOfRejection(() => student().listClassInterventions({ limit: 50 }))).toBe("FORBIDDEN");
  });
});
