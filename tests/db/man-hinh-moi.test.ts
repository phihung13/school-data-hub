// tests/db/man-hinh-moi.test.ts
//
// Khoá lại phần máy chủ của HAI màn còn thiếu (gói "man-hinh-con-thieu-gvcn-hs"):
//
//   1. `care.getStudentDetail` — hồ sơ MỘT em cho GVCN. Đây là procedure đầu tiên của
//      router nhận `studentId` do client gửi rồi trả về dữ liệu chăm sóc của đúng em đó,
//      nên nó cũng là bề mặt tấn công mới nhất: đổi một tham số trong request là thử
//      đọc hồ sơ của em lớp khác. Bài kiểm chính của file này là câu trả lời phải là
//      FORBIDDEN ở CẢ tầng API lẫn tầng DB.
//   2. `checkin.getMyHelpRequests` — em tự xem trạng thái lời mình đã gửi. Trước đây mọi
//      đường đọc `attendance.help_requests` đều nằm sau `homeroomProcedure`, nên chính
//      người gửi là người duy nhất không xem được.
//
// Ba nhóm câu hỏi:
//   · PHÂN QUYỀN — GVCN lớp khác, học sinh, tâm lý cụm chạm được gì?
//   · PHẠM VI DỮ LIỆU — đường mới có trả ra nhiều hơn lời đã hứa không? Cụ thể:
//     getMyHelpRequests KHÔNG được trả lại nội dung tâm sự (topic/urgency/note).
//   · SỰ THẬT — im lặng không được trình bày thành kết luận: ngày không có check-in
//     KHÔNG xuất hiện trong mảng `checkins`, và `acknowledged=false` chỉ nói "chưa ai
//     bấm xác nhận".
//
// Cả hai đường đều là QUERY (không mutation) nên không có gì để kiểm §9 ở đây — bài
// idempotency của các mutation liên quan (acknowledgeHelpRequest, logIntervention) đã
// nằm ở gvcn-screens.test.ts và ghi-chu-tu-van.test.ts.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { careRouter } from "@/server/routers/care";
import { checkinRouter } from "@/server/routers/checkin";
import type { TrpcContext } from "@/server/trpc";
import {
  daysBetween,
  formatDate,
  formatDateTime,
  weekdayIndex,
} from "@/components/gvcn/student-detail-view";
import { dayWord } from "@/components/help-request-view";

let ready = false;

