// tests/unit/nen-dang-nhap.test.ts — nền parallax màn đăng nhập.
//
// Vì sao cần cổng cho một thứ TRANG TRÍ: nền này không có test nào cho tới 05/08/2026, và
// trong một buổi nó lộ ra hai lỗi mà không phép kiểm nào bắt được, cả hai đều thuộc loại
// "hỏng trong im lặng" — không đỏ build, không cảnh báo, chỉ sai trên màn hình:
//
//   1. `animate-dust` là một class KHÔNG TỒN TẠI. `tailwind.config.ts` khai keyframes `dust`
//      nhưng thiếu mục tương ứng trong `theme.animation`, mà Tailwind chỉ sinh class
//      `animate-*` từ `animation`. Tám đốm sáng đứng im suốt, không ai biết. (Nay cả hiệu
//      ứng đã bị bỏ theo yêu cầu chủ đầu tư — bài test dưới canh cho nó bị bỏ TRỌN VẸN,
//      không còn nửa cơ chế nào nằm lại.)
//   2. Vòng parallax GHI ĐÈ `transform` của chính lớp nó kéo. `wrapperTransform` (scale
//      .64/.8/.82) đặt bằng `style` trên cùng div mà `layerRefs` giữ, nên câu lệnh
//      `el.style.transform = "translate3d(...)"` xoá sạch scale ngay lượt vẽ đầu tiên.
//
// Cả hai chỉ hiện ra khi có CHUỘT THẬT rê trên màn hình rộng — trình duyệt tự động không
// thoả `(hover: hover) and (pointer: fine)` nên không tài nào đo được bằng máy. Đó chính là
// lý do phần này phải được khoá bằng cách đọc mã, chứ không chờ ai đó nhìn thấy.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const nenSrc = readFileSync(join(repoRoot, "apps/hub/components/login-parallax-bg.tsx"), "utf8");
const tailwindSrc = readFileSync(join(repoRoot, "apps/hub/tailwind.config.ts"), "utf8");

/**
 * Bỏ chú thích trước khi quét. BẮT BUỘC ở file này: chính các chú thích bên dưới KỂ LẠI hai
 * lỗi cũ, nên chữ "animate-dust" và "DUST" nằm trong lời kể sẽ bị đếm thành vi phạm — test
 * đỏ vì một câu văn. Cùng cách `tests/unit/a11y.test.ts` đã làm.
 */
function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const nenCode = boChuThich(nenSrc);

/** Rút danh sách lớp theo ĐÚNG thứ tự khai — thứ tự đó chính là thứ tự vẽ. */
function docLop() {
  const khoi = nenCode.slice(nenCode.indexOf("const LAYERS"), nenCode.indexOf("export function LoginParallaxBg"));
  // Cắt theo từng đối tượng `{ … }` thay vì một biểu thức dài nuốt cả mảng: mỗi lớp khai
  // các trường theo thứ tự khác nhau (có lớp không có `wrapperTransform`, có lớp thêm
  // `rotate`), nên một khuôn cứng sẽ bắt hụt trong im lặng — đúng thứ test này sinh ra để chặn.
  return khoi
    .split(/\n  \{/)
    .slice(1)
    .map((doan) => ({
      ten: (doan.match(/src:\s*"([^"]+)"/)?.[1] ?? "").replace(/.*\//, ""),
      top: doan.match(/top:\s*"([^"]+)"/)?.[1] ?? "0%",
      depthX: Number(doan.match(/depth:\s*\[(\d+),\s*(\d+)\]/)?.[1] ?? NaN),
      depthY: Number(doan.match(/depth:\s*\[(\d+),\s*(\d+)\]/)?.[2] ?? NaN),
      transform: doan.match(/wrapperTransform:\s*"([^"]*)"/)?.[1] ?? "",
    }))
    .filter((l) => l.ten !== "");
}

