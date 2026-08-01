// tests/db/help-request-rieng-tu.test.ts — gói "rls-help-requests" (31/07/2026).
//
// Màn hình `/can-gap-thay-co` in cho học sinh đọc, ngay tại chỗ em gõ lời nhắn (thẻ "Ai
// đọc được lời con?" trong `apps/hub/components/help-request-view.tsx`):
//
//     "Bạn cùng lớp · thầy cô dạy môn · thầy cô lớp khác · bố mẹ — KHÔNG nhìn thấy"
//
// (Câu này đã sửa 01/08/2026. Bản cũ viết gọn "thầy cô khác", mà thầy cô TÂM LÝ CỤM thì
// đọc được — `help_requests_scope` (0037) dùng `core.can_see_care`. Bài "TÂM LÝ CỤM đọc
// được" phía dưới vẫn xanh y hệt trước và sau, nên chính bộ test này KHÔNG bắt được lỗi
// đó: nó là lỗi ở phía màn hình nói thiếu, không phải ở phía quyền. Ghi ra đây để lần sau
// không ai đọc màu xanh của file này thành "nhãn trên màn đã đúng".)
//
// Trước migration 0037 câu đó KHÔNG đúng ở tầng dữ liệu. `attendance.help_requests`
// nằm trong vòng lặp 16 bảng của `0009:150-176`, dùng chung `core.can_see_student()`
// — hàm gồm cả `is_my_child` và `principal_of`. Đo lại được trên hub_dev: phiên
// `authenticated` của phụ huynh SELECT ra 1 dòng, đọc được cả cột `note`, tức chính
// lời em viết. Hiệu trưởng cơ sở cũng vậy.
//
// Lúc đó không đường code nào phơi dữ liệu này ra — `report.ts` cố ý không đọc bảng,
// `care.ts` chỉ đọc dưới phiên GVCN/tâm lý cụm. Nhưng đó chính là vấn đề: lời hứa
// đang được giữ bằng KỶ LUẬT TẦNG ỨNG DỤNG, không bằng tầng dữ liệu. Một tính năng
// sau viết đúng một câu `select` dưới phiên phụ huynh là lộ lại, và lộ trong im lặng.
//
// Luật mà file này cưỡng chế: LỜI HỨA IN TRÊN MÀN HÌNH LÀ RÀNG BUỘC KỸ THUẬT. Chỗ
// duy nhất chứng minh được nó là RLS chạy trên Postgres thật, dưới đúng danh tính
// của từng vai — không phải một dòng comment, không phải một quy ước giữa các dev.
//
// Phân công với bài pgTAP song sinh (`0037_help_requests_scope_test.sql`): bài kia
// chạy trên fixture `seed_basic()` nên có cả GIÁO VIÊN BỘ MÔN được phân công đúng
// lớp 6A1 — nhánh đó chỉ chứng minh được ở đó. Dữ liệu seed dev (`seed.mjs`) không
// có phân công bộ môn nào, nên assert ở đây sẽ XANH GIẢ: 0 dòng vì thầy không dạy
// lớp nào, không phải vì policy chặn. File này giữ đúng những vai mà seed dev thật
// sự dựng được — phụ huynh, hiệu trưởng/quản trị, GVCN lớp khác — cộng chiều đầu
// cuối qua tRPC mà pgTAP không chạm tới.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import { checkinRouter } from "@/server/routers/checkin";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Học sinh riêng của bài này — không giẫm lên Minh hay lên em thử nghiệm của bài khác. */
const TEST_STUDENT = "71000000-0000-0000-0000-000000000047";
/** Lời nhắn dùng làm mồi: nếu chuỗi này lọt sang phiên khác thì test đỏ với bằng chứng đọc được. */
const LOI_NHAN = "Chuyện ở nhà — em chỉ muốn kể cho cô chủ nhiệm, đừng cho bố mẹ biết";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const gvcn = () => careRouter.createCaller(ctxFor(DEV.gvcn)); // Cô Lan — GVCN 6A1
/** Chính em (Minh) — vai DUY NHẤT gọi được đường GHI `checkin.requestHelp`. */
const minh = () => checkinRouter.createCaller(ctxFor(DEV.student));


