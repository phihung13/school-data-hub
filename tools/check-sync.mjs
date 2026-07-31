#!/usr/bin/env node
/**
 * Luật đồng bộ "một sự thật, hai ngôn ngữ":
 * - Bản máy: .md trong danh-cho-may/ có `sync-version: N` trong frontmatter.
 * - Bản người: danh-cho-nguoi/ho-so-he-thong.html có <section data-pair="danh-cho-may/<file>" data-sync-version="N">.
 * Hai phía phải cùng version. Chạy: node tools/check-sync.mjs (exit 1 nếu lệch — CI dùng làm cổng chặn)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HUMAN_DOSSIER = "danh-cho-nguoi/ho-so-he-thong.html";

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

function machineVersion(relPath) {
  const text = readFileSync(resolve(ROOT, relPath), "utf8");
  const m = text.match(/^sync-version:\s*(\d+)\s*$/m);
  if (!m) throw new Error(`${relPath}: thiếu 'sync-version' trong frontmatter`);
  return Number(m[1]);
}

function humanVersions() {
  const html = readFileSync(resolve(ROOT, HUMAN_DOSSIER), "utf8");
  const map = new Map();
  const re = /data-pair="([^"]+)"\s+data-sync-version="(\d+)"/g;
  for (const m of html.matchAll(re)) map.set(m[1], Number(m[2]));
  return map;
}

let failed = false;
const human = humanVersions();

for (const may of MACHINE_FILES) {
  try {
    const vMay = machineVersion(may);
    if (!human.has(may)) {
      failed = true;
      console.error(`THIEU: ${HUMAN_DOSSIER} không có <section data-pair="${may}">`);
      continue;
    }
    const vNguoi = human.get(may);
    if (vMay !== vNguoi) {
      failed = true;
      console.error(`LECH DONG BO: ${may} (v${vMay}) != hồ sơ người (v${vNguoi}) — sửa một bên phải sửa bên kia cùng commit.`);
    } else {
      console.log(`OK  v${vMay}  ${may}`);
    }
  } catch (e) {
    failed = true;
    console.error(`LOI: ${e.message}`);
  }
}

if (failed) {
  console.error("\ncheck-sync THAT BAI — xem CLAUDE.md, mục 'Luật đồng bộ'.");
  process.exit(1);
}
console.log("\ncheck-sync PASS — hai bản đang là một sự thật.");
