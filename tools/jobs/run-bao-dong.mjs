#!/usr/bin/env node
// tools/jobs/run-bao-dong.mjs
//
// KÊNH BÁO ĐỘNG TỚI MỘT CON NGƯỜI (nợ #40). Hai việc, đúng thứ tự đó:
//   1. SINH  — ops.sinh_bao_dong(): đọc ops.v_job_health + ops.v_rule_health, biến
//              "máy đã biết" thành "có tin cho người".
//   2. GỬI   — tools/alert/gui-bao-dong.mjs: đưa tin qua các kênh đang bật, ghi lại
//              sự thật về kết quả từng tin.
//
// Trước file này, chuỗi báo động của hệ dừng ở đúng chỗ này: `ops.outbox_messages`
// có bộ GHI (0039) mà không có bộ GỬI. Đo 01/08/2026 — `grep -rn "outbox" apps/
// tools/ packages/core/src` = 0 hit.
//
// ── Giới hạn phải nói ra, không được để người đọc tự phát hiện ──────────────────
// File này chạy TRONG bộ lịch mà nó giám sát. Máy chạy Task Scheduler/cron chết ⇒
// không lượt nào gọi nó ⇒ không tin nào được sinh, kể cả tin "cron đã chết". Người
// canh ngoài cùng bắt buộc phải đứng ngoài hệ, và hôm nay chỗ đó vẫn trống (nợ #33:
// tác vụ `HubJobs` CHƯA được đăng ký trên máy nào).
//
// Chạy:
//   DATABASE_URL=postgres://... node tools/jobs/run-bao-dong.mjs
//   DATABASE_URL=postgres://... node tools/jobs/run-bao-dong.mjs --chi-sinh   # sinh, không gửi
//   DATABASE_URL=postgres://... node tools/jobs/run-bao-dong.mjs --chi-gui    # gửi, không sinh
//   DATABASE_URL=postgres://... node tools/jobs/run-bao-dong.mjs --xem        # không chạm gì
//
// Mã thoát: 0 = lượt chạy trót lọt · 1 = lượt chạy hỏng. Tin MẮC KẸT KHÔNG làm mã
// thoát khác 0 — nó là phát hiện của một lần chạy THÀNH CÔNG, và 0041 đã có sẵn
// đường cho đúng loại đó: metrics.findings > 0 ⇒ ops.v_job_health.needs_attention.
// Trộn hai thứ vào một con số là làm người trực không phân biệt được "bộ gửi hỏng"
// với "bộ gửi chạy tốt và tìm ra việc".

import { createRequire } from "node:module";
import { guiMotLuot, demTinMacKet, demKenhHong } from "../alert/gui-bao-dong.mjs";
import { cacLoaiCoBoGui } from "../alert/kenh/index.mjs";

// `pg` là dependency của @hub/core chứ không của gốc workspace, và ESM phân giải
// theo VỊ TRÍ FILE — neo require vào package.json của @hub/core (cùng lý do đã ghi
// trong run-retention.mjs và run-all.mjs).
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const JOB_NAME = "kenh_bao_dong";

const argv = process.argv.slice(2);
const CHI_SINH = argv.includes("--chi-sinh");
const CHI_GUI = argv.includes("--chi-gui");
const XEM = argv.includes("--xem");

