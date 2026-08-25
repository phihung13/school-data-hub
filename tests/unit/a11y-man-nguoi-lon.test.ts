// tests/unit/a11y-man-nguoi-lon.test.ts — gói "tiep-can-man-nguoi-lon" (01/08/2026).
//
// Nhóm màn NGƯỜI LỚN của Hub: buồng lái GVCN (+5 màn con), tâm lý cụm (2 màn), Điều hành
// (BGH), và sidebar dùng chung. tests/unit/a11y.test.ts giữ luật cho nhóm màn học sinh và
// cho hai file trong mảng CHECKED của nó; file này giữ phần còn lại, cố ý tách ra một file
// riêng để hai gói chạy song song không giẫm lên nhau.
//
// Bốn nhóm luật, tất cả đều là lỗi ĐO ĐƯỢC trên bản đang chạy, và không lỗi nào làm hỏng
// typecheck hay hỏng build:
//
//   1. Vùng chạm ≥44px. Nút chọn trạng thái điểm danh từng cao ~31px và bốn nút dính liền
//      nhau — bấm trượt là ghi "Đi muộn" thay cho "Có mặt", vào đúng dữ liệu sẽ đi tới học
//      bạ. Nút quay lại của ba khung màn từng là h-9 w-9 = đúng 36px, mà đó là lối ra duy
//      nhất trên điện thoại.
//   2. Màu không phải tín hiệu duy nhất (§11), và chữ trên nền màu phải đọc được. Ô lịch
//      check-in từng mã hoá bốn mức tâm trạng CHỈ bằng màu nền, chữ trắng trên gradient
//      #00D97A chỉ đạt 1,87:1.
//   3. Im lặng phải nói ra được. Ô "Cảm xúc lớp" từng in "Chưa có check-in nào hôm nay"
//      trong khi thẻ số cách đó 90 dòng ghi "Đã check-in 25/30"; màn Điều hành từng gộp ba
//      sự thật khác nhau vào cùng một dấu "—" mà lời giải thích chỉ nằm trong `title=`.
//   4. §8 hai giọng: người lớn gọn, nghiệp vụ. Không "nhé", không "giúp em".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { absentSubtitle, cadenceNote } from "@/components/gvcn-dashboard";
import { STATUS_CELL, dayCellLabel } from "@/components/gvcn/student-detail-view";
import { CHOICE_STYLE } from "@/components/gvcn/class-attendance-view";
import { checkinRate, rateReason } from "@/components/dieu-hanh/operations-view";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const componentsDir = join(repoRoot, "apps", "hub", "components");

/**
 * Bỏ chú thích trước khi quét — BẮT BUỘC, cùng lý do đã ghi ở a11y.test.ts và
 * giong-noi.test.ts: các file này kể lại nguyên văn câu chữ SAI cũ ("Thử lại giúp nhé",
 * `title="Nhóm dưới ngưỡng ẩn danh"`) trong chú thích để lần sau không ai làm ngược lại.
 * Quét cả chú thích thì cách duy nhất để test xanh là xoá lời giải thích — test tự phá
 * đúng thứ nó bảo vệ.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
const read = (rel: string) => stripComments(readFileSync(join(componentsDir, rel), "utf8"));

/**
 * Mọi màn hình mà NGƯỜI ĐỌC là người lớn đang làm nghiệp vụ. Liệt kê từng file có chủ ý:
 * thêm một màn cho vai người lớn thì phải thêm vào đây. Không có nhánh "tự tìm" vì thư
 * mục components/ còn chứa cả màn học sinh, nơi luật §8 chạy NGƯỢC chiều.
 */
const ADULT_SCREENS = [
  "gvcn-dashboard.tsx",
  "hub-sidebar.tsx",
  // Màn đầu tiên của vai `teacher` (06/08/2026). Vào danh sách NGAY khi dựng, không hẹn
  // lại: danh sách này liệt kê tay, nên một màn người lớn không có tên ở đây là một màn
  // không ai đo vùng chạm, không ai đo giọng §8 — và nó sẽ im lặng như vậy rất lâu.
  "gv-bo-mon/teaching-view.tsx",
  "gvcn/class-attendance-view.tsx",
  "gvcn/class-picker.tsx",
  "gvcn/class-roster-view.tsx",
  "gvcn/gvcn-shell.tsx",
  "gvcn/intervention-notes-view.tsx",
  "gvcn/report-approval-view.tsx",
  "gvcn/status-badge.tsx",
  "gvcn/student-detail-view.tsx",
  "tam-ly/cluster-case-detail-view.tsx",
  "tam-ly/cluster-case-list-view.tsx",
  "tam-ly/tam-ly-shell.tsx",
  "dieu-hanh/operations-shell.tsx",
  "dieu-hanh/operations-view.tsx",
];

// ---------------------------------------------------------------------------
// 1. Vùng chạm ≥ 44px (DESIGN-GUIDELINES §11, WCAG 2.5.5)
// ---------------------------------------------------------------------------

