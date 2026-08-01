#!/usr/bin/env node
// tools/migrate/migrate.mjs
//
// Bộ chạy migration + sổ ghi (nợ DEBT #23). Sổ nằm ở `ops.schema_migrations`,
// dựng bởi migration `0050_so_ghi_migration.sql`.
//
// ═══════════════════════════════════════════════════════════════════════════
// CÁI ĐANG THIẾU
// ═══════════════════════════════════════════════════════════════════════════
// Trước file này, cách duy nhất để áp migration là vòng lặp trong
// `tools/run-db-tests.sh`: `for f in migrations/*.sql; do psql -f "$f"; done`.
// Vòng lặp đó đúng cho database DỰNG LẠI TỪ ĐẦU và CHỈ cho ca đó. Với 48 file đã
// áp bằng tay lên hub_dev và một máy chủ thật sắp dựng, không ai trả lời được ba
// câu: đang ở migration số mấy · file trên đĩa có còn đúng cái đã áp · ai áp lúc nào.
//
// ═══════════════════════════════════════════════════════════════════════════
// NĂM VIỆC BỘ CHẠY PHẢI LÀM (giao việc, nguyên văn) — và làm ở đâu trong file này
// ═══════════════════════════════════════════════════════════════════════════
//  (a) BIẾT ĐÃ ÁP TỚI ĐÂU        → `docSo()` + lệnh `status`
//  (b) TỪ CHỐI ÁP LẠI file đã áp → `lenhUp()` bỏ qua mọi version đã có trong sổ
//  (c) PHÁT HIỆN FILE ĐÃ ÁP MÀ NỘI DUNG ĐỔI → `soSanh()` so sha256; đây là ca
//      NGUY HIỂM NHẤT VÀ IM LẶNG NHẤT: file sửa rồi thì không được chạy lại (đã có
//      trong sổ), nên máy chủ giữ hành vi CŨ trong khi kho mô tả hành vi MỚI, và
//      không một lỗi nào nổ ra. Lệch băm là TỪ CHỐI CHẠY, không phải cảnh báo.
//  (d) TRANSACTION, hỏng thì không nửa vời → `apDungMotFile()`; xem mục "MỘT
//      TRANSACTION THẬT" bên dưới, chỗ này có một cái bẫy đã cắn.
//  (e) CHẾ ĐỘ CHỈ-XEM             → `status` (không ghi gì) và `up --dry-run`
//
// ═══════════════════════════════════════════════════════════════════════════
// MỘT TRANSACTION THẬT — cái bẫy đã đo được
// ═══════════════════════════════════════════════════════════════════════════
// Cả 48 migration của kho đều có dạng `begin; … commit;` và `commit;` là câu SQL
// CUỐI CÙNG (soát lại toàn bộ 02/08/2026). Cách làm ngây thơ — mở transaction ở
// phía Node rồi gửi thân file vào — HỎNG THẦM LẶNG: câu `begin;` bên trong chỉ
// sinh WARNING "there is already a transaction in progress", còn câu `commit;` bên
// trong sẽ COMMIT LUÔN transaction của bộ chạy. Dòng sổ ghi viết sau đó rơi ra
// ngoài transaction của migration ⇒ vẫn có ca "migration chạy rồi mà sổ không ghi"
// (hoặc ngược lại), đúng thứ (d) cấm.
//
// Cách làm ở đây: KHÔNG mở transaction ở phía Node. Thay vào đó CHÈN câu INSERT sổ
// vào NGAY TRƯỚC câu `commit;` cuối cùng của chính file, rồi gửi cả khối đi một
// lượt. Kết quả: migration và dòng sổ nằm trong CÙNG transaction do chính file mở
// — hỏng ở bất kỳ đâu thì cả hai cùng biến mất.
//
// Vì cách này đòi hình dạng file, `bocTachFile()` CƯỠNG CHẾ hình dạng đó và từ chối
// file lạ. Một migration tương lai buộc phải chạy ngoài transaction (ví dụ
// `create index concurrently`) thì khai tường minh bằng dòng đánh dấu
// `-- migrate:khong-transaction` ở đầu file; lúc đó bộ chạy ghi sổ bằng câu lệnh
// RỜI và IN RÕ rằng tính nguyên tử là trách nhiệm của người viết file đó.
//
// ═══════════════════════════════════════════════════════════════════════════
// NHẬN NỢ BAN ĐẦU (baseline) — bước dễ làm sai nhất
// ═══════════════════════════════════════════════════════════════════════════
// Sự thật phải sống chung: 48 migration ĐÃ áp bằng tay lên hub_dev trước khi có sổ.
// Sổ trống KHÔNG có nghĩa "chưa áp gì". Nên `up` có một cổng chặn cứng: sổ trống
// mà database đã có đối tượng nghiệp vụ (`core.users` tồn tại) thì TỪ CHỐI CHẠY và
// chỉ sang lệnh `baseline`. Thiếu cổng này, lần chạy đầu tiên trên hub_dev sẽ áp
// lại 48 file lên một database đã có sẵn mọi thứ.
//
// `baseline` có cổng chặn đối xứng: từ chối nhận nợ trên một database RỖNG. Nhận
// một món nợ mình không có nghĩa là lần `up` kế tiếp sẽ bỏ qua đúng những file
// chưa bao giờ chạy — im lặng, và chỉ lộ ra khi ứng dụng gọi một bảng không tồn tại.
//
// ═══════════════════════════════════════════════════════════════════════════
// CÁCH DÙNG
// ═══════════════════════════════════════════════════════════════════════════
//   DATABASE_URL=postgres://… node tools/migrate/migrate.mjs status
//   DATABASE_URL=postgres://… node tools/migrate/migrate.mjs up --dry-run
//   DATABASE_URL=postgres://… node tools/migrate/migrate.mjs up
//   DATABASE_URL=postgres://… node tools/migrate/migrate.mjs baseline --to=0049 \
//                                   --ghi-chu="48+1 file đã áp tay lên hub_dev"
//
//   --dir=<đường dẫn>   đổi thư mục migration (mặc định packages/core/db/migrations)
//   --url=<chuỗi>       đổi kết nối, ưu tiên hơn DATABASE_URL
//
// Mã thoát: 0 = ổn · 1 = có vấn đề (lệch băm, thiếu file, migration hỏng, cổng chặn).
// CI đọc mã này; `status` cố ý trả 1 khi phát hiện lệch băm để nó dùng được như một cổng.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

