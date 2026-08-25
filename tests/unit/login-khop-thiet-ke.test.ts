// tests/unit/login-khop-thiet-ke.test.ts — màn đăng nhập phải KHỚP bản thiết kế,
// đọc theo CASCADE.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO BÀI NÀY ĐỌC "GIÁ TRỊ CUỐI", KHÔNG PHẢI "KHỐI ĐẦU TIÊN"
// ═══════════════════════════════════════════════════════════════════════════════
// Chủ đầu tư hỏi 24/08/2026: *"bạn đã bao giờ tự so sánh với file tôi đưa chưa"* — và ba
// lượt liền câu trả lời thật là chưa so cho đúng. File thiết kế khai MỘT selector nhiều
// lần: `.cin-main` xuất hiện ở ~10 khối, khối sau ghi đè khối trước (không @media, cùng
// specificity — đúng luật cascade). Bản đầu của bài này dùng regex lấy khối ĐẦU TIÊN,
// nên nó canh BẢN NHÁP: khối chữ 72px góc phải dưới, hàng nút row-reverse — những thứ
// chính người thiết kế đã thay bằng panel 392px căn giữa dọc, chữ 33px, nút xếp cột.
// Ba máy soát độc lập (workflow 24/08) tìm ra chuyện đó.
//
// `giaTriCuoi(sel, prop)` dưới đây gom MỌI khối của selector theo thứ tự nguồn và trả
// giá trị CUỐI của thuộc tính — đúng cách trình duyệt đọc. Khi bản thiết kế được đồng bộ
// lại và đổi số, bài này đỏ: đó là lúc sửa bản thi hành theo, không phải lúc sửa test.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const goc = fileURLToPath(new URL("../../", import.meta.url));
const THIET_KE = readFileSync(join(goc, "apps/hub/public/trinh-dien/index.html"), "utf8");

/**
 * Mã màn đăng nhập, ĐÃ BÓC CHÚ THÍCH — bắt buộc, và bài này từng tự chứng minh vì sao:
 * chú thích trong login-form liệt kê ba lớp bóng của nút Google bằng chữ; phép so bỏ
 * khoảng trắng nên gỡ viền vàng THẬT khỏi nút mà bài vẫn xanh — nó đọc được viền vàng
 * trong lời giải thích. Thử ngược bắt được, không thử thì guard đứng canh thứ nó không
 * canh được.
 */
