// tests/unit/dev-login-gate.test.ts — gói "khoa-cua-dev-login" (nợ #19).
//
// CÁI HỎNG MÀ BỘ TEST NÀY CANH, kể lại cho đúng: tới sáng 02/08/2026,
// `/api/auth/dev-login` nhận một `authUid` trong danh sách mẫu rồi trả thẳng cookie
// phiên đúng vai đó — không mật khẩu, không kiểm môi trường. Route nằm sau tên miền
// công khai `hub.truongvietanh.com` và dãy UUID mẫu đoán được bằng mắt, nên một lượt
// POST từ ngoài Internet là một phiên hiệu trưởng.
//
// Bốn lời hứa của bản vá, và mỗi lời hứa được khẳng định CẢ HAI CHIỀU ở dưới:
//   (a) không có bí mật thì KHÔNG vào được — và có bí mật thì vào được;
//   (b) nhập đúng một lần, cookie nhớ 30 ngày — và cookie giả/hết hạn/ký bằng bí mật
//       khác thì không nhớ được gì;
//   (c) biến môi trường trống ⇒ TỪ CHỐI HẲN (mặc định đóng), không mở toang;
//   (d) NODE_ENV=production ⇒ cửa không tồn tại, kể cả khi cầm bí mật đúng.
//
// Phần 5 canh chuyện khác hẳn: bí mật THẬT không được rò vào file nào git theo dõi.
// Cổng đó bắt được đúng loại lỗi mà không cổng nào ở trên bắt được — dán mã vào
// .env.example hay vào tài liệu "cho dễ nhớ".
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEV_GATE_TTL_SECONDS,
  DEV_SECRET_MIN_LENGTH,
  devLoginRouteExists,
  evaluateDevGate,
  issueDevGateToken,
  readDevLoginSecret,
  verifyDevGateToken,
  verifyDevSecret,
} from "@hub/core/auth-adapter";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

/** Bí mật giả dùng trong test — KHÔNG phải bí mật thật, và cố ý đủ dài để hợp lệ. */
const SECRET = "test-secret-dai-du-32-ky-tu-0123";
const OTHER_SECRET = "mot-bi-mat-hoan-toan-khac-0123456";
const ENV_OK = { NODE_ENV: "development", DEV_LOGIN_SECRET: SECRET };

// ---------------------------------------------------------------------------
// 1. Lời hứa (d): production thì cửa KHÔNG TỒN TẠI
// ---------------------------------------------------------------------------

