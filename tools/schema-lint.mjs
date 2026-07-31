#!/usr/bin/env node
/**
 * schema-lint — cưỡng chế §1 và luật nền tảng ADR-011 ngay trong CI.
 *
 * Quét file migration (không cần database) và chặn merge nếu:
 *   §1      bảng có cột student_id mà không FK về core.students
 *   ADR-011 Mini App tạo bản sao thực thể lõi (finance.students, attendance.users…)
 *   ADR-012 truy vấn nghiệp vụ đọc thẳng auth.users
 *   §2      migration đổi tên/xóa cột mà không đi expand–contract (cảnh báo)
 *
 * Chạy: node tools/schema-lint.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "packages/core/db/migrations");

let fail = 0;
const bad = (m) => { console.error("FAIL " + m); fail = 1; };
const warn = (m) => console.warn("WARN " + m);
const ok = (m) => console.log("OK   " + m);

if (!existsSync(DIR)) {
  console.log("OK   chưa có thư mục migrations — bỏ qua schema-lint");
  process.exit(0);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.log("OK   chưa có migration nào");
  process.exit(0);
}

// Thực thể lõi chỉ được tồn tại trong schema `core` (ADR-011).
const CORE_ENTITIES = [
  "users", "students", "teachers", "parents", "schools",
  "classes", "roles", "permissions",
];

let tablesChecked = 0;
let studentCols = 0;

for (const file of files) {
  const sql = readFileSync(resolve(DIR, file), "utf8");
  // Bỏ comment để không bắt nhầm ví dụ trong phần giải thích.
  const code = sql.replace(/--[^\n]*/g, "");

  // ── ADR-011: cấm bản sao thực thể lõi ────────────────────────────────────
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
  for (const m of code.matchAll(createRe)) {
    const [, schema, table, body] = m;
    tablesChecked++;

    if (schema !== "core" && CORE_ENTITIES.includes(table)) {
      bad(`${file}: ${schema}.${table} là bản sao thực thể lõi — ADR-011 cấm (chỉ core.${table} được tồn tại)`);
    }

    // ── §1: cột student_id phải FK về core.students ───────────────────────
    if (/\bstudent_id\b/.test(body)) {
      studentCols++;
      const hasInlineFk = /student_id[^,]*references\s+core\.students/i.test(body);
      const hasTableFk = /foreign\s+key\s*\(\s*student_id\s*\)\s*references\s+core\.students/i.test(body);
      if (!hasInlineFk && !hasTableFk) {
        bad(`${file}: ${schema}.${table} có student_id nhưng thiếu FK về core.students — vi phạm §1`);
      }
    }
  }

  // ── ADR-012: nghiệp vụ không đọc auth.users ──────────────────────────────
  // Ngoại lệ đúng luật: hàm ngữ cảnh trong 0001 dùng auth.uid()/claim, không đọc bảng.
  if (/\bauth\.users\b/i.test(code)) {
    bad(`${file}: đọc thẳng auth.users — ADR-012 cấm, chỉ core.users`);
  }

  // ── §2: cảnh báo thay đổi phá tương thích ────────────────────────────────
  for (const m of code.matchAll(/alter\s+table\s+([a-z_.]+)\s+drop\s+column\s+(?:if\s+exists\s+)?([a-z_]+)/gi)) {
    warn(`${file}: DROP COLUMN ${m[1]}.${m[2]} — phải là bước "contract" của expand–contract, xác nhận không còn phiên bản app nào đọc cột này`);
  }
  for (const m of code.matchAll(/alter\s+table\s+([a-z_.]+)\s+rename\s+column/gi)) {
    warn(`${file}: RENAME COLUMN trên ${m[1]} — đổi tên là phá tương thích, dùng thêm-cột-mới rồi gỡ cột cũ`);
  }
}

// ── Bảng mới phải có test đi kèm (02-database.md: "nghĩa vụ test") ──────────
const TEST_DIR = resolve(ROOT, "packages/core/db/tests");
const tests = existsSync(TEST_DIR) ? readdirSync(TEST_DIR) : [];
for (const file of files) {
  if (basename(file) === "README.md") continue;
  const prefix = file.slice(0, 4);
  const sql = readFileSync(resolve(DIR, file), "utf8");
  const createsTable = /create\s+table/i.test(sql.replace(/--[^\n]*/g, ""));
  if (createsTable && !tests.some((t) => t.startsWith(prefix))) {
    bad(`${file}: tạo bảng mới nhưng không có test ${prefix}*_test.sql — CI chặn (02-database.md)`);
  }
}

if (!fail) {
  ok(`${files.length} migration · ${tablesChecked} bảng · ${studentCols} bảng gắn học sinh đều có FK`);
  console.log("\nschema-lint PASS");
} else {
  console.error("\nschema-lint THAT BAI — xem danh-cho-may/RULES.md");
}
process.exit(fail);
