#!/usr/bin/env node
/**
 * secret-scan — cưỡng chế §4: không service_role, không secret trong code chạy ở trình duyệt.
 *
 * Quét toàn repo (trừ thư mục build/vendor) tìm:
 *   - service_role key của Supabase (JWT có "role":"service_role")
 *   - biến môi trường bí mật bị lộ qua tiền tố public (NEXT_PUBLIC_*_SECRET/KEY/TOKEN)
 *   - chuỗi giống khóa API bị hard-code
 *
 * Chạy: node tools/secret-scan.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".next", "coverage", ".impeccable",
]);
const SCAN_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".env", ".sql",
  ".yml", ".yaml", ".html", ".sh",
]);

const RULES = [
  {
    id: "service_role",
    // JWT của Supabase mang role service_role — không bao giờ được nằm trong repo.
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
    check: (m) => {
      try {
        const payload = JSON.parse(Buffer.from(m.split(".")[1], "base64url").toString());
        return payload.role === "service_role";
      } catch { return false; }
    },
    msg: "JWT service_role nằm trong repo — §4 cấm tuyệt đối, xoay khóa NGAY",
  },
  {
    id: "public_secret",
    re: /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE)[A-Z0-9_]*/g,
    msg: "biến bí mật gắn tiền tố NEXT_PUBLIC_ — sẽ bị nhét thẳng vào bundle trình duyệt (§4)",
  },
  {
    id: "hardcoded_key",
    re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/g,
    msg: "khóa API hard-code",
  },
];

let fail = 0;
let scanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = resolve(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { walk(full); continue; }
    if (!SCAN_EXT.has(extname(entry)) && !entry.startsWith(".env")) continue;
    if (full === fileURLToPath(import.meta.url)) continue;   // chính file này chứa pattern
    scanned++;

    const text = readFileSync(full, "utf8");
    for (const rule of RULES) {
      for (const m of text.matchAll(rule.re)) {
        if (rule.check && !rule.check(m[0])) continue;
        const line = text.slice(0, m.index).split("\n").length;
        console.error(`FAIL ${relative(ROOT, full)}:${line} — ${rule.msg}`);
        fail = 1;
      }
    }
  }
}

walk(ROOT);

if (fail) {
  console.error("\nsecret-scan THAT BAI — xem RULES.md §4");
  process.exit(1);
}
console.log(`OK   quét ${scanned} file, không có secret lọt ra\n\nsecret-scan PASS`);
