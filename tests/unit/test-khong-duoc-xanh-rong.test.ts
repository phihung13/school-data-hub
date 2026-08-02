// tests/unit/test-khong-duoc-xanh-rong.test.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
// MỘT BÀI TEST CANH CHÍNH BỘ TEST
// ═══════════════════════════════════════════════════════════════════════════════
// Bộ test của kho này chạy được ở hai thế giới: có Postgres và không có Postgres. Cách
// một bài test xử lý thế giới thứ hai quyết định nó nói THẬT hay nói DỐI:
//
//     it("…", async () => { if (!ready) return; expect(…) });        ← XANH, không chạy gì
//     it("…", async ({ skip }) => { if (!ready) return skip(); … }); ← SKIPPED, nhìn thấy
//
// Hai dòng chỉ khác nhau ở chữ `skip`, còn báo cáo cuối lượt chạy thì khác hẳn: dòng trên
// đếm vào cột "passed". Đo thật ngày 02/08/2026 trên `mood-rieng-tu.test.ts`: chạy không
// có DATABASE_URL ra **"14 passed"** — mười bốn lời khẳng định "đã kiểm, đạt" cho mười
// bốn phép kiểm chưa từng chạy. Cả kho có 70 chỗ như vậy.
//
// Đây đúng là con lỗi mà kho này tồn tại để chặn — "im lặng không phải kết luận" — nhưng
// lần này nó nằm trong chính bộ đo. Một cái cân sai thì mọi thứ cân bằng nó đều sai theo,
// và không có cách nào phát hiện bằng cách nhìn vào hàng hoá.
//
// Vì sao là một bài test chứ không phải một dòng dặn trong tài liệu: dòng dặn đã có sẵn
// trong CACH-CHAY-AGENT.md từ trước (bẫy số 2), và 70 chỗ kia vẫn ra đời sau đó.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function moiFileTest(dir: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten);
    if (statSync(p).isDirectory()) ra.push(...moiFileTest(p));
    else if (ten.endsWith(".test.ts")) ra.push(p);
  }
  return ra;
}

/**
 * Những chỗ `if (!ready) return;` NẰM TRONG một khối `it(...)`.
 *
 * Duyệt theo dòng và theo dõi mình đang ở trong `it()` hay trong một hook: cùng một câu
 * `return` trần, ở hook thì ĐÚNG (hook không có gì để bỏ qua, nó chỉ thôi làm việc), ở
 * `it()` thì SAI (bài test kết thúc êm và được đếm là đạt).
 */
function chỗXanhRỗng(src: string): number[] {
  const dong = src.split("\n");
  let trong: "it" | "hook" | null = null;
  const ra: number[] = [];
  for (let i = 0; i < dong.length; i++) {
    const d = dong[i]!;
    if (/\b(beforeAll|afterAll|beforeEach|afterEach)\(/.test(d)) trong = "hook";
    else if (/\b(it|test)\(/.test(d)) trong = "it";
    if (trong === "it" && /^\s*if \(!ready\) return;\s*$/.test(d)) ra.push(i + 1);
  }
  return ra;
}

describe("bộ quét (tự kiểm chính nó)", () => {
  it("phân biệt được `return` trần trong it() với `return` trần trong hook", () => {
    const mau = [
      'beforeAll(async () => {',
      '  ready = await requireDb();',
      '  if (!ready) return;', // ĐÚNG — hook
      '});',
      'it("abc", async () => {',
      '  if (!ready) return;', // SAI — bài test sẽ xanh mà không chạy gì
      '  expect(1).toBe(1);',
      '});',
    ].join("\n");
    expect(chỗXanhRỗng(mau)).toEqual([6]);
  });

  it("không bắt nhầm khuôn đúng", () => {
    const mau = ['it("abc", async ({ skip }) => {', "  if (!ready) return skip();", "});"].join("\n");
    expect(chỗXanhRỗng(mau)).toEqual([]);
  });
});

describe("KHÔNG bài test nào được xanh mà không chạy khẳng định nào", () => {
  it("mọi it() gác theo `ready` đều dùng `return skip()`, không dùng `return` trần", () => {
    const pham: string[] = [];
    for (const f of moiFileTest(testsDir)) {
      for (const n of chỗXanhRỗng(readFileSync(f, "utf8"))) {
        pham.push(`${f.slice(testsDir.length + 1)}:${n}`);
      }
    }
    expect(
      pham,
      "`if (!ready) return;` trong it() làm bài test được đếm là ĐẠT dù không chạy gì. " +
        "Đổi thành: it(\"…\", async ({ skip }) => { if (!ready) return skip(); … })",
    ).toEqual([]);
  });

  it("không ai dùng describe.skipIf/it.skipIf trên cờ đọc trong beforeAll", () => {
    // `skipIf` đọc điều kiện lúc THU THẬP, trước khi beforeAll chạy — nên với một cờ chỉ
    // biết được sau khi hỏi database, nó luôn thấy `false` và bỏ qua TOÀN BỘ file. Đo
    // thật 02/08/2026: 15/15 bài của một file bị bỏ qua trong khi database vẫn sống.
    const pham: string[] = [];
    for (const f of moiFileTest(testsDir)) {
      const src = readFileSync(f, "utf8");
      if (!/\bready\s*=\s*await\s+requireDb\(\)/.test(src)) continue;
      for (const m of src.matchAll(/(describe|it|test)\.skipIf\(/g)) {
        pham.push(`${f.slice(testsDir.length + 1)} → ${m[1]}.skipIf`);
      }
    }
    expect(
      pham,
      "skipIf đọc cờ lúc thu thập, trước beforeAll — cờ phụ thuộc database luôn ra false ở đó",
    ).toEqual([]);
  });
});
