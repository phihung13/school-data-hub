// tests/db/tam-ly-cum.test.ts — gói "man-hinh-tam-ly-cum" (31/07/2026).
//
// Vai tâm lý cụm (`counselor`) cho tới hôm nay có ĐÚNG 0 màn nghiệp vụ, trong khi cô
// GHI ĐƯỢC ba thứ nặng nhất của hệ chăm sóc: tắt cờ khẩn (`acknowledgeHelpRequest`),
// ghi can thiệp (`logIntervention`), và ĐÓNG hồ sơ của một đứa trẻ (`closeCase`).
// `listClassInterventions` đã mở một khe đọc nhưng nó đòi biết trước `classId` — mà cụm
// là nhiều lớp, nên cô không có đường nào bắt đầu từ câu hỏi thật của mình: "hôm nay ai
// đang chờ tôi?". Hai query mới (`listClusterCases`, `getClusterCaseDetail`) là đường đó.
//
// BA NHÓM CÂU HỎI mà file này hỏi lại, không nhóm nào tin nhóm nào:
//
//  1. ĐỐI XỨNG ĐỌC/GHI — với CÙNG một vai, mọi thứ GHI được phải có đường ĐỌC. Cụ thể:
//     mỗi hồ sơ mà tâm lý cụm đóng được thì cũng phải MỞ XEM được trước khi đóng.
//     Đây là lỗ hổng gói việc này vá; luật đã ghi ở đầu tests/db/ghi-chu-tu-van.test.ts.
//
//  2. PHẠM VI CÓ BIÊN THẬT — cụm không phải "mọi cơ sở". Em ngoài cụm, cơ sở ngoài cụm,
//     và các vai khác (GVCN thuần, học sinh, phụ huynh, quản trị) đều phải bị chặn.
//
//  3. LỜI HỨA IN TRÊN MÀN HÌNH LÀ RÀNG BUỘC KỸ THUẬT. Hai lời hứa đang in cho trẻ đọc:
//       · /checkin      — "Chỉ thầy cô chủ nhiệm thấy" (mood)
//       · /can-gap-thay-co — dấu tích xanh cho ĐÚNG GVCN của em, và "cô sẽ hỏi ý con
//         trước khi chuyển tới phòng tâm lý" (nội dung lời em viết)
//     Tâm lý cụm KHÔNG phải "thầy cô chủ nhiệm", và đường chuyển tuyến có xin phép thì
//     chưa tồn tại (GĐ2). Nên hai màn mới KHÔNG được trả ra `mood` lẫn `help_requests.note`
//     — dù RLS ở tầng dữ liệu HIỆN VẪN CHO PHÉP đọc cả hai (0009 loop + 0037 dùng
//     `core.can_see_care`). Khoảng hụt đó là chỗ tính năng sau rất dễ mở lại trong im
//     lặng, nên bài kiểm ở đây soi thẳng vào chuỗi JSON trả về chứ không soi từng field:
//     thêm một cột vào câu SQL là test đỏ ngay.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Hai em riêng của bài này — không giẫm lên Minh/Bình hay lên em thử nghiệm của bài khác. */
const IN_CLUSTER_STUDENT = "71000000-0000-0000-0000-0000000000d1";
const OUT_CLUSTER_STUDENT = "71000000-0000-0000-0000-0000000000d2";
/** Em thứ ba: CHỈ có tín hiệu khẩn, chưa ai mở hồ sơ — nhóm dễ bị nuốt nhất. */
const HELP_ONLY_STUDENT = "71000000-0000-0000-0000-0000000000d3";
/** Em thứ tư: hồ sơ mở, hành động gần nhất cách đây 10 ngày — để soi ngưỡng im lặng. */
const STALE_STUDENT = "71000000-0000-0000-0000-0000000000d4";
const STALE_ACTION_DAYS = 10;

const OUT_SCHOOL = "21000000-0000-0000-0000-0000000000d2";
const OUT_CLASS = "31000000-0000-0000-0000-0000000000d2";

/** Nguyên văn "lời em kể" — không được xuất hiện ở bất kỳ đâu trong output của tâm lý cụm. */
const SECRET_NOTE = "LOI-EM-KE-KHONG-DUOC-RA-KHOI-PHAM-VI-GVCN-d1";
/** Nội dung buổi tư vấn — ngược lại, ĐƯỢC phép ra ở màn tâm lý cụm (policy 0035). */
const COUNSELOR_BODY = "Noi dung buoi tu van do chinh co Mai ghi";

