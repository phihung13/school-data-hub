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
}: {
  mood: MoodValue;
  selected?: boolean;
  onSelect: (mood: MoodValue) => void;
}) {
  const style = MOOD_STYLE[mood];
  return (
    <button
      type="button"
      aria-label={MOOD_LABEL[mood]}
      onClick={() => onSelect(mood)}
      className={`h-[148px] rounded-[20px] bg-gradient-to-br ${style.gradient} ${style.shadow} flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 ${
        selected ? "ring-4 ring-white ring-offset-2 ring-offset-navy" : ""
      }`}
    >
      <span className={`msr text-[44px] ${style.text}`}>{style.icon}</span>
      <span className={`text-[14px] font-black ${style.text}`}>{MOOD_LABEL[mood]}</span>
    </button>
  );
}