/** Số dòng yêu cầu HÔM NAY của Minh, đọc bằng quyền hệ thống để đếm sự thật trong bảng. */
async function minhRowsToday(): Promise<Array<{ note: string | null; handled_at: string | null }>> {
  const { rows } = await asSystem((c) =>
    c.query<{ note: string | null; handled_at: string | null }>(
      `select note, handled_at::text
         from attendance.help_requests
        where student_id = $1 and requested_on = current_date`,
      [FIXTURE.studentMinh],
    ),
  );
  return rows;
}

async function clearMinhToday(): Promise<void> {
  await asSystem((c) =>
    c.query("delete from attendance.help_requests where student_id = $1 and requested_on = current_date", [
      FIXTURE.studentMinh,
    ]),
  );
}

/** Số dòng help_requests mà MỘT NGƯỜI CỤ THỂ đọc được — dưới RLS thật, không phải asSystem. */
async function requestsVisibleTo(authUid: string): Promise<number> {
  const { rows } = await asUser(authUid, (c) =>
    c.query<{ n: string }>(
      "select count(*)::text as n from attendance.help_requests where student_id = $1",
      [TEST_STUDENT],
    ),
  );
  return Number(rows[0]?.n ?? 0);
}

/** Lời nhắn mà một người đọc được — null nghĩa là RLS đã lọc sạch dòng. */
async function noteVisibleTo(authUid: string): Promise<string | null> {
  const { rows } = await asUser(authUid, (c) =>
    c.query<{ note: string | null }>(
      "select note from attendance.help_requests where student_id = $1",
      [TEST_STUDENT],
    ),
  );
  return rows[0]?.note ?? null;
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);

    // Em học lớp 6A1 (cô Lan chủ nhiệm), cơ sở Q7 (cô Mai là tâm lý cụm).
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-99047', $2, 'Em Thử Nghiệm (help-request-rieng-tu.test)')`,
      [TEST_STUDENT, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, current_date - 30)`,
      [TEST_STUDENT, FIXTURE.classA],
    );

    // Gắn em vào ĐÚNG tài khoản phụ huynh của seed dev: không có quan hệ này thì
    // "phụ huynh đọc ra 0 dòng" là xanh giả — 0 vì không phải con họ, không phải
    // vì policy chặn. Đây là nhánh mà lần lộ dữ liệu thật đã đi qua.
    const { rows: ph } = await c.query<{ id: string }>(
      "select p.id from core.parents p join core.users u on u.id = p.user_id where u.auth_uid = $1",
      [DEV.guardian],
    );
    await c.query(
      `insert into core.parent_students (parent_id, student_id) values ($1, $2)
       on conflict do nothing`,
      [ph[0]!.id, TEST_STUDENT],
    );

    await c.query(
      `insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
       values ($1, current_date, 'nha', 'today', $2)
       on conflict (student_id, requested_on)
       do update set note = excluded.note, handled_at = null, handled_by = null`,
      [TEST_STUDENT, LOI_NHAN],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  // help_requests / enrollments / parent_students đều ON DELETE CASCADE theo học sinh.
  await asSystem((c) => c.query("delete from core.students where id = $1", [TEST_STUDENT]));
});

// ───────────────────────────────────────────────────────────────────────────
describe("cần gặp thầy cô · chiều TỪ CHỐI — đúng ba nhóm mà màn hình gọi tên", () => {
  it("BỐ MẸ đọc ra 0 dòng — trước 0037 con số này là 1, đo được trên hub_dev", async ({ skip }) => {
    if (!ready) return skip();
    expect(await requestsVisibleTo(DEV.guardian)).toBe(0);
  });

  it("BỐ MẸ không lấy được lời nhắn, kể cả khi hỏi thẳng cột note", async ({ skip }) => {
    if (!ready) return skip();
    // Hỏi thẳng cột chứ không đếm dòng: RLS lọc theo DÒNG, và bài học của 0025 là
    // "lọc dòng không phải lọc cột" — nên phải kiểm đúng thứ đứa trẻ sợ bị đọc.
    expect(await noteVisibleTo(DEV.guardian)).toBeNull();
  });

  it("THẦY CÔ KHÁC (GVCN lớp khác) và QUẢN TRỊ/HIỆU TRƯỞNG đọc ra 0 dòng", async ({ skip }) => {
    if (!ready) return skip();
    expect(await requestsVisibleTo(DEV.gvcn2)).toBe(0);
    expect(await requestsVisibleTo(DEV.admin)).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("cần gặp thầy cô · chiều CHO PHÉP — siết không được khoá nhầm ai", () => {
  it("GVCN CỦA EM đọc được nguyên lời nhắn — đúng người mà màn hình hứa", async ({ skip }) => {
    if (!ready) return skip();
    expect(await noteVisibleTo(DEV.gvcn)).toBe(LOI_NHAN);
  });

  it("TÂM LÝ CỤM đọc được — cùng phạm vi với quyền bấm “đã gặp em rồi” (0026)", async ({ skip }) => {
    if (!ready) return skip();
    // Đọc và ghi phải cho CÙNG MỘT kết luận quyền: cô tắt được tín hiệu khẩn thì cô
    // phải đọc được nó trước khi tắt, nếu không là bắt người ta quyết định trong tối.
    expect(await requestsVisibleTo(DEV.counselor)).toBe(1);
  });

  it("PHỤ HUYNH VẪN tra được chính con mình — siết một bảng không khoá cả đường của họ", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const { rows } = await asUser(DEV.guardian, (c) =>
      c.query<{ n: string }>("select count(*)::text as n from core.students where id = $1", [
        TEST_STUDENT,
      ]),
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("cần gặp thầy cô · chiều ĐẦU CUỐI qua tRPC — tín hiệu khẩn không mất", () => {
  it("buồng lái GVCN vẫn bật cờ khẩn cho em này (E_URGENT), không phải im lặng", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // "Im lặng không phải kết luận": nếu siết RLS làm câu `help_agg` trong
    // care.getDashboard trả rỗng, buồng lái sẽ TRÔNG NHƯ lớp không có việc gì —
    // đúng kiểu sai nguy hiểm nhất của hệ này, vì nó im.
    const dashboard = await gvcn().getDashboard();
    const flag = dashboard.priorityFlags.find((f) => f.studentId === TEST_STUDENT);
    expect(flag).toBeDefined();
    // Sửa 01/08/2026: `detail.helpRequested` (một cờ boolean) nay là
    // `detail.openHelpRequests` — mảng ID của đúng những lời đang treo, để nút "Cô đã gặp
    // em rồi" đóng đúng tập đó thay vì đóng-hết. Mệnh đề của bài này không đổi: cô PHẢI
    // thấy tín hiệu của em này, không được im.
    expect(flag!.detail.openHelpRequests.length).toBeGreaterThanOrEqual(1);
  });

  it("cờ mang TÍN HIỆU chứ không mang LỜI EM KỂ — nội dung không đi theo cờ ra buồng lái", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // DESIGN-GUIDELINES §9: "Cờ chỉ ghi loại tín hiệu, không sao chép nội dung tâm sự."
    // Cô đọc được lời nhắn ở màn hình chi tiết (test phía trên), nhưng payload của cờ
    // thì không được mang nó theo — đó là hai đường khác nhau, và chỉ đường thứ nhất
    // mới nằm trong phạm vi đã hứa.
    const dashboard = await gvcn().getDashboard();
    expect(JSON.stringify(dashboard)).not.toContain(LOI_NHAN);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// [QĐ-2] ĐƯỜNG GHI — bấm là tới cô NGAY, và màn hình phải nói đúng nó có tới hay không.
//
// Ba mệnh đề, chạy trên Postgres thật dưới đúng phiên của Minh (đường ghi này CHỈ chính
// em gọi được — `getMyStudentId` chặn mọi vai khác).
// ───────────────────────────────────────────────────────────────────────────
describe("cần gặp thầy cô · đường GHI (QĐ-2)", () => {
  beforeAll(async () => {
    if (!ready) return;
    await clearMinhToday();
  });

  afterAll(async () => {
    if (!ready) return;
    await clearMinhToday();
  });

  it("§9 idempotent: bấm gửi HAI lần trong ngày vẫn đúng MỘT dòng, và cả hai lần đều vào sổ", async ({
    skip,
  }) => {
    if (!ready) return skip();
    await clearMinhToday();

    const lan1 = await minh().requestHelp({ topic: "lop", urgency: "today", note: "Lần một." });
    const lan2 = await minh().requestHelp({ topic: "nha", urgency: "urgent", note: "Lần hai." });

    expect(lan1.delivered).toBe(true);
    expect(lan2.delivered).toBe(true);
    expect(lan1.reason).toBeNull();

    const rows = await minhRowsToday();
    expect(rows).toHaveLength(1);
    // Lần sau ghi ĐÈ nội dung lần trước (đúng ngữ nghĩa "sửa lại lời mình vừa gửi"),
    // không xếp thêm một dòng thứ hai cho cùng một ngày.
    expect(rows[0]!.note).toBe("Lần hai.");
  });

  it("cô đã bấm “đã gặp em rồi” → lần gửi tiếp KHÔNG vào sổ, và hàm NÓI RA điều đó", async ({
    skip,
  }) => {
    if (!ready) return skip();
    await clearMinhToday();
    await minh().requestHelp({ topic: "hoc", urgency: "this_week", note: "Lời buổi sáng." });

    // Cô xử lý xong lời buổi sáng. Dựng trạng thái này bằng `asSystem` chứ KHÔNG gọi
    // `care.acknowledgeHelpRequest`: bài này khẳng định về đường GHI của em (checkin.ts),
    // và hình dạng đầu vào của nút bên buồng lái thuộc gói việc khác, đang đổi. Buộc bài
    // này vào đó là để một thay đổi hợp lệ ở màn của cô làm đỏ một bài về màn của em.
    // `handled_at is not null` là ĐÚNG điều kiện mà mệnh đề `where` của router nhìn vào.
    await asSystem((c) =>
      c.query(
        `update attendance.help_requests
            set handled_at = now(), handled_by = (select id from core.users where auth_uid = $2)
          where student_id = $1 and requested_on = current_date`,
        [FIXTURE.studentMinh, DEV.gvcn],
      ),
    );

    const lanBaChieu = await minh().requestHelp({
      topic: "nha",
      urgency: "urgent",
      note: "Chiều nay con lại có chuyện khác.",
    });

    // Trước 01/08/2026 lời gọi này trả `{ ok: true }` và màn hình hiện "Đã gửi cho cô
    // rồi!" — cho một lời không đi đâu hết. `where handled_at is null` là mệnh đề LỌC,
    // không phải điều kiện lỗi: lệnh chạy sạch, ghi 0 dòng, không ném gì.
    expect(lanBaChieu.delivered).toBe(false);
    expect(lanBaChieu.reason).toBe("da_xac_nhan_hom_nay");

    // Và nó KHÔNG được lặng lẽ đè lên lời cũ đã xử lý xong.
    const rows = await minhRowsToday();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.note).toBe("Lời buổi sáng.");
    expect(rows[0]!.handled_at).not.toBeNull();
  });

  it("nút trong màn check-in cũng ghi ngay, và không đè mất lời em đã viết", async ({ skip }) => {
    if (!ready) return skip();
    await clearMinhToday();
    await minh().requestHelp({ topic: "nha", urgency: "urgent", note: "Con muốn kể chuyện ở nhà." });

    // Đường thứ hai: em bật công tắc "Mình cần gặp thầy cô" ngay trong lượt check-in cảm
    // xúc. Lượt này KHÔNG mang chủ đề/lời nhắn nào, nên nó phải `do nothing` — đè bằng một
    // bản trống là XOÁ đúng câu em đã khó khăn lắm mới viết ra.
    await minh().submitMood({ mood: 2, wantsHelp: true });

    const rows = await minhRowsToday();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.note).toBe("Con muốn kể chuyện ở nhà.");
  });
});
