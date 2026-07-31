// tests/db/bao-cao-rieng-tu.test.ts
//
// Khoá lời hứa in trên màn hình của đứa trẻ.
//
// Màn "Mình cần gặp thầy cô" (help-request-view.tsx) nói thẳng với em, bằng chữ, rằng
// "Bạn cùng lớp · thầy cô khác · bố mẹ — KHÔNG nhìn thấy". Báo cáo Trưởng thành thì
// PHỤ HUYNH đọc: `report.getMyLatestReport` tự suy học sinh cho cả tài khoản học sinh
// lẫn tài khoản cha mẹ. Trước bản 31/07/2026, `buildGrowthReport` đếm
// `attendance.help_requests` rồi đẩy vào mục Tỏa sáng câu "Chủ động bấm «cần gặp thầy
// cô» khi có chuyện khó" — tức là báo cho bố mẹ đúng cái việc đã hứa giấu. Với em bấm
// nút vì chuyện Ở NHÀ (topic = 'nha') thì đó không phải lỗi văn phong, đó là rủi ro
// an toàn: người mà em đang tránh lại là người đọc báo cáo.
//
// Và ngay cả khi mục đó chỉ hiện cho thầy cô, nó vẫn nói sai: câu "thầy cô đã trò
// chuyện cùng em" được suy từ count(*), không hề đọc `handled_at`. Một yêu cầu chưa ai
// chạm tới (handled_at = NULL) vẫn được báo là đã xử lý xong.
//
// Test này dựng đúng cảnh nguy hiểm nhất — một yêu cầu CHƯA XỬ LÝ, chủ đề "chuyện ở
// nhà", nằm trong tuần đang xem — rồi đăng nhập bằng tài khoản PHỤ HUYNH thật và soi
// toàn bộ payload. Chạy trên Postgres thật, qua đúng đường RLS mà router thật đi.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { requireDb, asSystem, DEV, FIXTURE } from "../helpers/db";
import { reportRouter } from "@/server/routers/report";
import type { TrpcContext } from "@/server/trpc";
import { resetRateLimits } from "@/lib/rate-limit";
import { mondayOf, toLocalIsoDate } from "@/lib/date";

let ready = false;

function ctxFor(authUid: string): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

/**
 * Chuỗi mồi. Nếu bất kỳ đường nào — kể cả một cột `note` tưởng như không ai in ra —
 * chảy từ bảng help_requests sang payload báo cáo, chuỗi này sẽ xuất hiện và test đỏ.
 */
const CANARY = "CANARY-BI-MAT-CUA-EM-KHONG-DUOC-RA-KHOI-PHONG";

/**
 * Dấu vết bị cấm, viết thường không dấu phân biệt. Gồm cả câu chữ của mục Glow cũ:
 * xoá dòng code là chưa đủ, phải chặn cả việc ai đó viết lại bằng lời khác nhưng cùng
 * ý "em đã bấm nút cầu cứu".
 */
const FORBIDDEN = [
  CANARY.toLowerCase(),
  "cần gặp thầy cô",
  "cầu cứu",
  "dũng cảm",
  "trò chuyện",
  "help_request",
  "helprequest",
  "chuyện khó",
];

/** Thứ Hai của tuần mà `buildGrowthReport` đang dùng cho "báo cáo mới nhất". */
const weekStart = toLocalIsoDate(mondayOf(new Date()));

/** Có sẵn bản ghi ở ngày đó không — để trả CSDL về đúng như trước khi test chạy. */
let hadRowBefore = false;

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;
  resetRateLimits();

  await asSystem(async (client) => {
    const { rows } = await client.query(
      "select 1 from attendance.help_requests where student_id = $1 and requested_on = $2",
      [FIXTURE.studentMinh, weekStart],
    );
    hadRowBefore = rows.length > 0;
    // `handled_at` để NGUYÊN null: đây chính là cảnh mà báo cáo cũ nói dối.
    await client.query(
      `insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
       values ($1, $2, 'nha', 'urgent', $3)
       on conflict (student_id, requested_on) do update
         set topic = excluded.topic, urgency = excluded.urgency,
             note = excluded.note, handled_at = null, handled_by = null`,
      [FIXTURE.studentMinh, weekStart, CANARY],
    );
  });
});

afterAll(async () => {
  if (!ready || hadRowBefore) return;
  await asSystem((client) =>
    client.query("delete from attendance.help_requests where student_id = $1 and requested_on = $2", [
      FIXTURE.studentMinh,
      weekStart,
    ]),
  );
});

/** Không assert trên từng field lẻ: soi cả payload đã serialize, kín mọi ngóc ngách. */
function expectNoTraceOfHelpRequest(payload: unknown) {
  const text = JSON.stringify(payload).toLowerCase();
  for (const needle of FORBIDDEN) {
    expect(text, `payload báo cáo chứa dấu vết bị cấm: «${needle}»`).not.toContain(needle);
  }
}

