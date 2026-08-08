// tests/unit/gvcn-trang-thai-quet.test.ts
//
// Khoá lại MỘT câu hỏi: khi bộ quét cờ không chạy, buồng lái GVCN có nói ra không?
//
// Vì sao cần một file riêng cho việc này (gói "debt-32-buong-lai-doc-care-flags",
// 01/08/2026): trước hôm đó `boardEmptyPresentation` đã có ba nhánh đúng nhưng KHÔNG có
// một test nào — grep toàn repo, không file test nào nhắc tên nó. Một hàm viết đúng mà
// không ai khoá lại thì lần refactor sau nó im lặng trở về "lớp mình đang ổn", và không
// có gì đỏ lên. Với hệ chăm sóc trẻ em, câu trấn an sai là hướng hỏng nguy hiểm nhất,
// nên nó phải là thứ được khoá chặt nhất.
//
// ĐỔI CHỖ CANH, KHÔNG BỎ CANH (06/08/2026 — ADR-030, RULES.md Rev F điều 8 sửa lời).
// Chủ đầu tư bỏ DẢI CẢNH BÁO trên đầu buồng lái. Điều khoản đổi chỗ nói chứ không bỏ
// nghĩa vụ nói, nên file này cũng đổi chỗ canh chứ không bớt phép kiểm:
//
//   · phần canh "mọi trạng thái quét phải nói được thành câu" GIỮ NGUYÊN — chín câu đó
//     nay in ở ô "hết việc" thay vì trên dải;
//   · THÊM một nhóm cho `dongPhuEmCanDeY` — dòng phụ của ô "Em cần để ý", chỗ duy nhất
//     còn hiện MỌI LÚC. Đây là nơi luật "số cũ không được hiện ra như số hôm nay" phải
//     đứng sau khi dải biến mất;
//   · THÊM một nhóm quét thẳng mã nguồn buồng lái: dải đã đi thật, và sự thật đã tới
//     đúng chỗ mới. Bỏ dải mà quên nối dòng phụ thì hai nhóm trên vẫn xanh — chỉ có
//     nhóm này đỏ.
//
// Ba trạng thái bắt buộc:
//   (a) đã quét hôm nay, không cờ nào  → được nói "lớp ổn", dòng phụ được nói "chưa em nào"
//   (b) CHƯA QUÉT LẦN NÀO              → tuyệt đối KHÔNG được nói cả hai câu trên
//   (c) quét trễ / nguồn hết tươi      → dòng phụ phải ghi mốc lượt quét gần nhất
// Ca (b) là ca dễ quên nhất — nó không xảy ra trên máy dev (ở đó job đã chạy 200 lần),
// nên chỉ có test mới giữ được nó.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  boardEmptyPresentation,
  dongPhuEmCanDeY,
  moTaLuatBiBoQua,
  scanPresentation,
  isSameLocalDay,
} from "@/components/gvcn/scan-status";
import type { ScanHealth, ScanState } from "@hub/core/contracts";

const HOM_NAY = "2026-08-01";

