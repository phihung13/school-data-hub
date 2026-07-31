// tests/db/bgh-tong-hop.test.ts
//
// Màn hình Điều hành (BGH) — gói "man-hinh-bgh". Chạy qua đúng đường trình duyệt đi
// (tRPC caller → withUserContext → RLS thật + hàm SECURITY DEFINER thật của 0040).
//
// Câu hỏi mà file này trả lời, xếp theo mức nguy hiểm nếu sai:
//
//   1. RÒ DỮ LIỆU CÁ NHÂN — DESIGN-GUIDELINES §9 nói BGH chỉ được xem số tổng hợp
//      theo lô. Nên bài kiểm mạnh nhất không phải "trường nào có mặt trong output"
//      mà là: SERIALIZE toàn bộ output rồi khẳng định trong đó KHÔNG có tên em nào,
//      mã học sinh nào, uuid học sinh nào. Kiểm theo danh sách trường thì lần thêm
//      cột sau sẽ lọt; kiểm theo nội dung thì không.
//   2. PHÂN QUYỀN — GVCN/học sinh/phụ huynh gọi vào phải nhận FORBIDDEN, và
//      hiệu trưởng cơ sở này không thấy số của cơ sở khác.
//   3. IM LẶNG KHÔNG PHẢI KẾT LUẬN — em chưa check-in ra `noRecordCount`, KHÔNG bị
//      cộng vào `absentCount`; lớp dưới ngưỡng ẩn danh trả `null`, KHÔNG trả `0`.
//   4. TỔNG KHỐI KHÔNG ĐƯỢC MẤT PHẦN CỦA LỚP BỊ CHE — che là việc của chỗ hiển thị.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, requireDb, DEV, FIXTURE } from "../helpers/db";
import { reportRouter } from "@/server/routers/report";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Dữ liệu riêng của bài này — không mượn lớp seed để khỏi giẫm lên bài khác. */
const SCHOOL_OTHER = "20000000-0000-0000-0000-0000000000c9"; // cơ sở thứ hai (ngoài tầm hiệu trưởng Q7)
const CLASS_BIG = "30000000-0000-0000-0000-0000000000c1"; // Q7, khối 9, 12 em → trên ngưỡng
const CLASS_TINY = "30000000-0000-0000-0000-0000000000c2"; // Q7, khối 9, 2 em  → dưới ngưỡng
const CLASS_OTHER = "30000000-0000-0000-0000-0000000000c3"; // cơ sở khác, khối 9
const BOARD_USER = "40000000-0000-0000-0000-0000000000c0";
const BOARD_AUTH = "90000000-0000-0000-0000-0000000000c0";

const bigStudent = (i: number) => `73000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`;
const tinyStudent = (i: number) => `74000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`;
const otherStudent = (i: number) => `75000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`;

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const principal = () => reportRouter.createCaller(ctxFor(DEV.admin)); // Hùng — principal Q7
const board = () => reportRouter.createCaller(ctxFor(BOARD_AUTH));
const gvcn = () => reportRouter.createCaller(ctxFor(DEV.gvcn));
const student = () => reportRouter.createCaller(ctxFor(DEV.student));
const guardian = () => reportRouter.createCaller(ctxFor(DEV.guardian));

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
 * Số hồ sơ chăm sóc ĐANG MỞ của một lớp, đọc thẳng từ CSDL.
 *
 * Vì sao không viết thẳng hằng số 1 vào assertion: `care.run_flag_engine` (0039) chạy
 * trên cùng CSDL dev có thể mở thêm hồ sơ cho chính các em của bài này — 12 em mới
 * ghi danh, mỗi em một dòng điểm danh trong 30 ngày, nên luật A_ATTENDANCE bắt đúng
 * các em đó. Assertion đúng ở đây không phải "bằng 1" mà là "khớp với sự thật trong
 * bảng": đó mới là điều hàm tổng hợp phải bảo đảm.
 */
async function openCasesInClass(classId: string): Promise<number> {
  const { rows } = await asSystem((c) =>
    c.query<{ n: string }>(
      `select count(*)::text as n
         from care.care_cases cc
         join core.enrollments e on e.student_id = cc.student_id and e.valid_to is null
        where e.class_id = $1 and cc.status = 'open'`,
      [classId],
    ),
  );
  return Number(rows[0]!.n);
}

