#!/usr/bin/env node
/**
 * contracts-lint — cổng CI cho HỢP ĐỒNG giữa hai đội (DEBT #13, `03-api.md` luật endpoint 6).
 *
 * Vì sao cần một cổng riêng thay vì tin vào review người: `packages/core/contracts` là ranh
 * giới giữa 2 dev lõi và vibe team. Sửa một `z.object` ở đây là sửa thứ đội kia đang dựa vào,
 * nhưng diff của nó trông y hệt mọi diff TypeScript khác — không ai giật mình. Cổng này bắt
 * mọi thay đổi bề mặt hợp đồng phải đi kèm hai thứ: bản chụp được cập nhật và một dòng trong
 * CHANGELOG. Xoá field thì còn phải tăng version (expand–contract, y như migration).
 *
 * Chạy:
 *   node tools/contracts-lint.mjs            # kiểm, exit 1 nếu có lỗi (CI dùng)
 *   node tools/contracts-lint.mjs --update   # cập nhật bản chụp trong contracts/version.ts
 *   node tools/contracts-lint.mjs --root DIR # kiểm một cây thư mục khác (test dùng)
 *
 * KHÔNG dùng `git diff origin/main`: kho này chạy CI cả trên nhánh chưa có main làm gốc so
 * sánh (và lúc viết file này còn chưa có commit nào). Bản chụp nằm ngay trong repo nên cổng
 * hoạt động cả khi không có lịch sử git — đổi lại phải chạy `--update` khi sửa contract, và
 * chính bước đó là chỗ ta chặn được việc xoá field lén.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const ROOT =
  rootFlag >= 0 && args[rootFlag + 1]
    ? resolve(args[rootFlag + 1])
    : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPDATE = args.includes("--update");
const FORCE = args.includes("--force");

const DIR = resolve(ROOT, "packages/core/contracts");
const PKG_FILE = resolve(ROOT, "packages/core/package.json");
const VERSION_FILE = resolve(DIR, "version.ts");
const CHANGELOG_FILE = resolve(DIR, "CHANGELOG.md");
const INDEX_FILE = resolve(DIR, "index.ts");

const OPEN_MARK = "// <contracts-surface>";
const CLOSE_MARK = "// </contracts-surface>";

let failed = 0;
const fail = (m) => {
  console.error("FAIL " + m);
  failed = 1;
};
const warn = (m) => console.warn("WARN " + m);
const ok = (m) => console.log("OK   " + m);

// ---------------------------------------------------------------------------
// Đọc mã nguồn TypeScript mà KHÔNG kéo cả trình biên dịch vào: che chuỗi, template,
// regex và chú thích thành khoảng trắng (giữ nguyên độ dài, nên chỉ số vẫn khớp bản gốc),
// rồi mới đếm ngoặc trên bản đã che. Không có bước này thì một regex vô hại như
// /^\d{4}-\d{2}-\d{2}$/ trong contracts/report.ts sẽ làm lệch bộ đếm ngoặc nhọn.
// ---------------------------------------------------------------------------
const REGEX_CAN_START_AFTER = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", "\n"]);

export function mask(src) {
  const out = src.split("");
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  let prev = "";
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") j += 2;
        else if (src[j] === quote) break;
        else j++;
      }
      blank(i, Math.min(j + 1, src.length));
      i = j + 1;
      prev = quote;
      continue;
    }
    if (c === "/" && REGEX_CAN_START_AFTER.has(prev)) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "\n") break;
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        j++;
      }
      while (j + 1 < src.length && /[a-z]/.test(src[j + 1])) j++; // cờ regex: g, i, u…
      blank(i, Math.min(j + 1, src.length));
      i = j + 1;
      prev = "/";
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out.join("");
}

const PAIR = { "{": "}", "(": ")", "[": "]" };

// Không gắn cờ /g: các regex này dùng lại nhiều lần với .exec, cờ /g giữ lastIndex
// giữa các lần gọi và sẽ bỏ sót ngẫu nhiên.
const RE_Z_OBJECT = /\bz\s*\.\s*object\s*\(/;
const RE_Z_ENUM = /\bz\s*\.\s*enum\s*\(/;
const RE_EXTEND = /\.\s*extend\s*\(/;

/** Chỉ số của dấu đóng khớp với dấu mở tại `open` (chạy trên bản đã che). */
function matchBracket(masked, open) {
  const close = PAIR[masked[open]];
  if (!close) return -1;
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    const c = masked[i];
    if (PAIR[c]) depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth === 0) return c === close ? i : -1;
    }
  }
  return -1;
}

