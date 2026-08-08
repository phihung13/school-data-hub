// tests/db/gv-bo-mon.test.ts — phần máy chủ của màn "Lớp tôi dạy" (vai `teacher`).
//
// Chạy trên Postgres thật với RLS thật, qua đúng đường trình duyệt đi (tRPC caller →
// withUserContext → `set local role authenticated` + `core.begin_user_context`).
//
// Ba nhóm câu hỏi, không nhóm nào bỏ được:
//
//   1. PHẠM VI — Thầy Nam (bộ môn Toán) thấy ĐÚNG ba lớp mình dạy, không hơn. Gọi với
//      `classId` của lớp KHÔNG dạy phải bị chặn ở tầng API, không phải trả về danh sách
//      rỗng: rỗng vì không có gì và rỗng vì không được phép là hai chuyện khác nhau.
//   2. THỨ KHÔNG ĐƯỢC LỌT — tâm trạng, cờ chăm sóc, lời "cần gặp thầy cô". Khẳng định
//      bằng HÌNH DẠNG object trả về thật, không bằng kiểu TypeScript (kiểu biến mất lúc
//      chạy). Nối lại một trong ba thứ đó là bài này đỏ.
//   3. SỰ THẬT — em chưa ai điểm danh ra `status = null` và được đếm vào `noRecordCount`,
//      KHÔNG phải `absentCount`. QĐ-3: chưa điểm danh ≠ vắng.
//
// ── THỬ NGƯỢC, ĐÃ CHẠY THẬT 06/08/2026 (hai lượt, và lượt đầu KHÔNG đỏ) ─────
//
// LƯỢT 1 — gỡ `and core.teaches(e.student_id)` khỏi `readMyTeachingClasses`
// (`apps/hub/server/routers/teaching.ts`), chạy lại file này:
//
//     Tests  16 passed (16)      ← XANH. Bài test không hề canh cái nó tưởng mình canh.
//
// Lý do, và nó đáng ghi lại hơn cả kết quả: RLS trên `core.enrollments` gác bằng
// `core.can_see_student`, hàm đó là HỢP của sáu nhánh, và với một tài khoản CHỈ mang vai
// `teacher` thì nhánh `teaches` là nhánh duy nhất mở — nên hai đường (RLS và vế
// `core.teaches`) cho cùng một đáp số. Mọi tài khoản trong seed qua được cổng vai đều
// thuộc dạng đó. Bộ test không có mẫu số để phân biệt hai tầng.
//
// LƯỢT 2 — thêm ca "vừa dạy môn vừa là tâm lý cụm" (cấp tạm vai `counselor` cho chính
// Thầy Nam trong bài, dọn ở `finally`), rồi gỡ lại vế đó:
//
//     × người vừa DẠY MÔN vừa là TÂM LÝ CỤM chỉ thấy lớp mình dạy, không thấy cả cụm
//       → expected [ '6A1','6A2','6A3','6A4', …(4) ] to deeply equal [ '6A1','6A2','6A3' ]
//     Tests  1 failed | 16 passed (17)
//
// Bảy lớp thay vì ba: nhánh `in_my_cluster` mở toàn bộ học sinh cơ sở Quận 7. Cắm vế đó
// lại → 17/17 xanh.
//
// THỬ NGƯỢC THỨ HAI, hàng rào tầng API — thay `requireMyTeachingClass(myClasses,
// input.classId)` bằng `input.classId ?? myClasses[0]!.classId`:
//
//     × gọi getRoster với classId của lớp KHÔNG dạy → FORBIDDEN
//     × chặn theo cả hai chiều: Cô Diệp không mở được 6A1/6A2
//     × người vừa DẠY MÔN vừa là TÂM LÝ CỤM … (vế FORBIDDEN)
//     Tests  3 failed | 14 passed (17)
//
// Ba bài đỏ — và chúng đỏ vì máy chủ trả về một DANH SÁCH RỖNG thay vì một lời từ chối.
// Rỗng vì không có gì và rỗng vì không được phép là hai chuyện khác nhau; trình bày cái
// sau thành cái trước là dạy người dùng tin vào một câu trả lời sai.
//
// Ghi cả lượt 1 ra đây, kể cả khi nó làm bộ test này trông kém đi: một bài test chưa từng
// đỏ là một bài test chưa ai biết nó đo cái gì.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, requireDb, DEV, FIXTURE } from "../helpers/db";
import { teachingRouter } from "@/server/routers/teaching";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/**
 * Học sinh riêng của bài này, lớp 6A1, CHƯA có dòng điểm danh nào.
 *
 * Vì sao phải tự dựng thay vì mượn một em của seed: hai bài dưới đây hỏi về ô TRỐNG
 * ("chưa ai ghi"), mà seed có ghi check-in cho một số em và số đó đổi theo từng đợt sửa
 * seed. Bản đầu của file này dựa vào "6A1 hôm nay chưa ai điểm danh" — đúng trên hub_dev,
 * SAI trên hub_test (12/12 em đã có dòng), nên hai bài đỏ vì một lý do KHÁC với thứ chúng
 * định kiểm. Đỏ kiểu đó là loại đỏ dạy người ta xoá assertion.
 */