// `pg` là dependency của @hub/core, không của gốc workspace — neo require vào
// package.json của @hub/core (cùng lý do đã ghi dài trong tools/jobs/run-retention.mjs).
import { createRequire } from "node:module";
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const THU_MUC_MAC_DINH = join(GOC, "packages", "core", "db", "migrations");

/** Dòng đánh dấu file dựng sổ ghi. Xem đầu 0050_so_ghi_migration.sql. */
const DAU_HIEU_SO_GHI = "migrate:so-ghi";
/** Dòng đánh dấu file tự khai "tôi không chạy được trong transaction". */
const DAU_HIEU_KHONG_TX = "migrate:khong-transaction";

// ---------------------------------------------------------------------------
// Tham số dòng lệnh
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const lenh = argv.find((a) => !a.startsWith("--")) ?? "status";
const co = (ten) => argv.includes(`--${ten}`);
const thamSo = (ten) => {
  const a = argv.find((x) => x.startsWith(`--${ten}=`));
  return a ? a.slice(ten.length + 3) : null;
};

const LENH_HOP_LE = ["status", "up", "baseline"];
if (!LENH_HOP_LE.includes(lenh)) {
  console.error(`Lệnh không hiểu: ${lenh}. Chỉ nhận: ${LENH_HOP_LE.join(" | ")}`);
  process.exit(1);
}

const thuMuc = resolve(thamSo("dir") ?? THU_MUC_MAC_DINH);
const chuoiKetNoi = thamSo("url") ?? process.env.DATABASE_URL;
if (!chuoiKetNoi) {
  console.error("Thiếu DATABASE_URL (hoặc --url=…) — xem packages/core/db/migrations/README.md.");
  process.exit(1);
}

const laThu = co("dry-run");
const ghiChu = thamSo("ghi-chu");
const den = thamSo("to");

// ---------------------------------------------------------------------------
// Đọc thư mục migration
// ---------------------------------------------------------------------------

