// tests/db/job-schedule.test.ts
//
// Bài này kiểm ĐẦU VÀO THẬT của các job nền: `node tools/jobs/run-all.mjs`, chạy như
// Task Scheduler/cron sẽ chạy, trên Postgres thật. Không mock tiến trình con, không
// mock database — vì thứ hỏng ở gói này chưa bao giờ là logic, mà là "không ai gọi".
//
// Bối cảnh đo được trên hub_dev ngày 31/07/2026, trước khi có run-all.mjs:
//     select count(*) from ops.job_runs;  →  0
// run-retention.mjs đã tồn tại từ trước, thi hành lời hứa công khai "chi tiết cảm xúc
// quá 12 tháng bị xoá" (§3, mệnh lệnh 4, Luật 91/2025) — và chưa từng chạy một lần.
// Không màn hình nào, không truy vấn nào trong hệ thống nói ra điều đó.
//
// Ba câu hỏi bài test này trả lời, đúng thứ tự quan trọng:
//   1. Job HỎNG có nhìn thấy được không? (không thì một job chết trông y hệt job chưa tới lịch)
//   2. Chạy lại có hỏng gì không? (§9 — cắm lịch dày là chuyện bình thường)
//   3. "Chưa chạy lần nào" có bị đọc thành "ổn" không? (lỗi đã lặp 4 lần trong dự án này)
//
// pgTAP (0041_job_schedule_test.sql) kiểm tầng SQL. Bài này kiểm tầng TIẾN TRÌNH:
// mã thoát, khoá chống chạy chồng, và nhánh "ghi hộ" khi job con chết không kịp ghi sổ.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asSystem, requireDb } from "../helpers/db";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUN_ALL = resolve(REPO_ROOT, "tools", "jobs", "run-all.mjs");

/** Cùng số với LOCK_KEY trong run-all.mjs — đổi một bên là mất tác dụng chống chạy chồng. */
const LOCK_KEY = 4102026;

const JOB_THU = "thu_thieu_bo_chay";

let ready = false;
let mocJobRunId = "0";

type KetQua = { ma: number; out: string };

function chayRunAll(doiSo: string[]): Promise<KetQua> {
  return new Promise((xong) => {
    const con = spawn(process.execPath, [RUN_ALL, ...doiSo], {
      cwd: REPO_ROOT,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    con.stdout.on("data", (d) => (out += d));
    con.stderr.on("data", (d) => (out += d));
    con.on("error", (err) => xong({ ma: -1, out: `${out}\n${err.message}` }));
    con.on("close", (ma) => xong({ ma: ma === null ? -1 : ma, out }));
  });
}

async function sucKhoe(jobName: string) {
  return asSystem(async (c) => {
    const { rows } = await c.query<{
      state: string;
      needs_attention: boolean;
      last_status: string | null;
      last_findings: number;
    }>(
      `select state, needs_attention, last_status, last_findings
         from ops.v_job_health where job_name = $1`,
      [jobName],
    );
    return rows[0] ?? null;
  });
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;
  // Mốc dọn dẹp: bài test này CÓ ghi vào ops.job_runs (đó là điều nó kiểm). Ghi lại
  // mốc để afterAll trả sổ về đúng trạng thái trước khi chạy, không xoá nhầm lịch sử thật.
  mocJobRunId = await asSystem(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "select coalesce(max(id), 0)::text as id from ops.job_runs",
    );
    return rows[0]?.id ?? "0";
  });
});

afterAll(async () => {
  if (!ready) return;
  await asSystem(async (c) => {
    await c.query("delete from ops.job_runs where id > $1::bigint", [mocJobRunId]);
    await c.query("delete from ops.job_schedule where job_name = $1", [JOB_THU]);
  });
});

