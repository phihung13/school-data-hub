// tests/unit/contracts.test.ts — hợp đồng giữa hai đội, và cái cổng giữ nó.
//
// Vì sao test này tồn tại (DEBT #13, `03-api.md` luật endpoint 6): `packages/core/contracts`
// là ranh giới giữa 2 dev lõi và vibe team. Hai loại hỏng khác nhau được chặn ở đây:
//   1. Hỏng NGHIỆP VỤ — schema nhận thứ nó không nên nhận. Ca thật: `getReportForWeek` khai
//      `weekStart: z.string()` nên 'abc' đi lọt tới Postgres và nổ 22007 → 500.
//   2. Hỏng HỢP ĐỒNG — ai đó xoá/đổi field, CI xanh, vibe team phát hiện lúc chạy thật.
//      Cổng `tools/contracts-lint.mjs` chặn ca này; test dưới chứng minh cổng ĐÓNG thật
//      chứ không phải chỉ in ra chữ OK (bài học "xanh giả" của tools/run-db-tests.sh).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTRACTS_VERSION,
  MIN_SUPPORTED_CONTRACTS_VERSION,
  CONTRACTS_VERSION_HEADER,
  ContractsMetaOutput,
  parseSemver,
  compareContractsVersions,
  isContractsVersionSupported,
  GetReportForWeekInput,
  GetGrowthReportInput,
  GetWeeklyReportOutput,
  GuardianListOutput,
  MiniAppsOutput,
  SessionMeOutput,
} from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const LINT = join(repoRoot, "tools", "contracts-lint.mjs");
const CONTRACTS_DIR = join(repoRoot, "packages", "core", "contracts");

