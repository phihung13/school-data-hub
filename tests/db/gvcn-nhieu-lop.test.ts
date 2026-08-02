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
    // Em duy nhất của lớp đã có dòng điểm danh ⇒ không còn ai "chưa điểm danh" ([QĐ-3]).
    expect(small.totals.notCheckedInCount).toBe(0);
    // Phân bố tâm trạng KHÔNG còn đi ra buồng lái (ADR-026). Nhưng chỗ đó không được im:
    // máy chủ phải nói ra vì sao, để màn hình khỏi vẽ một ô trống trông như lỗi tải.
    expect(small.moodVisibility).toEqual({ readable: false, reason: "chi_tam_ly" });

    const big = await lan().getDashboard({ classId: FIXTURE.classA });
    // Lớp 6A1 có Minh (seed) và có thể có em do file test khác để lại — chỉ khẳng định
    // điều CHẮC CHẮN đúng: em của lớp thử nghiệm không được đếm sang đây.
    expect(big.totals.totalStudents).toBeGreaterThanOrEqual(1);
    expect(big.classId).toBe(FIXTURE.classA);
    // Check-in vừa tạo là của lớp kia: sĩ số 6A1 không được cộng thêm em đó, và số
    // "chưa điểm danh" của 6A1 không bao giờ vượt quá chính sĩ số của nó.
    expect(big.totals.notCheckedInCount).toBeLessThanOrEqual(big.totals.totalStudents);
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

// ---------------------------------------------------------------------------
// 4 · Buồng lái nói ra nó đứng sau phép đo nào (gói "debt-32-…", 01/08/2026)
//
// Nhóm này KHÔNG kiểm câu chữ trên màn hình — chuyện đó đã khoá ở
// tests/unit/gvcn-trang-thai-quet.test.ts bằng hàm thuần. Ở đây kiểm phần chỉ Postgres
// thật mới trả lời được: `care.getDashboard` có ĐỌC ĐÚNG `ops.v_job_health` không, và nó
// có phân biệt được ba tình huống mà một dấu thời gian trần gộp làm một hay không.
//
// Cách dựng ba trạng thái mà KHÔNG xoá dữ liệu thật: "gửi tạm" mọi dòng job_runs của
// flag_engine sang một tên job khác rồi trả lại trong `finally`. Xoá rồi seed lại là
// đánh mất 200 lần chạy thật đang nằm trên hub_dev — mà sổ nhật ký máy thì không có
// đường dựng lại.
// ---------------------------------------------------------------------------

/** Tên job tạm — có tiền tố rõ ràng để ai soi CSDL cũng biết đây là rác của test. */
const PARKED = "flag_engine__test_parked";

/**
 * Chạy `fn` trong một thế giới nơi sổ nhật ký của flag_engine đúng bằng `dungSo`.
 * `finally` trả lại nguyên trạng kể cả khi assertion đỏ giữa chừng — một test đỏ không
 * được để lại một buồng lái nói dối cho những test chạy sau nó.
 */
async function voiSoNhatKy(
  dungSo: (c: import("@hub/core/db").PoolClient) => Promise<void>,
  fn: () => Promise<void>,
): Promise<void> {
  // Mốc nước: mọi dòng có id LỚN HƠN mốc này là dòng sinh ra trong lúc test chạy. Dọn theo
  // mốc chứ không theo `delete ... where job_name = 'flag_engine'`, vì cách sau sẽ xoá luôn
  // một lần quét THẬT nếu có ai đó (job nền, một agent khác, chính bộ lịch) chạy engine
  // đúng lúc test đang bay — và sổ nhật ký máy thì không có đường dựng lại.
  const { rows } = await asSystem((c) =>
    c.query<{ moc: string }>("select coalesce(max(id), 0)::text as moc from ops.job_runs"),
  );
  const moc = rows[0]?.moc ?? "0";

  await asSystem((c) => c.query("update ops.job_runs set job_name = $1 where job_name = 'flag_engine'", [PARKED]));
  try {
    await asSystem(dungSo);
    await fn();
  } finally {
    await asSystem((c) => c.query("delete from ops.job_runs where id > $1::bigint", [moc]));
    await asSystem((c) => c.query("update ops.job_runs set job_name = 'flag_engine' where job_name = $1", [PARKED]));
  }
}

