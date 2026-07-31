#!/usr/bin/env node
/**
 * schema-lint — cưỡng chế §1, §2 và luật nền tảng ADR-011/012 ngay trong CI.
 *
 * Quét file migration (không cần database) và chặn merge nếu:
 *   §1      bảng có cột student_id mà không FK về core.students
 *   ADR-011 Mini App tạo bản sao thực thể lõi (finance.students, attendance.users…)
 *   ADR-012 truy vấn nghiệp vụ đọc thẳng auth.users
 *   §2      migration đổi tên/xóa cột mà không đi expand–contract (cảnh báo)
 *   §2      THAY ĐỔI SCHEMA KHÔNG CÓ TEST — xem "Cổng test" bên dưới
 *
 * ── Cổng test (mở rộng 31/07/2026) ───────────────────────────────────────────
 * Trước bản này cổng chỉ hỏi đúng một câu: "migration có `create table` không?".
 * Hệ quả: cả một migration chỉ toàn view, hàm SECURITY DEFINER, policy RLS hay
 * GRANT — tức là đúng những thứ quyết định AI THẤY GÌ và AI GHI ĐƯỢC GÌ — đi qua
 * cổng mà không cần một dòng test nào. Với dữ liệu trẻ em, một policy sai nguy
 * hiểm hơn một bảng sai: bảng sai thì app vỡ ngay, policy sai thì im lặng lộ dữ
 * liệu. Nên cổng nay hỏi ba câu:
 *
 *   1. Tầng file  — migration có tạo/đổi BẤT KỲ đối tượng nào (bảng, view, hàm,
 *      policy, trigger, grant) thì phải có test đi kèm: file pgTAP cùng số thứ tự
 *      HOẶC một file test bất kỳ có nhắc tên một đối tượng mới của nó.
 *   2. Tầng đối tượng — mỗi bảng/view/hàm mới phải được gọi tên trong ít nhất một
 *      file test. Hàm trigger được miễn vì test kiểm nó gián tiếp qua hành vi của
 *      bảng (không ai gọi thẳng một hàm `returns trigger`).
 *   3. Tầng policy/grant — mở policy hay cấp quyền trên bảng/hàm nào thì bảng/hàm
 *      đó phải xuất hiện trong test. Không đòi test gọi đúng TÊN POLICY: test tốt
 *      kiểm hành vi ("phụ huynh lớp khác không đọc được"), không kiểm tên.
 *
 * Tầng 2 và 3 chỉ áp dụng từ `BASELINE` trở đi. Migration đời trước ra đời khi
 * chưa có cổng này; bắt chúng hồi tố sẽ khóa CI mà không sửa được gì hôm nay.
 * Số nợ cũ vẫn được đếm và in ra mỗi lần chạy để không ai quên nó tồn tại.
 *
 * Chạy: node tools/schema-lint.mjs
 * Biến môi trường:
 *   SCHEMA_LINT_ROOT  đổi gốc repo (chỉ dùng cho test của chính công cụ này)
 *   SCHEMA_LINT_STRICT=1  tính cả nợ cũ + danh sách miễn trừ là lỗi (xem toàn cảnh)
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Gốc repo. Cho phép đổi qua env để test được chính công cụ trên repo giả lập. */
export function gocRepo() {
  return process.env.SCHEMA_LINT_ROOT ? resolve(process.env.SCHEMA_LINT_ROOT) : REPO_ROOT;
}

/**
 * Migration đầu tiên bị cổng test mức-đối-tượng soi. 0001–0022 là nền móng đã
 * chạy thật trên PostgreSQL 16 trước khi có cổng này (xem migrations/README.md);
 * chúng được ghi nợ chứ không chặn merge.
 */
export const BASELINE = "0023";

/** Thực thể lõi chỉ được tồn tại trong schema `core` (ADR-011). */
const CORE_ENTITIES = [
  "users", "students", "teachers", "parents", "schools",
  "classes", "roles", "permissions",
];

