// apps/hub/components/gvcn/status-badge.tsx — huy hiệu trạng thái điểm danh và chấm
// tâm trạng, dùng chung cho bốn màn GVCN.
//
// Quyết định thiết kế đã chốt (31/07/2026): GIỮ viên màu làm tín hiệu lớn nhất, THÊM
// chữ và icon để phân mục. Màu một mình không được mang nghĩa — §11 tiếp cận của
// DESIGN-GUIDELINES: khoảng 1/12 nam giới không phân biệt được đỏ với xanh lá, và
// "vắng" với "có mặt" là đúng cặp màu đó.
"use client";

import {
  ATTENDANCE_STATUS_ICON,
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_UNKNOWN_ICON,
  ATTENDANCE_UNKNOWN_LABEL,
} from "@hub/core/contracts";
import type { AttendanceStatus } from "@hub/core/contracts";

/**
 * Chỉ còn MÀU ở đây; icon và chữ lấy từ contract (`ATTENDANCE_STATUS_ICON` /
 * `_LABEL`), đổi 01/08/2026. Lý do: lịch trong hồ sơ học sinh có bảng icon RIÊNG và hai
 * bảng đã trôi lệch nhau — cùng một dữ liệu, hai màn của cùng một người, hai cách vẽ.
 */
const STATUS_TONE: Record<AttendanceStatus, { bg: string; fg: string }> = {
  present: { bg: "bg-[#E3F8ED]", fg: "text-[#00693F]" },
  late: { bg: "bg-[#FFF1C9]", fg: "text-gold-textDark" },
  absent: { bg: "bg-[#FFF0F0]", fg: "text-[#C0272D]" },
  excused: { bg: "bg-[#E2F0FC]", fg: "text-[#1D4E8F]" },
  // Dùng CHUNG cặp màu với `late` — nên bắt buộc phải khác icon (hourglass_top vs
  // schedule) và khác chữ ("Gửi muộn — chờ xác nhận" vs "Đi muộn"). §11: hai trạng thái
  // khác nghĩa không được chỉ khác nhau ở màu.
  queued_late: { bg: "bg-[#FFF1C9]", fg: "text-gold-textDark" },
};

const UNKNOWN_TONE = { bg: "bg-chip", fg: "text-[#5B6B80]" };

export function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  const tone = status ? STATUS_TONE[status] : UNKNOWN_TONE;
  // `null` KHÔNG được hiển thị là "Vắng": chưa có dòng điểm danh nghĩa là chưa ai ghi
  // gì cả, không phải là em không đến (Rev F điều 8 — không suy kết luận từ im lặng).
  const label = status ? ATTENDANCE_STATUS_LABEL[status] : ATTENDANCE_UNKNOWN_LABEL;
  const icon = status ? ATTENDANCE_STATUS_ICON[status] : ATTENDANCE_UNKNOWN_ICON;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black ${tone.bg} ${tone.fg}`}
    >
      <span className="msr text-[14px]" aria-hidden>
        {icon}
      </span>
      {label}
    </span>
  );
}

/**
 * Dòng phụ dưới huy hiệu trạng thái: GIỜ THẬT, hoặc nói thẳng vì sao không có giờ ([QĐ-3]).
 *
 * Đây là chỗ [QĐ-3] hạ cánh mà không phải bịa: dữ liệu không đỡ nổi một trạng thái "đi
 * sớm" riêng (xem `ARRIVAL_BAND_UNAVAILABLE_NOTE` trong contract), nhưng nó đỡ được GIỜ
 * EM BẤM — và giờ thật để cô tự đọc thì trung thực hơn một cái nhãn hệ tự phong.
 *
 * Ba nguồn, ba câu khác nhau, KHÔNG gộp:
 *   · `app`           — em tự bấm: in giờ. Đây là ca duy nhất con số có nghĩa "lúc em bấm".
 *   · `teacher`       — cô ghi hộ: KHÔNG có giờ em bấm, và cột `occurred_at` của dòng này
 *                       mang giờ cô bấm Lưu. Máy chủ đã cắt nó về null; ở đây nói vì sao.
 *   · `offline_queue` — gửi bù khi có mạng lại: giờ máy chủ nhận, không phải giờ em chạm.
 */
export function ArrivalTime({
  status,
  checkedInAt,
  source,
}: {
  status: AttendanceStatus | null;
  checkedInAt: string | null;
  source: string | null;
}) {
  // Chưa có dòng nào: `AttendanceBadge` đã nói "Chưa điểm danh", thêm một dấu gạch nữa
  // chỉ là nhiễu.
  if (status === null) return null;
  // Vắng / có phép thì một con số giờ đứng cạnh là mâu thuẫn ngay trong một dòng.
  if (status === "absent" || status === "excused") return null;

  if (source === "app" && checkedInAt) {
    return <span className="mt-0.5 block text-[10.5px] font-semibold tabular-nums text-muted">bấm lúc {checkedInAt}</span>;
  }
  if (source === "teacher") {
    return <span className="mt-0.5 block text-[10.5px] font-semibold text-muted">thầy cô ghi hộ — không có giờ em bấm</span>;
  }
  if (source === "offline_queue") {
    return <span className="mt-0.5 block text-[10.5px] font-semibold text-muted">gửi bù khi có mạng lại</span>;
  }
  return null;
}
