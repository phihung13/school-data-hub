// components/gvcn/scan-status.ts — buồng lái nói ra nó đang đứng sau phép đo nào.
//
// Vì sao file này tồn tại (gói "debt-32-buong-lai-doc-care-flags", 01/08/2026):
//
// Trước hôm nay buồng lái GVCN có ĐÚNG MỘT chỗ nói về lần quét — ô "hết việc rồi" ở
// nhánh bảng trống (`boardEmptyPresentation`). Ba câu cho ba mức chắc chắn đã viết đúng
// từ gói "trung-thuc-trang-thai", nhưng chúng chỉ hiện khi `priorityFlags.length === 0
// && pendingLateCheckins.length === 0`. Tức là: có MỘT cờ thôi thì mốc quét biến mất
// khỏi màn hình. Hệ quả đo được — một GVCN nhìn ba cờ do lần quét từ hôm kia sinh ra
// không có cách nào biết chúng cũ. Cùng màn hình đó, dải "nguồn dữ liệu chưa tươi" thì
// hiện MỌI LÚC. Trong một hệ chăm sóc trẻ em, "nguồn hết tươi" được nói ra luôn còn
// "quét lúc mấy giờ" thì không, là một sự lệch ưu tiên khó biện minh.
//
// Nay: một dải cố định ở đầu buồng lái, hiện ở mọi trạng thái, đọc từ `ScanHealth`
// (`ops.v_job_health`, migration 0041). Toàn bộ phần quyết định "nói câu gì" nằm ở đây,
// dưới dạng HÀM THUẦN, để test được mà không cần dựng React — kể cả trạng thái khó dựng
// nhất và nguy hiểm nhất: CHƯA QUÉT LẦN NÀO.
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
// Dải trạng thái ở đầu buồng lái
// ---------------------------------------------------------------------------

/**
 * Ba sắc thái, không phải chín — mỗi sắc thái là một CÂU TRẢ LỜI khác nhau cho câu hỏi
 * "tôi có được tin bảng bên dưới không":
 *
 *   `on-dinh`  — có phép đo mới, tin được. Dải mảnh, không cướp chú ý.
 *   `cho`      — đang chạy dở. Không phải tin xấu, nhưng cũng chưa phải kết luận.
 *   `canh-bao` — MỌI trường hợp còn lại. Bao gồm cả "chưa quét lần nào" và "không đọc
 *                được sổ" — hai thứ dễ bị xếp nhầm vào "chưa có gì đáng nói", trong khi
 *                chúng chính là lúc màn hình mất quyền kết luận.
 */
export type ScanTone = "on-dinh" | "cho" | "canh-bao";

export interface ScanBannerPresentation {
  state: ScanState;
  tone: ScanTone;
  icon: string;
  /** Câu chính — phải tự nó nói đủ, không dựa vào màu (cùng luật với `urgencyPresentation`). */
  title: string;
  /** Câu phụ: hệ quả với người đang đọc. Luôn có, kể cả khi mọi thứ bình thường. */
  detail: string;
  /**
   * Buồng lái có được phép in kết luận "lớp mình đang ổn" khi bảng trống không.
   * Chỉ đúng ở MỘT ca: quét xong, thành công, và xong TRONG NGÀY đang xem.
   */
  choPhepKetLuanOn: boolean;
  boxClass: string;
  titleClass: string;
  bodyClass: string;
}

