// tests/db/duyet-bao-cao.test.ts
//
// Gói "cong-duyet-bao-cao" — khoá lại MỘT câu hỏi: cô đang ký cái gì?
//
// `gvcn-screens.test.ts` đã khoá phần QUYẾT ĐỊNH của sổ duyệt (idempotency §9, nắn về
// thứ Hai, phân quyền hai tầng). File này khoá phần NỘI DUNG: `care.listReportApprovals`
// phải trả về đúng bản mà phụ huynh sẽ đọc, không phải hai con số vận hành. Trước
// 31/07/2026 procedure chỉ trả `checkinDays`/`happyDays`, nên màn duyệt mời cô đặt chữ
// ký lên một văn bản cô chưa từng nhìn thấy.
//
// Bốn nhóm khẳng định:
//   1. XEM TRƯỚC CÓ THẬT và khớp với chính dữ liệu thô đã gieo (không phải chuỗi rỗng
//      cho qua schema).
//   2. GIỌNG ĐÚNG — bản xem trước là giọng "Glow & Grow" của phụ huynh; không một từ
//      vận hành nào (cờ, ngưỡng, leo thang, GVCN) lọt vào (DESIGN-GUIDELINES §8).
//   3. KHÔNG TỐ CÁO — "cần gặp thầy cô" (attendance.help_requests) là tín hiệu chăm sóc,
//      không được biến thành một dòng khoe với phụ huynh (mệnh lệnh 4 CLAUDE.md).
//   4. IM LẶNG KHÔNG PHẢI KẾT LUẬN — em không có dữ liệu nào vẫn còn nguyên trong danh
//      sách, kèm bản xem trước RỖNG chứ không phải một lời khen bịa ra.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { buildReportPreview, careRouter } from "@/server/routers/care";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Hai em riêng của bài này — không mượn Minh/Bình để khỏi giẫm lên dữ liệu seed. */
const STUDENT_FULL = "71000000-0000-0000-0000-0000000000c1"; // tuần đầy đủ dữ liệu
const STUDENT_SILENT = "71000000-0000-0000-0000-0000000000c2"; // tuần không có gì

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const gvcn = () => careRouter.createCaller(ctxFor(DEV.gvcn)); // Cô Lan — GVCN 6A1
const gvcn2 = () => careRouter.createCaller(ctxFor(DEV.gvcn2)); // Cô Hạnh — GVCN 6A2

async function codeOfRejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "KHÔNG NÉM LỖI";
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `LỖI KHÁC: ${String(err)}`;
  }
}

/** Thứ Hai của tuần hiện tại, tính bằng chính Postgres để không lệch múi giờ với server. */
async function thisMonday(): Promise<string> {
  const { rows } = await asSystem((c) =>
    c.query<{ d: string }>("select date_trunc('week', current_date)::date::text as d"),
  );
  return rows[0]!.d;
}

/**
 * Gieo check-in cho `offsets` ngày (tính từ thứ Hai của tuần), `happyCount` ngày đầu mang
 * mood 4 ("Vui"). Gieo bằng asSystem: đây là bước DỰNG dữ liệu, không phải khẳng định.
 */
