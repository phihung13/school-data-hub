// tests/db/cheo-khoi.test.ts
//
// Gói "khoi-7-8-va-kiem-cheo-khoi" (01/08/2026): phân quyền không rò CHÉO KHỐI.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO FILE NÀY TỒN TẠI, VÀ VÌ SAO NÓ KHÔNG THỂ RA ĐỜI SỚM HƠN
//
// Lộ trình go-live có hạng mục "bài kiểm nhiều lớp thuộc NHIỀU KHỐI: mỗi giáo viên chỉ
// thấy lớp mình". Trước hôm nay hạng mục đó KHÔNG kiểm được, và điều tệ hơn là nó trông
// như đã kiểm: hub_dev chỉ có khối 6 (`select grade, count(*) from core.classes` trả
// đúng một dòng `6|5`), nên mọi câu "không thấy khối khác" đều trả 0 dòng — 0 vì KHÔNG
// CÓ KHỐI KHÁC, không vì hàng rào chặn. Một bài test như vậy xanh mãi mãi, kể cả sau
// ngày ai đó gỡ sạch policy.
//
// Bộ seed từ hôm nay có ba khối trên hai cơ sở (xem packages/core/db/seed/seed.mjs).
// File này khai thác đúng điều đó, và tự áp một luật cho chính mình:
//
//   MỌI khẳng định phủ định ("X không thấy Y") phải đi kèm một phép đo MẪU SỐ lấy từ
//   CSDL bằng quyền hệ thống, và mẫu số đó phải khác 0. Không có mẫu số thì assertion
//   bị coi là chưa chạy — `dam(...)` bên dưới ném lỗi thay vì để bài xanh.
//
// Con số KHÔNG viết cứng: hub_dev là CSDL sống, các file test khác dựng và dọn lớp tạm
// trên đó. Mọi kỳ vọng đều đọc lại từ chính CSDL ngay trước khi so — bài này phải đỏ khi
// phân quyền hỏng, không phải đỏ khi có người thêm một em vào lớp.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asSystem, requireDb } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

beforeAll(async () => {
  ready = await requireDb();
});

// Danh tính khai TẠI ĐÂY chứ không thêm vào tests/helpers/db.ts: helper là file dùng
// chung, và đợt này có nhiều gói cùng chạy — mỗi gói tự giữ hằng số của mình thì không
// ai phải gỡ xung đột trong một file mà cả ba cùng sửa. Khớp seed.mjs và
// packages/core/db/fixtures/000_test_support.sql.
const AI = {
  coLan: "90000000-0000-0000-0000-000000000001", // GVCN 6A1
  coMai: "90000000-0000-0000-0000-000000000003", // tâm lý, cụm = cơ sở Quận 7
  phuHuynh: "90000000-0000-0000-0000-000000000004", // phụ huynh của Minh
  minh: "90000000-0000-0000-0000-000000000005", // học sinh
  hung: "90000000-0000-0000-0000-000000000007", // hiệu trưởng cơ sở Quận 7
  coThu: "90000000-0000-0000-0000-00000000000b", // GVCN 7A1
  thayPhuc: "90000000-0000-0000-0000-00000000000c", // GVCN 7A2
  coYen: "90000000-0000-0000-0000-00000000000d", // GVCN 8A1
  thayLoc: "90000000-0000-0000-0000-00000000000e", // GVCN 8B1 — cơ sở Quận 2
  thaySon: "90000000-0000-0000-0000-00000000000f", // bộ môn Tiếng Anh: 6A5 + 7A1
} as const;

const LOP = {
  a6_1: "30000000-0000-0000-0000-000000000001",
  a6_5: "30000000-0000-0000-0000-000000000005",
  a7_1: "30000000-0000-0000-0000-000000000701",
  a7_2: "30000000-0000-0000-0000-000000000702",
  a8_1: "30000000-0000-0000-0000-000000000801",
  a8_2: "30000000-0000-0000-0000-000000000802", // 8B1, cơ sở Quận 2
} as const;

const CO_SO = {
  q7: "20000000-0000-0000-0000-000000000001",
  q2: "20000000-0000-0000-0000-000000000002",
} as const;

const STUDENT_MINH = "70000000-0000-0000-0000-000000000001";