/** Cắt thân object literal thành các phần tử cấp 1 (bỏ qua mọi thứ lồng bên trong). */
function topLevelParts(masked, from, to) {
  const parts = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i++) {
    const c = masked[i];
    if (PAIR[c]) depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push([start, i]);
      start = i + 1;
    }
  }
  parts.push([start, to]);
  return parts.filter(([a, b]) => masked.slice(a, b).trim() !== "");
}

/** Danh sách field (đường dẫn có chấm cho object lồng) của một object literal. */
function objectFields(masked, orig, openBrace, prefix = "") {
  const close = matchBracket(masked, openBrace);
  if (close === -1) return [];
  const fields = [];
  for (const [a, b] of topLevelParts(masked, openBrace + 1, close)) {
    // Tên field KHÔNG lấy bằng regex "đầu đoạn" được: đoạn thường mở đầu bằng chú thích
    // của field TRƯỚC nó (`asOfDate: z.string(), // date ISO` → đoạn sau dấu phẩy bắt đầu
    // bằng "// date ISO"). Nên: tìm dấu ':' đầu tiên ở cấp 0 trên bản CHE (chú thích đã
    // thành khoảng trắng nên không có ':' giả), rồi lùi lại lấy token ngay trước nó.
    // Token đọc trên bản che nếu là tên trần/số, đọc trên bản GỐC nếu là key có nháy
    // (bản che đã xoá nội dung chuỗi).
    let depth = 0;
    let colon = -1;
    for (let i = a; i < b; i++) {
      const c = masked[i];
      if (PAIR[c]) depth++;
      else if (c === "}" || c === ")" || c === "]") depth--;
      else if (c === ":" && depth === 0) { colon = i; break; }
    }
    if (colon === -1) continue;
    let k = colon - 1;
    while (k >= a && /\s/.test(masked[k])) k--;
    let name = null;
    if (k >= a && /[\w$]/.test(masked[k])) {
      const end = k;
      while (k >= a && /[\w$]/.test(masked[k])) k--;
      name = masked.slice(k + 1, end + 1);
    } else if (k >= a && (orig[k] === '"' || orig[k] === "'")) {
      const quote = orig[k];
      let s = k - 1;
      while (s >= a && orig[s] !== quote) s--;
      name = orig.slice(s + 1, k);
    }
    if (!name) continue;
    const key = prefix + name;
    fields.push(key);
    const nested = RE_Z_OBJECT.exec(masked.slice(a, b));
    if (nested) {
      const braceAt = masked.indexOf("{", a + nested.index);
      if (braceAt !== -1 && braceAt < b) fields.push(...objectFields(masked, orig, braceAt, key + "."));
    }
  }
  return fields;
}

