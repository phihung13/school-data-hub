// tests/db/gvcn-nhieu-lop.test.ts
//
// Gói "gvcn-nhieu-lop" (31/07/2026): buồng lái GVCN thôi cố định ở một lớp.
//
// Vì sao cần một file test riêng thay vì thêm vài `it` vào gvcn-screens.test.ts: cả kho
// test hiện nay chỉ dựng ĐÚNG MỘT lớp cho mỗi giáo viên (cô Lan → 6A1, cô Hạnh → 6A2).
// Trong thế giới một-lớp-một-cô, cái lỗi này KHÔNG quan sát được: `homeroomClassIds[0]`
// luôn đúng vì mảng chỉ có một phần tử, và câu SELECT không ORDER BY luôn "đúng" vì chỉ
// có một dòng để trả. File này dựng thế giới thật của một khối — một cô hai lớp — rồi
// mới hỏi ba câu:
//
//   1. ĐÚNG LỚP: buồng lái trả về lớp NÀO ĐƯỢC HỎI, và từ chối lớp của đồng nghiệp.
//   2. XÁC ĐỊNH: không hỏi gì thì lớp mặc định phải CỐ ĐỊNH giữa các lần gọi, và phải
//      trùng với lớp mà bốn màn con mở (getMyClasses trả về đầu tiên). Trước hôm nay
//      lớp mặc định là phần tử đầu của `core.v_my_scopes` — một SELECT không ORDER BY,
//      nên buồng lái và bốn màn con hoàn toàn có thể mở hai lớp khác nhau cùng lúc.
//   3. KHÔNG LẪN: mọi con số và mọi thẻ cờ của một lớp chỉ được đến từ chính lớp đó.
//      Đây là câu quan trọng nhất — một buồng lái ghi "6A1" mà đếm học sinh cả hai lớp
//      là sai theo hướng nguy hiểm nhất: nó vẫn trông như một con số hợp lý.
//
// Lớp thử nghiệm mang mã "6A0-TEST", cố ý SẮP TRƯỚC "6A1" theo thứ tự chữ: nếu lớp mặc
// định vẫn lấy theo thứ tự ngẫu nhiên của v_my_scopes thay vì theo mã lớp, phép so sánh
// ở nhóm 2 sẽ đỏ. Đuôi "-TEST" để không ai nhầm nó với một lớp thật khi soi CSDL.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asSystem, requireDb, DEV, FIXTURE } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Lớp thứ HAI của cô Lan — chỉ tồn tại trong file này, dọn sạch ở afterAll. */
const TEST_CLASS = "31000000-0000-0000-0000-0000000000c1";
/** Đúng một em, để sĩ số của lớp này không thể trùng với sĩ số lớp 6A1. */
const TEST_STUDENT = "71000000-0000-0000-0000-0000000000c1";
/** id dòng phân công GVCN — xoá theo id để không đụng phân công thật của cô Lan. */
const TEST_ASSIGNMENT = "51000000-0000-0000-0000-0000000000c1";
/** core.teachers.id của cô Lan (seed.mjs: TEACHER_GVCN). */
const TEACHER_LAN = "50000000-0000-0000-0000-000000000001";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const lan = () => careRouter.createCaller(ctxFor(DEV.gvcn)); // chủ nhiệm 6A1 + 6A0-TEST
const hanh = () => careRouter.createCaller(ctxFor(DEV.gvcn2)); // chủ nhiệm 6A2
const minh = () => careRouter.createCaller(ctxFor(DEV.student));

async function codeOfRejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "KHÔNG NÉM LỖI";
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `LỖI KHÁC: ${String(err)}`;
  }
}

/** Dọn sạch mọi thứ file này tạo ra. Gọi cả TRƯỚC lúc dựng lẫn ở afterAll: một lần chạy
 *  bị ngắt giữa chừng không được để lại lớp thừa cho gvcn-screens.test.ts nhặt phải. */