let caseId = "";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const counselor = () => careRouter.createCaller(ctxFor(DEV.counselor)); // Cô Mai — tâm lý cụm Q7
const gvcn = () => careRouter.createCaller(ctxFor(DEV.gvcn)); // Cô Lan — GVCN 6A1, KHÔNG phải tâm lý cụm
const student = () => careRouter.createCaller(ctxFor(DEV.student));
const guardian = () => careRouter.createCaller(ctxFor(DEV.guardian));
const admin = () => careRouter.createCaller(ctxFor(DEV.admin));

async function codeOfRejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "KHÔNG NÉM LỖI";
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `LỖI KHÁC: ${String(err)}`;
  }
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    for (const id of [IN_CLUSTER_STUDENT, OUT_CLUSTER_STUDENT, HELP_ONLY_STUDENT, STALE_STUDENT]) {
      await c.query("delete from core.students where id = $1", [id]);
    }
    await c.query("delete from core.classes where id = $1", [OUT_CLASS]);
    await c.query("delete from core.schools where id = $1", [OUT_SCHOOL]);

    // ── Trong cụm của cô Mai (cơ sở Q7), lớp 6A2 — CỐ TÌNH không phải lớp cô Lan
    // chủ nhiệm: nếu phạm vi bị siết nhầm về "lớp chủ nhiệm" thì em này biến mất.
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99101', $2, 'Em Trong Cụm (tam-ly-cum.test)')`,
      [IN_CLUSTER_STUDENT, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 30)`,
      [IN_CLUSTER_STUDENT, FIXTURE.classB],
    );
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99103', $2, 'Em Chỉ Có Cờ Khẩn (tam-ly-cum.test)')`,
      [HELP_ONLY_STUDENT, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 30)`,
      [HELP_ONLY_STUDENT, FIXTURE.classB],
    );

    // ── Ngoài cụm: một cơ sở KHÔNG có ai mang vai counselor.
    const { rows: net } = await c.query<{ id: string }>("select id from core.school_networks limit 1");
    await c.query(
      "insert into core.schools (id, network_id, code, name) values ($1, $2, 'VA-TEST-D2', 'Cơ sở ngoài cụm (tam-ly-cum.test)')",
      [OUT_SCHOOL, net[0]!.id],
    );
    await c.query(
      "insert into core.classes (id, school_id, code, academic_year, grade) values ($1, $2, '7C1-TEST', '2026-2027', 7)",
      [OUT_CLASS, OUT_SCHOOL],
    );
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99102', $2, 'Em Ngoài Cụm (tam-ly-cum.test)')`,
      [OUT_CLUSTER_STUDENT, OUT_SCHOOL],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 30)`,
      [OUT_CLUSTER_STUDENT, OUT_CLASS],
    );

    // ── Tín hiệu thật: hai em bấm "cần gặp thầy cô", chưa ai xử lý. `note` mang nguyên
    // văn lời em kể — đây chính là thứ không được rời khỏi phạm vi GVCN.
    for (const sid of [IN_CLUSTER_STUDENT, HELP_ONLY_STUDENT]) {
      await c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
         values ($1, current_date, 'lop', 'today', $2)
         on conflict (student_id, requested_on) do update set note = excluded.note`,
        [sid, SECRET_NOTE],
      );
    }
    // Em ngoài cụm cũng có tín hiệu — để chứng minh biên của cụm cắt đúng chỗ.
    await c.query(
      `insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
       values ($1, current_date, 'lop', 'today', $2)
       on conflict (student_id, requested_on) do nothing`,
      [OUT_CLUSTER_STUDENT, SECRET_NOTE],
    );

    // ── Mood: chỉ GVCN thấy. Dựng dữ liệu thật để bài kiểm "không lộ mood" có gì mà lộ.
    await c.query(
      `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
       values ($1, current_date, 'in', 1, 'present', 'app')
       on conflict (student_id, occurred_on, kind) do update set mood = excluded.mood`,
      [IN_CLUSTER_STUDENT],
    );

    // ── Hồ sơ chăm sóc đang mở + một dòng nhật ký + một ghi chú tư vấn của cô Mai.
    const { rows: mai } = await c.query<{ id: string }>(
      "select id from core.users where auth_uid = $1",
      [DEV.counselor],
    );
    const { rows: kase } = await c.query<{ id: string }>(
      "insert into care.care_cases (student_id, owner_id, tier) values ($1, $2, 2) returning id",
      [IN_CLUSTER_STUDENT, mai[0]!.id],
    );
    caseId = kase[0]!.id;
    await c.query(
      "insert into care.interventions (case_id, actor_id, action, note) values ($1, $2, $3, $4)",
      [caseId, mai[0]!.id, "Tâm lý cụm đã gặp em", "Đã hẹn gặp lại tuần sau"],
    );
    await c.query("insert into care.counselor_notes (case_id, author_id, body) values ($1, $2, $3)", [
      caseId,
      mai[0]!.id,
      COUNSELOR_BODY,
    ]);

    // ── Em thứ tư: hồ sơ mở, hành động gần nhất cách đây 10 ngày. Không có tín hiệu
    // khẩn — nên thứ duy nhất đưa em vào danh sách là chính cái hồ sơ đang mở.
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99104', $2, 'Em Bị Bỏ Quên (tam-ly-cum.test)')`,
      [STALE_STUDENT, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 30)`,
      [STALE_STUDENT, FIXTURE.classB],
    );
    const { rows: staleCase } = await c.query<{ id: string }>(
      "insert into care.care_cases (student_id, owner_id, tier) values ($1, $2, 2) returning id",
      [STALE_STUDENT, mai[0]!.id],
    );
    await c.query(
      `insert into care.interventions (case_id, actor_id, action, occurred_at)
       values ($1, $2, 'Đã trò chuyện với học sinh', now() - make_interval(days => $3::int))`,
      [staleCase[0]!.id, mai[0]!.id, STALE_ACTION_DAYS],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  await asSystem(async (c) => {
    for (const id of [IN_CLUSTER_STUDENT, OUT_CLUSTER_STUDENT, HELP_ONLY_STUDENT, STALE_STUDENT]) {
      await c.query("delete from core.students where id = $1", [id]);
    }
    await c.query("delete from core.classes where id = $1", [OUT_CLASS]);
    await c.query("delete from core.schools where id = $1", [OUT_SCHOOL]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("hộp việc của tâm lý cụm · listClusterCases", () => {
  it("nói ra CỤM gồm những cơ sở nào — không để cô tự đoán phạm vi mình đang nhìn", async ({ skip }) => {
    if (!ready) return skip();
    const res = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    expect(res.scope.schools.map((s) => s.schoolId)).toContain(FIXTURE.schoolQ7);
    expect(res.scope.schools.every((s) => s.schoolName.trim().length > 0)).toBe(true);
  });

  it("thấy em thuộc lớp KHÔNG ai trong cụm chủ nhiệm — phạm vi là cụm, không phải lớp", async ({ skip }) => {
    if (!ready) return skip();
    const res = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    const row = res.rows.find((r) => r.studentId === IN_CLUSTER_STUDENT);
    expect(row).toBeDefined();
    expect(row!.caseId).toBe(caseId);
    expect(row!.caseStatus).toBe("open");
    expect(row!.helpPending).toBe(true);
    expect(row!.className).toBe("6A2");
  });

  it("em CHỈ có cờ khẩn (chưa ai mở hồ sơ) vẫn có mặt — nhóm cần gấp nhất không được rơi", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Lỗi "tín hiệu khẩn bị nuốt" (ghi chú số 3 đầu routers/care.ts) tái sinh ở đây nếu
    // ai đó lấy care_cases làm gốc truy vấn: em chưa có hồ sơ thì không có hàng để nối.
    const res = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    const row = res.rows.find((r) => r.studentId === HELP_ONLY_STUDENT);
    expect(row).toBeDefined();
    expect(row!.caseId).toBeNull();
    expect(row!.helpPending).toBe(true);
  });

  it("“chưa ai làm gì” ≠ “vừa làm hôm nay”: daysSinceLastAction = null, không phải 0", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const res = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    const helpOnly = res.rows.find((r) => r.studentId === HELP_ONLY_STUDENT)!;
    expect(helpOnly.lastInterventionAt).toBeNull();
    expect(helpOnly.daysSinceLastAction).toBeNull();
    // Chưa có hành động nào = đã quá ngưỡng im lặng (không phải "còn trong hạn").
    expect(helpOnly.overQuietWindow).toBe(true);

    const withAction = res.rows.find((r) => r.studentId === IN_CLUSTER_STUDENT)!;
    expect(withAction.daysSinceLastAction).toBe(0);
    expect(withAction.overQuietWindow).toBe(false);
  });

  it("ngưỡng im lặng đến TỪ BẢNG care.thresholds, không phải hằng số trong code (§7)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Em có hành động gần nhất cách đây 10 ngày. Ngưỡng toàn hệ đang là 7 ⇒ quá hạn.
    const before = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    const beforeRow = before.rows.find((r) => r.studentId === STALE_STUDENT)!;
    expect(beforeRow.daysSinceLastAction).toBe(STALE_ACTION_DAYS);
    expect(beforeRow.overQuietWindow).toBe(true);

    // Khai riêng cho ĐÚNG cơ sở Q7 một ngưỡng rộng hơn (0026: dòng của cơ sở thắng dòng
    // toàn hệ). Nếu con số nằm trong code thì câu INSERT này không đổi được gì và test đỏ.
    await asSystem((c) =>
      c.query(
        `insert into care.thresholds (rule_code, params, school_id)
         values ('E_MOOD', '{"negative_days_streak":5,"window_days":14,"bad_mood_max":2,"quiet_days":60,"mode":"streak"}'::jsonb, $1)`,
        [FIXTURE.schoolQ7],
      ),
    );
    try {
      const after = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
      expect(after.rows.find((r) => r.studentId === STALE_STUDENT)!.overQuietWindow).toBe(false);
      expect(after.quietDays).toBe(60);
    } finally {
      await asSystem((c) =>
        c.query("delete from care.thresholds where rule_code = 'E_MOOD' and school_id = $1", [
          FIXTURE.schoolQ7,
        ]),
      );
    }
  });

  it("em NGOÀI cụm không lọt vào danh sách, dù em đó cũng có cờ khẩn", async ({ skip }) => {
    if (!ready) return skip();
    const res = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    expect(res.rows.some((r) => r.studentId === OUT_CLUSTER_STUDENT)).toBe(false);
  });

  it("hỏi một cơ sở ngoài cụm → FORBIDDEN, không phải danh sách rỗng", async ({ skip }) => {
    if (!ready) return skip();
    // Rỗng vì không có gì và rỗng vì không được phép là hai chuyện khác nhau.
    expect(
      await codeOfRejection(() =>
        counselor().listClusterCases({ schoolId: OUT_SCHOOL, includeClosed: false, limit: 100 }),
      ),
    ).toBe("FORBIDDEN");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("hồ sơ một em · getClusterCaseDetail", () => {
  it("mở được ĐÚNG hồ sơ mà cô có quyền đóng — hết cảnh quyết định trong bóng tối", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const detail = await counselor().getClusterCaseDetail({ studentId: IN_CLUSTER_STUDENT, days: 30 });
    expect(detail.student.fullName).toContain("Em Trong Cụm");
    expect(detail.openCase?.caseId).toBe(caseId);
    expect(detail.interventions.length).toBeGreaterThanOrEqual(1);
    expect(detail.helpSignals.length).toBeGreaterThanOrEqual(1);

    // Đối xứng đọc/ghi: mọi hồ sơ đóng được thì cũng đọc được TRƯỚC đó.
    const list = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    for (const row of list.rows.filter((r) => r.caseStatus === "open")) {
      const one = await counselor().getClusterCaseDetail({ studentId: row.studentId, days: 30 });
      expect(one.student.studentId).toBe(row.studentId);
    }
  });

  it("ĐỌC được ghi chú tư vấn — đây là vai duy nhất (cùng tác giả) được đọc (0035)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const detail = await counselor().getClusterCaseDetail({ studentId: IN_CLUSTER_STUDENT, days: 30 });
    expect(detail.counselorNotes.map((n) => n.body)).toContain(COUNSELOR_BODY);
    expect(detail.counselorNotes[0]!.mine).toBe(true);
  });

  it("nói THẲNG là Hub chưa ghi được ghi chú tư vấn, thay vì hiện ô soạn thảo rồi bắn 42501", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const detail = await counselor().getClusterCaseDetail({ studentId: IN_CLUSTER_STUDENT, days: 30 });
    // 0009 chỉ cấp policy SELECT cho care.counselor_notes; không có INSERT nào. Cờ này
    // đổi thành true trong CÙNG PR với migration mở đường ghi, không sớm hơn.
    expect(detail.notesWritable).toBe(false);
    const write = await asUser(DEV.counselor, (c) =>
      c
        .query("insert into care.counselor_notes (case_id, author_id, body) values ($1, core.current_user_id(), 'thử ghi')", [
          caseId,
        ])
        .then(() => "GHI ĐƯỢC")
        .catch((err: { code?: string }) => err.code ?? "LỖI KHÁC"),
    );
    expect(write).toBe("42501");
  });

  it("em ngoài cụm → FORBIDDEN (cùng một câu với em không tồn tại — không mở kênh dò tên)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    expect(
      await codeOfRejection(() =>
        counselor().getClusterCaseDetail({ studentId: OUT_CLUSTER_STUDENT, days: 30 }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOfRejection(() =>
        counselor().getClusterCaseDetail({
          studentId: "71000000-0000-0000-0000-0000000000ff",
          days: 30,
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("lời hứa in trên màn hình · hai thứ hai màn này KHÔNG được trả ra", () => {
  it("KHÔNG có nguyên văn “cần gặp thầy cô” ở bất kỳ đâu trong output", async ({ skip }) => {
    if (!ready) return skip();
    // Màn /can-gap-thay-co in cho em đọc: dấu tích xanh cho ĐÚNG GVCN của em, và
    // "cô sẽ hỏi ý con trước khi chuyển tới phòng tâm lý". Đường chuyển tuyến có xin
    // phép đó chưa tồn tại, nên tới hôm nay phòng tâm lý chỉ được nhận LOẠI tín hiệu.
    //
    // Soi chuỗi JSON chứ không soi từng field: thêm một cột vào câu SQL sau này là đỏ
    // ngay, kể cả khi cột đó được đặt tên khác.
    const list = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    const detail = await counselor().getClusterCaseDetail({ studentId: IN_CLUSTER_STUDENT, days: 30 });
    expect(JSON.stringify(list)).not.toContain(SECRET_NOTE);
    expect(JSON.stringify(detail)).not.toContain(SECRET_NOTE);

    // …nhưng LOẠI tín hiệu thì có, nếu không màn hình chẳng nói được gì.
    expect(detail.helpSignals[0]!.topic).toBe("lop");
    expect(detail.helpSignals[0]!.urgency).toBe("today");
    expect(Object.keys(detail.helpSignals[0]!)).not.toContain("note");
  });

  it("KHÔNG có mood — “Chỉ thầy cô chủ nhiệm thấy” in ngay tại chỗ em nhập", async ({ skip }) => {
    if (!ready) return skip();
    const list = await counselor().listClusterCases({ includeClosed: false, limit: 100 });
    const detail = await counselor().getClusterCaseDetail({ studentId: IN_CLUSTER_STUDENT, days: 30 });
    expect(JSON.stringify(list)).not.toContain('"mood"');
    expect(JSON.stringify(detail)).not.toContain('"mood"');
    expect(JSON.stringify(detail)).not.toContain('"checkins"');
  });

  it("RLS ở tầng dữ liệu VẪN cho tâm lý cụm đọc hai thứ đó — nên tầng ứng dụng là chỗ đang giữ lời hứa", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Bài này không khẳng định hiện trạng là ĐÚNG; nó ghi lại hiện trạng để lần sau
    // migration siết `help_requests_scope`/`checkins` cho counselor thì test đỏ và
    // người sửa biết phải qua đây đọc lại lý lẽ. Xem canPhoiHop của gói việc.
    const { rows } = await asUser(DEV.counselor, (c) =>
      c.query<{ n: string }>(
        `select count(*)::text as n from attendance.help_requests
          where student_id = $1 and note is not null`,
        [IN_CLUSTER_STUDENT],
      ),
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("phạm vi vai · ai KHÔNG vào được hai màn này", () => {
  it("GVCN thuần (không kiêm tâm lý cụm) → FORBIDDEN ở cả hai đường", async ({ skip }) => {
    if (!ready) return skip();
    // Không trả danh sách rỗng: rỗng trông y hệt "cụm đang yên" và cô Lan sẽ tin là
    // không có việc gì — đúng kiểu im lặng bị đọc thành kết luận.
    expect(
      await codeOfRejection(() => gvcn().listClusterCases({ includeClosed: false, limit: 100 })),
    ).toBe("FORBIDDEN");
    expect(
      await codeOfRejection(() =>
        gvcn().getClusterCaseDetail({ studentId: IN_CLUSTER_STUDENT, days: 30 }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("học sinh, phụ huynh, quản trị → FORBIDDEN", async ({ skip }) => {
    if (!ready) return skip();
    for (const caller of [student, guardian, admin]) {
      expect(
        await codeOfRejection(() => caller().listClusterCases({ includeClosed: false, limit: 100 })),
      ).toBe("FORBIDDEN");
      expect(
        await codeOfRejection(() =>
          caller().getClusterCaseDetail({ studentId: IN_CLUSTER_STUDENT, days: 30 }),
        ),
      ).toBe("FORBIDDEN");
    }
  });

  it("GVCN KHÔNG mất gì: buồng lái và nhật ký lớp vẫn chạy như cũ", async ({ skip }) => {
    if (!ready) return skip();
    const log = await gvcn().listClassInterventions({ limit: 50 });
    expect(log.classId).toBe(FIXTURE.classA);
  });
});
