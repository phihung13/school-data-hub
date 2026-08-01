// apps/hub/components/gvcn/status-badge.tsx — huy hiệu trạng thái điểm danh và chấm
// tâm trạng, dùng chung cho bốn màn GVCN.
//
// Quyết định thiết kế đã chốt (31/07/2026): GIỮ viên màu làm tín hiệu lớn nhất, THÊM
// chữ và icon để phân mục. Màu một mình không được mang nghĩa — §11 tiếp cận của
// DESIGN-GUIDELINES: khoảng 1/12 nam giới không phân biệt được đỏ với xanh lá, và
// "vắng" với "có mặt" là đúng cặp màu đó.
"use client";

import { ATTENDANCE_STATUS_LABEL, MOOD_LABEL } from "@hub/core/contracts";
import type { AttendanceStatus, MoodValue } from "@hub/core/contracts";

type Tone = { bg: string; fg: string; icon: string };

/** Màu lấy nguyên từ DESIGN.md — không tự chế thêm màu ở component. */
const STATUS_TONE: Record<AttendanceStatus, Tone> = {
  present: { bg: "bg-[#E3F8ED]", fg: "text-[#00693F]", icon: "how_to_reg" },
  late: { bg: "bg-[#FFF1C9]", fg: "text-gold-textDark", icon: "schedule" },
  absent: { bg: "bg-[#FFF0F0]", fg: "text-[#C0272D]", icon: "person_off" },
  excused: { bg: "bg-[#E2F0FC]", fg: "text-[#1D4E8F]", icon: "event_available" },
  queued_late: { bg: "bg-[#FFF1C9]", fg: "text-gold-textDark", icon: "hourglass_top" },
};

const UNKNOWN_TONE: Tone = { bg: "bg-chip", fg: "text-[#5B6B80]", icon: "remove" };

export function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  const tone = status ? STATUS_TONE[status] : UNKNOWN_TONE;
  // `null` KHÔNG được hiển thị là "Vắng": chưa có dòng điểm danh nghĩa là chưa ai ghi
  // gì cả, không phải là em không đến (Rev F điều 8 — không suy kết luận từ im lặng).
  const label = status ? ATTENDANCE_STATUS_LABEL[status] : "Chưa điểm danh";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black ${tone.bg} ${tone.fg}`}
    >
      <span className="msr text-[14px]" aria-hidden>
        {tone.icon}
      </span>
      {label}
    </span>
  );
}

const MOOD_TONE: Record<MoodValue, { dot: string; fg: string }> = {
  4: { dot: "bg-[#00C96F]", fg: "text-[#00693F]" },
  3: { dot: "bg-[#2C7BF2]", fg: "text-[#1D4E8F]" },
  2: { dot: "bg-[#F5A300]", fg: "text-gold-textDark" },
  1: { dot: "bg-[#F0474D]", fg: "text-[#C0272D]" },
};

/** Bốn màu tâm trạng là ràng buộc cứng (thống nhất với bản giấy dùng trong lớp). */
export function MoodChip({ mood }: { mood: MoodValue | null }) {
  if (mood === null) return <span className="text-[11.5px] text-muted">—</span>;
  const tone = MOOD_TONE[mood];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold ${tone.fg}`}>
      <span className={`h-2.5 w-2.5 flex-none rounded-full ${tone.dot}`} aria-hidden />
      {MOOD_LABEL[mood]}
    </span>
  );
}