/**
 * Số dòng `flag_engine` trong sổ nhật ký TRƯỚC khi nhóm 4 đụng vào nó. Đo một lần, dùng
 * để so ở bài cuối nhóm.
 *
 * Vì sao phải là SO SÁNH chứ không phải một ngưỡng: bài cuối nhóm trước đây khẳng định
 * `count > 0`, và nó xanh suốt vì `hub_dev` đã tích hàng trăm lượt chạy engine. Ngày
 * 02/08/2026 nợ #41 tách bộ test sang `hub_test` dựng lại từ đầu — sổ nhật ký ở đó RỖNG,
 * nên `count > 0` đỏ. Bài test không hỏng lúc đó; nó vốn đã sai từ đầu và chỉ được đống
 * dữ liệu bẩn che cho. Câu hỏi thật của bài này là "sổ có được TRẢ LẠI NGUYÊN TRẠNG
 * không", và nguyên trạng của một cơ sở dữ liệu sạch là số không.
 */
let soDongTruocNhom4 = -1;

describe("4 · trạng thái bộ quét cờ đi ra tới buồng lái", () => {
  beforeAll(async () => {
    if (!ready) return;
    const { rows } = await asSystem((c) =>
      c.query<{ n: string }>("select count(*)::text as n from ops.job_runs where job_name = 'flag_engine'"),
    );
    soDongTruocNhom4 = Number(rows[0]?.n ?? -1);
  });

  it("(b) CHƯA QUÉT LẦN NÀO → state 'chua_chay', needsAttention, và lastScanAt = null", async ({ skip }) => {
    if (!ready) return skip();
    // Đây là trạng thái KHÔNG BAO GIỜ xảy ra trên máy dev (flag_engine đã chạy hàng trăm
    // lần), nên nếu không dựng ra bằng tay thì không có gì bảo vệ nó. Nó cũng đúng là
    // trạng thái của một trường mới bật hệ thống trong ngày đầu tiên.
    await voiSoNhatKy(
      async () => {},
      async () => {
        const d = await lan().getDashboard({ classId: FIXTURE.classA });
        expect(d.scanHealth.state).toBe("chua_chay");
        expect(d.scanHealth.needsAttention).toBe(true);
        expect(d.scanHealth.lastSuccessAt).toBeNull();
        expect(d.lastScanAt).toBeNull();
        // Nhịp vẫn đọc được từ ops.job_schedule — câu cảnh báo nói được "mỗi 24 giờ"
        // mà không cần một hằng số nào trong mã (mệnh lệnh 7).
        expect(d.scanHealth.expectedEveryHours).toBe(24);
        expect(d.scanHealth.graceHours).toBe(6);
      },
    );
  });

  it("(c) QUÁ HẠN → state 'qua_han', và mốc quét cũ vẫn được nói ra chứ không bị giấu", async ({ skip }) => {
    if (!ready) return skip();
    // 40 giờ > expected_every (24h) + grace (6h) đã khai trong ops.job_schedule. Con số 40
    // nằm trong TEST là đúng chỗ: nó dựng tình huống, không định nghĩa ngưỡng.
    await voiSoNhatKy(
      (c) =>
        c
          .query(
            `insert into ops.job_runs (job_name, status, started_at, finished_at, metrics)
             values ('flag_engine', 'success', now() - interval '40 hours',
                     now() - interval '40 hours', '{}'::jsonb)`,
          )
          .then(() => undefined),
      async () => {
        const d = await lan().getDashboard({ classId: FIXTURE.classA });
        expect(d.scanHealth.state).toBe("qua_han");
        expect(d.scanHealth.needsAttention).toBe(true);
        expect(d.scanHealth.lastSuccessAt).not.toBeNull();
        expect(d.lastScanAt).toBe(d.scanHealth.lastSuccessAt);
      },
    );
  });

  it("(c') LẦN QUÉT GẦN NHẤT HỎNG → 'that_bai', KHÔNG bị đọc thành 'chưa quét'", async ({ skip }) => {
    if (!ready) return skip();
    await voiSoNhatKy(
      (c) =>
        c
          .query(
            `insert into ops.job_runs (job_name, status, started_at, finished_at, metrics) values
               ('flag_engine', 'success', now() - interval '3 hours', now() - interval '3 hours', '{}'::jsonb),
               ('flag_engine', 'failed',  now() - interval '1 hour',  now() - interval '1 hour',  '{}'::jsonb)`,
          )
          .then(() => undefined),
      async () => {
        const d = await lan().getDashboard({ classId: FIXTURE.classA });
        expect(d.scanHealth.state).toBe("that_bai");
        expect(d.scanHealth.needsAttention).toBe(true);
        // Vẫn còn một lần THÀNH CÔNG cách đây 3 giờ: buồng lái phải nói được rằng số
        // đang hiện đến từ lần đó, chứ không được xoá sạch thành "chưa có gì".
        expect(d.scanHealth.lastSuccessAt).not.toBeNull();
        expect(d.scanHealth.lastFinishedAt).not.toBe(d.scanHealth.lastSuccessAt);
      },
    );
  });

  it("(a) QUÉT XONG → 'ok', và luật bị bỏ qua trong lần chạy đó đi ra tới màn hình", async ({ skip }) => {
    if (!ready) return skip();
    await voiSoNhatKy(
      (c) =>
        c
          .query(
            `insert into ops.job_runs (job_name, status, started_at, finished_at, degraded_sources, metrics)
             values ('flag_engine', 'success', now() - interval '2 minutes', now(), '{}'::text[],
                     jsonb_build_object('rules_skipped', jsonb_build_array(
                       jsonb_build_object('rule_code','C_CEFR','ly_do','chua_cai_dat'),
                       jsonb_build_object('rule_code','C_MASTERY','ly_do','chua_khai_nguon_tuoi'))))`,
          )
          .then(() => undefined),
      async () => {
        const d = await lan().getDashboard({ classId: FIXTURE.classA });
        expect(d.scanHealth.state).toBe("ok");
        expect(d.scanHealth.needsAttention).toBe(false);
        // Hai luật này bị bỏ qua MỌI ĐÊM trên hub_dev và trước 01/08/2026 không màn hình
        // nào nói ra. Một bảng cờ sạch khi ấy là kết quả của 4/6 luật, không phải 6/6.
        expect(d.scanHealth.rulesSkipped.map((r) => r.ruleCode).sort()).toEqual([
          "C_CEFR",
          "C_MASTERY",
        ]);
        expect(d.scanHealth.rulesSkipped.find((r) => r.ruleCode === "C_CEFR")?.lyDo).toBe(
          "chua_cai_dat",
        );
      },
    );
  });

  it("nguồn hết tươi của LẦN CHẠY ĐÓ đi ra riêng, không lẫn với ops.v_stale_sources", async ({ skip }) => {
    if (!ready) return skip();
    await voiSoNhatKy(
      (c) =>
        c
          .query(
            `insert into ops.job_runs (job_name, status, started_at, finished_at, degraded_sources, metrics)
             values ('flag_engine', 'success', now() - interval '2 minutes', now(),
                     array['evidence']::text[], '{}'::jsonb)`,
          )
          .then(() => undefined),
      async () => {
        const d = await lan().getDashboard({ classId: FIXTURE.classA });
        expect(d.scanHealth.degradedSources).toEqual(["evidence"]);
        // `staleSources` là câu hỏi khác: "ngay lúc này nguồn nào quá hạn tươi".
        // `degradedSources` là "lần quét ĐÓ đã bỏ qua nguồn nào". Trộn hai câu là làm
        // mất khả năng trả lời "cờ tôi đang nhìn có bị thiếu nguồn không".
        expect(Array.isArray(d.staleSources)).toBe(true);
      },
    );
  });

  it("sổ nhật ký thật đã được trả lại nguyên trạng sau các ca trên", async ({ skip }) => {
    if (!ready) return skip();
    // Không có bài này thì một lỗi trong `finally` sẽ âm thầm để lại hub_dev với sổ nhật
    // ký trống, và mọi phép đo sau đó đọc ra "chưa quét lần nào".
    const { rows } = await asSystem((c) =>
      c.query<{ n: string; parked: string }>(
        `select (select count(*) from ops.job_runs where job_name = 'flag_engine')::text as n,
                (select count(*) from ops.job_runs where job_name = $1)::text as parked`,
        [PARKED],
      ),
    );
    expect(Number(rows[0]?.parked ?? -1)).toBe(0);
    // SO với mốc đo đầu nhóm, KHÔNG so với một ngưỡng. Xem chú thích của `soDongTruocNhom4`:
    // câu `> 0` cũ chỉ xanh nhờ dữ liệu bẩn tích trên hub_dev, và nó đỏ ngay ngày bộ test
    // được chuyển sang một cơ sở dữ liệu dựng lại từ đầu.
    expect(soDongTruocNhom4).toBeGreaterThanOrEqual(0); // beforeAll đã chạy thật
    expect(Number(rows[0]?.n ?? -1)).toBe(soDongTruocNhom4);
  });
});

/**
 * Số em lớp 6A1 check-in với tâm trạng "Buồn" hôm nay, đọc thẳng từ CSDL.
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