describe("lịch chạy job · sổ khai", () => {
  it("mọi job kiểu script đều có file bộ chạy THẬT nằm trong tools/jobs/", async ({ skip }) => {
    if (!ready) return skip();
    const rows = await asSystem(async (c) => {
      const r = await c.query<{ job_name: string; runner: string }>(
        "select job_name, runner from ops.job_schedule where kind = 'script' order by job_name",
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThan(0);
    // Đây là assertion chống lại kiểu hỏng mà cả gói việc này sinh ra để chữa: một
    // dòng lịch trỏ vào file không tồn tại thì mỗi giờ lại thêm một dòng 'failed', và
    // sau tuần thứ hai không còn ai đọc bảng sức khoẻ nữa. pgTAP không kiểm được điều
    // này (nó không nhìn thấy hệ thống tệp) — chỉ tầng test này kiểm được.
    for (const r of rows) {
      expect(
        existsSync(resolve(REPO_ROOT, "tools", "jobs", r.runner)),
        `job ${r.job_name} khai runner ${r.runner} nhưng file không tồn tại`,
      ).toBe(true);
    }
  });

  it("khai đúng những job ĐANG có bộ chạy, kể cả bộ quét cờ", async ({ skip }) => {
    if (!ready) return skip();
    const ten = await asSystem(async (c) => {
      const r = await c.query<{ job_name: string }>("select job_name from ops.job_schedule");
      return r.rows.map((x) => x.job_name);
    });
    expect(ten).toContain("emotion_retention");
    expect(ten).toContain("homeroom_drift");
    // Bài học 0011/ADR-016 là "khai ĐÚNG LÚC", không phải "đừng khai": care.run_flag_engine()
    // ra đời ở 0039 nên dòng này phải có mặt — thiếu nó thì bộ quét cờ lại rơi vào đúng
    // tình cảnh của run-retention.mjs: viết xong, không ai gọi.
    expect(ten).toContain("flag_engine");
  });

  it("chính bộ lịch cũng có một dòng — không thì 'máy chạy cron chết' là im lặng tuyệt đối", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const r = await asSystem(async (c) => {
      const q = await c.query<{ kind: string; expected_every: string }>(
        "select kind, expected_every::text as expected_every from ops.job_schedule where job_name = 'job_scheduler'",
      );
      return q.rows[0];
    });
    expect(r?.kind).toBe("batch");
    expect(r?.expected_every).toBeTruthy();
  });
});

describe("lịch chạy job · đầu vào duy nhất chạy được thật", () => {
  it("--list chạy được và in đủ lịch, không chạm dữ liệu", async ({ skip }) => {
    if (!ready) return skip();
    const truoc = await asSystem(async (c) => {
      const r = await c.query<{ n: string }>("select count(*)::text as n from ops.job_runs");
      return r.rows[0]?.n ?? "0";
    });

    const kq = await chayRunAll(["--list"]);
    expect(kq.ma).toBe(0);
    expect(kq.out).toContain("emotion_retention");
    expect(kq.out).toContain("homeroom_drift");

    const sau = await asSystem(async (c) => {
      const r = await c.query<{ n: string }>("select count(*)::text as n from ops.job_runs");
      return r.rows[0]?.n ?? "0";
    });
    expect(sau).toBe(truoc); // chỉ đọc thì không được để lại dấu vết nào
  });

  it("--dry-run nói sẽ chạy gì nhưng không gọi job con, không ghi sổ", async ({ skip }) => {
    if (!ready) return skip();
    const truoc = await asSystem(async (c) => {
      const r = await c.query<{ n: string }>("select count(*)::text as n from ops.job_runs");
      return r.rows[0]?.n ?? "0";
    });
    const kq = await chayRunAll(["--dry-run", "--force", "--only=homeroom_drift"]);
    expect(kq.ma).toBe(0);
    expect(kq.out).toContain("SẼ CHẠY");
    const sau = await asSystem(async (c) => {
      const r = await c.query<{ n: string }>("select count(*)::text as n from ops.job_runs");
      return r.rows[0]?.n ?? "0";
    });
    expect(sau).toBe(truoc);
  });

  it("gõ sai tên job thì DỪNG và kêu, không lặng lẽ chạy xong 0 việc rồi báo xanh", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const kq = await chayRunAll(["--only=job_khong_ton_tai"]);
    expect(kq.ma).toBe(1);
    expect(kq.out).toContain("job_khong_ton_tai");
  });
});

describe("lịch chạy job · chạy thật rồi chạy lại (§9)", () => {
  it("chạy job soi lệch GVCN: để lại dòng ops.job_runs và trạng thái đọc được", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const kq = await chayRunAll(["--only=homeroom_drift", "--force"]);
    expect(kq.ma).toBe(0);

    const sk = await sucKhoe("homeroom_drift");
    expect(sk?.last_status).toBe("success");
    // Không khẳng định "0 phát hiện": dev DB có thể đang lệch thật, và bài test
    // không được biến một phát hiện thật thành lỗi của chính nó.
    expect(typeof sk?.last_findings).toBe("number");
  });

  it("gọi lại lần hai KHÔNG hỏng gì và KHÔNG chạy lại job chưa tới lượt", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await chayRunAll(["--only=homeroom_drift"]);
    expect(kq.ma).toBe(0);
    expect(kq.out).toContain("chưa tới lượt");
  });

  it("một lượt quét đang chạy thì lượt thứ hai tự lùi, không chạy chồng", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await asSystem(async (c) => {
      // Khoá cấp transaction: giữ suốt callback rồi tự nhả khi commit — đúng cái
      // khoá mà run-all.mjs thử lấy. Không có nó thì hai lượt quét cùng xoá một tập
      // dữ liệu, và §9 chỉ còn trên giấy.
      await c.query("select pg_advisory_xact_lock($1::bigint)", [LOCK_KEY]);
      return chayRunAll(["--force"]);
    });
    expect(kq.ma).toBe(0); // lùi lượt KHÔNG phải lỗi — cắm lịch dày là chuyện bình thường
    expect(kq.out).toContain("Một lượt quét khác đang chạy");
  });
});