/** Học sinh riêng của bài này — không mượn Minh để khỏi giẫm lên dữ liệu seed. */
const TEST_STUDENT = "71000000-0000-0000-0000-0000000000cc";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const gvcn = () => careRouter.createCaller(ctxFor(DEV.gvcn)); // Cô Lan — GVCN 6A1
const gvcn2 = () => careRouter.createCaller(ctxFor(DEV.gvcn2)); // Cô Hạnh — GVCN 6A2
const counselor = () => careRouter.createCaller(ctxFor(DEV.counselor)); // Cô Mai — tâm lý cụm
const studentCare = () => careRouter.createCaller(ctxFor(DEV.student));
const studentCheckin = () => checkinRouter.createCaller(ctxFor(DEV.student));
const guardianCheckin = () => checkinRouter.createCaller(ctxFor(DEV.guardian));

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
       values ($1, 'VA-2026-99003', $2, 'Em Thử Nghiệm (man-hinh-moi.test)')`,
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
  // checkins / help_requests / care_cases / approvals đều ON DELETE CASCADE theo học sinh.
  await asSystem(async (c) => {
    await c.query("delete from core.students where id = $1", [TEST_STUDENT]);
    // CHỈ dòng của HÔM NAY — đúng bằng thứ bài này tạo ra qua `requestHelp`. Xoá cả
    // lịch sử của Minh là dọn hộ dữ liệu của người khác: một test làm sạch quá tay thì
    // lần chạy sau nó phá bài của file khác, và không ai biết vì sao.
    await c.query(
      "delete from attendance.help_requests where student_id = $1 and requested_on = current_date",
      [FIXTURE.studentMinh],
    );
  });
});

beforeEach(async () => {
  if (!ready) return;
  await asSystem(async (c) => {
    await c.query("delete from attendance.checkins where student_id = $1", [TEST_STUDENT]);
    await c.query("delete from attendance.help_requests where student_id = $1", [TEST_STUDENT]);
    await c.query("delete from care.care_cases where student_id = $1", [TEST_STUDENT]);
    await c.query("delete from report.growth_report_approvals where student_id = $1", [TEST_STUDENT]);
    await c.query(
      "delete from attendance.help_requests where student_id = $1 and requested_on = current_date",
      [FIXTURE.studentMinh],
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("màn 5 · hồ sơ một học sinh (care.getStudentDetail)", () => {
  it("GVCN mở được hồ sơ em lớp mình, kèm mã học sinh và mã lớp thật", async ({ skip }) => {
    if (!ready) return skip();
    const d = await gvcn().getStudentDetail({ studentId: TEST_STUDENT });
    expect(d.student.studentCode).toBe("VA-2026-99003");
    expect(d.className).toBe("6A1");
    expect(d.classId).toBe(FIXTURE.classA);
    expect(d.window.days).toBe(14); // mặc định của contract
  });

  it("cửa sổ ngày do người dùng chọn, và khoảng trả về khớp đúng số ngày đã hỏi", async ({ skip }) => {
    if (!ready) return skip();
    const d = await gvcn().getStudentDetail({ studentId: TEST_STUDENT, days: 30 });
    expect(d.window.days).toBe(30);
    expect(d.window.toDate).toBe(await today());
    const { rows } = await asSystem((c) =>
      c.query<{ d: string }>("select (current_date - 29)::text as d"),
    );
    expect(d.window.fromDate).toBe(rows[0]!.d);
  });

  it("ngày KHÔNG có check-in không xuất hiện trong mảng — im lặng không thành một dòng dữ liệu", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Đây là ca dễ sai nhất của màn này: trả sẵn 14 hàng, 13 hàng mang status=null, rồi
    // màn hình vẽ chúng như 13 sự thật đã ghi nhận. Một hàng CÓ MẶT trong mảng trông
    // như một điều đã xảy ra.
    const day = await today();
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1, $2::date, 'in', 4, 'present', 'app')`,
        [TEST_STUDENT, day],
      ),
    );

    const d = await gvcn().getStudentDetail({ studentId: TEST_STUDENT });
    expect(d.checkins).toHaveLength(1);
    expect(d.checkins[0]!.occurredOn).toBe(day);
    expect(d.checkins[0]!.status).toBe("present");
    expect(d.checkins[0]!.source).toBe("app");
    // Dòng do EM tự bấm ⇒ có giờ thật, dạng HH:MM (không phải chuỗi timestamp thô).
    expect(d.checkins[0]!.checkedInAt).toMatch(/^\d{2}:\d{2}$/);
    // Cột tâm trạng đã rời khỏi hợp đồng của màn GVCN (ADR-026) — kiểm bằng hình dạng.
    expect(Object.keys(d.checkins[0]!)).not.toContain("mood");
  });

  it("hồ sơ chăm sóc ĐANG MỞ vẫn hiện dù mở từ trước cửa sổ ngày", async ({ skip }) => {
    if (!ready) return skip();
    // Hồ sơ mở tháng trước mà chưa đóng là thứ cô phải thấy đầu tiên, không phải thứ
    // biến mất vì lịch sử đã trôi quá 14 ngày.
    await asSystem((c) =>
      c.query(
        `insert into care.care_cases (student_id, owner_id, opened_at)
         values ($1, $2, now() - interval '60 days')`,
        [TEST_STUDENT, "40000000-0000-0000-0000-000000000001"],
      ),
    );
    const d = await gvcn().getStudentDetail({ studentId: TEST_STUDENT });
    expect(d.careCases).toHaveLength(1);
    expect(d.careCases[0]!.status).toBe("open");
  });

  it("nhật ký can thiệp chỉ của RIÊNG em, và trạng thái duyệt báo cáo hiện đúng", async ({ skip }) => {
    if (!ready) return skip();
    const day = await today();
    await gvcn().logIntervention({
      caseId: `${TEST_STUDENT}:${day}`,
      action: "Đã trò chuyện với học sinh",
      note: "Em nói đang lo bài kiểm tra",
      clientMutationId: "44444444-4444-4444-4444-444444444444",
    });
    const week = await asSystem(async (c) => {
      const { rows } = await c.query<{ d: string }>(
        "select date_trunc('week', current_date)::date::text as d",
      );
      return rows[0]!.d;
    });
    await gvcn().approveReport({ studentId: TEST_STUDENT, weekStart: week, decision: "approved" });

    const d = await gvcn().getStudentDetail({ studentId: TEST_STUDENT });
    expect(d.interventions).toHaveLength(1);
    expect(d.interventions[0]!.studentId).toBe(TEST_STUDENT);
    expect(d.interventions[0]!.action).toBe("Đã trò chuyện với học sinh");
    expect(d.reportApprovals).toHaveLength(1);
    expect(d.reportApprovals[0]!.status).toBe("approved");
    expect(d.reportApprovals[0]!.weekStart).toBe(week);
  });

  it("chưa có gì thì trả về mảng RỖNG — không dòng 'pending' dựng sẵn", async ({ skip }) => {
    if (!ready) return skip();
    const d = await gvcn().getStudentDetail({ studentId: TEST_STUDENT });
    expect(d.checkins).toEqual([]);
    expect(d.helpRequests).toEqual([]);
    expect(d.careCases).toEqual([]);
    expect(d.interventions).toEqual([]);
    expect(d.reportApprovals).toEqual([]);
  });

  it("lời em viết trong “cần gặp thầy cô” tới được đúng GVCN của em — lời hứa in trên màn hình", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Màn /can-gap-thay-co in lên mặt em: "Ai đọc được lời con? — cô chủ nhiệm ✓".
    // Trước gói này `note` được ghi vào CSDL và KHÔNG màn nào đọc nó, kể cả của cô.
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
         values ($1, current_date, 'hoc', 'today', 'Con thấy lo khi phải thuyết trình.')`,
        [TEST_STUDENT],
      ),
    );
    const d = await gvcn().getStudentDetail({ studentId: TEST_STUDENT });
    expect(d.helpRequests).toHaveLength(1);
    expect(d.helpRequests[0]!.note).toBe("Con thấy lo khi phải thuyết trình.");
    expect(d.helpRequests[0]!.topic).toBe("hoc");
    expect(d.helpRequests[0]!.handledAt).toBeNull(); // chưa ai bấm "đã gặp em rồi"
  });

  it("GVCN lớp khác KHÔNG mở được hồ sơ em lớp 6A1 — kể cả khi tự khai classId của mình", async ({
    skip,
  }) => {
    if (!ready) return skip();
    expect(await codeOfRejection(() => gvcn2().getStudentDetail({ studentId: TEST_STUDENT }))).toBe(
      "FORBIDDEN",
    );
    expect(
      await codeOfRejection(() =>
        gvcn2().getStudentDetail({ studentId: TEST_STUDENT, classId: FIXTURE.classA }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOfRejection(() =>
        gvcn2().getStudentDetail({ studentId: TEST_STUDENT, classId: FIXTURE.classB }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("học sinh và tâm lý cụm không mở được màn này (procedure dành cho GVCN)", async ({ skip }) => {
    if (!ready) return skip();
    expect(await codeOfRejection(() => studentCare().getStudentDetail({ studentId: TEST_STUDENT }))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOfRejection(() => counselor().getStudentDetail({ studentId: TEST_STUDENT }))).toBe(
      "FORBIDDEN",
    );
  });

  it("TẦNG DB · GVCN lớp khác chạy thẳng câu SQL của màn này cũng ra 0 dòng", async ({ skip }) => {
    if (!ready) return skip();
    // Tầng API đã trả FORBIDDEN, nhưng hàng rào thứ hai phải đứng độc lập: RLS
    // (core.can_see_care / can_see_student) không được dựa vào việc router hỏi đúng.
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, note)
         values ($1, current_date, 'lời riêng của em')`,
        [TEST_STUDENT],
      ),
    );
    const seen = await asUser(DEV.gvcn2, async (c) => {
      const res = await c.query("select id from attendance.help_requests where student_id = $1", [
        TEST_STUDENT,
      ]);
      return res.rowCount ?? 0;
    });
    expect(seen).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("màn 6 · em tự xem trạng thái lời đã gửi (checkin.getMyHelpRequests)", () => {
  it("chưa gửi lần nào thì trả mảng rỗng — không bịa một dòng nào", async ({ skip }) => {
    if (!ready) return skip();
    const res = await studentCheckin().getMyHelpRequests();
    expect(res.requests).toEqual([]);
  });

  it("gửi xong là em thấy được trạng thái của chính mình, kể cả sau khi tải lại trang", async ({
    skip,
  }) => {
    if (!ready) return skip();
    await studentCheckin().requestHelp({ topic: "lop", urgency: "today", note: "Con muốn nói chuyện." });

    // "Tải lại trang" = một lời gọi mới, không dùng lại state nào của lần trước.
    const res = await studentCheckin().getMyHelpRequests();
    expect(res.requests).toHaveLength(1);
    expect(res.requests[0]!.requestedOn).toBe(await today());
    expect(res.requests[0]!.acknowledged).toBe(false);
    expect(res.requests[0]!.acknowledgedOn).toBeNull();
    expect(res.requests[0]!.requestedAtTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it("CHỈ trạng thái — không trả lại chủ đề, mức độ hay lời em đã viết", async ({ skip }) => {
    if (!ready) return skip();
    await studentCheckin().requestHelp({
      topic: "nha",
      urgency: "urgent",
      note: "Chuyện ở nhà của con.",
    });
    const row = (await studentCheckin().getMyHelpRequests()).requests[0]!;
    expect(Object.keys(row).sort()).toEqual(
      ["acknowledged", "acknowledgedAtTime", "acknowledgedOn", "requestedAtTime", "requestedOn"].sort(),
    );
    expect(JSON.stringify(row)).not.toContain("Chuyện ở nhà của con.");
  });

  it("cô bấm 'đã gặp em rồi' thì em thấy dấu xác nhận — vòng phản hồi khép lại", async ({ skip }) => {
    if (!ready) return skip();
    await studentCheckin().requestHelp({ topic: "hoc", urgency: "this_week" });
    const day = await today();

    // Gửi ID THẬT của dòng, không gửi ngày suy từ màn hình — xem `OpenHelpRequest`.
    const pending = await gvcn().getStudentDetail({ studentId: FIXTURE.studentMinh });
    const open = pending.helpRequests.find((h) => h.handledAt === null);
    expect(open, "phải có đúng một yêu cầu đang treo để bấm").toBeDefined();
    await gvcn().acknowledgeHelpRequest({
      studentId: FIXTURE.studentMinh,
      helpRequestIds: [open!.helpRequestId],
    });

    const row = (await studentCheckin().getMyHelpRequests()).requests[0]!;
    expect(row.acknowledged).toBe(true);
    expect(row.acknowledgedOn).toBe(day);
    expect(row.acknowledgedAtTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it("em CHỈ thấy dòng của chính mình — không thấy của bạn cùng lớp", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, note)
         values ($1, current_date, 'lời của bạn khác')`,
        [TEST_STUDENT],
      ),
    );
    const res = await studentCheckin().getMyHelpRequests();
    expect(res.requests).toEqual([]);
  });

  it("tài khoản không phải học sinh (phụ huynh) gọi vào thì bị chặn, không trả dòng của con", async ({
    skip,
  }) => {
    if (!ready) return skip();
    expect(await codeOfRejection(() => guardianCheckin().getMyHelpRequests())).toBe("FORBIDDEN");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Hàm thuần của hai màn. Nằm chung file (không cần DB) vì chúng thuộc CÙNG một gói
// việc và cùng một lỗi gốc: định dạng ngày/giờ suy ra từ máy người dùng thay vì tính
// thẳng. Cả ba ca dưới đây đều là lỗi ĐÃ BẮT ĐƯỢC khi mở màn bằng trình duyệt thật,
// không phải giả định.
// ───────────────────────────────────────────────────────────────────────────
describe("ngày giờ trên màn: không nhánh nào phụ thuộc trình duyệt", () => {
  it("timestamptz của Postgres đọc được mà không đi qua new Date()", () => {
    // "+07" thiếu phút ⇒ KHÔNG hợp lệ theo ECMAScript. V8 vẫn đọc được (nên lỗi không
    // lộ ra trên Chrome máy dev), Safari trả Invalid Date — mà GVCN cầm iPhone là bối
    // cảnh dùng thật của màn này.
    expect(formatDateTime("2026-07-29 00:07:17.466773+07")).toBe("29/07 00:07");
    expect(formatDateTime("2026-07-29T00:07:17+07:00")).toBe("29/07 00:07");
    // Không đọc được thì trả nguyên văn — thà thô còn hơn hiện "Invalid Date".
    expect(formatDateTime("hỏng")).toBe("hỏng");
  });

  it("ngày hiện dạng dd/MM, không mượn ICU của máy người dùng", () => {
    // toLocaleDateString("vi-VN", { day, month }) trả "18-07" (gạch nối) — đo được
    // trên chính trình duyệt đang chạy Hub.
    expect(formatDate("2026-07-18")).toBe("18/07");
  });

  it("thứ trong tuần tính theo lịch Việt Nam (thứ Hai = 0) và không lệch múi giờ", () => {
    expect(weekdayIndex("2026-07-31")).toBe(4); // thứ Sáu
    expect(weekdayIndex("2026-08-01")).toBe(5); // thứ Bảy
    expect(weekdayIndex("2026-08-02")).toBe(6); // Chủ nhật
    expect(weekdayIndex("2026-08-03")).toBe(0); // thứ Hai
  });

  it("lưới ngày chứa ĐỦ mọi ngày trong khoảng, kể cả ngày không có dữ liệu", () => {
    expect(daysBetween("2026-07-29", "2026-07-31")).toEqual([
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ]);
    expect(daysBetween("2026-07-31", "2026-07-31")).toEqual(["2026-07-31"]);
    // Khoảng ngược (dữ liệu hỏng) không được biến thành vòng lặp vô hạn trong trình
    // duyệt của giáo viên.
    expect(daysBetween("2026-07-31", "2026-07-29")).toEqual([]);
  });

  it("dải trạng thái của em nói ngày bằng lời, không bằng dấu thời gian máy", () => {
    expect(dayWord("2026-07-31", "2026-07-31")).toBe("hôm nay");
    expect(dayWord("2026-07-30", "2026-07-31")).toBe("hôm qua");
    // Qua mốc tháng: "01/08" hôm nay ⇒ hôm qua là 31/07, không phải 00/08.
    expect(dayWord("2026-07-31", "2026-08-01")).toBe("hôm qua");
    expect(dayWord("2026-07-18", "2026-07-31")).toBe("18/07");
  });
});