describe("(d) NODE_ENV=production: route không tồn tại, bất kể bí mật", () => {
  it("có bí mật đúng trong header vẫn là `absent`", () => {
    const env = { NODE_ENV: "production", DEV_LOGIN_SECRET: SECRET };
    expect(evaluateDevGate({ header: SECRET }, env)).toBe("absent");
    expect(evaluateDevGate({ cookie: issueDevGateToken(SECRET) }, env)).toBe("absent");
  });

  it("chiều ngược lại: ngoài production thì cửa có tồn tại", () => {
    expect(devLoginRouteExists({ NODE_ENV: "production" })).toBe(false);
    expect(devLoginRouteExists({ NODE_ENV: "development" })).toBe(true);
    expect(devLoginRouteExists({ NODE_ENV: "test" })).toBe(true);
    // Biến không đặt (chạy `node server.mjs` trần) = dev. Đây là mặc định của server.mjs.
    expect(devLoginRouteExists({})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Lời hứa (c): thiếu cấu hình thì ĐÓNG, không mở
// ---------------------------------------------------------------------------

describe("(c) biến môi trường trống ⇒ từ chối hẳn, mặc định là đóng", () => {
  it("không đặt DEV_LOGIN_SECRET ⇒ `misconfigured`, không phải `open`", () => {
    expect(evaluateDevGate({}, { NODE_ENV: "development" })).toBe("misconfigured");
    expect(evaluateDevGate({ header: "bất kỳ" }, { NODE_ENV: "development" })).toBe("misconfigured");
    // Chuỗi rỗng và chuỗi toàn khoảng trắng cũng vậy — "đặt cho có" không phải là đặt.
    expect(evaluateDevGate({}, { NODE_ENV: "development", DEV_LOGIN_SECRET: "" })).toBe("misconfigured");
    expect(evaluateDevGate({}, { NODE_ENV: "development", DEV_LOGIN_SECRET: "   " })).toBe("misconfigured");
  });

  it("bí mật ngắn hơn ngưỡng bị coi như CHƯA ĐẶT (chốt giấy còn tệ hơn không có chốt)", () => {
    const ngan = "a".repeat(DEV_SECRET_MIN_LENGTH - 1);
    expect(readDevLoginSecret({ DEV_LOGIN_SECRET: ngan })).toBeNull();
    expect(evaluateDevGate({ header: ngan }, { NODE_ENV: "development", DEV_LOGIN_SECRET: ngan })).toBe(
      "misconfigured",
    );
    // Chiều ngược lại: đúng ngưỡng thì cửa bật.
    const dungNguong = "a".repeat(DEV_SECRET_MIN_LENGTH);
    expect(readDevLoginSecret({ DEV_LOGIN_SECRET: dungNguong })).toBe(dungNguong);
  });

  it("ngưỡng tối thiểu không được hạ xuống dưới 12 ký tự", () => {
    // Con số này đứng sau một tên miền công khai. Hạ nó là mở cửa, không phải nới lỏng.
    expect(DEV_SECRET_MIN_LENGTH).toBeGreaterThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// 3. Lời hứa (a): không có bí mật thì không vào được
// ---------------------------------------------------------------------------

describe("(a) không bí mật thì bị từ chối, có bí mật thì vào được", () => {
  it("không mang gì cả ⇒ `locked`", () => {
    expect(evaluateDevGate({}, ENV_OK)).toBe("locked");
    expect(evaluateDevGate({ cookie: null, header: null }, ENV_OK)).toBe("locked");
  });

  it("header đúng bí mật ⇒ `open` (đường dành cho curl/script)", () => {
    expect(evaluateDevGate({ header: SECRET }, ENV_OK)).toBe("open");
  });

  it("header sai ⇒ `locked`, kể cả khi đúng phần đầu", () => {
    expect(evaluateDevGate({ header: "sai" }, ENV_OK)).toBe("locked");
    expect(evaluateDevGate({ header: SECRET.slice(0, -1) }, ENV_OK)).toBe("locked");
    expect(evaluateDevGate({ header: SECRET + "x" }, ENV_OK)).toBe("locked");
    // Khác hoa/thường là khác — bí mật không phải mã mời 6 ký tự.
    expect(evaluateDevGate({ header: SECRET.toUpperCase() }, ENV_OK)).toBe("locked");
  });

  it("KHÔNG có nhánh nào cho localhost: mọi request đều phải mang bí mật", () => {
    // Vì sao khẳng định điều này bằng test: đường hầm Cloudflare trỏ
    // hub.truongvietanh.com -> http://localhost:3000, nên request từ Internet cũng tới
    // Node với địa chỉ nguồn 127.0.0.1. Một ngày nào đó sẽ có người thấy "chỉ cho
    // localhost" là tiện và an toàn; nó không an toàn, nó xanh cho cả thế giới.
    const src = read("apps/hub/app/api/auth/dev-login/route.ts") + read("apps/hub/app/api/auth/dev-gate/route.ts");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    expect(code).not.toMatch(/127\.0\.0\.1|::1|isLocalhost|localhost/);
  });

  it("gõ thừa khoảng trắng ở điện thoại vẫn vào được, chuỗi rỗng thì không", () => {
    expect(verifyDevSecret(`  ${SECRET} `, SECRET)).toBe(true);
    expect(verifyDevSecret("", SECRET)).toBe(false);
    expect(verifyDevSecret("   ", SECRET)).toBe(false);
    expect(verifyDevSecret(undefined, SECRET)).toBe(false);
    expect(verifyDevSecret(123, SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Lời hứa (b): nhập MỘT lần, cookie nhớ — và chỉ cookie thật mới được nhớ
// ---------------------------------------------------------------------------

describe("(b) vé trong cookie: nhớ 30 ngày, không giả được", () => {
  const now = Date.UTC(2026, 7, 2, 9, 0, 0);

  it("vé vừa phát ⇒ `open`, và còn dùng được sau 29 ngày", () => {
    const token = issueDevGateToken(SECRET, now);
    expect(evaluateDevGate({ cookie: token }, ENV_OK, now)).toBe("open");
    expect(evaluateDevGate({ cookie: token }, ENV_OK, now + 29 * 86_400_000)).toBe("open");
  });

  it("quá 30 ngày thì hết — người dùng nhập lại một lần nữa", () => {
    const token = issueDevGateToken(SECRET, now);
    expect(DEV_GATE_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(verifyDevGateToken(token, SECRET, now + 31 * 86_400_000)).toBe(false);
    expect(evaluateDevGate({ cookie: token }, ENV_OK, now + 31 * 86_400_000)).toBe("locked");
  });

  it("đổi DEV_LOGIN_SECRET là THU HỒI mọi vé đã phát (điện thoại thất lạc)", () => {
    const token = issueDevGateToken(SECRET, now);
    expect(verifyDevGateToken(token, OTHER_SECRET, now)).toBe(false);
    expect(
      evaluateDevGate({ cookie: token }, { NODE_ENV: "development", DEV_LOGIN_SECRET: OTHER_SECRET }, now),
    ).toBe("locked");
  });

  it("sửa hạn hoặc sửa chữ ký trong vé đều không qua được", () => {
    const token = issueDevGateToken(SECRET, now);
    const exp = token.slice(0, token.indexOf("."));
    const mac = token.slice(token.indexOf(".") + 1);
    // Kéo dài hạn thêm 10 năm mà giữ nguyên chữ ký.
    expect(verifyDevGateToken(`${Number(exp) + 315_360_000}.${mac}`, SECRET, now)).toBe(false);
    // Đổi một ký tự của chữ ký.
    const doiMotKyTu = mac.slice(0, -1) + (mac.endsWith("a") ? "b" : "a");
    expect(verifyDevGateToken(`${exp}.${doiMotKyTu}`, SECRET, now)).toBe(false);
    // Rác đủ kiểu.
    for (const rac of ["", ".", "abc", `${exp}.`, `.${mac}`, "9999999999.deadbeef", token.replace(".", "")]) {
      expect(verifyDevGateToken(rac, SECRET, now), `vé rác "${rac}" không được qua`).toBe(false);
    }
    expect(verifyDevGateToken(null, SECRET, now)).toBe(false);
  });

  it("vé KHÔNG mang bí mật trần — lộ cookie không phải lộ mã", () => {
    const token = issueDevGateToken(SECRET, now);
    expect(token).not.toContain(SECRET);
    expect(Buffer.from(token, "utf8").toString("base64")).not.toContain(
      Buffer.from(SECRET, "utf8").toString("base64"),
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Cửa phải THẬT SỰ được mắc vào route, và bí mật thật không được rò ra kho
// ---------------------------------------------------------------------------

describe("cửa được mắc đúng chỗ trong route", () => {
  const devLogin = read("apps/hub/app/api/auth/dev-login/route.ts");

  it("dev-login hỏi cửa TRƯỚC khi đọc thân request", () => {
    // Thứ tự này không phải chuyện thẩm mỹ: nếu parse `authUid` trước, route sẽ trả
    // 404 "tài khoản dev không tồn tại" cho người chưa qua cửa — tức là biến chính nó
    // thành một cửa dò danh sách tài khoản có thật, miễn phí.
    const gateAt = devLogin.indexOf("evaluateDevGate(");
    const bodyAt = devLogin.indexOf("req.json()");
    expect(gateAt, "dev-login phải gọi evaluateDevGate").toBeGreaterThan(-1);
    expect(bodyAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(bodyAt);
  });

  it("xử lý đủ bốn trạng thái cửa, mỗi trạng thái một mã HTTP", () => {
    for (const state of ["absent", "misconfigured", "locked"]) {
      expect(devLogin, `thiếu nhánh "${state}"`).toContain(`gate === "${state}"`);
    }
    expect(devLogin).toMatch(/status: 404/);
    expect(devLogin).toMatch(/status: 503/);
    expect(devLogin).toMatch(/status: 401/);
  });

  it(".env.example khai biến nhưng ĐỂ TRỐNG giá trị", () => {
    const example = read("apps/hub/.env.example");
    expect(example).toMatch(/^DEV_LOGIN_SECRET=\s*$/m);
  });
});

describe("bí mật thật không rò vào file nào git theo dõi", () => {
  /**
   * Đọc bí mật ĐANG DÙNG từ apps/hub/.env.local (file đã gitignore), rồi quét cả kho
   * xem chuỗi đó có xuất hiện ở đâu khác không.
   *
   * Đây là cổng bắt được thứ mà `tools/secret-scan.mjs` không bắt được: secret-scan
   * biết hình dạng khóa Supabase và khóa Stripe, nó không biết mã mở khoá của trường
   * trông như thế nào. Còn lỗi thật hay xảy ra thì rất tầm thường — dán mã vào
   * .env.example, vào README, vào một dòng chú thích "cho dễ nhớ".
   */
  const envLocal = join(repoRoot, "apps", "hub", ".env.local");
  const secret = existsSync(envLocal)
    ? /^DEV_LOGIN_SECRET=(.+)$/m.exec(readFileSync(envLocal, "utf8"))?.[1]?.trim() ?? null
    : null;

  const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", ".impeccable"]);
  const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".sql", ".md", ".html", ".sh", ".yml", ".yaml", ".cmd", ".ps1"]);

  function filesContaining(needle: string): string[] {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) { walk(full); continue; }
        // File .env* PHẢI được quét, và `extname(".env.example")` trả ".example" nên
        // danh sách phần mở rộng ở trên không với tới chúng. Đây là chỗ lỗi thật sẽ
        // xảy ra nhất (dán mã vào .env.example "cho người sau đỡ phải hỏi"), và bản
        // đầu của chính test này đã BỎ SÓT nó — đo được lúc thử ngược 02/08/2026:
        // cố ý dán mã thật vào .env.example mà cổng này vẫn xanh.
        // `.env.local` là NGUỒN của bí mật, không phải chỗ rò — bỏ qua chính nó.
        if (entry === ".env.local") continue;
        if (!SCAN_EXT.has(extname(entry)) && !entry.startsWith(".env")) continue;
        try {
          if (readFileSync(full, "utf8").includes(needle)) hits.push(full.slice(repoRoot.length));
        } catch { /* file nhị phân/không đọc được: bỏ qua */ }
      }
    };
    walk(repoRoot);
    return hits;
  }

  it("mã trong .env.local không xuất hiện ở bất kỳ file nào khác", () => {
    if (!secret) {
      // Máy chưa cấu hình: không có gì để rò. Vẫn khẳng định một điều thật —
      // bản mẫu không được mang sẵn giá trị nào.
      expect(read("apps/hub/.env.example")).toMatch(/^DEV_LOGIN_SECRET=\s*$/m);
      return;
    }
    expect(secret.length).toBeGreaterThanOrEqual(DEV_SECRET_MIN_LENGTH);
    expect(filesContaining(secret)).toEqual([]);
  });
});
