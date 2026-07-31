#!/usr/bin/env node
// tools/jobs/run-flag-engine.mjs
//
// Bộ quét cờ đêm (04-flag-engine.md). Toàn bộ thuật toán nằm trong SQL —
// care.run_flag_engine() ở migration 0039 — nên file này chỉ là cái đồng hồ bấm
// giờ: mở kết nối, gọi hàm, in kết quả, và ĐẢM BẢO một lần chạy hỏng cũng để lại
// dấu vết trong ops.job_runs.
//
// Vì sao logic ở SQL chứ không ở đây (cùng lý do với run-retention.mjs): hàm chạy
// được cả từ cron lẫn từ psql lúc sự cố, pgTAP kiểm được nó mà không cần dựng
// Node, và trọn một lần quét nằm trong MỘT transaction — job chết giữa chừng
// không để lại nửa cái hồ sơ can thiệp.
//
// Chạy:
//   DATABASE_URL=postgres://... node tools/jobs/run-flag-engine.mjs
//   DATABASE_URL=postgres://... node tools/jobs/run-flag-engine.mjs --dry-run
//   DATABASE_URL=postgres://... node tools/jobs/run-flag-engine.mjs --mode=backfill
//
// Mã thoát: 0 = xong, 1 = hỏng (cron/CI đọc mã này để báo động).

import { createRequire } from "node:module";

// `pg` là dependency của @hub/core, không của gốc workspace — neo require vào
// package.json của @hub/core (xem lời giải thích dài trong run-retention.mjs).
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Thiếu DATABASE_URL — xem packages/core/db/migrations/README.md mục Chạy cục bộ.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tham số dòng lệnh
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

const modeArg = argv.find((a) => a.startsWith("--mode="));
const mode = modeArg ? modeArg.slice("--mode=".length) : "live";
if (mode !== "live" && mode !== "backfill") {
  console.error(`--mode chỉ nhận live | backfill, nhận được: ${mode}`);
  process.exit(1);
}

const unknown = argv.filter((a) => a !== "--dry-run" && !a.startsWith("--mode="));
if (unknown.length > 0) {
  console.error(`Tham số không hiểu: ${unknown.join(", ")}`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    // Giờ Việt Nam, không phải UTC: `current_date` quyết định nhãn ngày của mọi cờ
    // sinh đêm nay, và job chạy lúc 01:00 giờ VN = 18:00 UTC HÔM TRƯỚC. Không đặt
    // múi giờ ở đây thì cờ của đêm 05/09 mang nhãn 04/09 — lệch đúng một ngày, âm
    // thầm, và chỉ lộ ra khi có người đối chiếu buồng lái với sổ điểm danh.
    await client.query("set time zone 'Asia/Ho_Chi_Minh'");
    await client.query("begin");

    const { rows } = await client.query("select care.run_flag_engine(current_date, $1) as metrics", [
      mode,
    ]);
    const m = rows[0].metrics;

    if (dryRun) {
      // Thử trước khi ghi thật: cùng một câu lệnh, chỉ khác chỗ kết thúc bằng
      // rollback. Con số in ra là con số thật của lần chạy thật.
      await client.query("rollback");
      console.log("DRY-RUN — đã hoàn tác, KHÔNG cờ nào và KHÔNG hồ sơ nào được ghi.");
    } else {
      await client.query("commit");
    }

    console.log("Ngày quét         :", m.as_of_date);
    console.log("Chế độ            :", m.mode);
    console.log("Luật đã chạy      :", (m.rules_evaluated ?? []).join(", ") || "(không luật nào)");
    // Phần BỊ BỎ QUA in ra cùng khổ chữ với phần đã chạy, cố ý: "im lặng không phải
    // kết luận" chỉ có nghĩa khi người trực đọc log thấy ngay mình vừa KHÔNG đo gì.
    for (const s of m.rules_skipped ?? []) {
      console.log(`  ⚠ bỏ qua ${s.rule_code} — ${s.ly_do}`);
    }
    console.log("Nguồn hết tươi    :", (m.degraded_sources ?? []).join(", ") || "(không có)");
    console.log("Cờ mới            :", m.flags_new);
    console.log("Hồ sơ mới mở      :", m.cases_new);
    console.log("Cờ gắn vào hồ sơ  :", m.flags_attached);
    console.log("Lượt leo thang    :", m.escalations_new);
    if (m.quota_overflow > 0) {
      console.log(`  ⚠ ${m.quota_overflow} hồ sơ chuyển tâm lý cụm vì GVCN đã đủ định mức 5`);
    }
    if (m.cases_without_owner > 0) {
      // Hồ sơ vô chủ = không ai nhận trách nhiệm. Không im lặng cho qua.
      console.log(`  ⚠ ${m.cases_without_owner} hồ sơ CHƯA CÓ CHỦ — lớp thiếu GVCN và cơ sở thiếu tâm lý cụm`);
    }
    console.log(dryRun ? "OK — dry-run xong." : "OK — quét cờ xong.");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    // care.run_flag_engine() ghi dòng 'running' rồi 'success' trong CÙNG một
    // transaction, nên khi nó ném lỗi thì dòng đó bị cuốn theo rollback — không
    // còn dấu vết nào của lần chạy hỏng, và một job chết trông y hệt một job chưa
    // tới lịch. Ghi lại ở đây, ngoài transaction đã hỏng.
    await client
      .query(
        `insert into ops.job_runs (job_name, mode, status, finished_at, metrics)
         values ('flag_engine', $1, 'failed', now(), jsonb_build_object('error', $2::text))`,
        [mode, String(err && err.message ? err.message : err)],
      )
      .catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("QUÉT CỜ THẤT BẠI:", err);
  process.exit(1);
});
