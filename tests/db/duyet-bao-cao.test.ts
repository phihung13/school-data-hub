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
import { asSystem, requireDb, DEV, FIXTURE } from "../helpers/db";
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
 * mood 4 («Vui»). Gieo bằng asSystem: đây là bước DỰNG dữ liệu, không phải khẳng định.
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
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("luật dựng bản xem trước (thuần, không chạm DB)", () => {
  it("đủ 5 ngày + ≥3 ngày «Vui» → hai lời khen và headline «Một tuần rực rỡ!»", () => {
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
    expect(row!.preview.headline).toBe("Một tuần rực rỡ!");
    expect(row!.preview.glow).toHaveLength(2);
    expect(row!.preview.streakDays).toBeGreaterThan(0);
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

  it("KHÔNG TỐ CÁO · «cần gặp thầy cô» không biến thành một dòng gửi phụ huynh", async ({ skip }) => {
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
    expect(text).not.toContain("cần gặp");
    expect(text).not.toContain("dũng cảm");
    expect(row!.preview.glow).toHaveLength(2); // vẫn đúng hai lời khen từ điểm danh + tâm trạng
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