/**
 * Sổ nợ test — đối tượng sau BASELINE hiện chưa có test gọi tên.
 *
 * Đây là bánh cóc, không phải chỗ trốn: thêm dòng vào đây là thêm nợ có tên có
 * chủ, và khi ai đó viết test thì dòng tương ứng thành THỪA — schema-lint báo lỗi
 * buộc phải xóa. Nhờ vậy danh sách chỉ ngắn đi, không dài ra một cách âm thầm.
 */
const NO_TEST = [
  // 0028: hàm ghi lỗi nhập liệu, hiện chỉ được gọi gián tiếp trong promote_embedded_event.
  "core.record_import_error",
  // 0031: hàm đánh dấu nguồn còn tươi, hiện chỉ được gọi từ trigger tg_mark_source_fresh.
  "ops.mark_source_fresh",
];

// ── Đọc và bóc tách migration ────────────────────────────────────────────────

/** Bỏ chú thích để không bắt nhầm ví dụ nằm trong phần giải thích. */
function boChuThich(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Hàm `returns trigger` được miễn cổng "phải gọi tên trong test": không ai gọi
 * thẳng nó, nó chỉ chạy khi bảng bị ghi — test đúng cách là test hành vi của bảng.
 */
function laHamTrigger(code, viTri) {
  // Chữ ký hàm nằm giữa `create function` và chỗ mở thân hàm ($$ hoặc $tag$).
  const sau = code.slice(viTri, viTri + 1500);
  const thanBatDau = sau.search(/\$[a-z_]*\$/i);
  const chuKy = thanBatDau === -1 ? sau : sau.slice(0, thanBatDau);
  return /returns\s+trigger\b/i.test(chuKy);
}

/**
 * Bóc mọi đối tượng schema mà một file migration tạo ra.
 * Trả về: [{ loai, ten, bang, laTrigger }] — `bang` chỉ có với policy/trigger.
 */
export function bocDoiTuong(sqlThô) {
  const code = boChuThich(sqlThô);
  const ds = [];

  for (const m of code.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\.([a-z_]+)/gi)) {
    ds.push({ loai: "table", ten: `${m[1]}.${m[2]}` });
  }
  for (const m of code.matchAll(
    /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\.([a-z_]+)/gi,
  )) {
    ds.push({ loai: "view", ten: `${m[1]}.${m[2]}` });
  }
  for (const m of code.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([a-z_]+)\.([a-z_]+)/gi)) {
    ds.push({ loai: "function", ten: `${m[1]}.${m[2]}`, laTrigger: laHamTrigger(code, m.index ?? 0) });
  }
  for (const m of code.matchAll(/create\s+policy\s+([a-z_0-9]+)\s+on\s+([a-z_]+)\.([a-z_]+)/gi)) {
    ds.push({ loai: "policy", ten: m[1], bang: `${m[2]}.${m[3]}` });
  }
  for (const m of code.matchAll(/create\s+trigger\s+([a-z_0-9]+)[\s\S]{0,120}?\son\s+([a-z_]+)\.([a-z_]+)/gi)) {
    ds.push({ loai: "trigger", ten: m[1], bang: `${m[2]}.${m[3]}` });
  }
  return ds;
}

/**
 * Bóc mọi GRANT/REVOKE trên bảng hoặc hàm. Bỏ qua sequence và `grant … on schema`:
 * chúng là quyền hạ tầng đi kèm, không phải bề mặt dữ liệu cần test riêng.
 */
export function bocQuyen(sqlThô) {
  const code = boChuThich(sqlThô);
  const ds = [];
  const re =
    /\b(grant|revoke)\b[\s\S]{0,200}?\bon\s+(table\s+|function\s+|sequence\s+|schema\s+|all\s+tables\s+in\s+schema\s+|all\s+functions\s+in\s+schema\s+)?([a-z_]+)\.([a-z_]+)/gi;
  for (const m of code.matchAll(re)) {
    const kind = (m[2] ?? "").trim().toLowerCase();
    if (kind.startsWith("sequence") || kind.startsWith("schema") || kind.startsWith("all")) continue;
    ds.push({ hanhDong: m[1].toLowerCase(), ten: `${m[3]}.${m[4]}` });
  }
  return ds;
}

