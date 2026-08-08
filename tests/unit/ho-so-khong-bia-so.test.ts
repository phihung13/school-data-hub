// tests/unit/ho-so-khong-bia-so.test.ts — gói "ho-so-theo-anh-mau" (06/08/2026).
//
// ═══════════════════════════════════════════════════════════════════════════════
// CỔNG CHO NHỮNG Ô CỐ Ý KHÔNG DỰNG
// ═══════════════════════════════════════════════════════════════════════════════
// Ảnh mẫu chủ đầu tư gửi cho màn /ho-so vẽ nhiều hơn số dữ liệu đang có. Sáu ô trong ảnh
// KHÔNG có bảng, cột, hay kênh nào phía sau (grep toàn bộ migration ngày 06/08/2026):
//
//   huy hiệu · đọc sách tuần (3/5) · thiết bị đang đăng nhập · công tắc nhắc check-in
//   buổi sáng · ô chọn ngôn ngữ · chip "GOOGLE SSO"
//
// Cộng một câu: "thường trả lời trong ngày" cạnh tên thầy cô chủ nhiệm — một cam kết SLA
// không ai đặt ra. Lý do từng ô nằm ở đầu `apps/hub/components/profile-view.tsx`; bài test
// này không kể lại, nó chỉ giữ cho quyết định đó không bị lặng lẽ đảo ngược.
//
// Vì sao phải là một bài test chứ không phải một dòng chú thích: chú thích ĐÃ CÓ trong
// file cũ ("KHÔNG có huy hiệu/đọc sách tuần… vì chưa có bảng"), và nó không ngăn được gì —
// nó chỉ nói với người ĐANG ĐỌC file. Người thêm một ô số vào màn hồ sơ sáu tháng nữa sẽ
// mở file ở giữa, thấy hai ô số đang chạy, và thêm ô thứ ba cho cân. Không có gì hỏng:
// typecheck sạch, build sạch, màn hình đẹp hơn. Chỉ có một con số không tồn tại được in
// trước mặt một đứa trẻ, và một cái công tắc nó bật lên rồi trông chờ.
//
// Đây là điều 20 hiến pháp UI ("không số liệu bịa, không nút dở dang, không liên kết
// chết") viết thành phép đo.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const hubDir = join(repoRoot, "apps", "hub");
const componentsDir = join(hubDir, "components");
const appDir = join(hubDir, "app");

/**
 * Đọc mã nguồn ĐÃ BỎ chú thích — bắt buộc, cùng lý do với các bộ quét khác trong thư mục
 * này: `profile-view.tsx` kể lại nguyên văn tên sáu ô bị loại ("huy hiệu", "đọc sách
 * tuần", "GOOGLE SSO"…) trong chú thích đầu file để lần sau không ai dựng lại chúng.
 * Quét cả chú thích thì cách "sửa" test duy nhất là xoá lời giải thích — bài test tự phá
 * đúng thứ nó bảo vệ.
 */
function read(file: string): string {
  return readFileSync(join(componentsDir, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:@\w])\/\/.*$/gm, "$1");
}

const hoSo = read("profile-view.tsx");
const menuTaiKhoan = read("user-menu.tsx");

