#!/usr/bin/env node
// tools/jobs/run-retention.mjs
//
// Job hằng tháng thi hành lời hứa công khai của §3 / mệnh lệnh 4 CLAUDE.md:
// chi tiết cảm xúc quá 12 tháng bị xoá, chỉ giữ lại xu hướng tổng hợp
// (attendance.mood_trends). Toàn bộ logic nằm trong SQL — file này chỉ là cái
// đồng hồ bấm giờ: mở kết nối, gọi attendance.purge_old_emotion_details(), in
// kết quả, và ĐẢM BẢO một lần chạy hỏng cũng để lại dấu vết.
//
// Vì sao logic ở SQL chứ không ở đây: hàm chạy được cả từ pg_cron lẫn từ psql
// lúc sự cố, và pgTAP (0031_emotion_retention_test.sql) kiểm được nó mà không
// cần dựng Node. Xem tools/jobs/README.md mục "Cắm lịch ở đâu".
//
// Chạy:
//   DATABASE_URL=postgres://... node tools/jobs/run-retention.mjs
//   DATABASE_URL=postgres://... node tools/jobs/run-retention.mjs --dry-run
//   DATABASE_URL=postgres://... node tools/jobs/run-retention.mjs --cutoff=2025-01-01
//
// Mã thoát: 0 = xong, 1 = hỏng (cron/CI đọc mã này để báo động).

import { createRequire } from "node:module";

// `pg` là dependency của @hub/core, không của gốc workspace. pnpm dựng node_modules
// nghiêm ngặt (không hoisting), mà ESM lại phân giải theo VỊ TRÍ FILE chứ không theo
// thư mục làm việc — nên `import pg from "pg"` ở tools/ luôn ERR_MODULE_NOT_FOUND,
// kể cả khi chạy qua `pnpm --filter @hub/core exec`. Neo require vào package.json của
// @hub/core là cách gọn nhất để job dùng đúng bản `pg` mà app đang dùng, thay vì thêm
// một dependency trùng ở gốc.
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

const cutoffArg = argv.find((a) => a.startsWith("--cutoff="));
const cutoff = cutoffArg ? cutoffArg.slice("--cutoff=".length) : null;
// Kiểm định dạng ở đây thay vì để Postgres báo lỗi cú pháp: mốc thời gian là tham
// số của một thao tác XOÁ, gõ nhầm '2025-13-01' phải dừng trước khi chạm dữ liệu.
if (cutoff !== null && !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
  console.error(`--cutoff phải có dạng YYYY-MM-DD, nhận được: ${cutoff}`);
  process.exit(1);
}

const unknown = argv.filter((a) => a !== "--dry-run" && !a.startsWith("--cutoff="));
if (unknown.length > 0) {
  console.error(`Tham số không hiểu: ${unknown.join(", ")}`);
  process.exit(1);
}

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
const pool = new pg.Pool({ connectionString: DATABASE_URL });
pool.on("connect", (c) => {
  c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = cutoff
      ? await client.query(
          "select attendance.purge_old_emotion_details($1::date) as metrics",
          [cutoff],
        )
      : await client.query("select attendance.purge_old_emotion_details() as metrics");

    const m = rows[0].metrics;

    if (dryRun) {
      // Thử trước khi xoá thật: cùng một câu lệnh, chỉ khác chỗ kết thúc bằng
      // rollback. Con số in ra là con số thật của lần chạy thật.
      await client.query("rollback");
      console.log("DRY-RUN — đã hoàn tác, KHÔNG có dữ liệu nào bị xoá.");
    } else {
      await client.query("commit");
    }

    console.log("Mốc nhận vào      :", m.cutoff_in);
    // Hàm SQL làm tròn LÊN đầu tháng để chỉ xoá trọn tháng (xem 0031). In cả hai
    // con số để người trực không phải đoán vì sao ngày áp dụng khác ngày mình gõ.
    console.log("Mốc thực áp dụng  :", m.cutoff_applied);
    console.log("Số tháng tổng hợp :", m.months_rolled_up);
    console.log("Dòng xu hướng ghi :", m.mood_trend_rows);
    console.log("Mood đã xoá       :", m.checkins_cleared);
    console.log("Lời nhắn đã xoá   :", m.help_requests_cleared);
    console.log(dryRun ? "OK — dry-run xong." : "OK — retention xong.");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    // Hàm SQL ghi dòng 'running' rồi 'success' trong CÙNG một câu lệnh, nên khi nó
    // ném lỗi thì dòng đó bị cuốn theo rollback — không còn dấu vết nào của lần
    // chạy hỏng. Ghi lại ở đây, ngoài transaction đã hỏng, để buồng lái và người
    // trực nhìn thấy: "không suy tin tốt từ im lặng" (Rev B/C điều 3).
    await client
      .query(
        // as_of_date để NULL và đưa mốc vào metrics dưới dạng text: một trong những
        // lý do job hỏng là mốc gõ sai ('2025-02-30'), mà ép nó sang date ở đây thì
        // chính câu ghi log cũng ném lỗi và lần chạy hỏng lại biến mất không dấu vết.
        `insert into ops.job_runs (job_name, status, finished_at, metrics)
         values ('emotion_retention', 'failed', now(),
                 jsonb_build_object('cutoff_in', $1::text, 'error', $2::text))`,
        [cutoff, String(err && err.message ? err.message : err)],
      )
      .catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("RETENTION THẤT BẠI:", err);
  process.exit(1);
});
