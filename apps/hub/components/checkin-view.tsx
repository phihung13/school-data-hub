// Check-in cảm xúc (P2 GĐ1) — giữ đúng trải nghiệm 20 giây: 4 ô + nút gặp thầy
// cô + offline-first. Chạm ô → màn thành công (mascot + confetti).
"use client";

import { useEffect, useRef, useState } from "react";
import type { MoodValue } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { enqueueCheckin, flushQueuedCheckins } from "@/lib/offline-queue";
import { MiniAppHeader } from "./mini-app-header";
import { MoodTile } from "./mood-tile";
import { Mascot } from "./mascot";
import { PageShell } from "./page-shell";

type ViewState = "pick" | "success";

export function CheckinView() {
  const [state, setState] = useState<ViewState>("pick");
  const [wantsHelp, setWantsHelp] = useState(false);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const submitMood = trpc.checkin.submitMood.useMutation();
  const submitRef = useRef(submitMood.mutateAsync);
  submitRef.current = submitMood.mutateAsync;

  // Gửi lại hàng đợi ngay khi có mạng — không cần em mở lại màn hình.
  useEffect(() => {
    function tryFlush() {
      void flushQueuedCheckins((input) => submitRef.current(input));
    }
    if (navigator.onLine) tryFlush();
    window.addEventListener("online", tryFlush);
    return () => window.removeEventListener("online", tryFlush);
  }, []);

  async function pick(mood: MoodValue) {
    if (!navigator.onLine) {
      await enqueueCheckin({ mood, wantsHelp });
      setQueuedOffline(true);
      setState("success");
      return;
    }
    try {
      const result = await submitMood.mutateAsync({ mood, wantsHelp });
      setStreakDays(result.streakDays);
      setQueuedOffline(false);
      setState("success");
    } catch {
      // Mạng chập chờn dù navigator báo online — vẫn không để em mất thao tác.
      await enqueueCheckin({ mood, wantsHelp });
      setQueuedOffline(true);
      setState("success");
    }
  }

  if (state === "success") {
    return (
      <PageShell bg="bg-white">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <Mascot pose="celebrate" width={72} />
          <h2 className="text-[19px] font-black text-navy">Đã ghi nhận, cảm ơn em!</h2>
          {streakDays !== null && (
            <p className="text-[13px] text-muted2">Chuỗi check-in hiện tại: {streakDays} ngày 🔥</p>
          )}
          {queuedOffline && (
            <p className="flex items-center gap-1.5 text-[11px] text-caption2">
              <span className="msr text-[14px]">cloud_off</span>
              Đang offline — đã lưu máy, tự gửi khi có mạng.
            </p>
          )}
          <a href="/home" className="mt-2 rounded-full bg-navy px-6 py-2.5 text-[13px] font-black text-white">
            Về trang chủ
          </a>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell bg="bg-white">
      <MiniAppHeader title="Check-in cảm xúc" icon="sentiment_satisfied" gradient="from-domain-attendance to-domain-attendanceDark" />
      <div className="flex flex-1 flex-col px-5 pt-5">
        <div className="text-center">
          <div className="text-[20px] font-black text-ink">Hôm nay em thấy thế nào?</div>
          <div className="mt-1.5 flex items-center justify-center gap-1">
            <span className="msr text-[13px] text-caption">lock</span>
            <span className="text-[12px] text-muted2">Chỉ thầy cô chủ nhiệm thấy</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MoodTile mood={4} onSelect={pick} />
          <MoodTile mood={3} onSelect={pick} />
          <MoodTile mood={2} onSelect={pick} />
          <MoodTile mood={1} onSelect={pick} />
        </div>

        <button
          type="button"
          onClick={() => setWantsHelp((v) => !v)}
          className={`mt-4 flex items-center justify-center gap-2 rounded-[14px] border-[1.6px] py-3 text-[13px] font-black transition-colors ${
            wantsHelp ? "border-gold bg-gold/20 text-gold-textDark" : "border-gold bg-[#FFFBEE] text-gold-textDark"
          }`}
        >
          <span className="msr text-[18px] text-[#E8940D]">waving_hand</span>
          {wantsHelp ? "Đã chọn — em cần gặp thầy cô" : "Mình cần gặp thầy cô"}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="msr text-[14px] text-caption2">cloud_off</span>
          <span className="text-[10.5px] text-caption2">Offline vẫn lưu — tự gửi sau.</span>
        </div>
      </div>
    </PageShell>
  );
}