/** sha256 hex của NGUYÊN VĂN BYTE. Không chuẩn hoá xuống dòng: đổi CRLF↔LF LÀ đổi file. */
function bam(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Danh sách file migration, sắp theo version.
 *
 * Từ chối hai ca ngay tại đây, trước khi chạm database:
 *   · tên file không mở đầu bằng bốn chữ số — thứ tự áp sẽ thành thứ tự chuỗi ngẫu nhiên;
 *   · hai file cùng số — sổ lấy version làm khoá chính, nên hai file cùng số nghĩa là
 *     một trong hai VĨNH VIỄN không bao giờ được áp, và không ai biết là cái nào.
 */
function docThuMuc(dir) {
  if (!existsSync(dir)) {
    throw new Error(`Không thấy thư mục migration: ${dir}`);
  }
  const ds = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const theoVersion = new Map();
  const ketQua = [];
  for (const ten of ds) {
    const m = /^(\d{4})_/.exec(ten);
    if (!m) {
      throw new Error(
        `Tên file migration sai quy ước: ${ten}. Phải mở đầu bằng bốn chữ số + dấu gạch dưới (0001_…).`,
      );
    }
    const version = m[1];
    if (theoVersion.has(version)) {
      throw new Error(
        `Hai file cùng số ${version}: ${theoVersion.get(version)} và ${ten}. ` +
          `Sổ ghi lấy version làm khoá chính nên một trong hai sẽ KHÔNG BAO GIỜ được áp.`,
      );
    }
    theoVersion.set(version, ten);
    const noiDung = readFileSync(join(dir, ten));
    ketQua.push({
      version,
      ten,
      duongDan: join(dir, ten),
      noiDung,
      sql: noiDung.toString("utf8"),
      checksum: bam(noiDung),
    });
  }
  return ketQua;
}

// ---------------------------------------------------------------------------
// Bóc tách hình dạng file — xem mục "MỘT TRANSACTION THẬT"
// ---------------------------------------------------------------------------

/** Chuỗi thành literal SQL an toàn (nhân đôi nháy đơn). Dùng cho khối gửi một lượt. */
function lit(s) {
  if (s === null || s === undefined) return "null";
  const t = String(s);
  if (t.includes("\0")) throw new Error("Chuỗi chứa ký tự NUL — từ chối dựng câu SQL.");
  return `'${t.replace(/'/g, "''")}'`;
}

/**
 * Trả về { kieu, chenTai } cho một file.
 *
 *   kieu = 'transaction'  → chèn câu ghi sổ vào TRƯỚC dòng `commit;` cuối (chỉ số dòng
 *                           trong mảng dòng), để migration và dòng sổ chung một transaction.
 *   kieu = 'khong-tx'     → file tự khai không chạy được trong transaction; ghi sổ RỜI.
 *
 * Ném lỗi nếu file không thuộc hai dạng trên. Đây là một CỔNG, không phải một tiện ích:
 * một migration viết không có `begin;/commit;` sẽ chạy được bằng psql mà mất tính nguyên
 * tử với dòng sổ, và mất im lặng.
 */
function bocTachFile(f) {
  const dong = f.sql.split("\n");
  const laTrong = (d) => d.trim() === "" || d.trim().startsWith("--");

  if (f.sql.includes(DAU_HIEU_KHONG_TX)) {
    return { kieu: "khong-tx", chenTai: -1 };
  }

  const iBegin = dong.findIndex((d) => /^\s*begin\s*;\s*$/i.test(d));
  let iCommit = -1;
  for (let i = dong.length - 1; i >= 0; i--) {
    if (/^\s*commit\s*;\s*$/i.test(dong[i])) {
      iCommit = i;
      break;
    }
  }
  if (iBegin < 0 || iCommit < 0 || iCommit < iBegin) {
    throw new Error(
      `${f.ten}: không tìm thấy cặp \`begin;\` … \`commit;\` ở đầu/cuối file.\n` +
        `  Bộ chạy chèn dòng ghi sổ vào ngay trước \`commit;\` để migration và sổ nằm chung một\n` +
        `  transaction. File không theo hình dạng đó thì khai tường minh bằng dòng đánh dấu\n` +
        `  \`-- ${DAU_HIEU_KHONG_TX}\` (và tự chịu trách nhiệm về tính nguyên tử).`,
    );
  }
  // Sau `commit;` chỉ được còn chú thích/dòng trống. Có SQL sau đó nghĩa là phần SQL ấy
  // chạy NGOÀI transaction, và dòng sổ chèn trước `commit;` sẽ nói dối về nó.
  for (let i = iCommit + 1; i < dong.length; i++) {
    if (!laTrong(dong[i])) {
      throw new Error(
        `${f.ten}: còn lệnh SQL sau \`commit;\` (dòng ${i + 1}: ${dong[i].trim().slice(0, 60)}).\n` +
          `  Phần đó chạy ngoài transaction nên dòng sổ sẽ ghi "đã áp" cho thứ có thể chưa chạy xong.`,
      );
    }
  }
  return { kieu: "transaction", chenTai: iCommit, dong };
}

/** Câu INSERT ghi sổ. `batDau` là mốc ISO chụp ở phía Node ngay trước khi gửi. */
function cauGhiSo(f, batDau) {
  return (
    `insert into ops.schema_migrations (version, filename, checksum, duration_ms, nhan_no)\n` +
    `values (${lit(f.version)}, ${lit(f.ten)}, ${lit(f.checksum)},\n` +
    `        greatest(0, (extract(epoch from (clock_timestamp() - ${lit(batDau)}::timestamptz)) * 1000)::int),\n` +
    `        false);`
  );
}

// ---------------------------------------------------------------------------
// Sổ ghi
// ---------------------------------------------------------------------------

async function soCoChua(c) {
  const r = await c.query("select to_regclass('ops.schema_migrations') is not null as co");
  return r.rows[0].co;
}

async function coDoiTuongNghiepVu(c) {
  // `core.users` là bảng của 0002 — thứ chắc chắn có mặt trên mọi database đã migrate,
  // và chắc chắn KHÔNG có trên database rỗng. Đây là câu hỏi "database này đã sống chưa".
  const r = await c.query("select to_regclass('core.users') is not null as co");
  return r.rows[0].co;
}

async function docSo(c) {
  const r = await c.query(
    `select version, filename, checksum, applied_at, applied_by, duration_ms, nhan_no, ghi_chu
       from ops.schema_migrations order by version`,
  );
  return new Map(r.rows.map((x) => [x.version, x]));
}

/**
 * Đối chiếu đĩa với sổ. Trả về bốn nhóm — bốn nhóm này LÀ câu trả lời cho (a) và (c).
 */
function soSanh(files, so) {
  const daAp = [];
  const chuaAp = [];
  const lechBam = [];
  const matFile = [];
  for (const f of files) {
    const dong = so.get(f.version);
    if (!dong) {
      chuaAp.push(f);
    } else if (dong.checksum !== f.checksum) {
      lechBam.push({ f, dong });
    } else {
      daAp.push({ f, dong });
    }
  }
  const tren = new Set(files.map((f) => f.version));
  for (const [v, dong] of so) if (!tren.has(v)) matFile.push(dong);
  return { daAp, chuaAp, lechBam, matFile };
}

// ---------------------------------------------------------------------------
// ops.job_runs — sổ nhật ký chạy máy, dùng chung với mọi job khác
// ---------------------------------------------------------------------------
// CÓ ghi, vì câu hỏi "ai áp migration lên máy chủ lúc mấy giờ, kết quả gì" là đúng
// loại câu hỏi ops.job_runs sinh ra để trả lời. CỐ Ý KHÔNG khai vào ops.job_schedule:
// migration không có nhịp, nên khai vào đó là để ops.v_job_health (0041) báo "quá hạn"
// mỗi ngày không ai áp gì — một báo động giả mỗi ngày là cách nhanh nhất giết một
// bảng cảnh báo.
//
// Dòng 'running' ghi và COMMIT ngay (transaction riêng): nếu bộ chạy chết giữa chừng,
// dấu vết phải còn lại. Đây đúng bài học đã ghi trong tools/jobs/run-flag-engine.mjs.

async function moJobRun(c, lenhChay) {
  const r = await c.query("select to_regclass('ops.job_runs') is not null as co");
  if (!r.rows[0].co) return null; // database rỗng, chưa tới 0008 — không có chỗ ghi.
  const ins = await c.query(
    `insert into ops.job_runs (job_name, mode, status, metrics)
     values ('migrate', 'live', 'running', jsonb_build_object('lenh', $1::text))
     returning id`,
    [lenhChay],
  );
  return ins.rows[0].id;
}

/**
 * Ghi một dòng job_runs ĐÃ KẾT THÚC, cho ca `ops.job_runs` chưa tồn tại lúc mở lượt.
 *
 * Ca đó có thật và hay gặp nhất ở đúng lúc quan trọng nhất: dựng database mới từ số
 * không. Bảng `ops.job_runs` ra đời ở `0008`, tức là SAU khi lượt chạy đã bắt đầu —
 * nên nếu chỉ mở dòng ở đầu lượt thì chính lần dựng đầu tiên của một máy chủ mới là
 * lần DUY NHẤT không để lại dấu vết nào. Đo được: bỏ hàm này thì `hub_migrate_that_test`
 * dựng xong có 50 dòng sổ migration và 0 dòng ops.job_runs.
 */
async function ghiJobRunKetThuc(c, lenhChay, status, metrics) {
  const r = await c.query("select to_regclass('ops.job_runs') is not null as co").catch(() => null);
  if (!r || !r.rows[0].co) return;
  await c
    .query(
      `insert into ops.job_runs (job_name, mode, status, finished_at, metrics)
       values ('migrate', 'live', $1, now(), jsonb_build_object('lenh', $2::text) || $3::jsonb)`,
      [status, lenhChay, JSON.stringify(metrics)],
    )
    .catch(() => {});
}

async function dongJobRun(c, id, status, metrics) {
  if (id === null) return;
  await c
    .query(
      `update ops.job_runs
          set status = $2, finished_at = now(), metrics = metrics || $3::jsonb
        where id = $1`,
      [id, status, JSON.stringify(metrics)],
    )
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Áp một file
// ---------------------------------------------------------------------------

async function apDungMotFile(c, f) {
  const hinhDang = bocTachFile(f);
  const batDau = new Date().toISOString();
  const t0 = Date.now();

  if (hinhDang.kieu === "khong-tx") {
    console.log(`   ⚠ ${f.ten} tự khai '${DAU_HIEU_KHONG_TX}' — dòng sổ ghi RỜI, tính nguyên tử là trách nhiệm của file.`);
    await c.query(f.sql);
    await c.query(
      `insert into ops.schema_migrations (version, filename, checksum, duration_ms, nhan_no, ghi_chu)
       values ($1, $2, $3, $4, false, $5)`,
      [f.version, f.ten, f.checksum, Date.now() - t0, `chạy ngoài transaction (${DAU_HIEU_KHONG_TX})`],
    );
    return Date.now() - t0;
  }

  const dong = hinhDang.dong.slice();
  dong.splice(hinhDang.chenTai, 0, "", cauGhiSo(f, batDau), "");
  // Gửi MỘT lượt: `begin;` của chính file mở transaction, câu ghi sổ nằm ngay trước
  // `commit;` của chính file. Hỏng bất kỳ đâu ⇒ Postgres cuốn cả hai đi.
  await c.query(dong.join("\n"));
  return Date.now() - t0;
}

// ---------------------------------------------------------------------------
// In ấn
// ---------------------------------------------------------------------------

function inDoiChieu({ daAp, chuaAp, lechBam, matFile }) {
  for (const { f, dong } of daAp) {
    const nhan = dong.nhan_no ? "nhận nợ" : `${dong.duration_ms} ms`;
    console.log(`   ✓ ${f.ten}  — đã áp (${nhan}, ${new Date(dong.applied_at).toISOString()})`);
  }
  for (const f of chuaAp) console.log(`   · ${f.ten}  — CHƯA áp`);
  for (const { f, dong } of lechBam) {
    console.log(`   ✗ ${f.ten}  — LỆCH BĂM`);
    console.log(`       sổ ghi : ${dong.checksum}`);
    console.log(`       trên đĩa: ${f.checksum}`);
  }
  for (const dong of matFile) {
    console.log(`   ✗ ${dong.version} (${dong.filename}) — CÓ TRONG SỔ MÀ MẤT FILE trên đĩa`);
  }
}

function inKetLuanHong({ lechBam, matFile }) {
  if (lechBam.length > 0) {
    console.error("");
    console.error("TU CHOI CHAY — có migration ĐÃ ÁP mà nội dung trên đĩa đã đổi.");
    console.error("  Đây là ca im lặng nhất: file đã có trong sổ nên KHÔNG được chạy lại, nghĩa là");
    console.error("  database giữ hành vi CŨ trong khi kho mô tả hành vi MỚI, và không lỗi nào nổ ra.");
    console.error("  Hai đường ra, chọn một — KHÔNG có đường thứ ba là sửa cột checksum trong sổ:");
    console.error("    1. Hoàn nguyên file về đúng nội dung đã áp (git diff sẽ chỉ ra chỗ sửa).");
    console.error("    2. Nếu thay đổi là cần thiết: viết một migration MỚI mang thay đổi đó.");
  }
  if (matFile.length > 0) {
    console.error("");
    console.error("TU CHOI CHAY — có dòng trong sổ mà không còn file trên đĩa.");
    console.error("  Xoá một migration đã áp là xoá bản mô tả của thứ đang chạy trong database.");
    console.error("  Khôi phục file (git), hoặc dùng --dir trỏ đúng thư mục migration.");
  }
}

// ---------------------------------------------------------------------------
// Lệnh
// ---------------------------------------------------------------------------

async function lenhStatus(c, files) {
  if (!(await soCoChua(c))) {
    const daSong = await coDoiTuongNghiepVu(c);
    console.log("Sổ ghi ops.schema_migrations CHƯA TỒN TẠI.");
    console.log(
      daSong
        ? `  Database này đã có đối tượng nghiệp vụ (core.users tồn tại) ⇒ ${files.length} file trên đĩa\n` +
            "  nhiều khả năng đã áp bằng tay. Bước tiếp theo là NHẬN NỢ BAN ĐẦU:\n" +
            `    node tools/migrate/migrate.mjs baseline --to=<số cuối đã áp>`
        : "  Database rỗng ⇒ chạy `up` là dựng lại từ đầu, không cần baseline.",
    );
    return daSong ? 1 : 0;
  }
  const so = await docSo(c);
  const kq = soSanh(files, so);
  console.log(`Thư mục : ${thuMuc}`);
  console.log(
    `Sổ ghi  : ${so.size} dòng (${[...so.values()].filter((x) => x.nhan_no).length} nhận nợ)`,
  );
  console.log(
    `Trên đĩa: ${files.length} file — ${kq.daAp.length} đã áp · ${kq.chuaAp.length} chưa áp · ` +
      `${kq.lechBam.length} lệch băm · ${kq.matFile.length} mất file`,
  );
  console.log("");
  inDoiChieu(kq);
  inKetLuanHong(kq);
  return kq.lechBam.length > 0 || kq.matFile.length > 0 ? 1 : 0;
}

async function lenhUp(c, files) {
  // File mồi đã chạy NGOÀI THỨ TỰ trong lượt này (nếu có) — xem mục "chạy lại file mồi"
  // ở cuối hàm.
  let moiNgoaiThuTu = null;

  // ── Mồi sổ ────────────────────────────────────────────────────────────────
  if (!(await soCoChua(c))) {
    if (await coDoiTuongNghiepVu(c)) {
      // ĐÂY LÀ CỔNG QUAN TRỌNG NHẤT CỦA CẢ FILE. Xem mục "NHẬN NỢ BAN ĐẦU".
      console.error("TU CHOI CHAY — sổ ghi chưa tồn tại nhưng database ĐÃ có đối tượng nghiệp vụ.");
      console.error("  Sổ trống KHÔNG có nghĩa 'chưa áp gì'. Chạy `up` lúc này sẽ áp lại toàn bộ");
      console.error(`  ${files.length} file lên một database đã có sẵn mọi thứ.`);
      console.error("  Nhận nợ ban đầu trước:");
      console.error("    node tools/migrate/migrate.mjs baseline --to=<số migration cuối đã áp tay>");
      return 1;
    }
    const moi = files.find((f) => f.sql.includes(DAU_HIEU_SO_GHI));
    if (!moi) {
      console.error(
        `TU CHOI CHAY — sổ chưa tồn tại và không file nào trong ${thuMuc} mang dấu hiệu '${DAU_HIEU_SO_GHI}'.`,
      );
      return 1;
    }
    console.log(`── Mồi sổ: chạy ${moi.ten} TRƯỚC (database rỗng, chưa có chỗ ghi)`);
    if (laThu) {
      console.log("   (dry-run — không chạy)");
    } else {
      await apDungMotFile(c, moi);
      moiNgoaiThuTu = moi;
    }
  }

  if (laThu && !(await soCoChua(c))) {
    console.log("DRY-RUN dừng ở đây: sổ chưa tồn tại nên không đối chiếu tiếp được.");
    return 0;
  }

  const so = await docSo(c);
  const kq = soSanh(files, so);

  if (kq.lechBam.length > 0 || kq.matFile.length > 0) {
    inDoiChieu(kq);
    inKetLuanHong(kq);
    return 1;
  }

  if (kq.chuaAp.length === 0) {
    console.log(`Không có gì để áp — ${kq.daAp.length}/${files.length} file đã ở trong sổ.`);
    await chayLaiFileMoi(c, moiNgoaiThuTu);
    return 0;
  }

  console.log(`Sẽ áp ${kq.chuaAp.length} file:`);
  for (const f of kq.chuaAp) console.log(`   · ${f.ten}`);
  if (laThu) {
    console.log("DRY-RUN — không câu lệnh nào được gửi, không dòng sổ nào được ghi.");
    return 0;
  }

  const daChay = [];
  for (const f of kq.chuaAp) {
    process.stdout.write(`   → ${f.ten} … `);
    const ms = await apDungMotFile(c, f);
    daChay.push(f.ten);
    console.log(`${ms} ms`);
  }
  console.log(`OK — áp xong ${daChay.length} file.`);
  await chayLaiFileMoi(c, moiNgoaiThuTu);
  return 0;
}

/**
 * Chạy LẠI file mồi sau khi mọi file khác đã áp — chỉ khi nó vừa chạy NGOÀI THỨ TỰ.
 *
 * Vì sao cần, và đây là một khác biệt ĐO ĐƯỢC chứ không phải lo xa: file mồi phải
 * chạy trước `0001`, mà `0001` mới là chỗ tạo vai `backup_reader`. Câu
 * `grant select on ops.schema_migrations to backup_reader` trong file mồi vì thế bị
 * bọc trong kiểm tra vai tồn tại và bị BỎ QUA ở lần chạy đầu. Không có bước này thì
 * một database dựng bằng `up` thiếu đúng một quyền so với database dựng bằng
 * `tools/run-db-tests.sh` (chạy đúng thứ tự tên file) — hai đường dựng ra hai kết
 * quả khác nhau là loại lệch tệ nhất, vì bài test chạy trên đường này còn máy chủ
 * chạy trên đường kia.
 *
 * Gửi NGUYÊN VĂN file, KHÔNG chèn dòng ghi sổ: dòng đó đã có, chèn nữa là vi phạm
 * khoá chính. An toàn vì file mồi idempotent theo thiết kế (`create … if not exists`,
 * `comment on`, `grant`) — pgTAP `0050` ghim lại tính chất đó.
 */
async function chayLaiFileMoi(c, moi) {
  if (!moi) return;
  console.log(`── Chạy lại ${moi.ten} (lần đầu nó chạy trước 0001 nên GRANT cho backup_reader bị bỏ qua)`);
  await c.query(moi.sql);
}

async function lenhBaseline(c, files) {
  if (!den || !/^\d{4}$/.test(den)) {
    console.error("Thiếu --to=NNNN (bốn chữ số). Nhận nợ tới đâu là quyết định của người vận hành,");
    console.error("  không phải thứ công cụ được phép đoán: đoán thừa một file là file đó không bao");
    console.error("  giờ chạy, đoán thiếu một file là nó chạy lại lên database đã có.");
    return 1;
  }

  if (!(await coDoiTuongNghiepVu(c))) {
    // Cổng đối xứng với cổng của `up`. Xem mục "NHẬN NỢ BAN ĐẦU".
    console.error("TU CHOI NHAN NO — database này RỖNG (không có core.users).");
    console.error("  Nhận một món nợ mình không có nghĩa là lần `up` kế tiếp sẽ BỎ QUA đúng những");
    console.error("  file chưa bao giờ chạy — và chỉ lộ ra khi ứng dụng gọi một bảng không tồn tại.");
    console.error("  Database rỗng thì chạy thẳng: node tools/migrate/migrate.mjs up");
    return 1;
  }

  if (!(await soCoChua(c))) {
    const moi = files.find((f) => f.sql.includes(DAU_HIEU_SO_GHI));
    if (!moi) {
      console.error(`Không file nào trong ${thuMuc} mang dấu hiệu '${DAU_HIEU_SO_GHI}' — không dựng được sổ.`);
      return 1;
    }
    console.log(`── Sổ chưa có: chạy ${moi.ten} để dựng (file này idempotent, create … if not exists)`);
    if (laThu) console.log("   (dry-run — không chạy)");
    else await apDungMotFile(c, moi);
    if (laThu) {
      console.log("DRY-RUN dừng ở đây: sổ chưa tồn tại nên không ghi nhận nợ được.");
      return 0;
    }
  }

  const so = await docSo(c);
  const nhan = files.filter((f) => f.version <= den && !so.has(f.version));
  const boQua = files.filter((f) => f.version <= den && so.has(f.version));

  if (nhan.length === 0) {
    console.log(`Không có gì để nhận nợ — mọi file ≤ ${den} đã có trong sổ.`);
    return 0;
  }

  console.log(`Sẽ ghi NHẬN NỢ (nhan_no = true, KHÔNG chạy file) cho ${nhan.length} file:`);
  for (const f of nhan) console.log(`   · ${f.ten}`);
  if (boQua.length > 0) console.log(`   (bỏ qua ${boQua.length} file đã có trong sổ)`);
  const sauDen = files.filter((f) => f.version > den);
  if (sauDen.length > 0) {
    console.log(`   Còn ${sauDen.length} file > ${den} sẽ do lệnh \`up\` chạy thật.`);
  }
  if (laThu) {
    console.log("DRY-RUN — không dòng nào được ghi.");
    return 0;
  }

  // Một transaction cho cả mẻ: nhận nợ nửa vời còn tệ hơn không nhận, vì lúc đó sổ
  // vừa nói dối vừa không nói đủ.
  await c.query("begin");
  try {
    for (const f of nhan) {
      await c.query(
        `insert into ops.schema_migrations (version, filename, checksum, nhan_no, ghi_chu)
         values ($1, $2, $3, true, $4)`,
        [f.version, f.ten, f.checksum, ghiChu ?? `nhận nợ ban đầu tới ${den} (DEBT #23)`],
      );
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  }
  console.log(`OK — đã nhận nợ ${nhan.length} file. Chạy \`status\` để xem lại.`);
  return 0;
}

// ---------------------------------------------------------------------------
// Chạy
// ---------------------------------------------------------------------------

async function main() {
  const files = docThuMuc(thuMuc);
  const pool = new pg.Pool({ connectionString: chuoiKetNoi });
  // Giờ Việt Nam, không phải UTC — đúng khuôn packages/core/db/client.ts, và
  // `tests/unit/mui-gio.test.ts` quét cả cây để bắt file nào quên (nó đã bắt file
  // này ở bản nháp đầu). Không phải nghi thức: `applied_at` của sổ ghi là câu trả
  // lời cho "ai áp lúc mấy giờ", mà Postgres mặc định chạy UTC. Áp migration lúc
  // 01:30 sáng giờ VN sẽ được ghi là 18:30 NGÀY HÔM TRƯỚC — lệch đúng một ngày, im
  // lặng, và chỉ lộ ra lúc dựng lại dòng thời gian của một sự cố.
  pool.on("connect", (client) => {
    client.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
  });
  const c = await pool.connect();
  let jobId = null;
  try {
    if (lenh !== "status" && !laThu) jobId = await moJobRun(c, lenh);
    let ma;
    if (lenh === "status") ma = await lenhStatus(c, files);
    else if (lenh === "up") ma = await lenhUp(c, files);
    else ma = await lenhBaseline(c, files);
    const trangThai = ma === 0 ? "success" : "failed";
    const soLieu = { ket_qua: ma === 0 ? "ok" : "tu_choi" };
    if (jobId !== null) await dongJobRun(c, jobId, trangThai, soLieu);
    else if (lenh !== "status" && !laThu) await ghiJobRunKetThuc(c, lenh, trangThai, soLieu);
    return ma;
  } catch (err) {
    // ROLLBACK TRƯỚC, rồi mới ghi sổ nhật ký. Migration hỏng giữa chừng để lại một
    // transaction ĐANG MỞ VÀ ĐÃ HỎNG trên kết nối này (`begin;` là của chính file);
    // mọi câu lệnh tiếp theo nhận "current transaction is aborted" và bị `.catch()`
    // của dongJobRun nuốt mất. Đo được: bỏ dòng này thì dòng ops.job_runs kẹt ở
    // 'running' vĩnh viễn — một job chết trông y hệt một job đang chạy.
    await c.query("rollback").catch(() => {});
    const loi = { error: String(err && err.message ? err.message : err) };
    if (jobId !== null) await dongJobRun(c, jobId, "failed", loi);
    else if (lenh !== "status" && !laThu) await ghiJobRunKetThuc(c, lenh, "failed", loi);
    throw err;
  } finally {
    c.release();
    await pool.end();
  }
}

main()
  .then((ma) => process.exit(ma))
  .catch((err) => {
    console.error("");
    console.error(`HONG: ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