/** Chữ HIỆN TRÊN MÀN: các đoạn nằm giữa hai thẻ JSX (bỏ phần có mã TypeScript lẫn vào). */
function chuTrenMan(src: string): string[] {
  return [...src.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1]!.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// 1. Sáu ô không có dữ liệu — không được dựng bằng số giả
// ---------------------------------------------------------------------------

/**
 * Mỗi mục: nhãn người dùng đọc được, và thứ đang thiếu ở tầng dữ liệu. Vế thứ hai in ra
 * trong câu báo lỗi để người làm CI đỏ biết ngay phải dựng cái gì TRƯỚC, chứ không phải
 * đi tìm cách qua mặt bài test.
 */
const O_CHUA_CO_DU_LIEU: Array<[RegExp, string]> = [
  [/huy hiệu/i, "chưa có bảng huy hiệu nào trong migration"],
  [/đọc sách/i, "Học tập là mini app giai đoạn 2, chưa xây"],
  [/thiết bị/i, "không có sổ thiết bị — phiên là token 15 phút, hệ không biết máy nào"],
  [/nhắc\s+check-?in/i, "chưa có kênh đẩy nào (DEBT #40)"],
  [/ngôn ngữ/i, "chưa có i18n — một ô chọn có đúng một lựa chọn là ô trang trí"],
  [/google\s*sso/i, "Google SSO thật chưa bật, /login đang chạy nhà cung cấp thử"],
  [/thường trả lời trong ngày/i, "không có SLA nào của trường nói thế"],
];

describe("màn /ho-so không in thứ chưa có dữ liệu", () => {
  // Quét TOÀN BỘ mã nguồn (đã bỏ chú thích), không chỉ phần chữ nằm giữa hai thẻ.
  //
  // Lý do là một lỗ đã sập ngay khi viết bài test này: nhãn của ô số đi vào màn qua một
  // prop (`label="chuỗi check-in"`), không qua chỗ nào nằm giữa `>` và `<`. Một bộ quét
  // chỉ nhìn chữ-giữa-hai-thẻ sẽ XANH cho `<StatTile label="huy hiệu" value={3} />` — tức
  // là xanh đúng lúc lỗi xảy ra. Bảy mẫu dưới đây đều là tiếng Việt có dấu hoặc tên riêng,
  // không mẫu nào trùng với tên lớp CSS hay tên thuộc tính, nên quét rộng không báo oan.
  it.each(O_CHUA_CO_DU_LIEU)("không có nhãn %s trên màn — %s", (nhan, viSao) => {
    const dinh = hoSo.match(new RegExp(`.{0,40}${nhan.source}.{0,40}`, nhan.flags + "g")) ?? [];
    expect(dinh, `màn hồ sơ đang nhắc tới "${dinh[0] ?? ""}" — ${viSao}`).toEqual([]);
  });

  it("bộ quét chữ-trên-màn thật sự đọc được màn này (không xanh vì rỗng)", () => {
    // Nếu regex trích chữ hỏng (đổi cách viết JSX chẳng hạn) thì các phép đo dựa vào nó
    // xanh hết vì không tìm thấy gì để đối chiếu. Chốt vài câu CÓ THẬT để hỏng ra tiếng.
    const chu = chuTrenMan(hoSo);
    expect(chu.length).toBeGreaterThan(10);
    expect(chu).toContain("Đăng xuất");
    expect(chu).toContain("ĐANG DÙNG");
    expect(chu).toContain("Ai thấy gì của mình?");
  });
});

// ---------------------------------------------------------------------------
// 2. Không công tắc, không ô chọn, không ô nhập nào chưa nối vào đâu
// ---------------------------------------------------------------------------

describe("không affordance giả trên màn hồ sơ", () => {
  it("không có công tắc / ô chọn / ô nhập nào", () => {
    // Thẻ "Cài đặt" trong ảnh mẫu gồm một ô chọn ngôn ngữ và một công tắc nhắc buổi sáng.
    // Cả hai đều KHÔNG có gì phía sau. Một công tắc bật lên rồi không ai nhận được nhắc
    // là lời hứa suông — và nó tệ hơn không có, vì em bật rồi trông chờ vào nó.
    // Ngày nào thẻ Cài đặt có tính năng thật thì bài này phải được sửa CÙNG LÚC, và người
    // sửa sẽ đọc được đoạn này trước khi sửa.
    for (const [ten, re] of [
      ["công tắc", /role="switch"|type="checkbox"/],
      ["ô chọn", /<select\b/],
      ["ô nhập", /<input\b/],
      ["ô tìm kiếm", /type="search"/],
    ] as const) {
      expect(hoSo, `màn hồ sơ có ${ten} — nó nối vào đâu?`).not.toMatch(re);
    }
  });

  it("mọi liên kết trên màn hồ sơ trỏ tới trang có thật", () => {
    const gay = hrefTrongFile(hoSo).filter((h) => !routeExists(h));
    expect(gay, "liên kết chết trên màn hồ sơ").toEqual([]);
  });

  it("lớp nổi tài khoản không có mục dẫn tới hư không", () => {
    // Ảnh mẫu vẽ bốn mục: Hồ sơ của tôi · Cài đặt · Trợ giúp · Đăng xuất. "Cài đặt" không
    // có trang nào; "Trợ giúp" có trang thật (/can-gap-thay-co) nhưng CHỈ học sinh vào
    // được, mà lớp nổi này dựng chung cho tám vai và không nhận `roles` — thêm vào là đưa
    // bảy vai kia vào một cú bấm dội ngược. Lý lẽ đầy đủ ở đầu user-menu.tsx.
    const gay = hrefTrongFile(menuTaiKhoan).filter((h) => !routeExists(h));
    expect(gay, "mục menu trỏ tới trang chưa tồn tại").toEqual([]);
    for (const nhan of ["Cài đặt", "Trợ giúp"]) {
      expect(chuTrenMan(menuTaiKhoan), `mục "${nhan}" chưa có trang riêng`).not.toContain(nhan);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Mọi con số trên màn đến từ dữ liệu, không từ mã
// ---------------------------------------------------------------------------

describe("hai ô số là số đếm thật, không phải hằng viết tay", () => {
  it("không có con số nào nằm thẳng trong chữ trên màn", () => {
    // Bắt cả "3" lẫn "3/5" — dạng thứ hai chính là ô "đọc sách tuần" của ảnh mẫu.
    // "School Hub v1.0 · Giai đoạn 1 · Trường Việt Anh" không khớp: nó không phải một
    // đoạn chữ chỉ gồm con số.
    const so = chuTrenMan(hoSo).filter((t) => /^\d+(\s*\/\s*\d+)?$/.test(t));
    expect(so, "con số viết thẳng trong JSX — nó lấy từ đâu?").toEqual([]);
  });

  it("mọi giá trị ô số là biểu thức từ profile, không phải hằng số", () => {
    const gia = [...hoSo.matchAll(/\bvalue=(\{[^}]*\}|"[^"]*")/g)].map((m) => m[1]!);
    expect(gia.length, "không tìm thấy ô số nào để đo").toBeGreaterThan(0);
    const bia = gia.filter((v) => !/^\{[A-Za-z_$][\w$.]*\}$/.test(v));
    expect(bia, "ô số nhận giá trị viết cứng").toEqual([]);
  });

  it("không lấp số liệu thiếu bằng số 0", () => {
    // `?? 0` biến "API hỏng" thành "0 ngày có mặt" — một con số THẬT nói sai về chính em.
    // Cùng luật với SkeletonBlock trong ui/query-state.tsx.
    expect(hoSo).not.toMatch(/\?\?\s*0\b/);
  });

  it("router profile không khai thêm trường nào chưa có nguồn", () => {
    // Cổng một chiều: thêm trường mới thì không sao, nhưng tên của bốn thứ đã bị loại thì
    // không được xuất hiện — nếu chúng quay lại ở tầng dữ liệu thì cả màn hình lẫn bài
    // test này phải được sửa có chủ ý, cùng một lần.
    const router = readFileSync(join(hubDir, "server", "routers", "profile.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:@\w])\/\/.*$/gm, "$1");
    for (const khoa of ["badge", "reading", "device", "reminder", "locale"]) {
      expect(router.toLowerCase(), `router trả trường "${khoa}" — nguồn của nó ở đâu?`).not.toContain(
        khoa,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Đăng xuất phải hỏi lại (điều 15: thao tác không lùi được)
// ---------------------------------------------------------------------------

const CO_NUT_DANG_XUAT: Array<[string, string]> = [
  ["profile-view.tsx", hoSo],
  ["user-menu.tsx", menuTaiKhoan],
];

describe("đăng xuất: hỏi lại trước khi thoát phiên", () => {
  it.each(CO_NUT_DANG_XUAT)("%s hỏi lại rồi mới huỷ phiên", (_ten, src) => {
    const cauHoi = "Đăng xuất khỏi tài khoản này?";
    const at = src.indexOf(cauHoi);
    expect(at, `${_ten}: không tìm thấy bước hỏi lại`).toBeGreaterThan(-1);
    // Cả hai nút của bước hỏi lại phải nằm cùng chỗ với câu hỏi: đường đi tiếp VÀ đường
    // lùi. Chỉ có đường đi tiếp thì câu hỏi là một cái bẫy, không phải một câu hỏi.
    const khoi = src.slice(at, at + 1200);
    expect(khoi, `${_ten}: bước hỏi lại không có đường lùi`).toContain("Ở lại");
    expect(khoi, `${_ten}: bước hỏi lại không dẫn tới lệnh thoát`).toMatch(
      /onClick=\{logout\}|\/api\/auth\/logout/,
    );
  });

  it.each(CO_NUT_DANG_XUAT)("%s không còn đường thoát phiên chỉ một cú bấm", (_ten, src) => {
    // Nút mở ra bước hỏi lại phải CHỈ mở bước đó. Nếu còn chỗ nào gọi thẳng lệnh thoát mà
    // không đi qua trạng thái `hoiLai` thì bước hỏi lại chỉ là trang trí.
    expect(src, `${_ten}: thiếu trạng thái hỏi lại`).toMatch(/setHoiLai\(true\)/);
    // ĐÚNG MỘT chỗ trong file gọi được tới lệnh huỷ phiên, và ĐÚNG MỘT chỗ gắn nó vào một
    // cú bấm. Đếm tách hai thứ vì chúng là hai chuyện khác nhau: `profile-view.tsx` khai
    // endpoint trong hook `useLogout()` rồi gắn vào nút bằng `onClick={logout}` (1 + 1),
    // còn `user-menu.tsx` viết thẳng fetch trong onClick (1 + 0). Cộng gộp hai con số lại
    // là đo hai file bằng hai thước khác nhau.
    const goiEndpoint = (src.match(/\/api\/auth\/logout/g) ?? []).length;
    expect(goiEndpoint, `${_ten}: có ${goiEndpoint} chỗ gọi lệnh huỷ phiên`).toBe(1);
    const ganVaoNut = (src.match(/onClick=\{logout\}/g) ?? []).length;
    expect(ganVaoNut, `${_ten}: có ${ganVaoNut} nút gọi thẳng lệnh thoát`).toBeLessThanOrEqual(1);
  });

  it("phím Escape ở bước hỏi lại là “Ở lại”, không phải “thoát”", () => {
    for (const [ten, src] of CO_NUT_DANG_XUAT) {
      const at = src.indexOf('aria-label="Xác nhận đăng xuất"');
      expect(at, `${ten}: khối hỏi lại không có nhãn cho trình đọc màn hình`).toBeGreaterThan(-1);
      expect(src.slice(at, at + 400), `${ten}: Escape không lùi về trạng thái an toàn`).toMatch(
        /Escape[\s\S]{0,120}setHoiLai\(false\)/,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Bộ phân giải đường dẫn — chép lại từ nav-links.test.ts một cách CÓ CHỦ Ý.
//
// Hai cái cân độc lập thì hỏng một cái không kéo theo cái kia; và bài này cân thứ khác:
// nav-links.test.ts đo các BẢNG điều hướng (`lib/man-hinh.ts`), còn ở đây là href viết
// thẳng trong JSX của hai file — vùng mà bảng kia không nhìn tới.
// ---------------------------------------------------------------------------

function hrefTrongFile(src: string): string[] {
  return [...new Set([...src.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]!))];
}

function routeExists(href: string): boolean {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  let dir = appDir;
  for (const segment of path.split("/").filter(Boolean)) {
    const direct = join(dir, segment);
    if (existsSync(direct) && statSync(direct).isDirectory()) {
      dir = direct;
      continue;
    }
    const dynamic = readdirSync(dir, { withFileTypes: true }).find(
      (e) => e.isDirectory() && e.name.startsWith("[") && e.name.endsWith("]"),
    );
    if (!dynamic) return false;
    dir = join(dir, dynamic.name);
  }
  return ["page.tsx", "page.ts", "route.ts", "route.tsx"].some((f) => existsSync(join(dir, f)));
}

describe("bộ phân giải đường dẫn (tự kiểm chính nó)", () => {
  it("nhận ra trang có thật và trang không có", () => {
    expect(routeExists("/ho-so")).toBe(true);
    expect(routeExists("/can-gap-thay-co")).toBe(true);
    expect(routeExists("/api/auth/logout")).toBe(true);
    expect(routeExists("/khong-he-co-trang-nay")).toBe(false);
  });

  it("đọc được href thật trong hai file đang canh", () => {
    expect(hrefTrongFile(hoSo)).toContain("/can-gap-thay-co");
    expect(hrefTrongFile(menuTaiKhoan)).toContain("/ho-so");
  });
});