function ctxFor(authUid: string): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

async function codeOfRejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "KHÔNG NÉM LỖI";
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `LỖI KHÁC: ${String(err)}`;
  }
}

// ── Bộ đếm dùng chung ───────────────────────────────────────────────────────

/** Số em đang học ở một KHỐI, đếm dưới danh tính `ai` (null = quyền hệ thống). */
async function emTheoKhoi(khoi: number, ai: string | null, coSo?: string): Promise<number> {
  const sql = `select count(*)::text as n
                 from core.students st
                 join core.enrollments e on e.student_id = st.id and e.valid_to is null
                 join core.classes c on c.id = e.class_id
                where c.grade = $1 ${coSo ? "and c.school_id = $2" : ""}`;
  const params = coSo ? [khoi, coSo] : [khoi];
  const run = (c: import("@hub/core/db").PoolClient) =>
    c.query<{ n: string }>(sql, params).then((r) => Number(r.rows[0]!.n));
  return ai === null ? asSystem(run) : asUser(ai, run);
}

/** Số em đang học ở một LỚP, đếm dưới danh tính `ai` (null = quyền hệ thống). */
async function emTheoLop(lop: string, ai: string | null): Promise<number> {
  const run = (c: import("@hub/core/db").PoolClient) =>
    c
      .query<{ n: string }>(
        `select count(*)::text as n from core.students st
           join core.enrollments e on e.student_id = st.id and e.valid_to is null
          where e.class_id = $1`,
        [lop],
      )
      .then((r) => Number(r.rows[0]!.n));
  return ai === null ? asSystem(run) : asUser(ai, run);
}

/** Số em của một CƠ SỞ (không qua lớp — đúng cách phạm vi hiệu trưởng cắt). */
async function emTheoCoSo(coSo: string, ai: string | null): Promise<number> {
  const run = (c: import("@hub/core/db").PoolClient) =>
    c
      .query<{ n: string }>("select count(*)::text as n from core.students where school_id = $1", [
        coSo,
      ])
      .then((r) => Number(r.rows[0]!.n));
  return ai === null ? asSystem(run) : asUser(ai, run);
}

/**
 * Cổng mẫu số. Trả lại chính con số để dùng tiếp, nhưng NÉM nếu nó bằng 0.
 *
 * Vì sao ném chứ không `expect(...).toBeGreaterThan(0)`: hai cách đều làm bài đỏ, nhưng
 * lời ném nói thẳng ra nguyên nhân thật ("bộ seed mất khối 7") thay vì để người đọc thấy
 * một assertion phụ đỏ giữa mười assertion chính và đoán xem cái nào là gốc.
 */
function dam(n: number, moTa: string): number {
  if (n <= 0) {
    throw new Error(
      `MẪU SỐ RỖNG — ${moTa} đang là 0. Mọi khẳng định phủ định dựa trên nó sẽ xanh giả. ` +
        "Kiểm lại packages/core/db/seed/seed.mjs (khối KHOI_78) rồi chạy lại `pnpm db:seed`.",
    );
  }
  return n;
}

