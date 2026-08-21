#!/usr/bin/env node
// tools/jobs/run-tinh-diem.mjs
//
// Job hằng ngày tính điểm thi đua (ADR-037). Toàn bộ luật tính nằm trong SQL
// (`evidence.tinh_diem_thi_dua` + bảng `evidence.luat_tinh_diem`); file này chỉ là cái
// đồng hồ bấm giờ — cùng khuôn `run-retention.mjs` và `run-flag-engine.mjs`.
//
// VÌ SAO TÍNH LẠI CẢ MỘT DẢI NGÀY, KHÔNG CHỈ HÔM QUA:
// Dữ liệu nguồn ĐẾN MUỘN được. Một dòng điểm danh gửi muộn có thể được cô duyệt sau
// hai ngày (`attendance.late_decisions`), và lúc đó điểm của ngày đó mới đúng. Tính lại
// 7 ngày gần nhất mỗi đêm là cách rẻ nhất để bảng xếp hạng tự sửa mình — và nó AN TOÀN
// vì §9 nằm ở khoá chính của sổ điểm: tính lại là upsert, không cộng dồn.
//
// Chạy:
//   DATABASE_URL=postgres://... node tools/jobs/run-tinh-diem.mjs
//   DATABASE_URL=postgres://... node tools/jobs/run-tinh-diem.mjs --so-ngay=30
//   DATABASE_URL=postgres://... node tools/jobs/run-tinh-diem.mjs --dry-run
//
// Mã thoát: 0 = xong, 1 = hỏng (cron/CI đọc mã này để báo động).

import { createRequire } from "node:module";

// `pg` là dependency của @hub/core, không của gốc workspace — neo require vào
// package.json của core, cùng lý do đã ghi dài ở run-retention.mjs.
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Thiếu DATABASE_URL — xem packages/core/db/migrations/README.md mục Chạy cục bộ.");
  process.exit(1);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

const soNgayArg = argv.find((a) => a.startsWith("--so-ngay="));
const soNgay = soNgayArg ? Number(soNgayArg.slice("--so-ngay=".length)) : 7;
if (!Number.isInteger(soNgay) || soNgay < 1 || soNgay > 400) {
  console.error(`--so-ngay phải là số nguyên 1..400, nhận được: ${soNgayArg?.split("=")[1]}`);
  process.exit(1);
}

const unknown = argv.filter((a) => a !== "--dry-run" && !a.startsWith("--so-ngay="));
if (unknown.length > 0) {
  console.error(`Tham số không hiểu: ${unknown.join(", ")}`);
  process.exit(1);
}

// Ghim múi giờ Việt Nam cho MỌI kết nối của pool — lý do đầy đủ ở run-retention.mjs.
// Với job này nó đặc biệt quan trọng: cả `current_date` lẫn dải ngày tính lại đều lệch
// một ngày trong khung 00:00–06:59 giờ VN nếu quên, và job thi đua chạy ban đêm.
const pool = new pg.Pool({ connectionString: DATABASE_URL });
pool.on("connect", (c) => {
  c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
});

async function run() {
  const client = await pool.connect();
  const batDau = process.hrtime.bigint();
  try {
    await client.query("begin");

    const ngayDaTinh = [];
    for (let lui = soNgay - 1; lui >= 0; lui -= 1) {
      const { rows } = await client.query(
        "select (current_date - $1::int)::text as ngay, evidence.tinh_diem_thi_dua(current_date - $1::int) as so_dong",
        [lui],
      );
      ngayDaTinh.push({ ngay: rows[0].ngay, soDong: rows[0].so_dong });
    }

    const { rows: tong } = await client.query(
      `select count(*)::int as so_dong, coalesce(sum(diem), 0)::int as tong_diem
         from evidence.diem_thi_dua
        where ngay > current_date - $1::int`,
      [soNgay],
    );

    if (dryRun) {
      await client.query("rollback");
      console.log("DRY-RUN — đã hoàn tác, KHÔNG dòng điểm nào được ghi.");
    } else {
      await client.query("commit");
    }

    const msec = Number(process.hrtime.bigint() - batDau) / 1e6;
    console.log("Số ngày tính lại  :", soNgay);
    for (const n of ngayDaTinh) console.log(`   ${n.ngay} → ${n.soDong} dòng đi học`);
    console.log("Dòng điểm trong dải:", tong[0].so_dong);
    console.log("Tổng điểm trong dải:", tong[0].tong_diem);

    // Dòng sổ chạy job — Rev B/C điều 3: màn hình phụ thuộc job phải đọc được độ tươi.
    // Ghi SAU commit, không nằm trong transaction vừa hoàn tác: một lần dry-run không
    // được để lại dấu vết trông như một lần chạy thật.
    if (!dryRun) {
      await client
        .query(
          `insert into ops.job_runs (job_name, status, finished_at, metrics)
           values ('tinh_diem_thi_dua', 'success', now(),
                   jsonb_build_object('so_ngay', $1::int, 'so_dong', $2::int, 'tong_diem', $3::int, 'msec', $4::numeric))`,
          [soNgay, tong[0].so_dong, tong[0].tong_diem, msec.toFixed(1)],
        )
        .catch(() => {});
    }
    console.log(dryRun ? "OK — dry-run xong." : `OK — tính điểm xong (${msec.toFixed(0)}ms).`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    // Ghi dấu vết NGOÀI transaction đã hỏng: "không suy tin tốt từ im lặng". Không có
    // dòng này thì một job chết mỗi đêm trông y hệt một job chưa tới giờ chạy.
    await client
      .query(
        `insert into ops.job_runs (job_name, status, finished_at, metrics)
         values ('tinh_diem_thi_dua', 'failed', now(),
                 jsonb_build_object('so_ngay', $1::int, 'error', $2::text))`,
        [soNgay, String(err && err.message ? err.message : err)],
      )
      .catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("TÍNH ĐIỂM THẤT BẠI:", err);
  process.exit(1);
});
