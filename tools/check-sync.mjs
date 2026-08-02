#!/usr/bin/env node
/**
 * Luật đồng bộ "một sự thật, hai ngôn ngữ" — hai cổng, không phải một.
 *
 * ── Cổng 1: hai bản cùng nhịp ───────────────────────────────────────────────
 * - Bản máy: .md trong danh-cho-may/ có `sync-version: N` trong frontmatter.
 * - Bản người: danh-cho-nguoi/ho-so-he-thong.html có
 *   <section data-pair="danh-cho-may/<file>" data-sync-version="N">.
 * Hai phía phải cùng version.
 *
 * ── Cổng 2: tài liệu có theo kịp schema không (thêm 31/07/2026) ─────────────
 * Cổng 1 một mình là XANH GIẢ. Nó chỉ so hai con số với nhau, nên nếu không ai
 * sờ vào tài liệu thì hai con số vẫn bằng nhau và CI vẫn xanh — kể cả khi
 * database đã đi trước tài liệu 8 migration. Đó đúng là chuyện đã xảy ra: từ
 * `0024` tới `0031` sinh ra bảng `care.rules`, view `ops.v_rls_gaps`, hàm
 * `attendance.resolve_checkin`… mà `02-database.md` không nhắc một chữ, còn
 * `sync-version` thì vẫn y nguyên. Người đọc hồ sơ tin rằng mình đang đọc hệ
 * thống thật, trong khi thứ họ đọc đã cũ.
 *
 * Nên cổng 2 đối chiếu THỰC THỂ chứ không đối chiếu con số: mọi bảng / view /
 * hàm (trừ hàm trigger — chi tiết cài đặt, không phải bề mặt nghiệp vụ) do
 * migration từ `BASELINE` trở đi tạo ra đều phải được `02-database.md` gọi tên.
 *
 * Chạy: node tools/check-sync.mjs   (exit 1 nếu lệch — CI dùng làm cổng chặn)
 * Biến môi trường:
 *   CHECK_SYNC_ROOT    đổi gốc repo (chỉ dùng cho test của chính công cụ này)
 *   CHECK_SYNC_STRICT=1  tính cả nợ cũ + sổ nợ tài liệu là lỗi (xem toàn cảnh)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BASELINE, docCacMigration, doiTuongCanGoiTen, coNhacToi } from "./schema-lint.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HUMAN_DOSSIER = "danh-cho-nguoi/ho-so-he-thong.html";
const DB_DOC = "danh-cho-may/02-database.md";

function gocRepo() {
  return process.env.CHECK_SYNC_ROOT ? resolve(process.env.CHECK_SYNC_ROOT) : REPO_ROOT;
}

const MACHINE_FILES = [
  "danh-cho-may/RULES.md",
  "danh-cho-may/01-architecture.md",
  "danh-cho-may/02-database.md",
  "danh-cho-may/04-flag-engine.md",
  "danh-cho-may/06-resilience-security.md",
  "danh-cho-may/07-operations.md",
  "danh-cho-may/08-embedded-apps.md",
  "danh-cho-may/10-mua-sam-ha-tang.md",
];

/**
 * Sổ nợ tài liệu — đối tượng schema sau BASELINE mà `02-database.md` chưa nhắc.
 *
 * Cùng cơ chế bánh cóc như NO_TEST bên schema-lint: nợ phải có tên, và khi tài
 * liệu đã nhắc tới thì mục tương ứng thành THỪA và bị báo lỗi, buộc người sửa
 * tài liệu xóa nó đi. Danh sách này chỉ được ngắn lại.
 *
 * Ghi ngày chốt: 31/07/2026 — 15 mục, sinh ra trong đợt củng cố 0024–0031 khi
 * tài liệu không đi cùng migration. Mỗi mục là một câu hỏi "cái này là gì, ai
 * đọc được" mà hồ sơ hiện chưa trả lời được.
 *
 * TRẢ NỢ 31/07/2026 (gói `dong-bo-tai-lieu`): cả 15 mục đã được `02-database.md`
 * gọi tên trong bảng "Đợt củng cố 0023–0034", nên danh sách này rỗng lại. Giữ
 * hằng số + chú thích thay vì xóa hẳn: lần sau có người muốn ghi nợ tài liệu thì
 * phải viết tên món nợ vào đây — không có đường ghi nợ ẩn danh.
 */
