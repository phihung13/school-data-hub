#!/usr/bin/env node
// tools/jobs/run-nap-danh-sach.mjs
//
// NẠP DANH SÁCH HỌC SINH từ file CSV của nhà trường vào Hub.
//
// KHÔNG PHẢI JOB THEO LỊCH. Nó cần một file do trường gửi, hai tham số do người vận
// hành gõ, và một người đọc sổ lỗi sau đó — không có file thì không có gì để chạy.
// Vì thế nó CỐ Ý không có dòng nào trong ops.job_schedule (lý do dài nằm ở mục 8 của
// migration 0045). Nhưng nó VẪN ghi sổ qua ops.start_job_run/finish_job_run như mọi
// job khác, nên câu hỏi "lần nạp gần nhất lúc nào, bao nhiêu lỗi" luôn trả lời được.
// Cùng hình dạng với run-anonymize-user.mjs (0033): có sổ, không có lịch.
//
// BA BƯỚC TÁCH BẠCH, không được gộp (§8):
//   1. Đọc file  → chỉ INSERT vào staging.raw_cor_imports. Không chạm schema nghiệp vụ.
//   2. promote() → core.promote_cor_row() quyết định vào kho hay vào sổ lỗi.
//   3. Đối soát  → core.doi_soat_vang_mat() ghi ra danh sách em có trong sổ mà không
//                  có trong file. CHỈ GHI DANH SÁCH, tuyệt đối không tự cho nghỉ học.
//
// Chạy:
//   DATABASE_URL=postgres://... node tools/jobs/run-nap-danh-sach.mjs \
//     --file=./danh-sach-khoi-6.csv --nam-hoc=2026-2027 --hieu-luc-tu=2026-09-05
//
//   ... --dry-run          chạy thật rồi hoàn tác; in đúng con số của lần chạy thật
//   ... --tao-lop-moi      cho phép tạo lớp chưa có (in danh sách lớp sẽ tạo TRƯỚC)
//
// Mã thoát — ba con số, cố ý không phải hai:
//   0  nạp sạch, không dòng nào vào sổ lỗi.
//   1  DỪNG hoặc hỏng: file không đọc được, thiếu cột, tham số sai, hoặc số lỗi vượt
//      ngưỡng staging.import_limits. Kho chính có thể đã nhận một phần — chạy lại
//      cùng file sau khi sửa là an toàn (§9).
//   2  chạy xong tới dòng cuối NHƯNG có dòng nằm trong hàng đợi chờ người xử. Không
//      phải lỗi kỹ thuật, nhưng cũng KHÔNG phải "xong". Gộp nó vào 0 là biến một
//      hàng đợi có người chờ thành một màn hình xanh.
//
// "MỘT PHẦN" Ở MÃ 1 NGHĨA LÀ GÌ — đọc kỹ, vì nó KHÔNG có nghĩa là "dòng vào một nửa".
// Từ 0048, mỗi DÒNG là một đơn vị trọn vẹn: dòng nào trả 'promoted' thì vào trọn,
// dòng nào trả 'import_error' thì core.students/core.classes/core.enrollments không
// đổi một cột nào (khối con trong core.promote_cor_row hoàn tác sạch). "Một phần" ở
// đây chỉ là "job đọc tới dòng thứ k rồi dừng": các dòng 1..k đã xong trọn vẹn, các
// dòng k+1..n chưa được chạm tới. Không có dòng nào ở giữa hai trạng thái đó.
//
// Nhờ vậy con số "Đã vào kho" in ở cuối là con số ĐẦY ĐỦ của những gì kho đã nhận —
// trước 0048 thì không: một dòng bị từ chối vẫn kịp ghi đè họ tên và ngày sinh của
// em, nên "Đã vào kho: 0" là một câu nói dối (đo được 01/08/2026, xem đầu file
// migrations/0048_nap_mot_dong_la_mot_don_vi.sql).

