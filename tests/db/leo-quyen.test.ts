// tests/db/leo-quyen.test.ts
//
// Bài chính: KHOÁ LẠI LỖ LEO QUYỀN ở `care.acknowledgeLate`, chạy trên Postgres thật
// với RLS thật, qua đúng đường mà trình duyệt đi (tRPC caller → withUserContext).
//
// Lỗ đã tái hiện được trên máy này ngày 31/07/2026: học sinh gọi thẳng
// care.acknowledgeLate với id dòng queued_late của CHÍNH MÌNH thì tự duyệt được mình
// thành 'present' và ghi tên mình vào confirmed_by — 1 dòng bị sửa thật. Nguyên nhân
// kép: hai policy permissive (checkins_update_self OR checkins_confirm_late) cộng lại
// mở toang mọi cột của dòng chính mình, còn procedure thì chỉ hỏi "đã đăng nhập chưa".
//
// Vá ở hai tầng nên test cũng kiểm hai tầng:
//   · tầng API — học sinh gọi procedure → FORBIDDEN (không phải 200)
//   · tầng DB  — học sinh chạy ĐÚNG câu UPDATE đó bằng SQL → 0 dòng
// Bỏ một trong hai assertion là mất một nửa hàng rào mà không ai biết.
//
// Phần sau khoá nốt các quyết định nghiệp vụ của cùng gói việc: E_MOOD đếm theo chuỗi
// LIÊN TIẾP, ngưỡng đọc từ bảng, tín hiệu khẩn không bị nuốt, ghi can thiệp idempotent.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Học sinh dựng riêng cho bài này — KHÔNG mượn Minh vì seed.mjs đã gieo sẵn 5 ngày
 *  mood cho em, và test sửa lịch sử của dữ liệu seed sẽ làm hỏng các bài khác. */
const TEST_STUDENT = "71000000-0000-0000-0000-0000000000aa";
/** Ngày quá khứ đủ xa để không đụng dữ liệu seed của Minh (5 ngày gần nhất). */
const LATE_DAY_OFFSET = 40;

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null };
}

const gvcn = () => careRouter.createCaller(ctxFor(DEV.gvcn));
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