const NO_TAI_LIEU = [
  // TRẢ NỢ 02/08/2026 (lượt gộp đợt G): 12 đối tượng của `kenh-bao-dong` (0051) đã được
  // `02-database.md` gọi tên đủ trong mục "Đợt G", bản nháp `.wip` đã xoá, nên danh sách
  // rỗng lại. Đây đúng vòng đời mà bánh cóc `SO NO THUA` canh: ghi nợ có tên khi đợt còn
  // bay, và BẮT BUỘC xoá khi tài liệu đã theo kịp — nợ nằm lại sau khi đã trả là một lời
  // khai sai, chỉ theo chiều ngược lại.
  //
  // TRẢ NỢ 02/08/2026 (lượt gộp đợt F). Hai món ghi ở đây trong lúc đợt còn bay —
  // `care.flags_tam_ly` (0049) và `ops.schema_migrations` (0050) — nay đã được
  // `02-database.md` gọi tên trong mục "Đợt F", nên danh sách rỗng lại.
  //
  // Luật của đợt nhiều gói: `02-database.md` và `ho-so-he-thong.html` chỉ có MỘT
  // bản, nên gói không chạm hai file đó mà viết bản nháp vào
  // `danh-cho-may/.wip/<key-gói>.md`; một agent pha sau gộp và tăng `sync-version`
  // ĐÚNG MỘT LẦN. Món nợ tài liệu sinh ra trong lúc chờ gộp phải ghi tên vào đây —
  // không có đường ghi nợ ẩn danh, và bánh cóc tự bắt (`SO NO THUA`) khi tài liệu
  // đã nhắc tới mà dòng nợ còn ở lại.
];

// ── Cổng 1 ───────────────────────────────────────────────────────────────────

function machineVersion(root, relPath) {
  const text = readFileSync(resolve(root, relPath), "utf8");
  const m = text.match(/^sync-version:\s*(\d+)\s*$/m);
  if (!m) throw new Error(`${relPath}: thiếu 'sync-version' trong frontmatter`);
  return Number(m[1]);
}

function humanVersions(root) {
  const html = readFileSync(resolve(root, HUMAN_DOSSIER), "utf8");
  const map = new Map();
  const re = /data-pair="([^"]+)"\s+data-sync-version="(\d+)"/g;
  for (const m of html.matchAll(re)) map.set(m[1], Number(m[2]));
  return map;
}

export function congNhipVersion(root = gocRepo()) {
  const loi = [];
  const dong = [];
  const human = humanVersions(root);

  for (const may of MACHINE_FILES) {
    try {
      const vMay = machineVersion(root, may);
      if (!human.has(may)) {
        loi.push(`THIEU: ${HUMAN_DOSSIER} không có <section data-pair="${may}">`);
        continue;
      }
      const vNguoi = human.get(may);
      if (vMay !== vNguoi) {
        loi.push(`LECH DONG BO: ${may} (v${vMay}) != hồ sơ người (v${vNguoi}) — sửa một bên phải sửa bên kia cùng commit.`);
      } else {
        dong.push(`OK  v${vMay}  ${may}`);
      }
    } catch (e) {
      loi.push(`LOI: ${e.message}`);
    }
  }
  return { loi, dong };
}

// ── Cổng 2 ───────────────────────────────────────────────────────────────────

/**
 * Đối chiếu đối tượng schema thật với `02-database.md`.
 * Trả về { loi, dong, noCu, noGhiSo } — `noCu` là đối tượng đời trước BASELINE
 * (không chặn, chỉ đếm để không ai quên), `noGhiSo` là mục đang nằm trong sổ nợ.
 */