const TONE_CLASS: Record<ScanTone, { boxClass: string; titleClass: string; bodyClass: string }> = {
  "on-dinh": {
    boxClass: "border border-[#DCE6DE] bg-[#F2F8F3]",
    titleClass: "text-[#00693F]",
    bodyClass: "text-[#4A5B4D]",
  },
  cho: {
    boxClass: "border border-[#D6DEE9] bg-[#F5F7FA]",
    titleClass: "text-[#33507C]",
    bodyClass: "text-[#4A5460]",
  },
  "canh-bao": {
    boxClass: "border-[1.5px] border-[#FFE29A] bg-[#FFF1C9]",
    titleClass: "text-gold-textDark",
    bodyClass: "text-[#8A5A00]",
  },
};

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
 * trước hôm nay KHÔNG màn hình nào nói ra. Một bảng cờ sạch khi ấy là kết quả của 4/6
 * luật, chứ không phải 6/6 — và chênh lệch đó, nếu không in ra, chính là "im lặng bị đọc
 * thành kết luận" ở mức nội dung, chứ không còn ở mức thời gian.
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
 * Từ `ScanHealth` ra một dải trạng thái.
 *
 * `asOfDate` cần thiết vì `state = 'ok'` KHÔNG đồng nghĩa "quét hôm nay": nhịp đã khai là
 * 24 giờ + dung sai 6 giờ, nên một lần quét lúc 23:40 hôm qua vẫn là `ok` với
 * `ops.v_job_health` trong khi buồng lái sáng nay đang nhìn số của đêm trước. View trả lời
 * câu hỏi của người VẬN HÀNH ("job có sống không"); dải này phải trả lời thêm câu hỏi của
 * GIÁO VIÊN ("số trên màn có phải của hôm nay không"). Hai câu hỏi khác nhau, và gộp chúng
 * là cách một trong hai bị nuốt.
 */