const MOI_TRANG_THAI: ScanState[] = [
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

describe("trạng thái bộ quét — mọi trạng thái đều phải nói được thành câu", () => {
  it("(a) quét xong HÔM NAY: yên, và ĐÂY là ca duy nhất được kết luận lớp ổn", () => {
    const b = scanPresentation(scan(), HOM_NAY);
    expect(b.tone).toBe("on-dinh");
    expect(b.choPhepKetLuanOn).toBe(true);
    // Câu chữ RÚT NGẮN 02/08/2026 theo yêu cầu chủ đầu tư ("toàn chữ thừa thãi… chỉ cần
    // ghi cập nhật lúc mấy h là được"). Tính chất phải giữ KHÔNG đổi và nằm ở dòng trên:
    // `choPhepKetLuanOn` chỉ true khi quét của HÔM NAY và không nguồn nào bị bỏ qua.
    expect(b.title).toContain("Cập nhật");
  });

  it("(b) CHƯA QUÉT LẦN NÀO: báo động, và tuyệt đối không có quyền kết luận", () => {
    const b = scanPresentation(
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
    // Không có mốc nào để in — và `null` ở đây phải là `null` thật, không phải chuỗi rỗng:
    // nơi gọi phân biệt "chưa quét lần nào" với "quét lúc mấy giờ" bằng đúng trường này.
    expect(b.mocQuet).toBeNull();
  });

  it("(c) quá hạn: báo động, và nói thẳng là số đang cũ", () => {
    // BỎ hai khẳng định cũ 02/08/2026, cả hai vì cùng một lý do: chúng đòi màn hình của
    // CÔ GIÁO in ra thứ dành cho NGƯỜI TRỰC MÁY.
    //   · mã runbook "RB-02" — cô không mở runbook, và cô không chạy lại job được.
    //   · nhịp chạy "24 giờ" lấy từ ops.job_schedule — đúng về nguồn, nhưng nó trả lời
    //     câu "máy phải chạy mấy tiếng một lần", không phải câu "tôi đọc số này được không".
    // Cả hai vẫn được canh ở nơi chúng có nghĩa: `ops.v_job_health` (0041) và kênh báo
    // động (0051) đẩy tin tới người trực. Điều PHẢI giữ ở đây là ba dòng dưới.
    const b = scanPresentation(
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
    const b = scanPresentation(scan({ lastSuccessAt: gioHomQua(23, 40) }), HOM_NAY);
    expect(b.state).toBe("ok");
    expect(b.choPhepKetLuanOn).toBe(false);
    // Sau khi rút gọn, "cũ" đọc ra từ chính MỐC THỜI GIAN chứ không từ một câu giải
    // thích: quét hôm nay cho mốc "08:19", quét hôm qua cho mốc "23:40 31-07".
    // Đó là lý do phép kiểm này đòi có NGÀY trong mốc.
    expect(b.mocQuet).toMatch(/\d{2}-\d{2}/);
    expect(b.title).toContain("Cập nhật");
  });

  it("nguồn dữ liệu bị bỏ qua: quét tươi vẫn KHÔNG đủ tư cách kết luận lớp ổn", () => {
    // Bỏ khẳng định "câu chữ phải nêu TÊN nguồn" (02/08/2026): tên nguồn là tên bảng dữ
    // liệu, cô giáo không sửa được và không cần biết. Thứ PHẢI giữ là hệ quả của nó —
    // quét có nguồn bị bỏ qua thì màn hình MẤT QUYỀN kết luận "lớp ổn", dù quét tươi.
    const b = scanPresentation(scan({ degradedSources: ["attendance"] }), HOM_NAY);
    expect(b.choPhepKetLuanOn).toBe(false);
  });

  it("KHÔNG ĐỌC ĐƯỢC SỔ không bao giờ bị hạ thành 'chưa quét'", () => {
    const b = scanPresentation(
      scan({ state: "khong_doc_duoc", needsAttention: true, lastSuccessAt: null }),
      HOM_NAY,
    );
    expect(b.tone).toBe("canh-bao");
    expect(b.title).toContain("Không đọc được");
    expect(b.detail).toContain("KHÔNG có nghĩa là chưa quét");
  });

  it("mọi trạng thái đều ra một câu riêng — không trạng thái nào rơi vào câu của trạng thái khác", () => {
    const tieuDe = MOI_TRANG_THAI.map(
      (s) => scanPresentation(scan({ state: s, needsAttention: s !== "ok" }), HOM_NAY).title,
    );
    expect(new Set(tieuDe).size).toBe(MOI_TRANG_THAI.length);
    // Và không TIÊU ĐỀ nào rỗng: một câu trống đọc y hệt không có câu nào.
    for (const t of tieuDe) expect(t.trim().length).toBeGreaterThan(0);

    // `detail` thì KHÔNG còn bắt buộc (02/08/2026). Trạng thái bình thường nay chỉ có
    // đúng một dòng "Cập nhật <giờ>" và không kèm câu nào — đó là điều chủ đầu tư yêu
    // cầu, và một câu thêm vào cho đủ chỗ là đúng thứ vừa bị cắt.
    //
    // Nhưng MỌI TRẠNG THÁI BÁO ĐỘNG vẫn phải nói được thành câu: người đọc cần biết vì
    // sao màn hình mất quyền kết luận, và một cảnh báo câm còn khó hiểu hơn không có gì.
    for (const s of MOI_TRANG_THAI) {
      const b = scanPresentation(scan({ state: s, needsAttention: s !== "ok" }), HOM_NAY);
      if (b.tone === "on-dinh") continue;
      expect(b.detail.trim().length, `trạng thái ${s} chuyển tông mà không nói vì sao`).toBeGreaterThan(0);
    }
  });

  it("chỉ đúng MỘT trạng thái cho phép kết luận lớp ổn", () => {
    const duocPhep = MOI_TRANG_THAI.filter(
      (s) => scanPresentation(scan({ state: s }), HOM_NAY).choPhepKetLuanOn,
    );
    expect(duocPhep).toEqual(["ok"]);
  });
});

describe("luật bị bỏ qua phải được nói ra", () => {
  it("hai luật bị bỏ qua trên hub_dev hôm nay được kể tên kèm lý do tiếng Việt", () => {
    // Số đo thật 01/08/2026: mỗi lần quét bỏ qua C_CEFR và C_MASTERY, và trước gói đó
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

  it("nhưng KHÔNG in mã luật lên màn của cô giáo", () => {
    // ĐẢO CHIỀU khẳng định 02/08/2026. Câu cũ đòi màn hình phải kể tên luật bị bỏ qua
    // ngay cả khi mọi thứ bình thường — và đó chính là dòng chủ đầu tư chỉ vào khi mở
    // trang: "3 luật chưa được chấm: B_BEHAVIOR (nguồn dữ liệu hết tươi) · C_CEFR
    // (chưa cài đặt) · C_MASTERY (chưa khai nguồn dữ liệu)".
    //
    // `B_BEHAVIOR` / `C_CEFR` là MÃ LUẬT trong `care.rules` — từ vựng của người dựng bộ
    // quét. Cô giáo không cài đặt được luật, không khai được nguồn, và không làm gì được
    // với ba cái mã đó lúc 7 giờ sáng.
    //
    // Câu mô tả luật bị bỏ qua KHÔNG bị xoá — `moTaLuatBiBoQua()` vẫn còn và vẫn được
    // kiểm ngay phía trên. Nó chỉ thôi được in lên màn hình của cô; chỗ của nó là
    // `ops.v_rule_health` (0043), nơi người trực máy đọc.
    const b = scanPresentation(
      scan({ rulesSkipped: [{ ruleCode: "C_CEFR", lyDo: "chua_cai_dat" }] }),
      HOM_NAY,
    );
    expect(b.tone).toBe("on-dinh");
    expect(b.detail).not.toContain("C_CEFR");
  });
});

// ---------------------------------------------------------------------------
// ADR-030 — dòng phụ của ô "Em cần để ý" là chỗ nói sự thật sau khi dải bị bỏ
// ---------------------------------------------------------------------------

describe("dòng phụ ô “Em cần để ý” — số cũ không được hiện ra như số hôm nay", () => {
  it("quét tươi + 0 cờ → LÚC ĐÓ mới được nói “chưa em nào”", () => {
    expect(dongPhuEmCanDeY(scanPresentation(scan(), HOM_NAY), 0)).toBe("chưa em nào");
  });

  it("quét tươi + có cờ → nói việc phải làm hôm nay", () => {
    expect(dongPhuEmCanDeY(scanPresentation(scan(), HOM_NAY), 3)).toBe("cần xem hôm nay");
  });

  it("QUÁ HẠN + 0 cờ → không được nói “chưa em nào”, phải ghi mốc lượt quét gần nhất", () => {
    // Đây là câu ADR-030 gọi đích danh: bỏ dải cảnh báo mà để dòng phụ nguyên như cũ thì
    // "Em cần để ý: 0 — chưa em nào" thành một lời nói dối đúng vào lúc bộ quét chết.
    const b = scanPresentation(
      scan({ state: "qua_han", needsAttention: true, lastSuccessAt: gioHomQua(1, 5) }),
      HOM_NAY,
    );
    const sub = dongPhuEmCanDeY(b, 0);
    expect(sub).not.toContain("chưa em nào");
    expect(sub).toContain("lần quét");
    // GIỜ + NGÀY, đúng chữ của điều 8 sửa lời: chỉ có giờ thì "01:05" đọc ra thành sáng nay.
    expect(sub, "mốc phải có giờ").toMatch(/\d{2}:\d{2}/);
    expect(sub, "mốc của hôm khác phải kèm ngày").toMatch(/\d{2}-\d{2}/);
  });

  it("CHƯA QUÉT LẦN NÀO → nói thẳng là không có lượt quét nào, không mượn câu của ca khác", () => {
    const b = scanPresentation(
      scan({ state: "chua_chay", needsAttention: true, lastSuccessAt: null, lastFinishedAt: null }),
      HOM_NAY,
    );
    const sub = dongPhuEmCanDeY(b, 0);
    expect(sub).not.toContain("chưa em nào");
    expect(sub).toContain("chưa có lượt quét nào");
  });

  it("quét 'ok' NHƯNG của hôm qua → vẫn phải hiện mốc, vì con số là của đêm trước", () => {
    const b = scanPresentation(scan({ lastSuccessAt: gioHomQua(23, 40) }), HOM_NAY);
    const sub = dongPhuEmCanDeY(b, 0);
    expect(sub).not.toContain("chưa em nào");
    expect(sub).toMatch(/\d{2}-\d{2}/);
  });

  it("quét hôm nay nhưng THIẾU NGUỒN: số không cũ mà THIẾU — hai kiểu sai khác nhau", () => {
    // Gộp ca này vào ca "số cũ" là nói sai: lượt quét đúng là của sáng nay, chỉ có điều
    // nó không chấm hết. Câu phải khác, và tuyệt đối không được là "chưa em nào".
    const b = scanPresentation(scan({ degradedSources: ["attendance"] }), HOM_NAY);
    const sub = dongPhuEmCanDeY(b, 0);
    expect(sub).not.toContain("chưa em nào");
    expect(sub).toContain("nguồn bị bỏ qua");
  });

  it("CHỈ MỘT trạng thái quét được phép in câu “chưa em nào”", () => {
    // Cùng hình dạng với phép kiểm `choPhepKetLuanOn` ở trên, và cùng lý do: một câu
    // trấn an chỉ được in khi có phép đo của hôm nay đứng sau nó.
    const duocPhep = MOI_TRANG_THAI.filter(
      (s) => dongPhuEmCanDeY(scanPresentation(scan({ state: s }), HOM_NAY), 0) === "chưa em nào",
    );
    expect(duocPhep).toEqual(["ok"]);
  });

  it("không câu nào rỗng — dòng phụ trống đọc y hệt không có dòng nào", () => {
    for (const s of MOI_TRANG_THAI) {
      for (const soCo of [0, 4]) {
        const sub = dongPhuEmCanDeY(scanPresentation(scan({ state: s }), HOM_NAY), soCo);
        expect(sub.trim().length, `trạng thái ${s} với ${soCo} cờ cho dòng phụ rỗng`).toBeGreaterThan(0);
      }
    }
  });
});

describe("ô “hết việc” — kết luận cần cả phép đo lẫn sổ việc cũ", () => {
  const tuoi = () => scanPresentation(scan(), HOM_NAY);

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
    const chuaQuet = scanPresentation(
      scan({ state: "chua_chay", needsAttention: true, lastSuccessAt: null, lastFinishedAt: null }),
      HOM_NAY,
    );
    const look = boardEmptyPresentation(chuaQuet, 0);
    expect(look.showMascot).toBe(false);
    expect(look.title).not.toContain("ổn");
    // ĐỔI 06/08/2026: ô này nay mang CÂU RIÊNG của từng trạng thái quét, thay cho một câu
    // chung. Trước đây hai câu đó in trên dải cảnh báo và ô này cố ý không lặp lại; dải
    // đã bị bỏ (ADR-030), nên nếu ô này không nhận thì chín câu phân biệt "chưa quét lần
    // nào" với "quét hỏng" với "không đọc được sổ" không còn hiện ở đâu.
    expect(look.body).toContain("chưa chạy lần nào");
    expect(look.body).toContain("không có nghĩa là lớp ổn");
  });

  it("(c) quá hạn → không kết luận, và nói rõ số đang cũ", () => {
    const treZ = scanPresentation(
      scan({ state: "qua_han", needsAttention: true, lastSuccessAt: gioHomQua(1, 0) }),
      HOM_NAY,
    );
    const look = boardEmptyPresentation(treZ, 0);
    expect(look.showMascot).toBe(false);
    expect(look.body).toContain("số cũ");
  });

  it("MỌI trạng thái không kết luận được đều có thân bài khác rỗng", () => {
    // Ca dễ hụt nhất: `state='ok'` nhưng của hôm qua. Trạng thái đó cố ý KHÔNG có
    // `detail` (mốc thời gian đã nói đủ trên dải cũ), nên nối thẳng `detail` vào đây mà
    // không có bản dự phòng sẽ cho ra một ô "Chưa kết luận được" câm.
    const homQua = scanPresentation(scan({ lastSuccessAt: gioHomQua(23, 40) }), HOM_NAY);
    expect(boardEmptyPresentation(homQua, 0).body.trim().length).toBeGreaterThan(0);

    for (const s of MOI_TRANG_THAI) {
      const b = scanPresentation(scan({ state: s }), HOM_NAY);
      if (b.choPhepKetLuanOn) continue;
      const look = boardEmptyPresentation(b, 0);
      expect(look.body.trim().length, `trạng thái ${s} cho ô "hết việc" câm`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// ADR-030 — dải đã đi thật, và sự thật đã tới đúng chỗ mới
//
// Hai nhóm trên chỉ đo HÀM THUẦN. Bỏ dải khỏi JSX mà quên nối `dongPhuEmCanDeY` vào ô
// "Em cần để ý" thì cả hai nhóm vẫn xanh, trong khi buồng lái thật lại quay về in
// "chưa em nào" vô điều kiện — đúng thứ điều khoản này sinh ra để chặn.
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Bỏ chú thích trước khi quét — BẮT BUỘC, cùng lý do đã ghi ở a11y.test.ts: buồng lái
 * kể lại nguyên văn tên `ScanBanner` và câu "chưa em nào" trong chú thích để lần sau
 * không ai nối lại. Quét cả chú thích thì cách duy nhất làm test xanh là xoá lời giải
 * thích — test tự phá đúng thứ nó bảo vệ.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("buồng lái: dải cảnh báo đã bỏ, nghĩa vụ nói thì không", () => {
  const src = stripComments(
    readFileSync(join(repoRoot, "apps", "hub", "components", "gvcn-dashboard.tsx"), "utf8"),
  );

  it("không còn thành phần ScanBanner nào được dựng hay khai báo", () => {
    expect(src, "khối cảnh báo cũ vẫn còn trên màn").not.toMatch(/<ScanBanner\b/);
    expect(src, "component ScanBanner vẫn còn nằm chờ được nối lại").not.toMatch(
      /function ScanBanner\b/,
    );
  });

  it("ô “Em cần để ý” lấy dòng phụ từ `dongPhuEmCanDeY`, không viết chết câu nào", () => {
    const the = /<StatCard label="Em cần để ý"[\s\S]*?\/>/.exec(src)?.[0] ?? "";
    expect(the, "không tìm thấy thẻ “Em cần để ý” — phép kiểm này đang đo nhầm chỗ").not.toBe("");
    expect(the).toContain("dongPhuEmCanDeY");
    // "chưa em nào" phải đến từ `scan-status.ts` sau khi đã hỏi trạng thái lượt quét.
    // Viết thẳng vào JSX là đưa nó trở lại thành câu vô điều kiện.
    expect(the, "câu trấn an viết chết trong JSX").not.toContain("chưa em nào");
  });

  it("`scan` vẫn được tính MỘT lần và truyền cho cả hai chỗ nói", () => {
    // Hai chỗ đọc hai phép tính khác nhau là cách chúng bắt đầu nói ngược nhau trên cùng
    // một màn — lý do bản 01/08 đã tính một lần rồi truyền xuống.
    expect((src.match(/scanPresentation\(/g) ?? []).length).toBe(1);
    expect(src).toMatch(/dongPhuEmCanDeY\(scan,/);
    expect(src).toMatch(/<BoardEmpty scan=\{scan\}/);
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