/** Danh sách migration đã đọc sẵn nội dung + đối tượng, sắp theo số thứ tự. */
export function docCacMigration(root = gocRepo()) {
  const dir = resolve(root, "packages/core/db/migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => {
      const sql = readFileSync(resolve(dir, file), "utf8");
      return {
        file,
        so: file.slice(0, 4),
        sql,
        code: boChuThich(sql),
        doiTuong: bocDoiTuong(sql),
        quyen: bocQuyen(sql),
      };
    });
}

/** Đối tượng phải được tài liệu/test gọi tên: bảng, view, hàm thường (không trigger). */
export function doiTuongCanGoiTen(mig) {
  return mig.doiTuong.filter(
    (o) => o.loai === "table" || o.loai === "view" || (o.loai === "function" && !o.laTrigger),
  );
}

// ── Kho test dùng để đối chiếu ───────────────────────────────────────────────

function duyetCay(dir) {
  if (!existsSync(dir)) return [];
  const ra = [];
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten);
    if (statSync(p).isDirectory()) ra.push(...duyetCay(p));
    else ra.push(p);
  }
  return ra;
}

/**
 * Gộp toàn bộ nội dung test (pgTAP .sql + test TypeScript) thành một khối chữ để
 * hỏi "tên này có ai nhắc không".
 *
 * Vì sao gộp cả hai loại: có migration được kiểm bằng pgTAP (0024), có migration
 * được kiểm bằng test TypeScript chạy qua tRPC thật (0027 — `attendance.resolve_checkin`
 * nằm trong tests/db/checkin-adr007.test.ts). Chỉ nhìn một loại là bỏ sót nửa kia.
 *
 * Loại trừ chính file test của schema-lint: nó chứa tên đối tượng GIẢ LẬP; nếu tính
 * nó là bằng chứng phủ test thì công cụ tự chứng nhận cho chính mình.
 */
export function khoTest(root = gocRepo()) {
  const files = [
    ...duyetCay(resolve(root, "packages/core/db/tests")),
    ...duyetCay(resolve(root, "tests")),
  ].filter((f) => /\.(sql|ts)$/i.test(f) && basename(f) !== "schema-lint.test.ts");
  return files.map((f) => readFileSync(f, "utf8")).join("\n").toLowerCase();
}

/**
 * "Tên này có được nhắc tới không" — khớp theo BIÊN TỪ, chấp nhận cả dạng đầy đủ
 * `care.rules` lẫn dạng trần `rules`. Không dùng includes() thô: `rules` sẽ khớp
 * nhầm bên trong `checkin_rules` và biến cổng thành xanh giả.
 */
export function coNhacToi(vanBan, ten) {
  const bien = (s) =>
    new RegExp(`(?<![a-z0-9_.])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9_])`, "i");
  if (bien(ten).test(vanBan)) return true;
  const tran = ten.includes(".") ? ten.split(".")[1] : ten;
  return bien(tran).test(vanBan);
}

// ── Thân chương trình ────────────────────────────────────────────────────────

