#!/usr/bin/env node
// tools/ai-import-gate.mjs — cưỡng chế §7 ở tầng mã nguồn.
//
// §7 (RULES.md): "Mọi lời gọi model ngoài đi qua wrapper duy nhất
// `packages/core/pii-stripper/`. Import SDK AI ở nơi khác là LỖI LINT."
//
// Câu đó đã là luật từ ngày đầu và cho tới 21/08/2026 **chưa có gì thi hành nó** — vì
// chưa có lời gọi AI nào trong kho, nên chưa ai vi phạm. Nay trạm AI đã dựng, cổng phải
// có TRƯỚC lời gọi thật đầu tiên: một luật chỉ có hiệu lực từ lúc có người canh.
//
// ═══════════════════════════════════════════════════════════════════════════
// CỔNG NÀY CHẶN GÌ
// ═══════════════════════════════════════════════════════════════════════════
// Import bất kỳ SDK model nào ở ngoài DUY NHẤT một file được phép:
// `apps/hub/server/ai/nha-cung-cap.ts` — bộ nối tới nhà cung cấp.
//
// Vì sao chỉ một file chứ không phải "trong thư mục ai/": một thư mục thì thêm file mới
// vào đó là chuyện của một cú `touch`, và cổng sẽ im. Một tên file cụ thể thì mở rộng
// phạm vi là một dòng phải sửa TRONG CHÍNH CỔNG NÀY — tức là một quyết định có dấu vết.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const goc = fileURLToPath(new URL("..", import.meta.url));

/** Đúng MỘT file được phép import SDK model. Mở rộng = sửa dòng này = có dấu vết. */
const DUOC_PHEP = ["apps", "hub", "server", "ai", "nha-cung-cap.ts"].join(sep);

/**
 * Tên gói của các nhà cung cấp model. Danh sách này KHÔNG kín và không cần kín — nó
 * chặn thứ người ta thật sự gõ. Một người cố tình đi vòng thì cổng nào cũng vòng được;
 * cái nó chặn là người vô tình, và đó mới là ca xảy ra.
 */
const GOI_AI = [
  "@anthropic-ai/sdk",
  "@anthropic-ai/claude",
  "openai",
  "@google/generative-ai",
  "@google-cloud/aiplatform",
  "@mistralai/mistralai",
  "cohere-ai",
  "ollama",
  "langchain",
  "@langchain/",
  "replicate",
  "groq-sdk",
];

const BO_QUA = new Set(["node_modules", ".next", ".next-prod", ".git", "dist", "coverage", ".impeccable"]);

function moiFile(thuMuc) {
  const ra = [];
  for (const ten of readdirSync(thuMuc)) {
    if (BO_QUA.has(ten)) continue;
    const p = join(thuMuc, ten);
    if (statSync(p).isDirectory()) ra.push(...moiFile(p));
    else if (/\.(ts|tsx|mjs|js|jsx)$/.test(ten)) ra.push(p);
  }
  return ra;
}

const viPham = [];
for (const f of moiFile(goc)) {
  const tuongDoi = relative(goc, f);
  if (tuongDoi === DUOC_PHEP) continue;
  // Bỏ chú thích trước khi quét: kho này viết chú thích rất dài và nhắc tên gói AI
  // nhiều lần (kể cả chính file bạn đang đọc). Quét cả chú thích là cổng tự đỏ vì
  // chính lời giải thích của nó — và người sửa sẽ học cách xoá chú thích cho cổng xanh.
  const ma = readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  for (const goi of GOI_AI) {
    // Bắt cả `import … from "goi"`, `require("goi")` và `import("goi")`.
    const goiThoat = goi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(String.raw`(?:from|require\(|import\()\s*["'` + "`" + `]${goiThoat}`);
    if (re.test(ma)) viPham.push(`${tuongDoi} → ${goi}`);
  }
}

if (viPham.length > 0) {
  console.error("ai-import-gate FAIL — §7: SDK model chỉ được import trong " + DUOC_PHEP);
  for (const v of viPham) console.error("   ✗ " + v);
  console.error("");
  console.error("  Mọi lời gọi model đi qua apps/hub/server/ai/tram.ts (hoiAi), nơi có đủ sáu bước:");
  console.error("  hạn mức → bóc PII → khai lại → gọi → lọc nội dung → ghi sổ.");
  console.error("  Gọi thẳng SDK là bỏ qua cả sáu, và bỏ qua trong im lặng.");
  process.exit(1);
}

console.log("ai-import-gate PASS");