function runLint(args: string[] = []): { status: number; out: string } {
  const r = spawnSync(process.execPath, [LINT, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("phiên bản hợp đồng (DEBT #13)", () => {
  it("CONTRACTS_VERSION bằng đúng version của packages/core/package.json", () => {
    // Một nguồn sự thật. Lệch hai nơi = client và server nói hai số khác nhau về
    // cùng một hợp đồng, mà cổng version lúc chạy lại dựa trên chính con số này.
    const pkg = JSON.parse(readFileSync(join(repoRoot, "packages", "core", "package.json"), "utf8")) as {
      version: string;
    };
    expect(CONTRACTS_VERSION).toBe(pkg.version);
  });

  it("index.ts xuất CONTRACTS_VERSION từ version.ts, không phải bản sao cũ trong checkin.ts", () => {
    // `contracts/checkin.ts` còn giữ một CONTRACTS_VERSION từ thời hằng số nằm lạc chỗ.
    // Export tường minh trong index.ts phải thắng `export *` — nếu ngày nào đó hai giá trị
    // khác nhau mà thứ tự ưu tiên đổi, test này đỏ trước khi vibe team gặp chuyện.
    const versionSource = readFileSync(join(CONTRACTS_DIR, "version.ts"), "utf8");
    const declared = /export const CONTRACTS_VERSION\s*=\s*"([^"]+)"/.exec(versionSource)?.[1];
    expect(declared).toBe(CONTRACTS_VERSION);
  });

  it("CHANGELOG.md có mục cho phiên bản đang khai", () => {
    const changelog = readFileSync(join(CONTRACTS_DIR, "CHANGELOG.md"), "utf8");
    expect(changelog).toMatch(new RegExp(`^## \\[${CONTRACTS_VERSION.replace(/\./g, "\\.")}\\]`, "m"));
    expect(changelog).toMatch(/^## \[Unreleased\]/m);
  });

  it("parseSemver trả null cho chuỗi không phải semver, không đoán bừa", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("v1.2.3")).toBeNull();
    expect(parseSemver("abc")).toBeNull();
  });

  it("compareContractsVersions so theo số, không so chuỗi", () => {
    // So chuỗi thì "0.10.0" < "0.9.0" — đúng kiểu lỗi chỉ lộ ra ở phiên bản thứ 10.
    expect(compareContractsVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareContractsVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareContractsVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(() => compareContractsVersions("abc", "1.0.0")).toThrow();
  });

  it("cổng lúc chạy: client cũ bị từ chối, client chưa gắn header vẫn được phục vụ", () => {
    expect(CONTRACTS_VERSION_HEADER).toBe("x-contracts-version");
    // Chưa gắn header = toàn bộ client GĐ1 hiện tại → phải CHO QUA, nếu không là tự sập app.
    expect(isContractsVersionSupported(null)).toBe(true);
    expect(isContractsVersionSupported(undefined)).toBe(true);
    expect(isContractsVersionSupported("")).toBe(true);
    // Chuỗi rác = sai rõ ràng → từ chối, không im lặng cho qua.
    expect(isContractsVersionSupported("khong-phai-so")).toBe(false);
    // Bằng min hoặc mới hơn → phục vụ.
    expect(isContractsVersionSupported(MIN_SUPPORTED_CONTRACTS_VERSION)).toBe(true);
    expect(isContractsVersionSupported("99.0.0")).toBe(true);
    // Cũ hơn min → từ chối (server trả PRECONDITION_FAILED).
    expect(isContractsVersionSupported("0.0.1")).toBe(false);
  });

  it("ContractsMetaOutput là hợp đồng của procedure meta.contracts", () => {
    expect(
      ContractsMetaOutput.parse({ version: CONTRACTS_VERSION, minSupported: MIN_SUPPORTED_CONTRACTS_VERSION }),
    ).toEqual({ version: CONTRACTS_VERSION, minSupported: MIN_SUPPORTED_CONTRACTS_VERSION });
    expect(ContractsMetaOutput.safeParse({ version: CONTRACTS_VERSION }).success).toBe(false);
  });
});

describe("GetReportForWeekInput — chặn ngày rác ở biên, không để Postgres ném hộ", () => {
  const mondayIso = (offsetDays: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetDays); // dời về thứ Hai rồi cộng bù
    return d.toISOString().slice(0, 10);
  };

  it("nhận tuần hợp lệ", () => {
    const weekStart = mondayIso(-7);
    expect(GetReportForWeekInput.parse({ weekStart })).toEqual({ weekStart });
  });

  it("từ chối 'abc' — chính chuỗi từng làm 500 (mondayOf(NaN) → 'NaN-NaN-NaN' → 22007)", () => {
    const r = GetReportForWeekInput.safeParse({ weekStart: "abc" });
    expect(r.success).toBe(false);
  });

  it("từ chối ngày đúng hình dạng nhưng không có thật trên lịch", () => {
    expect(GetReportForWeekInput.safeParse({ weekStart: "2026-02-30" }).success).toBe(false);
    expect(GetReportForWeekInput.safeParse({ weekStart: "2026-13-01" }).success).toBe(false);
  });

  it("từ chối định dạng khác ISO (dd/mm/yyyy, thiếu số 0, kèm giờ)", () => {
    expect(GetReportForWeekInput.safeParse({ weekStart: "27/07/2026" }).success).toBe(false);
    expect(GetReportForWeekInput.safeParse({ weekStart: "2026-7-6" }).success).toBe(false);
    expect(GetReportForWeekInput.safeParse({ weekStart: "2026-07-06T00:00:00Z" }).success).toBe(false);
  });

  it("từ chối tuần tương lai xa và tuần trước khi hệ có dữ liệu", () => {
    expect(GetReportForWeekInput.safeParse({ weekStart: "2099-01-05" }).success).toBe(false);
    expect(GetReportForWeekInput.safeParse({ weekStart: "1999-01-04" }).success).toBe(false);
    // Nhưng "Tuần sau" trên buồng lái là hợp lệ — chặn nhầm nó là chặn tính năng có thật.
    expect(GetReportForWeekInput.safeParse({ weekStart: mondayIso(7) }).success).toBe(true);
  });

  it("GetGrowthReportInput dùng chung luật ngày và bắt buộc studentId là UUID", () => {
    expect(
      GetGrowthReportInput.safeParse({ studentId: "70000000-0000-0000-0000-000000000001", weekStart: "abc" }).success,
    ).toBe(false);
    expect(GetGrowthReportInput.safeParse({ studentId: "minh", weekStart: mondayIso(0) }).success).toBe(false);
  });
});

