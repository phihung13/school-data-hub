// tests/db/quyet-dinh-gui-muon.test.ts
//
// ADR-029 (duyệt 06/08/2026): GVCN được kết luận một check-in gửi muộn thành `present`,
// `late` hoặc `absent` — nhưng kết luận khác `present` BẮT BUỘC có lý do, và mỗi lượt ghi
// để lại một dòng `attendance.late_decisions` (ai · lúc nào · từ đâu sang đâu · vì sao).
//
// Vì sao bài này chạy trên Postgres thật chứ không mock: ba trong bốn ràng buộc của
// ADR-029 sống ở tầng dữ liệu, không ở tầng TypeScript —
//   · RLS chỉ cho cô động vào dòng `queued_late` của lớp MÌNH (0025, nới cho `absent` ở 0053);
//   · sổ `attendance.late_decisions` ghi trong CÙNG giao dịch với lần đổi trạng thái;
//   · §9 idempotency dựa trên khoá duy nhất theo `client_mutation_id` trong CSDL.
// Mock bất kỳ cái nào trong ba cái đó là tự khai mình đã kiểm một thứ chưa từng chạy.
//
// PHỤ THUỘC: migration `0053` (bảng `attendance.late_decisions` + hàm
// `attendance.decide_late_checkins`). Chưa có migration thì cả file này đỏ ở lời gọi đầu
// tiên — CỐ Ý không bọc try/catch để nó "skip" cho êm: một cổng chặn tự tắt khi thứ nó
// canh chưa tồn tại thì đúng lúc cần nhất nó lại im (xem tests/helpers/db.ts, `inCi`).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Học sinh riêng của bài này — không mượn Minh, vì seed.mjs đã gieo lịch sử cho em. */
const TEST_STUDENT = "71000000-0000-0000-0000-0000000000cc";
/** Ngày quá khứ đủ xa để không đụng dữ liệu seed lẫn bài test khác. */
const LATE_DAY_OFFSET = 47;

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const gvcn = () => careRouter.createCaller(ctxFor(DEV.gvcn)); // Cô Lan — GVCN 6A1
const gvcn2 = () => careRouter.createCaller(ctxFor(DEV.gvcn2)); // Cô Hạnh — GVCN 6A2
const student = () => careRouter.createCaller(ctxFor(DEV.student));

async function codeOfRejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "KHÔNG NÉM LỖI";
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `LỖI KHÁC: ${String(err)}`;
  }
}

/**
 * Dựng lại hiện trường: một dòng `queued_late` của em, gửi lúc 07:55 giờ Việt Nam.
 *
 * Giờ gửi được ghi TƯỜNG MINH chứ không để `default now()`: bài "buồng lái hiện giờ gửi"
 * cần một con số biết trước để so, và `now()` lúc 00:30 sáng sẽ cho một chuỗi mà không
 * assertion nào nói được là đúng hay sai.
 */
async function pendingCheckinId(hhmm = "07:55"): Promise<string> {
  const { rows } = await asSystem((c) =>
    c.query<{ id: string }>(
      `insert into attendance.checkins (student_id, occurred_on, kind, status, source, occurred_at)
       values ($1, current_date - $2::int, 'in', 'queued_late', 'offline_queue',
               (current_date - $2::int)::timestamp + $3::time)
       on conflict (student_id, occurred_on, kind)
       do update set status = 'queued_late', confirmed_by = null,
                     occurred_at = (current_date - $2::int)::timestamp + $3::time
       returning id`,
      [TEST_STUDENT, LATE_DAY_OFFSET, hhmm],
    ),
  );
  return rows[0]!.id;
}

async function statusOf(checkinId: string): Promise<string | undefined> {
  const { rows } = await asSystem((c) =>
    c.query<{ status: string }>("select status from attendance.checkins where id = $1", [checkinId]),
  );
  return rows[0]?.status;
}

/**
 * Đếm TOÀN BỘ sổ, không đếm theo cột nào cả.
 *
 * Cố ý không viết `where checkin_id = $1`: hình dạng cột của `attendance.late_decisions`
 * do migration 0053 quyết, và một bài test đoán tên cột sẽ đỏ vì lý do KHÁC với thứ nó
 * định kiểm. Bài này chỉ hỏi đúng câu hỏi của ADR-029 — "có thêm một dòng sổ không" — và
 * các ca trong file chạy tuần tự nên hiệu số là của chính lời gọi vừa rồi.
 */
async function demSo(): Promise<number> {
  const { rows } = await asSystem((c) =>
    c.query<{ n: string }>("select count(*)::text as n from attendance.late_decisions"),
  );
  return Number(rows[0]!.n);
}