export function congTaiLieuTheoKipSchema(root = gocRepo(), strict = process.env.CHECK_SYNC_STRICT === "1") {
  const loi = [];
  const dong = [];
  const duongDoc = resolve(root, DB_DOC);
  if (!existsSync(duongDoc)) return { loi: [`LOI: thiếu ${DB_DOC}`], dong, noCu: 0, noGhiSo: 0 };

  const doc = readFileSync(duongDoc, "utf8");
  const migs = docCacMigration(root);
  // Sổ nợ mô tả kho migration THẬT — repo giả lập trong test không có gì để đối chiếu.
  const laRepoThat = root === REPO_ROOT;
  const daDung = new Set();
  let noCu = 0;
  let daKiem = 0;

  for (const mig of migs) {
    const truocBaseline = mig.so < BASELINE;
    for (const o of doiTuongCanGoiTen(mig)) {
      daKiem++;
      if (coNhacToi(doc, o.ten)) {
        if (laRepoThat && NO_TAI_LIEU.includes(o.ten) && !truocBaseline) {
          loi.push(`SO NO THUA: ${DB_DOC} đã nhắc "${o.ten}" — xóa nó khỏi NO_TAI_LIEU trong tools/check-sync.mjs (bánh cóc chỉ được siết).`);
        }
        continue;
      }
      if (truocBaseline) { noCu++; continue; }
      if (NO_TAI_LIEU.includes(o.ten) && !strict) { daDung.add(o.ten); continue; }
      loi.push(
        `TAI LIEU CHUA THEO KIP: ${mig.file} tạo ${o.loai} ${o.ten} nhưng ${DB_DOC} không nhắc tới. ` +
        `Sửa schema mà không sửa tài liệu là làm hồ sơ nói dối (CLAUDE.md mệnh lệnh 3) — bổ sung vào bảng ` +
        `"Cột và bảng thêm bởi…", tăng sync-version cả hai phía, hoặc ghi nợ có tên trong NO_TAI_LIEU.`,
      );
    }
  }

  for (const ten of laRepoThat ? NO_TAI_LIEU : []) {
    if (!daDung.has(ten) && !strict) {
      loi.push(`SO NO THUA: "${ten}" không còn thiếu tài liệu (hoặc không còn tồn tại) — xóa dòng đó trong tools/check-sync.mjs.`);
    }
  }

  if (loi.length === 0) {
    dong.push(`OK  ${daKiem} đối tượng schema · từ ${BASELINE} trở đi đều được ${DB_DOC} gọi tên`);
  }
  return { loi, dong, noCu, noGhiSo: daDung.size };
}

// ── Thân chương trình ────────────────────────────────────────────────────────

const laFileChinh = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (laFileChinh) {
  const nhip = congNhipVersion();
  for (const d of nhip.dong) console.log(d);
  for (const l of nhip.loi) console.error(l);

  const doc = congTaiLieuTheoKipSchema();
  for (const d of doc.dong) console.log(d);
  for (const l of doc.loi) console.error(l);

  if (doc.noCu > 0) {
    console.warn(`WARN nợ cũ: ${doc.noCu} đối tượng trước ${BASELINE} chưa được ${DB_DOC} gọi tên — không chặn merge (ra đời trước cổng này), nhưng hồ sơ đang thiếu chừng đó câu trả lời.`);
  }
  if (doc.noGhiSo > 0) {
    console.warn(`WARN NO TAI LIEU: ${doc.noGhiSo} đối tượng schema sau ${BASELINE} chưa vào ${DB_DOC} — danh sách có tên trong tools/check-sync.mjs, xóa dần khi cập nhật tài liệu. Chạy CHECK_SYNC_STRICT=1 để thấy toàn bộ.`);
  }

  if (nhip.loi.length > 0 || doc.loi.length > 0) {
    console.error("\ncheck-sync THAT BAI — xem CLAUDE.md, mục 'Luật đồng bộ'.");
    process.exit(1);
  }
  console.log("\ncheck-sync PASS — hai bản đang là một sự thật, và tài liệu đang theo kịp schema.");
}
