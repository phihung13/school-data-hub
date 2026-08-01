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
import { absentSubtitle, cadenceNote, moodClosedText } from "@/components/gvcn-dashboard";
import { STATUS_CELL } from "@/components/gvcn/student-detail-view";
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

describe("buồng lái: ô “Cảm xúc lớp hôm nay” nói VÌ SAO nó không còn ([QĐ-1])", () => {
  it("không đọc được vì quy định → nói ra quy định, không để ô trống", () => {
    const text = moodClosedText({ readable: false, reason: "chi_tam_ly" });
    expect(text).toContain("tâm lý");
    // Phải nói CẢ phần cô còn giữ — bỏ mất vế này là để cô tưởng mình mất luôn cả cờ.
    expect(text).toContain("cần để ý");
    expect(text.length).toBeGreaterThan(40);
  });

  it("máy chủ không nói lý do → KHÔNG bịa lý do hộ nó", () => {
    const text = moodClosedText({ readable: false, reason: null });
    expect(text).not.toContain("tâm lý");
    expect(text).toContain("chưa nhận được lý do");
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
  it("tức thì và quét đêm cho hai câu KHÁC HẲN nhau", () => {
    const now = cadenceNote("tuc_thi");
    const night = cadenceNote("quet_dem");
    expect(now).not.toBe(night);
    expect(now).toContain("ngay");
    expect(night).toContain("quét");
    // Người đọc một bảng gộp hai nhịp mà không biết là đang bị chính bảng đó đánh lừa.
    expect(night).toContain("chờ");
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

describe("sidebar: không hứa hợp đồng ARIA mà không thi hành", () => {
  const src = read("hub-sidebar.tsx");

  it('không còn role="menu" / role="menuitem" khi chưa có hành vi menu', () => {
    // Khai role=menu là hứa với trình đọc màn hình rằng mũi tên lên/xuống, Home/End và
    // giam focus đều hoạt động. Lớp nổi này không làm gì trong số đó. Muốn khai lại thì
    // phải làm trọn — và lúc đó hãy sửa cả bài test này cho khớp.
    expect(src).not.toMatch(/role="menu"/);
    expect(src).not.toMatch(/role="menuitem"/);
  });

  it("Escape đóng lớp nổi thì trả focus về nút đã mở nó", () => {
    expect(src).toMatch(/menuButtonRef\.current\?\.focus\(\)/);
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
