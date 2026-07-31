// Check-in cảm xúc (P2 GĐ1) — giữ đúng trải nghiệm 20 giây: 4 ô + nút gặp thầy
// cô + offline-first. Chạm ô → màn thành công (mascot + confetti).
//
// Sửa 31/07/2026 (gói "frontend-trang-thai") — THÀNH CÔNG GIẢ, MẤT DỮ LIỆU THẬT:
//
// `pick()` trước đây bọc lời gọi máy chủ trong `catch {}` RỖNG rồi trong MỌI trường
// hợp lỗi đều đẩy vào hàng đợi offline và chuyển sang màn "Đã ghi nhận, cảm ơn em!".
// Với lỗi mạng thật thì đúng. Nhưng lỗi thường gặp hơn nhiều lại là lỗi KHÔNG BAO
// GIỜ tự khỏi: phiên hết hạn (token 15 phút — Rev F điều 7), tài khoản bị khoá,
// đầu vào sai, vượt hạn mức. Với những lỗi đó, hậu quả dây chuyền là:
//   1. Em thấy màn ăn mừng → tin là đã check-in xong.
//   2. Bản ghi nằm lại IndexedDB. `flushQueuedCheckins` gặp lỗi là `break` ngay,
//      nên nó thử lại mãi, hỏng mãi, và KHÔNG BAO GIỜ dọn được hàng đợi — mọi
//      check-in sau đó xếp hàng sau nó, cũng không bao giờ tới máy chủ.
//   3. Buồng lái GVCN không thấy tín hiệu nào. Với em đang cần giúp, "im lặng"
//      bị đọc thành "em ổn" — đúng điều Rev F điều 8 của RULES.md cấm.
// Nay: chỉ xếp hàng đợi khi lỗi THẬT SỰ có thể tự khỏi khi có mạng lại; còn lại
// hiện lỗi tại chỗ, giữ nguyên lựa chọn của em để bấm gửi lại.
"use client";

import { useEffect, useRef, useState } from "react";
import type { MoodValue } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { enqueueCheckin, flushQueuedCheckins } from "@/lib/offline-queue";
import { MiniAppHeader } from "./mini-app-header";
import { MoodTile } from "./mood-tile";
import { Mascot } from "./mascot";
import { PageShell } from "./page-shell";
import { httpStatusOf, isNetworkError, MutationError } from "./ui/query-state";

type ViewState = "pick" | "success";

/**
 * Lỗi này có xứng đáng được cất vào hàng đợi offline không?
 *
 * CHỈ khi nó có thể tự khỏi lúc có mạng lại: không có phản hồi nào từ máy chủ
 * (mạng/DNS/wifi cổng đăng nhập), hoặc máy chủ trả 5xx/408/429. Mọi lỗi 4xx khác
 * (401 hết phiên, 403 không đủ quyền, 400 sai dữ liệu) sẽ hỏng y hệt ở lần thử
 * sau, nên cất vào hàng đợi chỉ là cách giấu mất thao tác của em cho thật êm.
 *
 * Thuần hàm để test được (tests/unit/checkin-failure.test.ts).
 */
export function shouldQueueOffline(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  const status = httpStatusOf(error);
  if (status === null) return true;
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

export function CheckinView() {
  const [state, setState] = useState<ViewState>("pick");
  const [wantsHelp, setWantsHelp] = useState(false);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [lastMood, setLastMood] = useState<MoodValue | null>(null);
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
    setLastMood(mood);
    setFailure(null);
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
    } catch (error) {
      if (shouldQueueOffline(error)) {
        // Mạng chập chờn dù navigator báo online — vẫn không để em mất thao tác.
        await enqueueCheckin({ mood, wantsHelp });
        setQueuedOffline(true);
        setState("success");
        return;
      }
      // Lỗi không tự khỏi: KHÔNG được báo thành công, KHÔNG được cất vào hàng đợi
      // (nó sẽ kẹt vĩnh viễn và chặn mọi check-in sau). Nói thật, giữ nguyên màn
      // chọn để em bấm lại một cái là gửi lại.
      setFailure(error);
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

        {/* Lỗi không tự khỏi — nói ra thay vì giả vờ đã ghi xong (xem đầu file). */}
        {failure != null && (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-[#FFD5D6] bg-[#FFF5F5] p-3.5 text-center">
            <MutationError error={failure} />
            <p className="text-[11.5px] leading-relaxed text-[#8A4A4C]">
              Cảm xúc của em <b>chưa</b> được gửi. Bấm lại ô em đã chọn để gửi lại nhé.
            </p>
            {lastMood !== null && (
              <button
                type="button"
                disabled={submitMood.isPending}
                onClick={() => void pick(lastMood)}
                className="rounded-full bg-navy px-5 py-2 text-[12.5px] font-black text-white disabled:opacity-50"
              >
                {submitMood.isPending ? "Đang gửi…" : "Gửi lại"}
              </button>
            )}
          </div>
        )}

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
