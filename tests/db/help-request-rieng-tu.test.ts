// tests/db/help-request-rieng-tu.test.ts — gói "rls-help-requests" (31/07/2026).
//
// Màn hình `/can-gap-thay-co` in cho học sinh đọc, ngay tại chỗ em gõ lời nhắn
// (`apps/hub/components/help-request-view.tsx:292`):
//
//     "Bạn cùng lớp · thầy cô khác · bố mẹ — KHÔNG nhìn thấy"
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

  it("TÂM LÝ CỤM đọc được — cùng phạm vi với quyền bấm «đã gặp em rồi» (0026)", async ({ skip }) => {
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
    expect(flag!.detail.helpRequested).toBe(true);
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