async function cleanup(): Promise<void> {
  await asSystem(async (c) => {
    await c.query("delete from core.class_assignments where id = $1", [TEST_ASSIGNMENT]);
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query("delete from core.classes where id = $1", [TEST_CLASS]);
  });
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await cleanup();
  await asSystem(async (c) => {
    await c.query(
      `insert into core.classes (id, school_id, code, academic_year, grade)
       values ($1, $2, '6A0-TEST', '2026-2027', 6)`,
      [TEST_CLASS, FIXTURE.schoolQ7],
    );
    // NGUỒN SỰ THẬT của quan hệ GVCN ↔ lớp là bảng này (0030) — không cần và KHÔNG
    // được thêm dòng core.user_role_scopes: v_my_scopes bỏ qua vai homeroom ở đó.
    await c.query(
      `insert into core.class_assignments (id, teacher_id, class_id, assignment_role, subject)
       values ($1, $2, $3, 'homeroom', null)`,
      [TEST_ASSIGNMENT, TEACHER_LAN, TEST_CLASS],
    );
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99101', $2, 'Em Lớp Hai (gvcn-nhieu-lop.test)')`,
      [TEST_STUDENT, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 30)`,
      [TEST_STUDENT, TEST_CLASS],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  await cleanup();
});

beforeEach(async () => {
  if (!ready) return;
  await asSystem(async (c) => {
    await c.query("delete from attendance.checkins where student_id = $1", [TEST_STUDENT]);
    await c.query("delete from attendance.help_requests where student_id = $1", [TEST_STUDENT]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("nền: cô Lan thật sự chủ nhiệm hai lớp", () => {
  it("getMyClasses trả cả hai lớp, sắp theo mã lớp", async ({ skip }) => {
    if (!ready) return skip();
    const { classes } = await lan().getMyClasses();
    expect(classes.map((c) => c.classCode)).toEqual(["6A0-TEST", "6A1"]);
    // Sĩ số là của TỪNG lớp, không phải tổng — lớp thử nghiệm có đúng một em.
    expect(classes.find((c) => c.classCode === "6A0-TEST")!.studentCount).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("1 · buồng lái mở đúng lớp được hỏi", () => {
  it("hỏi lớp nào trả lớp đó, và nói rõ là lớp nào", async ({ skip }) => {
    if (!ready) return skip();

    const a = await lan().getDashboard({ classId: FIXTURE.classA });
    expect(a.classId).toBe(FIXTURE.classA);
    expect(a.className).toBe("6A1");

    const b = await lan().getDashboard({ classId: TEST_CLASS });
    expect(b.classId).toBe(TEST_CLASS);
    expect(b.className).toBe("6A0-TEST");
  });

  it("lớp của đồng nghiệp → FORBIDDEN, không phải một bảng số liệu rỗng", async ({ skip }) => {
    if (!ready) return skip();
    // Rỗng vì lớp yên ổn và rỗng vì không được phép là hai chuyện khác nhau; trả rỗng ở
    // đây là dạy người dùng đọc im lặng thành kết luận.
    expect(await codeOfRejection(() => lan().getDashboard({ classId: FIXTURE.classB }))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOfRejection(() => hanh().getDashboard({ classId: TEST_CLASS }))).toBe(
      "FORBIDDEN",
    );
  });

  it("thêm tham số classId KHÔNG mở cửa cho người không phải GVCN", async ({ skip }) => {
    if (!ready) return skip();
    // Bề mặt mới của một procedure nhạy cảm phải được kiểm lại từ đầu: học sinh gửi
    // đúng mã lớp của mình cũng không được vào (đây chính là hình dạng lỗi leo quyền
    // đã vá ở 0025, nay thử lại theo đường mới).
    expect(await codeOfRejection(() => minh().getDashboard({ classId: FIXTURE.classA }))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOfRejection(() => minh().getDashboard())).toBe("FORBIDDEN");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("2 · lớp mặc định cố định và khớp với bốn màn con", () => {
  it("không truyền classId → đúng lớp đầu tiên THEO MÃ LỚP, không phải lớp ngẫu nhiên", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const { classes } = await lan().getMyClasses();
    const firstOfPicker = classes[0]!; // đúng thứ mà useSelectedClass chọn khi chưa ai bấm

    const d = await lan().getDashboard();
    expect(d.classId).toBe(firstOfPicker.classId);
    expect(d.className).toBe(firstOfPicker.classCode);
    expect(d.className).toBe("6A0-TEST");
  });

  it("gọi nhiều lần cho ra CÙNG một lớp", async ({ skip }) => {
    if (!ready) return skip();
    // v_my_scopes không có ORDER BY: với hai dòng homeroom, thứ tự trả về là chuyện của
    // planner. Năm lần gọi ra năm câu trả lời giống nhau là điều kiện tối thiểu để câu
    // "GVCN lớp X" trên màn hình có nghĩa.
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) seen.add((await lan().getDashboard()).classId);
    expect([...seen]).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("3 · số liệu và cờ không lẫn giữa hai lớp", () => {
  it("sĩ số, check-in, cảm xúc: mỗi lớp đếm phần của mình", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1, current_date, 'in', 1, 'present', 'app')`,
        [TEST_STUDENT],
      ),
    );

    const small = await lan().getDashboard({ classId: TEST_CLASS });
    expect(small.totals.totalStudents).toBe(1);
    expect(small.totals.checkinCount).toBe(1);
    expect(small.moodDistribution).toEqual([{ mood: 1, count: 1 }]);

    const big = await lan().getDashboard({ classId: FIXTURE.classA });
    // Lớp 6A1 có Minh (seed) và có thể có em do file test khác để lại — chỉ khẳng định
    // điều CHẮC CHẮN đúng: em của lớp thử nghiệm không được đếm sang đây.
    expect(big.totals.totalStudents).toBeGreaterThanOrEqual(1);
    expect(big.classId).toBe(FIXTURE.classA);
    // Check-in vừa tạo là của lớp kia; buổi sáng nay của 6A1 không được cộng thêm nó.
    expect(big.moodDistribution.find((m) => m.mood === 1)?.count ?? 0).toBe(
      await moodOneCountOfClassA(),
    );
  });

  it("cờ khẩn của lớp này không hiện trên buồng lái lớp kia", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on) values ($1, current_date)`,
        [TEST_STUDENT],
      ),
    );

    const small = await lan().getDashboard({ classId: TEST_CLASS });
    expect(small.priorityFlags.map((f) => f.studentId)).toContain(TEST_STUDENT);
    // className trên thẻ cờ phải là lớp đang xem — thẻ cờ ghi nhầm lớp thì cô đi tìm em
    // ở phòng học khác.
    expect(small.priorityFlags.every((f) => f.className === "6A0-TEST")).toBe(true);

    const big = await lan().getDashboard({ classId: FIXTURE.classA });
    expect(big.priorityFlags.map((f) => f.studentId)).not.toContain(TEST_STUDENT);
    expect(big.pendingLateCheckins.map((p) => p.studentId)).not.toContain(TEST_STUDENT);
  });
});

/**
 * Số em lớp 6A1 check-in với tâm trạng «Buồn» hôm nay, đọc thẳng từ CSDL.
 *
 * Cố tình KHÔNG viết một con số cứng: dữ liệu seed của Minh đổi theo ngày trong tuần và
 * các file test khác cũng ghi vào lớp này. So sánh với sự thật của chính CSDL thì phép
 * kiểm vẫn nói đúng điều nó cần nói (không lẫn lớp) mà không đỏ vì lý do khác.
 */
async function moodOneCountOfClassA(): Promise<number> {
  const { rows } = await asSystem((c) =>
    c.query<{ n: string }>(
      `select count(*)::text as n
         from attendance.checkins c
         join core.enrollments e on e.student_id = c.student_id and e.valid_to is null
        where e.class_id = $1 and c.occurred_on = current_date and c.mood = 1`,
      [FIXTURE.classA],
    ),
  );
  return Number(rows[0]?.n ?? 0);
}