// ───────────────────────────────────────────────────────────────────────────
describe("0 · nền: CSDL thật sự có nhiều khối để mà hỏi", () => {
  it("có ít nhất ba khối, và mỗi khối có em thật", async ({ skip }) => {
    if (!ready) return skip();
    const { rows } = await asSystem((c) =>
      c.query<{ grade: number }>("select distinct grade from core.classes order by grade"),
    );
    const khoi = rows.map((r) => r.grade);
    // Đây là assertion QUAN TRỌNG NHẤT của cả file, dù nó không nói gì về phân quyền:
    // nó là điều kiện để mọi assertion còn lại có nghĩa.
    expect(khoi).toEqual(expect.arrayContaining([6, 7, 8]));

    dam(await emTheoKhoi(6, null), "sĩ số khối 6");
    dam(await emTheoKhoi(7, null), "sĩ số khối 7");
    dam(await emTheoKhoi(8, null, CO_SO.q7), "sĩ số khối 8 cơ sở Quận 7");
    dam(await emTheoKhoi(8, null, CO_SO.q2), "sĩ số khối 8 cơ sở Quận 2");
  });

  it("giáo viên bộ môn dạy chéo khối NHƯNG không dạy hết — cả hai vế đều cần", async ({ skip }) => {
    if (!ready) return skip();
    const { rows } = await asSystem((c) =>
      c.query<{ day: string; khoi: string; tong: string }>(
        `select (select count(*)::text from core.class_assignments ca
                  join core.users u on true
                  join core.teachers t on t.id = ca.teacher_id and t.user_id = u.id
                 where u.auth_uid = $1 and ca.assignment_role = 'subject') as day,
                (select count(distinct c.grade)::text from core.class_assignments ca
                  join core.teachers t on t.id = ca.teacher_id
                  join core.users u on u.id = t.user_id
                  join core.classes c on c.id = ca.class_id
                 where u.auth_uid = $1 and ca.assignment_role = 'subject') as khoi,
                (select count(*)::text from core.classes) as tong`,
        [AI.thaySon],
      ),
    );
    const { day, khoi, tong } = rows[0]!;
    // Dạy một khối → "chéo khối" chỉ là chữ. Dạy hết → câu "không thấy lớp mình không
    // dạy" lại rỗng mẫu số, đúng cái bẫy cũ, chỉ dời lên một tầng.
    expect(Number(khoi)).toBeGreaterThanOrEqual(2);
    expect(Number(day)).toBeLessThan(Number(tong));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("1 · GVCN chỉ thấy khối của lớp mình — kiểm CẢ HAI CHIỀU", () => {
  it("GVCN khối 7 thấy đủ lớp mình và KHÔNG thấy một em nào khối 6 hay khối 8", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const siSo7A1 = dam(await emTheoLop(LOP.a7_1, null), "sĩ số 7A1");
    const mauSo6 = dam(await emTheoKhoi(6, null), "sĩ số khối 6");
    const mauSo8 = dam(await emTheoKhoi(8, null), "sĩ số khối 8");

    expect(await emTheoLop(LOP.a7_1, AI.coThu)).toBe(siSo7A1);
    expect(await emTheoKhoi(6, AI.coThu)).toBe(0);
    expect(await emTheoKhoi(8, AI.coThu)).toBe(0);
    // Nhắc lại mẫu số trong chính assertion, để khi bài này đỏ vì "0 === 0" người đọc
    // thấy ngay hai con số đứng cạnh nhau.
    expect([mauSo6, mauSo8].every((n) => n > 0)).toBe(true);
  });

  it("chiều ngược lại: GVCN khối 6 KHÔNG thấy một em nào khối 7 hay khối 8", async ({ skip }) => {
    if (!ready) return skip();
    // Rất nhiều lỗi phân quyền chỉ rò MỘT chiều — người của "khối gốc" thấy hết, người
    // mới thì không. Kiểm một chiều rồi kết luận là cách bỏ sót đúng nửa vấn đề.
    dam(await emTheoKhoi(7, null), "sĩ số khối 7");
    dam(await emTheoKhoi(8, null), "sĩ số khối 8");
    expect(await emTheoKhoi(7, AI.coLan)).toBe(0);
    expect(await emTheoKhoi(8, AI.coLan)).toBe(0);
    expect(await emTheoLop(LOP.a6_1, AI.coLan)).toBe(await emTheoLop(LOP.a6_1, null));
  });

  it("cùng khối vẫn không đủ: GVCN 7A1 không thấy 7A2", async ({ skip }) => {
    if (!ready) return skip();
    dam(await emTheoLop(LOP.a7_2, null), "sĩ số 7A2");
    expect(await emTheoLop(LOP.a7_2, AI.coThu)).toBe(0);
    dam(await emTheoLop(LOP.a7_1, null), "sĩ số 7A1");
    expect(await emTheoLop(LOP.a7_1, AI.thayPhuc)).toBe(0);
  });

  it("cùng KHỐI khác CƠ SỞ cũng không: GVCN 8A1 (Q7) và GVCN 8B1 (Q2) không thấy nhau", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const siSo8A1 = dam(await emTheoLop(LOP.a8_1, null), "sĩ số 8A1");
    const siSo8B1 = dam(await emTheoLop(LOP.a8_2, null), "sĩ số 8B1");

    expect(await emTheoLop(LOP.a8_1, AI.coYen)).toBe(siSo8A1);
    expect(await emTheoLop(LOP.a8_2, AI.coYen)).toBe(0);

    expect(await emTheoLop(LOP.a8_2, AI.thayLoc)).toBe(siSo8B1);
    expect(await emTheoLop(LOP.a8_1, AI.thayLoc)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("2 · giáo viên bộ môn: phạm vi là DANH SÁCH LỚP, không phải khối", () => {
  it("thấy đủ hai lớp mình dạy ở hai khối khác nhau", async ({ skip }) => {
    if (!ready) return skip();
    const siSo6A5 = dam(await emTheoLop(LOP.a6_5, null), "sĩ số 6A5");
    const siSo7A1 = dam(await emTheoLop(LOP.a7_1, null), "sĩ số 7A1");
    expect(await emTheoLop(LOP.a6_5, AI.thaySon)).toBe(siSo6A5);
    expect(await emTheoLop(LOP.a7_1, AI.thaySon)).toBe(siSo7A1);
  });

  it("KHÔNG thấy phần còn lại của chính hai khối đó", async ({ skip }) => {
    if (!ready) return skip();
    // Đây là hình dạng lỗi mà một hàng rào "chặn theo khối của giáo viên" sẽ để lọt:
    // thầy có mặt ở khối 6 và khối 7, nên nếu phạm vi tính theo KHỐI thì thầy thấy cả
    // 60 em khối 6 và cả 24 em khối 7. Phạm vi đúng là danh sách lớp được phân công.
    const caKhoi6 = dam(await emTheoKhoi(6, null), "sĩ số khối 6");
    const caKhoi7 = dam(await emTheoKhoi(7, null), "sĩ số khối 7");
    const thay6 = await emTheoKhoi(6, AI.thaySon);
    const thay7 = await emTheoKhoi(7, AI.thaySon);

    expect(thay6).toBe(await emTheoLop(LOP.a6_5, null));
    expect(thay7).toBe(await emTheoLop(LOP.a7_1, null));
    expect(thay6).toBeLessThan(caKhoi6);
    expect(thay7).toBeLessThan(caKhoi7);
  });

  it("KHÔNG thấy em nào ở khối mình không có lớp nào", async ({ skip }) => {
    if (!ready) return skip();
    dam(await emTheoKhoi(8, null), "sĩ số khối 8");
    expect(await emTheoKhoi(8, AI.thaySon)).toBe(0);
  });

  it("và GVCN ở khối đó có phép giao RỖNG THẬT với thầy", async ({ skip }) => {
    if (!ready) return skip();
    // Cô Yến chủ nhiệm 8A1 — khối 8, khối Thầy Sơn không dạy. Nếu bộ dữ liệu không có
    // một GVCN như vậy thì "giao rỗng" là chuyện tình cờ, không phải tính chất.
    const soLopThayDay = dam(
      await asSystem((c) =>
        c
          .query<{ n: string }>(
            `select count(*)::text as n from core.class_assignments ca
               join core.teachers t on t.id = ca.teacher_id
               join core.users u on u.id = t.user_id
              where u.auth_uid = $1 and ca.assignment_role = 'subject'`,
            [AI.thaySon],
          )
          .then((r) => Number(r.rows[0]!.n)),
      ),
      "số lớp Thầy Sơn dạy",
    );
    expect(soLopThayDay).toBeGreaterThanOrEqual(2);
    expect(await emTheoLop(LOP.a6_5, AI.coYen)).toBe(0);
    expect(await emTheoLop(LOP.a7_1, AI.coYen)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("3 · tâm lý: cụm cắt theo CƠ SỞ, không theo khối", () => {
  it("thấy ĐỦ cả ba khối trong cơ sở của mình", async ({ skip }) => {
    if (!ready) return skip();
    // "Đủ cụm" phải đo bằng ba con số riêng. Một phép đếm tổng có thể đúng trong khi cô
    // vẫn mất trắng một khối và được bù bằng dữ liệu thừa ở khối khác.
    for (const khoi of [6, 7]) {
      const that = dam(await emTheoKhoi(khoi, null, CO_SO.q7), `sĩ số khối ${khoi} ở Quận 7`);
      expect(await emTheoKhoi(khoi, AI.coMai, CO_SO.q7)).toBe(that);
    }
    const khoi8Q7 = dam(await emTheoKhoi(8, null, CO_SO.q7), "sĩ số khối 8 ở Quận 7");
    expect(await emTheoKhoi(8, AI.coMai, CO_SO.q7)).toBe(khoi8Q7);
  });

  it("KHÔNG thấy lớp CÙNG KHỐI ở cơ sở khác — đây là phép thử phân biệt cụm/khối", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Trên dữ liệu chỉ có một khối, hai giả thuyết "cụm = cơ sở" và "cụm = khối" cho ra
    // CÙNG một đáp số nên không phép đo nào tách được chúng. Cặp 8A1 (Q7) / 8B1 (Q2) là
    // chỗ duy nhất chúng khác nhau: nếu cụm tính theo khối, cô Mai sẽ thấy 8B1.
    dam(await emTheoKhoi(8, null, CO_SO.q2), "sĩ số khối 8 ở Quận 2");
    expect(await emTheoKhoi(8, AI.coMai, CO_SO.q2)).toBe(0);
    expect(await emTheoLop(LOP.a8_2, AI.coMai)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("4 · hiệu trưởng thấy đủ cơ sở mình, và chỉ cơ sở mình", () => {
  it("thấy trọn danh sách cơ sở Quận 7, trải cả ba khối", async ({ skip }) => {
    if (!ready) return skip();
    const thatQ7 = dam(await emTheoCoSo(CO_SO.q7, null), "sĩ số cơ sở Quận 7");
    expect(await emTheoCoSo(CO_SO.q7, AI.hung)).toBe(thatQ7);

    const { rows } = await asUser(AI.hung, (c) =>
      c.query<{ grade: number }>(
        `select distinct c.grade from core.students st
           join core.enrollments e on e.student_id = st.id and e.valid_to is null
           join core.classes c on c.id = e.class_id
          order by c.grade`,
      ),
    );
    // Phạm vi cắt theo cơ sở nên phải phủ đủ khối — nếu chỉ còn khối 6 thì đâu đó có một
    // điều kiện lọc theo khối đã lẻn vào đường đọc của hiệu trưởng.
    expect(rows.map((r) => r.grade)).toEqual(expect.arrayContaining([6, 7, 8]));
  });

  it("KHÔNG thấy một em nào ở cơ sở Quận 2, kể cả em cùng khối 8", async ({ skip }) => {
    if (!ready) return skip();
    dam(await emTheoCoSo(CO_SO.q2, null), "sĩ số cơ sở Quận 2");
    expect(await emTheoCoSo(CO_SO.q2, AI.hung)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("5 · phụ huynh và học sinh: thêm khối không thêm cửa", () => {
  it("phụ huynh chỉ thấy con mình, không thấy một em nào ở khối mới", async ({ skip }) => {
    if (!ready) return skip();
    dam(await emTheoKhoi(7, null), "sĩ số khối 7");
    dam(await emTheoKhoi(8, null), "sĩ số khối 8");

    const ids = await asUser(AI.phuHuynh, (c) =>
      c.query<{ id: string }>("select id from core.students").then((r) => r.rows.map((x) => x.id)),
    );
    expect(ids).toEqual([STUDENT_MINH]);
    expect(await emTheoKhoi(7, AI.phuHuynh)).toBe(0);
    expect(await emTheoKhoi(8, AI.phuHuynh)).toBe(0);
  });

  it("học sinh chỉ thấy chính mình", async ({ skip }) => {
    if (!ready) return skip();
    const ids = await asUser(AI.minh, (c) =>
      c.query<{ id: string }>("select id from core.students").then((r) => r.rows.map((x) => x.id)),
    );
    expect(ids).toEqual([STUDENT_MINH]);
    expect(await emTheoKhoi(7, AI.minh)).toBe(0);
    expect(await emTheoKhoi(8, AI.minh)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("6 · đi hết đường thật: buồng lái tRPC cũng chặn chéo khối", () => {
  // RLS chặn ở tầng dưới cùng; nhưng người dùng không gõ SQL, họ bấm nút. Nếu procedure
  // trả một bảng số liệu RỖNG thay vì từ chối, màn hình sẽ dạy cô đọc im lặng thành
  // "lớp yên ổn" — hỏng theo hướng nguy hiểm hơn cả rò dữ liệu.
  const thu = () => careRouter.createCaller(ctxFor(AI.coThu));
  const lan = () => careRouter.createCaller(ctxFor(AI.coLan));

  it("GVCN 7A1 mở được buồng lái lớp mình, và nó ghi đúng tên lớp", async ({ skip }) => {
    if (!ready) return skip();
    const d = await thu().getDashboard({ classId: LOP.a7_1 });
    expect(d.classId).toBe(LOP.a7_1);
    expect(d.className).toBe("7A1");
    expect(d.totals.totalStudents).toBe(await emTheoLop(LOP.a7_1, null));
  });

  it("hỏi lớp KHỐI KHÁC → FORBIDDEN, không phải bảng rỗng", async ({ skip }) => {
    if (!ready) return skip();
    expect(await codeOfRejection(() => thu().getDashboard({ classId: LOP.a6_1 }))).toBe("FORBIDDEN");
    expect(await codeOfRejection(() => thu().getDashboard({ classId: LOP.a8_1 }))).toBe("FORBIDDEN");
    expect(await codeOfRejection(() => lan().getDashboard({ classId: LOP.a7_1 }))).toBe("FORBIDDEN");
  });

  it("getMyClasses của mỗi cô chỉ liệt kê lớp của chính cô", async ({ skip }) => {
    if (!ready) return skip();
    const { classes } = await thu().getMyClasses();
    expect(classes.map((c) => c.classCode)).toEqual(["7A1"]);
    // Sĩ số trên thẻ lớp là của lớp đó, không phải tổng khối — một buồng lái ghi "7A1"
    // mà đếm cả khối vẫn trông như một con số hợp lý, và đó là kiểu sai khó thấy nhất.
    expect(classes[0]!.studentCount).toBe(await emTheoLop(LOP.a7_1, null));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("7 · bộ seed khối mới giữ được khoá định danh (§9)", () => {
  it("không có mã học sinh trùng và mỗi em đúng một kỳ đang mở", async ({ skip }) => {
    if (!ready) return skip();
    // seed.mjs là một mutation chạy đi chạy lại trên cùng một CSDL. Nếu khoá idempotent
    // của nó hỏng, triệu chứng KHÔNG phải là lỗi lúc chạy mà là dữ liệu đôi lặng lẽ —
    // và mọi phép đếm ở trên vẫn "khớp" vì cả hai vế cùng phình. Hai câu dưới đây là chỗ
    // nó lộ ra.
    const { rows } = await asSystem((c) =>
      c.query<{ ma_trung: string; ky_doi: string }>(
        `select (select count(*)::text from (
                   select student_code from core.students
                    group by student_code having count(*) > 1) x) as ma_trung,
                (select count(*)::text from (
                   select student_id from core.enrollments where valid_to is null
                    group by student_id having count(*) > 1) y) as ky_doi`,
      ),
    );
    expect(Number(rows[0]!.ma_trung)).toBe(0);
    expect(Number(rows[0]!.ky_doi)).toBe(0);
  });

  it("mọi mã học sinh của khối mới đúng khuôn VA-####-#####", async ({ skip }) => {
    if (!ready) return skip();
    // core.students.student_code có CHECK `^VA-\d{4}-\d{5}$`. CHECK đã chặn ở tầng CSDL,
    // nhưng bài này hỏi thêm một điều CHECK không biết: khối mới có thật sự sinh ra em
    // nào không. Đếm 0 mà vẫn "đúng khuôn" là câu trả lời vô nghĩa.
    const { rows } = await asSystem((c) =>
      c.query<{ n: string; dung: string }>(
        `select count(*)::text as n,
                count(*) filter (where st.student_code ~ '^VA-[0-9]{4}-[0-9]{5}$')::text as dung
           from core.students st
           join core.enrollments e on e.student_id = st.id and e.valid_to is null
           join core.classes c on c.id = e.class_id
          where c.grade in (7, 8)`,
      ),
    );
    const n = dam(Number(rows[0]!.n), "số em khối 7 và khối 8");
    expect(Number(rows[0]!.dung)).toBe(n);
  });
});
