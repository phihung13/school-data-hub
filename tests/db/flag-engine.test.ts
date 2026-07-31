// tests/db/flag-engine.test.ts
//
// Bộ quét cờ đêm (migration 0039 · tools/jobs/run-flag-engine.mjs) chạy trên
// Postgres THẬT, bằng đúng đường mà cron sẽ đi: gọi care.run_flag_engine().
//
// pgTAP (0039_flag_engine_test.sql) đã kiểm thuật toán ở tầng SQL trong một
// transaction rồi rollback. File này kiểm thứ pgTAP không chạm tới: hành vi khi
// engine chạy trên CƠ SỞ DỮ LIỆU ĐANG SỐNG, có sẵn dữ liệu của người khác, và
// COMMIT thật — tức đúng tình huống 01:00 sáng mỗi ngày.
//
// Bốn câu hỏi:
//   1. Buồng lái có đọc được dòng "Quét đêm qua HH:mm" không (§ chống hỏng im lặng)?
//   2. Chạy hai lần có sinh cờ đôi không (§9)?
//   3. Nguồn hết tươi thì rule đó có bị BỎ QUA và NÓI RA không, hay im lặng kết
//      luận "lớp ổn" (ADR-016)?
//   4. Nạp bù có mở hồ sơ can thiệp giả không?
//
// Dọn sạch sau khi chạy: mọi cờ/hồ sơ sinh ra trong lúc test bị xoá theo mốc thời
// gian chụp ở beforeAll, và ops.source_freshness được trả về đúng như lúc bắt đầu —
// database dev là tài sản chung, một bài test không được để lại rác cho bài sau.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, requireDb, FIXTURE } from "../helpers/db";

let ready = false;
/** Mốc thời gian bắt đầu — mọi dòng care.* sinh sau mốc này là rác của bài test. */
let t0 = "";

/** Hai em "dựng riêng cho bài test", không dùng chung với các file test khác. */
const HS_LIVE = "70000000-0000-0000-0000-0000000f0001";
const HS_BACKFILL = "70000000-0000-0000-0000-0000000f0002";

interface Metrics {
  mode: string;
  rules_evaluated: string[];
  rules_skipped: { rule_code: string; ly_do: string }[];
  degraded_sources: string[];
  flags_new: number;
  cases_new: number;
  escalations_new: number;
}