describe("hợp đồng output — lưới chắn khi truy vấn SQL đổi cột", () => {
  it("GetWeeklyReportOutput bọc đúng {studentId, weekStart, report}", () => {
    const report = {
      studentName: "Nguyễn Văn Minh",
      className: "6A1",
      weekLabel: "2026-07-27 – 2026-07-31",
      headline: "Một tuần rực rỡ!",
      glow: [{ title: "Đi học đủ 5/5 ngày", detail: "Điểm danh · chuỗi 5 ngày", accentColor: "green" as const }],
      grow: [],
      streakDays: 5,
      shareTokenExpiresAt: new Date().toISOString(),
      checkinDaysThisWeek: 5,
      happyDaysThisWeek: 3,
    };
    const parsed = GetWeeklyReportOutput.parse({
      studentId: "70000000-0000-0000-0000-000000000001",
      weekStart: "2026-07-27",
      report,
    });
    expect(parsed.report.headline).toBe("Một tuần rực rỡ!");
    // grow tối đa 1 mục: GĐ1 cố ý không liệt kê một danh sách điểm yếu cho trẻ đọc.
    expect(GetWeeklyReportOutput.safeParse({
      studentId: "70000000-0000-0000-0000-000000000001",
      weekStart: "2026-07-27",
      report: { ...report, grow: [{ title: "a", detail: "b" }, { title: "c", detail: "d" }] },
    }).success).toBe(false);
  });

  it("GuardianListOutput giữ đúng hình dạng đang chạy trên dây (snake_case của view)", () => {
    // `growth-report-view.tsx` đọc `g.full_name`; hợp đồng phải mô tả sự thật hôm nay,
    // đổi tên là thay đổi phá tương thích và phải đi expand–contract.
    const rows = GuardianListOutput.parse([{ full_name: "Nguyễn Thị Lan", relation: "mẹ" }]);
    expect(rows[0]?.full_name).toBe("Nguyễn Thị Lan");
    // Cột biến mất sau một lần sửa view → parse phải đỏ ngay tại biên, không trả undefined ra UI.
    expect(GuardianListOutput.safeParse([{ relation: "mẹ" }]).success).toBe(false);
  });

  it("MiniAppsOutput và SessionMeOutput khớp thứ người dùng thấy đầu tiên sau đăng nhập", () => {
    const tiles = MiniAppsOutput.parse([
      { key: "fitness", label: "Fitness", icon: "fitness_center", href: "/fitness", available: false },
    ]);
    expect(tiles[0]?.available).toBe(false);
    expect(MiniAppsOutput.safeParse([{ key: "x", label: "X", icon: "i", href: "/x" }]).success).toBe(false);

    // session.me là publicProcedure: chưa đăng nhập trả null, KHÔNG phải lỗi.
    expect(SessionMeOutput.parse(null)).toBeNull();
    expect(SessionMeOutput.parse({ displayName: null, roles: ["student"] })).toEqual({
      displayName: null,
      roles: ["student"],
    });
    expect(SessionMeOutput.safeParse({ displayName: "Minh", roles: ["khong-co-vai-nay"] }).success).toBe(false);
  });
});