async function cleanup(): Promise<void> {
  await asSystem(async (c) => {
    const ids = [
      ...Array.from({ length: 12 }, (_, i) => bigStudent(i + 1)),
      ...Array.from({ length: 2 }, (_, i) => tinyStudent(i + 1)),
      ...Array.from({ length: 12 }, (_, i) => otherStudent(i + 1)),
    ];
    // checkins / enrollments / care_cases đều ON DELETE CASCADE theo học sinh.
    await c.query("delete from core.students where id = any($1::uuid[])", [ids]);
    await c.query("delete from core.classes where id = any($1::uuid[])", [
      [CLASS_BIG, CLASS_TINY, CLASS_OTHER],
    ]);
    await c.query("delete from core.user_role_scopes where user_id = $1", [BOARD_USER]);
    await c.query("delete from core.schools where id = $1", [SCHOOL_OTHER]);
    // KHÔNG xoá dòng core.users: 0033 chặn xoá cứng người dùng và đường chính thức là
    // ẩn danh hoá. Bật cửa thoát hiểm `hub.allow_user_hard_delete` chỉ để dọn rác test
    // là tập cho mình thói quen dùng phanh tay của người vận hành. Tài khoản để lại
    // KHÔNG còn dòng phân quyền nào nên nó vô hại: đăng nhập vào cũng không thấy gì.
  });
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;
  await cleanup();

  await asSystem(async (c) => {
    const { rows } = await c.query<{ network_id: string }>(
      "select network_id from core.schools where id = $1",
      [FIXTURE.schoolQ7],
    );
    const networkId = rows[0]!.network_id;

    await c.query(
      "insert into core.schools (id, network_id, code, name) values ($1,$2,'VA-T40','Cơ sở thử nghiệm (bgh-tong-hop.test)')",
      [SCHOOL_OTHER, networkId],
    );
    await c.query(
      `insert into core.classes (id, school_id, code, academic_year, grade) values
         ($1,$2,'9T1','2026-2027',9),
         ($3,$2,'9T2','2026-2027',9),
         ($4,$5,'9X1','2026-2027',9)`,
      [CLASS_BIG, FIXTURE.schoolQ7, CLASS_TINY, CLASS_OTHER, SCHOOL_OTHER],
    );

    // Lớp lớn: 12 em. 8 em check-in (có mood), 1 em vắng, 3 em KHÔNG có dòng nào.
    for (let i = 1; i <= 12; i += 1) {
      await c.query(
        `insert into core.students (id, student_code, school_id, full_name)
         values ($1, $2, $3, $4)`,
        [bigStudent(i), `VA-2026-7${String(i).padStart(4, "0")}`, FIXTURE.schoolQ7, `Em Chín T1 số ${i}`],
      );
      await c.query(
        "insert into core.enrollments (student_id, class_id, valid_from) values ($1,$2,current_date - 30)",
        [bigStudent(i), CLASS_BIG],
      );
    }
    for (let i = 1; i <= 8; i += 1) {
      await c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, mood)
         values ($1, current_date, 'in', 'present', $2)`,
        [bigStudent(i), i <= 5 ? 4 : 3],
      );
    }
    await c.query(
      `insert into attendance.checkins (student_id, occurred_on, kind, status, mood)
       values ($1, current_date, 'in', 'absent', null)`,
      [bigStudent(9)],
    );
    await c.query(
      "insert into care.care_cases (student_id, owner_id, tier, status) values ($1,$2,2,'open')",
      [bigStudent(1), "40000000-0000-0000-0000-000000000001"],
    );

    // Lớp tí hon: 2 em, cả hai đều check-in — số thật có tồn tại, nhưng không được hiện.
    for (let i = 1; i <= 2; i += 1) {
      await c.query(
        `insert into core.students (id, student_code, school_id, full_name)
         values ($1, $2, $3, $4)`,
        [tinyStudent(i), `VA-2026-8${String(i).padStart(4, "0")}`, FIXTURE.schoolQ7, `Em Chín T2 số ${i}`],
      );
      await c.query(
        "insert into core.enrollments (student_id, class_id, valid_from) values ($1,$2,current_date - 30)",
        [tinyStudent(i), CLASS_TINY],
      );
      await c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, mood)
         values ($1, current_date, 'in', 'present', 4)`,
        [tinyStudent(i)],
      );
    }

    // Cơ sở khác: 12 em, để phạm vi của hiệu trưởng có chiều TỪ CHỐI thật.
    for (let i = 1; i <= 12; i += 1) {
      await c.query(
        `insert into core.students (id, student_code, school_id, full_name)
         values ($1, $2, $3, $4)`,
        [otherStudent(i), `VA-2026-9${String(i).padStart(4, "0")}`, SCHOOL_OTHER, `Em Cơ Sở Khác số ${i}`],
      );
      await c.query(
        "insert into core.enrollments (student_id, class_id, valid_from) values ($1,$2,current_date - 30)",
        [otherStudent(i), CLASS_OTHER],
      );
    }

    // Vai `board` (toàn hệ) chưa có trong seed — dựng riêng cho bài này.
    // `do update` chứ không `do nothing`: cleanup cố ý để lại dòng users (xem `cleanup`),
    // nên lần chạy thứ hai phải nhận lại đúng tài khoản đó ở trạng thái active.
    await c.query(
      `insert into core.users (id, auth_uid, email, full_name, status)
       values ($1,$2,'hoidong.test@va.edu.vn','Cô Thu (ban điều hành)','active')
       on conflict (id) do update
          set auth_uid = excluded.auth_uid, email = excluded.email,
              full_name = excluded.full_name, status = 'active'`,
      [BOARD_USER, BOARD_AUTH],
    );
    await c.query(
      "insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values ($1,'board',null,null)",
      [BOARD_USER],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  await cleanup();
});