/** Gọi bộ quét đúng như cron gọi. Trả về metrics — cũng là thứ ghi vào ops.job_runs. */
function runEngine(mode: "live" | "backfill" = "live"): Promise<Metrics> {
  return asSystem(async (c) => {
    const r = await c.query<{ metrics: Metrics }>(
      "select care.run_flag_engine(current_date, $1) as metrics",
      [mode],
    );
    return r.rows[0]!.metrics;
  });
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    const now = await c.query<{ t: string }>("select now()::text as t");
    t0 = now.rows[0]!.t;

    // Em "có tín hiệu": 5 ngày mood xấu LIÊN TIẾP + một lời nhắn "cần gặp thầy cô"
    // còn bỏ ngỏ. Đúng hai loại tín hiệu mà GĐ1 có nguồn thật.
    await c.query(
      `insert into core.students (id, student_code, school_id, full_name)
       values ($1, 'VA-2026-09001', $3, 'Test Quét Cờ A'),
              ($2, 'VA-2026-09002', $3, 'Test Quét Cờ B')
       on conflict (id) do nothing`,
      [HS_LIVE, HS_BACKFILL, FIXTURE.schoolQ7],
    );
    await c.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       values ($1, $2, '2026-09-05')
       on conflict do nothing`,
      [HS_LIVE, FIXTURE.classA],
    );
    await c.query(
      `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
       select $1, current_date - g, 'in', 1, 'present', 'app' from generate_series(0, 4) g
       on conflict (student_id, occurred_on, kind) do update set mood = excluded.mood`,
      [HS_LIVE],
    );
    // Lời nhắn CÓ NỘI DUNG: dùng để chứng minh nội dung KHÔNG chảy sang cờ.
    await c.query(
      `insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
       values ($1, current_date, 'nha', 'today', 'Con buồn vì bố mẹ cãi nhau tối qua')
       on conflict (student_id, requested_on) do update set note = excluded.note`,
      [HS_LIVE],
    );
  });
});

afterAll(async () => {
  if (!ready || !t0) return;
  await asSystem(async (c) => {
    // Trả hạn tươi về đúng hiện trạng: bài test có đẩy nó lùi để giả cảnh nguồn chết.
    await c.query(
      `update ops.source_freshness set last_success_at = greatest(last_success_at, $1::timestamptz)
        where source = 'attendance'`,
      [t0],
    );
    // Cờ và hồ sơ sinh trong lúc test — kể cả của học sinh khác, vì engine quét cả trường.
    await c.query("delete from care.flags where created_at >= $1::timestamptz", [t0]);
    await c.query(
      "delete from care.care_cases where created_at >= $1::timestamptz and student_id in ($2, $3)",
      [t0, HS_LIVE, HS_BACKFILL],
    );
    await c.query("delete from attendance.help_requests where student_id in ($1, $2)", [
      HS_LIVE,
      HS_BACKFILL,
    ]);
    await c.query("delete from attendance.checkins where student_id in ($1, $2)", [
      HS_LIVE,
      HS_BACKFILL,
    ]);
    await c.query("delete from core.enrollments where student_id in ($1, $2)", [
      HS_LIVE,
      HS_BACKFILL,
    ]);
    await c.query("delete from core.students where id in ($1, $2)", [HS_LIVE, HS_BACKFILL]);
  });
});

describe("Bộ quét cờ đêm — care.run_flag_engine", () => {
  it("quét live: sinh cờ đúng loại và để lại dòng 'quét đêm qua' cho buồng lái", async ({
    skip,
  }) => {
    if (!ready) return skip();

    const m = await runEngine("live");

    expect(m.mode).toBe("live");
    expect(m.rules_evaluated).toContain("E_MOOD");
    expect(m.rules_evaluated).toContain("E_URGENT");

    const flags = await asSystem(async (c) => {
      const r = await c.query<{ rule_code: string; origin: string }>(
        "select rule_code, origin from care.flags where student_id = $1 and as_of_date = current_date",
        [HS_LIVE],
      );
      return r.rows;
    });
    expect(flags.map((f) => f.rule_code).sort()).toEqual(["E_MOOD", "E_URGENT"]);
    expect(flags.every((f) => f.origin === "live")).toBe(true);

    // Chính câu truy vấn mà care.getDashboard dùng để in "Quét đêm qua: HH:mm".
    // Buồng lái trống + KHÔNG có dòng này = hệ hỏng, không phải "lớp ổn".
    const lastScan = await asSystem(async (c) => {
      const r = await c.query<{ finished_at: string | null }>(
        `select max(finished_at)::text as finished_at
           from ops.job_runs where status = 'success' and job_name = 'flag_engine'`,
      );
      return r.rows[0]!.finished_at;
    });
    expect(lastScan).not.toBeNull();
  });

  it("§9 — chạy lại trong đêm là no-op: không cờ đôi, không hồ sơ thứ hai", async ({ skip }) => {
    if (!ready) return skip();

    const before = await asSystem(async (c) => {
      const r = await c.query<{ flags: string; cases: string }>(
        `select (select count(*)::text from care.flags where as_of_date = current_date) as flags,
                (select count(*)::text from care.care_cases) as cases`,
      );
      return { flags: Number(r.rows[0]!.flags), cases: Number(r.rows[0]!.cases) };
    });

    const m = await runEngine("live");
    expect(m.flags_new).toBe(0);
    expect(m.cases_new).toBe(0);

    const after = await asSystem(async (c) => {
      const r = await c.query<{ flags: string; cases: string }>(
        `select (select count(*)::text from care.flags where as_of_date = current_date) as flags,
                (select count(*)::text from care.care_cases) as cases`,
      );
      return { flags: Number(r.rows[0]!.flags), cases: Number(r.rows[0]!.cases) };
    });

    expect(after).toEqual(before);
  });

  it("cờ E gọn: lời em viết KHÔNG chảy sang care.flags", async ({ skip }) => {
    if (!ready) return skip();

    const detail = await asSystem(async (c) => {
      const r = await c.query<{ detail: Record<string, unknown> }>(
        "select detail from care.flags where student_id = $1 and rule_code = 'E_URGENT'",
        [HS_LIVE],
      );
      return r.rows[0]!.detail;
    });

    // Cờ chỉ nói "có tín hiệu khẩn". Nội dung nằm ở attendance.help_requests với
    // phạm vi đọc riêng (0037) và không được nhân bản sang đây.
    expect(JSON.stringify(detail)).not.toContain("bố mẹ");
    expect(Object.keys(detail)).toEqual(["help_requested"]);
  });

  it("nguồn hết tươi: BỎ QUA rule và nói ra, không kết luận 'lớp ổn' (ADR-016)", async ({
    skip,
  }) => {
    if (!ready) return skip();

    // Giả cảnh connector điểm danh chết 3 ngày (max_age = 26 giờ).
    await asSystem((c) =>
      c.query(
        "update ops.source_freshness set last_success_at = now() - interval '3 days' where source = 'attendance'",
      ),
    );

    try {
      const m = await runEngine("live");

      expect(m.degraded_sources).toContain("attendance");
      expect(m.rules_evaluated).not.toContain("E_MOOD");
      expect(m.rules_skipped).toContainEqual({ rule_code: "E_MOOD", ly_do: "nguon_het_tuoi" });

      // Bỏ một rule KHÔNG được làm hỏng cả lần chạy: job vẫn 'success', vì phần
      // còn lại của trường vẫn phải được quét.
      const status = await asSystem(async (c) => {
        const r = await c.query<{ status: string; degraded: string[] }>(
          `select status, degraded_sources as degraded from ops.job_runs
            where job_name = 'flag_engine' order by id desc limit 1`,
        );
        return r.rows[0]!;
      });
      expect(status.status).toBe("success");
      expect(status.degraded).toContain("attendance");
    } finally {
      await asSystem((c) =>
        c.query("update ops.source_freshness set last_success_at = now() where source = 'attendance'"),
      );
    }
  });

  it("nạp bù: ghi lịch sử nhưng KHÔNG mở hồ sơ can thiệp, KHÔNG leo thang", async ({ skip }) => {
    if (!ready) return skip();

    // Tín hiệu chỉ xuất hiện SAU lần quét live ở trên — đúng cảnh promote dữ liệu cũ.
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency)
         values ($1, current_date, 'hoc', 'this_week')
         on conflict (student_id, requested_on) do nothing`,
        [HS_BACKFILL],
      ),
    );

    const m = await runEngine("backfill");
    expect(m.cases_new).toBe(0);
    expect(m.escalations_new).toBe(0);

    const row = await asSystem(async (c) => {
      const r = await c.query<{ origin: string; cases: string }>(
        `select f.origin,
                (select count(*)::text from care.care_cases where student_id = $1) as cases
           from care.flags f where f.student_id = $1 and f.rule_code = 'E_URGENT'`,
        [HS_BACKFILL],
      );
      return r.rows[0]!;
    });

    expect(row.origin).toBe("backfill");
    // Không có luật này thì một lần promote 3 tháng dữ liệu cũ mở vài trăm hồ sơ
    // can thiệp giả trong một đêm (ADR-016).
    expect(Number(row.cases)).toBe(0);
  });
});
