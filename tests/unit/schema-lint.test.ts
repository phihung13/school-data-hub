// tests/unit/schema-lint.test.ts — test cho chính hai cái cổng của CI.
//
// Vì sao cổng cũng phải có test: cổng hỏng thì hỏng IM LẶNG. Nó vẫn in "PASS",
// CI vẫn xanh, và người đọc kết luận sai rằng luật đang được cưỡng chế. Đúng
// chuyện đã xảy ra hai lần trong repo này:
//   - schema-lint chỉ hỏi "có `create table` không?", nên migration toàn view /
//     hàm / policy / GRANT — thứ quyết định AI THẤY GÌ — đi qua mà không cần test;
//   - check-sync chỉ so hai con số sync-version với nhau, nên khi không ai sờ vào
//     tài liệu thì hai số vẫn bằng nhau và cổng vẫn xanh dù database đã đi trước
//     tài liệu 8 migration.
//
// Cách test: dựng repo giả lập trong thư mục tạm rồi chạy THẬT hai script qua
// child process, kiểm mã thoát + thông điệp. Chạy qua tiến trình con (thay vì
// import hàm) vì thứ CI thật sự phụ thuộc là "node tools/schema-lint.mjs trả về
// mã thoát nào" — test đúng cái hợp đồng đó, không phải một hàm bên trong.
import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS = fileURLToPath(new URL("../../tools/", import.meta.url));
const LINT = join(TOOLS, "schema-lint.mjs");
const SYNC = join(TOOLS, "check-sync.mjs");

const thuMucTam: string[] = [];
afterAll(() => {
  for (const d of thuMucTam) rmSync(d, { recursive: true, force: true });
});

/** Dựng một repo giả lập từ bản đồ { đường-dẫn-tương-đối: nội dung }. */
function taoRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "hub-lint-"));
  thuMucTam.push(dir);
  for (const [rel, noiDung] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, noiDung, "utf8");
  }
  return dir;
}

