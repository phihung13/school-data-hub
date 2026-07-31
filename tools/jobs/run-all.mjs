#!/usr/bin/env node
// tools/jobs/run-all.mjs
//
// ĐẦU VÀO DUY NHẤT cho mọi job nền. Task Scheduler của Windows hoặc cron chỉ cần
// biết một lệnh này; job nào chạy, bao lâu một lần, đọc từ ops.job_schedule (0041).
//
// Vì sao file này tồn tại: trước nó, run-retention.mjs — thứ thi hành lời hứa công
// khai "xoá chi tiết cảm xúc sau 12 tháng" — không được ai gọi. `select count(*) from
// ops.job_runs` trên hub_dev trả 0. Một job viết xong mà không có đường chạy thì
// không khác gì chưa viết, chỉ tệ hơn ở chỗ nhìn vào repo thấy như đã xong.
//
// Ba luật của file này, theo đúng thứ tự quan trọng:
//
//   1. JOB HỎNG PHẢI THẤY ĐƯỢC. Con chết trước khi kịp ghi sổ thì bố ghi hộ một dòng
//      'failed' vào ops.job_runs. Không có nhánh này, một job chết trông y hệt một
//      job chưa tới lịch — và buồng lái đọc im lặng thành tin tốt.
//   2. CHẠY LẠI KHÔNG HỎNG GÌ (§9). Khoá tư vấn chặn hai lượt chồng nhau; ops.job_due()
//      chặn job tháng chạy 30 lần/tháng; mọi job con vốn đã idempotent.
//   3. KHÔNG NHẬN LỆNH TỪ DATABASE. Bảng chỉ chứa TÊN FILE; tên đó phải khớp biểu
//      thức chính quy, phải nằm đúng trong thư mục này, và được truyền vào spawn dưới
//      dạng mảng đối số — không qua shell.
//
// Chạy:
//   DATABASE_URL=postgres://... node tools/jobs/run-all.mjs            # chạy job tới lượt
//   DATABASE_URL=postgres://... node tools/jobs/run-all.mjs --list     # xem lịch, không chạm gì
//   DATABASE_URL=postgres://... node tools/jobs/run-all.mjs --check    # chỉ soi sức khoẻ; ≠0 nếu có việc
//   DATABASE_URL=postgres://... node tools/jobs/run-all.mjs --dry-run  # nói sẽ chạy gì rồi thôi
//   DATABASE_URL=postgres://... node tools/jobs/run-all.mjs --only=emotion_retention --force
//
// Mã thoát: 0 = mọi thứ đã chạy xong tử tế · 1 = có job hỏng / thiếu bộ chạy / (với
// --check) có dòng cần chú ý. Task Scheduler và cron đọc đúng con số này để báo động.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// `pg` là dependency của @hub/core chứ không của gốc workspace, và ESM phân giải theo
// VỊ TRÍ FILE. Neo require vào package.json của @hub/core — cùng lý do đã ghi trong
// run-retention.mjs, giữ nguyên để hai job dùng đúng một bản `pg`.
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const HERE = dirname(fileURLToPath(import.meta.url)); // <repo>/tools/jobs
const REPO_ROOT = resolve(HERE, "..", "..");

// Khoá tư vấn cấp phiên: hai lượt quét chồng nhau là hai job cùng xoá một tập dữ liệu.
// Chọn advisory lock chứ không phải một cột `is_running` trong bảng vì khoá tự nhả khi
// tiến trình chết — một cột trong bảng thì kẹt vĩnh viễn, và cái kẹt đó im lặng.
const LOCK_KEY = 4102026; // cố định, không đổi: đổi số là mở đường cho hai lượt chồng nhau

const TEN_JOB_HOP_LE = /^[a-z][a-z0-9_]{1,62}$/;
const TEN_FILE_HOP_LE = /^run-[a-z0-9-]+\.mjs$/;

// ---------------------------------------------------------------------------
// Tham số dòng lệnh
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);

function co(co_gi) {
  return argv.includes(co_gi);
}
function lay(ten) {
  const found = argv.find((a) => a.startsWith(`${ten}=`));
  return found ? found.slice(ten.length + 1) : null;
}

