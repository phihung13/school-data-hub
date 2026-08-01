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
  return { authUid, roles: [], displayName: null, clientIp: null };
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
// Viết lại 01/08/2026 ([QĐ-1] · ADR-026 · nợ #32).
//
// Sáu ca cũ ở đây gieo lịch sử mood rồi bấm ngưỡng trong `care.thresholds` để xem buồng
// lái có bật cờ E_MOOD không — tức là chúng kiểm THUẬT TOÁN ĐẾM NGÀY XẤU qua đường buồng
// lái, vì hồi đó buồng lái tự đếm. Nay nó không đếm nữa: `care.run_flag_engine` đếm, ghi
// vào `care.flags`, buồng lái chỉ đọc. Giữ nguyên các ca cũ là bắt buồng lái chịu trách
// nhiệm cho một phép tính nó không còn làm — chúng sẽ đỏ mãi mãi mà không chỉ ra lỗi nào.
//
// Phần ngưỡng/chuỗi ngày nay được khoá ở ĐÚNG chỗ nó sống:
//   · `packages/core/db/tests/0042_nguong_theo_co_so_test.sql` — ngưỡng theo từng cơ sở
//   · `tests/db/flag-engine.test.ts` — engine sinh cờ
// Ở đây chỉ còn câu hỏi thuộc về buồng lái: nó có ĐỌC ĐƯỢC cờ không, và có LỘ số không.
describe("cờ E_MOOD đọc từ care.flags — buồng lái không tự đếm nữa (ADR-026)", () => {
  /** Ghi thẳng một cờ như engine ghi. `detail` cố tình mang đủ số để test có cái mà soi. */
  async function seedMoodFlag(studentId: string): Promise<void> {
    await asSystem((c) =>
      c.query(
        `insert into care.flags (student_id, rule_code, as_of_date, detail, origin)
         values ($1, 'E_MOOD', current_date, $2::jsonb, 'live')
         on conflict (student_id, rule_code, as_of_date) do update set detail = excluded.detail`,
        [studentId, JSON.stringify({ mode: "streak", nguong: 5, negative_days: 6, negative_streak: 6 })],
      ),
    );
  }

  it("không có dòng nào trong care.flags → buồng lái không có cờ E_MOOD", async ({ skip }) => {
    if (!ready) return skip();
    // Gieo 6 ngày mood xấu liên tiếp — thừa sức vượt ngưỡng 5 của bảng. Buồng lái VẪN
    // phải im, vì nó không còn nhìn vào nhật ký cảm xúc: đây chính là [QĐ-1] đo được.
    await seedMoods(TEST_STUDENT, [1, 1, 1, 1, 1, 1]);
    expect(await flagIdsOfClass()).not.toContain(TEST_STUDENT);
  });

  it("engine đã ghi cờ → buồng lái đọc ra, KÈM nhịp 'quét đêm'", async ({ skip }) => {
    if (!ready) return skip();
    await seedMoodFlag(TEST_STUDENT);
    const dashboard = await gvcn().getDashboard();
    const flag = dashboard.priorityFlags.find((f) => f.studentId === TEST_STUDENT);
    expect(flag?.ruleCode).toBe("E_MOOD");
    // VIỆC 4: hai nhịp trong một danh sách thì mỗi thẻ phải tự khai nhịp của mình.
    expect(flag?.detail.cadence).toBe("quet_dem");
    expect(flag?.detail.openHelpRequests).toEqual([]);
  });

  it("KHÔNG một con số cảm xúc nào lọt ra tới client (DESIGN-GUIDELINES §9)", async ({ skip }) => {
    if (!ready) return skip();
    await seedMoodFlag(TEST_STUDENT);
    const dashboard = await gvcn().getDashboard();
    const flag = dashboard.priorityFlags.find((f) => f.studentId === TEST_STUDENT);
    expect(flag).toBeDefined();

    // `care.flags.detail` TRONG CSDL vẫn có đủ negative_days/negative_streak/nguong —
    // RLS `flags_scope` cho GVCN đọc cả cột đó. Chỗ cắt là ở TẦNG HỢP ĐỒNG, và đây là
    // assertion chứng minh nó cắt thật: soi nguyên chuỗi JSON đi ra client.
    const wire = JSON.stringify(flag);
    for (const leak of ["negative_days", "negativeDays", "negative_streak", "negativeStreak", "nguong", "threshold"]) {
      expect(wire, `"${leak}" không được đi tới trình duyệt của cô`).not.toContain(leak);
    }
    expect(Object.keys(flag!.detail).sort()).toEqual(["cadence", "openHelpRequests", "recentlyHandled"]);
  });

  it("cờ backfill (chạy bù quá khứ) KHÔNG hiện như tình hình hôm nay", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into care.flags (student_id, rule_code, as_of_date, detail, origin)
         values ($1, 'E_MOOD', current_date, '{}'::jsonb, 'backfill')
         on conflict (student_id, rule_code, as_of_date) do update set origin = 'backfill'`,
        [TEST_STUDENT],
      ),
    );
    expect(await flagIdsOfClass()).not.toContain(TEST_STUDENT);
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
    // [QĐ-2]: tín hiệu khẩn tính THẲNG trong lượt gọi, không chờ lượt quét đêm.
    expect(flag?.detail.cadence).toBe("tuc_thi");
    expect(flag?.detail.openHelpRequests).toHaveLength(1);
    expect(flag?.detail.openHelpRequests[0]!.requestedOn).toBe(await today());
    expect(flag?.detail.openHelpRequests[0]!.helpRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
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

    const { rows: hr } = await asSystem((c) =>
      c.query<{ id: string }>(
        "select id from attendance.help_requests where student_id = $1 and requested_on = current_date",
        [TEST_STUDENT],
      ),
    );
    const helpRequestIds = [hr[0]!.id];

    const first = await gvcn().acknowledgeHelpRequest({ studentId: TEST_STUDENT, helpRequestIds });
    expect(first.justHandled).toBe(1);
    expect(first.alreadyHandled).toBe(0);
    expect(first.notFound).toBe(0);
    expect(first.remainingOpen).toBe(0);

    // §9 — gọi lại KHÔNG nhân đôi tác dụng, và trả lời KHÁC HẲN lần đầu chứ không gộp
    // vào cùng một câu. `handledByMe` phân biệt double-tap của chính cô với việc đồng
    // nghiệp đã xử lý trước: hai chuyện khác nhau, hai câu khác nhau trên màn.
    const second = await gvcn().acknowledgeHelpRequest({ studentId: TEST_STUDENT, helpRequestIds });
    expect(second.justHandled).toBe(0);
    expect(second.alreadyHandled).toBe(1);
    expect(second.notFound).toBe(0);
    expect(second.handledByMe).toBe(true);
    expect(second.handledAt).not.toBeNull();

    expect(await flagIdsOfClass()).not.toContain(TEST_STUDENT);
  });

  it("em gửi thêm sau khi màn hình đã tải → remainingOpen NÓI RA, không im", async ({ skip }) => {
    if (!ready) return skip();
    // Đây là ca mà phương án "đóng hết yêu cầu treo của em" sẽ nuốt mất lời em vừa gửi:
    // buồng lái không tự làm tươi, nên nó có thể đang vẽ trạng thái của mười phút trước.
    // Gửi đúng tập id ĐANG HIỆN TRÊN MÀN thì dòng mới sống sót — và máy chủ phải báo là
    // nó còn đó, nếu không cô đóng màn hình với niềm tin đã xử lý xong.
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, urgency)
         values ($1, current_date - 1, 'today'), ($1, current_date, 'urgent')`,
        [TEST_STUDENT],
      ),
    );
    const { rows } = await asSystem((c) =>
      c.query<{ id: string }>(
        `select id from attendance.help_requests
          where student_id = $1 and requested_on = current_date - 1`,
        [TEST_STUDENT],
      ),
    );

    // Cô chỉ nhìn thấy (và chỉ bấm) dòng hôm qua.
    const res = await gvcn().acknowledgeHelpRequest({
      studentId: TEST_STUDENT,
      helpRequestIds: [rows[0]!.id],
    });
    expect(res.justHandled).toBe(1);
    // Dòng hôm nay KHÔNG bị đóng ké, và màn hình được báo là nó còn treo.
    expect(res.remainingOpen).toBe(1);

    const { rows: still } = await asSystem((c) =>
      c.query<{ n: string }>(
        "select count(*)::text as n from attendance.help_requests where student_id = $1 and handled_at is null",
        [TEST_STUDENT],
      ),
    );
    expect(Number(still[0]!.n)).toBe(1);
  });

  it("gửi id không thuộc em này → notFound, KHÔNG gộp vào 'đã có người xử lý'", async ({ skip }) => {
    if (!ready) return skip();
    // Bản cũ trả về đúng một chuỗi cho cả hai ca, nên màn hình in "Người khác đã xử lý
    // trước rồi." trong khi thật ra không dòng nào khớp và yêu cầu của em treo nguyên.
    const res = await gvcn().acknowledgeHelpRequest({
      studentId: TEST_STUDENT,
      helpRequestIds: ["00000000-0000-4000-8000-000000000000"],
    });
    expect(res.notFound).toBe(1);
    expect(res.justHandled).toBe(0);
    expect(res.alreadyHandled).toBe(0);
    expect(res.handledByMe).toBe(false);
    expect(res.handledAt).toBeNull();
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
    const { rows: hr } = await asSystem((c) =>
      c.query<{ id: string }>(
        "select id from attendance.help_requests where student_id = $1 and requested_on = current_date",
        [FIXTURE.studentMinh],
      ),
    );

    expect(
      await codeOfRejection(() =>
        student().acknowledgeHelpRequest({
          studentId: FIXTURE.studentMinh,
          helpRequestIds: [hr[0]!.id],
        }),
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