function chay(script: string, bienGoc: string, root: string, them: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, [bienGoc]: root, ...them },
  });
  return { ma: r.status, ra: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const chayLint = (root: string, them?: Record<string, string>) =>
  chay(LINT, "SCHEMA_LINT_ROOT", root, them);
const chaySync = (root: string, them?: Record<string, string>) =>
  chay(SYNC, "CHECK_SYNC_ROOT", root, them);

const M = "packages/core/db/migrations/";
const T = "packages/core/db/tests/";

// Bảng nền + file pgTAP nhắc tên nó — đủ để qua tầng 1 ("migration đổi schema
// phải có test đi kèm"), để mỗi ca test soi đúng một tầng.
const BANG_NEN = `create table if not exists demo.bang_a (
  id uuid primary key
);
`;
const TEST_NEN = "select 1 from demo.bang_a;\n";

describe("schema-lint · cổng test mở rộng sang view/hàm/policy/grant", () => {
  it("view mới không được test nào gọi tên → chặn (trước đây lọt vì không phải bảng)", () => {
    const root = taoRepo({
      [`${M}0023_v.sql`]: `${BANG_NEN}\ncreate or replace view demo.v_moi as select id from demo.bang_a;\n`,
      [`${T}0023_v_test.sql`]: TEST_NEN,
    });
    const r = chayLint(root);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain("demo.v_moi");
  });

  it("hàm mới không được test nào gọi tên → chặn", () => {
    const root = taoRepo({
      [`${M}0023_f.sql`]: `${BANG_NEN}\ncreate or replace function demo.ham_moi() returns integer language sql as $$ select 1 $$;\n`,
      [`${T}0023_f_test.sql`]: TEST_NEN,
    });
    const r = chayLint(root);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain("demo.ham_moi");
  });

  it("hàm trigger được miễn — test đúng cách là test hành vi của bảng, không gọi thẳng hàm", () => {
    const root = taoRepo({
      [`${M}0023_tg.sql`]: `${BANG_NEN}\ncreate or replace function demo.tg_moi() returns trigger language plpgsql as $$ begin return new; end $$;\n`,
      [`${T}0023_tg_test.sql`]: TEST_NEN,
    });
    expect(chayLint(root).ma).toBe(0);
  });

  it("mở policy trên bảng mà không test nào chạm tới → chặn (policy sai thì im lặng lộ dữ liệu)", () => {
    const root = taoRepo({
      [`${M}0001_cu.sql`]: "create table if not exists demo.bang_cu (\n  id uuid primary key\n);\n",
      [`${T}0001_cu_test.sql`]: "select 1;\n",
      [`${M}0023_p.sql`]: "create policy p_x on demo.bang_cu for select to authenticated using (true);\n",
      [`${T}0023_p_test.sql`]: "select 1;\n",
    });
    const r = chayLint(root);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain("demo.bang_cu");
  });

  it("GRANT mở quyền trên bảng không có test → chặn; REVOKE siết lại thì không", () => {
    const chung = {
      [`${M}0001_cu.sql`]: "create table if not exists demo.bang_cu (\n  id uuid primary key\n);\n",
      [`${T}0001_cu_test.sql`]: "select 1;\n",
      [`${T}0023_g_test.sql`]: "select 1;\n",
    };
    const rGrant = chayLint(
      taoRepo({ ...chung, [`${M}0023_g.sql`]: "grant select on demo.bang_cu to authenticated;\n" }),
    );
    expect(rGrant.ma).toBe(1);
    expect(rGrant.ra).toContain("demo.bang_cu");

    const rRevoke = chayLint(
      taoRepo({ ...chung, [`${M}0023_g.sql`]: "revoke all on demo.bang_cu from public;\n" }),
    );
    expect(rRevoke.ma).toBe(0);
  });

  it("test TypeScript cũng tính là bằng chứng phủ test, không bắt buộc pgTAP", () => {
    // Đúng khuôn 0027: `attendance.resolve_checkin` không có file pgTAP nào, nó
    // được kiểm qua tRPC thật trong tests/db/checkin-adr007.test.ts.
    const root = taoRepo({
      [`${M}0023_ts.sql`]: "create or replace function demo.ham_ts() returns integer language sql as $$ select 1 $$;\n",
      "tests/db/vidu.test.ts": "// gọi demo.ham_ts qua router\n",
    });
    expect(chayLint(root).ma).toBe(0);
  });

  it("khớp theo biên từ, không phải substring — `demo.rules` không được coi là đã test vì có `checkin_rules`", () => {
    // Chính chỗ này biến một cổng thành xanh giả: includes('rules') khớp bên
    // trong 'checkin_rules' và mọi bảng tên ngắn đều tự nhiên "có test".
    const root = taoRepo({
      [`${M}0023_r.sql`]: `${BANG_NEN}\ncreate table if not exists demo.rules (\n  id uuid primary key\n);\n`,
      [`${T}0023_r_test.sql`]: "select 1 from demo.bang_a; select 1 from attendance.checkin_rules;\n",
    });
    const r = chayLint(root);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain("demo.rules");
  });

  it("migration đời trước BASELINE chỉ bị ghi nợ, không chặn merge", () => {
    const root = taoRepo({
      [`${M}0001_cu.sql`]: `${BANG_NEN}\ncreate or replace view demo.v_cu as select id from demo.bang_a;\n`,
      [`${T}0001_cu_test.sql`]: TEST_NEN,
    });
    const r = chayLint(root);
    expect(r.ma).toBe(0);
    expect(r.ra).toContain("nợ cũ");
  });

  it("hai migration trùng số thứ tự → chặn (thứ tự chạy do tên file quyết định, không do người)", () => {
    const root = taoRepo({
      [`${M}0030_a.sql`]: BANG_NEN,
      [`${M}0030_b.sql`]: "create table if not exists demo.bang_b (\n  id uuid primary key\n);\n",
      [`${T}0030_a_test.sql`]: "select 1 from demo.bang_a; select 1 from demo.bang_b;\n",
    });
    const r = chayLint(root);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain("trùng số thứ tự migration 0030");
  });

  it("giữ nguyên các cổng cũ: §1 thiếu FK học sinh và ADR-011 bản sao thực thể lõi", () => {
    const thieuFk = taoRepo({
      [`${M}0023_s.sql`]: "create table if not exists demo.diem (\n  id uuid primary key,\n  student_id uuid not null\n);\n",
      [`${T}0023_s_test.sql`]: "select 1 from demo.diem;\n",
    });
    const r1 = chayLint(thieuFk);
    expect(r1.ma).toBe(1);
    expect(r1.ra).toContain("§1");

    const banSao = taoRepo({
      [`${M}0023_c.sql`]: "create table if not exists finance.students (\n  id uuid primary key\n);\n",
      [`${T}0023_c_test.sql`]: "select 1 from finance.students;\n",
    });
    const r2 = chayLint(banSao);
    expect(r2.ma).toBe(1);
    expect(r2.ra).toContain("ADR-011");
  });
});

// ── check-sync ───────────────────────────────────────────────────────────────

const FILE_MAY = [
  "RULES.md",
  "01-architecture.md",
  "02-database.md",
  "04-flag-engine.md",
  "06-resilience-security.md",
  "07-operations.md",
  "08-embedded-apps.md",
  "10-mua-sam-ha-tang.md",
];

/**
 * Bộ tài liệu tối thiểu để cổng 1 (nhịp sync-version) xanh, nhờ vậy ca test soi
 * được riêng cổng 2 (tài liệu có theo kịp schema không).
 */
function taiLieu(noiDungDb: string, lechVersion = false): Record<string, string> {
  const out: Record<string, string> = {};
  let html = "";
  for (const f of FILE_MAY) {
    const than = f === "02-database.md" ? noiDungDb : `# ${f}\n`;
    out[`danh-cho-may/${f}`] = `---\nban-doi-ung: x\nsync-version: 1\n---\n\n${than}`;
    const vNguoi = lechVersion && f === "02-database.md" ? 2 : 1;
    html += `<section data-pair="danh-cho-may/${f}" data-sync-version="${vNguoi}"></section>\n`;
  }
  out["danh-cho-nguoi/ho-so-he-thong.html"] = html;
  return out;
}

describe("check-sync · cổng 'tài liệu có theo kịp schema không'", () => {
  it("bảng mới sau BASELINE mà 02-database.md không nhắc → chặn (đây là chỗ cổng cũ xanh giả)", () => {
    const root = taoRepo({
      ...taiLieu("# Database\n\nBảng: `core.students`.\n"),
      [`${M}0024_moi.sql`]: "create table if not exists demo.bang_moi (\n  id uuid primary key\n);\n",
    });
    const r = chaySync(root);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain("TAI LIEU CHUA THEO KIP");
    expect(r.ra).toContain("demo.bang_moi");
  });

  it("tài liệu có gọi tên đối tượng mới → xanh", () => {
    const root = taoRepo({
      ...taiLieu("# Database\n\n| `demo.bang_moi` | 0024 | sổ ghi thử |\n"),
      [`${M}0024_moi.sql`]: "create table if not exists demo.bang_moi (\n  id uuid primary key\n);\n",
    });
    const r = chaySync(root);
    expect(r.ma).toBe(0);
    expect(r.ra).toContain("check-sync PASS");
  });

  it("hàm mới cũng bị soi, không riêng bảng", () => {
    const root = taoRepo({
      ...taiLieu("# Database\n"),
      [`${M}0026_f.sql`]: "create or replace function demo.tra_nguong() returns integer language sql as $$ select 1 $$;\n",
    });
    const r = chaySync(root);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain("demo.tra_nguong");
  });

  it("đối tượng đời trước BASELINE chỉ ghi nợ, không chặn", () => {
    const root = taoRepo({
      ...taiLieu("# Database\n"),
      [`${M}0009_cu.sql`]: "create or replace view demo.v_cu as select 1 as id;\n",
    });
    const r = chaySync(root);
    expect(r.ma).toBe(0);
    expect(r.ra).toContain("nợ cũ");
  });

  it("cổng 1 vẫn nguyên: lệch sync-version giữa hai bản là chặn", () => {
    const root = taoRepo(taiLieu("# Database\n", true));
    const r = chaySync(root);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain("LECH DONG BO");
  });
});