// ───────────────────────────────────────────────────────────────────────────
describe("§9 · không tra cứu học sinh cá nhân", () => {
  it("output KHÔNG chứa tên, mã, hay id của bất kỳ học sinh nào", async ({ skip }) => {
    if (!ready) return skip();
    const overview = await principal().getOperationsOverview();
    const serialized = JSON.stringify(overview);

    // Đối chiếu với DANH SÁCH THẬT trong CSDL, không với vài giá trị viết tay: cách này
    // vẫn bắt được lỗi ở lần thêm cột sau, khi không ai nhớ tới bài test này nữa.
    const { rows } = await asSystem((c) =>
      c.query<{ id: string; full_name: string; student_code: string }>(
        "select id::text, full_name, student_code from core.students",
      ),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(serialized).not.toContain(r.id);
      expect(serialized).not.toContain(r.full_name);
      expect(serialized).not.toContain(r.student_code);
    }
  });

  it("output KHÔNG chứa tên hay id giáo viên — không dựng sẵn bảng xếp hạng GVCN bằng cảm xúc trẻ con (§5)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const serialized = JSON.stringify(await principal().getOperationsOverview());
    const { rows } = await asSystem((c) =>
      c.query<{ id: string; full_name: string }>(
        `select u.id::text, u.full_name from core.users u join core.teachers t on t.user_id = u.id`,
      ),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(serialized).not.toContain(r.id);
      expect(serialized).not.toContain(r.full_name);
    }
  });
});

describe("phân quyền", () => {
  it("GVCN, học sinh và phụ huynh đều nhận FORBIDDEN — không ai nhận bảng rỗng", async ({ skip }) => {
    if (!ready) return skip();
    // Bảng rỗng nguy hiểm hơn lỗi: nó đọc thành "hôm nay cả khối không có gì".
    expect(await codeOfRejection(() => gvcn().getOperationsOverview())).toBe("FORBIDDEN");
    expect(await codeOfRejection(() => student().getOperationsOverview())).toBe("FORBIDDEN");
    expect(await codeOfRejection(() => guardian().getOperationsOverview())).toBe("FORBIDDEN");
  });

  it("hiệu trưởng cơ sở KHÔNG thấy lớp của cơ sở khác; ban điều hành thì thấy cả hai", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const p = await principal().getOperationsOverview();
    const b = await board().getOperationsOverview();

    const pCodes = p.classes.map((c) => c.classCode);
    expect(pCodes).toContain("9T1");
    expect(pCodes).toContain("9T2");
    expect(pCodes).not.toContain("9X1"); // cơ sở khác

    const bCodes = b.classes.map((c) => c.classCode);
    expect(bCodes).toContain("9T1");
    expect(bCodes).toContain("9X1");
  });

  it("ngày trong tương lai và ngày quá xa đều bị chặn ở biên, không để SQL ném hộ", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect(await codeOfRejection(() => principal().getOperationsOverview({ onDate: iso(future) }))).toBe(
      "BAD_REQUEST",
    );
    const old = new Date();
    old.setDate(old.getDate() - 400);
    expect(await codeOfRejection(() => principal().getOperationsOverview({ onDate: iso(old) }))).toBe(
      "BAD_REQUEST",
    );
  });
});

