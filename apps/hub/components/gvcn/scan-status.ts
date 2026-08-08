// components/gvcn/scan-status.ts — buồng lái nói ra nó đang đứng sau phép đo nào.
//
// Vì sao file này tồn tại (gói "debt-32-buong-lai-doc-care-flags", 01/08/2026):
//
// Trước hôm đó buồng lái GVCN có ĐÚNG MỘT chỗ nói về lần quét — ô "hết việc rồi" ở
// nhánh bảng trống (`boardEmptyPresentation`). Ba câu cho ba mức chắc chắn đã viết đúng
// từ gói "trung-thuc-trang-thai", nhưng chúng chỉ hiện khi `priorityFlags.length === 0
// && pendingLateCheckins.length === 0`. Tức là: có MỘT cờ thôi thì mốc quét biến mất
// khỏi màn hình, và một GVCN nhìn ba cờ do lần quét từ hôm kia sinh ra không có cách
// nào biết chúng cũ.
//
// ĐỔI CHỖ NÓI, KHÔNG BỎ NGHĨA VỤ NÓI (06/08/2026, ADR-030 + RULES.md Rev F điều 8 sửa
// lời). Lời giải hôm 01/08 là một DẢI CẢNH BÁO cố định ở đầu trang. Chủ đầu tư yêu cầu
// bỏ dải đó: nó chiếm cả một hàng ngang phía trên năm ô số, trong khi thứ nó cảnh báo
// chỉ ảnh hưởng ĐÚNG MỘT ô — ô "Em cần để ý", vì chỉ con số đó sinh ra từ lượt quét.
//
// Điều 8 nay đọc là: **ô số nào phụ thuộc lượt quét thì chính ô đó phải nói ra mình
// đang là số cũ**. Nên ba đường ra của file này, sau khi dải biến mất:
//
//   · `dongPhuEmCanDeY()` — dòng phụ của ô "Em cần để ý". HIỆN MỌI LÚC, cùng chỗ với
//     con số nó đang nói về. Đây là chỗ thay thế trực tiếp cho dải cũ.
//   · `boardEmptyPresentation()` — ô "hết việc", nay mang luôn CÂU của từng trạng thái
//     quét (`title`/`detail`). Trước 06/08 hai câu đó in trên dải và ô này cố ý không
//     lặp lại; bỏ dải mà không chuyển câu đi đâu là để chín trạng thái quét mất tiếng.
//   · `choPhepKetLuanOn` — cổng cho câu kết luận "lớp mình đang ổn".
//
// Phần cốt lõi KHÔNG đổi một chữ: cấm để một con số cũ hiện ra như số hôm nay.
//
// KHÔNG có con số ngưỡng nào trong file này (mệnh lệnh 7 / §6). "Trễ bao lâu thì gọi là
// quá hạn" đã khai trong `ops.job_schedule` (`expected_every` + `grace`) và được
// `ops.v_job_health` tính thành `state`; ở đây chỉ dịch `state` sang tiếng người. Viết
// lại "26 giờ" trong TypeScript là dựng bản thứ hai của cùng một luật, đúng cái bẫy mà
// `care-thresholds.ts` đã gỡ cho ngưỡng cảm xúc.
import type { ScanHealth, ScanState } from "@hub/core/contracts";

// ---------------------------------------------------------------------------
// Mốc thời gian, dạng người đọc được
// ---------------------------------------------------------------------------

