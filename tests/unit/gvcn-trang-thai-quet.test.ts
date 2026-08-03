// tests/unit/gvcn-trang-thai-quet.test.ts
//
// Khoá lại MỘT câu hỏi: khi bộ quét cờ không chạy, buồng lái GVCN có nói ra không?
//
// Vì sao cần một file riêng cho việc này (gói "debt-32-buong-lai-doc-care-flags",
// 01/08/2026): trước hôm nay `boardEmptyPresentation` đã có ba nhánh đúng nhưng KHÔNG có
// một test nào — grep toàn repo 01/08/2026, không file test nào nhắc tên nó. Một hàm viết
// đúng mà không ai khoá lại thì lần refactor sau nó im lặng trở về "lớp mình đang ổn",
// và không có gì đỏ lên. Với hệ chăm sóc trẻ em, câu trấn an sai là hướng hỏng nguy hiểm
// nhất, nên nó phải là thứ được khoá chặt nhất.
//
// Ba trạng thái bắt buộc của điều kiện 2 (yêu cầu gói việc):
//   (a) đã quét hôm nay, không cờ nào  → được nói "lớp ổn"
//   (b) CHƯA QUÉT LẦN NÀO              → tuyệt đối KHÔNG được nói "lớp ổn"
//   (c) quét trễ / nguồn hết tươi      → băng vàng
// Ca (b) là ca dễ quên nhất — nó không xảy ra trên máy dev (ở đó job đã chạy 200 lần),
// nên chỉ có test mới giữ được nó.
import { describe, it, expect } from "vitest";
import {
  boardEmptyPresentation,
  moTaLuatBiBoQua,
  scanBannerPresentation,
  isSameLocalDay,
} from "@/components/gvcn/scan-status";
import type { ScanHealth, ScanState } from "@hub/core/contracts";

const HOM_NAY = "2026-08-01";