if (co("--help") || co("-h")) {
  console.log(
    [
      "node tools/jobs/run-all.mjs [tuỳ chọn]",
      "",
      "  --list             In lịch chạy + sức khoẻ hiện tại rồi thoát (không chạm dữ liệu).",
      "  --check            Chỉ soi sức khoẻ. Thoát 1 nếu có dòng cần chú ý — dùng cho giám sát.",
      "  --dry-run          Nói sẽ chạy job nào rồi thôi. Không gọi job con, không ghi sổ.",
      "  --only=a,b         Chỉ xét các job này (vẫn tôn trọng ops.job_due trừ khi có --force).",
      "  --force            Bỏ qua kiểm tra 'đã tới lượt chưa'.",
      "  --timeout=phút     Hạn cho MỖI job con, mặc định 30. Quá hạn thì giết và ghi 'failed'.",
      "  --reap-age=giờ     Tuổi tối đa của một dòng 'running' trước khi bị coi là chết, mặc định 6.",
      "  --json             In thêm một dòng JSON tóm tắt ở cuối, cho máy đọc.",
      "",
      "Cần DATABASE_URL. Xem tools/jobs/README.md.",
    ].join("\n"),
  );
  process.exit(0);
}

const CHE_DO_LIST = co("--list");
const CHE_DO_CHECK = co("--check");
const DRY_RUN = co("--dry-run");
const FORCE = co("--force");
const JSON_OUT = co("--json");

const onlyRaw = lay("--only");
const ONLY = onlyRaw
  ? onlyRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

// Sai một tên job thì im lặng không chạy gì cả là kiểu hỏng tệ nhất của một bộ lịch:
// người vận hành tưởng đã chạy. Chặn ngay ở đây.
if (ONLY && ONLY.length === 0) {
  console.error("--only rỗng — bỏ hẳn tuỳ chọn này nếu muốn chạy tất cả.");
  process.exit(1);
}
if (ONLY && ONLY.some((n) => !TEN_JOB_HOP_LE.test(n))) {
  console.error(`--only chứa tên job không hợp lệ: ${ONLY.filter((n) => !TEN_JOB_HOP_LE.test(n)).join(", ")}`);
  process.exit(1);
}

function soDuong(ten, macDinh, toiDa) {
  const raw = lay(ten);
  if (raw === null) return macDinh;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > toiDa) {
    console.error(`${ten} phải là số dương ≤ ${toiDa}, nhận được: ${raw}`);
    process.exit(1);
  }
  return n;
}

const TIMEOUT_PHUT = soDuong("--timeout", 30, 24 * 60);
const REAP_GIO = soDuong("--reap-age", 6, 24 * 30);