/** Cùng ngày thì chỉ cần giờ; khác ngày BẮT BUỘC có ngày — "lúc 23:40" không nói được gì. */
export function formatScanMoment(lastScanAt: string, sameDay: boolean): string {
  const at = new Date(lastScanAt);
  if (Number.isNaN(at.getTime())) return "không rõ";
  return sameDay
    ? at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : at.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** `asOfDate` là ngày địa phương do MÁY CHỦ chốt (GetDashboardOutput.asOfDate). */
export function isSameLocalDay(iso: string | null | undefined, asOfDate: string): boolean {
  if (!iso) return false;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  // Tự ghép thay vì toISOString(): toISOString() đổi sang UTC, nên 00:30 giờ Việt Nam
  // thành ngày hôm trước và mốc quét vừa chạy xong bị đọc thành "hôm qua".
  const y = at.getFullYear();
  const m = `${at.getMonth() + 1}`.padStart(2, "0");
  const d = `${at.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}` === asOfDate;
}

// ---------------------------------------------------------------------------
// Trạng thái lượt quét, đã dịch sang tiếng người
// ---------------------------------------------------------------------------

/**
 * Ba sắc thái, không phải chín — mỗi sắc thái là một CÂU TRẢ LỜI khác nhau cho câu hỏi
 * "tôi có được tin bảng bên dưới không":
 *
 *   `on-dinh`  — có phép đo của hôm nay, tin được.
 *   `cho`      — đang chạy dở, hoặc phép đo mới nhất là của hôm khác. Không phải tin
 *                xấu, nhưng cũng chưa phải kết luận của hôm nay.
 *   `canh-bao` — MỌI trường hợp còn lại. Bao gồm cả "chưa quét lần nào" và "không đọc
 *                được sổ" — hai thứ dễ bị xếp nhầm vào "chưa có gì đáng nói", trong khi
 *                chúng chính là lúc màn hình mất quyền kết luận.
 */
export type ScanTone = "on-dinh" | "cho" | "canh-bao";

/**
 * Tên cũ là `ScanBannerPresentation`. Đổi 06/08/2026 cùng ADR-030: dải cảnh báo không
 * còn tồn tại, mà một kiểu mang chữ "Banner" trong tên là cách lần sửa sau đi tìm một
 * thành phần không có thật. Đây là TRẠNG THÁI LƯỢT QUÉT đã dịch sang tiếng người, còn
 * vẽ nó ở đâu là việc của nơi gọi.
 */
export interface ScanPresentation {
  state: ScanState;
  tone: ScanTone;
  /**
   * Mốc lần chạy XONG THÀNH CÔNG gần nhất, đã định dạng: "08:19" nếu cùng ngày đang
   * xem, "23:40 31-07" nếu khác ngày. `null` khi chưa lần quét nào xong — và `null` ở
   * đây KHÔNG được rơi về một chuỗi rỗng ở nơi gọi: "không có mốc nào" là một câu phải
   * nói ra, không phải một chỗ trống.
   */
  mocQuet: string | null;
  /** Câu chính — phải tự nó nói đủ, không dựa vào màu (cùng luật với `urgencyPresentation`). */
  title: string;
  /** Câu phụ: hệ quả với người đang đọc. Rỗng ở ca bình thường, khác rỗng ở mọi ca báo động. */
  detail: string;
  /**
   * Buồng lái có được phép in kết luận "lớp mình đang ổn" khi bảng trống không.
   * Chỉ đúng ở MỘT ca: quét xong, thành công, xong TRONG NGÀY đang xem, và không nguồn
   * nào bị bỏ qua.
   */
  choPhepKetLuanOn: boolean;
}

/** Lý do bỏ qua luật, do `care.run_flag_engine` sinh → câu tiếng Việt cho người trực. */
const LY_DO_LABEL: Record<string, string> = {
  chua_cai_dat: "chưa cài đặt",
  chua_khai_nguon_tuoi: "chưa khai nguồn dữ liệu",
  khong_co_nguong_dang_bat: "không có ngưỡng đang bật",
  nguon_het_tuoi: "nguồn dữ liệu hết tươi",
};

/**
 * Câu phụ về những luật KHÔNG được chấm trong lần quét vừa rồi.
 *
 * Đo trên hub_dev 01/08/2026: mỗi lần quét bỏ qua hai luật (`C_CEFR`, `C_MASTERY`) và
 * trước gói đó KHÔNG màn hình nào nói ra. Một bảng cờ sạch khi ấy là kết quả của 4/6
 * luật, chứ không phải 6/6.
 *
 * Câu này KHÔNG in lên màn của cô giáo (mã luật là từ vựng của người dựng bộ quét, cô
 * không làm gì được với nó lúc 7 giờ sáng) — chỗ của nó là `ops.v_rule_health` (0043).
 * Giữ hàm ở đây vì nó là bản dịch duy nhất từ mã lý do sang tiếng Việt, và màn hình
 * người trực đọc nó.
 */
export function moTaLuatBiBoQua(rulesSkipped: ScanHealth["rulesSkipped"]): string {
  if (rulesSkipped.length === 0) return "";
  const chiTiet = rulesSkipped
    .map((r) => `${r.ruleCode} (${LY_DO_LABEL[r.lyDo] ?? r.lyDo})`)
    .join(" · ");
  return `${rulesSkipped.length} luật chưa được chấm: ${chiTiet}.`;
}

function ghepCau(...phan: string[]): string {
  return phan.filter((p) => p.trim() !== "").join(" ");
}

/**
 * Từ `ScanHealth` ra trạng thái lượt quét, đã thành câu.
 *
 * `asOfDate` cần thiết vì `state = 'ok'` KHÔNG đồng nghĩa "quét hôm nay": nhịp đã khai là
 * 24 giờ + dung sai 6 giờ, nên một lần quét lúc 23:40 hôm qua vẫn là `ok` với
 * `ops.v_job_health` trong khi buồng lái sáng nay đang nhìn số của đêm trước. View trả lời
 * câu hỏi của người VẬN HÀNH ("job có sống không"); hàm này phải trả lời thêm câu hỏi của
 * GIÁO VIÊN ("số trên màn có phải của hôm nay không"). Hai câu hỏi khác nhau, và gộp chúng
 * là cách một trong hai bị nuốt.
 */
export function scanPresentation(scan: ScanHealth, asOfDate: string): ScanPresentation {
  const quetHomNay = isSameLocalDay(scan.lastSuccessAt, asOfDate);
  const mocQuet = scan.lastSuccessAt
    ? formatScanMoment(scan.lastSuccessAt, quetHomNay)
    : null;

  const dung = (
    tone: ScanTone,
    title: string,
    detail: string,
    choPhepKetLuanOn = false,
  ): ScanPresentation => ({ state: scan.state, tone, mocQuet, title, detail, choPhepKetLuanOn });

  switch (scan.state) {
    case "ok":
      // Quét xong trong hạn. Vẫn tách hai ca theo NGÀY: "chạy lúc 07:10" và "chạy lúc
      // 23:40 hôm qua" là hai mức tin cậy khác nhau với người đang dạy sáng nay.
      // CẮT NGẮN 02/08/2026 theo yêu cầu chủ đầu tư: "toàn chữ thừa thãi… chỉ cần ghi
      // cập nhật lúc mấy h là được".
      //
      // Cái gì CẮT: đoạn văn kể lần quét bỏ qua luật nào, nguồn nào hết tươi, nhịp chạy
      // theo sổ lịch. Ba câu đó nói về SỨC KHOẺ CỦA MÁY, và người đọc màn này là cô giáo
      // lúc 7 giờ sáng — máy hỏng là việc của người trực (`ops.v_job_health` đã bật đèn
      // ở đúng chỗ đó, không cần bật lại trên mặt cô).
      //
      // Cái gì GIỮ, và không thương lượng: MỐC THỜI GIAN. Nó là thứ duy nhất phân biệt
      // "bảng này của sáng nay" với "bảng này của hôm kia". Ngày hiện kèm giờ khi lần
      // quét KHÔNG phải hôm nay, nên "cũ" đọc ra được mà không cần câu giải thích nào.
      return quetHomNay
        ? dung("on-dinh", `Cập nhật ${mocQuet}`, "", scan.degradedSources.length === 0)
        : dung("cho", `Cập nhật ${mocQuet}`, "");

    case "dang_chay":
      return dung(
        "cho",
        "Bộ quét cờ đang chạy",
        mocQuet
          ? `Số đang hiện là của lần quét ${mocQuet}. Tải lại sau vài phút.`
          : "Chưa có lần quét nào xong.",
      );

    case "chua_chay":
      // TRẠNG THÁI NGUY HIỂM NHẤT, và là trạng thái dễ quên nhất khi viết test. Không có
      // dòng nào trong ops.job_runs ⇒ không có phép đo nào ⇒ màn hình KHÔNG có tư cách
      // nói lớp ổn, cũng không có tư cách doạ là đang có chuyện.
      return dung(
        "canh-bao",
        "Bộ quét cờ chưa chạy lần nào",
        // Trạng thái báo động thì GIỮ LẠI một câu — cắt cả câu này là biến một màn hình
        // không có phép đo nào thành một màn hình trông như bình thường. Nhưng chỉ một
        // câu, và là câu nói với CÔ GIÁO, không phải với người trực máy.
        // RÚT NGẮN 06/08/2026: vế "Bảng bên dưới chưa có phép đo nào đứng sau" nói lại
        // bằng chữ đúng cái mà tiêu đề ngay trên ("Bộ quét cờ chưa chạy lần nào") đã nói.
        "Trống không có nghĩa là lớp ổn.",
      );

    case "qua_han":
      return dung(
        "canh-bao",
        mocQuet
          ? `Bộ quét cờ quá hạn — lần chạy xong gần nhất là ${mocQuet}`
          : "Bộ quét cờ quá hạn — chưa có lần chạy nào xong",
        "Số đang hiện là số cũ. Hôm nay chưa có cờ mới.",
      );

    case "that_bai":
      return dung(
        "canh-bao",
        "Lần quét gần nhất đã HỎNG",
        mocQuet
          ? `Số đang hiện là của lần quét ${mocQuet}.`
          : "Chưa có lần quét nào xong.",
      );

    case "treo":
      return dung(
        "canh-bao",
        "Bộ quét cờ đang treo",
        mocQuet ? `Số đang hiện là của lần quét ${mocQuet}.` : "Chưa có lần quét nào xong.",
      );

    case "tat":
      return dung(
        "canh-bao",
        "Bộ quét cờ đang bị TẮT",
        // RÚT NGẮN 06/08/2026: vế hai của câu cũ ("Bảng trống lúc này chỉ nói rằng không
        // có ai đo…") là cách nói vòng của đúng một ý — trống ≠ lớp ổn. Dùng lại nguyên
        // văn câu ngắn đã chốt ở nhánh `chua_chay` để hai trạng thái nói cùng một thứ
        // tiếng, thay vì hai bản diễn đạt của cùng một luật.
        ghepCau(
          "Không ai quét cho tới khi bật lại — trống không có nghĩa là lớp ổn.",
          mocQuet ? `Lần quét cuối: ${mocQuet}.` : "",
        ),
      );

    case "chua_khai":
      // Có `ops.v_job_health` nhưng KHÔNG có dòng nào cho flag_engine: sổ lịch chưa biết
      // job này tồn tại (database chạy 0041 mà thiếu 0039). Khác "chưa chạy" ở chỗ không
      // có nhịp nào để quá hạn — nên không được mượn câu cảnh báo quá hạn cho ca này.
      return dung(
        "canh-bao",
        "Hệ thống chưa khai bộ quét cờ trong sổ lịch",
        // RÚT NGẮN 06/08/2026: bỏ vế lặp lại tiêu đề. Giữ ĐÚNG mệnh đề mà tiêu đề không
        // nói được — đây là lỗi của MÁY CHỦ, không phải tình trạng của lớp.
        "Lỗi cài đặt máy chủ, không phải tình trạng của lớp.",
      );

    case "khong_doc_duoc":
    default:
      // Đọc sổ thất bại. KHÔNG được hạ xuống thành "chưa quét": nói sai theo hướng trấn
      // an là hướng nguy hiểm nhất, còn nói sai theo hướng "tôi không biết" thì cùng lắm
      // là một cuộc gọi cho bộ phận kỹ thuật.
      return dung(
        "canh-bao",
        "Không đọc được sổ nhật ký bộ quét",
        // RÚT NGẮN 06/08/2026: vế ba ("Mọi kết luận… chưa có chỗ dựa") là hệ quả đã được
        // chính `choPhepKetLuanOn = false` thi hành trên màn — nó không in kết luận nào
        // nữa. Giữ vế KHÔNG được bỏ: "không đọc được" tuyệt đối không được hạ thành
        // "chưa quét" trong đầu người đọc.
        "KHÔNG có nghĩa là chưa quét — chỉ là chưa đọc được sổ.",
      );
  }
}

// ---------------------------------------------------------------------------
// Dòng phụ của ô "Em cần để ý" — chỗ nói sự thật sau khi dải cảnh báo bị bỏ
// ---------------------------------------------------------------------------

/**
 * Câu 11px nằm ngay dưới con số của ô "Em cần để ý" (ADR-030 · Rev F điều 8).
 *
 * Vì sao ĐÚNG ô này chứ không phải năm ô: bốn ô còn lại (đã check-in, chờ xác nhận,
 * vắng, chưa điểm danh) đếm thẳng từ `attendance.checkins` trong chính lượt gọi — chúng
 * tươi bằng lúc mở trang. Chỉ ô "Em cần để ý" đếm cờ do BỘ QUÉT sinh ra, nên chỉ nó có
 * thể là số của hôm kia mà trông như số của sáng nay.
 *
 * Câu cũ ở đây là "chưa em nào" khi con số bằng 0 — và đó chính là câu ADR-030 gọi tên:
 * đúng lúc bộ quét chết thì "0 — chưa em nào" là một lời nói dối, vì không ai đếm cả.
 * Ba nhánh dưới đây, theo đúng thứ tự chắc chắn giảm dần:
 *
 *   1. có phép đo của hôm nay và đủ nguồn → được phép nói về LỚP.
 *   2. quét hôm nay nhưng thiếu nguồn → con số không cũ, nhưng có thể THIẾU. Đây là
 *      hai kiểu sai khác nhau và không được gộp vào một câu.
 *   3. còn lại → nói mốc của lượt quét gần nhất. Không mốc nào thì nói thẳng là không có.
 */
export function dongPhuEmCanDeY(scan: ScanPresentation, flagCount: number): string {
  if (scan.choPhepKetLuanOn) return flagCount > 0 ? "cần xem hôm nay" : "chưa em nào";
  if (scan.tone === "on-dinh") return "quét hôm nay, có nguồn bị bỏ qua";
  return scan.mocQuet ? `số của lần quét ${scan.mocQuet}` : "chưa có lượt quét nào xong";
}

// ---------------------------------------------------------------------------
// Ô "không còn việc nào" của buồng lái
// ---------------------------------------------------------------------------

export interface BoardEmptyPresentation {
  /** Mascot ăn mừng CHỈ dành cho kết quả đo thật của hôm nay. */
  showMascot: boolean;
  icon: string | null;
  title: string;
  body: string;
  boxClass: string;
  titleClass: string;
  bodyClass: string;
}

/**
 * Câu "lớp mình đang ổn" là một KẾT LUẬN, và một kết luận chỉ được in ra khi có phép đo
 * đứng sau nó. HAI điều kiện, cả hai đều đo được:
 *
 *   1. `scan.choPhepKetLuanOn` — quét XONG, THÀNH CÔNG, TRONG NGÀY đang xem, và không
 *      nguồn nào bị bỏ qua. Bốn vế đó do `scanPresentation` chốt, không lặp lại ở đây.
 *   2. `openCareCases === 0` — thêm 01/08/2026. Đo trên hub_dev: lớp 6A2 có một hồ sơ
 *      chăm sóc ĐANG MỞ (em Trần Thị Bình) và 0 cờ hôm nay, nên màn hình in "Hết việc rồi
 *      — lớp mình đang ổn!" ngay bên cạnh ô "1 hồ sơ chăm sóc đang mở". Một lớp còn hồ sơ
 *      chăm sóc mở thì không có tư cách nhận câu đó: cờ hết nghĩa là hôm nay không có tín
 *      hiệu MỚI, không nghĩa là việc cũ đã xong.
 */
export function boardEmptyPresentation(
  scan: ScanPresentation,
  openCareCases: number,
): BoardEmptyPresentation {
  if (scan.choPhepKetLuanOn && openCareCases === 0) {
    return {
      showMascot: true,
      icon: null,
      title: "Hết việc rồi — lớp mình đang ổn!",
      // RÚT NGẮN 06/08/2026. Câu cũ dài 160 ký tự và kể lại BA điều kiện mà chính nhánh
      // `if` phía trên vừa kiểm — một bản diễn giải mã nguồn in lên mặt người dùng. Điều
      // duy nhất cô cần đọc ở đây là chữ "hôm nay": nó phân biệt kết luận này với một ô
      // trống vì chưa ai đo (mọi nhánh còn lại đã có câu riêng).
      body: "Bộ quét đã chạy hôm nay và không thấy tín hiệu nào.",
      boxClass: "border-2 border-dashed border-[#C9D8CB] bg-[#F2F8F3]",
      titleClass: "text-successText",
      bodyClass: "text-[#4A5B4D]",
    };
  }

  if (scan.choPhepKetLuanOn) {
    // Quét tươi, không cờ mới — nhưng còn việc cũ chưa đóng. Nói đúng chừng đó.
    return {
      showMascot: false,
      icon: "folder_open",
      title: "Hôm nay không có cờ mới",
      // RÚT NGẮN: vế "việc cũ chưa đóng, không phải hết việc" nói lại đúng tiêu đề ngay
      // trên nó ("Hôm nay không có cờ mới") cộng con số hồ sơ đang mở.
      body: `Quét hôm nay không có cờ mới, nhưng lớp còn ${openCareCases} hồ sơ chăm sóc đang mở.`,
      boxClass: "border-2 border-dashed border-[#D6DEE9] bg-[#F5F7FA]",
      titleClass: "text-cardtitle2",
      bodyClass: "text-[#4A5460]",
    };
  }

  // Mọi trạng thái quét còn lại: KHÔNG kết luận.
  //
  // ĐỔI 06/08/2026 (ADR-030): câu của TỪNG trạng thái quét nay in ở đây. Trước hôm nay ô
  // này cố ý không nhắc lý do, vì dải cảnh báo phía trên đã nói và hai bản của cùng một
  // sự thật là cách chúng bắt đầu mâu thuẫn. Dải đã bị bỏ, nên nếu ô này vẫn im thì chín
  // câu phân biệt "chưa quét lần nào" với "quét hỏng" với "không đọc được sổ" không còn
  // hiện ở đâu nữa — mà đó đúng là ba tình huống mà một bảng trống trông giống hệt nhau.
  //
  // Bản dự phòng cho ca `state='ok'` nhưng của hôm khác: trạng thái đó cố ý không có
  // `detail` (mốc thời gian trong `title` đã nói đủ), nên không được để `body` rỗng.
  return {
    showMascot: false,
    icon: "question_mark",
    // Tiêu đề NÓI THẲNG điều cần biết thay vì mở bài rồi mới nói: thứ cô cần là đừng đọc
    // chỗ trống này thành "lớp ổn".
    title: "Chưa kết luận được",
    body: ghepCau(
      `${scan.title}.`,
      scan.detail || "Lần quét gần nhất chưa đủ để nói lớp ổn hay không.",
      openCareCases > 0 ? `Còn ${openCareCases} hồ sơ chăm sóc đang mở.` : "",
    ),
    boxClass: "border-2 border-dashed border-[#D6DEE9] bg-[#F5F7FA]",
    titleClass: "text-cardtitle2",
    bodyClass: "text-[#4A5460]",
  };
}