const LOGIN = readFileSync(join(goc, "apps/hub/components/login-form.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

/** Mọi thân khối của một selector, theo thứ tự nguồn. */
function cacKhoi(sel: string): string[] {
  const re = new RegExp(
    "(^|[}\\n])\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}",
    "g",
  );
  const ra: string[] = [];
  for (const m of THIET_KE.matchAll(re)) ra.push(m[2]);
  return ra;
}

/** Giá trị CUỐI của một thuộc tính qua toàn bộ cascade — đúng cách trình duyệt đọc. */
function giaTriCuoi(sel: string, prop: string): string | null {
  let cuoi: string | null = null;
  for (const khoi of cacKhoi(sel)) {
    const m = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)").exec(khoi);
    if (m) cuoi = m[1].trim();
  }
  return cuoi;
}

/** Bỏ khoảng trắng — Tailwind viết `620px_470px`, CSS viết `620px 470px`. */
const gon = (s: string) => s.replace(/[\s_]+/g, "");

describe("màn đăng nhập khớp TRẠNG THÁI CUỐI của bản thiết kế", () => {
  it("MẪU SỐ: cascade có thật — `.cin-main` khai NHIỀU lần và giá trị cuối KHÁC giá trị đầu", () => {
    // Nếu phép gom khối hỏng, mọi bài dưới xanh giả. Chốt bằng chính đặc điểm đã lừa
    // được ba lượt sửa: selector này có nhiều khối, và bản nháp khác bản cuối.
    const khoi = cacKhoi(".cin-main");
    expect(khoi.length, "cin-main phải có nhiều khối — file thiết kế đổi thì xem lại toàn bài").toBeGreaterThanOrEqual(5);
    expect(giaTriCuoi(".cin-main", "width"), "bản cuối là panel 392px").toBe("392px");
    expect(giaTriCuoi(".cin-h1", "font-size"), "bản nháp 72px đã bị ghi đè").toBe("33px");
    expect(LOGIN.length).toBeGreaterThan(10_000);
  });

  it("PANEL: 392px, cắt góc 26px, viền vàng gradient, bệ đỡ lệch, dập dềnh", () => {
    // Bốn chữ ký của panel cuối — thiếu cái nào là quay về bản nháp cái đó.
    expect(gon(LOGIN)).toContain(gon("max-w-[392px]"));
    const clip = giaTriCuoi(".cin-main", "clip-path")!;
    expect(clip).toContain("26px");
    expect(gon(LOGIN), "mất cắt góc 26px").toContain(gon(clip));
    const nen = giaTriCuoi(".cin-main", "background")!;
    expect(nen).toContain("rgba(255,198,41,.95)");
    expect(gon(LOGIN), "mất viền vàng gradient (nền lớp ngoài)").toContain(gon(nen));
    const bong = giaTriCuoi(".cin-main", "filter")!;
    expect(bong).toContain("13px 17px 0");
    expect(gon(LOGIN), "mất bệ đỡ lệch 13px/17px").toContain(gon(bong));
    expect(LOGIN, "mất dập dềnh panelFloat").toContain("panelFloat_7s");
  });

  it("LỚP TRONG của panel: lưới cyan 46px + gradient tối + blur 10px, và lớp SHEEN quét", () => {
    const trong = giaTriCuoi(".cin-main::before", "background")!;
    expect(trong).toContain("rgba(53,224,255,.055)");
    // Thiết kế viết nền + kích thước gộp (`… 0 0/100% 46px`); Tailwind tách thành
    // `bg-[…]` + `bg-[length:…]` — so theo TỪNG LỚP GRADIENT, không so cả chuỗi.
    for (const lop of trong.split(/,(?=\s*(?:radial|linear)-gradient)/)) {
      const loi = lop.replace(/\s+\d+\s+\d+\/[^,]+$/, "").trim();
      expect(gon(LOGIN), `panel thiếu lớp nền trong: ${loi.slice(0, 60)}`).toContain(
        gon(loi.replace(/\s0\s0\/.*$/, "")),
      );
    }
    // LẬT 24/08 (lượt "thẻ đăng nhập giật giật"): blur của thiết kế ĐÃ BỎ CÓ CHỦ Ý.
    // backdrop-blur trên panel mài lại VIDEO ĐANG CHẠY ở từng khung hình — trả GPU mỗi
    // giây cho một hiệu ứng mắt không thấy, vì nền trong đã đục 88–94%. Đây là một trong
    // hai nguồn giật chủ đầu tư báo. Dựng lại blur là rước lại cái giật.
    expect(LOGIN, "backdrop-blur quay lại — nguồn giật đã trị").not.toContain("backdrop-blur-[10px]");
    const sheen = giaTriCuoi(".cin-main::after", "background")!;
    expect(sheen).toContain("115deg");
    // 25/08: sheen đổi cơ chế bg-position -> transform (săn lag: bg-pos là animation
    // paint, vẽ lại cả panel kèm drop-shadow mỗi khung). GRADIENT của bản vẽ vẫn phải
    // còn nguyên — chỉ chuyển sang dải 260% chạy transform.
    expect(gon(LOGIN), "mất vệt sáng sheen").toContain(gon(sheen.replace(/\s*0 0\/260% 100%\s*$/, "")));
    expect(LOGIN).toContain("panelSheen_5.4s");
    expect(LOGIN, "sheen phải là dải transform, không phải bg-position").toContain('w-[260%]');
  });

  it("CHỮ: 33px lh 1.1 ls -.02em, bóng 0 12px 40px; <em> vàng + quầng 32px + nowrap", () => {
    expect(LOGIN).toContain("text-[33px]");
    expect(LOGIN).toContain("leading-[1.1]");
    expect(LOGIN).toContain("tracking-[-.02em]");
    expect(gon(LOGIN)).toContain(gon(giaTriCuoi(".cin-h1", "text-shadow")!));
    expect(gon(LOGIN)).toContain(gon(giaTriCuoi(".cin-h1 em", "text-shadow")!));
    expect(LOGIN, "em phải nowrap như thiết kế").toMatch(/<em className="[^"]*whitespace-nowrap/);
    // Và KHÔNG còn cỡ chữ của bản nháp.
    expect(LOGIN, "72px là bản nháp đã bị thiết kế ghi đè").not.toContain("text-[72px]");
  });

  it("HÀNG NÚT: CỘT (bản nháp row-reverse đã chết), Google 56px/r10 TRÊN, Zalo 52px/r10 DƯỚI", () => {
    expect(giaTriCuoi(".cin-cta", "flex-direction")).toBe("column");
    expect(LOGIN, "row-reverse là bản nháp").not.toContain("flex-row-reverse");
    expect(giaTriCuoi(".cin-cta .sso", "height")).toBe("56px");
    const iGoogle = LOGIN.indexOf("Đăng nhập với Google");
    const iZalo = LOGIN.indexOf("Phụ huynh · Zalo");
    expect(iGoogle, "không thấy nút Google").toBeGreaterThan(-1);
    expect(iGoogle, "Google phải đứng TRÊN Zalo trong cột").toBeLessThan(iZalo);
    const nutGoogle = LOGIN.slice(LOGIN.lastIndexOf("<button", iGoogle), iGoogle);
    expect(nutGoogle).toContain("h-14");
    expect(nutGoogle).toContain("rounded-[10px]");
    const nutZalo = LOGIN.slice(LOGIN.lastIndexOf("<button", iZalo), iZalo);
    expect(nutZalo).toContain("h-[52px]");
    expect(nutZalo).toContain("rounded-[10px]");
    expect(nutZalo).toContain("w-full");
  });

  it("nút Google giữ ĐỦ ba lớp bóng của `.sso` — viền vàng, quầng sáng, bóng sâu", () => {
    const sh = giaTriCuoi(".sso", "box-shadow")!;
    const thi = gon(LOGIN);
    for (const lop of sh.split(/,(?![^(]*\))/)) {
      expect(thi, `nút Google thiếu lớp bóng: ${lop.trim()}`).toContain(gon(lop.trim()));
    }
  });

  it("VÙNG DEV: khuôn tách dòng của `.devrow` cuối + MỘT Ô CHỌN (lệnh chủ đầu tư 24/08)", () => {
    // Khuôn `.devrow::before` cuối: kẻ trên rgba(199,216,240,.22), mono 9px giãn .2em.
    const truoc = cacKhoi(".devrow::before").at(-1)!;
    expect(truoc).toContain("rgba(199,216,240,.22)");
    expect(gon(LOGIN), "mất đường kẻ tách vùng DEV").toContain(gon("border-[rgba(199,216,240,.22)]"));
    expect(LOGIN).toContain("text-[9px]");
    expect(LOGIN).toContain("tracking-[.2em]");
    // Ruột là DROPDOWN — quyết định của chủ đầu tư, GHI ĐÈ hình 2 chip của thiết kế:
    // *"thành 1 dropdown"* (24/08/2026, sau khi thấy 13 tài khoản thành bức tường chip).
    // Đổi lại thành chip/nút rời là làm trái một lệnh trực tiếp — phải có lệnh mới.
    expect(LOGIN, "mất ô chọn tài khoản").toContain('id="tk-thu"');
    expect(LOGIN, "ô chọn phải nhóm theo vai — chiaNhom có bộ test riêng").toMatch(/chiaNhom\(devAccounts\)\.map/);
    expect(LOGIN).toContain("<optgroup");
  });

  it("CẤU TRÚC: một bố cục tràn viền, video mọi khổ màn, brand rồi mới tới panel", () => {
    expect(LOGIN, "dải hero mobile là bản parallax cũ").not.toContain("MobileHeroBand");
    const mVid = /<div aria-hidden className="([^"]*)">\s*<video/.exec(LOGIN);
    expect(mVid, "không tìm thấy khung bọc video").not.toBeNull();
    expect(mVid![1].split(/\s+/), "khung video mang lớp ẩn — khổ nhỏ mất video").not.toContain("hidden");
    const iBrand = LOGIN.indexOf("TRƯỜNG VIỆT ANH</span>");
    const iPanel = LOGIN.indexOf("max-w-[392px]");
    expect(iBrand).toBeGreaterThan(-1);
    expect(iBrand, "brand phải đứng trước panel trong cây DOM").toBeLessThan(iPanel);
    // Thứ tự trong panel: kicker → h1 → cta → vùng DEV (đúng 4 hàng thiết kế).
    const iKicker = LOGIN.indexOf("VIET ANH EDUCATION");
    const iH1 = LOGIN.indexOf("<h1");
    const iCta = LOGIN.indexOf("mt-[12px] flex flex-col items-stretch");
    const iDev = LOGIN.indexOf('id="tk-thu"');
    expect(iKicker).toBeLessThan(iH1);
    expect(iH1).toBeLessThan(iCta);
    expect(iCta).toBeLessThan(iDev);
  });

  it("video nền: giữ bộ lọc thiết kế, nhưng bố cục theo LỆNH CHỦ ĐẦU TƯ — cao bằng trang, neo trái, tan phải vào đen", () => {
    // ═══════════════════════════════════════════════════════════════════════
    // GHI ĐÈ THIẾT KẾ, CÓ LỆNH — 24/08/2026: "cho video bằng chiều cao với web đi,
    // chiều rộng có thiếu bên phải cũng được, xong rồi cho màu đen đè lên".
    // ═══════════════════════════════════════════════════════════════════════
    // Thiết kế dùng `object-fit:cover` tràn viền + lớp phủ 5 tầng `.cin-shade`. Chủ đầu
    // tư đổi: video giữ nguyên tỉ lệ cao bằng trang (sư tử không bị cắt), phần phải là
    // nền đen, mép video TAN DẦN vào đen. Bài này canh trạng thái ĐÃ DUYỆT đó — quay về
    // tràn-viền hay dựng lại 5 tầng đều là làm trái một lệnh trực tiếp.
    expect(gon(LOGIN), "mất bộ lọc sáng/bão hoà của thiết kế").toContain(
      gon(giaTriCuoi(".cin-bg", "filter")!),
    );
    expect(LOGIN, "video phải giữ tỉ lệ, cao bằng trang, neo trái").toContain("h-full w-auto max-w-none");
    expect(LOGIN, "khung bọc phải có nền đen cho phần hụt bên phải").toMatch(
      /aria-hidden className="pointer-events-none absolute inset-0 bg-\[#04102A\]"/,
    );
    // Hai yêu cầu CÙNG LÚC của chủ đầu tư, 24/08, theo thứ tự lệnh:
    //   a. "che đi cái lòi video" — phải có dải ĐỨNG đen đặc từ mép phải rộng ≥12% màn
    //      (mép video nằm ~88–95% tuỳ tỉ lệ, dải 14% phủ hết);
    //   b. "lan ra không đều mới đẹp… cố tình làm nó xéo xéo" — phải có lớp XÉO (góc
    //      292° của .cin-shade gốc) và vầng radial góc, để đường ranh nhìn thấy không
    //      phải một vạch thẳng đứng. Bỏ lớp xéo để "cho gọn" là làm trái lệnh b.
    const band = /linear-gradient\(270deg,#04102A_0%,#04102A_(\d+)%/.exec(LOGIN);
    expect(band, "mất dải an toàn che mép video").not.toBeNull();
    expect(Number(band![1]), "dải an toàn phải rộng ≥12% màn").toBeGreaterThanOrEqual(12);
    expect(LOGIN, "mất lớp xéo 292° — bóng lại lan đều tăm tắp").toContain("linear-gradient(292deg");
    expect(LOGIN, "mất vầng radial góc phải-dưới").toContain("radial-gradient(900px_700px_at_103%_104%");
    expect(LOGIN, "lớp phủ 5 tầng đã bị lệnh chủ đầu tư thay").not.toContain("104%_106%");
  });

  it("kicker: chấm vàng thở theo glowPulse của thiết kế, không phải animate-pulse", () => {
    // `.cin-kicker .dot` chạy glowPulse 2.2s — keyframes gốc có CẢ opacity lẫn scale
    // 1↔1.15; animate-pulse của Tailwind chỉ có opacity, mất nhịp thở to-nhỏ.
    expect(giaTriCuoi(".cin-kicker .dot", "animation")).toContain("glowPulse 2.2s");
    expect(LOGIN).toContain("glowPulse_2.2s");
    const css = readFileSync(join(goc, "apps/hub/app/globals.css"), "utf8");
    expect(css, "thiếu keyframes glowPulse trong globals.css").toContain("@keyframes glowPulse");
    expect(css).toContain("@keyframes panelFloat");
    expect(css).toContain("@keyframes panelSheen");
  });

  it("Ô NHẬP thấy được: nền tường minh + viền đạt chuẩn 3:1 cho thành phần phi văn bản", () => {
    // Máy soát 24/08 đo: input trong suốt trên kính thì viền token `line` #1E3A6B chỉ đạt
    // 1,25–1,67:1 tuỳ khung video sau lưng — một ô nhập không nhìn thấy ranh giới.
    // #5B7BAB trên #0B1B38 = 3,96:1 (tự tính lại được từ công thức WCAG).
    for (const id of ["ma-mo-khoa-ban-thu", "ma-moi-phu-huynh"]) {
      const i = LOGIN.indexOf(`id="${id}"`);
      expect(i, `không thấy ô ${id}`).toBeGreaterThan(-1);
      const the = LOGIN.slice(i, LOGIN.indexOf("/>", i));
      expect(the, `ô ${id} không có nền tường minh`).toContain("bg-[#0B1B38]");
      expect(the, `ô ${id} viền không thấy được`).toContain("border-[#5B7BAB]");
    }
  });

  it("KHÔNG lặp focus:outline-none: page-shell đã thêm, truyền lại là class đôi", () => {
    const m = /<MainContent className="([^"]*)"/.exec(LOGIN);
    expect(m).not.toBeNull();
    expect(m![1], "page-shell tự thêm focus:outline-none — truyền lại là lặp").not.toContain(
      "focus:outline-none",
    );
  });
});
