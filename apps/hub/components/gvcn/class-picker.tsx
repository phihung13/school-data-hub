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
}: {
  classes: HomeroomClass[];
  selectedId: string | null;
  onSelect: (classId: string) => void;
}) {
  if (classes.length <= 1) return null;
  return (
    <div role="group" aria-label="Chọn lớp chủ nhiệm" className="flex flex-wrap items-center gap-1.5">
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
                ? "rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 py-2.5 text-[12.5px] font-black text-white shadow-[0_6px_14px_rgba(10,42,94,.24)]"
                : "rounded-xl border border-line bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-[#33507C] hover:bg-[#F5F8FC]"
            }
          >
            {c.classCode}
            <span className={`ml-1.5 text-[10.5px] font-bold ${active ? "text-[#C9DBF5]" : "text-caption"}`}>
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