/** Gieo lịch sử mood: moods[0] = hôm nay, moods[1] = hôm qua… `null` = ngày không check-in. */
async function seedMoods(studentId: string, moods: (number | null)[]): Promise<void> {
  await asSystem(async (c) => {
    await c.query("delete from attendance.checkins where student_id = $1", [studentId]);
    for (let i = 0; i < moods.length; i++) {
      const mood = moods[i];
      if (mood == null) continue;
      await c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1, current_date - $2::int, 'in', $3, 'present', 'app')`,
        [studentId, i, mood],
      );
    }
  });
}

async function setEmotionParams(params: Record<string, unknown>): Promise<void> {
  await asSystem((c) =>
    c.query(
      "update care.thresholds set params = $1::jsonb, active = true where rule_code = 'E_MOOD' and school_id is null",
      [JSON.stringify(params)],
    ),
  );
}

/** Giá trị chuẩn sau migration 0026 — dùng lại ở beforeEach và lúc dọn dẹp. */
const STREAK_5 = {
  negative_days_streak: 5,
  mode: "streak",
  window_days: 14,
  bad_mood_max: 2,
  quiet_days: 7,
};

async function flagIdsOfClass(): Promise<string[]> {
  const dashboard = await gvcn().getDashboard();
  return dashboard.priorityFlags.map((f) => f.studentId);
}

async function today(): Promise<string> {
  const { rows } = await asSystem((c) => c.query<{ d: string }>("select current_date::text as d"));
  return rows[0]!.d;
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99001', $2, 'Em Thử Nghiệm (leo-quyen.test)')`,
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
  await asSystem(async (c) => {
    // care_cases/interventions/checkins/help_requests đều ON DELETE CASCADE theo student.
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query(
      "delete from attendance.checkins where student_id = $1 and occurred_on = current_date - $2::int",
      [FIXTURE.studentMinh, LATE_DAY_OFFSET],
    );
  });
  await setEmotionParams(STREAK_5);
});

beforeEach(async () => {
  if (!ready) return;
  await setEmotionParams(STREAK_5);
  await asSystem(async (c) => {
    await c.query("delete from attendance.checkins where student_id = $1", [TEST_STUDENT]);
    await c.query("delete from attendance.help_requests where student_id = $1", [TEST_STUDENT]);
    await c.query("delete from care.care_cases where student_id = $1", [TEST_STUDENT]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("leo quyền · học sinh KHÔNG tự duyệt được check-in gửi muộn của mình", () => {
  /** Dựng lại đúng hiện trường: một dòng queued_late của Minh, chờ GVCN xác nhận. */
  async function pendingCheckinId(): Promise<string> {
    const { rows } = await asSystem((c) =>
      c.query<{ id: string }>(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1, current_date - $2::int, 'in', 2, 'queued_late', 'offline_queue')
         on conflict (student_id, occurred_on, kind)
         do update set status = 'queued_late', confirmed_by = null
         returning id`,
        [FIXTURE.studentMinh, LATE_DAY_OFFSET],
      ),
    );
    return rows[0]!.id;
  }

  it("TẦNG API: học sinh gọi care.acknowledgeLate → FORBIDDEN, không phải 200", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    expect(await codeOfRejection(() => student().acknowledgeLate({ checkinIds: [checkinId] }))).toBe(
      "FORBIDDEN",
    );
  });

  it("TẦNG DB: học sinh chạy ĐÚNG câu UPDATE đó bằng SQL → 0 dòng bị sửa", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();

    // Đây là câu lệnh đã khai thác được ngày 31/07/2026 — chạy nguyên văn dưới vai
    // học sinh. Trước bản vá: "UPDATE 1". Sau bản vá: 0 dòng.
    const rowCount = await asUser(DEV.student, async (c) => {
      const res = await c.query(
        `update attendance.checkins
            set status = 'present', confirmed_by = core.current_user_id()
          where id = any($1::uuid[]) and status = 'queued_late'`,
        [[checkinId]],
      );
      return res.rowCount ?? 0;
    });
    expect(rowCount).toBe(0);

    const { rows } = await asSystem((c) =>
      c.query<{ status: string; confirmed_by: string | null }>(
        "select status, confirmed_by from attendance.checkins where id = $1",
        [checkinId],
      ),
    );
    expect(rows[0]?.status).toBe("queued_late");
    expect(rows[0]?.confirmed_by).toBeNull();
  });

  it("GVCN gọi acknowledgeLate → 1 dòng, và chữ ký là CÔ LAN", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();

    const res = await gvcn().acknowledgeLate({ checkinIds: [checkinId] });
    expect(res.updated).toBe(1);

    const { rows } = await asSystem((c) =>
      c.query<{ status: string; confirmed_by: string | null }>(
        "select status, confirmed_by from attendance.checkins where id = $1",
        [checkinId],
      ),
    );
    expect(rows[0]?.status).toBe("present");
    expect(rows[0]?.confirmed_by).toBe("40000000-0000-0000-0000-000000000001"); // Cô Lan
  });

  it("gọi lại lần hai → 0 dòng, không lỗi (§9 idempotent)", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    await gvcn().acknowledgeLate({ checkinIds: [checkinId] });
    const again = await gvcn().acknowledgeLate({ checkinIds: [checkinId] });
    expect(again.updated).toBe(0);
  });

  it("học sinh cũng không mở được buồng lái GVCN", async ({ skip }) => {
    if (!ready) return skip();
    expect(await codeOfRejection(() => student().getDashboard())).toBe("FORBIDDEN");
  });

  it("học sinh không ghi được can thiệp lên hồ sơ của chính mình", async ({ skip }) => {
    if (!ready) return skip();
    expect(
      await codeOfRejection(() =>
        student().logIntervention({ caseId: `${FIXTURE.studentMinh}:2026-07-31`, action: "Tự ghi" }),
      ),
    ).toBe("FORBIDDEN");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("cờ E_MOOD · 5 ngày LIÊN TIẾP, ngưỡng đọc từ bảng (§6 · quyết định 31/07/2026)", () => {
  it("4 ngày xấu liên tiếp → CHƯA bật cờ", async ({ skip }) => {
    if (!ready) return skip();
    await seedMoods(TEST_STUDENT, [1, 2, 1, 2]);
    expect(await flagIdsOfClass()).not.toContain(TEST_STUDENT);
  });

  it("5 ngày xấu liên tiếp → BẬT cờ E_MOOD", async ({ skip }) => {
    if (!ready) return skip();
    await seedMoods(TEST_STUDENT, [1, 2, 1, 2, 1]);
    const dashboard = await gvcn().getDashboard();
    const flag = dashboard.priorityFlags.find((f) => f.studentId === TEST_STUDENT);
    expect(flag?.ruleCode).toBe("E_MOOD");
    expect(flag?.detail.negativeStreak).toBe(5);
  });

  it("5 ngày xấu nhưng ĐỨT QUÃNG (có 1 ngày vui ở giữa) → KHÔNG bật cờ", async ({ skip }) => {
    if (!ready) return skip();
    // Đây chính là ca mà bản cũ bắn cờ sai: nó đếm "3 ngày bất kỳ trong 14 ngày".
    await seedMoods(TEST_STUDENT, [1, 2, 1, 4, 1, 2]);
    expect(await flagIdsOfClass()).not.toContain(TEST_STUDENT);
  });

  it("mode='window' trong bảng → chính bộ dữ liệu đứt quãng đó LẠI bật cờ", async ({ skip }) => {
    if (!ready) return skip();
    // Khoá lời hứa "đổi cách đếm chỉ là một câu UPDATE, không phải một lần deploy".
    await seedMoods(TEST_STUDENT, [1, 2, 1, 4, 1, 2]);
    await setEmotionParams({ ...STREAK_5, mode: "window" });
    expect(await flagIdsOfClass()).toContain(TEST_STUDENT);
  });

  it("hạ ngưỡng xuống 2 trong bảng → 2 ngày xấu là đủ (ngưỡng KHÔNG nằm trong code)", async ({ skip }) => {
    if (!ready) return skip();
    await seedMoods(TEST_STUDENT, [1, 2]);
    expect(await flagIdsOfClass()).not.toContain(TEST_STUDENT);

    await setEmotionParams({ ...STREAK_5, negative_days_streak: 2 });
    expect(await flagIdsOfClass()).toContain(TEST_STUDENT);
  });

  it("học sinh lớp 6A2 không lọt vào buồng lái của Cô Lan", async ({ skip }) => {
    if (!ready) return skip();
    await seedMoods(FIXTURE.studentBinh, [1, 1, 1, 1, 1]);
    try {
      expect(await flagIdsOfClass()).not.toContain(FIXTURE.studentBinh);
    } finally {
      await asSystem((c) =>
        c.query("delete from attendance.checkins where student_id = $1 and kind = 'in'", [
          FIXTURE.studentBinh,
        ]),
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("tín hiệu khẩn · em không check-in hôm đó vẫn phải hiện", () => {
  it("bấm 'cần gặp thầy cô' mà KHÔNG có check-in nào → vẫn ra cờ E_URGENT", async ({ skip }) => {
    if (!ready) return skip();
    // Bản cũ nối help_requests theo `requested_on = occurred_on` trên gốc là bảng
    // check-in: em nghỉ ốm rồi chiều bấm nút thì không có hàng nào để nối, tín hiệu
    // rơi vào hư không. Đây đúng là ca đó — không gieo một check-in nào.
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, urgency)
         values ($1, current_date, 'urgent')`,
        [TEST_STUDENT],
      ),
    );

    const dashboard = await gvcn().getDashboard();
    const flag = dashboard.priorityFlags.find((f) => f.studentId === TEST_STUDENT);
    expect(flag?.ruleCode).toBe("E_URGENT");
    expect(flag?.detail.helpRequested).toBe(true);
  });

  it("GVCN bấm 'đã gặp em rồi' → cờ rời buồng lái; gọi lại là no-op", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, urgency)
         values ($1, current_date, 'urgent')`,
        [TEST_STUDENT],
      ),
    );
    const day = await today();

    const first = await gvcn().acknowledgeHelpRequest({ studentId: TEST_STUDENT, requestedOn: day });
    expect(first).toEqual({ updated: 1, alreadyHandled: false });

    const second = await gvcn().acknowledgeHelpRequest({ studentId: TEST_STUDENT, requestedOn: day });
    expect(second).toEqual({ updated: 0, alreadyHandled: true });

    expect(await flagIdsOfClass()).not.toContain(TEST_STUDENT);
  });

  it("học sinh không tự tắt được tín hiệu khẩn của chính mình", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, urgency)
         values ($1, current_date, 'urgent')
         on conflict (student_id, requested_on) do update set handled_at = null, handled_by = null`,
        [FIXTURE.studentMinh],
      ),
    );
    const day = await today();

    expect(
      await codeOfRejection(() =>
        student().acknowledgeHelpRequest({ studentId: FIXTURE.studentMinh, requestedOn: day }),
      ),
    ).toBe("FORBIDDEN");

    const { rows } = await asSystem((c) =>
      c.query<{ open: boolean }>(
        "select handled_at is null as open from attendance.help_requests where student_id = $1 and requested_on = current_date",
        [FIXTURE.studentMinh],
      ),
    );
    expect(rows[0]?.open).toBe(true);

    await asSystem((c) =>
      c.query("delete from attendance.help_requests where student_id = $1 and requested_on = current_date", [
        FIXTURE.studentMinh,
      ]),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("§9 · ghi can thiệp gọi hai lần chỉ ra một dòng", () => {
  async function interventionCount(studentId: string): Promise<number> {
    const { rows } = await asSystem((c) =>
      c.query<{ n: string }>(
        `select count(*)::text as n
           from care.interventions i
           join care.care_cases cc on cc.id = i.case_id
          where cc.student_id = $1`,
        [studentId],
      ),
    );
    return Number(rows[0]?.n ?? 0);
  }

  it("cùng clientMutationId gọi hai lần → 1 dòng, lần hai báo deduplicated", async ({ skip }) => {
    if (!ready) return skip();
    const flagId = `${TEST_STUDENT}:${await today()}`;
    const mutationId = "22222222-2222-2222-2222-222222222222";

    const first = await gvcn().logIntervention({
      caseId: flagId,
      action: "Đã trò chuyện với em",
      note: "Em kể chuyện ở nhà",
      clientMutationId: mutationId,
    });
    const second = await gvcn().logIntervention({
      caseId: flagId,
      action: "Đã trò chuyện với em",
      note: "Em kể chuyện ở nhà",
      clientMutationId: mutationId,
    });

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.caseId).toBe(first.caseId);
    expect(second.interventionId).toBe(first.interventionId);
    expect(await interventionCount(TEST_STUDENT)).toBe(1);
  });

  it("client CŨ (không gửi clientMutationId) double-tap → vẫn 1 dòng", async ({ skip }) => {
    if (!ready) return skip();
    // Màn hình GVCN hiện tại chưa gửi mã — máy chủ tự dựng khoá chống trùng từ
    // (case, người ghi, hành động, ghi chú, ngày). Nếu bỏ nhánh này, mỗi cú bấm thừa
    // lại RESET đồng hồ leo thang 7 ngày.
    const flagId = `${TEST_STUDENT}:${await today()}`;
    await gvcn().logIntervention({ caseId: flagId, action: "Đã trò chuyện với em" });
    await gvcn().logIntervention({ caseId: flagId, action: "Đã trò chuyện với em" });
    expect(await interventionCount(TEST_STUDENT)).toBe(1);
  });

  it("hai request SONG SONG không ném lỗi và không mở hai hồ sơ (care_cases_one_open_idx)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const flagId = `${TEST_STUDENT}:${await today()}`;
    const [a, b] = await Promise.all([
      gvcn().logIntervention({ caseId: flagId, action: "Đã trò chuyện với em" }),
      gvcn().logIntervention({ caseId: flagId, action: "Đã trò chuyện với em" }),
    ]);
    expect(a.caseId).toBe(b.caseId);

    const { rows } = await asSystem((c) =>
      c.query<{ n: string }>(
        "select count(*)::text as n from care.care_cases where student_id = $1 and status = 'open'",
        [TEST_STUDENT],
      ),
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it("tâm lý cụm cũng ghi được can thiệp (không siết nhầm theo GVCN)", async ({ skip }) => {
    if (!ready) return skip();
    const res = await counselor().logIntervention({
      caseId: `${TEST_STUDENT}:${await today()}`,
      action: "Tâm lý cụm đã gặp em",
    });
    expect(res.caseId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("đóng hồ sơ · cờ phải tắt đi được", () => {
  it("closeCase đóng được một lần, lần hai là no-op", async ({ skip }) => {
    if (!ready) return skip();
    const { caseId } = await gvcn().logIntervention({
      caseId: `${TEST_STUDENT}:${await today()}`,
      action: "Đã trò chuyện với em",
    });

    const first = await gvcn().closeCase({ caseId, resolution: "Em đã ổn, gia đình đã phối hợp." });
    expect(first.closed).toBe(true);

    const second = await gvcn().closeCase({ caseId, resolution: "Em đã ổn, gia đình đã phối hợp." });
    expect(second).toEqual({ caseId, closed: false, alreadyClosed: true });

    const { rows } = await asSystem((c) =>
      c.query<{ status: string; n: string }>(
        `select cc.status,
                (select count(*)::text from care.interventions i
                  where i.case_id = cc.id and i.action = 'Đóng hồ sơ chăm sóc') as n
           from care.care_cases cc where cc.id = $1`,
        [caseId],
      ),
    );
    expect(rows[0]?.status).toBe("closed");
    // Chỉ MỘT dòng nhật ký đóng hồ sơ dù gọi hai lần.
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it("học sinh không đóng được hồ sơ", async ({ skip }) => {
    if (!ready) return skip();
    const { caseId } = await gvcn().logIntervention({
      caseId: `${TEST_STUDENT}:${await today()}`,
      action: "Đã trò chuyện với em",
    });
    expect(await codeOfRejection(() => student().closeCase({ caseId, resolution: "xong" }))).toBe(
      "FORBIDDEN",
    );
  });
});