export function scanBannerPresentation(
  scan: ScanHealth,
  asOfDate: string,
): ScanBannerPresentation {
  const quetHomNay = isSameLocalDay(scan.lastSuccessAt, asOfDate);
  const mocQuet = scan.lastSuccessAt
    ? formatScanMoment(scan.lastSuccessAt, quetHomNay)
    : null;
  const boQua = moTaLuatBiBoQua(scan.rulesSkipped);
  const nguonHong =
    scan.degradedSources.length > 0
      ? `Nguồn bị bỏ qua trong lần quét đó: ${scan.degradedSources.join(", ")}.`
      : "";
  const nhip =
    scan.expectedEveryHours !== null
      ? `Theo sổ lịch, bộ quét phải chạy mỗi ${formatGio(scan.expectedEveryHours)}.`
      : "";

  const dung = (
    tone: ScanTone,
    icon: string,
    title: string,
    detail: string,
    choPhepKetLuanOn = false,
  ): ScanBannerPresentation => ({
    state: scan.state,
    tone,
    icon,
    title,
    detail,
    choPhepKetLuanOn,
    ...TONE_CLASS[tone],
  });

  switch (scan.state) {
    case "ok":
      // Quét xong trong hạn. Vẫn tách hai ca theo NGÀY: "chạy lúc 07:10" và "chạy lúc
      // 23:40 hôm qua" là hai mức tin cậy khác nhau với người đang dạy sáng nay.
      return quetHomNay
        ? dung(
            "on-dinh",
            "task_alt",
            `Bộ quét cờ đã chạy lúc ${mocQuet} hôm nay`,
            ghepCau("Bảng bên dưới đứng sau lần quét đó.", boQua, nguonHong),
            // Đây là ca DUY NHẤT màn hình được phép kết luận "lớp ổn" khi bảng trống.
            scan.degradedSources.length === 0,
          )
        : dung(
            "cho",
            "history",
            `Chưa có lần quét nào của hôm nay — lần gần nhất là ${mocQuet}`,
            ghepCau(
              "Bảng bên dưới là kết quả của lần quét đó, chưa phải của hôm nay.",
              boQua,
              nguonHong,
            ),
          );

    case "dang_chay":
      return dung(
        "cho",
        "hourglass_top",
        "Bộ quét cờ đang chạy",
        ghepCau(
          mocQuet
            ? `Số đang hiện là của lần quét trước (${mocQuet}); tải lại trang sau vài phút để thấy kết quả mới.`
            : "Chưa có lần quét nào xong, nên bảng bên dưới chưa có kết quả quét đứng sau.",
          boQua,
        ),
      );

    case "chua_chay":
      // TRẠNG THÁI NGUY HIỂM NHẤT, và là trạng thái dễ quên nhất khi viết test. Không có
      // dòng nào trong ops.job_runs ⇒ không có phép đo nào ⇒ màn hình KHÔNG có tư cách
      // nói lớp ổn, cũng không có tư cách doạ là đang có chuyện.
      return dung(
        "canh-bao",
        "question_mark",
        "Bộ quét cờ chưa chạy lần nào",
        ghepCau(
          "Chưa có phép đo nào đứng sau màn hình này: bảng trống KHÔNG có nghĩa lớp đang ổn, và bảng có cờ cũng không phải kết quả quét. Báo bộ phận kỹ thuật kiểm bộ chạy job (07-operations RB-02).",
          nhip,
        ),
      );

    case "qua_han":
      return dung(
        "canh-bao",
        "running_with_errors",
        mocQuet
          ? `Bộ quét cờ quá hạn — lần chạy xong gần nhất là ${mocQuet}`
          : "Bộ quét cờ quá hạn — chưa có lần chạy nào xong",
        ghepCau(
          "Buồng lái đang nhìn số cũ. Đây là mức SEV2 theo 07-operations RB-02: chạy lại tay, 30 phút không xong thì công bố với GVCN rằng hôm nay không có cờ mới.",
          nhip,
          boQua,
        ),
      );

    case "that_bai":
      return dung(
        "canh-bao",
        "error",
        "Lần quét gần nhất đã HỎNG",
        ghepCau(
          scan.lastFinishedAt
            ? `Lần chạy lúc ${formatScanMoment(scan.lastFinishedAt, isSameLocalDay(scan.lastFinishedAt, asOfDate))} kết thúc bằng lỗi.`
            : "Lần chạy gần nhất kết thúc bằng lỗi.",
          mocQuet
            ? `Số đang hiện là của lần quét thành công cuối cùng (${mocQuet}).`
            : "Chưa có lần quét thành công nào, nên bảng bên dưới không có kết quả quét đứng sau.",
          "Xem ops.job_runs để biết vì sao (07-operations RB-02).",
        ),
      );

    case "treo":
      return dung(
        "canh-bao",
        "sync_problem",
        "Bộ quét cờ đang treo",
        ghepCau(
          "Có một lần chạy mở quá lâu mà chưa đóng sổ — gần như chắc chắn tiến trình đã chết giữa chừng, không phải đang chạy.",
          mocQuet ? `Số đang hiện là của lần quét ${mocQuet}.` : "",
          nhip,
        ),
      );

    case "tat":
      return dung(
        "canh-bao",
        "toggle_off",
        "Bộ quét cờ đang bị TẮT",
        ghepCau(
          "Không ai quét cảnh báo cho lớp này cho tới khi bật lại. Bảng trống lúc này chỉ nói rằng không có ai đo, không nói rằng không có gì.",
          mocQuet ? `Lần quét cuối cùng: ${mocQuet}.` : "",
        ),
      );

    case "chua_khai":
      // Có `ops.v_job_health` nhưng KHÔNG có dòng nào cho flag_engine: sổ lịch chưa biết
      // job này tồn tại (database chạy 0041 mà thiếu 0039). Khác "chưa chạy" ở chỗ không
      // có nhịp nào để quá hạn — nên không được mượn câu cảnh báo quá hạn cho ca này.
      return dung(
        "canh-bao",
        "help_center",
        "Hệ thống chưa khai bộ quét cờ trong sổ lịch",
        "Không có dòng lịch nào cho bộ quét cờ, nên không có gì để theo dõi là nó chạy hay không. Đây là lỗi cài đặt máy chủ, không phải tình trạng của lớp.",
      );

    case "khong_doc_duoc":
    default:
      // Đọc sổ thất bại. KHÔNG được hạ xuống thành "chưa quét": nói sai theo hướng trấn
      // an là hướng nguy hiểm nhất, còn nói sai theo hướng "tôi không biết" thì cùng lắm
      // là một cuộc gọi cho bộ phận kỹ thuật.
      return dung(
        "canh-bao",
        "cloud_off",
        "Không đọc được sổ nhật ký bộ quét",
        "Màn hình không biết bộ quét có chạy hay không — đây KHÔNG có nghĩa là chưa quét. Mọi kết luận từ bảng bên dưới đều chưa có chỗ dựa cho tới khi đọc lại được.",
      );
  }
}