const TEST_STUDENT = "71000000-0000-0000-0000-0000000000cc";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const nam = () => teachingRouter.createCaller(ctxFor(DEV.gvbomon)); // Thầy Nam — Toán 6A1/6A2/6A3
const diep = () => teachingRouter.createCaller(ctxFor(DEV.gvbomon2)); // Cô Diệp — Văn 6A3/6A4/6A5
const gvcn = () => teachingRouter.createCaller(ctxFor(DEV.gvcn)); // Cô Lan — GVCN 6A1
const student = () => teachingRouter.createCaller(ctxFor(DEV.student));
const counselor = () => teachingRouter.createCaller(ctxFor(DEV.counselor));
const guardian = () => teachingRouter.createCaller(ctxFor(DEV.guardian));

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

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99003', $2, 'Em Thử Nghiệm (gv-bo-mon.test)')`,
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
  // checkins CASCADE theo học sinh.
  await asSystem((c) => c.query("delete from core.students where id = $1", [TEST_STUDENT]));
});

// ───────────────────────────────────────────────────────────────────────────
describe("phạm vi · lớp tôi dạy", () => {
  it("Thầy Nam thấy ĐÚNG ba lớp mình dạy, không thấy 6A4/6A5", async ({ skip }) => {
    if (!ready) return skip();
    const { classes } = await nam().getMyClasses();
    expect(classes.map((c) => c.classCode)).toEqual(["6A1", "6A2", "6A3"]);
  });

  it("và cặp đối xứng cũng đúng — Cô Diệp thấy 6A3/6A4/6A5, KHÔNG thấy 6A1/6A2", async ({ skip }) => {
    if (!ready) return skip();
    // Cặp đối xứng là thứ chặn kiểu "xanh vì ai cũng thấy ba lớp đầu bảng". Hai giáo viên
    // bộ môn có hai tập lớp KHÁC NHAU và chồng nhau đúng một lớp (6A3).
    const { classes } = await diep().getMyClasses();
    expect(classes.map((c) => c.classCode)).toEqual(["6A3", "6A4", "6A5"]);
  });

  it("sĩ số là sĩ số thật của lớp, không phải một con số 0 vì mẫu số rỗng", async ({ skip }) => {
    if (!ready) return skip();
    const { classes } = await nam().getMyClasses();
    for (const c of classes) expect(c.studentCount, `lớp ${c.classCode}`).toBeGreaterThanOrEqual(10);
    const tong = classes.reduce((n, c) => n + c.studentCount, 0);
    // Đối chiếu với chính RLS trên core.students dưới phiên của thầy: hai đường đếm khác
    // nhau mà ra cùng một số thì con số đó không phải do câu SQL tự bịa.
    const { rows } = await asSystem((c) =>
      c.query<{ n: string }>(
        `select count(*)::text as n
           from core.enrollments e
          where e.valid_to is null and e.class_id = any($1::uuid[])`,
        [[FIXTURE.classA, FIXTURE.classB, FIXTURE.classC]],
      ),
    );
    expect(tong).toBe(Number(rows[0]!.n));
  });

  it("gọi getRoster với classId của lớp KHÔNG dạy → FORBIDDEN", async ({ skip }) => {
    if (!ready) return skip();
    for (const lop of [FIXTURE.classD, FIXTURE.classE]) {
      expect(await codeOfRejection(() => nam().getRoster({ classId: lop })), lop).toBe("FORBIDDEN");
    }
  });

  it("chặn theo cả hai chiều: Cô Diệp không mở được 6A1/6A2", async ({ skip }) => {
    if (!ready) return skip();
    for (const lop of [FIXTURE.classA, FIXTURE.classB]) {
      expect(await codeOfRejection(() => diep().getRoster({ classId: lop })), lop).toBe("FORBIDDEN");
    }
  });

  it("không truyền classId → lớp ĐẦU theo mã lớp, cùng thứ tự bộ chọn trên màn", async ({ skip }) => {
    if (!ready) return skip();
    const roster = await nam().getRoster({});
    expect(roster.className).toBe("6A1");
    expect(roster.classId).toBe(FIXTURE.classA);
  });

  it("người vừa DẠY MÔN vừa là TÂM LÝ CỤM chỉ thấy lớp mình dạy, không thấy cả cụm", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // ── ĐÂY LÀ CA LÀM CHO VẾ `core.teaches` TRONG CÂU SQL CÓ SỨC NẶNG ──────────
    //
    // RLS trên `core.enrollments` gác bằng `core.can_see_student`, mà hàm đó là HỢP của
    // sáu nhánh — `teaches` chỉ là một. Với một tài khoản chỉ mang vai `teacher` thì hai
    // đường (RLS và vế `core.teaches`) cho CÙNG một đáp số, nên bỏ vế đó đi cũng không ai
    // thấy. Đo thật 06/08/2026: gỡ `and core.teaches(e.student_id)` khỏi
    // `readMyTeachingClasses` rồi chạy lại cả file này → 16/16 VẪN XANH.
    //
    // Ca dưới đây là ca phân biệt được chúng: cấp thêm vai `counselor` (cụm Quận 7) cho
    // chính Thầy Nam. Nhánh `in_my_cluster` mở ra MỌI học sinh của cơ sở, nên nếu danh
    // sách "Lớp tôi dạy" chỉ dựa vào RLS thì nó lặng lẽ mọc thêm 6A4 và 6A5 — hai lớp
    // thầy không dạy. Không lỗi, không log, chỉ là hai cái tên lớp không đúng chỗ.
    //
    // Người vừa dạy môn vừa kiêm tâm lý cụm là chuyện có thật ở trường liên cấp, nên đây
    // không phải một ca dựng ra cho vui.
    const USER_NAM = "40000000-0000-0000-0000-000000000002"; // core.users.id của Thầy Nam
    await asSystem((c) =>
      c.query(
        `insert into core.user_role_scopes (user_id, role_code, school_id, class_id)
         values ($1, 'counselor', $2, null) on conflict do nothing`,
        [USER_NAM, FIXTURE.schoolQ7],
      ),
    );
    try {
      const { classes } = await nam().getMyClasses();
      expect(classes.map((c) => c.classCode)).toEqual(["6A1", "6A2", "6A3"]);
      // Và lớp ngoài tầm dạy vẫn bị chặn, dù RLS nay cho thầy ĐỌC được học sinh ở đó.
      expect(await codeOfRejection(() => nam().getRoster({ classId: FIXTURE.classD }))).toBe("FORBIDDEN");
    } finally {
      await asSystem((c) =>
        c.query("delete from core.user_role_scopes where user_id = $1 and role_code = 'counselor'", [
          USER_NAM,
        ]),
      );
    }
  });

  it("GVCN cũng vào được — core.class_assignments ghi cả hai vai trò phân công", async ({ skip }) => {
    if (!ready) return skip();
    // Cô Lan chủ nhiệm 6A1 và không có dòng `subject` nào, nên `core.teaches` vẫn công
    // nhận đúng một lớp. Nếu procedure này chỉ nhận vai `teacher` thì một cô vừa chủ
    // nhiệm vừa dạy môn ở lớp khác sẽ không có đường nào tới những lớp kia.
    const { classes } = await gvcn().getMyClasses();
    expect(classes.map((c) => c.classCode)).toEqual(["6A1"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("vai KHÔNG dạy lớp nào thì không mở được màn này", () => {
  it("học sinh, phụ huynh, tâm lý cụm đều bị chặn ở cả hai thủ tục", async ({ skip }) => {
    if (!ready) return skip();
    for (const [ten, caller] of [
      ["học sinh", student],
      ["phụ huynh", guardian],
      ["tâm lý cụm", counselor],
    ] as const) {
      expect(await codeOfRejection(() => caller().getMyClasses()), ten).toBe("FORBIDDEN");
      expect(await codeOfRejection(() => caller().getRoster({})), ten).toBe("FORBIDDEN");
      // Và cả khi tự chỉ đích danh một lớp có thật — hàng rào không phải là "thiếu tham số".
      expect(
        await codeOfRejection(() => caller().getRoster({ classId: FIXTURE.classA })),
        `${ten} + classId`,
      ).toBe("FORBIDDEN");
    }
  });

  it("chưa đăng nhập → UNAUTHORIZED, không phải danh sách rỗng", async ({ skip }) => {
    if (!ready) return skip();
    const khach = teachingRouter.createCaller(ctxFor(null));
    expect(await codeOfRejection(() => khach.getMyClasses())).toBe("UNAUTHORIZED");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("ba vùng bị chặn KHÔNG lọt qua thủ tục mới", () => {
  it("output của getRoster mang ĐÚNG bốn trường, không trường nào chạm cảm xúc/chăm sóc", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const roster = await nam().getRoster({});
    expect(roster.students.length).toBeGreaterThan(0);

    for (const em of roster.students) {
      expect(Object.keys(em).sort()).toEqual(["fullName", "status", "studentCode", "studentId"]);
    }

    // Khẳng định lại bằng CHUỖI JSON của cả phản hồi: một trường lồng ở tầng sâu hơn sẽ
    // không lộ ra ở `Object.keys` của từng em, nhưng nó nằm trong chuỗi này.
    const json = JSON.stringify(roster).toLowerCase();
    for (const cam of ["mood", "flag", "care", "help", "urgent", "counselor", "tâm trạng"]) {
      expect(json.includes(cam), `phản hồi getRoster có chứa "${cam}"`).toBe(false);
    }
  });

  it("getMyClasses cũng vậy — sáu trường, toàn số đếm điểm danh", async ({ skip }) => {
    if (!ready) return skip();
    const { classes } = await nam().getMyClasses();
    for (const c of classes) {
      expect(Object.keys(c).sort()).toEqual([
        "absentCount",
        "classCode",
        "classId",
        "noRecordCount",
        "recordedCount",
        "studentCount",
      ]);
    }
    const json = JSON.stringify(classes).toLowerCase();
    for (const cam of ["mood", "flag", "care", "help"]) {
      expect(json.includes(cam), `phản hồi getMyClasses có chứa "${cam}"`).toBe(false);
    }
  });

  it("TẦNG DB · thầy vẫn KHÔNG đọc được cột mood, cờ, hay lời cần gặp", async ({ skip }) => {
    if (!ready) return skip();
    // Hàng rào ở tầng dữ liệu, độc lập với router. Nếu ngày nào đó ai đó nới ba thứ này
    // cho vai `teacher` thì bài này đỏ TRƯỚC khi có màn nào kịp hiển thị chúng.
    const { withUserContext } = await import("@hub/core/db");

    const moodErr = await withUserContext(DEV.gvbomon, async (c) => {
      try {
        await c.query("select mood from attendance.checkins limit 1");
        return "KHÔNG NÉM LỖI";
      } catch (err) {
        return (err as { code?: string }).code ?? "LỖI KHÁC";
      }
    });
    expect(moodErr, "giáo viên bộ môn đọc được cột mood").toBe("42501");

    const dem = await withUserContext(DEV.gvbomon, async (c) => {
      const co = await c.query("select 1 from care.flags limit 1");
      const hr = await c.query("select 1 from attendance.help_requests limit 1");
      return { co: co.rowCount ?? 0, hr: hr.rowCount ?? 0 };
    });
    expect(dem).toEqual({ co: 0, hr: 0 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("sự thật · im lặng không được trình bày thành kết luận (QĐ-3)", () => {
  it("em chưa ai điểm danh ra status = null, KHÔNG phải 'absent'", async ({ skip }) => {
    if (!ready) return skip();
    const day = await today();
    const roster = await nam().getRoster({ classId: FIXTURE.classA, onDate: day });

    // Em thử nghiệm có mặt trong danh sách lớp DÙ chưa bấm gì — đây là ca dễ sai nhất:
    // lấy bảng check-in làm gốc thì em biến mất khỏi chính danh sách lớp của mình.
    const em = roster.students.find((s) => s.studentId === TEST_STUDENT);
    expect(em, "em chưa check-in đã rơi khỏi danh sách lớp").toBeDefined();
    // Và điền sẵn 'absent' là máy tự kết luận thay con người (RULES Rev F điều 8).
    expect(em!.status).toBeNull();
  });

  it("'vắng' và 'chưa điểm danh' là HAI con số riêng, và cộng đúng vào sĩ số", async ({ skip }) => {
    if (!ready) return skip();
    const { classes } = await nam().getMyClasses();
    for (const c of classes) {
      expect(c.recordedCount + c.noRecordCount, `lớp ${c.classCode}`).toBe(c.studentCount);
      expect(c.absentCount, `lớp ${c.classCode}: vắng không thể nhiều hơn số đã ghi`).toBeLessThanOrEqual(
        c.recordedCount,
      );
    }
  });

  it("ghi 'vắng' cho một em thì ĐÚNG một con số đổi, không phải cả hai", async ({ skip }) => {
    if (!ready) return skip();
    const day = await today();
    const truoc = (await nam().getMyClasses()).classes.find((c) => c.classId === FIXTURE.classA)!;

    // Dựng bằng vai chủ schema, KHÔNG qua đường ghi của người dùng: gói này không mở
    // quyền ghi nào cho giáo viên bộ môn, và mượn đường ghi của GVCN ở đây sẽ làm bài
    // test phụ thuộc vào một thủ tục khác.
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source)
         values ($1, $2::date, 'in', 'absent', 'teacher')
         on conflict (student_id, occurred_on, kind)
         do update set status = 'absent'`,
        [TEST_STUDENT, day],
      ),
    );

    try {
      const sau = (await nam().getMyClasses()).classes.find((c) => c.classId === FIXTURE.classA)!;
      expect(sau.absentCount).toBe(truoc.absentCount + 1);
      expect(sau.recordedCount).toBe(truoc.recordedCount + 1);
      expect(sau.noRecordCount).toBe(truoc.noRecordCount - 1);
      expect(sau.studentCount).toBe(truoc.studentCount);

      const roster = await nam().getRoster({ classId: FIXTURE.classA, onDate: day });
      expect(roster.students.find((s) => s.studentId === TEST_STUDENT)?.status).toBe("absent");
    } finally {
      await asSystem((c) =>
        c.query("delete from attendance.checkins where student_id = $1 and occurred_on = $2::date", [
          TEST_STUDENT,
          day,
        ]),
      );
    }
  });

  it("gọi hai lần cho ra ĐÚNG cùng một kết quả — thủ tục đọc không để lại vết", async ({ skip }) => {
    if (!ready) return skip();
    // §9 nói về mutation, và router này không có mutation nào. Phép kiểm tương đương cho
    // một thủ tục ĐỌC: gọi lại không đổi kết quả, và không sinh dòng nào ở đâu cả.
    const truoc = await asSystem((c) =>
      c.query<{ n: string }>("select count(*)::text as n from attendance.checkins"),
    );
    const a = await nam().getRoster({});
    const b = await nam().getRoster({});
    expect(b).toEqual(a);
    const sau = await asSystem((c) =>
      c.query<{ n: string }>("select count(*)::text as n from attendance.checkins"),
    );
    expect(sau.rows[0]!.n).toBe(truoc.rows[0]!.n);
  });
});
