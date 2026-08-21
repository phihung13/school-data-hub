// 4 màu mood — thống nhất bản giấy, KHÔNG đổi (DESIGN-GUIDELINES §3).
"use client";

import type { MoodValue } from "@hub/core/contracts";
import { MOOD_LABEL } from "@hub/core/contracts";

const MOOD_STYLE: Record<MoodValue, { gradient: string; icon: string; text: string; shadow: string }> = {
  4: { gradient: "from-mood-happy to-mood-happyDark", icon: "sentiment_very_satisfied", text: "text-white", shadow: "shadow-[0_8px_18px_rgba(0,168,94,.32)]" },
  3: { gradient: "from-mood-normal to-mood-normalDark", icon: "sentiment_neutral", text: "text-white", shadow: "shadow-[0_8px_18px_rgba(44,123,242,.32)]" },
  2: { gradient: "from-mood-tired to-mood-tiredDark", icon: "sentiment_dissatisfied", text: "text-gold-text", shadow: "shadow-[0_8px_18px_rgba(245,163,0,.32)]" },
  1: { gradient: "from-mood-sad to-mood-sadDark", icon: "sentiment_sad", text: "text-white", shadow: "shadow-[0_8px_18px_rgba(240,71,77,.32)]" },
};

export function MoodTile({
  mood,
  selected,
  onSelect,
  gon,
}: {
  mood: MoodValue;
  selected?: boolean;
  onSelect: (mood: MoodValue) => void;
  /**
   * Chế độ GỌN cho popup (21/08/2026): 148px → 112px.
   *
   * 148px dựng cho một TRANG chiếm trọn màn hình. Trong popup, bốn ô ấy cộng lại thành
   * 308px trên tổng ~640px của cả hộp — ở khổ iPhone 14 (vùng hiển thị thật ~660px sau
   * khi trừ thanh trạng thái và thanh Safari) thì hộp thoại chiếm gần hết màn, và cái
   * viền mờ 16px không đủ để mắt đọc ra "đây là một lớp phủ". Chủ đầu tư gọi đúng tên:
   * *"nó bị full màn"*.
   *
   * 112px vẫn vượt xa mốc chạm 44px (§11, WCAG 2.5.8) — ô vẫn là ô to nhất màn hình.
   */
  gon?: boolean;
}) {
  const style = MOOD_STYLE[mood];
  return (
    <button
      type="button"
      aria-label={MOOD_LABEL[mood]}
      // Ô cảm xúc là nút CHỌN-MỘT có trạng thái, không phải nút bấm-rồi-thôi: trước đây
      // "đang chọn" chỉ hiện bằng viền trắng — người dùng trình đọc màn hình không có
      // tín hiệu nào. aria-pressed nói đúng trạng thái đó bằng lời (WCAG 4.1.2).
      aria-pressed={selected ?? false}
      onClick={() => onSelect(mood)}
      className={`${gon ? "h-[112px]" : "h-[148px]"} rounded-[20px] bg-gradient-to-br ${style.gradient} ${style.shadow} flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 ${
        selected ? "ring-4 ring-white ring-offset-2 ring-offset-navy" : ""
      }`}
    >
      {/* aria-hidden: nội dung DOM là chữ thô "sentiment_very_satisfied", font chỉ đổi hình.
          Không ẩn thì em bấm nghe đọc "sentiment very satisfied Vui" — nhãn chữ ngay dưới
          icon đã nói đủ, và button còn có aria-label riêng. */}
      <span aria-hidden="true" className={`msr text-[44px] ${style.text}`}>{style.icon}</span>
      <span className={`text-[14px] font-black ${style.text}`}>{MOOD_LABEL[mood]}</span>
    </button>
  );
}