/** "24 giờ" · "1,5 giờ" — không làm tròn thành 0 giờ với các nhịp ngắn. */
function formatGio(gio: number): string {
  const lam = Math.round(gio * 10) / 10;
  return `${Number.isInteger(lam) ? lam : lam.toFixed(1).replace(".", ",")} giờ`;
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
 *      nguồn nào bị bỏ qua. Bốn vế đó do `scanBannerPresentation` chốt, không lặp lại ở đây.
 *   2. `openCareCases === 0` — thêm 01/08/2026. Đo trên hub_dev: lớp 6A2 có một hồ sơ
 *      chăm sóc ĐANG MỞ (em Trần Thị Bình) và 0 cờ hôm nay, nên màn hình in "Hết việc rồi
 *      — lớp mình đang ổn!" ngay bên cạnh ô "1 hồ sơ chăm sóc đang mở". Một lớp còn hồ sơ
 *      chăm sóc mở thì không có tư cách nhận câu đó: cờ hết nghĩa là hôm nay không có tín
 *      hiệu MỚI, không nghĩa là việc cũ đã xong.
 *
 * Không có điều kiện nào ở đây nhắc lại mốc thời gian: dải trạng thái phía trên đã nói,
 * và nói hai lần bằng hai công thức là cách hai câu bắt đầu mâu thuẫn.
 */
export function boardEmptyPresentation(
  scan: ScanBannerPresentation,
  openCareCases: number,
): BoardEmptyPresentation {
  if (scan.choPhepKetLuanOn && openCareCases === 0) {
    return {
      showMascot: true,
      icon: null,
      title: "Hết việc rồi — lớp mình đang ổn!",
      body: "Bộ quét đã chạy hôm nay, không thấy tín hiệu nào cần xử lý, và lớp không còn hồ sơ chăm sóc nào đang mở — đây là trạng thái tốt thật sự, không phải thiếu dữ liệu.",
      boxClass: "border-2 border-dashed border-[#C9D8CB] bg-[#F2F8F3]",
      titleClass: "text-[#00693F]",
      bodyClass: "text-[#4A5B4D]",
    };
  }

  if (scan.choPhepKetLuanOn) {
    // Quét tươi, không cờ mới — nhưng còn việc cũ chưa đóng. Nói đúng chừng đó.
    return {
      showMascot: false,
      icon: "folder_open",
      title: "Hôm nay không có cờ mới",
      body: `Bộ quét đã chạy hôm nay và không thấy tín hiệu mới. Nhưng lớp còn ${openCareCases} hồ sơ chăm sóc đang mở — việc cũ chưa đóng, không phải hết việc.`,
      boxClass: "border-2 border-dashed border-[#D6DEE9] bg-[#F5F7FA]",
      titleClass: "text-[#33507C]",
      bodyClass: "text-[#4A5460]",
    };
  }

  // Mọi trạng thái quét còn lại: KHÔNG kết luận. Dải phía trên đã nói vì sao, nên ở đây
  // chỉ cần nói rõ chỗ trống này không mang thông tin — và cố ý KHÔNG lặp lại lý do, để
  // người đọc ngước lên đúng một chỗ duy nhất có sự thật về lần quét.
  return {
    showMascot: false,
    icon: "question_mark",
    title: "Chỗ trống này chưa nói được điều gì",
    body: ghepCau(
      "Không có cờ nào để hiện, nhưng lần quét gần nhất không đủ tư cách để kết luận (xem dòng trạng thái ở đầu trang): không có nghĩa lớp đang ổn, cũng không có nghĩa đang có chuyện.",
      openCareCases > 0 ? `Lớp còn ${openCareCases} hồ sơ chăm sóc đang mở.` : "",
    ),
    boxClass: "border-2 border-dashed border-[#D6DEE9] bg-[#F5F7FA]",
    titleClass: "text-[#33507C]",
    bodyClass: "text-[#4A5460]",
  };
}