import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// `pg` là dependency của @hub/core chứ không của gốc workspace, và ESM phân giải theo
// VỊ TRÍ FILE — neo require vào package.json của @hub/core (xem run-all.mjs:39).
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const NGUON = "cor";
const JOB_NAME = "nap_danh_sach";

/** Sáu cột nhà trường phải ghi ra. Thiếu MỘT cột là dừng cả job — xem lý do ở CỘT BẮT BUỘC. */
const COT_BAT_BUOC = ["ma_hoc_sinh", "ho_ten", "ngay_sinh", "ma_co_so", "ma_lop", "khoi"];

// ---------------------------------------------------------------------------
// Tham số dòng lệnh
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const co = (c) => argv.includes(c);
const lay = (ten) => {
  const f = argv.find((a) => a.startsWith(`${ten}=`));
  return f ? f.slice(ten.length + 1) : null;
};

if (co("--help") || co("-h")) {
  console.log(
    [
      "node tools/jobs/run-nap-danh-sach.mjs --file=<đường dẫn.csv> --nam-hoc=YYYY-YYYY --hieu-luc-tu=YYYY-MM-DD",
      "",
      "  --file=          File CSV do nhà trường gửi (UTF-8, dấu phẩy).",
      "  --nam-hoc=       Năm học của cả file, ví dụ 2026-2027 → core.classes.academic_year.",
      "  --hieu-luc-tu=   Ngày kỳ ghi danh bắt đầu, ví dụ 2026-09-05 → core.enrollments.valid_from.",
      "  --tao-lop-moi    Cho phép tạo lớp chưa tồn tại. Mặc định KHÔNG — một lỗi gõ '6A11'",
      "                   thay '6A1' phải kêu lên chứ không được đẻ ra một lớp ma.",
      "  --dry-run        Chạy thật rồi hoàn tác. In đúng con số của lần chạy thật.",
      "",
      "Sáu cột bắt buộc trong file: " + COT_BAT_BUOC.join(", "),
      "  ngay_sinh và khoi ĐƯỢC PHÉP để trống, nhưng CỘT phải có mặt.",
      "",
      "Vì sao --nam-hoc và --hieu-luc-tu là tham số dòng lệnh chứ không phải cột:",
      "  cả file dùng chung một giá trị; đưa vào từng dòng là mời gõ sai 900 lần.",
      "",
      "Cần DATABASE_URL. Xem tools/jobs/README.md mục 'Nạp danh sách cả khối'.",
    ].join("\n"),
  );
  process.exit(0);
}

const DRY_RUN = co("--dry-run");
const TAO_LOP_MOI = co("--tao-lop-moi");

const CO_HOP_LE = ["--dry-run", "--tao-lop-moi", "--help", "-h"];
const CO_CO_GIA_TRI = ["--file", "--nam-hoc", "--hieu-luc-tu"];
const la = argv.filter(
  (a) => !CO_HOP_LE.includes(a) && !CO_CO_GIA_TRI.some((k) => a.startsWith(`${k}=`)),
);
if (la.length > 0) {
  console.error(`Tham số không hiểu: ${la.join(", ")}. Xem --help.`);
  process.exit(1);
}

function dungLai(thongDiep) {
  console.error(`DỪNG — ${thongDiep}`);
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  dungLai("thiếu DATABASE_URL. Xem tools/jobs/README.md.");
}

const duongDanFile = lay("--file");
if (!duongDanFile) dungLai("thiếu --file. Xem --help.");
const FILE = resolve(process.cwd(), duongDanFile);
if (!existsSync(FILE) || !statSync(FILE).isFile()) {
  dungLai(`không đọc được file: ${FILE}`);
}

// Năm học phải là hai năm LIỀN NHAU. '2026-2028' hay '2026-2026' lọt qua thì cả file
// nằm dưới một academic_year không có thật, và không có gì trong DB bắt được điều đó
// (core.classes.academic_year là text trần).
const NAM_HOC = lay("--nam-hoc");
if (!NAM_HOC || !/^\d{4}-\d{4}$/.test(NAM_HOC)) {
  dungLai("--nam-hoc phải có dạng YYYY-YYYY, ví dụ 2026-2027.");
}
{
  const [a, b] = NAM_HOC.split("-").map(Number);
  if (b !== a + 1) dungLai(`--nam-hoc=${NAM_HOC} không phải hai năm liền nhau.`);
}