export function chay(root = gocRepo(), strict = process.env.SCHEMA_LINT_STRICT === "1") {
  const loi = [];
  const canhBao = [];
  const dong = [];
  const bad = (m) => loi.push(m);
  const warn = (m) => canhBao.push(m);

  const migs = docCacMigration(root);
  if (migs.length === 0) {
    dong.push("OK   chưa có migration nào — bỏ qua schema-lint");
    return { loi, canhBao, dong, noCu: 0 };
  }

  // Sổ nợ mô tả kho migration THẬT. Khi chạy trên repo giả lập (test của chính
  // công cụ này) thì không có gì để đối chiếu — bỏ qua, đừng báo "mục thừa".
  const laRepoThat = root === REPO_ROOT;

  // ── §2: một số thứ tự một migration ────────────────────────────────────────
  // Hai file cùng số (0030_a.sql, 0030_b.sql) là bẫy: thứ tự chạy khi đó do tên
  // file quyết định chứ không do người quyết định, và mọi tài liệu nói "xem 0030"
  // đều mơ hồ. Rẻ để chặn, đắt để sửa sau khi đã chạy trên prod.
  const theoSo = new Map();
  for (const m of migs) theoSo.set(m.so, [...(theoSo.get(m.so) ?? []), m.file]);
  for (const [so, ds] of theoSo) {
    if (ds.length > 1) bad(`trùng số thứ tự migration ${so}: ${ds.join(", ")} — §2 quy định NNNN_mo_ta.sql duy nhất, đổi số một trong hai file`);
  }

  let tablesChecked = 0;
  let studentCols = 0;

  for (const { file, code, doiTuong } of migs) {
    // ── ADR-011 + §1: quét từng CREATE TABLE kèm thân bảng ──────────────────
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
    for (const m of code.matchAll(createRe)) {
      const [, schema, table, body] = m;
      tablesChecked++;

      if (schema !== "core" && CORE_ENTITIES.includes(table)) {
        bad(`${file}: ${schema}.${table} là bản sao thực thể lõi — ADR-011 cấm (chỉ core.${table} được tồn tại)`);
      }

      if (/\bstudent_id\b/.test(body)) {
        studentCols++;
        const hasInlineFk = /student_id[^,]*references\s+core\.students/i.test(body);
        const hasTableFk = /foreign\s+key\s*\(\s*student_id\s*\)\s*references\s+core\.students/i.test(body);
        if (!hasInlineFk && !hasTableFk) {
          bad(`${file}: ${schema}.${table} có student_id nhưng thiếu FK về core.students — vi phạm §1`);
        }
      }
    }

    // ── ADR-012: nghiệp vụ không đọc auth.users ────────────────────────────
    // Ngoại lệ đúng luật: hàm ngữ cảnh trong 0001 dùng auth.uid()/claim, không đọc bảng.
    if (/\bauth\.users\b/i.test(code)) {
      bad(`${file}: đọc thẳng auth.users — ADR-012 cấm, chỉ core.users`);
    }

    // ── §2: cảnh báo thay đổi phá tương thích ──────────────────────────────
    for (const m of code.matchAll(/alter\s+table\s+([a-z_.]+)\s+drop\s+column\s+(?:if\s+exists\s+)?([a-z_]+)/gi)) {
      warn(`${file}: DROP COLUMN ${m[1]}.${m[2]} — phải là bước "contract" của expand–contract, xác nhận không còn phiên bản app nào đọc cột này`);
    }
    for (const m of code.matchAll(/alter\s+table\s+([a-z_.]+)\s+rename\s+column/gi)) {
      warn(`${file}: RENAME COLUMN trên ${m[1]} — đổi tên là phá tương thích, dùng thêm-cột-mới rồi gỡ cột cũ`);
    }

    void doiTuong;
  }

  // ── Cổng test ─────────────────────────────────────────────────────────────
  const testDir = resolve(root, "packages/core/db/tests");
  const tenFileTest = existsSync(testDir) ? readdirSync(testDir) : [];
  const vanBanTest = khoTest(root);
  const daDung = new Set(); // mục sổ nợ thực sự còn cần thiết
  let noCu = 0;

  for (const mig of migs) {
    const { file, so, doiTuong, quyen } = mig;
    if (basename(file) === "README.md") continue;

    const coDoiTuong = doiTuong.length > 0 || quyen.length > 0;
    if (!coDoiTuong) continue;

    // ── Tầng 1: migration động vào schema thì phải có test đi kèm ───────────
    const coFilePgtap = tenFileTest.some((t) => t.startsWith(so));
    const coTenTrongTest = [...doiTuong, ...quyen].some((o) =>
      coNhacToi(vanBanTest, o.bang ?? o.ten),
    );
    if (!coFilePgtap && !coTenTrongTest) {
      const liet = doiTuong.map((o) => `${o.loai} ${o.bang ?? o.ten}`).slice(0, 4).join(", ");
      bad(`${file}: đổi schema (${liet || "grant"}) nhưng không có test nào — cần ${so}*_test.sql hoặc một test gọi tên đối tượng (02-database.md: "nghĩa vụ test")`);
      continue;
    }

    const truocBaseline = so < BASELINE;

    // ── Tầng 2: từng bảng/view/hàm mới phải được test gọi tên ───────────────
    for (const o of doiTuongCanGoiTen(mig)) {
      if (coNhacToi(vanBanTest, o.ten)) {
        if (laRepoThat && NO_TEST.includes(o.ten)) {
          bad(`${o.ten} đã có test rồi — xóa nó khỏi danh sách NO_TEST trong tools/schema-lint.mjs (bánh cóc chỉ được siết, không được nới)`);
        }
        continue;
      }
      if (truocBaseline) { noCu++; continue; }
      if (NO_TEST.includes(o.ten) && !strict) { daDung.add(o.ten); continue; }
      bad(`${file}: ${o.loai} ${o.ten} không được file test nào gọi tên — thêm test hoặc ghi nợ có tên trong NO_TEST (tools/schema-lint.mjs)`);
    }

    // ── Tầng 3: policy/grant mở trên bảng/hàm nào thì bảng/hàm đó phải có test ─
    if (truocBaseline) continue;
    // Chỉ soi chiều NỚI quyền (GRANT, policy, trigger). REVOKE là siết lại — bắt
    // nó phải có test là phạt người đang làm đúng: `revoke all … from public` trên
    // một hàm nội bộ không mở thêm bề mặt dữ liệu nào để mà test.
    const dichQuyen = new Set([
      ...doiTuong.filter((o) => o.loai === "policy" || o.loai === "trigger").map((o) => o.bang),
      ...quyen.filter((o) => o.hanhDong === "grant").map((o) => o.ten),
    ]);
    for (const dich of dichQuyen) {
      if (!dich || coNhacToi(vanBanTest, dich)) continue;
      if (NO_TEST.includes(dich) && !strict) { daDung.add(dich); continue; }
      bad(`${file}: mở policy/GRANT trên ${dich} nhưng không test nào chạm tới nó — policy sai thì im lặng lộ dữ liệu, phải có test cả chiều cho phép lẫn chiều từ chối (02-database.md)`);
    }
  }

  for (const ten of laRepoThat ? NO_TEST : []) {
    if (!daDung.has(ten) && !strict) {
      bad(`NO_TEST có mục thừa "${ten}" — đối tượng này không còn thiếu test (hoặc không còn tồn tại). Xóa dòng đó trong tools/schema-lint.mjs.`);
    }
  }

  if (loi.length === 0) {
    dong.push(`OK   ${migs.length} migration · ${tablesChecked} bảng · ${studentCols} bảng gắn học sinh đều có FK`);
    dong.push(`OK   cổng test: bảng/view/hàm/policy/grant từ ${BASELINE} trở đi đều có test gọi tên (${NO_TEST.length} mục còn ghi nợ)`);
  }
  return { loi, canhBao, dong, noCu };
}

// ── Chỉ chạy khi được gọi trực tiếp: check-sync.mjs import lại bộ bóc tách ───
const laFileChinh =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (laFileChinh) {
  const kq = chay();
  for (const d of kq.dong) console.log(d);
  for (const w of kq.canhBao) console.warn("WARN " + w);
  if (kq.noCu > 0) {
    console.warn(`WARN nợ cũ: ${kq.noCu} đối tượng trước ${BASELINE} chưa có test gọi tên — không chặn merge, nhưng đừng để nó lớn thêm`);
  }
  if (kq.loi.length > 0) {
    for (const l of kq.loi) console.error("FAIL " + l);
    console.error("\nschema-lint THAT BAI — xem danh-cho-may/RULES.md");
    process.exit(1);
  }
  console.log("\nschema-lint PASS");
}