async function seedWeek(studentId: string, week: string, days: number, happyCount: number) {
  await asSystem(async (c) => {
    for (let i = 0; i < days; i += 1) {
      await c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source, mood)
         values ($1, $2::date + $3::int, 'in', 'present', 'app', $4)
         on conflict (student_id, occurred_on, kind) do update
            set status = excluded.status, mood = excluded.mood`,
        [studentId, week, i, i < happyCount ? 4 : 3],
      );
    }
  });
}

async function rowOf(studentId: string, week: string) {
  const list = await gvcn().listReportApprovals({ weekStart: week });
  return list.rows.find((r) => r.studentId === studentId);
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    for (const [id, code, name] of [
      [STUDENT_FULL, "VA-2026-99011", "Em Đủ Dữ Liệu (duyet-bao-cao.test)"],
      [STUDENT_SILENT, "VA-2026-99012", "Em Chưa Có Gì (duyet-bao-cao.test)"],
    ] as const) {
      await c.query("delete from core.students where id = $1", [id]);
      await c.query(
        `insert into core.students (id, student_code, school_id, full_name) values ($1, $2, $3, $4)`,
        [id, code, FIXTURE.schoolQ7, name],
      );
      await c.query(
        `insert into core.enrollments (student_id, class_id, valid_from)
         values ($1, $2, current_date - 60)`,
        [id, FIXTURE.classA],
      );
    }
  });
});

afterAll(async () => {
  if (!ready) return;
  // checkins / help_requests / approvals đều ON DELETE CASCADE theo học sinh.
  await asSystem(async (c) => {
    await c.query("delete from core.students where id = any($1::uuid[])", [
      [STUDENT_FULL, STUDENT_SILENT],
    ]);
  });
});

beforeEach(async () => {
  if (!ready) return;
  await asSystem(async (c) => {
    await c.query("delete from attendance.checkins where student_id = any($1::uuid[])", [
      [STUDENT_FULL, STUDENT_SILENT],
    ]);
    await c.query("delete from attendance.help_requests where student_id = any($1::uuid[])", [
      [STUDENT_FULL, STUDENT_SILENT],
    ]);
    await c.query("delete from report.growth_report_approvals where student_id = any($1::uuid[])", [
      [STUDENT_FULL, STUDENT_SILENT],
    ]);
    // Sổ vết ADR-031 (0054). Dọn tường minh chứ không dựa vào cascade của bảng trên: sổ
    // vết CỐ Ý không treo vào dòng quyết định (một quyết định bị xoá không được xoá theo
    // lời giải thích vì sao nó từng đổi), nên nó sống sót qua lệnh delete phía trên.
    await c.query("delete from report.report_decisions where student_id = any($1::uuid[])", [
      [STUDENT_FULL, STUDENT_SILENT],
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("luật dựng bản xem trước (thuần, không chạm DB)", () => {
  it("đủ 5 ngày + ≥3 ngày “Vui” → hai lời khen và headline “Một tuần rực rỡ!”", () => {
    const p = buildReportPreview({ checkinDays: 5, happyDays: 4, streakDays: 12 });
    expect(p.headline).toBe("Một tuần rực rỡ!");
    expect(p.glow).toHaveLength(2);
    expect(p.glow[0]!.detail).toContain("chuỗi 12 ngày");
    expect(p.glow[1]!.detail).toContain("4/5 ngày");
    expect(p.grow).toHaveLength(0);
  });

  it("thiếu ngày đi học → đúng MỘT gợi ý, không liệt kê nặng nề", () => {
    const p = buildReportPreview({ checkinDays: 3, happyDays: 3, streakDays: 3 });
    expect(p.headline).toBe("Một tuần ổn định");
    expect(p.grow).toHaveLength(1);
    expect(p.grow[0]!.title).toBe("Đi học đều hơn");
  });

  it("không có dữ liệu nào → không bịa ra lời khen", () => {
    const p = buildReportPreview({ checkinDays: 0, happyDays: 0, streakDays: 0 });
    expect(p.glow).toEqual([]);
    expect(p.grow).toHaveLength(1); // "đi học đều hơn" — sự thật duy nhất suy được
    // 0 là một PHÉP ĐO thật (em có 0 ngày vui), nên bản xem trước ở đây là đầy đủ.
    expect(p.glowIncomplete).toBe(false);
  });

  it("happyDays = null KHÁC happyDays = 0 — một cái là chưa vui, một cái là không được biết", () => {
    // Đây là ca mà `(happyDays ?? 0) >= 3` sẽ làm hỏng trong im lặng: cả hai cho ra cùng
    // một bản xem trước, và người ký không có cách nào phân biệt.
    const dowhile = buildReportPreview({ checkinDays: 5, happyDays: 0, streakDays: 12 });
    const unknown = buildReportPreview({ checkinDays: 5, happyDays: null, streakDays: 12 });
    expect(dowhile.glow).toHaveLength(1);
    expect(unknown.glow).toHaveLength(1);
    // Cùng số mục Glow, nhưng KHÁC nhau ở lời khai — và lời khai mới là thứ cứu người ký.
    expect(dowhile.glowIncomplete).toBe(false);
    expect(unknown.glowIncomplete).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("cô ký cái gì · listReportApprovals trả về bản phụ huynh sẽ đọc", () => {
  it("bản xem trước khớp ĐÚNG dữ liệu thô của tuần đó", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    await seedWeek(STUDENT_FULL, week, 5, 4);

    const row = await rowOf(STUDENT_FULL, week);
    expect(row).toBeDefined();
    expect(row!.checkinDays).toBe(5);
    // LẬT 21/08/2026 (ADR-035, 0059): cô đọc lại được số ngày "Vui" — seedWeek gieo đúng
    // 4 ngày Vui, nên phải ra ĐÚNG 4, không phải "một số nào đó". Bản ADR-026 của câu
    // này đòi `null`; nghĩa của `null` ("không được phép biết") vẫn sống cho vai khác.
    expect(row!.happyDays).toBe(4);

    // Không so với hằng số viết tay: bản xem trước phải là HỆ QUẢ của chính hai con số
    // đứng cạnh nó. Lệch nhau ở đây nghĩa là màn hình hiện một đằng, phụ huynh đọc một nẻo.
    expect(row!.preview).toEqual(
      buildReportPreview({
        checkinDays: row!.checkinDays,
        happyDays: row!.happyDays,
        streakDays: row!.preview.streakDays,
      }),
    );
    // LẬT 21/08/2026 (ADR-035): bản của cô nay dựng đủ CẢ HAI mục Glow — điểm danh và
    // tâm trạng — nên trùng với bản phụ huynh đọc, headline lên nấc đầy đủ, và không còn
    // chỗ hụt nào để `glowIncomplete` phải khai. Bản ADR-026 của ba câu này kiểm chiều
    // "cô thiếu một mục và màn hình nói ra chỗ hụt".
    expect(row!.preview.headline).toBe("Một tuần rực rỡ!");
    expect(row!.preview.glow).toHaveLength(2);
    expect(row!.preview.glowIncomplete).toBe(false);
    // Ở đây TỪNG có `expect(row!.preview.streakDays).toBeGreaterThan(0)`. Bỏ 01/08/2026:
    // câu đó xanh hay đỏ phụ thuộc HÔM NAY LÀ THỨ MẤY. seedWeek() gieo 5 ngày Hai→Sáu,
    // còn chuỗi chỉ tính khi có check-in ĐÚNG NGÀY HÔM NAY — nên chạy trong tuần thì
    // xanh, chạy thứ Bảy hoặc Chủ nhật thì đỏ, và không dòng nào trong bài nói lên điều
    // đó. Bắt gặp thật: 31/07 (thứ Sáu) xanh, 01/08 (thứ Bảy) đỏ, không ai sửa gì.
    // Một bài test đổi kết quả theo lịch là bài test không kiểm được gì — nó chỉ dạy
    // người đọc thói quen chạy lại cho tới lúc xanh. Khẳng định về chuỗi nằm nguyên vẹn
    // ở bài ngay dưới, nơi dữ liệu được gieo lùi từ current_date nên số ra ĐÚNG BẰNG 9.
  });

  it("chuỗi ngày đi học là số THẬT, không phải số ngày trong tuần đang duyệt", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    await seedWeek(STUDENT_FULL, week, 5, 4);
    // Gieo liền mạch 9 ngày tính lùi từ hôm nay: chuỗi là số THẬT (vắt qua tuần trước),
    // không bao giờ bị chặn ở 5 vì tuần báo cáo chỉ có 5 ngày học.
    await asSystem(async (c) => {
      for (let back = 0; back < 9; back += 1) {
        await c.query(
          `insert into attendance.checkins (student_id, occurred_on, kind, status, source, mood)
           values ($1, current_date - $2::int, 'in', 'present', 'app', 4)
           on conflict (student_id, occurred_on, kind) do nothing`,
          [STUDENT_FULL, back],
        );
      }
    });

    const row = await rowOf(STUDENT_FULL, week);
    expect(row!.preview.streakDays).toBe(9);
    expect(row!.preview.glow.some((g) => g.detail.includes("chuỗi 9 ngày"))).toBe(true);
  });

  it("GIỌNG · bản xem trước không chứa một từ vận hành nào", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    await seedWeek(STUDENT_FULL, week, 5, 4);

    const row = await rowOf(STUDENT_FULL, week);
    const text = JSON.stringify(row!.preview).toLowerCase();
    // DESIGN-GUIDELINES §8 — hai chế độ ngôn ngữ, bất di bất dịch. Khối này là bản sao
    // nguyên văn thứ phụ huynh đọc, nên nó nằm ở vế "Glow & Grow", không phải vế buồng lái.
    for (const banned of ["cờ", "ngưỡng", "leo thang", "định mức", "gvcn", "can thiệp", "hồ sơ chăm sóc"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("KHÔNG TỐ CÁO · “cần gặp thầy cô” không biến thành một dòng gửi phụ huynh", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    await seedWeek(STUDENT_FULL, week, 5, 4);
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on)
         values ($1, $2::date)
         on conflict do nothing`,
        [STUDENT_FULL, week],
      ),
    );

    const row = await rowOf(STUDENT_FULL, week);
    const text = JSON.stringify(row!.preview).toLowerCase();
    // Mệnh lệnh 4: dữ liệu cảm xúc không lọt ra ngoài phạm vi đã hứa với đứa trẻ. Em bấm
    // nút để GẶP THẦY CÔ, không để việc đó được kể lại cho bố mẹ dưới dạng lời khen.
    // Hai câu này là LÕI của bài — ADR-035 mở quyền đọc cho cô, KHÔNG đổi một chữ nào
    // ở đây: tín hiệu "cần gặp" vẫn tuyệt đối không được xuất hiện trong bản gửi bố mẹ.
    expect(text).not.toContain("cần gặp");
    expect(text).not.toContain("dũng cảm");
    // LẬT 21/08/2026 (ADR-035): hai lời khen — điểm danh VÀ tâm trạng (cô đọc được nguồn
    // trở lại) — nhưng vẫn không mảy may một dòng nào từ help_requests, như hai câu trên canh.
    expect(row!.preview.glow).toHaveLength(2);
    expect(row!.preview.glowIncomplete).toBe(false);
  });

  it("IM LẶNG · em chưa có dữ liệu vẫn có mặt, kèm bản xem trước trống thật", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();

    const row = await rowOf(STUDENT_SILENT, week);
    expect(row).toBeDefined();
    expect(row!.status).toBe("pending");
    expect(row!.checkinDays).toBe(0);
    expect(row!.preview.glow).toEqual([]);
    expect(row!.preview.streakDays).toBe(0);
    // Không có dòng nào trong sổ duyệt: im lặng không phải một quyết định.
    const { rows } = await asSystem((c) =>
      c.query<{ n: string }>(
        "select count(*)::text as n from report.growth_report_approvals where student_id = $1",
        [STUDENT_SILENT],
      ),
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("MỌI em trong lớp đều có bản xem trước — không em nào bị bỏ trắng", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const list = await gvcn().listReportApprovals({ weekStart: week });
    expect(list.rows.length).toBeGreaterThanOrEqual(3); // Minh + hai em thử nghiệm
    for (const r of list.rows) {
      expect(r.preview).toBeDefined();
      expect(typeof r.preview.headline).toBe("string");
      expect(r.preview.headline.length).toBeGreaterThan(0);
    }
  });

  it("GVCN lớp khác không đọc được bản xem trước của lớp 6A1", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    expect(
      await codeOfRejection(() => gvcn2().listReportApprovals({ classId: FIXTURE.classA, weekStart: week })),
    ).toBe("FORBIDDEN");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// decideReports — duyệt/trả lại HÀNG LOẠT (06/08/2026, chủ đầu tư yêu cầu trực tiếp)
//
// Vì sao chạy trên Postgres thật chứ không mock: ba ràng buộc của thủ tục này sống ở tầng
// dữ liệu, không ở tầng TypeScript —
//   · RLS `growth_report_approvals_write/_revise` (0032) chỉ cho GVCN của em ghi, và chỉ
//     ký được tên mình;
//   · khoá duy nhất `(student_id, week_start)` là chân thứ nhất của §9;
//   · mệnh đề `status = 'pending'` trong câu upsert là chân thứ hai — nó vừa là cái chặn
//     ghi đè lên chữ ký người khác, vừa là thứ làm lượt gửi lại thành no-op.
// Mock bất kỳ cái nào trong ba cái đó là tự khai đã kiểm một thứ chưa từng chạy.
// ───────────────────────────────────────────────────────────────────────────

/**
 * `core.users.id` của Cô Lan. `DEV.gvcn` là mã ĐĂNG NHẬP (`auth`), còn sổ ký bằng
 * `core.users.id` — hai không gian mã khác nhau, và Rev D điều 3 cấm nghiệp vụ đoán qua
 * lại giữa chúng. Hỏi CSDL thay vì chép tay một hằng số.
 */
async function coLanId(): Promise<string> {
  return asUser(DEV.gvcn, async (c) => {
    const { rows } = await c.query<{ id: string }>("select core.current_user_id()::text as id");
    return rows[0]!.id;
  });
}

/**
 * Đếm TOÀN BỘ sổ vết của hai em thử nghiệm (0054, ADR-031).
 *
 * `beforeEach` dọn sạch nên hiệu số là của chính lời gọi vừa rồi. Đếm theo `student_id`
 * chứ không đếm cả bảng: file này chạy song song với các bài khác trong cùng CSDL.
 */
async function demSoVet(): Promise<number> {
  const { rows } = await asSystem((c) =>
    c.query<{ n: string }>(
      "select count(*)::text as n from report.report_decisions where student_id = any($1::uuid[])",
      [[STUDENT_FULL, STUDENT_SILENT]],
    ),
  );
  return Number(rows[0]!.n);
}

/** Dòng sổ vết mới nhất của một em trong một tuần — bốn dữ kiện ADR-031 đòi. */
async function vetGanNhat(studentId: string, week: string) {
  const { rows } = await asSystem((c) =>
    c.query<{
      from_status: string;
      to_status: string;
      reason: string | null;
      decided_by: string;
      decided_at: string;
    }>(
      `select from_status, to_status, reason,
              decided_by::text as decided_by, decided_at::text as decided_at
         from report.report_decisions
        where student_id = $1 and week_start = $2::date
        order by decided_at desc, id desc
        limit 1`,
      [studentId, week],
    ),
  );
  return rows[0];
}

/** Đọc thẳng sổ duyệt của một em — không qua router, để khẳng định về DỮ LIỆU chứ không về output. */
async function soDuyet(studentId: string, week: string) {
  const { rows } = await asSystem((c) =>
    c.query<{ status: string; note: string | null; reviewed_at: string; reviewer_id: string }>(
      `select status, note, reviewed_at::text as reviewed_at, reviewer_id::text as reviewer_id
         from report.growth_report_approvals
        where student_id = $1 and week_start = $2::date`,
      [studentId, week],
    ),
  );
  return rows[0];
}

describe("chọn nhiều em · care.decideReports", () => {
  it("duyệt hai em trong MỘT lời gọi — cả hai vào sổ, cùng một chữ ký", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();

    const res = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL, STUDENT_SILENT],
      weekStart: week,
      decision: "approved",
    });

    expect(res).toEqual({ updated: 2, skipped: 0 });

    // Chữ ký phải là của chính người bấm — policy 0032 cưỡng chế
    // `reviewer_id = core.current_user_id()`, và một lượt hàng loạt không được phép là
    // chỗ duy nhất cái đó lỏng ra.
    const coLan = await coLanId();
    for (const id of [STUDENT_FULL, STUDENT_SILENT]) {
      const dong = await soDuyet(id, week);
      expect(dong?.status).toBe("approved");
      expect(dong?.reviewer_id).toBe(coLan);
    }
  });

  it("trả lại hàng loạt kèm lý do — lý do vào sổ của TỪNG em", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const lyDo = "Tuần này cả hai em nghỉ ốm, báo cáo chưa phản ánh đúng";

    const res = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL, STUDENT_SILENT],
      weekStart: week,
      decision: "rejected",
      note: lyDo,
    });

    expect(res).toEqual({ updated: 2, skipped: 0 });
    expect((await soDuyet(STUDENT_FULL, week))?.note).toBe(lyDo);
    expect((await soDuyet(STUDENT_SILENT, week))?.note).toBe(lyDo);
  });

  it("TRẢ LẠI THIẾU LÝ DO bị chặn — không em nào vào sổ", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();

    // Ép kiểu là CỐ Ý: hợp đồng không cho gọi thiếu `note`, và ca này diễn lại đúng cảnh
    // một client dựng tay gửi thẳng payload thiếu lý do. Cả ba tầng chặn cùng biến mất
    // thì lời gọi này thành công và ca đỏ.
    expect(
      await codeOfRejection(() =>
        gvcn().decideReports({
          classId: FIXTURE.classA,
          studentIds: [STUDENT_FULL],
          weekStart: week,
          decision: "rejected",
        } as never),
      ),
    ).toBe("BAD_REQUEST");

    expect(await soDuyet(STUDENT_FULL, week)).toBeUndefined();
  });

  it("lý do chỉ có khoảng trắng cũng bị chặn", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();

    expect(
      await codeOfRejection(() =>
        gvcn().decideReports({
          classId: FIXTURE.classA,
          studentIds: [STUDENT_FULL],
          weekStart: week,
          decision: "rejected",
          note: "    ",
        } as never),
      ),
    ).toBe("BAD_REQUEST");
    expect(await soDuyet(STUDENT_FULL, week)).toBeUndefined();
  });

  it("duyệt KHÔNG cần lý do — mở đường chứ không dựng thêm rào", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const res = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "approved",
    });
    expect(res.updated).toBe(1);
  });

  it("KHÔNG bật cờ thì KHÔNG đè — mặc định vẫn là hàng rào (ADR-031)", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "approved",
    });
    // Đo BẰNG HIỆU SỐ, không bằng con số tuyệt đối: đường mặc định có ghi sổ vết hay
    // không là quyết định của `0054` (file của gói khác). Ca này chỉ hỏi đúng câu của
    // mình — "lượt bị từ chối có sinh thêm dòng nào không" — nên nó không đỏ vì một lý do
    // KHÁC với thứ nó định kiểm.
    const truoc = await demSoVet();

    // Có lý do, có mọi thứ — chỉ thiếu cờ. Phải là no-op. Đây là ca giữ cho ADR-031 không
    // lặng lẽ biến thành "ghi đè mặc định": một cái cờ mà quên truyền cũng vẫn đè được
    // thì nó không phải cờ, nó là trang trí.
    const res = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "rejected",
      note: "Có lý do nhưng không bật cờ — không được đè",
    });

    expect(res).toEqual({ updated: 0, skipped: 1 });
    expect((await soDuyet(STUDENT_FULL, week))?.status).toBe("approved");
    expect(await demSoVet()).toBe(truoc);
  });

  it("BẬT CỜ → đè được, và sổ vết ghi đủ bốn dữ kiện", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const lyDo = "Ký nhầm: tuần này em nghỉ ốm, bản cũ kể sai";

    await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "approved",
    });

    const res = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "rejected",
      note: lyDo,
      ghiDeQuyetDinhDaCo: true,
    });

    expect(res).toEqual({ updated: 1, skipped: 0 });
    expect((await soDuyet(STUDENT_FULL, week))?.status).toBe("rejected");

    // Bốn dữ kiện của ADR-031: AI đổi · LÚC NÀO · TỪ ĐÂU SANG ĐÂU · VÌ SAO. Thiếu bất kỳ
    // cái nào thì đây là ghi đè có vết giả — thứ ADR-031 nói thẳng là tệ hơn không ghi đè.
    const vet = await vetGanNhat(STUDENT_FULL, week);
    expect(vet).toBeDefined();
    expect(vet!.from_status).toBe("approved");
    expect(vet!.to_status).toBe("rejected");
    expect(vet!.reason).toBe(lyDo);
    expect(vet!.decided_by).toBe(await coLanId());
    expect(vet!.decided_at).toBeTruthy();
  });

  it("đè sang “đã duyệt” cũng phải có lý do — không có ngoại lệ cho nhánh nhẹ", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "rejected",
      note: "Trả lại lần đầu",
    });
    const truoc = await demSoVet();

    // Đổi một chữ ký ĐÃ GỬI sang "đã duyệt" cũng là đổi. Miễn lý do cho nhánh này là mở
    // lại đúng cửa mà cả điều khoản sinh ra để đóng.
    expect(
      await codeOfRejection(() =>
        gvcn().decideReports({
          classId: FIXTURE.classA,
          studentIds: [STUDENT_FULL],
          weekStart: week,
          decision: "approved",
          ghiDeQuyetDinhDaCo: true,
        } as never),
      ),
    ).toBe("BAD_REQUEST");

    expect((await soDuyet(STUDENT_FULL, week))?.status).toBe("rejected");
    expect(await demSoVet()).toBe(truoc);
  });

  it("§9 · đường GHI ĐÈ gọi hai lần cùng mã cũng là MỘT lần", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const mutationId = "55555555-5555-5555-5555-555555555555";

    await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "approved",
    });
    const truoc = await demSoVet();

    const payload = {
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "rejected" as const,
      note: "Đổi lại vì bản cũ kể sai",
      ghiDeQuyetDinhDaCo: true,
      clientMutationId: mutationId,
    };

    const first = await gvcn().decideReports(payload);
    expect(first).toEqual({ updated: 1, skipped: 0 });
    const vetLan1 = await vetGanNhat(STUDENT_FULL, week);
    expect(await demSoVet()).toBe(truoc + 1);

    // Ở đường mặc định, `status = 'pending'` là thứ biến lượt gửi lại thành no-op. Đường
    // này KHÔNG còn điều kiện trạng thái nào — nên nếu `clientMutationId` không được lưu
    // thì mỗi lần retry mạng sinh thêm một dòng sổ, và bản kiểm sau đọc ra "cô đổi quyết
    // định của em hai lần", một sự kiện chưa từng xảy ra. Đây là lý do 0054 phải có cột.
    const second = await gvcn().decideReports(payload);
    expect(second.updated).toBe(0);
    expect(await demSoVet()).toBe(truoc + 1);
    expect((await vetGanNhat(STUDENT_FULL, week))!.decided_at).toBe(vetLan1!.decided_at);
  });

  it("em đã có người quyết trước → skipped, chữ ký cũ KHÔNG bị ghi đè", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const lyDo = "Đã trả lại từ trước, không được lật ngược trong im lặng";

    await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "rejected",
      note: lyDo,
    });

    // "Chọn tất cả" trên một màn đã cũ vài phút sẽ ôm theo em này. Một cú bấm "Duyệt gửi
    // phụ huynh" lật ngược quyết định của người khác mà không ai thấy là đúng thứ mệnh đề
    // `status = 'pending'` sinh ra để chặn — cùng ngữ nghĩa với `decide_late_checkins`
    // chỉ chạm dòng còn `queued_late`.
    const res = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL, STUDENT_SILENT],
      weekStart: week,
      decision: "approved",
    });

    expect(res).toEqual({ updated: 1, skipped: 1 });
    const dong = await soDuyet(STUDENT_FULL, week);
    expect(dong?.status).toBe("rejected");
    expect(dong?.note).toBe(lyDo);
  });

  it("GVCN LỚP KHÁC bị chặn — cả khi khai lớp lẫn khi giấu lớp đi", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();

    // Khai thẳng lớp 6A1: cổng vai trả lời rõ ràng.
    expect(
      await codeOfRejection(() =>
        gvcn2().decideReports({
          classId: FIXTURE.classA,
          studentIds: [STUDENT_FULL],
          weekStart: week,
          decision: "approved",
        }),
      ),
    ).toBe("FORBIDDEN");

    // Giấu `classId` đi thì cô Hạnh rơi về lớp 6A2 của chính mình, và em của 6A1 không
    // nằm trong sổ ghi danh lớp đó — không ghi được gì, và cũng KHÔNG lộ ra em đó có tồn
    // tại hay không. Đây là đường vòng mà một cổng chỉ kiểm `classId` sẽ để lọt.
    const vong = await gvcn2().decideReports({
      studentIds: [STUDENT_FULL],
      weekStart: week,
      decision: "approved",
    });
    expect(vong).toEqual({ updated: 0, skipped: 1 });
    expect(await soDuyet(STUDENT_FULL, week)).toBeUndefined();
  });

  it("§9 · GỌI HAI LẦN cùng clientMutationId là MỘT lần", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const mutationId = "44444444-4444-4444-4444-444444444444";

    const first = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL, STUDENT_SILENT],
      weekStart: week,
      decision: "approved",
      clientMutationId: mutationId,
    });
    expect(first).toEqual({ updated: 2, skipped: 0 });
    const kyThat = (await soDuyet(STUDENT_FULL, week))!.reviewed_at;

    // Retry mạng, hoặc cô bấm hai lần vì màn hình chưa kịp phản hồi. KHÔNG phải quyết định
    // thứ hai. Chống trùng ở đây KHÔNG đến từ `clientMutationId` (bảng 0032 chưa có cột
    // lưu nó) mà từ khoá `(student_id, week_start)` + mệnh đề `status = 'pending'` — nên
    // ca này đo đúng cái hàng rào đang thật sự đứng đó.
    const second = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL, STUDENT_SILENT],
      weekStart: week,
      decision: "approved",
      clientMutationId: mutationId,
    });
    expect(second).toEqual({ updated: 0, skipped: 2 });

    // Không sinh dòng thứ hai…
    const { rows } = await asSystem((c) =>
      c.query<{ n: string }>(
        "select count(*)::text as n from report.growth_report_approvals where student_id = any($1::uuid[]) and week_start = $2::date",
        [[STUDENT_FULL, STUDENT_SILENT], week],
      ),
    );
    expect(Number(rows[0]!.n)).toBe(2);
    // …và giữ đúng dấu thời gian của lần ký THẬT, không phải giờ của cú double-tap.
    expect((await soDuyet(STUDENT_FULL, week))!.reviewed_at).toBe(kyThat);
  });

  it("id gửi trùng trong cùng một lô không làm hỏng cả lô", async ({ skip }) => {
    if (!ready) return skip();
    const week = await thisMonday();

    // Postgres từ chối `on conflict do update` chạm cùng một dòng hai lần trong một câu
    // lệnh. Không lọc trùng ở tầng trên thì một client lỗi biến lượt duyệt cả lớp thành
    // lỗi 500 — và `skipped` sẽ dương một cách vô nghĩa.
    const res = await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL, STUDENT_FULL],
      weekStart: week,
      decision: "approved",
    });
    expect(res).toEqual({ updated: 1, skipped: 0 });
  });

  it("weekStart giữa tuần được nắn về thứ Hai — không mở một tuần thứ hai trong sổ", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const week = await thisMonday();
    const thu4 = await asSystem(async (c) => {
      const { rows } = await c.query<{ d: string }>("select ($1::date + 2)::text as d", [week]);
      return rows[0]!.d;
    });

    await gvcn().decideReports({
      classId: FIXTURE.classA,
      studentIds: [STUDENT_FULL],
      weekStart: thu4,
      decision: "approved",
    });

    // Ghi bằng ngày thứ Tư nhưng phải nằm ở dòng THỨ HAI: khoá duy nhất theo tuần chỉ
    // thật sự duy nhất khi mọi đường ghi nắn về cùng một ngày (ràng buộc monday_chk, 0032).
    expect((await soDuyet(STUDENT_FULL, week))?.status).toBe("approved");
  });
});