const la = argv.filter((a) => !["--chi-sinh", "--chi-gui", "--xem"].includes(a));
if (la.length > 0) {
  console.error(`Tham số không hiểu: ${la.join(", ")}`);
  process.exit(1);
}
if (CHI_SINH && CHI_GUI) {
  console.error("--chi-sinh và --chi-gui loại trừ nhau. Bỏ cả hai để làm trọn cả hai việc.");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Thiếu DATABASE_URL — xem packages/core/db/migrations/README.md mục Chạy cục bộ.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
// Ghim múi giờ Việt Nam trên MỌI kết nối của pool — cùng lựa chọn với run-all.mjs.
// Ở đây nó quyết định nhãn ngày trong dedup_key: không ghim thì tin sinh lúc 00:30
// giờ VN mang nhãn của HÔM QUA và trùng khoá với tin hôm qua, tức là tin của hôm
// nay bị `on conflict do nothing` nuốt mất trong im lặng.
pool.on("connect", (c) => {
  c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
});

function inTonKho(dem) {
  if (dem.tong === 0) {
    console.log("Hàng đợi sạch — không tin nào mắc kẹt.");
    return;
  }
  console.log("");
  console.log(`CÓ ${dem.tong} TIN BÁO ĐỘNG ĐANG MẮC KẸT — xem: select * from ops.v_bao_dong_ton;`);
  if (dem.het_luot > 0)
    console.log(`  · ${dem.het_luot} tin HẾT LƯỢT THỬ — máy đã bỏ cuộc, cần người vào.`);
  if (dem.khong_co_kenh > 0)
    console.log(`  · ${dem.khong_co_kenh} tin KHÔNG CÓ KÊNH — kênh đã khai nhưng đang bị tắt hết.`);
  if (dem.ton_lau > 0)
    console.log(`  · ${dem.ton_lau} tin nằm chờ quá 24 giờ — bộ gửi có đang chạy không?`);
}

async function main() {
  const client = await pool.connect();
  let runId = null;

  if (XEM) {
    try {
      const { rows } = await client.query(
        `select channel_id, label, kind, enabled, array_to_string(audiences, ', ') as audiences
           from ops.alert_channels order by channel_id`,
      );
      console.log("Kênh báo động đã khai (ops.alert_channels):");
      if (rows.length === 0) console.log("  (chưa khai kênh nào — mọi tin sẽ là 'không có kênh')");
      for (const r of rows) {
        const tat = r.enabled ? "" : "  [ĐANG TẮT]";
        const coBoGui = cacLoaiCoBoGui().includes(r.kind) ? "" : "  [CHƯA CÓ BỘ GỬI]";
        console.log(`  ${r.channel_id.padEnd(16)} ${r.kind.padEnd(14)} → ${r.audiences}${tat}${coBoGui}`);
      }
      console.log("");
      console.log(`Loại kênh đang có bộ gửi: ${cacLoaiCoBoGui().join(", ")}`);
      const { rows: cho } = await client.query(
        `select status, count(*)::int as n from ops.outbox_messages group by status order by status`,
      );
      console.log("");
      console.log("Hàng đợi (ops.outbox_messages):");
      if (cho.length === 0) console.log("  (rỗng)");
      for (const r of cho) console.log(`  ${r.status.padEnd(16)} ${r.n}`);
      inTonKho(await demTinMacKet(client));
      return 0;
    } finally {
      client.release();
    }
  }

  try {
    // Job này TỰ ghi sổ (như run-flag-engine.mjs), không để run-all.mjs ghi hộ: chỉ
    // bản thân nó biết con số `findings`, mà findings mới là thứ làm buồng lái sáng
    // đèn khi hàng đợi đầy tin chết.
    //
    // Nằm TRONG try để `finally` luôn nhả kết nối: mở sổ mà hỏng ở ngoài try thì
    // client không bao giờ được nhả, và `pool.end()` đứng đợi một kết nối không ai
    // trả — tiến trình treo im, đúng kiểu hỏng cả gói này đang chống.
    const { rows: mo } = await client.query("select ops.start_job_run($1) as id", [JOB_NAME]);
    runId = mo[0].id;

    const metrics = {};

    if (!CHI_GUI) {
      const { rows } = await client.query("select ops.sinh_bao_dong() as kq");
      const kq = rows[0].kq ?? {};
      metrics.tin_moi_job = kq.tin_moi_job ?? 0;
      metrics.tin_moi_luat = kq.tin_moi_luat ?? 0;
      console.log(
        `Sinh tin: ${metrics.tin_moi_job} từ sức khoẻ job · ${metrics.tin_moi_luat} từ sức khoẻ luật.`,
      );
    }

    if (!CHI_SINH) {
      const tt = await guiMotLuot(client);
      metrics.da_gui = tt.da_gui;
      metrics.gui_hong = tt.gui_hong;
      metrics.het_luot = tt.het_luot;
      metrics.khong_co_kenh = tt.khong_co_kenh;
      console.log(
        `Gửi: ${tt.da_gui} đã gửi · ${tt.gui_hong} hỏng (còn lượt) · ` +
          `${tt.het_luot} hết lượt · ${tt.khong_co_kenh} không có kênh.`,
      );
      // In từng tin không gửi được, kèm mã tin: người trực cần đối chiếu được với
      // sổ trực chứ không chỉ nhìn một con số tổng.
      for (const t of tt.tin.filter((x) => x.trang_thai !== "da_gui")) {
        console.log(`  ! ${t.dedup_key} — ${t.trang_thai}`);
      }
    }

    const dem = await demTinMacKet(client);
    const kenhHong = await demKenhHong(client);
    // Quy ước chung của mọi job giám sát (0041 mục 5): số phát hiện nằm ở
    // metrics->>'findings', và ops.v_job_health đọc đúng khoá đó.
    //
    // Cộng CẢ kênh hỏng vào findings: một kênh chết mà mọi tin vẫn đi được qua kênh
    // khác thì hàng đợi sạch bong, và nếu chỉ đếm tin thì buồng lái xanh trong khi
    // một đường báo động đã đứt. Tìm ra bằng thử ngược 02/08/2026.
    metrics.findings = dem.tong + kenhHong.length;
    metrics.ton_het_luot = dem.het_luot;
    metrics.ton_khong_co_kenh = dem.khong_co_kenh;
    metrics.kenh_hong = kenhHong.map((k) => k.channel_id);
    inTonKho(dem);
    for (const k of kenhHong) {
      console.log(`  ! KÊNH HỎNG: ${k.channel_id} (${k.label}) — ${k.ly_do_hong_gan_nhat ?? "không rõ"}`);
    }

    await client.query("select ops.finish_job_run($1, 'success', $2::jsonb)", [
      runId,
      JSON.stringify(metrics),
    ]);
    return 0;
  } catch (err) {
    const chu = String(err && err.message ? err.message : err);
    await client
      .query("select ops.finish_job_run($1, 'failed', $2::jsonb)", [
        runId,
        JSON.stringify({ findings: 1, error: chu }),
      ])
      .catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(async (ma) => {
    await pool.end();
    process.exit(ma);
  })
  .catch(async (err) => {
    console.error("GỬI BÁO ĐỘNG THẤT BẠI:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
