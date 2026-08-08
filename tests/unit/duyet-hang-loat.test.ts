// tests/unit/duyet-hang-loat.test.ts
//
// Màn Duyệt báo cáo cho chọn nhiều em (06/08/2026, chủ đầu tư yêu cầu trực tiếp). Bài này
// canh BA thứ mà một bài chạy thật KHÔNG nhìn thấy:
//
//   1. TẦNG CHẶN THỨ HAI của "trả lại phải có lý do". Ba tầng chồng nhau (hợp đồng Zod ·
//      router · chính ràng buộc dữ liệu), nên gọi qua tRPC caller thì hợp đồng bao giờ
//      cũng chặn trước — gỡ lớp kiểm trong router KHÔNG làm bài DB nào đỏ. Chỉ cổng quét
//      nguồn thấy nó biến mất. (Cùng khuôn `duong-ghi-gui-muon.test.ts` của ADR-029.)
//   2. MỆNH ĐỀ `status = 'pending'` trong câu upsert hàng loạt. Bỏ nó đi thì mọi ca DB
//      hiện có vẫn xanh trừ đúng một ca, và cái mất là: một cú "Chọn tất cả · Duyệt gửi
//      phụ huynh" trên màn đã cũ vài phút lật ngược chữ ký "Đã trả lại" của đồng nghiệp —
//      im lặng, không lỗi, không vết.
//   3. HAI CÂU ĐỌC KẾT QUẢ. `skipped` bị nuốt là hỏng theo kiểu tệ nhất: cô đếm "đã duyệt
//      30 em" trong khi hệ chỉ ghi 27, và không có gì trên màn hình nói khác đi.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lyDoChuaGhiDuoc, ketQuaDuyetBaoCao } from "@/components/gvcn/report-approval-view";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Bỏ chú thích trước khi soi — BẮT BUỘC, cùng lý do đã ghi ở `duong-ghi-gui-muon.test.ts`:
 * cả router lẫn màn hình đều kể lại nguyên văn thứ chúng cấm ("ghi đè lên quyết định đã
 * ký", "approveReport") trong chú thích để lần sau không ai làm ngược lại. Soi cả chú
 * thích là biến một lời giải thích đúng thành một lỗi giả.
 */
function boChuThich(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const ROUTER = boChuThich(
  readFileSync(join(repoRoot, "apps", "hub", "server", "routers", "care.ts"), "utf8"),
);
const MAN = boChuThich(
  readFileSync(
    join(repoRoot, "apps", "hub", "components", "gvcn", "report-approval-view.tsx"),
    "utf8",
  ),
);

describe("máy chủ · decideReports", () => {
  it("gác theo VAI, không chỉ hỏi đã đăng nhập chưa", () => {
    const dong = ROUTER.split("\n").find((l) => l.includes("decideReports:"));
    expect(dong, "không tìm thấy khai báo decideReports").toBeDefined();
    // Lỗ leo quyền số 1 của router này (0025) sinh ra từ đúng một chữ `protectedProcedure`
    // trên một mutation chạm dữ liệu điểm danh. Thủ tục này ghi thứ GỬI RA NGOÀI nhà
    // trường, nên nó phải gác chặt hơn, không được bằng.
    expect(dong).toContain("homeroomProcedure");
  });

  it("tự kiểm lý do khi trả lại — tầng chặn thứ hai không được biến mất", () => {
    const than = ROUTER.slice(ROUTER.indexOf("decideReports:"), ROUTER.indexOf("approveReport:"));
    expect(than.length, "cắt nhầm đoạn — hai thủ tục phải đứng cạnh nhau").toBeGreaterThan(200);
    expect(
      /decision\s*===\s*"rejected"/.test(than) && /BAD_REQUEST/.test(than),
      "Gỡ lớp kiểm này thì hợp đồng Zod vẫn chặn — nên không bài chạy thật nào đỏ, và " +
        "tầng chặn thứ hai biến mất trong im lặng.",
    ).toBe(true);
  });

  it("đi qua hàm `report.decide_reports` — không có đường ghi thứ hai (ADR-031)", () => {
    const than = ROUTER.slice(ROUTER.indexOf("decideReports:"), ROUTER.indexOf("approveReport:"));
    expect(than).toContain("report.decide_reports");
    // Đổi chữ ký và ghi sổ vết phải là MỘT hành động nguyên tử. Một câu upsert viết tay ở
    // tầng này chạy đúng, trả về đúng, và không bài test hành vi nào đỏ — nó chỉ lặng lẽ
    // đổi một quyết định đã gửi phụ huynh mà không ai soát được. Đây là đường ghi phải
    // chặn ở mức TỒN TẠI, không phải ở mức hành vi (cùng khuôn ADR-029).
    expect(
      /insert\s+into\s+report\.growth_report_approvals/i.test(than),
      "Đường hàng loạt không được tự viết upsert — sổ vết 0054 chỉ ghi khi đi qua hàm.",
    ).toBe(false);
  });

  it("truyền cờ ghi đè xuống hàm, không tự quyết hộ", () => {
    const than = ROUTER.slice(ROUTER.indexOf("decideReports:"), ROUTER.indexOf("approveReport:"));
    expect(than).toContain("input.ghiDeQuyetDinhDaCo");
    // Sáu tham số, đúng chữ ký đã chốt: mảng · tuần · trạng thái đích · lý do · cờ · mã.
    expect(than).toMatch(/\$1::uuid\[\][\s\S]*\$5::boolean[\s\S]*\$6::uuid/);
  });

  it("lý do bắt buộc khi bật cờ, KỂ CẢ khi đổi sang “đã duyệt”", () => {
    const than = ROUTER.slice(ROUTER.indexOf("decideReports:"), ROUTER.indexOf("approveReport:"));
    // Nếu điều kiện chỉ còn `decision === "rejected"` thì đổi một chữ ký đã gửi phụ huynh
    // sang "đã duyệt" sẽ không ai phải giải thích — đúng cửa mà ADR-031 sinh ra để đóng.
    expect(than).toMatch(/decision === "rejected" \|\| input\.ghiDeQuyetDinhDaCo/);
  });

  it("lọc id trùng trước khi gọi hàm", () => {
    const than = ROUTER.slice(ROUTER.indexOf("decideReports:"), ROUTER.indexOf("approveReport:"));
    // `skipped` tính theo mảng thô sẽ dương một cách vô nghĩa: màn hình nói "bỏ qua 1 em"
    // khi không có em nào bị bỏ.
    expect(/new Set\(input\.studentIds\)/.test(than)).toBe(true);
  });
});

describe("màn hình · chọn nhiều em", () => {
  it("bước xác nhận ghi đè nói bằng CON SỐ, và chỉ hiện khi có thứ để đè (ADR-031)", () => {
    expect(MAN).toMatch(/Đổi quyết định đã ký cho \{daKy\.length\} em/);
    // Có điều kiện `daKy.length > 0`: một ô xác nhận hiện thường trực là một ô người ta
    // tick cho xong, và lúc đó nó thôi là một bước xác nhận.
    expect(MAN).toMatch(/daKy\.length > 0 &&/);
    // Cờ chỉ bật khi CẢ HAI cùng đúng — tick rồi bỏ chọn hết em đã ký thì lượt gửi quay
    // về đường mặc định, không mang theo một cờ ghi đè cho lô không có gì để đè.
    expect(MAN).toMatch(/const ghiDe = daKy\.length > 0 && xacNhanGhiDe/);
    // Checkbox thật, không phải nút đổi màu (§11).
    expect(MAN).toContain("checked={xacNhanGhiDe}");
    // KHÔNG hộp thoại: một bước, không chặn màn hình.
    expect(MAN).not.toMatch(/role="dialog"|aria-modal/);
  });

  it("ô tick hiện ở MỌI em, kể cả em đã có chữ ký", () => {
    // Trước ADR-031 màn ẩn ô tick với em đã quyết vì máy chủ từ chối ghi đè. Nay không
    // còn đúng — và chú thích giải thích lý do cũ cũng phải đi, không để lại một lời dặn
    // mô tả sai hành vi hiện hành.
    expect(MAN).not.toMatch(/const chonDuoc = row\.status === "pending"/);
    expect(MAN).not.toMatch(/\{chonDuoc \? \(/);
  });

  it("mỗi dòng có ô tick THẬT, và có ô “Chọn tất cả”", () => {
    // Checkbox thật chứ không phải một nút đổi màu (§11): trạng thái chọn phải đọc được cả
    // bằng tai lẫn khi không phân biệt được màu.
    expect((MAN.match(/type="checkbox"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(MAN).toContain("Chọn tất cả");
    // "đã chọn một nửa" không được trông y hệt "chưa chọn gì".
    expect(MAN).toContain("indeterminate");
  });

  it("thanh hành động nói số đang chọn, và nói ra thành tiếng", () => {
    expect(MAN).toMatch(/Đang chọn \{selected\.length\}/);
    expect(MAN).toContain('role="status"');
  });

  it("màn KHÔNG còn gọi approveReport — một đường ghi, không hai", () => {
    // `approveReport` vẫn sống cho client cũ (deprecated), nhưng màn này phải đi đúng một
    // đường. Hai đường ghi song song trên cùng một màn là hai chỗ để hành vi lệch nhau —
    // và ở đây chúng lệch thật: một cái ghi đè quyết định đã ký, một cái thì không.
    expect(MAN).not.toContain("approveReport");
    expect(MAN).toContain("decideReports");
  });

  it("mã chống trùng sinh một lần mỗi lượt soạn (§9)", () => {
    expect(MAN).toContain("newMutationId");
    expect(MAN).toContain("clientMutationId");
  });

  it("“bản phụ huynh có thể khác” là CHIP, không còn là đoạn văn (06/08/2026)", () => {
    // Câu cũ dài hai dòng và giải thích vì sao màn thiếu dữ liệu — chủ đầu tư chỉ đích
    // danh nó. NGHĨA thì phải ở lại: bỏ hẳn là quay về đúng lỗi màn duyệt sinh ra để
    // chữa — cô ký một bản khác bản phụ huynh đọc, và không biết mình đang ký bản rút gọn.
    expect(MAN).not.toContain("dựa trên tâm trạng cả tuần");
    expect(MAN).not.toContain("không đọc nhật ký cảm xúc của em");

    expect(MAN).toContain("Bản phụ huynh có thể khác");
    expect(MAN).toContain("visibility_off");
    // Vẫn treo vào cờ do MÁY CHỦ phát ra, không phải một điều kiện màn hình tự suy.
    expect(MAN).toMatch(/preview\.glowIncomplete/);
    // "có thể khác", không phải "khác": máy chủ chỉ biết mình không đọc được nguồn.
    expect(MAN).not.toContain("Bản phụ huynh khác");
    // ≤6 chữ (§1.5) — nhãn, không phải câu.
    expect("Bản phụ huynh có thể khác".split(" ").length).toBeLessThanOrEqual(6);
  });

  it("KHÔNG dạy người dùng cách dùng màn (yêu cầu chủ đầu tư 06/08/2026)", () => {
    // Nghĩa nằm ở hình: ô tick, số đang chọn, nhãn trạng thái. Ba câu dưới đây là ba kiểu
    // chữ đã bị cắt — giải thích cơ chế chống trùng, giải thích một nút không làm gì, và
    // dặn dò thao tác.
    for (const cam of ["không gọi máy chủ", "bấm hai lần", "bản ghi thứ hai", "hãy bấm"]) {
      expect(MAN, `màn còn câu dạy cách dùng: “${cam}”`).not.toContain(cam);
    }
  });
});

describe("nút vô hiệu phải nói được vì sao — MỘT dòng, không hơn (§1.5)", () => {
  it("chưa chọn em nào", () => {
    expect(lyDoChuaGhiDuoc(null, 0, "")).toBe("Chọn ít nhất một em.");
  });

  it("chọn rồi nhưng chưa chọn quyết định", () => {
    expect(lyDoChuaGhiDuoc(null, 3, "")).toBe("Chọn một quyết định.");
  });

  it("duyệt gửi phụ huynh trên lô toàn em chưa ai quyết KHÔNG đòi lý do", () => {
    expect(lyDoChuaGhiDuoc("approved", 3, "")).toBeNull();
  });

  it("trả lại đòi lý do, và đếm đúng số ký tự còn thiếu", () => {
    expect(lyDoChuaGhiDuoc("rejected", 3, "")).toBe("Trả lại phải kèm lý do.");
    // Khoảng trắng không phải lý do — cùng ngưỡng với `note: z.string().trim().min(3)`.
    expect(lyDoChuaGhiDuoc("rejected", 3, "   ")).toBe("Trả lại phải kèm lý do.");
    expect(lyDoChuaGhiDuoc("rejected", 3, "ab")).toContain("1 ký tự");
    expect(lyDoChuaGhiDuoc("rejected", 3, "nghỉ ốm")).toBeNull();
  });

  it("lô có em đã ký → đòi bước xác nhận TRƯỚC, rồi mới đòi lý do (ADR-031)", () => {
    // Thứ tự có chủ ý: chưa tick xác nhận thì máy chủ sẽ bỏ qua đúng những em này (cờ tắt
    // = chỉ chạm dòng chưa ai quyết), nên hỏi lý do trước là hỏi cho một lượt ghi sẽ
    // không xảy ra.
    expect(lyDoChuaGhiDuoc("approved", 5, "", 2, false)).toBe("2 em đã ký — xác nhận để đổi.");
    // Tick rồi: lý do bắt buộc, KỂ CẢ khi đổi sang "đã duyệt".
    expect(lyDoChuaGhiDuoc("approved", 5, "", 2, true)).toBe("Đổi quyết định phải kèm lý do.");
    expect(lyDoChuaGhiDuoc("approved", 5, "ghi nhầm tuần trước", 2, true)).toBeNull();
  });

  it("lô KHÔNG có em đã ký thì bước xác nhận không chen vào", () => {
    // Cô từng tick xác nhận rồi bỏ chọn hết em đã ký: lượt gửi phải quay về đường mặc
    // định, không bị kẹt sau một câu đòi lý do cho việc không còn nữa.
    expect(lyDoChuaGhiDuoc("approved", 5, "", 0, true)).toBeNull();
  });

  it("mỗi câu gọn trong một dòng caption", () => {
    const cau = [
      lyDoChuaGhiDuoc(null, 0, ""),
      lyDoChuaGhiDuoc(null, 3, ""),
      lyDoChuaGhiDuoc("rejected", 3, ""),
      lyDoChuaGhiDuoc("rejected", 3, "ab"),
      lyDoChuaGhiDuoc("approved", 5, "", 12, false),
      lyDoChuaGhiDuoc("approved", 5, "", 12, true),
    ];
    for (const c of cau) {
      expect(c).not.toBeNull();
      expect(c!.length, `caption dài quá một dòng: “${c}”`).toBeLessThanOrEqual(60);
    }
  });
});

describe("câu đọc kết quả — `skipped` không bao giờ bị nuốt", () => {
  it("ghi trọn lô", () => {
    expect(ketQuaDuyetBaoCao({ updated: 12, skipped: 0 }, "approved")).toBe(
      "Đã duyệt gửi phụ huynh cho 12 em.",
    );
    expect(ketQuaDuyetBaoCao({ updated: 2, skipped: 0 }, "rejected")).toBe(
      "Đã trả lại báo cáo của 2 em.",
    );
  });

  it("ghi một phần → nói cả hai con số", () => {
    const cau = ketQuaDuyetBaoCao({ updated: 27, skipped: 3 }, "approved");
    expect(cau).toContain("27");
    expect(cau).toContain("3");
    expect(cau).toContain("đã có người quyết trước");
  });

  it("không ghi được em nào → nói thẳng, và bảo tải lại", () => {
    const cau = ketQuaDuyetBaoCao({ updated: 0, skipped: 5 }, "approved");
    expect(cau).toContain("Không em nào đổi");
    expect(cau).toContain("Tải lại");
    // Đây là ca dễ bị viết thành "Đã duyệt 0 em." — một câu nghe như thành công.
    expect(cau).not.toMatch(/^Đã duyệt/);
  });

  it("máy chủ trả về thứ vô nghĩa thì màn hình cũng không im", () => {
    expect(ketQuaDuyetBaoCao({ updated: 0, skipped: 0 }, "approved").length).toBeGreaterThan(20);
  });

  it("đường GHI ĐÈ nói bằng câu của chính nó, không mượn câu đường mặc định", () => {
    const de = ketQuaDuyetBaoCao({ updated: 12, skipped: 0 }, "approved", true);
    expect(de).toContain("Đã đổi quyết định của 12 em");
    expect(de).toContain("Duyệt gửi phụ huynh");

    // `skipped` ở đường ghi đè KHÔNG còn nghĩa "đã có người quyết trước" — trạng thái cũ
    // không chặn được gì nữa. In câu kia ở đây là một lời giải thích sai trông như thật:
    // cô sẽ đi tìm "ai đã ký trước" cho một con số không nói về chuyện đó.
    const bo = ketQuaDuyetBaoCao({ updated: 3, skipped: 2 }, "rejected", true);
    expect(bo).not.toContain("đã có người quyết trước");
    expect(bo).toContain("không thuộc lớp chủ nhiệm");
    // Đường mặc định thì vẫn nói câu cũ.
    expect(ketQuaDuyetBaoCao({ updated: 3, skipped: 2 }, "rejected", false)).toContain(
      "đã có người quyết trước",
    );
  });
});