/** Giờ địa phương, KHÔNG dùng chuỗi UTC: 01:19Z là 08:19 giờ Việt Nam, khác ngày ở nơi khác. */
function gioHomNay(h: number, m = 0): string {
  const d = new Date(`${HOM_NAY}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function gioHomQua(h: number, m = 0): string {
  const d = new Date(`${HOM_NAY}T00:00:00`);
  d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function scan(over: Partial<ScanHealth> = {}): ScanHealth {
  return {
    jobName: "flag_engine",
    state: "ok",
    needsAttention: false,
    lastSuccessAt: gioHomNay(8, 19),
    lastFinishedAt: gioHomNay(8, 19),
    expectedEveryHours: 24,
    graceHours: 6,
    rulesSkipped: [],
    degradedSources: [],
    ...over,
  };
}

describe("dải trạng thái bộ quét — mọi trạng thái đều phải nói được thành câu", () => {
  it("(a) quét xong HÔM NAY: dải yên, và ĐÂY là ca duy nhất được kết luận lớp ổn", () => {
    const b = scanBannerPresentation(scan(), HOM_NAY);
    expect(b.tone).toBe("on-dinh");
    expect(b.choPhepKetLuanOn).toBe(true);
    // Câu chữ RÚT NGẮN 02/08/2026 theo yêu cầu chủ đầu tư ("toàn chữ thừa thãi… chỉ cần
    // ghi cập nhật lúc mấy h là được"). Tính chất phải giữ KHÔNG đổi và nằm ở dòng trên:
    // `choPhepKetLuanOn` chỉ true khi quét của HÔM NAY và không nguồn nào bị bỏ qua.
    expect(b.title).toContain("Cập nhật");
  });

  it("(b) CHƯA QUÉT LẦN NÀO: băng vàng, và tuyệt đối không có quyền kết luận", () => {
    const b = scanBannerPresentation(
      scan({ state: "chua_chay", needsAttention: true, lastSuccessAt: null, lastFinishedAt: null }),
      HOM_NAY,
    );
    expect(b.tone).toBe("canh-bao");
    expect(b.choPhepKetLuanOn).toBe(false);
    expect(b.title).toContain("chưa chạy lần nào");
    // Câu phải nói thẳng rằng bảng trống KHÔNG đồng nghĩa lớp ổn — đây là toàn bộ lý do
    // trạng thái này tồn tại như một trạng thái riêng trong ops.v_job_health (0041).
    // Cắt chữ 02/08/2026 nhưng KHÔNG cắt ý: câu ngắn lại, vế "không có nghĩa lớp ổn" ở lại.
    expect(b.detail).toContain("không có nghĩa là lớp ổn");
  });

  it("(c) quá hạn: băng vàng, và nói thẳng là số đang cũ", () => {
    // BỎ hai khẳng định cũ 02/08/2026, cả hai vì cùng một lý do: chúng đòi màn hình của
    // CÔ GIÁO in ra thứ dành cho NGƯỜI TRỰC MÁY.
    //   · mã runbook "RB-02" — cô không mở runbook, và cô không chạy lại job được.
    //   · nhịp chạy "24 giờ" lấy từ ops.job_schedule — đúng về nguồn, nhưng nó trả lời
    //     câu "máy phải chạy mấy tiếng một lần", không phải câu "tôi đọc số này được không".
    // Cả hai vẫn được canh ở nơi chúng có nghĩa: `ops.v_job_health` (0041) và kênh báo
    // động (0051) đẩy tin tới người trực. Điều PHẢI giữ ở đây là hai dòng dưới.
    const b = scanBannerPresentation(
      scan({ state: "qua_han", needsAttention: true, lastSuccessAt: gioHomQua(1, 5) }),
      HOM_NAY,
    );
    expect(b.tone).toBe("canh-bao");
    expect(b.choPhepKetLuanOn).toBe(false);
    expect(b.detail).toContain("số cũ");
  });

  it("quét THÀNH CÔNG nhưng của hôm qua: state vẫn 'ok' mà màn hình không được kết luận", () => {
    // Đây là chỗ ops.v_job_health một mình không đủ: nhịp 24h + dung sai 6h nên một lần
    // quét lúc 23:40 hôm qua vẫn là 'ok' với người vận hành, trong khi cô giáo sáng nay
    // đang nhìn số của đêm trước.
    const b = scanBannerPresentation(scan({ lastSuccessAt: gioHomQua(23, 40) }), HOM_NAY);
    expect(b.state).toBe("ok");
    expect(b.choPhepKetLuanOn).toBe(false);
    // Sau khi rút gọn, "cũ" đọc ra từ chính MỐC THỜI GIAN chứ không từ một câu giải
    // thích: quét hôm nay in "Cập nhật 08:19", quét hôm qua in "Cập nhật 23:40 31-07".
    // Đó là lý do phép kiểm này đòi có NGÀY trong tiêu đề.
    expect(b.title).toContain("Cập nhật");
    expect(b.title, "quét của hôm khác phải hiện NGÀY, nếu không cô không biết số đã cũ").toMatch(/\d{2}-\d{2}/);
  });

  it("nguồn dữ liệu bị bỏ qua: quét tươi vẫn KHÔNG đủ tư cách kết luận lớp ổn", () => {
    // Bỏ khẳng định "câu chữ phải nêu TÊN nguồn" (02/08/2026): tên nguồn là tên bảng dữ
    // liệu, cô giáo không sửa được và không cần biết. Thứ PHẢI giữ là hệ quả của nó —
    // quét có nguồn bị bỏ qua thì màn hình MẤT QUYỀN kết luận "lớp ổn", dù quét tươi.
    const b = scanBannerPresentation(scan({ degradedSources: ["attendance"] }), HOM_NAY);
    expect(b.choPhepKetLuanOn).toBe(false);
  });

  it("KHÔNG ĐỌC ĐƯỢC SỔ không bao giờ bị hạ thành 'chưa quét'", () => {
    const b = scanBannerPresentation(
      scan({ state: "khong_doc_duoc", needsAttention: true, lastSuccessAt: null }),
      HOM_NAY,
    );
    expect(b.tone).toBe("canh-bao");
    expect(b.title).toContain("Không đọc được");
    expect(b.detail).toContain("KHÔNG có nghĩa là chưa quét");
  });

  it("mọi trạng thái đều ra một câu riêng — không trạng thái nào rơi vào câu của trạng thái khác", () => {
    const moiTrangThai: ScanState[] = [
      "ok",
      "dang_chay",
      "chua_chay",
      "that_bai",
      "treo",
      "qua_han",
      "tat",
      "chua_khai",
      "khong_doc_duoc",
    ];
    const tieuDe = moiTrangThai.map(
      (s) => scanBannerPresentation(scan({ state: s, needsAttention: s !== "ok" }), HOM_NAY).title,
    );
    expect(new Set(tieuDe).size).toBe(moiTrangThai.length);
    // Và không TIÊU ĐỀ nào rỗng: một dải trống trên đầu buồng lái đọc y hệt không có dải nào.
    for (const t of tieuDe) expect(t.trim().length).toBeGreaterThan(0);

    // `detail` thì KHÔNG còn bắt buộc (02/08/2026). Trạng thái bình thường nay chỉ có
    // đúng một dòng "Cập nhật <giờ>" và không kèm câu nào — đó là điều chủ đầu tư yêu
    // cầu, và một câu thêm vào cho đủ chỗ là đúng thứ vừa bị cắt.
    //
    // Nhưng MỌI TRẠNG THÁI BÁO ĐỘNG vẫn phải nói được thành câu: người đọc cần biết vì
    // sao dải chuyển vàng, và một dải vàng câm còn khó hiểu hơn không có dải.
    for (const s of moiTrangThai) {
      const b = scanBannerPresentation(scan({ state: s, needsAttention: s !== "ok" }), HOM_NAY);
      if (b.tone === "on-dinh") continue;
      expect(b.detail.trim().length, `trạng thái ${s} chuyển tông mà không nói vì sao`).toBeGreaterThan(0);
    }
  });

  it("chỉ đúng MỘT trạng thái cho phép kết luận lớp ổn", () => {
    const duocPhep = (
      [
        "ok",
        "dang_chay",
        "chua_chay",
        "that_bai",
        "treo",
        "qua_han",
        "tat",
        "chua_khai",
        "khong_doc_duoc",
      ] as ScanState[]
    ).filter((s) => scanBannerPresentation(scan({ state: s }), HOM_NAY).choPhepKetLuanOn);
    expect(duocPhep).toEqual(["ok"]);
  });
});

describe("luật bị bỏ qua phải được nói ra", () => {
  it("hai luật bị bỏ qua trên hub_dev hôm nay được kể tên kèm lý do tiếng Việt", () => {
    // Số đo thật 01/08/2026: mỗi lần quét bỏ qua C_CEFR và C_MASTERY, và trước gói này
    // KHÔNG màn hình nào nói ra. Bảng cờ sạch khi ấy là kết quả của 4/6 luật.
    const cau = moTaLuatBiBoQua([
      { ruleCode: "C_CEFR", lyDo: "chua_cai_dat" },
      { ruleCode: "C_MASTERY", lyDo: "chua_khai_nguon_tuoi" },
    ]);
    expect(cau).toContain("2 luật chưa được chấm");
    expect(cau).toContain("C_CEFR (chưa cài đặt)");
    expect(cau).toContain("C_MASTERY (chưa khai nguồn dữ liệu)");
  });

  it("lý do lạ vẫn hiện nguyên mã, không bị nuốt", () => {
    expect(moTaLuatBiBoQua([{ ruleCode: "X", lyDo: "ly_do_moi" }])).toContain("X (ly_do_moi)");
  });

  it("không có luật nào bị bỏ qua → không thêm câu thừa", () => {
    expect(moTaLuatBiBoQua([])).toBe("");
  });

  it("nhưng KHÔNG in mã luật lên dải trạng thái của cô giáo", () => {
    // ĐẢO CHIỀU khẳng định 02/08/2026. Câu cũ đòi dải trạng thái phải kể tên luật bị bỏ
    // qua ngay cả khi mọi thứ bình thường — và đó chính là dòng chủ đầu tư chỉ vào khi
    // mở trang: "3 luật chưa được chấm: B_BEHAVIOR (nguồn dữ liệu hết tươi) · C_CEFR
    // (chưa cài đặt) · C_MASTERY (chưa khai nguồn dữ liệu)".
    //
    // `B_BEHAVIOR` / `C_CEFR` là MÃ LUẬT trong `care.rules` — từ vựng của người dựng bộ
    // quét. Cô giáo không cài đặt được luật, không khai được nguồn, và không làm gì được
    // với ba cái mã đó lúc 7 giờ sáng.
    //
    // Câu mô tả luật bị bỏ qua KHÔNG bị xoá — `moTaLuatBiBoQua()` vẫn còn và vẫn được
    // kiểm ngay phía trên. Nó chỉ thôi được in lên màn hình của cô; chỗ của nó là
    // `ops.v_rule_health` (0043), nơi người trực máy đọc.
    const b = scanBannerPresentation(
      scan({ rulesSkipped: [{ ruleCode: "C_CEFR", lyDo: "chua_cai_dat" }] }),
      HOM_NAY,
    );
    expect(b.tone).toBe("on-dinh");
    expect(b.detail).not.toContain("C_CEFR");
  });
});

describe("ô “hết việc” — kết luận cần cả phép đo lẫn sổ việc cũ", () => {
  const tuoi = () => scanBannerPresentation(scan(), HOM_NAY);

  it("(a) quét tươi + 0 hồ sơ mở → được nói lớp ổn, có mascot", () => {
    const look = boardEmptyPresentation(tuoi(), 0);
    expect(look.showMascot).toBe(true);
    expect(look.title).toContain("lớp mình đang ổn");
  });

  it("lớp còn hồ sơ chăm sóc đang mở thì KHÔNG được nhận câu “lớp mình đang ổn”", () => {
    // Ca 6A2 đo được trên hub_dev 01/08/2026: 1 hồ sơ mở, 0 cờ, quét tươi → bản cũ in
    // "Hết việc rồi — lớp mình đang ổn!" ngay cạnh ô "1 hồ sơ chăm sóc đang mở".
    const look = boardEmptyPresentation(tuoi(), 1);
    expect(look.showMascot).toBe(false);
    expect(look.title).not.toContain("lớp mình đang ổn");
    expect(look.body).toContain("1 hồ sơ chăm sóc đang mở");
  });

  it("(b) chưa quét lần nào → không kết luận, dù lớp không còn hồ sơ nào", () => {
    const chuaQuet = scanBannerPresentation(
      scan({ state: "chua_chay", needsAttention: true, lastSuccessAt: null, lastFinishedAt: null }),
      HOM_NAY,
    );
    const look = boardEmptyPresentation(chuaQuet, 0);
    expect(look.showMascot).toBe(false);
    expect(look.title).not.toContain("ổn");
    // Câu rút ngắn 02/08/2026, ý giữ nguyên: chỗ trống này KHÔNG được đọc thành "lớp ổn".
    expect(look.body).toContain("chưa đủ để nói lớp ổn");
  });

  it("(c) quá hạn → không kết luận", () => {
    const treZ = scanBannerPresentation(
      scan({ state: "qua_han", needsAttention: true, lastSuccessAt: gioHomQua(1, 0) }),
      HOM_NAY,
    );
    expect(boardEmptyPresentation(treZ, 0).showMascot).toBe(false);
  });
});

describe("so ngày theo giờ ĐỊA PHƯƠNG, không theo UTC", () => {
  it("00:30 sáng nay vẫn là hôm nay", () => {
    expect(isSameLocalDay(gioHomNay(0, 30), HOM_NAY)).toBe(true);
  });
  it("23:40 hôm qua không phải hôm nay", () => {
    expect(isSameLocalDay(gioHomQua(23, 40), HOM_NAY)).toBe(false);
  });
  it("null và chuỗi rác đều là 'không phải hôm nay', không ném lỗi", () => {
    expect(isSameLocalDay(null, HOM_NAY)).toBe(false);
    expect(isSameLocalDay("khong-phai-ngay", HOM_NAY)).toBe(false);
  });
});