const HIEU_LUC_TU = lay("--hieu-luc-tu");
if (!HIEU_LUC_TU || !/^\d{4}-\d{2}-\d{2}$/.test(HIEU_LUC_TU)) {
  dungLai("--hieu-luc-tu phải có dạng YYYY-MM-DD, ví dụ 2026-09-05.");
}
{
  // `new Date('2026-02-31')` KHÔNG ném lỗi trong JavaScript, nó trượt sang 03/03.
  // Không kiểm ở đây thì cả lô ghi danh từ một ngày không tồn tại, và Postgres nhận
  // nó vui vẻ vì lúc đó chuỗi đã bị JS nắn thành ngày hợp lệ.
  const d = new Date(`${HIEU_LUC_TU}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== HIEU_LUC_TU) {
    dungLai(`--hieu-luc-tu=${HIEU_LUC_TU} không phải một ngày có thật.`);
  }
}

// ---------------------------------------------------------------------------
// Đọc CSV
// ---------------------------------------------------------------------------
/**
 * Bộ đọc CSV tối thiểu nhưng đúng: hiểu dấu nháy kép bao quanh, dấu phẩy bên trong
 * nháy, nháy đôi thoát (""), và cả CRLF lẫn LF.
 *
 * Vì sao không `line.split(",")`: file xuất từ Excel của trường gần như chắc chắn có
 * một cái tên kiểu "Nguyễn Văn A, Jr" hoặc một địa chỉ có dấu phẩy. Tách thô làm lệch
 * TOÀN BỘ các cột phía sau của đúng dòng đó — mà cột phía sau là mã lớp. Lệch im lặng,
 * và kết quả là một em bị ghi danh vào lớp của cột kế bên.
 */
function docCsv(vanBan) {
  const rows = [];
  let o = [];
  let cur = "";
  let trongNhay = false;
  for (let i = 0; i < vanBan.length; i++) {
    const c = vanBan[i];
    if (trongNhay) {
      if (c === '"') {
        if (vanBan[i + 1] === '"') { cur += '"'; i++; }
        else trongNhay = false;
      } else cur += c;
      continue;
    }
    if (c === '"') { trongNhay = true; continue; }
    if (c === ",") { o.push(cur); cur = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { o.push(cur); rows.push(o); o = []; cur = ""; continue; }
    cur += c;
  }
  if (cur !== "" || o.length > 0) { o.push(cur); rows.push(o); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const noiDungGoc = readFileSync(FILE);
// BOM của Excel: không bỏ thì tên cột đầu tiên thành "﻿ma_hoc_sinh" và job dừng
// với câu "thiếu cột ma_hoc_sinh" trong khi cột đó nằm sờ sờ trong file.
const noiDung = noiDungGoc.toString("utf8").replace(/^﻿/, "");
const bang = docCsv(noiDung);
if (bang.length < 2) dungLai("file không có dòng dữ liệu nào (chỉ có tiêu đề, hoặc rỗng).");

const tieuDe = bang[0].map((h) => h.trim().toLowerCase());
const thieuCot = COT_BAT_BUOC.filter((c) => !tieuDe.includes(c));
if (thieuCot.length > 0) {
  // DỪNG CẢ JOB, một trong ba ca duy nhất được phép dừng: hỏng ở mức CẢ LÔ. Đoán hộ
  // một cột thiếu là đoán hộ cho cả nghìn em.
  dungLai(
    `file thiếu cột bắt buộc: ${thieuCot.join(", ")}.\n` +
      `  Tiêu đề đọc được: ${tieuDe.join(", ")}\n` +
      `  Sáu cột bắt buộc: ${COT_BAT_BUOC.join(", ")} (ngay_sinh và khoi được để trống, nhưng cột phải có).`,
  );
}

const viTri = Object.fromEntries(COT_BAT_BUOC.map((c) => [c, tieuDe.indexOf(c)]));

/**
 * MÃ LÔ — khoá của tầng chống trùng FILE.
 *
 * Băm cả NỘI DUNG FILE lẫn hai tham số: nạp lại y hệt ⇒ cùng mã lô ⇒ staging chặn ở
 * cửa (§9). Đổi một tham số (ví dụ nạp lại đúng file đó nhưng --hieu-luc-tu khác) là
 * một Ý ĐỊNH KHÁC, phải sinh mã lô mới — nếu không thì lần chạy thứ hai im lặng không
 * làm gì và người vận hành tưởng đã đổi được ngày hiệu lực.
 */
const MA_LO = createHash("sha256")
  .update(noiDungGoc)
  .update(`|${NAM_HOC}|${HIEU_LUC_TU}`)
  .digest("hex")
  .slice(0, 12);

// ---------------------------------------------------------------------------
// Soát trùng mã TRONG CÙNG MỘT FILE — việc này chỉ làm được ở đây
// ---------------------------------------------------------------------------
// promote() nhìn từng dòng một nên không bao giờ thấy được "hai dòng cùng mã". Đây là
// thuộc tính của CẢ FILE, phải soát trước khi đưa dòng nào vào staging.
//
// Luật: trùng TÊN mà khác mã KHÔNG phải lỗi (mã mới là khoá, trường có hai em cùng tên
// là chuyện thường). Trùng MÃ mà khác tên thì BỎ QUA CẢ HAI DÒNG — giữ lại một dòng là
// tự chọn hộ nhà trường xem em nào mới là em thật.
const dong = [];
for (let i = 1; i < bang.length; i++) {
  const r = bang[i];
  const o = (ten) => (r[viTri[ten]] ?? "").trim();
  dong.push({
    soDong: i + 1, // số dòng NGƯỜI thấy khi mở file: 1 là tiêu đề
    ma_hoc_sinh: o("ma_hoc_sinh"),
    ho_ten: o("ho_ten"),
    ngay_sinh: o("ngay_sinh"),
    ma_co_so: o("ma_co_so"),
    ma_lop: o("ma_lop"),
    khoi: o("khoi"),
  });
}

const theoMa = new Map();
for (const d of dong) {
  if (!d.ma_hoc_sinh) continue;
  if (!theoMa.has(d.ma_hoc_sinh)) theoMa.set(d.ma_hoc_sinh, []);
  theoMa.get(d.ma_hoc_sinh).push(d);
}
const maXungDot = new Map(); // mã -> các dòng, khi cùng mã khác tên
let trungGiongNhau = 0;
for (const [ma, ds] of theoMa) {
  if (ds.length === 1) continue;
  const ten = new Set(ds.map((d) => d.ho_ten));
  if (ten.size === 1) trungGiongNhau += ds.length - 1; // cùng mã cùng tên: giữ dòng đầu
  else maXungDot.set(ma, ds);
}

// ---------------------------------------------------------------------------
// Thân chương trình
// ---------------------------------------------------------------------------
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
pool.on("connect", (c) => {
  // Giờ Việt Nam, cùng lựa chọn với run-all.mjs:238 và run-flag-engine.mjs:62.
  // now() ghi vào promoted_at/failed_at phải là giờ người vận hành đang nhìn đồng hồ.
  c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
});

const dem = {
  dong_trong_file: dong.length,
  promoted: 0,
  already_promoted: 0,
  already_failed: 0,
  import_error: 0,
  raw_not_found: 0,
  trung_ma_khac_ten: 0,
  trung_giong_nhau: trungGiongNhau,
  vang_mat: 0,
  dung_giua_chung: false,
};

async function main() {
  const client = await pool.connect();
  let runId = null;
  try {
    // Ngưỡng dừng lô đọc TỪ BẢNG (mệnh lệnh 7). Hàm ném lỗi nếu nguồn chưa khai —
    // và nó phải nổ ở ĐÂY, trước khi ghi dòng đầu tiên, chứ không phải ở dòng 500.
    const { rows: ng } = await client.query("select staging.nguong_loi_nap($1) as n", [NGUON]);
    const NGUONG = Number(ng[0].n);

    console.log(`File            : ${FILE}`);
    console.log(`Mã lô           : ${MA_LO}  (băm nội dung file + năm học + ngày hiệu lực)`);
    console.log(`Năm học         : ${NAM_HOC}`);
    console.log(`Hiệu lực từ     : ${HIEU_LUC_TU}`);
    console.log(`Số dòng dữ liệu : ${dong.length}`);
    console.log(`Ngưỡng dừng lô  : ${NGUONG} dòng lỗi (staging.import_limits, RB-09)`);
    console.log(`Tạo lớp mới     : ${TAO_LOP_MOI ? "CÓ (--tao-lop-moi)" : "không"}`);
    if (DRY_RUN) console.log("CHẾ ĐỘ          : DRY-RUN — mọi thứ sẽ được hoàn tác ở cuối");
    console.log("");

    // Nói TRƯỚC khi làm: những lớp chưa có mà sắp được tạo.
    if (TAO_LOP_MOI) {
      const canTao = await client.query(
        `select distinct d.ma_co_so, d.ma_lop, d.khoi
           from jsonb_to_recordset($1::jsonb) as d(ma_co_so text, ma_lop text, khoi text)
           left join core.schools s on s.code = d.ma_co_so
           left join core.classes c on c.school_id = s.id and c.code = d.ma_lop
                                   and c.academic_year = $2
          where s.id is not null and c.id is null
          order by d.ma_co_so, d.ma_lop`,
        [JSON.stringify(dong.map((d) => ({ ma_co_so: d.ma_co_so, ma_lop: d.ma_lop, khoi: d.khoi }))), NAM_HOC],
      );
      if (canTao.rows.length > 0) {
        console.log(`SẼ TẠO ${canTao.rows.length} LỚP MỚI — đọc kỹ trước khi để job chạy tiếp:`);
        for (const r of canTao.rows) console.log(`  · ${r.ma_co_so} / ${r.ma_lop} (khối ${r.khoi || "THIẾU"})`);
        console.log("");
      }
    }

    if (DRY_RUN) await client.query("begin");

    // Sổ chạy job. Mở TRƯỚC khi ghi: tiến trình chết giữa chừng vẫn để lại dấu vết cho
    // ops.reap_stale_runs() nhặt (0041). Với dry-run thì dòng này cũng bị hoàn tác —
    // một lần thử không được để lại dấu vết của một lần nạp thật.
    const { rows: r0 } = await client.query("select ops.start_job_run($1) as id", [JOB_NAME]);
    runId = r0[0].id;

    // ── Trùng mã khác tên: ghi sổ CẢ HAI dòng, bỏ qua cả hai ──────────────────
    const maBoQua = new Set();
    for (const [ma, ds] of maXungDot) {
      maBoQua.add(ma);
      dem.trung_ma_khac_ten += ds.length;
      await client.query("select staging.ghi_loi_nap($1, $2, $3::jsonb)", [
        `${MA_LO}:${ma}`,
        "trùng mã học sinh trong cùng một file nhưng khác họ tên — bỏ qua CẢ HAI dòng, nhà trường xác nhận rồi nạp lại",
        JSON.stringify({
          ma_lo: MA_LO,
          ma_hoc_sinh: ma,
          ho_ten: ds.map((d) => d.ho_ten).join(" | "),
          dong_trong_file: ds[0].soDong,
          cac_dong: ds.map((d) => ({ dong_trong_file: d.soDong, ho_ten: d.ho_ten, ma_lop: d.ma_lop })),
          giai_thich:
            "Giữ lại một trong hai dòng là tự chọn hộ nhà trường xem em nào mới là em thật. Hệ không có căn cứ nào để chọn.",
        }),
      ]);
    }

    // ── Từng dòng: staging → promote ─────────────────────────────────────────
    const daThay = new Set();
    for (const d of dong) {
      if (d.ma_hoc_sinh && maBoQua.has(d.ma_hoc_sinh)) continue;
      // Cùng mã cùng tên xuất hiện hai lần: dòng thứ hai không thêm thông tin gì.
      if (d.ma_hoc_sinh && daThay.has(d.ma_hoc_sinh)) continue;
      if (d.ma_hoc_sinh) daThay.add(d.ma_hoc_sinh);

      // Dòng thiếu mã vẫn phải có external_id ỔN ĐỊNH, nếu không thì mỗi lần nạp lại
      // nó sinh một bản ghi thô mới và §9 vỡ ở đúng chỗ dữ liệu đã hỏng sẵn.
      const externalId = `${MA_LO}:${d.ma_hoc_sinh || `dong-${d.soDong}`}`;
      const payload = {
        ma_hoc_sinh: d.ma_hoc_sinh,
        ho_ten: d.ho_ten,
        ngay_sinh: d.ngay_sinh,
        ma_co_so: d.ma_co_so,
        ma_lop: d.ma_lop,
        khoi: d.khoi,
        // Ba trường dưới không có trong file mà đến từ tham số/ngữ cảnh. Chép vào
        // payload có chủ ý: bản ghi thô phải TỰ ĐỦ để promote() gọi lại được từ psql
        // lúc sự cố, không cần ai nhớ hôm đó gõ tham số gì.
        nam_hoc: NAM_HOC,
        hieu_luc_tu: HIEU_LUC_TU,
        ma_lo: MA_LO,
        dong_trong_file: d.soDong,
      };

      const { rows: r1 } = await client.query("select staging.ingest_cor_row($1, $2::jsonb) as id", [
        externalId,
        JSON.stringify(payload),
      ]);
      const { rows: r2 } = await client.query("select core.promote_cor_row($1, $2) as kq", [
        r1[0].id,
        TAO_LOP_MOI,
      ]);
      const kq = r2[0].kq;
      dem[kq] = (dem[kq] ?? 0) + 1;

      const soLoi = dem.import_error + dem.already_failed + dem.trung_ma_khac_ten;
      if (soLoi > NGUONG) {
        // Ca dừng thứ ba: hỏng ở mức CẢ LÔ. Chạy tiếp chỉ đổ rác vào kho chính (RB-09).
        dem.dung_giua_chung = true;
        console.error("");
        console.error(
          `DỪNG GIỮA CHỪNG — ${soLoi} dòng lỗi, vượt ngưỡng ${NGUONG} của nguồn "${NGUON}".`,
        );
        console.error("  Đây gần như chắc chắn là hỏng ở mức cả lô: sai cột, sai năm học, sai file.");
        console.error("  Sửa rồi nạp lại CÙNG file — phần đã vào kho không bị nạp hai lần (§9).");
        break;
      }
    }

    // ── Đối soát vắng mặt — CHỈ GHI DANH SÁCH ────────────────────────────────
    // Không chạy khi đã dừng giữa chừng: lúc đó "vắng mặt" chỉ có nghĩa là "job chưa
    // đọc tới", và một danh sách sai còn tệ hơn không có danh sách.
    if (!dem.dung_giua_chung) {
      const { rows: rv } = await client.query("select core.doi_soat_vang_mat($1) as n", [MA_LO]);
      dem.vang_mat = Number(rv[0].n);
    }

    const tongLoi = dem.import_error + dem.already_failed + dem.trung_ma_khac_ten;
    const trangThai = dem.dung_giua_chung ? "failed" : "success";
    await client.query("select ops.finish_job_run($1, $2, $3::jsonb)", [
      runId,
      trangThai,
      JSON.stringify({
        findings: tongLoi + dem.vang_mat,
        ma_lo: MA_LO,
        file: FILE,
        nam_hoc: NAM_HOC,
        hieu_luc_tu: HIEU_LUC_TU,
        tao_lop_moi: TAO_LOP_MOI,
        ...dem,
      }),
    ]);

    if (DRY_RUN) {
      await client.query("rollback");
      console.log("");
      console.log("DRY-RUN — đã hoàn tác. Không dòng nào vào kho, không dòng nào vào sổ lỗi,");
      console.log("          và KHÔNG có dòng nào trong ops.job_runs: một lần thử không được");
      console.log("          để lại dấu vết của một lần nạp thật.");
    }

    // ── Báo cáo ──────────────────────────────────────────────────────────────
    console.log("");
    console.log(`Đã vào kho          : ${dem.promoted}`);
    console.log(`Đã có sẵn (bỏ qua)  : ${dem.already_promoted}  (lô này từng nạp rồi — §9)`);
    console.log(`Trùng y hệt trong file: ${dem.trung_giong_nhau}`);
    console.log(`Vào sổ lỗi          : ${dem.import_error}`);
    console.log(`Đã hỏng từ trước    : ${dem.already_failed}`);
    console.log(`Trùng mã khác tên   : ${dem.trung_ma_khac_ten}  (bỏ qua cả hai dòng)`);
    console.log(`Vắng mặt trong file : ${dem.vang_mat}  (CHỜ NGƯỜI XÁC NHẬN — hệ không tự cho nghỉ học)`);

    // Lời hứa in ra màn hình là một ràng buộc kỹ thuật, không phải một câu trấn an:
    // nó được khoá bằng core.promote_cor_row (khối con hoàn tác, 0048) và bằng test
    // packages/core/db/tests/0048_nap_mot_dong_la_mot_don_vi_test.sql. Nói câu này
    // mà không có hai thứ đó đứng sau thì đúng bằng việc nói dối lịch sự hơn.
    if (dem.import_error + dem.trung_ma_khac_ten + dem.already_failed > 0) {
      console.log("");
      console.log("Dòng vào sổ lỗi KHÔNG đổi một cột nào trong kho — không có dòng nào vào một nửa.");
      console.log(`Nghĩa là "Đã vào kho: ${dem.promoted}" ở trên là con số đầy đủ của lần chạy này.`);
    }

    if (tongLoi + dem.vang_mat > 0) {
      console.log("");
      console.log("CÓ VIỆC CHỜ NGƯỜI. Đọc hàng đợi bằng câu này:");
      console.log("");
      console.log("  select dong_trong_file, ma_hoc_sinh, ho_ten, ma_lop, ly_do, ho_so_chua_ap_dung");
      console.log("    from staging.v_loi_nap_danh_sach");
      console.log(`   where ma_lo = '${MA_LO}' and resolved_at is null`);
      console.log("   order by dong_trong_file;");
      console.log("");
      console.log("Cột ho_so_chua_ap_dung nói file định đổi họ tên / ngày sinh thành gì mà hệ");
      console.log("đã KHÔNG đổi — dòng bị từ chối thì cả dòng bị từ chối, kể cả phần hồ sơ.");
      console.log("");
      console.log("Xử xong một dòng thì đánh dấu:");
      console.log("  update staging.import_errors set retry_state='resolved', resolved_at=now() where id = ...;");
      console.log("Muốn nạp lại một dòng đã hỏng: set failed_at = null trên staging.raw_cor_imports");
      console.log("rồi gọi lại select core.promote_cor_row(<raw_id>).");
    }

    if (dem.dung_giua_chung) return 1;
    return tongLoi + dem.vang_mat > 0 ? 2 : 0;
  } catch (err) {
    // Lần nạp hỏng cũng phải để lại dấu vết — nếu không thì nó biến mất không dấu và
    // người vận hành đọc im lặng thành "chưa ai nạp".
    if (runId !== null && !DRY_RUN) {
      await client
        .query("select ops.finish_job_run($1, 'failed', $2::jsonb)", [
          runId,
          JSON.stringify({ findings: 1, ma_lo: MA_LO, error: String(err && err.message ? err.message : err) }),
        ])
        .catch(() => {});
    }
    if (DRY_RUN) await client.query("rollback").catch(() => {});
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
    console.error("NẠP DANH SÁCH THẤT BẠI:", err && err.message ? err.message : err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
