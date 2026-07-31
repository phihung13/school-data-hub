// tests/db/ghi-chu-tu-van.test.ts — gói "rls-ghi-chu-tu-van" (31/07/2026).
//
// Hai lỗi đi cùng nhau, nên khoá chung một file.
//
//  1. RLS QUÁ RỘNG. Policy `counselor_notes_scope` (0009:222) dùng chung
//     `core.can_see_care()` với cờ và hồ sơ chăm sóc — tức `is_homeroom_of OR
//     in_my_cluster` — nên GVCN đọc được NGUYÊN VĂN buổi tư vấn tâm lý của học sinh
//     lớp mình. Chú thích ngay trên policy tự nhận là "hẹp nhất trong care", nhưng
//     điều kiện thì y hệt hai policy phía trên: chú thích nói một đằng, code làm một
//     nẻo, và không có test nào hỏi lại. Đứa trẻ ngồi với cô tâm lý được hứa rằng
//     chuyện này không quay về lớp; migration 0035 làm cho lời hứa đó thành thật.
//
//  2. QUYỀN LỆCH. `careStaffProcedure` mở ba mutation cho vai `counselor`
//     (acknowledgeHelpRequest · logIntervention · closeCase) trong khi MỌI query của
//     router `care` đều là `homeroomProcedure`. Cô Mai tắt được cờ khẩn và ĐÓNG được
//     hồ sơ chăm sóc của một đứa trẻ mà không có đường nào nhìn thấy hồ sơ trước khi
//     tắt. Nay `listClassInterventions` cũng mang `careStaffProcedure`.
//
// Luật mà file này cưỡng chế, viết ra để lần sau không ai làm lệch lại: VỚI CÙNG MỘT
// VAI, một request ĐỌC và một request GHI phải cho CÙNG MỘT KẾT LUẬN QUYỀN. Ghi được
// mà không đọc được không phải "chặt hơn" — đó là bắt người ta quyết định trong bóng tối.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Học sinh riêng của bài này — không giẫm lên Minh hay lên em thử nghiệm của bài khác. */
const TEST_STUDENT = "71000000-0000-0000-0000-0000000000cc";
/** Cơ sở + lớp NGOÀI cụm của cô Mai: để chứng minh phạm vi cụm có biên thật, không phải "mọi lớp". */
const OUT_SCHOOL = "21000000-0000-0000-0000-0000000000c2";
const OUT_CLASS = "31000000-0000-0000-0000-0000000000c2";

let caseId = "";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const gvcn = () => careRouter.createCaller(ctxFor(DEV.gvcn)); // Cô Lan — GVCN 6A1
const gvcn2 = () => careRouter.createCaller(ctxFor(DEV.gvcn2)); // Cô Hạnh — GVCN 6A2
const counselor = () => careRouter.createCaller(ctxFor(DEV.counselor)); // Cô Mai — tâm lý cụm
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