describe("im lặng không phải kết luận", () => {
  it("em chưa check-in ra noRecordCount, KHÔNG bị cộng vào absentCount", async ({ skip }) => {
    if (!ready) return skip();
    const { classes } = await principal().getOperationsOverview();
    const big = classes.find((c) => c.classCode === "9T1")!;
    expect(big.rosterCount).toBe(12);
    expect(big.checkedInCount).toBe(8);
    expect(big.absentCount).toBe(1); // đúng MỘT em được người lớn ghi là vắng
    expect(big.noRecordCount).toBe(3); // ba em còn lại: chưa ai biết gì, và nói đúng như vậy
    expect(big.openCareCount).toBe(await openCasesInClass(CLASS_BIG));
  });

  it("lớp dưới ngưỡng ẩn danh trả null, KHÔNG trả 0 — 0 là một lời khẳng định", async ({ skip }) => {
    if (!ready) return skip();
    const overview = await principal().getOperationsOverview();
    expect(overview.minCohort).toBe(10);

    const tiny = overview.classes.find((c) => c.classCode === "9T2")!;
    expect(tiny.cohortTooSmall).toBe(true);
    expect(tiny.rosterCount).toBe(2); // sĩ số vẫn hiện — nó giải thích vì sao phần còn lại bị che
    expect(tiny.checkedInCount).toBeNull();
    expect(tiny.moodHappy).toBeNull();
    expect(tiny.openCareCount).toBeNull();
  });

  it("phân bố tâm trạng còn cần đủ ngưỡng trên SỐ EM ĐÃ GHI, không chỉ trên sĩ số", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // 9T1 có 12 em (qua ngưỡng sĩ số) nhưng mới 8 em ghi tâm trạng (dưới ngưỡng 10):
    // "5 vui / 3 bình thường" ở đây là chuyện của 8 người cụ thể, không phải của một lớp.
    const big = (await principal().getOperationsOverview()).classes.find((c) => c.classCode === "9T1")!;
    expect(big.moodReported).toBe(8);
    expect(big.moodHappy).toBeNull();
    expect(big.moodNormal).toBeNull();
  });
});

describe("tổng khối", () => {
  it("cộng đủ phần của lớp bị che — che ở chỗ hiển thị, không phải bằng cách đánh mất dữ liệu", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const { grades, classes } = await principal().getOperationsOverview();
    const g9 = grades.find((g) => g.grade === 9)!;

    expect(g9.classCount).toBe(2); // 9T1 + 9T2
    expect(g9.rosterCount).toBe(14); // 12 + 2 — KHÔNG rơi mất 2 em của lớp bị che
    expect(g9.checkedInCount).toBe(10); // 8 + 2
    expect(g9.moodReported).toBe(10); // 8 + 2 → vừa đủ ngưỡng, nên phân bố hiện ra ở mức KHỐI
    expect(g9.moodHappy).toBe(7); // 5 + 2
    // Tổng khối = tổng hai lớp, đọc thẳng từ bảng (xem `openCasesInClass`).
    expect(g9.openCareCount).toBe(
      (await openCasesInClass(CLASS_BIG)) + (await openCasesInClass(CLASS_TINY)),
    );

    // Bất biến: sĩ số khối = tổng sĩ số các lớp trong khối (cột duy nhất không bị che).
    const rosterFromClasses = classes
      .filter((c) => c.grade === 9)
      .reduce((sum, c) => sum + c.rosterCount, 0);
    expect(g9.rosterCount).toBe(rosterFromClasses);
  });

  it("dấu thời gian đến từ máy chủ, không từ máy người xem", async ({ skip }) => {
    if (!ready) return skip();
    const { asOf, onDate } = await principal().getOperationsOverview();
    expect(Number.isNaN(Date.parse(asOf))).toBe(false);
    expect(onDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