describe("lịch chạy job · job hỏng phải THẤY ĐƯỢC", () => {
  it("bộ chạy không tồn tại: thoát khác 0, ghi dòng failed, và nổi lên ở v_job_health", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Đây đúng là hình dạng lúc bộ quét cờ được khai lịch trước khi file của nó tồn tại.
    await asSystem((c) =>
      c.query(
        `insert into ops.job_schedule (job_name, label, kind, runner, expected_every)
         values ($1, 'Thử job thiếu bộ chạy', 'script', 'run-khong-co-that.mjs', interval '1 day')
         on conflict (job_name) do nothing`,
        [JOB_THU],
      ),
    );

    const kq = await chayRunAll([`--only=${JOB_THU}`, "--force"]);
    expect(kq.ma).toBe(1); // cron/Task Scheduler đọc đúng con số này để báo động
    expect(kq.out).toContain("THIẾU BỘ CHẠY");

    const sk = await sucKhoe(JOB_THU);
    expect(sk?.last_status).toBe("failed");
    expect(sk?.state).toBe("that_bai");
    expect(sk?.needs_attention).toBe(true);
  });

  it("bộ lịch tự ghi dòng thất bại cho CHÍNH NÓ khi có job hỏng", async ({ skip }) => {
    if (!ready) return skip();
    // Dòng job_scheduler là thứ trả lời câu "đêm qua máy quét có chạy không, kết quả gì".
    // Nó phải đỏ khi bên trong có job đỏ — nếu không thì buồng lái thấy "đã quét ✓"
    // trong khi việc quan trọng nhất của đêm đó đã hỏng.
    const sk = await sucKhoe("job_scheduler");
    expect(sk?.last_status).toBe("failed");
    expect(sk?.needs_attention).toBe(true);
  });

  it("--check thoát khác 0 khi có việc — đây là móc để giám sát báo động", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await chayRunAll(["--check"]);
    expect(kq.ma).toBe(1);
    expect(kq.out).toContain("CẦN CHÚ Ý");
  });

  it("mọi job trong lịch đều có state đọc được — không dòng nào rơi vào khoảng trống", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const rows = await asSystem(async (c) => {
      const r = await c.query<{ job_name: string; state: string }>(
        "select job_name, state from ops.v_job_health",
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThan(0);
    const hopLe = ["ok", "dang_chay", "chua_chay", "that_bai", "treo", "qua_han", "tat"];
    for (const r of rows) {
      expect(hopLe, `job ${r.job_name} có state lạ: ${r.state}`).toContain(r.state);
    }
  });
});