/** Số dòng ghi chú tư vấn mà MỘT NGƯỜI CỤ THỂ đọc được — chạy dưới RLS thật, không phải asSystem. */
async function notesVisibleTo(authUid: string): Promise<number> {
  const { rows } = await asUser(authUid, (c) =>
    c.query<{ n: string }>("select count(*)::text as n from care.counselor_notes where case_id = $1", [
      caseId,
    ]),
  );
  return Number(rows[0]?.n ?? 0);
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query("delete from core.classes where id = $1", [OUT_CLASS]);
    await c.query("delete from core.schools where id = $1", [OUT_SCHOOL]);

    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99003', $2, 'Em Thử Nghiệm (ghi-chu-tu-van.test)')`,
      [TEST_STUDENT, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 30)`,
      [TEST_STUDENT, FIXTURE.classA],
    );

    // Cơ sở thứ hai, KHÔNG có ai mang vai counselor ở đó.
    const { rows: net } = await c.query<{ id: string }>("select id from core.school_networks limit 1");
    await c.query(
      "insert into core.schools (id, network_id, code, name) values ($1, $2, 'VA-TEST-Q2', 'Cơ sở thử nghiệm ngoài cụm')",
      [OUT_SCHOOL, net[0]!.id],
    );
    await c.query(
      "insert into core.classes (id, school_id, code, academic_year, grade) values ($1, $2, '6B1-TEST', '2026-2027', 6)",
      [OUT_CLASS, OUT_SCHOOL],
    );

    // Hồ sơ chăm sóc + một dòng nhật ký hành động + một ghi chú tư vấn do cô Mai viết.
    const { rows: mai } = await c.query<{ id: string }>(
      "select id from core.users where auth_uid = $1",
      [DEV.counselor],
    );
    const { rows: kase } = await c.query<{ id: string }>(
      "insert into care.care_cases (student_id, owner_id, tier) values ($1, $2, 2) returning id",
      [TEST_STUDENT, mai[0]!.id],
    );
    caseId = kase[0]!.id;

    await c.query(
      "insert into care.interventions (case_id, actor_id, action) values ($1, $2, 'Tâm lý cụm đã gặp em')",
      [caseId, mai[0]!.id],
    );
    await c.query(
      "insert into care.counselor_notes (case_id, author_id, body) values ($1, $2, $3)",
      [caseId, mai[0]!.id, "Nội dung buổi tư vấn — em được hứa chuyện này không quay về lớp"],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  // care_cases → interventions/counselor_notes đều ON DELETE CASCADE theo học sinh.
  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query("delete from core.classes where id = $1", [OUT_CLASS]);
    await c.query("delete from core.schools where id = $1", [OUT_SCHOOL]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("ghi chú tư vấn · ai đọc được nội dung buổi tư vấn", () => {
  it("tâm lý cụm đọc được — chiều cho phép", async ({ skip }) => {
    if (!ready) return skip();
    expect(await notesVisibleTo(DEV.counselor)).toBe(1);
  });

  it("GVCN CỦA CHÍNH EM ĐÓ đọc ra 0 dòng (DESIGN-GUIDELINES §9)", async ({ skip }) => {
    if (!ready) return skip();
    // Đây là lỗi đang vá. Trước 0035 con số này là 1, và 0009_rls_matrix_test.sql
    // còn khẳng định 1 mới là đúng.
    expect(await notesVisibleTo(DEV.gvcn)).toBe(0);
  });

  it("nhưng GVCN VẪN thấy nhật ký can thiệp — siết ghi chú không được khoá buồng lái", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const { rows } = await asUser(DEV.gvcn, (c) =>
      c.query<{ n: string }>(
        "select count(*)::text as n from care.interventions where case_id = $1",
        [caseId],
      ),
    );
    // Cô biết «tâm lý cụm đã gặp em». Cô không biết em kể gì. Đúng hai vế đó.
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  it("phụ huynh và học sinh đọc ra 0 dòng", async ({ skip }) => {
    if (!ready) return skip();
    expect(await notesVisibleTo(DEV.guardian)).toBe(0);
    expect(await notesVisibleTo(DEV.student)).toBe(0);
  });

  it("GVCN lớp khác và quản trị đọc ra 0 dòng", async ({ skip }) => {
    if (!ready) return skip();
    expect(await notesVisibleTo(DEV.gvcn2)).toBe(0);
    expect(await notesVisibleTo(DEV.admin)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("đối xứng quyền · cùng một vai, đọc và ghi phải cùng kết luận", () => {
  it("TÂM LÝ CỤM: đọc được VÀ ghi được — hết trạng thái ghi-được-không-đọc-được", async ({
    skip,
  }) => {
    if (!ready) return skip();

    // ĐỌC — đường mới mở (careStaffProcedure thay vì homeroomProcedure).
    const log = await counselor().listClassInterventions({ classId: FIXTURE.classA, limit: 50 });
    expect(log.className).toBe("6A1");
    expect(log.rows.some((r) => r.studentId === TEST_STUDENT)).toBe(true);

    // GHI — đường đã có từ trước. Hai kết luận phải giống nhau.
    const written = await counselor().logIntervention({
      caseId,
      action: "Tâm lý cụm đã gặp em (đối xứng đọc/ghi)",
    });
    expect(written.caseId).toBe(caseId);
  });

  it("HỌC SINH: đọc 403 và ghi 403 — cũng là một kết luận, chỉ là kết luận ngược lại", async ({
    skip,
  }) => {
    if (!ready) return skip();
    expect(
      await codeOfRejection(() =>
        student().listClassInterventions({ classId: FIXTURE.classA, limit: 50 }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOfRejection(() => student().closeCase({ caseId, resolution: "tự đóng" })),
    ).toBe("FORBIDDEN");
  });

  it("GVCN không mất gì: vẫn mặc định về lớp chủ nhiệm khi không truyền classId", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const log = await gvcn().listClassInterventions({ limit: 50 });
    expect(log.classId).toBe(FIXTURE.classA);
  });

  it("GVCN lớp khác vẫn bị chặn — mở đường cho tâm lý cụm không được mở cửa sau cho GVCN", async ({
    skip,
  }) => {
    if (!ready) return skip();
    expect(
      await codeOfRejection(() =>
        gvcn2().listClassInterventions({ classId: FIXTURE.classA, limit: 50 }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("tâm lý cụm KHÔNG truyền lớp → đòi nói rõ, không đoán hộ một lớp", async ({ skip }) => {
    if (!ready) return skip();
    // "Im lặng không phải kết luận": cụm là nhiều lớp, chọn bừa lớp đầu tiên rồi hiển
    // thị như thể đó là "lớp của cô" là dạng sai trông như thật. BAD_REQUEST chứ không
    // phải FORBIDDEN — thiếu tham số khác với không có quyền.
    expect(await codeOfRejection(() => counselor().listClassInterventions({ limit: 50 }))).toBe(
      "BAD_REQUEST",
    );
  });

  it("tâm lý cụm hỏi lớp NGOÀI cụm → FORBIDDEN, phạm vi cụm có biên thật", async ({ skip }) => {
    if (!ready) return skip();
    expect(
      await codeOfRejection(() =>
        counselor().listClassInterventions({ classId: OUT_CLASS, limit: 50 }),
      ),
    ).toBe("FORBIDDEN");
  });
});