/**
 * Thẻ MỞ của mọi <button> và <Link>, cắt ĐÚNG chỗ.
 *
 * KHÔNG dùng regex `<button[\s\S]*?>` như a11y.test.ts đang dùng cho tab-bar. Ở đó nó đúng
 * vì tab-bar không có handler viết tay; ở đây thì sai im lặng, và tôi đã dựng bản regex
 * trước rồi tự bắt được: hầu hết nút trong nhóm màn này viết `onClick={() => …}`, nên dấu
 * ">" của mũi tên hàm cắt thẻ TRƯỚC KHI tới className. Bản regex báo "25 thẻ được miễn" —
 * tức là nó không hề đọc lớp kích thước của 25 nút rồi kết luận cả 25 đều ổn. Một bài test
 * xanh vì không nhìn thấy gì còn tệ hơn không có test.
 *
 * Cách đúng: đi từng ký tự, chỉ dừng ở ">" khi độ sâu ngoặc nhọn = 0 — biểu thức JSX luôn
 * nằm trong {}, nên mũi tên hàm không bao giờ ở độ sâu 0.
 */
export function interactiveOpenTags(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<(?:button|Link)\b/g)) {
    const start = m.index!;
    let depth = 0;
    for (let j = start; j < src.length; j += 1) {
      const c = src[j];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) {
        out.push(src.slice(start, j + 1));
        break;
      }
    }
  }
  return out;
}

/**
 * Đã khai một chiều cao đủ 44px chưa? KHÔNG có danh sách ngoại lệ — luật là MỌI <button>
 * và <Link> trong nhóm màn này, không trừ ai. Bản đầu của bài test này có hai ngoại lệ
 * ("kích thước nằm ở thẻ con", "liên kết trong câu văn") và cả hai đều là cửa để lách:
 * khai một dòng ngoại lệ dễ hơn nhiều so với thêm một lớp CSS, nên ngoại lệ sẽ mọc.
 */
function declares44(tag: string): boolean {
  return /\bmin-h-\[44px\]|\bh-11\b|\bh-\[44px\]/.test(tag);
}

describe("vùng chạm: MỌI nút và liên kết của màn người lớn đều ≥44px", () => {
  it.each(ADULT_SCREENS)("%s", (file) => {
    const small = interactiveOpenTags(read(file))
      .filter((t) => !declares44(t))
      .map((t) => t.replace(/\s+/g, " ").slice(0, 110));
    expect(small, `${file} còn ${small.length} đích bấm chưa khai 44px`).toEqual([]);
  });

  it("bộ quét đọc được TRỌN thẻ, không dừng ở mũi tên hàm", () => {
    // Chốt chính cái bẫy đã suýt làm bài test này xanh giả: `onClick={() => …}` chứa một
    // dấu ">" ở giữa thẻ. Bộ quét cắt ở đó thì className không bao giờ được đọc.
    const sample =
      '<button type="button" onClick={() => setOpen(v => !v)} className="min-h-[44px] px-3">Bấm</button>';
    const [tag] = interactiveOpenTags(sample);
    expect(tag).toContain("className");
    expect(declares44(tag!)).toBe(true);

    const truncatable = '<button onClick={() => go()} className="px-3">x</button>';
    expect(declares44(interactiveOpenTags(truncatable)[0]!)).toBe(false);
  });

  it("bộ quét không rỗng — regex hỏng thì mọi test trên đây xanh giả", () => {
    const total = ADULT_SCREENS.reduce((n, f) => n + interactiveOpenTags(read(f)).length, 0);
    expect(total).toBeGreaterThan(25);
  });
});

// ---------------------------------------------------------------------------
// 2. §11 — màu không bao giờ là tín hiệu duy nhất, và chữ trên nền màu đọc được
// ---------------------------------------------------------------------------