const CO_HOP_LE = ["--list", "--check", "--dry-run", "--force", "--json", "--help", "-h"];
const CO_CO_GIA_TRI = ["--only", "--timeout", "--reap-age"];
const la = argv.filter(
  (a) => !CO_HOP_LE.includes(a) && !CO_CO_GIA_TRI.some((k) => a.startsWith(`${k}=`)),
);
if (la.length > 0) {
  console.error(`Tham số không hiểu: ${la.join(", ")}. Xem --help.`);
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Thiếu DATABASE_URL — xem packages/core/db/migrations/README.md mục Chạy cục bộ.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// In ấn
// ---------------------------------------------------------------------------
const NHAN_TRANG_THAI = {
  ok: "OK",
  dang_chay: "đang chạy",
  chua_chay: "CHƯA CHẠY LẦN NÀO",
  that_bai: "THẤT BẠI",
  treo: "TREO",
  qua_han: "QUÁ HẠN",
  tat: "ĐANG TẮT",
};

function inSucKhoe(rows) {
  console.log("");
  console.log("Job                  Trạng thái            Thành công gần nhất       Phát hiện");
  console.log("───────────────────  ────────────────────  ────────────────────────  ─────────");
  for (const r of rows) {
    const nhan = NHAN_TRANG_THAI[r.state] ?? r.state;
    const dau = r.needs_attention ? "!" : " ";
    console.log(
      `${dau} ${r.job_name.padEnd(19)}${nhan.padEnd(22)}${String(r.last_success_at ?? "—").slice(0, 24).padEnd(26)}${r.last_findings}`,
    );
  }
  console.log("");
  for (const r of rows.filter((x) => x.needs_attention)) {
    console.log(`  ! ${r.label} — ${NHAN_TRANG_THAI[r.state] ?? r.state}`);
    if (r.note) console.log(`    ${r.note}`);
    if (r.last_findings > 0) console.log(`    ${r.last_findings} phát hiện ở lần chạy gần nhất.`);
  }
}

// ---------------------------------------------------------------------------
// Gọi một job kiểu 'script'
// ---------------------------------------------------------------------------
function chayScript(tenFile, phutHan) {
  return new Promise((ketThuc) => {
    const duongDan = join(HERE, tenFile);
    const con = spawn(process.execPath, [duongDan], {
      cwd: REPO_ROOT,
      env: process.env,
      // Cố ý KHÔNG shell: đối số đi dưới dạng mảng nên tên file không bao giờ được
      // diễn giải như một câu lệnh, dù bảng có bị ghi bậy.
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let het = false;
    const gioiHan = (chuoi) => (chuoi.length > 4000 ? `${chuoi.slice(-4000)}\n…(cắt bớt)` : chuoi);

    const dongHo = setTimeout(() => {
      het = true;
      con.kill("SIGTERM");
      // SIGTERM có thể bị bỏ qua; sau 10 giây thì dứt khoát.
      setTimeout(() => con.kill("SIGKILL"), 10_000).unref();
    }, phutHan * 60_000);

    con.stdout.on("data", (d) => {
      out += d;
      process.stdout.write(`    │ ${String(d).replace(/\n(?!$)/g, "\n    │ ")}`);
    });
    con.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(`    │ ${String(d).replace(/\n(?!$)/g, "\n    │ ")}`);
    });

    con.on("error", (err) => {
      clearTimeout(dongHo);
      ketThuc({ ma: -1, out: `${out}\nKhông chạy được: ${err.message}`, hetGio: false });
    });
    con.on("close", (ma) => {
      clearTimeout(dongHo);
      ketThuc({ ma: ma === null ? -1 : ma, out: gioiHan(out), hetGio: het });
    });
  });
}

// ---------------------------------------------------------------------------
// Thân chương trình
// ---------------------------------------------------------------------------
// Ghim múi giờ Việt Nam cho MỌI kết nối của pool — cùng một lựa chọn với
// packages/core/db/client.ts:66 và tools/jobs/run-flag-engine.mjs.
//
// Vì sao "set time zone" chứ không phải quy ước: Postgres mặc định chạy UTC, mà job
// nền của trường chạy lúc 01:00 giờ VN = 18:00 UTC HÔM TRƯỚC. Không ghim thì mọi
// current_date trong phiên này lùi đúng một ngày trong khung 00:00–06:59 giờ VN —
// âm thầm, không lỗi, và chỉ lộ ra khi có người ngồi đối chiếu hai cái sổ.
// Bắt gặp thật 01/08/2026 lúc 00:38 giờ VN: seed gieo dữ liệu vào ngày 31/07 trong
// khi app (đã ghim múi giờ) hỏi ngày 01/08 — màn Điều hành của BGH hiện gần như
// trống, và không một dòng lỗi nào nói vì sao.
// Dùng sự kiện "connect" thay vì một câu query sau khi mở: pool có thể mở thêm
// kết nối bất cứ lúc nào, và kết nối mở sau sẽ không chạy câu lệnh viết tay đó.
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
pool.on("connect", (c) => {
  c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
});

async function docSucKhoe(client) {
  const { rows } = await client.query(
    `select job_name, label, kind, enabled, state, needs_attention,
            last_status, last_findings, note,
            last_success_at::text as last_success_at,
            last_started_at::text as last_started_at
       from ops.v_job_health
      order by needs_attention desc, job_name`,
  );
  return rows;
}

async function main() {
  // --- Hai chế độ chỉ đọc: không khoá, không ghi, không chạm dữ liệu ---
  if (CHE_DO_LIST || CHE_DO_CHECK) {
    const client = await pool.connect();
    try {
      const suckhoe = await docSucKhoe(client);
      if (suckhoe.length === 0) {
        console.error("ops.job_schedule rỗng — chưa khai job nào. Migration 0041 đã chạy chưa?");
        return 1;
      }
      if (CHE_DO_LIST) {
        const { rows } = await client.query(
          `select job_name, label, kind, coalesce(runner, '—') as runner,
                  expected_every::text as expected_every, enabled
             from ops.job_schedule order by job_name`,
        );
        console.log("Lịch chạy (ops.job_schedule):");
        for (const r of rows) {
          const tat = r.enabled ? "" : "  [ĐANG TẮT]";
          console.log(`  ${r.job_name.padEnd(20)} ${r.kind.padEnd(7)} ${r.runner.padEnd(22)} mỗi ${r.expected_every}${tat}`);
        }
      }
      inSucKhoe(suckhoe);
      const canChuY = suckhoe.filter((r) => r.needs_attention);
      if (JSON_OUT) console.log(JSON.stringify({ mode: CHE_DO_LIST ? "list" : "check", health: suckhoe }));
      // --list chỉ để xem: không biến việc "có job cần chú ý" thành lỗi lệnh.
      if (CHE_DO_CHECK && canChuY.length > 0) {
        console.error(`CẦN CHÚ Ý: ${canChuY.length} job — ${canChuY.map((r) => r.job_name).join(", ")}`);
        return 1;
      }
      return 0;
    } finally {
      client.release();
    }
  }

  // --- Chế độ chạy thật ---
  // Khoá nằm trên MỘT kết nối giữ suốt lượt quét: nhả khoá sớm là mở đường cho lượt
  // thứ hai chen vào giữa chừng.
  const khoa = await pool.connect();
  const { rows: lockRows } = await khoa.query("select pg_try_advisory_lock($1::bigint) as got", [LOCK_KEY]);
  if (!lockRows[0].got) {
    khoa.release();
    // KHÔNG phải lỗi: cắm lịch dày thì lượt trước còn đang chạy là chuyện thường (§9).
    console.log("Một lượt quét khác đang chạy — bỏ qua lượt này. Không có gì hỏng.");
    return 0;
  }

  const client = await pool.connect();
  let batchId = null;
  const tomTat = { chay: [], hong: [], bo_qua: [], thieu_bo_chay: [], reaped: 0 };

  try {
    // 1. Nhặt xác trước: dòng 'running' treo từ lượt chết trước đó phải thành 'failed'
    //    THẤY ĐƯỢC, và phải xong trước khi bộ lịch mở dòng mới cho chính nó.
    if (!DRY_RUN) {
      const { rows } = await client.query("select ops.reap_stale_runs(make_interval(hours => $1)) as n", [
        REAP_GIO,
      ]);
      tomTat.reaped = Number(rows[0].n);
      if (tomTat.reaped > 0) {
        console.log(`Đã đánh dấu ${tomTat.reaped} lần chạy treo thành THẤT BẠI (running quá ${REAP_GIO} giờ).`);
      }
    }

    // 2. Đọc lịch và soát --only TRƯỚC khi mở sổ. Một lỗi gõ tay của người vận hành
    //    không được để lại dòng 'job_scheduler' = failed: dòng đó có nghĩa "máy quét
    //    đêm qua hỏng", và làm nó kêu vì lý do sai là bước đầu để nó bị phớt lờ.
    //    kind='batch' là chính bộ lịch — không tự gọi lại mình.
    const { rows: lich } = await client.query(
      `select job_name, label, kind, runner
         from ops.job_schedule
        where enabled and kind <> 'batch'
          and ($1::text[] is null or job_name = any($1::text[]))
        order by job_name`,
      [ONLY],
    );

    if (ONLY) {
      const thay = new Set(lich.map((r) => r.job_name));
      const khongThay = ONLY.filter((n) => !thay.has(n));
      if (khongThay.length > 0) {
        // Gõ sai tên rồi chạy xong không làm gì mà vẫn báo xanh là kiểu hỏng tệ nhất.
        console.error(`Không có job nào tên: ${khongThay.join(", ")} (hoặc đang tắt). Xem --list.`);
        throw new Error(`--only trỏ tới job không có trong lịch: ${khongThay.join(", ")}`);
      }
    }

    if (lich.length === 0) {
      console.log("Không có job nào đang bật trong ops.job_schedule.");
    }

    // 3. Mở dòng cho chính bộ lịch. Dòng này quá hạn = máy chạy cron đã chết.
    if (!DRY_RUN) {
      const { rows } = await client.query("select ops.start_job_run('job_scheduler') as id");
      batchId = rows[0].id;
    }

    // 4. Chạy từng job
    for (const job of lich) {
      const denLuot = FORCE
        ? true
        : (await client.query("select ops.job_due($1) as due", [job.job_name])).rows[0].due;

      if (!denLuot) {
        tomTat.bo_qua.push(job.job_name);
        console.log(`· ${job.job_name} — chưa tới lượt, bỏ qua.`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`· ${job.job_name} — SẼ CHẠY (dry-run: không gọi, không ghi sổ).`);
        tomTat.chay.push(job.job_name);
        continue;
      }

      const batDau = new Date();
      console.log(`▸ ${job.job_name} — ${job.label}`);

      if (job.kind === "sql") {
        try {
          const { rows } = await client.query("select ops.run_sql_job($1) as metrics", [job.job_name]);
          const metrics = rows[0].metrics ?? {};
          await client.query("select ops.record_job_run($1, 'success', $2::jsonb, $3::timestamptz)", [
            job.job_name,
            JSON.stringify(metrics),
            batDau.toISOString(),
          ]);
          const phatHien = Number(metrics.findings ?? 0);
          console.log(`  ✓ xong — ${phatHien} phát hiện.`);
          tomTat.chay.push(job.job_name);
        } catch (err) {
          const loi = String(err && err.message ? err.message : err);
          await client
            .query("select ops.record_job_run($1, 'failed', $2::jsonb, $3::timestamptz)", [
              job.job_name,
              JSON.stringify({ error: loi }),
              batDau.toISOString(),
            ])
            .catch(() => {});
          console.error(`  ✗ HỎNG — ${loi}`);
          tomTat.hong.push(job.job_name);
        }
        continue;
      }

      // kind = 'script'
      if (!TEN_FILE_HOP_LE.test(job.runner ?? "")) {
        // Ràng buộc DB đã chặn hình dạng này; kiểm lại ở đây vì đây là chỗ tên file
        // biến thành đường dẫn thi hành, và một lớp kiểm là không đủ cho việc đó.
        const loi = `Tên bộ chạy không hợp lệ: ${job.runner}`;
        await client
          .query("select ops.record_job_run($1, 'failed', $2::jsonb, $3::timestamptz)", [
            job.job_name,
            JSON.stringify({ error: loi }),
            batDau.toISOString(),
          ])
          .catch(() => {});
        console.error(`  ✗ ${loi}`);
        tomTat.hong.push(job.job_name);
        continue;
      }

      if (!existsSync(join(HERE, job.runner))) {
        // Đây là chỗ bộ quét cờ cắm vào: khai job trong migration của nó, đặt file
        // tools/jobs/run-flag-engine.mjs, xong. Chừng nào chưa có file thì báo TO —
        // "lịch có mà bộ chạy không có" là nửa vời, không phải bình thường.
        console.error(`  ✗ THIẾU BỘ CHẠY: tools/jobs/${job.runner} không tồn tại.`);
        await client
          .query("select ops.record_job_run($1, 'failed', $2::jsonb, $3::timestamptz)", [
            job.job_name,
            JSON.stringify({ error: `Thiếu tools/jobs/${job.runner}` }),
            batDau.toISOString(),
          ])
          .catch(() => {});
        tomTat.thieu_bo_chay.push(job.job_name);
        continue;
      }

      // Mốc để biết job con có TỰ ghi sổ hay không (run-retention.mjs thì có).
      const { rows: moc } = await client.query(
        "select coalesce(max(id), 0)::bigint as id from ops.job_runs where job_name = $1",
        [job.job_name],
      );
      const mocId = moc[0].id;

      const kq = await chayScript(job.runner, TIMEOUT_PHUT);
      const thanhCong = kq.ma === 0 && !kq.hetGio;

      const { rows: sau } = await client.query(
        "select status from ops.job_runs where job_name = $1 and id > $2 order by id desc limit 1",
        [job.job_name, mocId],
      );
      const daGhi = sau[0]?.status ?? null;

      // Luật 1 của file này. Ba trường hợp phải ghi hộ:
      //   · con không để lại dòng nào (chết sớm, hoặc vốn không tự ghi sổ);
      //   · con thoát khác 0 nhưng dòng nó để lại vẫn 'success' — sự thật là hỏng;
      //   · con bị giết vì quá giờ.
      const canGhiHo = daGhi === null || (!thanhCong && daGhi !== "failed");
      if (canGhiHo) {
        const metrics = thanhCong
          ? { note: "Job con không tự ghi sổ — bộ lịch ghi hộ." }
          : {
              exit_code: kq.ma,
              timed_out: kq.hetGio,
              error: kq.hetGio
                ? `Quá ${TIMEOUT_PHUT} phút — bị giết.`
                : `Thoát với mã ${kq.ma}.`,
              output_tail: kq.out.slice(-1500),
            };
        await client
          .query("select ops.record_job_run($1, $2, $3::jsonb, $4::timestamptz)", [
            job.job_name,
            thanhCong ? "success" : "failed",
            JSON.stringify(metrics),
            batDau.toISOString(),
          ])
          .catch((e) => console.error(`  (không ghi được sổ cho ${job.job_name}: ${e.message})`));
      }

      if (thanhCong) {
        console.log(`  ✓ xong.`);
        tomTat.chay.push(job.job_name);
      } else {
        console.error(`  ✗ HỎNG — ${kq.hetGio ? `quá ${TIMEOUT_PHUT} phút` : `mã thoát ${kq.ma}`}.`);
        tomTat.hong.push(job.job_name);
      }
    }

    // 5. Đóng sổ của bộ lịch
    const coViec = tomTat.hong.length > 0 || tomTat.thieu_bo_chay.length > 0;
    if (batchId !== null) {
      await client.query("select ops.finish_job_run($1, $2, $3::jsonb)", [
        batchId,
        coViec ? "failed" : "success",
        JSON.stringify({
          findings: tomTat.hong.length + tomTat.thieu_bo_chay.length,
          ran: tomTat.chay,
          failed: tomTat.hong,
          missing_runner: tomTat.thieu_bo_chay,
          skipped_not_due: tomTat.bo_qua,
          reaped_stale_runs: tomTat.reaped,
        }),
      ]);
    }

    // 6. Báo cáo
    console.log("");
    console.log(
      `Tóm tắt: ${tomTat.chay.length} chạy · ${tomTat.hong.length} hỏng · ` +
        `${tomTat.thieu_bo_chay.length} thiếu bộ chạy · ${tomTat.bo_qua.length} chưa tới lượt.`,
    );
    if (DRY_RUN) console.log("DRY-RUN — không job nào được gọi, không dòng nào được ghi.");

    const suckhoe = await docSucKhoe(client);
    inSucKhoe(suckhoe);
    if (JSON_OUT) console.log(JSON.stringify({ mode: DRY_RUN ? "dry-run" : "run", ...tomTat, health: suckhoe }));

    return coViec ? 1 : 0;
  } catch (err) {
    // Bộ lịch tự hỏng cũng phải để lại dấu vết — nếu không thì lượt quét biến mất
    // không dấu, đúng cái im lặng mà cả file này tồn tại để chống.
    if (batchId !== null) {
      await client
        .query("select ops.finish_job_run($1, 'failed', $2::jsonb)", [
          batchId,
          JSON.stringify({ findings: 1, error: String(err && err.message ? err.message : err) }),
        ])
        .catch(() => {});
    }
    throw err;
  } finally {
    client.release();
    await khoa.query("select pg_advisory_unlock($1::bigint)", [LOCK_KEY]).catch(() => {});
    khoa.release();
  }
}

main()
  .then(async (ma) => {
    await pool.end();
    process.exit(ma);
  })
  .catch(async (err) => {
    console.error("BỘ LỊCH THẤT BẠI:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