/** Bề mặt của một file contract: tên xuất khẩu → mô tả hình dạng đủ để phát hiện mất field. */
export function extractSurface(source) {
  const masked = mask(source);
  const surface = {};

  for (const m of masked.matchAll(/\bexport\s+function\s+([A-Za-z_$][\w$]*)/g)) {
    surface[m[1]] = ["«function»"];
  }
  for (const m of masked.matchAll(/\bexport\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)\s*[=<{]/g)) {
    // Kiểu suy ra từ zod (`export type X = z.infer<typeof X>`) không phải bề mặt độc lập —
    // nó đi kèm const cùng tên và sẽ được ghi bởi vòng lặp const bên dưới.
    if (!surface[m[1]]) surface[m[1]] = ["«type»"];
  }

  for (const m of masked.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=/g)) {
    const name = m[1];
    const exprStart = m.index + m[0].length;
    let end = exprStart;
    let depth = 0;
    for (let i = exprStart; i < masked.length; i++) {
      const c = masked[i];
      if (PAIR[c]) depth++;
      else if (c === "}" || c === ")" || c === "]") depth--;
      else if (c === ";" && depth === 0) { end = i; break; }
      end = i + 1;
    }
    const exprMasked = masked.slice(exprStart, end);
    const exprOrig = source.slice(exprStart, end);

    // Prettier ngắt dòng giữa `z` và `.object(` khi biểu thức dài (xem SessionMeOutput),
    // nên phải khớp bằng regex chịu được khoảng trắng thay vì indexOf chuỗi cứng.
    const enumAt = RE_Z_ENUM.exec(exprMasked)?.index ?? -1;
    const objAt = RE_Z_OBJECT.exec(exprMasked)?.index ?? -1;
    const extendAt = RE_EXTEND.exec(exprMasked)?.index ?? -1;
    const plainObj = /^\s*\{/.test(exprMasked);

    // Chọn nhánh theo dấu hiệu XUẤT HIỆN TRƯỚC: FlagSummary là z.object có chứa z.enum
    // lồng bên trong (caseStatus) — bắt nhầm nhánh enum thì bản chụp chỉ còn hai giá trị
    // enum và mọi field của schema đó biến mất khỏi cổng kiểm mà không ai biết.
    const objFirst = objAt !== -1 && (enumAt === -1 || objAt < enumAt);
    const extendFirst = extendAt !== -1 && (enumAt === -1 || extendAt < enumAt);

    if (enumAt !== -1 && !objFirst && !extendFirst) {
      const bracket = masked.indexOf("[", exprStart + enumAt);
      const closeB = matchBracket(masked, bracket);
      const values = [...source.slice(bracket, closeB).matchAll(/["'`]([^"'`]*)["'`]/g)].map((v) => "«enum»" + v[1]);
      surface[name] = values;
    } else if (objAt !== -1 || extendAt !== -1 || plainObj) {
      const anchor = objAt !== -1 && (extendAt === -1 || objAt < extendAt) ? objAt : extendAt;
      const braceAt = anchor === -1 ? masked.indexOf("{", exprStart) : masked.indexOf("{", exprStart + anchor);
      const fields = objectFields(masked, source, braceAt);
      if (extendAt !== -1) {
        const base = /([A-Za-z_$][\w$]*)\s*\.\s*extend\s*\(/.exec(exprMasked);
        if (base) fields.unshift("«extends»" + base[1]);
      }
      surface[name] = fields;
    } else {
      surface[name] = ["«expr»" + exprOrig.replace(/\s+/g, " ").trim()];
    }
  }
  return surface;
}

// ---------------------------------------------------------------------------
// Bản chụp nằm trong chú thích ở cuối contracts/version.ts — xem lời giải thích ở đó.
// ---------------------------------------------------------------------------
export function readSnapshot(versionSource) {
  const open = versionSource.indexOf(OPEN_MARK);
  const close = versionSource.indexOf(CLOSE_MARK);
  if (open === -1 || close === -1) return null;
  const body = versionSource
    .slice(open + OPEN_MARK.length, close)
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/ ?/, ""))
    .join("\n")
    .trim();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function writeSnapshot(versionSource, snapshot) {
  const open = versionSource.indexOf(OPEN_MARK);
  const close = versionSource.indexOf(CLOSE_MARK);
  const body = JSON.stringify(snapshot, null, 2)
    .split("\n")
    .map((line) => "// " + line)
    .join("\n");
  return versionSource.slice(0, open) + OPEN_MARK + "\n" + body + "\n" + versionSource.slice(close);
}

const OPAQUE = "«expr»";

/**
 * So hai bề mặt. Ba loại khác nhau vì ba mức nguy hiểm khác nhau:
 *  · removed — mất tên xuất khẩu hoặc mất field của object. Client cũ đang đọc thứ đó →
 *    phải đi expand–contract, phải tăng version.
 *  · added   — thêm mới. Không phá ai, nhưng vẫn phải ghi CHANGELOG rồi cập nhật bản chụp,
 *    nếu không thì vibe team không biết có gì mới mà dùng.
 *  · changed — schema không phải object (vd `z.string().refine(...)`): công cụ chỉ chụp
 *    được biểu thức thô nên KHÔNG biết đổi đó có phá tương thích hay không. Đòi tăng
 *    version cho mọi lần sửa lời nhắn lỗi thì cổng bị chửi rồi bị vô hiệu hoá; nên chỉ
 *    bắt xác nhận (chạy --update) và để người review đọc CHANGELOG mà phán.
 */
export function diffSurface(before, after) {
  const removed = [];
  const added = [];
  const changed = [];
  const beforeSchemas = before?.schemas ?? {};
  for (const [name, fields] of Object.entries(beforeSchemas)) {
    if (!(name in after)) {
      removed.push(name);
      continue;
    }
    const afterOpaque = after[name].some((f) => f.startsWith(OPAQUE));
    for (const f of fields) {
      if (after[name].includes(f)) continue;
      if (f.startsWith(OPAQUE) && afterOpaque) changed.push(name);
      else removed.push(`${name}.${f}`);
    }
  }
  for (const [name, fields] of Object.entries(after)) {
    if (!(name in beforeSchemas)) {
      added.push(name);
      continue;
    }
    for (const f of fields) {
      if (beforeSchemas[name].includes(f)) continue;
      if (!(f.startsWith(OPAQUE) && changed.includes(name))) added.push(`${name}.${f}`);
    }
  }
  return { removed, added, changed };
}

function semver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareSemver(a, b) {
  const va = semver(a);
  const vb = semver(b);
  if (!va || !vb) return null;
  for (let i = 0; i < 3; i++) if (va[i] !== vb[i]) return va[i] < vb[i] ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Chạy các cổng
// ---------------------------------------------------------------------------
if (!existsSync(DIR)) {
  console.error(`FAIL không thấy ${DIR}`);
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".ts")).sort();
const versionSource = existsSync(VERSION_FILE) ? readFileSync(VERSION_FILE, "utf8") : "";

// 1 — version.ts phải tồn tại và khớp package.json (một nguồn sự thật).
let declaredVersion = null;
let declaredMin = null;
if (!versionSource) {
  fail("thiếu packages/core/contracts/version.ts — hợp đồng không có số phiên bản (DEBT #13)");
} else {
  declaredVersion = /export const CONTRACTS_VERSION\s*=\s*"([^"]+)"/.exec(versionSource)?.[1] ?? null;
  declaredMin = /export const MIN_SUPPORTED_CONTRACTS_VERSION\s*=\s*"([^"]+)"/.exec(versionSource)?.[1] ?? null;
  const pkgVersion = JSON.parse(readFileSync(PKG_FILE, "utf8")).version;

  if (!declaredVersion || !semver(declaredVersion)) {
    fail(`CONTRACTS_VERSION không phải semver: ${declaredVersion}`);
  } else if (declaredVersion !== pkgVersion) {
    fail(`CONTRACTS_VERSION (${declaredVersion}) != packages/core/package.json version (${pkgVersion}) — một nguồn sự thật, sửa cả hai`);
  } else {
    ok(`phiên bản hợp đồng ${declaredVersion} khớp packages/core/package.json`);
  }

  if (!declaredMin || !semver(declaredMin)) {
    fail(`MIN_SUPPORTED_CONTRACTS_VERSION không phải semver: ${declaredMin}`);
  } else if (declaredVersion && compareSemver(declaredMin, declaredVersion) === 1) {
    fail(`MIN_SUPPORTED_CONTRACTS_VERSION (${declaredMin}) > CONTRACTS_VERSION (${declaredVersion}) — server tự chặn chính client của mình`);
  }
}

// 2 — CHANGELOG phải có mục cho đúng phiên bản đang khai.
if (!existsSync(CHANGELOG_FILE)) {
  fail("thiếu packages/core/contracts/CHANGELOG.md (DEBT #13)");
} else if (declaredVersion) {
  const changelog = readFileSync(CHANGELOG_FILE, "utf8");
  if (!new RegExp(`^##\\s*\\[${declaredVersion.replace(/\./g, "\\.")}\\]`, "m").test(changelog)) {
    fail(`CHANGELOG.md không có mục "## [${declaredVersion}]" — tăng version thì phải ghi đổi cái gì`);
  } else if (!/^##\s*\[Unreleased\]/m.test(changelog)) {
    fail('CHANGELOG.md thiếu mục "## [Unreleased]" (khuôn Keep a Changelog)');
  } else {
    ok(`CHANGELOG.md có mục cho ${declaredVersion}`);
  }
}

// 3 — index.ts là cửa duy nhất ra ngoài: file nào không được xuất thì vibe team không thấy.
/** Tên được xuất TƯỜNG MINH trong index.ts — trong ES module chúng thắng `export *`. */
const explicitReexports = new Set();
if (!existsSync(INDEX_FILE)) {
  fail("thiếu packages/core/contracts/index.ts");
} else {
  const indexSource = readFileSync(INDEX_FILE, "utf8");
  for (const block of indexSource.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const raw of block[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "").trim();
      if (name) explicitReexports.add(name);
    }
  }
  for (const f of files) {
    if (f === "index.ts") continue;
    if (!indexSource.includes(`"./${f}"`)) {
      fail(`contracts/${f} không được xuất trong index.ts — import @hub/core/contracts sẽ không thấy nó`);
    }
  }
}

// 4 — CONTRACTS_VERSION lạc chỗ (nợ cũ DEBT #13: hằng số từng nằm trong contracts/checkin.ts).
for (const f of files) {
  if (f === "version.ts") continue;
  const src = readFileSync(resolve(DIR, f), "utf8");
  const stray = /export const CONTRACTS_VERSION\s*=\s*"([^"]+)"/.exec(src);
  if (!stray) continue;
  if (declaredVersion && stray[1] !== declaredVersion) {
    fail(`contracts/${f} khai CONTRACTS_VERSION="${stray[1]}" trong khi version.ts khai "${declaredVersion}" — hai số phiên bản mâu thuẫn`);
  } else {
    warn(`contracts/${f} còn giữ bản sao CONTRACTS_VERSION — bản chính thức ở version.ts, gỡ ở lần chạm file này gần nhất (CHANGELOG mục Deprecated)`);
  }
}

// 5 — bề mặt hợp đồng: thêm phải khai báo, xoá phải đi expand–contract.
const surface = {};
const seenIn = {};
for (const f of files) {
  if (f === "index.ts") continue; // barrel chỉ xuất lại, không tự khai hình dạng nào
  const src = readFileSync(resolve(DIR, f), "utf8");
  const part = extractSurface(f === "version.ts" ? src.slice(0, src.indexOf(OPEN_MARK) === -1 ? src.length : src.indexOf(OPEN_MARK)) : src);
  for (const [name, fields] of Object.entries(part)) {
    // Trùng tên giữa hai file là bẫy thật: `export *` trong index.ts sẽ bỏ rơi cả hai
    // trong im lặng. Ngoại lệ duy nhất là tên được index.ts xuất tường minh — lúc đó
    // ES module có luật rõ ràng (tường minh thắng sao) nên chỉ còn là nợ cần dọn.
    if (seenIn[name] && seenIn[name] !== f && !explicitReexports.has(name)) {
      fail(`tên "${name}" xuất khẩu ở cả contracts/${seenIn[name]} và contracts/${f} — "export *" trong index.ts sẽ nhập nhằng`);
    }
    seenIn[name] = f;
    surface[name] = fields;
  }
}

const snapshot = readSnapshot(versionSource);
const { removed, added, changed } = diffSurface(snapshot, surface);
const snapshotVersion = snapshot?.version ?? null;

if (UPDATE) {
  if (removed.length > 0 && !FORCE) {
    const bumped = snapshotVersion && declaredVersion && compareSemver(declaredVersion, snapshotVersion) === 1;
    if (!bumped) {
      fail(
        `bản chụp cho thấy MẤT ${removed.length} field/schema (${removed.join(", ")}) mà CONTRACTS_VERSION vẫn là ${declaredVersion}.\n` +
          "     Expand–contract (03-api.md luật 6): thêm cái mới → client chuyển dần → mới gỡ cái cũ.\n" +
          "     Muốn gỡ thật: đánh dấu Deprecated ít nhất một phiên bản, tăng version trong packages/core/package.json + version.ts,\n" +
          "     ghi mục ### Removed trong CHANGELOG.md, rồi chạy lại --update.",
      );
      process.exit(1);
    }
  }
  writeFileSync(VERSION_FILE, writeSnapshot(versionSource, { version: declaredVersion, schemas: surface }), "utf8");
  ok(`đã cập nhật bản chụp bề mặt: ${Object.keys(surface).length} tên xuất khẩu (thêm ${added.length}, bỏ ${removed.length})`);
} else if (!snapshot) {
  fail("version.ts chưa có bản chụp bề mặt hợp đồng — chạy: node tools/contracts-lint.mjs --update");
} else if (removed.length > 0) {
  fail(
    `hợp đồng MẤT field/schema so với bản chụp: ${removed.join(", ")}.\n` +
      "     Client cũ (PWA đã cache, app trên máy phụ huynh) vẫn đang đọc những field này.\n" +
      "     Đi expand–contract rồi chạy: node tools/contracts-lint.mjs --update",
  );
} else if (added.length > 0 || changed.length > 0) {
  const mo = [
    ...added.map((a) => `thêm ${a}`),
    ...[...new Set(changed)].map((c) => `đổi hình dạng ${c}`),
  ];
  fail(
    `hợp đồng có ${mo.length} thay đổi chưa được ghi nhận: ${mo.join(", ")}.\n` +
      "     Ghi vào packages/core/contracts/CHANGELOG.md rồi chạy: node tools/contracts-lint.mjs --update",
  );
} else if (snapshotVersion !== declaredVersion) {
  fail(`bản chụp ghi phiên bản ${snapshotVersion} còn version.ts khai ${declaredVersion} — chạy: node tools/contracts-lint.mjs --update`);
} else {
  ok(`bề mặt hợp đồng khớp bản chụp: ${Object.keys(surface).length} tên xuất khẩu`);
}

process.exit(failed);