/** Độ chói tương đối theo WCAG 2.x — cùng công thức với a11y.test.ts, không chép số. */
function luminance(hex: string): number {
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = parts.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("ô lịch điểm danh — năm trạng thái ([QĐ-3], 01/08/2026)", () => {
  it("mỗi trạng thái có ICON riêng, không chỉ có màu", () => {
    const icons = Object.values(STATUS_CELL).map((m) => m.icon);
    expect(icons.filter(Boolean)).toHaveLength(5);
    // Năm icon PHẢI khác nhau. Đây chính là chỗ từng hỏng: 'late' và 'queued_late' dùng
    // chung icon `schedule` trên lịch này, trong khi huy hiệu bên màn lớp đã tách đúng —
    // hai màn của cùng một người nói hai kiểu về cùng một dữ liệu.
    expect(new Set(icons).size).toBe(5);
  });

  it("'đi muộn' và 'gửi muộn' dùng chung màu nên BẮT BUỘC khác icon", () => {
    // Cặp nguy hiểm nhất khi bỏ hết màu: PRODUCT.md gọi "gửi muộn ngược với vắng" là ràng
    // buộc không thương lượng, mà phân biệt với "đi muộn" cũng nặng ngang thế — một đằng
    // là em đến muộn, một đằng là máy gửi bù và đang chờ cô xác nhận.
    expect(STATUS_CELL.late.bg).toBe(STATUS_CELL.queued_late.bg);
    expect(STATUS_CELL.late.icon).not.toBe(STATUS_CELL.queued_late.icon);
  });

  it("chữ trên nền mỗi ô đạt ≥4,5:1 — kể cả ô đậm nhất", () => {
    // Bản trước tô nguyên gradient bão hoà của §3 rồi đặt chữ lên: trắng/#00D97A = 1,87:1.
    // Phép đo này chỉ chạy được vì `bg` nay là MỘT mã màu đặc; nếu ai đó trả lại gradient
    // thì `slice` sẽ không cho ra hex hợp lệ và test đỏ — đúng ý.
    for (const [status, tone] of Object.entries(STATUS_CELL)) {
      expect(tone.bg, `${status}: nền phải là một mã màu đặc, không phải gradient`).toMatch(
        /^#[0-9A-Fa-f]{6}$/,
      );
      const ratio = contrast(tone.fg, tone.bg);
      expect(ratio, `${status}: ${tone.fg} trên ${tone.bg} chỉ đạt ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});

describe("nút chọn trạng thái ở màn điểm danh — chữ trên nút ĐANG CHỌN", () => {
  it("cả bốn nút đạt ≥4,5:1 ở trạng thái đang chọn", () => {
    // Đây là đường GHI duy nhất chạm chuyên cần, và chữ trên nút đang chọn là thứ nói cho
    // cô biết mình vừa chọn gì. Đo trên bản cũ: trắng/#00A85E = 3,15:1 · trắng/#2C7BF2 =
    // 4,02:1 · trắng/#E23A41 = 4,27:1 — ba trong bốn nút trượt, ở chữ 11,5px/900.
    // §11 ghi thẳng "không có ngoại lệ theo cỡ chữ".
    for (const [status, style] of Object.entries(CHOICE_STYLE)) {
      const bg = /bg-\[(#[0-9A-Fa-f]{6})\]/.exec(style.on)?.[1];
      expect(bg, `${status}: nền nút đang chọn phải là một mã hex đọc được`).toBeTruthy();
      const fg = style.on.includes("text-white")
        ? "#FFFFFF"
        : (/text-\[(#[0-9A-Fa-f]{6})\]/.exec(style.on)?.[1] ?? "");
      expect(fg, `${status}: màu chữ nút đang chọn phải đọc được`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      const ratio = contrast(fg, bg!);
      expect(ratio, `${status}: ${fg} trên ${bg} chỉ đạt ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("không màn người lớn nào dựa vào title= để giải thích một ô trống", () => {
  it("thuộc tính title không còn là lời giải thích DUY NHẤT", () => {
    // `title` chỉ hiện khi rê chuột: điện thoại không có hover, bàn phím không tới được,
    // trình đọc màn hình phần lớn bỏ qua. Chỗ nào còn dùng title thì phải có `sr-only` hoặc
    // `aria-label` đứng cùng — student-detail-view giữ title trên ô ngày là hợp lệ vì ngay
    // dưới nó có <span className="sr-only"> đọc nguyên câu.
    //
    // Chỉ xét thẻ HTML viết THƯỜNG (<span>, <td>, <a>…). `title` cũng là tên một prop
    // React của ba khung màn (`<GvcnShell title="Duyệt báo cáo">`) và của `subtitle` —
    // những chỗ đó là TIÊU ĐỀ hiện ra màn hình, không phải tooltip, nên quét gộp là bắt
    // nhầm 21 chỗ đúng. Chữ hoa đầu tên thẻ là ranh giới mà JSX đã tự vạch sẵn.
    const offenders: string[] = [];
    for (const file of ADULT_SCREENS) {
      const src = read(file);
      for (const m of src.matchAll(/<[a-z][a-zA-Z0-9]*\b[^>]*?\stitle=[{"][^>]*>/g)) {
        // Cửa sổ 1800 ký tự kể từ thẻ mở: đủ để trùm hết phần con của thẻ dài nhất đang
        // có (ô ngày trong lịch check-in — thẻ mở, số ngày, hàng icon, rồi mới tới
        // sr-only). Cửa sổ chứ không phải phân tích cây: chấp nhận đo thô, nhưng đo thô ở
        // đây sai theo chiều AN TOÀN — thẻ dài quá cửa sổ thì test đỏ, không phải xanh giả.
        const around = src.slice(m.index ?? 0, (m.index ?? 0) + 1800);
        if (!/sr-only|aria-label/.test(around)) {
          offenders.push(`${file}: ${m[0].replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Im lặng không phải kết luận — mỗi ô trống nói đúng loại trống của nó
// ---------------------------------------------------------------------------

describe("chỗ cô đọc cảm xúc phải in ra ràng buộc còn hiệu lực (ADR-035 lật [QĐ-1])", () => {
  // LẬT LẦN HAI 21/08/2026 (ADR-035, migration 0059) — vẫn không bỏ kiểm.
  //
  // Bản 02/08 canh câu "cảm xúc chỉ thầy cô tâm lý đọc được" dưới lịch điểm danh — đúng
  // với ADR-026. ADR-035 mở lại quyền đọc cho GVCN nên câu đó thành NÓI DỐI nếu còn in.
  // Tính chất bài kiểm giữ nguyên: ngay chỗ lịch của em, màn hình phải nói THẬT về quy
  // định đang hiệu lực. Quy định còn lại đáng in nhất là §5 — cảm xúc không dùng xếp
  // loại — đặt đúng lúc cô vừa đọc được cảm xúc, tức đúng lúc lời nhắc có việc để làm.
  const src = read(join("gvcn", "student-detail-view.tsx"));

  it("màn hồ sơ một em nói ra quy định, không để cô tự đoán", () => {
    expect(src).toContain("cảm xúc em ghi không dùng để xếp loại");
    // Câu của thời ADR-026 phải BIẾN MẤT — giữ nó là hứa một ranh giới không còn tồn tại.
    expect(src).not.toContain("chỉ thầy cô tâm lý đọc được");
  });

  it("và nói ở ĐÚNG chỗ lịch điểm danh, nơi cảm xúc vừa quay lại", () => {
    const i = src.indexOf("cảm xúc em ghi không dùng để xếp loại");
    expect(src.slice(Math.max(0, i - 400), i)).toMatch(/điểm danh/);
  });

  it("cảm xúc đọc ra theo TỪNG NGÀY cô chạm vào, qua MOOD_LABEL chuẩn", () => {
    // dayCellLabel là đường đọc nhật ký của cô — phải dùng nhãn chung, không tự bịa chữ.
    const i = src.indexOf("function dayCellLabel");
    const block = src.slice(i, src.indexOf("function DayCell"));
    expect(block).toContain("MOOD_LABEL");
    expect(block).toContain("em ghi cảm xúc");
  });
});

describe("thẻ “Vắng” không được đọc thành lớp đi đủ khi chưa ai điểm danh ([QĐ-3])", () => {
  it("còn em chưa điểm danh → nói thẳng là chưa kết luận được", () => {
    const text = absentSubtitle(0, 12);
    expect(text).toContain("12");
    expect(text).toContain("chưa kết luận được");
    // Đây là câu cũ, và nó là một kết luận dựng từ im lặng.
    expect(text).not.toContain("không có ai vắng");
  });

  it("cả lớp đã điểm danh và không ai vắng → LÚC ĐÓ mới được kết luận", () => {
    expect(absentSubtitle(0, 0)).toContain("không ai vắng");
  });
});

describe("hai nhịp cờ phải nói ra trên màn ([QĐ-2] · VIỆC 4)", () => {
  // ĐO TRÊN HÌNH THỨC MỚI, KHÔNG BỎ PHÉP ĐO (06/08/2026).
  //
  // Chủ đầu tư cắt hai CÂU giải thích cơ chế nhịp quét ("Hiện ngay khi em bấm — không chờ
  // lượt quét đêm." / "Do lượt quét đêm tìm ra — dấu hiệu của hôm nay phải chờ lượt quét
  // kế tiếp."). [QĐ-2] KHÔNG bị cắt theo: luật là "hai nhịp phải phân biệt được trên
  // màn", và nó nay sống trong hai NHÃN CHIP hai–bốn từ, mỗi nhãn kèm một icon riêng
  // (`bolt` / `nightlight`). Ba khẳng định dưới đây giữ nguyên ý; chỉ hạ chữ hoa trước
  // khi so, vì nhãn chip mở đầu bằng chữ hoa còn câu cũ thì không.
  it("tức thì và quét đêm cho hai NHÃN khác hẳn nhau", () => {
    const now = cadenceNote("tuc_thi").toLowerCase();
    const night = cadenceNote("quet_dem").toLowerCase();
    expect(now).not.toBe(night);
    expect(now).toContain("ngay");
    expect(night).toContain("quét");
    // Người đọc một bảng gộp hai nhịp mà không biết là đang bị chính bảng đó đánh lừa.
    expect(night).toContain("chờ");
  });

  it("và cả hai đều ngắn đúng một dòng ở khổ 390px (§1.5)", () => {
    // Phép đo MỚI, thêm cùng lần cắt: cái sinh ra hai câu cũ là chỗ này không có trần độ
    // dài nào. 30 ký tự ở chữ 11px là vừa một dòng trên máy hẹp nhất đang tính tới.
    for (const c of ["tuc_thi", "quet_dem"] as const) {
      expect(cadenceNote(c).length, `nhãn nhịp "${c}" dài quá một dòng`).toBeLessThanOrEqual(30);
    }
  });
});

describe("màn Điều hành: ba lý do không có số là ba câu khác nhau", () => {
  it("tính được thì trả về tỉ lệ", () => {
    expect(checkinRate(12, 24)).toEqual({ kind: "ok", text: "50%" });
  });

  it("dưới ngưỡng ẩn danh KHÁC chưa có sĩ số", () => {
    expect(checkinRate(null, 24).kind).toBe("suppressed");
    expect(checkinRate(null, 0).kind).toBe("no-roster");
    expect(checkinRate(5, 0).kind).toBe("no-roster");
    // Hai câu phải khác nhau thật, không phải hai nhánh cùng in một chuỗi.
    expect(rateReason("suppressed")).not.toBe(rateReason("no-roster"));
  });

  it("không câu nào là một dấu gạch trần", () => {
    for (const kind of ["suppressed", "no-roster"] as const) {
      expect(rateReason(kind).length).toBeGreaterThan(10);
      expect(rateReason(kind)).not.toBe("—");
    }
  });

  it("ô số bị che có nhãn cho tai VÀ dấu hiệu cho mắt, không chỉ có title=", () => {
    const src = read("dieu-hanh/operations-view.tsx");
    const block = src.slice(src.indexOf("function HiddenNumber"), src.indexOf("function Num"));
    expect(block).toContain("sr-only");
    expect(block).toContain("visibility_off");
    // title= là thứ đã bị gỡ khỏi đúng chỗ này — không được quay lại.
    expect(block).not.toContain("title=");
  });
});

describe("EmptyState: trạng thái rỗng phải phát ra tiếng", () => {
  it("khai role=status aria-live như LoadingState", () => {
    // Không có nó thì khi query chuyển từ đang-tải sang rỗng, DOM đổi từ vùng aria-live
    // sang vùng KHÔNG aria-live: trình đọc màn hình nghe câu "Đang tải…" rồi im bặt, và
    // không bao giờ biết kết quả là rỗng.
    const src = read("ui/query-state.tsx");
    // Cắt ĐÚNG thân EmptyState, không cắt tới hết file. Bản đầu dùng
    // `src.slice(src.indexOf("export function EmptyState"))` — tức là cửa sổ chạy tới EOF,
    // mà sau EmptyState còn `MutationSuccess` cũng khai `role="status"`. Nghiệm thu
    // 01/08/2026 thử ngược: xoá `role="status"` khỏi CHÍNH EmptyState thì bài test vẫn
    // XANH, vì nó đọc nhờ role của MutationSuccess ở cuối file. Một hàng xóm đứng ra khai
    // hộ đúng cái thuộc tính đang được bảo vệ thì bài test không còn bảo vệ gì nữa.
    const from = src.indexOf("export function EmptyState");
    expect(from, "không tìm thấy EmptyState — bài test này đang đo nhầm file").toBeGreaterThan(-1);
    const next = src.indexOf("\nexport function ", from + 1);
    const block = src.slice(from, next === -1 ? src.length : next);
    expect(block).toContain('role="status"');
    expect(block).toContain('aria-live="polite"');
  });
});

// ---------------------------------------------------------------------------
// 4. §8 — hai giọng, và màn người lớn dùng giọng người lớn
// ---------------------------------------------------------------------------

describe("giọng §8: màn người lớn không dỗ dành", () => {
  it.each(ADULT_SCREENS)("%s không xưng “nhé” / “giúp em” với người lớn", (file) => {
    const hits = read(file).match(/.{0,50}(nhé|giúp em).{0,30}/g) ?? [];
    expect(hits, `${file} còn ${hits.length} chỗ nói giọng học sinh`).toEqual([]);
  });

  it("query-state có hai bảng câu, và bản staff bỏ cả “nhé” lẫn “giúp”", () => {
    const src = read("ui/query-state.tsx");
    const staff = src.slice(src.indexOf("staff: {"), src.indexOf("};", src.indexOf("staff: {")));
    expect(staff.length).toBeGreaterThan(50);
    expect(staff).not.toMatch(/nhé|giúp/);
  });

  it("BA khung màn người lớn đều bọc StaffVoice — không khung nào quên", () => {
    // Đây là lý do dùng context thay vì prop: quên một prop ở một chỗ gọi thì không ai
    // biết; quên bọc cả một khung thì test này đỏ.
    for (const shell of [
      "gvcn/gvcn-shell.tsx",
      "tam-ly/tam-ly-shell.tsx",
      "dieu-hanh/operations-shell.tsx",
      "gvcn-dashboard.tsx",
    ]) {
      expect(read(shell), `${shell} chưa bọc StaffVoice`).toContain("<StaffVoice>");
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Hai lời hứa suông đã gỡ — không được quay lại
// ---------------------------------------------------------------------------

// Lớp nổi tài khoản chuyển từ hub-sidebar.tsx sang user-menu.tsx ngày 02/08/2026 (nó có
// chỗ đứng thứ hai: avatar cuối thanh tab điện thoại). Bài test đi theo NÓ chứ không đi
// theo file cũ — trỏ vào hub-sidebar.tsx nữa thì cả ba khẳng định dưới đây vẫn "xanh" mãi
// mãi vì file đó không còn dòng nào để mà sai, đúng kiểu xanh-vì-rỗng.
describe("lớp nổi tài khoản: không hứa hợp đồng ARIA mà không thi hành", () => {
  const src = read("user-menu.tsx");

  it('không còn role="menu" / role="menuitem" khi chưa có hành vi menu', () => {
    // Khai role=menu là hứa với trình đọc màn hình rằng mũi tên lên/xuống, Home/End và
    // giam focus đều hoạt động. Lớp nổi này không làm gì trong số đó. Muốn khai lại thì
    // phải làm trọn — và lúc đó hãy sửa cả bài test này cho khớp.
    expect(src).not.toMatch(/role="menu"/);
    expect(src).not.toMatch(/role="menuitem"/);
  });

  it("Escape đóng lớp nổi thì trả focus về nút đã mở nó", () => {
    expect(src).toMatch(/buttonRef\.current\?\.focus\(\)/);
  });

  it("lớp nổi này là đường thoát phiên của MỌI vai, nên phải có đủ hai lối", () => {
    // Sau 02/08/2026 đây là chỗ DUY NHẤT có nút đăng xuất và đường tới hồ sơ. Mất một
    // trong hai là nhốt người dùng trong phiên của chính họ — trên điện thoại thì không
    // còn cách nào khác ngoài xoá cookie bằng tay.
    expect(src).toContain('href="/ho-so"');
    expect(src).toMatch(/\/api\/auth\/logout/);
  });
});

describe("điểm danh lớp: điện thoại không phải kéo ngang để bấm", () => {
  const src = read("gvcn/class-attendance-view.tsx");

  it("bảng min-w-[600px] chỉ dựng khi THẬT SỰ ở khổ máy tính", () => {
    // Trên máy 360px, bảng 600px nghĩa là kéo 240px sang phải mới tới cột thao tác — mà
    // cột tên là cột đầu tiên và không dính. Cô bấm trạng thái cho một em mà không nhìn
    // thấy tên em đó.
    const before = src.slice(Math.max(0, src.indexOf("min-w-[600px]") - 500), src.indexOf("min-w-[600px]"));
    expect(before).toContain("isDesktop &&");
  });

  it("chọn nhánh bằng useIsDesktop, KHÔNG dựng cả hai rồi ẩn bằng CSS", () => {
    // Một lớp 40 em × 4 nút = 160 nút mỗi nhánh; `md:hidden` sẽ dựng 320 nút rồi giấu một
    // nửa, và React đối chiếu lại cả 320 sau mỗi cú bấm. Cùng luật đã áp cho home-view và
    // growth-report-view ở tests/unit/giong-noi.test.ts.
    expect(src).toContain("useIsDesktop()");
    expect(src).toContain("{!isDesktop && (");
    expect(src, "còn nhánh ẩn bằng CSS").not.toMatch(/md:hidden/);
  });

  it("hai khổ màn dùng CHUNG một bộ nút", () => {
    // Hai bản chép tay là bảo đảm sau ba lần sửa thì hai khổ màn ghi ra hai kiểu dữ liệu.
    expect((src.match(/<StatusPicker\b/g) ?? []).length).toBe(2);
    expect((src.match(/function StatusPicker\b/g) ?? []).length).toBe(1);
  });

  it("bốn nút trạng thái tách rời nhau, không dính liền", () => {
    const picker = src.slice(src.indexOf("function StatusPicker"));
    expect(picker).toContain("gap-1");
    expect(picker, "overflow-hidden dán bốn nút thành một dải liền").not.toContain("overflow-hidden");
  });
});

// ---------------------------------------------------------------------------
// 6. Gói "audit-giao-dien-chay-tron" (02/08/2026) — ba màn dựng SAU đợt rà trước:
//    /dieu-khoan · năm trạng thái điểm danh · các thay đổi ADR-026 ở màn học sinh.
//
// Bốn luật dưới đây đều là lỗi ĐO ĐƯỢC trên bản đang chạy, không phải lo xa.
// ---------------------------------------------------------------------------

/**
 * Khung màn có SIDEBAR của nhóm người lớn — nơi luật "một <h1> đổi cỡ theo khổ màn"
 * được áp. Tách riêng khỏi `ADULT_SCREENS` vì đây là luật của KHUNG, không phải của
 * từng màn con: sửa một khung là sửa cho năm màn GVCN cùng lúc.
 *
 * `tam-ly/tam-ly-shell.tsx` cố ý CHỈ nằm ở luật landmark bên dưới, không nằm ở luật
 * heading. Không phải bỏ sót: khung đó theo khuôn mini app (§6), tiêu đề app nằm trong
 * <MiniAppHeader> còn <h1> do chính MÀN CON đặt — đo bằng HTTP thật 02/08/2026, /tam-ly
 * trả về đúng 1 <h1> ("Việc đang chờ trong cụm") từ cluster-case-list-view. Biến chữ
 * trong <MiniAppHeader> thành <h1> sẽ tạo HAI <h1> trên chính /tam-ly, và cả trên
 * /checkin lẫn /can-gap-thay-co vốn dùng chung header đó — đúng cái bẫy mà
 * tests/unit/a11y-nen.test.ts gọi tên.
 *
 * `gvcn-dashboard.tsx` (buồng lái) cũng chỉ nằm ở luật landmark: nó tự dựng khung bằng
 * hàm `frame()` và <h1> chỉ có ở nhánh CÓ DỮ LIỆU, còn hai nhánh đang-tải/lỗi thì chưa —
 * một món nợ đã biết, ghi ra đây thay vì để bài test im lặng đi qua.
 */
const SIDEBAR_SHELLS = ["gvcn/gvcn-shell.tsx", "dieu-hanh/operations-shell.tsx"];

/** Mọi khung màn người lớn — tất cả đều phải có đích cho đường tắt bàn phím. */
const ADULT_FRAMES = [...SIDEBAR_SHELLS, "tam-ly/tam-ly-shell.tsx", "gvcn-dashboard.tsx"];

describe("landmark: đường tắt 'Bỏ qua menu' phải có đích trên màn người lớn", () => {
  // Đo 02/08/2026 bằng HTTP thật (phiên Cô Vân): trong HTML của /gvcn, /gvcn/diem-danh
  // và /gvcn/hoc-sinh/<id>, chuỗi "skip-link" xuất hiện 2 lần còn `id="noi-dung"` xuất
  // hiện 0 lần. Đường tắt là phần tử bấm được ĐẦU TIÊN của trang; nó in một lời hứa lên
  // màn hình rồi không đi tới đâu. Không lỗi, không log — người dùng chuột không bao giờ
  // chạm tới nên không ai báo.
  it.each(ADULT_FRAMES)("%s bọc nội dung bằng <MainContent>", (file) => {
    const src = read(file);
    expect(src, `${file} không import MainContent`).toMatch(
      /import \{ MainContent \} from "\.{1,2}\/page-shell"/,
    );
    expect(src).toMatch(/<MainContent\b/);
  });

  it.each(ADULT_FRAMES)("%s: sidebar và tab bar nằm NGOÀI <MainContent>", (file) => {
    // Menu nằm trong vùng nội dung thì "bỏ qua menu" chẳng bỏ qua được gì.
    const src = read(file);
    const from = src.indexOf("<MainContent");
    const to = src.indexOf("</MainContent>");
    expect(to, `${file}: không thấy </MainContent>`).toBeGreaterThan(from);
    const region = src.slice(from, to);
    expect(region, `${file}: HubSidebar nằm trong <main>`).not.toMatch(/<HubSidebar\b/);
    expect(region, `${file}: HubTabBar nằm trong <main>`).not.toMatch(/<HubTabBar\b/);
  });
});

describe("tiêu đề trang người lớn không biến mất ở khổ điện thoại", () => {
  it.each(SIDEBAR_SHELLS)("%s: đúng MỘT <h1>, và nằm trong <MainContent>", (file) => {
    const src = read(file);
    expect((src.match(/<h1[\s>]/g) ?? []).length, `${file}`).toBe(1);
    const region = src.slice(src.indexOf("<MainContent"), src.indexOf("</MainContent>"));
    expect(region, `${file}: <h1> nằm ngoài vùng nội dung`).toMatch(/<h1[\s>]/);
  });

  it.each(SIDEBAR_SHELLS)("%s: <h1> không nằm trong nhánh chỉ hiện từ md trở lên", (file) => {
    // ĐÂY là lỗi thật đã sửa: <h1> nằm trong `<div className="hidden … md:flex">`, nên ở
    // 375px — khổ màn của một cô đứng trong lớp cầm điện thoại, và của một hiệu trưởng
    // đứng ngoài sân — nó là display:none, mất khỏi cả mắt LẪN cây trợ năng. Thứ nhìn
    // thấy khi đó là một <div> trong thanh trên: trình đọc màn hình mở trang ra không có
    // heading nào để biết đây là trang gì.
    const src = read(file);
    const h1 = src.indexOf("<h1");
    // Cửa sổ 400 ký tự NGƯỢC lên trên: đủ trùm thẻ bọc gần nhất của <h1> trong cả hai
    // khung. Đo thô, nhưng sai theo chiều AN TOÀN — thẻ bọc xa hơn cửa sổ thì luật này
    // không bắt được, chứ không bao giờ báo xanh cho một <h1> đang bị ẩn.
    const before = src.slice(Math.max(0, h1 - 400), h1);
    expect(before, `${file}: <h1> nằm sau một nhánh "hidden … md:"`).not.toMatch(/\bhidden\b[^"]*\bmd:/);
  });

  it.each(SIDEBAR_SHELLS)("%s: tiêu đề chỉ in MỘT lần", (file) => {
    // Bản cũ in `{title}` hai lần — một <div> cho điện thoại, một <h1> cho máy tính —
    // và bản là heading chính là bản bị ẩn. Hai bản của cùng một chuỗi luôn kết thúc như
    // vậy: cái đúng luật nằm ở nhánh không ai nhìn thấy.
    const printed = (read(file).match(/>\s*\{title\}/g) ?? []).length;
    expect(printed, `${file} in {title} ${printed} lần`).toBe(1);
  });
});

describe("/dieu-khoan: nền trang đậm hơn ba mặt nền mà §11 đem ra đo", () => {
  const src = read("dieu-khoan/terms-gate-view.tsx");
  const tailwind = readFileSync(join(repoRoot, "apps", "hub", "tailwind.config.ts"), "utf8");
  const token = (name: string) =>
    new RegExp(`\\b${name}:\\s*"(#[0-9A-Fa-f]{6})"`).exec(tailwind)?.[1] ?? "";
  // 25/08/2026: trang về nền TOKEN (bg-pagebg) theo lượt lật bảng màu sáng "SCI-FI
  // HUD" — nền đo là giá trị token, đọc sống từ tailwind.config.ts như mọi token khác.
  const pageBg = token("pagebg");

  it("nền trang vẫn là mã màu đã được đem đi đo", () => {
    // Đổi nền mà không đo lại là cách hai token xám âm thầm rơi xuống dưới ngưỡng.
    // 24/08: `#EAEFF6` -> `#081730` (tối). 25/08: về token pagebg (#F4F9FF, sáng).
    expect(src).toContain("flex-col bg-pagebg");
    expect(pageBg).toBe("#F4F9FF");
  });

  it("CẢ HAI token xám nay đều đạt trên nền này — cái chuông ở đây đã reo xong", () => {
    // ═══════════════════════════════════════════════════════════════════════
    // LẬT 24/08/2026 — bài này trước đây khẳng định điều NGƯỢC LẠI
    // ═══════════════════════════════════════════════════════════════════════
    // Nguyên văn cũ: *"`muted` KHÔNG đạt trên nền này, `caption` thì đạt — đây là lý do có
    // luật dưới"*. Nó là một CÁI CHUÔNG: ghim lại một chỗ hụt đã biết, để không ai quên.
    //
    // Nền sáng cũ `#EAEFF6` đậm hơn ba mặt §11 đem ra đo, nên `muted` rơi xuống dưới 4,5:1
    // đúng ở màn này. Sang bảng màu tối, nền là `#081730` và cả hai token đều đạt rộng rãi
    // — chuông đã reo xong, và giữ nguyên câu khẳng định cũ thì nó thành một lời nói dối
    // được CI bảo vệ.
    //
    // Luật KHÔNG đổi một chữ: mọi token xám phải đạt ≥4,5:1 trên nền màn này. Chỉ có điều
    // nay cả hai cùng đạt, nên phép đo đổi chiều.
    for (const ten of ["muted", "caption"]) {
      const ratio = contrast(token(ten), pageBg);
      expect(ratio, `${ten} (${token(ten)}) trên ${pageBg} chỉ đạt ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("câu 'vì sao bố mẹ đang đứng ở đây' đọc được trên nền trang", () => {
    // Câu ngay sau <h1> là LUẬT 1 của chính file terms-gate-view: nó là chỗ DUY NHẤT trả
    // lời vì sao phụ huynh bị đưa tới một trang pháp lý. Một câu như thế mà mờ dưới chuẩn
    // trên màn điện thoại rẻ ngoài nắng thì luật đó không được thi hành.
    const after = src.slice(src.indexOf("</h1>"));
    const cls = /<p className="([^"]+)"/.exec(after)?.[1] ?? "";
    const name = /\btext-(caption2?|muted2?|ink|navy)\b/.exec(cls)?.[1] ?? "";
    expect(name, `câu đầu sau </h1> dùng lớp: ${cls}`).not.toBe("");
    const hex = name === "ink" ? token("ink") : name === "navy" ? "#0A2A5E" : token(name);
    const ratio = contrast(hex, pageBg);
    expect(ratio, `text-${name} = ${hex} trên ${pageBg} chỉ đạt ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe("/dieu-khoan: mọi đích bấm đều ≥44px — kể cả những đích không phải <button>", () => {
  const src = read("dieu-khoan/terms-gate-view.tsx");

  it("ô tick 'Tôi đã đọc và hiểu' có vùng chạm 44px", () => {
    // Ô tick đo được 20 × 20px (`h-5 w-5`) và nó là CỔNG của nút "Tôi đồng ý". Hàng chữ
    // cạnh nó cao ~21px, nên gộp lại vẫn chưa tới 44px (§11, WCAG 2.5.5). Vùng chạm nay
    // nằm trên <label htmlFor> — thứ vốn đã có nghĩa "chạm vào chữ = tick ô".
    const tag = /<label[^>]*htmlFor="da-doc"[^>]*>/.exec(src)?.[0] ?? "";
    expect(tag, "không tìm thấy <label htmlFor=\"da-doc\">").not.toBe("");
    expect(declares44(tag), `label ô tick: ${tag}`).toBe(true);
  });

  it("hai lối ra ở chân trang đều ≥44px", () => {
    // Đây KHÔNG phải hai liên kết trong một câu văn: /home tự đẩy phụ huynh tới trang
    // này, trang này không có tab bar Hub (§6), và bản PWA không có nút Back trình duyệt.
    // Trượt tay ở lối ra duy nhất là bị nhốt.
    const links = src.match(/<a\s[^>]*>/g) ?? [];
    expect(links.length, "màn này phải còn ít nhất hai đường ra").toBeGreaterThanOrEqual(2);
    const small = links.filter((t) => !declares44(t)).map((t) => t.replace(/\s+/g, " "));
    expect(small, `còn ${small.length} liên kết chưa khai 44px`).toEqual([]);
  });
});

describe("ô lịch: cuối tuần KHÔNG được đọc giống ngày học chưa ai ghi", () => {
  // 2026-08-01 là thứ Bảy (weekdayIndex 5), 2026-07-31 là thứ Sáu (4). Bản trước trả về
  // ĐÚNG MỘT câu — "chưa có dữ liệu" — cho cả hai, trong khi chú thích đầu file hứa
  // ngược lại. Khác biệt duy nhất chỉ dành cho mắt và rất mờ: nền #F7F9FC so với #FFFFFF
  // = 1,04:1, viền nét đứt #D8DFE9 = 1,34:1. Cho tai thì không có gì.
  it("hai loại ô rỗng cho hai câu khác nhau", () => {
    const sat = dayCellLabel("2026-08-01", null);
    const fri = dayCellLabel("2026-07-31", null);
    expect(sat).not.toBe(fri);
    expect(fri).toContain("chưa có dữ liệu");
    expect(sat, "thứ Bảy không phải một ngày chưa ai điểm danh").not.toContain("chưa có dữ liệu");
    expect(sat).toContain("không phải ngày học");
  });

  it("ngày cuối tuần CÓ dòng điểm danh vẫn đọc ra trạng thái thật", () => {
    // Trường có buổi học bù thứ Bảy là chuyện thật. Luật trên chỉ được áp cho ô RỖNG.
    const sat = dayCellLabel("2026-08-01", {
      occurredOn: "2026-08-01",
      status: "present",
      checkedInAt: null,
      source: "teacher",
      mood: null,
    } as never);
    expect(sat).toContain("có mặt");
    expect(sat).not.toContain("không phải ngày học");
  });

  it("ô cuối tuần rỗng không vẽ icon 'Chưa điểm danh'", () => {
    // Trước 02/08 nó in `remove` — đúng cái icon mà chú giải ngay dưới lưới gọi tên là
    // "Chưa điểm danh". Vẽ một tín hiệu cho một ngày không có tín hiệu nào là nói SAI,
    // không phải nói thiếu.
    const cell = read("gvcn/student-detail-view.tsx");
    const from = cell.indexOf("function DayCell");
    const block = cell.slice(from, cell.indexOf("function statusWord"));
    expect(block).toMatch(/\{\(tone \|\| !weekend\) &&/);
  });
});

describe("dải màu dày một cạnh: mẫu bị cấm, và đã sửa ở hai màn này", () => {
  // gvcn-dashboard.tsx CÒN ba chỗ (`urgencyPresentation`) và cố ý nằm ngoài luật này:
  // ở đó `borderClass` là một giá trị XUẤT RA, đang được tests/unit/gvcn-trang-thai-quet
  // đối chiếu, nên đổi nó là việc của một gói khác chứ không phải một dòng sửa kèm.
  // Nói ra ở đây để lần sau không ai tưởng buồng lái đã sạch.
  it.each(["gvcn/student-detail-view.tsx", "help-request-view.tsx"])("%s không còn border-l dày", (file) => {
    expect(read(file), `${file} còn dải màu dày một cạnh`).not.toMatch(/border-l-\[\d/);
  });
});
