// apps/hub/components/gvcn/class-picker.tsx — chọn lớp cho bốn màn hình GVCN.
//
// Vì sao không mặc định "lớp đầu tiên" rồi thôi: một giáo viên chủ nhiệm hai lớp là
// chuyện bình thường ở trường liên cấp. Màn hình chỉ hiện lớp đầu tiên mà không nói gì
// thì cô mở "Điểm danh lớp" và điểm danh nhầm lớp — dữ liệu sai mà trông như thật.
//
// Khi chỉ có MỘT lớp thì bộ chọn tự ẩn: một nút bấm không có lựa chọn nào khác là rác
// thị giác, không phải tính năng.
"use client";

import { useState } from "react";
import type { HomeroomClass } from "@hub/core/contracts";

export function ClassPicker({
  classes,
  selectedId,
  onSelect,
  nhomLabel = "Chọn lớp chủ nhiệm",
}: {
  classes: HomeroomClass[];
  selectedId: string | null;
  onSelect: (classId: string) => void;
  /**
   * Nhãn của cả nhóm nút, cho trình đọc màn hình. Mặc định là câu của GVCN vì bốn màn
   * đầu tiên dùng bộ chọn này đều là màn chủ nhiệm.
   *
   * Vì sao phải đổi được (06/08/2026): màn "Lớp tôi dạy" của giáo viên bộ môn dùng chung
   * bộ chọn này, và ở đó không lớp nào là "lớp chủ nhiệm". Nhãn cho tai nói sai vai thì
   * người dùng trình đọc màn hình nghe một câu mâu thuẫn với chính tiêu đề trang.
   */
  nhomLabel?: string;
}) {
  if (classes.length <= 1) return null;
  return (
    <div role="group" aria-label={nhomLabel} className="flex flex-wrap items-center gap-1.5">
      {classes.map((c) => {
        const active = c.classId === selectedId;
        return (
          <button
            key={c.classId}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(c.classId)}
            className={
              active
                ? "min-h-[44px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 py-2.5 text-[12.5px] font-black text-white shadow-[0_6px_14px_rgba(10,42,94,.24)]"
                : "min-h-[44px] rounded-xl border border-line bg-card px-4 py-2.5 text-[12.5px] font-extrabold text-cardtitle2 hover:bg-chip"
            }
          >
            {c.classCode}
            {/* #C9DBF5 → #DCE7F7 (05/08/2026). Nền là gradient navy → navy-light, nên phép
                đo phải chạy trên đầu SÁNG của nó (#1E5FB8): mã cũ chỉ đạt 4,41:1, dưới
                ngưỡng 4,5:1 của §11. Mã mới đạt 4,97:1 trên chính đầu sáng đó.
                Con số này không phải chuyện trang trí: nó là SĨ SỐ của lớp đang chọn —
                thứ cô đối chiếu để biết mình đang mở đúng lớp. */}
            <span className={`ml-1.5 text-[10.5px] font-bold ${active ? "text-[#DCE7F7]" : "text-muted"}`}>
              {c.studentCount} em
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Lớp đang xem = lớp người dùng vừa chọn, hoặc lớp đầu tiên khi chưa chọn gì.
 *
 * Trả `classId = null` khi danh sách lớp CHƯA tải xong — chỗ gọi phải để `enabled: false`
 * cho query phụ thuộc, chứ không được gửi `undefined` rồi mặc máy chủ tự chọn hộ: hai
 * lần tải sẽ hỏi hai lớp khác nhau và giao diện nhấp nháy đổi lớp trước mắt giáo viên.
 */
export function useSelectedClass(classes: HomeroomClass[] | undefined) {
  const [picked, setPicked] = useState<string | null>(null);
  const known = classes?.some((c) => c.classId === picked) ?? false;
  const classId = known ? picked : (classes?.[0]?.classId ?? null);
  const classCode = classes?.find((c) => c.classId === classId)?.classCode ?? null;
  return { classId, classCode, select: setPicked };
}