describe("thứ tự lớp = thứ tự vẽ (quyết định chủ đầu tư 05/08/2026)", () => {
  const lop = docLop();

  it("đọc được đủ sáu lớp", () => {
    expect(lop.map((l) => l.ten)).toHaveLength(6);
  });

  it("sư tử đứng SAU nhóm học sinh", () => {
    // Mảng vẽ từ sau ra trước, nên "đứng sau trên màn hình" = "đứng trước trong mảng".
    const iSuTu = lop.findIndex((l) => l.ten.includes("mascot"));
    const iHocSinh = lop.findIndex((l) => l.ten.includes("learning-group"));
    expect(iSuTu, "không thấy lớp sư tử").toBeGreaterThanOrEqual(0);
    expect(iHocSinh, "không thấy lớp nhóm học sinh").toBeGreaterThanOrEqual(0);
    expect(iSuTu, "sư tử phải nằm TRƯỚC nhóm học sinh trong mảng để vẽ ra SAU").toBeLessThan(iHocSinh);
  });

  it("đúng BỐN lớp được thu còn 80%, hai lớp nền KHÔNG ĐỤNG TỚI", () => {
    // Bốn lớp có lệnh thu nhỏ: sư tử + nhóm học sinh (lệnh thứ nhất), bàn sách + chậu cây
    // (lệnh thứ hai — hai lớp tiền cảnh vẽ cho khung cũ nên bị xén khi đưa vào khung này).
    for (const ten of ["mascot", "learning-group", "desk-books", "leaves"]) {
      const l = lop.find((x) => x.ten.includes(ten))!;
      expect(l.transform, `${ten} không còn scale(.8)`).toContain("scale(.8)");
    }
    // HAI lớp không nằm trong bất kỳ lệnh nào: không được mang `scale`.
    //
    // Vì sao đây là một phép kiểm chứ không phải chuyện vặt: mốc mà người dùng nhìn thấy xưa
    // nay là 100% — bản khai cũ ghi `scale(.8)` nhưng `veLop()` xoá sạch nó ngay lượt vẽ đầu,
    // nên con số trong mã và cái trên màn hình đã rời nhau từ 30/07. Vá lỗi ghi đè xong,
    // giữ nguyên `scale(.8)` ở những lớp không ai yêu cầu đổi là bỗng dưng thu nhỏ cả nền —
    // đúng điều chủ đầu tư đã phản đối.
    for (const l of lop.filter((x) => /far-background|tv-shelf/.test(x.ten))) {
      expect(l.transform, `${l.ten} bị thu nhỏ dù không ai yêu cầu`).not.toMatch(/scale\(/);
    }
  });

  it("mảnh cắt của tranh tiền cảnh nằm ngoài khung, xa hơn cả biên độ trôi", () => {
    // ĐÂY LÀ PHÉP KIỂM QUAN TRỌNG NHẤT CỦA FILE NÀY, và nó tồn tại vì một lỗi thật:
    // bản 05/08 đầu tiên đẩy hai lớp tiền cảnh VÀO TRONG cho "vừa khít màn hình", nhưng chỗ
    // tranh bị xén nằm sẵn trong file ảnh (cả hai vẽ chạm mép trái và mép đáy khung gốc),
    // nên kéo vào trong là kéo đường cắt vào giữa màn. Rê chuột xuống góc trái dưới, parallax
    // đẩy lớp sang phải đúng `depthX` px và lộ nguyên lát cắt.
    //
    // Luật: mép tranh phải nằm ngoài khung, cách mép ít nhất bằng biên độ trôi. Tính lại ở
    // đây bằng chính công thức bố cục (khung 1440×900, hộp trong rộng 104% lệch trái 2%, gốc
    // thu nhỏ ở đáy-trái) thay vì tin vào một con số chép tay.
    const W = 1440, H = 900;
    for (const ten of ["desk-books", "leaves"]) {
      const l = lop.find((x) => x.ten.includes(ten))!;
      // `?.[1]` có thể là undefined nên `.padEnd` phải đứng SAU dấu ?? — bản đầu viết
      // `?.[1].padEnd(...)` và `tsconfig.tests.json` (strict) bắt đúng chỗ đó.
      const s = Number((l.transform.match(/scale\(\.?(\d+)\)/)?.[1] ?? "100").padEnd(2, "0")) / 100;
      const tx = Number(l.transform.match(/translateX\((-?\d+)px\)/)?.[1] ?? 0);
      const topPct = Number(l.top.replace("%", ""));

      // Mép TRÁI của tranh = mép trái hộp trong (tranh vẽ chạm x=0 của khung gốc).
      const mepTrai = -0.02 * W * s + tx;
      expect(mepTrai, `${ten}: mép trái tranh ở ${mepTrai}px, chưa đủ xa để che lượt trôi ${l.depthX}px`).toBeLessThanOrEqual(-l.depthX);

      // Mép ĐÁY: hộp trong cao 104% khung, hạ theo `top`, rồi thu nhỏ quanh đáy khung.
      const hopY = (topPct / 100) * H;
      const mepDay = H + (hopY - H) * s + 1.04 * H * s;
      expect(mepDay, `${ten}: đáy tranh ở ${mepDay}px, chưa đủ sâu để che lượt trôi ${l.depthY}px`).toBeGreaterThanOrEqual(H + l.depthY);
    }
  });

  it("càng ra trước trôi càng nhiều — không lớp nào vượt lớp đứng trước nó", () => {
    // Đây là luật vật lý của cả hiệu ứng: vật xa trôi ít, vật gần trôi nhiều. Bản trước
    // 05/08/2026 vi phạm mà không ai gọi tên được — sư tử vẽ ĐÈ nhóm học sinh (tức gần
    // hơn) nhưng depth 11/6 nhỏ hơn 16/9 của nhóm, nên nó trôi chậm hơn thứ sau lưng mình.
    // Rút ra biến trước khi so: `lop[i]` với `noUncheckedIndexedAccess` là `T | undefined`,
    // nên đọc thẳng `lop[i].depthX` trong chuỗi thông báo làm `typecheck:tests` đỏ 10 lỗi.
    for (let i = 1; i < lop.length; i++) {
      const truoc = lop[i - 1]!;
      const sau = lop[i]!;
      expect(
        sau.depthX,
        `${sau.ten} (${sau.depthX}) trôi ít hơn lớp sau lưng nó ${truoc.ten} (${truoc.depthX})`,
      ).toBeGreaterThan(truoc.depthX);
      expect(sau.depthY, `${sau.ten}: trục dọc nghịch chiều trục ngang`).toBeGreaterThan(truoc.depthY);
    }
  });
});

describe("vòng parallax không được xoá scale của lớp", () => {
  it("veLop GHÉP wrapperTransform vào chuỗi transform, không thay chuỗi", () => {
    const veLop = nenCode.slice(nenCode.indexOf("function veLop"), nenCode.indexOf("function tick"));
    expect(veLop, "veLop không còn đọc wrapperTransform — scale sẽ bị ghi đè").toMatch(/layer\.wrapperTransform/);
    expect(veLop, "phải CỘNG vào chuỗi (+=), không gán đè").toMatch(/t \+= ` \$\{layer\.wrapperTransform\}`/);
  });

  it("translate3d đứng TRƯỚC scale — trôi tính bằng pixel màn hình thật", () => {
    // Đặt sau `scale(.64)` thì mỗi pixel trôi bị co còn 0,64px, tức hai lớp vừa thu nhỏ sẽ
    // trôi chậm hơn đúng con số đã tính ở bảng depth.
    const veLop = nenSrc.slice(nenSrc.indexOf("function veLop"), nenSrc.indexOf("function tick"));
    const viTriTranslate = veLop.indexOf("translate3d");
    const viTriGhep = veLop.indexOf("layer.wrapperTransform");
    expect(viTriTranslate).toBeGreaterThan(-1);
    expect(viTriGhep, "wrapperTransform phải được ghép SAU translate3d").toBeGreaterThan(viTriTranslate);
  });

  it("vòng lặp có đường NGỦ khi chuột đứng yên", () => {
    // Không có nó thì sáu lớp will-change:transform nằm mãi trong bộ nhớ GPU trên trang
    // người ta để mở lâu nhất của app.
    expect(nenCode).toMatch(/cancelAnimationFrame/);
    expect(nenSrc).toMatch(/raf\.current = undefined/);
  });
});

describe("đốm sáng bay đã bỏ TRỌN VẸN (05/08/2026)", () => {
  it("không còn mảng toạ độ, không còn class animate-dust", () => {
    expect(nenSrc).not.toMatch(/const DUST\b/);
    expect(nenCode).not.toMatch(/animate-dust/);
  });

  it("không còn keyframes dust nằm lại trong tailwind.config.ts", () => {
    // Giữ keyframes mà không ai gọi cũng là mã chết, và nó chính là nửa cơ chế đã làm cả
    // đội tin rằng hiệu ứng đang chạy trong khi nó đứng im.
    const keyframes = tailwindSrc.slice(tailwindSrc.indexOf("keyframes:"), tailwindSrc.indexOf("animation:"));
    expect(keyframes).not.toMatch(/\bdust:\s*\{/);
    const animation = tailwindSrc.slice(tailwindSrc.indexOf("animation:"));
    expect(animation).not.toMatch(/\bdust:\s*"/);
  });
});

describe("nền vẫn là trang trí, không mang nghĩa", () => {
  it("khối nền khai aria-hidden", () => {
    expect(nenCode).toMatch(/aria-hidden/);
  });

  it("không dựng gì ở khổ điện thoại — không tải 6 lớp ảnh cho máy không dùng tới", () => {
    expect(nenSrc).toMatch(/if \(!isDesktop\) return null;/);
  });
});
