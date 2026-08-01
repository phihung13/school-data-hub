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
    expect(b.title).toContain("đã chạy lúc");
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
    expect(b.detail).toContain("KHÔNG có nghĩa lớp đang ổn");
  });

  it("(c) quá hạn: băng vàng, dẫn đúng runbook RB-02, và KHÔNG viết chết con số 26 giờ", () => {
    const b = scanBannerPresentation(
      scan({ state: "qua_han", needsAttention: true, lastSuccessAt: gioHomQua(1, 5) }),
      HOM_NAY,
    );
    expect(b.tone).toBe("canh-bao");
    expect(b.choPhepKetLuanOn).toBe(false);
    expect(b.detail).toContain("RB-02");
    // Nhịp in ra đến TỪ `ops.job_schedule.expected_every` truyền qua contract, không từ
    // một hằng số trong mã (mệnh lệnh 7). Đổi nhịp trong bảng thì câu này đổi theo.
    expect(b.detail).toContain("24 giờ");
    const khac = scanBannerPresentation(
      scan({ state: "qua_han", needsAttention: true, expectedEveryHours: 12 }),
      HOM_NAY,
    );
    expect(khac.detail).toContain("12 giờ");
  });

  it("quét THÀNH CÔNG nhưng của hôm qua: state vẫn 'ok' mà màn hình không được kết luận", () => {
    // Đây là chỗ ops.v_job_health một mình không đủ: nhịp 24h + dung sai 6h nên một lần
    // quét lúc 23:40 hôm qua vẫn là 'ok' với người vận hành, trong khi cô giáo sáng nay
    // đang nhìn số của đêm trước.
    const b = scanBannerPresentation(scan({ lastSuccessAt: gioHomQua(23, 40) }), HOM_NAY);
    expect(b.state).toBe("ok");
    expect(b.choPhepKetLuanOn).toBe(false);
    expect(b.title).toContain("Chưa có lần quét nào của hôm nay");
  });

  it("nguồn dữ liệu bị bỏ qua: quét tươi vẫn KHÔNG đủ tư cách kết luận lớp ổn", () => {
    const b = scanBannerPresentation(scan({ degradedSources: ["attendance"] }), HOM_NAY);
    expect(b.choPhepKetLuanOn).toBe(false);
    expect(b.detail).toContain("attendance");
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
    // Và không câu nào rỗng: một dải trống trên đầu buồng lái đọc y hệt không có dải nào.
    for (const t of tieuDe) expect(t.trim().length).toBeGreaterThan(0);
    for (const s of moiTrangThai) {
      const b = scanBannerPresentation(scan({ state: s, needsAttention: s !== "ok" }), HOM_NAY);
      expect(b.detail.trim().length).toBeGreaterThan(0);
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

  it("dải trạng thái mang theo câu đó ngay cả khi mọi thứ bình thường", () => {
    const b = scanBannerPresentation(
      scan({ rulesSkipped: [{ ruleCode: "C_CEFR", lyDo: "chua_cai_dat" }] }),
      HOM_NAY,
    );
    expect(b.tone).toBe("on-dinh");
    expect(b.detail).toContain("C_CEFR");
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
    expect(look.body).toContain("không có nghĩa lớp đang ổn");
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