describe("Báo cáo Trưởng thành không tố việc em bấm «cần gặp thầy cô»", () => {
  it("dữ liệu nền đúng cảnh nguy hiểm: yêu cầu CHƯA xử lý, chủ đề chuyện ở nhà", async ({ skip }) => {
    if (!ready) return skip();
    // Nếu tiền đề này hỏng thì mọi khẳng định bên dưới thành rỗng nghĩa — kiểm trước.
    const row = await asSystem(async (client) => {
      const { rows } = await client.query<{ topic: string; handled_at: string | null }>(
        "select topic, handled_at from attendance.help_requests where student_id = $1 and requested_on = $2",
        [FIXTURE.studentMinh, weekStart],
      );
      return rows[0];
    });
    expect(row).toBeDefined();
    expect(row?.topic).toBe("nha");
    expect(row?.handled_at).toBeNull();
  });

  it("PHỤ HUYNH mở báo cáo: không một dấu vết nào của help_requests", async ({ skip }) => {
    if (!ready) return skip();
    const caller = reportRouter.createCaller(ctxFor(DEV.guardian));
    const result = await caller.getMyLatestReport();

    // Đúng là đang xem báo cáo của con mình — không phải test rơi vào học sinh khác
    // rồi "sạch" một cách vô nghĩa.
    expect(result.studentId).toBe(FIXTURE.studentMinh);
    expect(result.weekStart).toBe(weekStart);
    expectNoTraceOfHelpRequest(result);
  });

  it("HỌC SINH mở báo cáo của chính mình: cũng không có, vì báo cáo này chia sẻ được", async ({ skip }) => {
    if (!ready) return skip();
    const caller = reportRouter.createCaller(ctxFor(DEV.student));
    const result = await caller.getMyLatestReport();
    expect(result.studentId).toBe(FIXTURE.studentMinh);
    expectNoTraceOfHelpRequest(result);
  });

  it("«Các tuần trước» đi qua cùng một hàm dựng nên cũng phải sạch", async ({ skip }) => {
    if (!ready) return skip();
    const caller = reportRouter.createCaller(ctxFor(DEV.guardian));
    const result = await caller.getReportForWeek({ weekStart });
    expect(result.studentId).toBe(FIXTURE.studentMinh);
    expectNoTraceOfHelpRequest(result);
  });

  it("không khẳng định «thầy cô đã trò chuyện» khi handled_at còn NULL", async ({ skip }) => {
    if (!ready) return skip();
    const caller = reportRouter.createCaller(ctxFor(DEV.guardian));
    const { report } = await caller.getMyLatestReport();

    // Chưa ai chạm tới em (handled_at = NULL, đã kiểm ở ca đầu). Báo cáo không được
    // nói bất cứ điều gì hàm ý người lớn đã xử lý xong.
    const said = [...report.glow, ...report.grow]
      .map((i) => `${i.title} ${i.detail}`.toLowerCase())
      .join(" | ");
    expect(said).not.toContain("đã trò chuyện");
    expect(said).not.toContain("đã gặp");
    expect(said).not.toContain("đã xử lý");
  });

  it("mục Tỏa sáng chỉ sinh từ điểm danh — thừa một mục là có nguồn dữ liệu lạ lọt vào", async ({ skip }) => {
    if (!ready) return skip();
    // Khoá theo CẤU TRÚC, không theo câu chữ: đếm lại từ chính bảng checkins rồi so.
    // Ai gắn thêm một nguồn khác (help_requests, ghi chú tư vấn, cờ care...) vào mục
    // Tỏa sáng sẽ làm số này lệch, dù họ đặt tên mục là gì.
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4);
    const stats = await asSystem(async (client) => {
      const { rows } = await client.query<{ checkin_days: number; happy_days: number }>(
        `select count(*) filter (where kind = 'in')::int as checkin_days,
                count(*) filter (where mood = 4)::int as happy_days
           from attendance.checkins
          where student_id = $1 and occurred_on between $2 and $3`,
        [FIXTURE.studentMinh, weekStart, toLocalIsoDate(weekEnd)],
      );
      return rows[0] ?? { checkin_days: 0, happy_days: 0 };
    });

    const expected = (stats.checkin_days >= 5 ? 1 : 0) + (stats.happy_days >= 3 ? 1 : 0);
    const caller = reportRouter.createCaller(ctxFor(DEV.guardian));
    const { report } = await caller.getMyLatestReport();
    expect(report.glow.length).toBe(expected);
  });

  it("gỡ mục đó không làm hỏng báo cáo: phần còn lại vẫn ra dữ liệu thật", async ({ skip }) => {
    if (!ready) return skip();
    const caller = reportRouter.createCaller(ctxFor(DEV.guardian));
    const { report } = await caller.getMyLatestReport();
    expect(report.studentName.length).toBeGreaterThan(0);
    expect(report.weekLabel).toContain(weekStart);
    expect(report.streakDays).toBeGreaterThanOrEqual(0);
  });
});