describe("cổng CI contracts-lint — phải ĐÓNG thật, không chỉ in OK", () => {
  let sandbox = "";
  const contractsOf = (root: string) => join(root, "packages", "core", "contracts");

  /** Dựng một bản sao contracts để phá thử — không đụng vào cây thật của kho. */
  const freshSandbox = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "contracts-lint-"));
    mkdirSync(join(dir, "packages", "core"), { recursive: true });
    cpSync(CONTRACTS_DIR, contractsOf(dir), { recursive: true });
    cpSync(join(repoRoot, "packages", "core", "package.json"), join(dir, "packages", "core", "package.json"));
    return dir;
  };

  const edit = (root: string, file: string, from: string, to: string): void => {
    const path = join(contractsOf(root), file);
    const src = readFileSync(path, "utf8");
    if (!src.includes(from)) throw new Error(`không thấy đoạn cần sửa trong ${file}: ${from}`);
    writeFileSync(path, src.replace(from, to), "utf8");
  };

  beforeAll(() => {
    sandbox = freshSandbox();
  });
  afterAll(() => {
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  });

  it("HEAD sạch: exit 0", () => {
    const r = runLint();
    expect(r.out).toContain("bề mặt hợp đồng khớp bản chụp");
    expect(r.status).toBe(0);
  });

  it("bản sao nguyên vẹn cũng exit 0 (chứng minh cờ --root không làm cổng mất tác dụng)", () => {
    expect(runLint(["--root", sandbox]).status).toBe(0);
  });

  it("THÊM field vào một z.object mà không cập nhật bản chụp → exit 1", () => {
    const root = freshSandbox();
    try {
      edit(root, "report.ts", "export const GrowItem = z.object({\n  title: z.string(),", "export const GrowItem = z.object({\n  title: z.string(),\n  secretField: z.string(),");
      const r = runLint(["--root", root]);
      expect(r.status).toBe(1);
      expect(r.out).toContain("GrowItem.secretField");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("XOÁ field khỏi một z.object → exit 1 kèm chỉ dẫn expand–contract", () => {
    const root = freshSandbox();
    try {
      edit(root, "report.ts", "  relation: z.string(),\n", "");
      const r = runLint(["--root", root]);
      expect(r.status).toBe(1);
      expect(r.out).toContain("GuardianContact.relation");
      expect(r.out).toContain("expand–contract");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("--update TỪ CHỐI ghi đè khi có field bị xoá mà version chưa tăng", () => {
    // Đây là chỗ cổng thực sự có răng: không có luật này thì ai cũng chạy --update
    // rồi commit, và việc xoá field đi qua CI không một tiếng động.
    const root = freshSandbox();
    try {
      edit(root, "report.ts", "  relation: z.string(),\n", "");
      const r = runLint(["--root", root, "--update"]);
      expect(r.status).toBe(1);
      expect(r.out).toContain("CONTRACTS_VERSION vẫn là");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CONTRACTS_VERSION lệch packages/core/package.json → exit 1", () => {
    const root = freshSandbox();
    try {
      edit(root, "version.ts", 'export const CONTRACTS_VERSION = "', 'export const CONTRACTS_VERSION = "9.9.9"; //');
      const r = runLint(["--root", root]);
      expect(r.status).toBe(1);
      expect(r.out).toContain("package.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CHANGELOG thiếu mục cho phiên bản đang khai → exit 1", () => {
    const root = freshSandbox();
    try {
      edit(root, "CHANGELOG.md", `## [${CONTRACTS_VERSION}]`, "## [0.0.9-cu]");
      const r = runLint(["--root", root]);
      expect(r.status).toBe(1);
      expect(r.out).toContain("CHANGELOG.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("file contract không được xuất trong index.ts → exit 1 (vibe team sẽ không thấy nó)", () => {
    const root = freshSandbox();
    try {
      writeFileSync(join(contractsOf(root), "fitness.ts"), 'import { z } from "zod";\nexport const X = z.object({ a: z.string() });\n', "utf8");
      const r = runLint(["--root", root]);
      expect(r.status).toBe(1);
      expect(r.out).toContain("index.ts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
