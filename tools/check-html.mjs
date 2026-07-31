#!/usr/bin/env node
// Phase 4 QA: kiểm tra tĩnh hồ sơ HTML (id trùng, link neo, cân bằng thẻ, ký tự cấm, đủ mục)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, "danh-cho-nguoi/ho-so-he-thong.html");
const html = readFileSync(FILE, "utf8");
let fail = 0;
const bad = (m) => { console.error("FAIL " + m); fail = 1; };
const ok = (m) => console.log("OK   " + m);

// Bóc nội dung script/style ra khỏi phần quét markup
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const markup = html.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>")
                   .replace(/<style>[\s\S]*?<\/style>/g, "<style></style>");

// 1. ID trùng
const ids = [...markup.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
dup.length ? bad("ID trùng: " + dup.join(", ")) : ok(`ID duy nhất (${ids.length})`);

// 2. Link neo có đích
const idset = new Set(ids);
const hrefs = [...markup.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
const broken = hrefs.filter(h => !idset.has(h));
broken.length ? bad("Link neo gãy: " + broken.join(", ")) : ok(`${hrefs.length} link neo đều có đích`);

// 3. Cân bằng thẻ bằng stack thật
const VOID = new Set(["meta","link","br","hr","img","input","source","wbr","col"]);
const stack = [];
const errors = [];
const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
let m2, line = (idx) => markup.slice(0, idx).split("\n").length;
while ((m2 = re.exec(markup)) !== null) {
  const [ , close, name, attrs ] = m2;
  const tag = name.toLowerCase();
  if (VOID.has(tag)) continue;
  if (!close) {
    if (attrs.trim().endsWith("/")) continue; // self-closed (SVG)
    stack.push({ tag, line: line(m2.index) });
  } else {
    const top = stack.pop();
    if (!top) { errors.push(`dòng ${line(m2.index)}: </${tag}> thừa`); }
    else if (top.tag !== tag) { errors.push(`dòng ${line(m2.index)}: </${tag}> nhưng đang mở <${top.tag}> (dòng ${top.line})`); }
  }
}
for (const s of stack) errors.push(`<${s.tag}> mở ở dòng ${s.line} không được đóng`);
errors.length ? (errors.slice(0, 10).forEach(e => console.error("     " + e)), bad(`Cân bằng thẻ: ${errors.length} lỗi`)) : ok("Cân bằng thẻ (stack parser)");

// 4. Ký tự cấm / lỗi
const badChars = (html.match(/�/g) || []).length + (html.match(/[«»]/g) || []).length;
badChars ? bad(`Ký tự cấm/lỗi: ${badChars}`) : ok("Không có ký tự cấm hay mojibake");

// 5. Đủ mục + data-pair
const secs = [...markup.matchAll(/<section class="part" id="([^"]+)"/g)].map(m => m[1]);
const EXPECTED_SECTIONS = 19;   // 00–18, khớp mục lục sidebar (thêm mục 12 "mua-sam" 28/07/2026)
const EXPECTED_PAIRS = 8;       // RULES, 01, 02, 04, 06, 07, 08, 10-mua-sam-ha-tang — khớp MACHINE_FILES trong check-sync.mjs
secs.length === EXPECTED_SECTIONS ? ok(`${EXPECTED_SECTIONS}/${EXPECTED_SECTIONS} mục`) : bad(`Số mục: ${secs.length} (${secs.join(",")})`);
const pairs = [...markup.matchAll(/data-pair="([^"]+)"/g)];
pairs.length === EXPECTED_PAIRS ? ok(`${EXPECTED_PAIRS}/${EXPECTED_PAIRS} data-pair`) : bad(`data-pair: ${pairs.length}`);

// 6. JS syntax (xuất ra file cho node --check)
writeFileSync(resolve(ROOT, "tools/.tmp-inline.js"), scripts.join("\n"));
console.log(fail ? "\nKET QUA: FAIL" : "\nKET QUA: PASS (chạy tiếp node --check tools/.tmp-inline.js)");
process.exit(fail);