/** Số dòng sổ có chứa nguyên văn lý do — hỏi bằng row_to_json để khỏi đoán tên cột. */
async function soDongCoLyDo(lyDo: string): Promise<number> {
  const { rows } = await asSystem((c) =>
    c.query<{ n: string }>(
      `select count(*)::text as n
         from attendance.late_decisions t
        where row_to_json(t)::text like '%' || $1 || '%'`,
      [lyDo],
    ),
  );
  return Number(rows[0]!.n);
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99003', $2, 'Em Thử Nghiệm (quyet-dinh-gui-muon.test)')`,
      [TEST_STUDENT, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 60)`,
      [TEST_STUDENT, FIXTURE.classA],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  // checkins/late_decisions treo theo student hoặc theo checkin, đều ON DELETE CASCADE.
  await asSystem((c) => c.query("delete from core.students where id = $1", [TEST_STUDENT]));
});

beforeEach(async () => {
  if (!ready) return;
  await asSystem((c) =>
    c.query("delete from attendance.checkins where student_id = $1", [TEST_STUDENT]),
  );
});

// ───────────────────────────────────────────────────────────────────────────
describe("ADR-029 · GVCN kết luận check-in gửi muộn — ba trạng thái, có sổ", () => {
  it("kết luận 'Có mặt' → dòng đổi sang present, sổ ghi thêm một dòng", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const truoc = await demSo();

    const res = await gvcn().decideLateCheckins({ checkinIds: [checkinId], decision: "present" });

    expect(res).toEqual({ updated: 1, skipped: 0 });
    expect(await statusOf(checkinId)).toBe("present");
    // Quyền có vết: kể cả kết luận nhẹ nhất cũng để lại một dòng, không có ngoại lệ nào
    // "vì present thì vô hại" — ngoại lệ đó chính là chỗ đường ghi không vết quay lại.
    expect(await demSo()).toBe(truoc + 1);
  });

  it("kết luận 'Đi muộn' kèm lý do → dòng đổi sang late", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const lyDo = "Em tới lúc 8h10, có báo qua sổ liên lạc";

    const res = await gvcn().decideLateCheckins({
      checkinIds: [checkinId],
      decision: "late",
      reason: lyDo,
    });

    expect(res).toEqual({ updated: 1, skipped: 0 });
    expect(await statusOf(checkinId)).toBe("late");
    expect(await soDongCoLyDo(lyDo)).toBe(1);
  });

  it("kết luận 'Vắng' kèm lý do → dòng đổi sang absent (điều ADR-007 từng cấm)", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const lyDo = "Chỗ ngồi trống cả buổi, gia đình xác nhận em nghỉ";

    const res = await gvcn().decideLateCheckins({
      checkinIds: [checkinId],
      decision: "absent",
      reason: lyDo,
    });

    expect(res).toEqual({ updated: 1, skipped: 0 });
    // Đây là điểm ADR-029 sửa ADR-007: MÁY vẫn không được tự suy ra vắng, nhưng một CON
    // NGƯỜI biết chuyện gì đã xảy ra trong lớp mình thì ghi được — kèm lý do, kèm sổ.
    expect(await statusOf(checkinId)).toBe("absent");
    expect(await soDongCoLyDo(lyDo)).toBe(1);
  });

  it("chọn hàng loạt: hai dòng, một lời gọi, hai dòng sổ", async ({ skip }) => {
    if (!ready) return skip();
    const a = await pendingCheckinId();
    const { rows } = await asSystem((c) =>
      c.query<{ id: string }>(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source, occurred_at)
         values ($1, current_date - $2::int, 'in', 'queued_late', 'offline_queue',
                 (current_date - $2::int)::timestamp + time '10:20')
         returning id`,
        [TEST_STUDENT, LATE_DAY_OFFSET + 1],
      ),
    );
    const b = rows[0]!.id;
    const truoc = await demSo();

    const res = await gvcn().decideLateCheckins({
      checkinIds: [a, b],
      decision: "absent",
      reason: "Cả hai buổi em đều không tới lớp",
    });

    expect(res).toEqual({ updated: 2, skipped: 0 });
    expect(await demSo()).toBe(truoc + 2);
  });

  it("dòng KHÔNG còn queued_late → skipped, không đổi trạng thái đã có", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    await gvcn().decideLateCheckins({ checkinIds: [checkinId], decision: "present" });

    // Đồng nghiệp (hoặc chính cô, ở tab khác) đã xử trước — lượt sau không được ghi đè
    // im lặng lên một quyết định đã có người ký.
    const res = await gvcn().decideLateCheckins({
      checkinIds: [checkinId],
      decision: "absent",
      reason: "Ghi đè thử — không được phép",
    });
    expect(res).toEqual({ updated: 0, skipped: 1 });
    expect(await statusOf(checkinId)).toBe("present");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("ADR-029 · lý do bắt buộc khi kết luận khác 'Có mặt'", () => {
  it("'Vắng' mà KHÔNG có lý do → bị từ chối, dòng giữ nguyên queued_late", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const truoc = await demSo();

    // Ép kiểu ở đây là CỐ Ý: hợp đồng không cho gọi thiếu `reason`, và bài này diễn lại
    // đúng cảnh một client dựng tay (hoặc một màn hình khác) gửi thẳng payload thiếu lý
    // do. Nếu cả ba tầng chặn cùng biến mất thì lời gọi này thành công và ca đỏ.
    const code = await codeOfRejection(() =>
      gvcn().decideLateCheckins({ checkinIds: [checkinId], decision: "absent" } as never),
    );
    expect(code).toBe("BAD_REQUEST");

    expect(await statusOf(checkinId)).toBe("queued_late");
    expect(await demSo()).toBe(truoc);
  });

  it("'Đi muộn' với lý do rỗng (chỉ khoảng trắng) cũng bị từ chối", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const code = await codeOfRejection(() =>
      gvcn().decideLateCheckins({
        checkinIds: [checkinId],
        decision: "late",
        reason: "    ",
      } as never),
    );
    expect(code).toBe("BAD_REQUEST");
    expect(await statusOf(checkinId)).toBe("queued_late");
  });

  it("'Có mặt' KHÔNG cần lý do — mở quyền chứ không dựng thêm rào", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const res = await gvcn().decideLateCheckins({ checkinIds: [checkinId], decision: "present" });
    expect(res.updated).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("ADR-029 · phạm vi — chỉ lớp mình, và không phải ai đăng nhập cũng ghi được", () => {
  it("GVCN lớp 6A2 quyết định hộ một dòng của lớp 6A1 → không đổi được gì", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const truoc = await demSo();

    // Cô Hạnh QUA được cổng vai (cô cũng là GVCN), nên nếu tầng dữ liệu hở thì không còn
    // gì chặn. Chấp nhận cả hai cách từ chối — 0 dòng hoặc FORBIDDEN — nhưng KHÔNG chấp
    // nhận bất kỳ thay đổi nào trong CSDL, vì đó mới là thứ ADR-029 hứa.
    const ketQua = await gvcn2()
      .decideLateCheckins({
        checkinIds: [checkinId],
        decision: "absent",
        reason: "Lớp không phải của cô Hạnh",
      })
      .catch((err) => err as { code?: string });

    if ("updated" in (ketQua as object)) {
      expect((ketQua as { updated: number; skipped: number })).toEqual({ updated: 0, skipped: 1 });
    } else {
      expect((ketQua as { code?: string }).code).toBe("FORBIDDEN");
    }
    expect(await statusOf(checkinId)).toBe("queued_late");
    expect(await demSo()).toBe(truoc);
  });

  it("học sinh gọi thẳng decideLateCheckins cho dòng của CHÍNH MÌNH → FORBIDDEN", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Đây là lỗ leo quyền số 1 ở đầu care.ts, dựng lại trên thủ tục MỚI: thủ tục mới ghi
    // được cả `absent`, nên nếu nó lặp lại lỗi cũ thì em không chỉ tự duyệt được mình mà
    // còn tự đánh vắng được mình.
    const { rows } = await asSystem((c) =>
      c.query<{ id: string }>(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source)
         values ($1, current_date - $2::int, 'in', 'queued_late', 'offline_queue')
         on conflict (student_id, occurred_on, kind)
         do update set status = 'queued_late', confirmed_by = null
         returning id`,
        [FIXTURE.studentMinh, LATE_DAY_OFFSET],
      ),
    );
    const checkinId = rows[0]!.id;

    expect(
      await codeOfRejection(() =>
        student().decideLateCheckins({ checkinIds: [checkinId], decision: "present" }),
      ),
    ).toBe("FORBIDDEN");
    expect(await statusOf(checkinId)).toBe("queued_late");

    // TẦNG DB, độc lập với tầng vai: em chạy thẳng hàm bằng SQL cũng không đổi được gì.
    const tuGoi = await asUser(DEV.student, async (c) => {
      try {
        const r = await c.query<{ updated: number }>(
          `select updated from attendance.decide_late_checkins($1::uuid[], 'present', null, null)`,
          [[checkinId]],
        );
        return r.rows[0]?.updated ?? 0;
      } catch {
        // Bị từ chối thẳng cũng là một câu trả lời đúng.
        return 0;
      }
    });
    expect(tuGoi).toBe(0);
    expect(await statusOf(checkinId)).toBe("queued_late");

    await asSystem((c) =>
      c.query("delete from attendance.checkins where id = $1", [checkinId]),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("§9 · gọi hai lần cùng clientMutationId là MỘT quyết định", () => {
  it("lần hai updated = 0 và sổ KHÔNG thêm dòng", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const mutationId = "33333333-3333-3333-3333-333333333333";
    const lyDo = "Em vắng không phép, đã gọi phụ huynh";
    const truoc = await demSo();

    const first = await gvcn().decideLateCheckins({
      checkinIds: [checkinId],
      decision: "absent",
      reason: lyDo,
      clientMutationId: mutationId,
    });
    expect(first).toEqual({ updated: 1, skipped: 0 });
    const giua = await demSo();
    expect(giua).toBe(truoc + 1);

    // Retry mạng, hoặc cô bấm hai lần vì màn hình chưa kịp phản hồi. Đây KHÔNG phải quyết
    // định thứ hai — nếu nó sinh thêm một dòng sổ thì bản kiểm sau này đọc ra "cô đánh
    // vắng em hai lần", một sự kiện chưa từng xảy ra.
    const second = await gvcn().decideLateCheckins({
      checkinIds: [checkinId],
      decision: "absent",
      reason: lyDo,
      clientMutationId: mutationId,
    });
    expect(second.updated).toBe(0);
    expect(await demSo()).toBe(giua);
    expect(await statusOf(checkinId)).toBe("absent");
  });

  it("acknowledgeLate (client cũ) double-tap → 1 dòng sổ, không hai", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const truoc = await demSo();

    const first = await gvcn().acknowledgeLate({ checkinIds: [checkinId] });
    const second = await gvcn().acknowledgeLate({ checkinIds: [checkinId] });

    expect(first.updated).toBe(1);
    expect(second.updated).toBe(0);
    expect(await demSo()).toBe(truoc + 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("ADR-029 · lối tắt cũ và giờ gửi trên buồng lái", () => {
  it("acknowledgeLate vẫn chạy, và nay ĐỂ LẠI VẾT như mọi đường ghi khác", async ({ skip }) => {
    if (!ready) return skip();
    const checkinId = await pendingCheckinId();
    const truoc = await demSo();

    // Client cũ (PWA đã cài trên máy thầy cô) còn gọi tên này lâu. Nó phải tiếp tục chạy
    // — nhưng qua CÙNG một đường với thủ tục mới, nếu không thì đúng cái client chậm cập
    // nhật nhất lại là đường ghi duy nhất không ai soát được.
    const res = await gvcn().acknowledgeLate({ checkinIds: [checkinId] });
    expect(res.updated).toBe(1);
    expect(await statusOf(checkinId)).toBe("present");
    expect(await demSo()).toBe(truoc + 1);
  });

  it("buồng lái hiện GIỜ GỬI của từng dòng, dạng HH:MM giờ Việt Nam", async ({ skip }) => {
    if (!ready) return skip();
    await pendingCheckinId("07:55");

    const dashboard = await gvcn().getDashboard({ classId: FIXTURE.classA });
    const dong = dashboard.pendingLateCheckins.find((p) => p.studentId === TEST_STUDENT);

    expect(dong).toBeDefined();
    // Chính là dữ kiện để cô quyết: bấm lúc 07:55 khác hẳn bấm lúc 10:20. Trước ADR-029
    // màn hình chỉ đếm được "1 check-in gửi muộn".
    expect(dong!.occurredAtTime).toBe("07:55");
    expect(dong!.occurredAtTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it("giờ gửi KHÔNG đi qua UTC — dòng gửi lúc 00:30 vẫn là 00:30", async ({ skip }) => {
    if (!ready) return skip();
    // Ca này bắt đúng lỗi mà `lib/date.ts` sinh ra để chặn ở phía JS: mọi giờ địa phương
    // trước 07:00 nằm ở ngày UTC hôm trước, nên một lối đổi múi giờ tự chế sẽ in "17:30"
    // của hôm trước. Phiên Postgres đã ghim Asia/Ho_Chi_Minh (client.ts) nên `to_char`
    // trả đúng giờ cô nhìn thấy trên đồng hồ.
    await pendingCheckinId("00:30");

    const dashboard = await gvcn().getDashboard({ classId: FIXTURE.classA });
    const dong = dashboard.pendingLateCheckins.find((p) => p.studentId === TEST_STUDENT);
    expect(dong?.occurredAtTime).toBe("00:30");
  });
});
