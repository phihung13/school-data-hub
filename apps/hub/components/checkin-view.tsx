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
//   2. Bản ghi nằm lại IndexedDB. `flushQueuedCheckins` hồi đó gặp lỗi là `break`
//      ngay, nên nó thử lại mãi, hỏng mãi, và KHÔNG BAO GIỜ dọn được hàng đợi —
//      mọi check-in sau đó xếp hàng sau nó, cũng không bao giờ tới máy chủ.
//      (Nút thắt cổ chai đó đã gỡ 31/07/2026 — xem `flushQueuedCheckins`.)
//   3. Buồng lái GVCN không thấy tín hiệu nào. Với em đang cần giúp, "im lặng"
//      bị đọc thành "em ổn" — đúng điều Rev F điều 8 của RULES.md cấm.
// Nay: chỉ xếp hàng đợi khi lỗi THẬT SỰ có thể tự khỏi khi có mạng lại; còn lại
// hiện lỗi tại chỗ, giữ nguyên lựa chọn của em để bấm gửi lại.
//
// Sửa 31/07/2026 (gói "checkin-trang-thai") — GHI ĐÈ TRONG IM LẶNG:
//
// Màn này KHÔNG đọc `checkin.getTodayStatus` (chỉ /home đọc), nên nó luôn mở ra
// bốn ô trắng kể cả khi máy chủ đã trả `checkedInToday=true, mood=2, 16:35`. Em
// bấm lần hai thì `submitMood` chạy `on conflict do update set mood` — tâm trạng
// cũ bị thay, và màn hình hiện ĐÚNG MỘT câu "Đã ghi nhận, cảm ơn em!" y hệt lần
// đầu. Bốn ô cạnh nhau cỡ 169×148 rất dễ chạm nhầm, nên đây không phải tình huống
// hiếm; và thứ bị ghi đè là tín hiệu mà care engine + buồng lái GVCN đọc để biết
// em có ổn không. Với lớp dữ liệu này, im lặng lúc ghi đè là im lặng đúng lúc
// không được phép im.
//
// Nay màn hình có ba trạng thái, và KHÔNG trạng thái nào đoán mò:
//   · chưa biết  → nói "đang xem hôm nay con đã check-in chưa" (giống /home), KHÔNG
//                  mở form trắng — form trắng là một lời khẳng định "em chưa ghi".
//   · đã ghi rồi → màn "đã ghi lúc HH:MM là <tâm trạng>" + nút "Đổi tâm trạng"
//                  tường minh. Không ai đổi dữ liệu của em bằng một cú chạm lỡ tay.
//   · chưa ghi   → bốn ô như cũ.
// Hỏi được trạng thái thì nói chắc; không hỏi được (mất mạng, 500) thì nói thẳng
// là chưa biết rồi VẪN cho em ghi — offline-first là lời hứa in trên màn hình, nên
// không được lấy "chưa đọc được trạng thái" làm cớ chặn em check-in.
//
// Sửa 01/08/2026 (quyết định chủ đầu tư QĐ-2) — MÀN ĂN MỪNG NUỐT LỜI CẦU CỨU:
//
// Đúng con lỗi kể ở đầu file này, nhưng ở nhánh chưa ai soi: nút "Mình cần gặp thầy
// cô" đi CHUNG chuyến với tâm trạng (`submitMood({ mood, wantsHelp })`). Khi mất
// mạng, `pick()` đẩy cả gói vào IndexedDB rồi hiện Y HỆT màn ăn mừng của lần gửi
// thành công. Với ô tâm trạng thì xếp hàng đợi là đúng — "Offline vẫn lưu — tự gửi
// sau." là lời hứa in ngay dưới bốn ô. Với nút cần gặp thì KHÔNG: QĐ-2 nói tín hiệu
// đó phải tới cô NGAY, không chờ lượt quét đêm; mà một bản ghi nằm trong IndexedDB
// thì không tới ai cả, và nó chỉ đi khi em mở lại đúng app này lúc có mạng. Em vừa
// làm việc khó nhất là mở lời, đọc "Đã ghi nhận, cảm ơn em!", và tin rằng cô đã biết.
//
// Nay hai thứ trong cùng một lần bấm được nói bằng hai câu riêng, vì chúng có hai số
// phận khác nhau: tâm trạng "đã lưu trên máy, tự gửi sau" · lời cần gặp "CHƯA gửi
// được". Màn đổi hẳn giọng khi lời cần gặp còn kẹt — không mascot ăn mừng, tiêu đề
// nói thẳng là chưa gửi được, và có đường đi thật cho em (thử lại, hoặc tìm thầy cô
// nói trực tiếp). Xem `helpSignalState` ngay dưới.
//
// Sửa 02/08/2026 (gói "hang-doi-offline-khong-tac", nợ #31) — LẦN BẤM KHÔNG ĐI TRỌN
// VẸN PHẢI CÓ CHỖ NÓI RA:
//
// Bản trước, cái gì xảy ra với hàng đợi thì chỉ hàng đợi biết. Em bấm lúc mất mạng, màn
// hình nói "Đã lưu trên máy — tự gửi khi có mạng", rồi hôm sau `flushQueuedCheckins` gửi
// lại và máy chủ từ chối bằng một lỗi không tự khỏi (401 vì phiên đã hết từ đời nào, hoặc
// 400 vì ngày đã quá cũ để `resolve_checkin` nhận). Không có một pixel nào trên app nói
// lại chuyện đó. Lời hứa in trên màn hình biến thành lời hứa suông, và cái mất là đúng
// lượt check-in của một em đã chịu khó bấm lúc không có mạng.
//
// Nay hàng đợi để lại dấu vết (`listFailedCheckins`) và màn này ĐỌC nó ở cả hai thể — thể
// "hôm nay ghi rồi" lẫn thể bốn ô. Khối `QueueFailureNotice` nói ba điều, không nhiều hơn:
// chuyện gì đã xảy ra với lần bấm đó · nó KHÔNG nằm trong sổ (hoặc nằm thiếu phần tâm
// trạng) · em làm gì tiếp được. Chỉ khi em bấm "Đã hiểu" thì dấu vết mới mất — không có
// đường nào khác xoá nó, vì xoá im lặng chính là con lỗi đang sửa.
//
// Sửa 01/08/2026 (ADR-026) — NHÃN: câu "Chỉ thầy cô chủ nhiệm và thầy cô tâm lý thấy"
// đã hết đúng. Migration 0044 cắt nhánh chủ nhiệm khỏi `core.can_read_mood()`, nên
// người đọc được ô cảm xúc nay chỉ còn chính em và thầy cô tâm lý. Nhãn chuẩn chốt ở
// DESIGN-GUIDELINES §9.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MoodValue } from "@hub/core/contracts";
import { MOOD_LABEL } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { toLocalIsoDate } from "@/lib/date";
import {
  clearFailedCheckin,
  enqueueCheckin,
  flushQueuedCheckins,
  listFailedCheckins,
  shouldQueueOffline,
  type FailedCheckin,
} from "@/lib/offline-queue";
import { MiniAppHeader } from "./mini-app-header";
import { MoodTile } from "./mood-tile";
import { Mascot } from "./mascot";
import { PageShell } from "./page-shell";
import { NHAN_AI_DOC_CAM_XUC } from "./ui/labels";
import { LoadingState, MutationError } from "./ui/query-state";

type ViewState = "pick" | "success";

// `shouldQueueOffline` từng được định nghĩa ngay ở đây. Đã dời sang lib/offline-queue.ts
// (02/08/2026) vì hàng đợi phải trả lời CÙNG câu hỏi lúc gửi lại — hai bản luật cho một
// câu hỏi thì có ngày chúng lệch nhau, và chỗ lệch nằm đúng trên đường "em có được ghi
// nhận hay không". Một bản, hai nơi import.

/**
 * Lời "Mình cần gặp thầy cô" của lần bấm vừa rồi đang ở đâu?
 *
 * Ba giá trị, và ba giá trị này KHÔNG được gộp với trạng thái của ô tâm trạng dù hai
 * thứ đi chung một lời gọi. Lý do là số phận của chúng khác nhau: tâm trạng nằm trong
 * hàng đợi vẫn đúng lời hứa "Offline vẫn lưu — tự gửi sau", còn lời cần gặp nằm trong
 * hàng đợi là một tín hiệu KHÔNG tới ai — nó chỉ rời máy khi em mở lại app lúc có
 * mạng, mà QĐ-2 (01/08/2026) đòi nó phải tới cô ngay.
 *
 *  · `khong-bam`     — em không bấm nút cần gặp trong lần này. Màn không nói gì thêm.
 *  · `da-toi-co`     — máy chủ đã nhận. Chỉ nói "đã tới", KHÔNG nói "cô đã đọc":
 *                      máy không biết điều thứ hai (cùng luật với dải trạng thái ở
 *                      help-request-view.tsx).
 *  · `chua-gui-duoc` — còn nằm trên máy. Đây là nhánh mà màn ăn mừng bị cấm.
 *
 * `reachedServer` là "lời gọi này có tới máy chủ và trả về OK không" — không phải
 * `navigator.onLine`: trình duyệt báo online mà mạng chập chờn là ca đã xảy ra thật
 * (xem nhánh `shouldQueueOffline` trong `pick`).
 *
 * Thuần hàm để test được (tests/unit/checkin-view.test.ts).
 */
export type HelpSignalState = "khong-bam" | "da-toi-co" | "chua-gui-duoc";

export function helpSignalState(args: { wantsHelp: boolean; reachedServer: boolean }): HelpSignalState {
  if (!args.wantsHelp) return "khong-bam";
  return args.reachedServer ? "da-toi-co" : "chua-gui-duoc";
}

/** Ba trạng thái của màn check-in. Xem `checkinStage` để biết vì sao có ba. */
export type CheckinStage = "loading" | "recorded" | "pick";

/**
 * Hôm nay nên mở màn nào?
 *
 * Luật gốc: **chưa biết thì nói là chưa biết**. Bốn ô cảm xúc không phải một khung
 * trung tính — mở chúng ra là đã khẳng định với em "hôm nay con chưa ghi". Nên khi
 * `getTodayStatus` còn đang chạy thì màn hình phải ở thể chờ, không phải thể mời.
 *
 * Ba nhánh, theo thứ tự:
 *  1. Em vừa bấm "Đổi tâm trạng" → mở ô chọn, dù dữ liệu nói đã ghi rồi. Đây là
 *     lựa chọn tường minh của em, không phải suy đoán của máy.
 *  2. Chưa có câu trả lời nào (isPending) → "loading".
 *  3. Hỏi hỏng (mất mạng, 500) → vẫn mở ô chọn, KÈM lời nói thẳng là chưa biết hôm
 *     nay đã ghi chưa. Chặn em lại ở đây là phá lời hứa offline-first in ngay dưới
 *     bốn ô ("Offline vẫn lưu — tự gửi sau."), và bỏ rơi đúng em đang cần giúp nhất.
 *
 * Thuần hàm để test được (tests/unit/checkin-view.test.ts).
 */
export function checkinStage(args: {
  isPending: boolean;
  isError: boolean;
  checkedInToday: boolean | undefined;
  wantsChange: boolean;
}): CheckinStage {
  if (args.wantsChange) return "pick";
  if (args.isPending) return "loading";
  if (args.isError) return "pick";
  return args.checkedInToday === true ? "recorded" : "pick";
}

/**
 * `mood` từ máy chủ khai là `number | null` (cột DB có CHECK 1..4 nhưng contract
 * đọc ra vẫn là số bất kỳ). Ép về đúng bốn giá trị trước khi tra `MOOD_LABEL` —
 * không có bước này thì một giá trị lạ in ra "undefined" ngay giữa câu nói với em.
 */
export function asMoodValue(value: unknown): MoodValue | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

/**
 * Câu nói khi lần bấm này ĐÈ LÊN một lần ghi trước đó trong ngày.
 *
 * `null` khi hôm nay chưa có gì để đè (lần ghi đầu) — lúc đó câu "Con đã ghi: X"
 * ở màn thành công đã nói đủ. Chọn lại đúng tâm trạng cũ thì không có gì đổi, nên
 * nói "vẫn là" chứ không dựng lên một sự thay đổi không có thật.
 */
export function changeNotice(previous: MoodValue | null, next: MoodValue): string | null {
  if (previous === null) return null;
  if (previous === next) return `Tâm trạng hôm nay vẫn là ${MOOD_LABEL[next]}.`;
  return `Đã đổi từ ${MOOD_LABEL[previous]} sang ${MOOD_LABEL[next]}.`;
}

/**
 * "hôm nay lúc 07:32" · "ngày 31/7 lúc 07:32" — cách một đứa trẻ nói về thời điểm.
 *
 * Mốc hỏng thì trả chuỗi rỗng và nơi gọi bỏ hẳn vế thời gian: bịa ra "lúc 00:00" cho một
 * dấu thời gian không đọc được là nói với em một chuyện không có thật, ngay trong câu đang
 * xin lỗi em vì đã làm mất một lần bấm.
 *
 * `now` là tham số để test được — hàm chỉ đúng vào đúng hôm nay là hàm không ai kiểm được.
 */
export function failedWhenText(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const time = at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (toLocalIsoDate(at) === toLocalIsoDate(now)) return `hôm nay lúc ${time}`;
  return `ngày ${at.getDate()}/${at.getMonth() + 1} lúc ${time}`;
}

/**
 * Dấu vết của một lần bấm KHÔNG đi trọn vẹn (nợ #31).
 *
 * Vì sao khối này tồn tại: hàng đợi offline có ba đường ra, và hai trong ba đường KHÔNG
 * kết thúc bằng "đã ghi xong" — bản ghi hỏng vĩnh viễn, và bản ghi máy chủ nhận nhưng
 * không nhận mức tâm trạng (0047). Trước 02/08/2026 cả hai đường đó đều im: hàng đợi tự
 * dọn, màn hình không nói gì, và em vẫn tin lần bấm hôm qua đã tới cô.
 *
 * Ba việc, đúng ba, không thêm:
 *   1. Nói lần bấm NÀO (thời điểm em nhớ được), và nó KHÔNG nằm ở đâu.
 *   2. Nói vì sao bằng chuyện em hiểu được, và không đổ lỗi cho em.
 *   3. Cho đường đi thật: gửi lại (khi gửi lại còn có ích), hoặc đọc rồi cho qua.
 *
 * `role="alert"`: khối này xuất hiện SAU khi màn đã vẽ xong (phải đợi flush chạy), nên
 * người dùng trình đọc màn hình không có cách nào gặp nó nếu nó im lặng chèn vào DOM.
 */
function QueueFailureNotice({
  items,
  busy,
  onRetry,
  onDismiss,
}: {
  items: FailedCheckin[];
  busy: boolean;
  onRetry: (item: FailedCheckin) => void;
  onDismiss: (clientId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="mt-3 flex flex-col gap-2.5">
      {items.map((item) => {
        const when = failedWhenText(item.clientOccurredAt);
        const moodOnly = item.reason === "tam-trang-chua-duoc-ghi";
        const expired = item.httpStatus === 401;
        return (
          <div
            key={item.clientId}
            className={`flex flex-col items-center gap-1.5 rounded-[14px] border-[1.6px] p-3.5 text-center ${
              moodOnly ? "border-[#DDE6F2] bg-[#F4F8FD]" : "border-[#FFE29A] bg-[#FFF7E0]"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="msr text-[18px] text-[#8A5A00]">
                {moodOnly ? "info" : "schedule_send"}
              </span>
              <p className="text-[12.5px] font-black leading-relaxed text-navy">
                {moodOnly
                  ? `Lượt điểm danh ${when} của con đã vào sổ, riêng phần tâm trạng thì chưa`
                  : `Lần con ghi ${when} chưa gửi được lên trường`}
              </p>
            </div>
            <p className="text-[11.5px] leading-relaxed text-[#8A5A00]">
              {moodOnly ? (
                <>
                  Phần “Hôm nay con thấy thế nào” đang tạm tắt vì trường chưa nhận được phiếu đồng ý
                  của bố mẹ. Đây không phải lỗi của con.
                </>
              ) : expired ? (
                <>
                  Máy đã đăng xuất con từ lúc nào đó, nên lần bấm ấy nằm lại trong máy chứ không đi
                  được. Con đăng nhập lại rồi ghi lại giúp thầy cô nhé.
                </>
              ) : (
                <>
                  Máy đã giữ lần bấm ấy trong điện thoại và thử gửi lại, nhưng trường không nhận
                  được. Con ghi lại hôm nay nhé — lần này con sẽ thấy ngay là đã ghi xong.
                </>
              )}
            </p>
            {/* Câu lỗi thật của máy chủ, nếu có — không nuốt nó, nhưng cũng không để nó
                thay câu nói với em ở trên. */}
            {item.message && !moodOnly && (
              <p className="text-[11px] leading-relaxed text-muted2">{item.message}</p>
            )}
            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2">
              {!moodOnly && !expired && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRetry(item)}
                  className="min-h-[44px] rounded-full bg-navy px-5 py-2 text-[12.5px] font-black text-white disabled:opacity-50"
                >
                  {busy ? "Đang gửi…" : `Gửi lại ${MOOD_LABEL[item.mood]}`}
                </button>
              )}
              {expired && !moodOnly && (
                <a
                  href="/login"
                  className="flex min-h-[44px] items-center rounded-full bg-navy px-5 py-2 text-[12.5px] font-black text-white"
                >
                  Đăng nhập lại
                </a>
              )}
              <button
                type="button"
                onClick={() => onDismiss(item.clientId)}
                className="min-h-[44px] px-2 text-[12px] font-black text-[#1D4E8F] underline underline-offset-2"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CheckinView() {
  const utils = trpc.useUtils();
  const [state, setState] = useState<ViewState>("pick");
  const [wantsHelp, setWantsHelp] = useState(false);
  const [wantsChange, setWantsChange] = useState(false);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [lastMood, setLastMood] = useState<MoodValue | null>(null);
  const [changedFrom, setChangedFrom] = useState<MoodValue | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Chụp lại `wantsHelp` của ĐÚNG lần bấm này. Không đọc thẳng state `wantsHelp` ở màn
  // thành công: nó là công tắc còn bật sau khi gửi, nên nếu em quay lại bấm "Giữ nguyên"
  // rồi tắt công tắc thì câu nói về lời cần gặp sẽ đổi theo — trong khi việc đã xảy ra
  // rồi và không đổi được nữa.
  const [helpAtSubmit, setHelpAtSubmit] = useState(false);
  /** 0047 — máy chủ nhận lượt check-in nhưng KHÔNG nhận mức tâm trạng (chưa có phiếu đồng ý). */
  const [moodBlocked, setMoodBlocked] = useState(false);
  /**
   * Những lần bấm CŨ đã rời hàng đợi mà không đi trọn vẹn (nợ #31). Đây là thứ duy nhất
   * còn nói lại được cho em biết chuyện đã xảy ra — nếu màn hình không đọc, hàng đợi lại
   * quay về xoá trong im lặng.
   */
  const [failedCheckins, setFailedCheckins] = useState<FailedCheckin[]>([]);
  const todayStatus = trpc.checkin.getTodayStatus.useQuery();
  const submitMood = trpc.checkin.submitMood.useMutation();
  const submitRef = useRef(submitMood.mutateAsync);
  submitRef.current = submitMood.mutateAsync;

  // BẤM XONG MÀN ĐỔI HẲN MÀ KHÔNG BÁO CHO TAI (sửa 01/08/2026).
  //
  // Em chạm ô "Vui" → toàn bộ cây DOM của màn chọn bị thay bằng màn "Đã ghi nhận, cảm ơn
  // em!". Chính cái nút vừa bấm biến mất, nên focus rơi về <body>: người dùng bàn phím mất
  // chỗ đứng và Tab tiếp là quay về đầu trang; người dùng trình đọc màn hình nghe IM LẶNG
  // đúng lúc màn hình vừa xác nhận việc quan trọng nhất em làm trong app hôm nay. Grep
  // `aria-live` trên trọn 10 file màn học sinh trước hôm nay trả về đúng MỘT dòng, và
  // không phải dòng này.
  //
  // Hai việc, cùng cách LoadingState (ui/query-state.tsx:149) đã làm đúng: khối thành công
  // bọc role="status" aria-live="polite", và focus dời lên <h2> của màn mới.
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state === "success") successHeadingRef.current?.focus();
  }, [state]);

  // Gửi lại hàng đợi ngay khi có mạng — không cần em mở lại màn hình.
  //
  // Sau mỗi lượt flush PHẢI đọc lại dấu vết: một bản ghi vừa rời hàng đợi vì hỏng vĩnh
  // viễn (hoặc vì máy chủ không nhận mức tâm trạng) chỉ còn tồn tại ở đó. Không đọc thì
  // hàng đợi lại sạch trong im lặng — đúng thứ nợ #31 sinh ra để chấm dứt.
  useEffect(() => {
    let alive = true;
    async function readFailed() {
      const failed = await listFailedCheckins();
      if (alive) setFailedCheckins(failed);
    }
    async function tryFlush() {
      // IndexedDB có thể không mở được (chế độ ẩn danh, hết quota, trình duyệt lạ). Khi
      // đó KHÔNG được để lời hứa hỏng làm gãy cả màn check-in: em vẫn phải bấm được, vì
      // đường ghi thẳng lên máy chủ không dính gì tới kho trên máy.
      try {
        await flushQueuedCheckins((input) => submitRef.current(input));
        await readFailed();
      } catch {
        // Không có gì để nói với em ở đây: chưa đọc được kho trên máy thì cũng chưa biết
        // có lần bấm nào hỏng hay không. Im ở chỗ CHƯA BIẾT, không im ở chỗ đã biết.
      }
    }
    // Đọc dấu vết cả khi ĐANG offline: dấu vết của hôm qua vẫn phải hiện ra hôm nay.
    if (navigator.onLine) void tryFlush();
    else void readFailed().catch(() => {});
    const onOnline = () => void tryFlush();
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  /** Em đã đọc xong dấu vết đó — chỉ lúc này nó mới được phép biến mất. */
  async function dismissFailed(clientId: string) {
    await clearFailedCheckin(clientId);
    setFailedCheckins((list) => list.filter((i) => i.clientId !== clientId));
  }

  /** "Gửi lại" từ khối dấu vết: chỉ xoá dấu vết khi lần gửi lại THẬT SỰ tới máy chủ. */
  async function retryFailed(item: FailedCheckin) {
    const reachedServer = await pick(item.mood);
    if (reachedServer) await dismissFailed(item.clientId);
  }

  const today = todayStatus.data;
  // Chỉ coi là "đã có tâm trạng hôm nay" khi máy chủ nói chắc cả hai điều. Thiếu
  // một trong hai thì để null — null ở đây nghĩa là "chưa biết", và mọi câu nói
  // phía dưới đều tránh khẳng định khi gặp null.
  const moodToday = today?.checkedInToday ? asMoodValue(today.mood) : null;
  const stage = checkinStage({
    isPending: todayStatus.isPending,
    isError: todayStatus.isError,
    checkedInToday: today?.checkedInToday,
    wantsChange,
  });
  /** Đang mở ô chọn mà KHÔNG đọc được trạng thái hôm nay — phải nói ra, xem `checkinStage`. */
  const unknownToday = stage === "pick" && todayStatus.isError;

  function localTimeNow(): string {
    return new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }

  /**
   * Trả về "lần bấm này CÓ tới máy chủ không" — không phải "đã ghi xong không".
   * `retryFailed` cần đúng chừng đó để biết dấu vết cũ còn đáng giữ hay không; mọi câu
   * nói với em vẫn do các state phía dưới quyết định, không suy ra từ giá trị này.
   */
  async function pick(mood: MoodValue): Promise<boolean> {
    // Chụp tâm trạng cũ TRƯỚC khi gửi: sau khi gửi xong query bị invalidate, giá
    // trị cũ biến mất, và câu "đổi từ … sang …" mất luôn vế đầu.
    const previous = moodToday;
    setLastMood(mood);
    setHelpAtSubmit(wantsHelp);
    setFailure(null);
    setMoodBlocked(false);
    if (!navigator.onLine) {
      const { replacedMood } = await enqueueCheckin({ mood, wantsHelp });
      // Máy chủ chưa biết gì, nên vế "từ …" chỉ có thể đến từ trạng thái đã tải
      // trước khi mất mạng, hoặc từ chính bản ghi đang nằm trong hàng đợi.
      setChangedFrom(previous ?? replacedMood);
      setQueuedOffline(true);
      setSavedAt(localTimeNow());
      setState("success");
      return false;
    }
    try {
      const result = await submitMood.mutateAsync({ mood, wantsHelp });
      // 0047 — máy chủ có thể nhận lượt check-in mà KHÔNG nhận mức tâm trạng (nhà em chưa
      // có phiếu đồng ý của bố mẹ). Không đọc cờ này là in "Con đã ghi: Vui" cho một thứ
      // không nằm trong kho — đúng con lỗi "câu ĐÃ GỬI in ra khi không ghi được gì" mà
      // `checkin.requestHelp` đã phải sửa một lần rồi, chỉ khác chỗ đứng.
      setMoodBlocked(result.moodSaved === false);
      setStreakDays(result.streakDays);
      setChangedFrom(previous);
      setQueuedOffline(false);
      setSavedAt(localTimeNow());
      setState("success");
      void utils.checkin.getTodayStatus.invalidate();
      void utils.report.getMyLatestReport.invalidate();
      return true;
    } catch (error) {
      if (shouldQueueOffline(error)) {
        // Mạng chập chờn dù navigator báo online — vẫn không để em mất thao tác.
        const { replacedMood } = await enqueueCheckin({ mood, wantsHelp });
        setChangedFrom(previous ?? replacedMood);
        setQueuedOffline(true);
        setSavedAt(localTimeNow());
        setState("success");
        return false;
      }
      // Lỗi không tự khỏi: KHÔNG được báo thành công, KHÔNG được cất vào hàng đợi
      // (nó sẽ kẹt vĩnh viễn và chặn mọi check-in sau). Nói thật, giữ nguyên màn
      // chọn để em bấm lại một cái là gửi lại.
      setFailure(error);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Màn thành công — nhắc lại ĐÚNG lựa chọn vừa ghi (bốn ô liền nhau rất dễ chạm
  // nhầm; trước đây cả hai lần bấm đều ra một câu giống hệt nhau).
  // -------------------------------------------------------------------------
  if (state === "success") {
    const notice = lastMood !== null ? changeNotice(changedFrom, lastMood) : null;
    // Một lần bấm, HAI việc, và chúng có thể có hai kết cục khác nhau. Xem `helpSignalState`.
    const helpState = helpSignalState({ wantsHelp: helpAtSubmit, reachedServer: !queuedOffline });
    const helpStuck = helpState === "chua-gui-duoc";
    return (
      <PageShell bg="bg-white">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center"
        >
          {/* Sư tử ăn mừng là một câu nói, không phải trang trí: nó nói "xong rồi, yên
              tâm". Khi lời cần gặp còn kẹt trên máy thì câu đó sai, nên đổi tư thế —
              không phải làm màn hình buồn đi, mà để hình và chữ nói cùng một điều. */}
          <Mascot pose={helpStuck ? "think" : "celebrate"} width={72} />
          {/* tabIndex={-1}: <h2> không tự nhận được focus, thiếu nó thì .focus() ở trên
              không làm gì cả và lỗi im lặng y như cũ. */}
          <h2 ref={successHeadingRef} tabIndex={-1} className="text-[19px] font-black text-navy">
            {helpStuck
              ? "Lời con nhắn chưa gửi được"
              : moodBlocked
                ? "Trường chưa ghi tâm trạng của con"
                : "Đã ghi nhận, cảm ơn em!"}
          </h2>
          {lastMood !== null && !moodBlocked && (
            <p className="text-[14px] text-ink">
              Con đã ghi: <b className="font-black text-navy">{MOOD_LABEL[lastMood]}</b>
            </p>
          )}
          {/* 0047 — CHƯA CÓ PHIẾU ĐỒNG Ý CỦA BỐ MẸ.
              Ba luật cho khối này, và cả ba đều là để em không nghĩ mình vừa làm sai:
                1. Nói rõ chuyện nằm ở phía người lớn, không ở phía em.
                2. Nói ngay cái KHÔNG mất — em vẫn được điểm danh, và nút cần gặp thầy cô
                   vẫn dùng được. Không nói vế này thì "chưa ghi được" đọc ra thành "app
                   của mình hỏng rồi", và đứa trẻ thôi mở app.
                3. KHÔNG trách bố mẹ em, không dùng chữ nào để em mang về nhà chất vấn. */}
          {moodBlocked && (
            <div className="flex w-full max-w-[340px] flex-col items-center gap-1.5 rounded-[14px] border-[1.6px] border-[#DDE6F2] bg-[#F4F8FD] p-3.5 text-center">
              <p className="text-[12.5px] font-bold leading-relaxed text-ink">
                Phần “Hôm nay con thấy thế nào” đang tạm tắt vì trường chưa nhận được phiếu đồng ý
                của bố mẹ. Đây không phải lỗi của con.
              </p>
              <p className="text-[11.5px] leading-relaxed text-muted">
                Lượt điểm danh hôm nay của con <b className="font-black">vẫn được ghi</b>, và nút
                “Mình cần gặp thầy cô” của con <b className="font-black">vẫn dùng được như thường</b>.
              </p>
            </div>
          )}
          {savedAt !== null && (
            <p className="text-[12px] text-muted2">
              {queuedOffline ? `Đã lưu trên máy lúc ${savedAt}.` : `Đã ghi lúc ${savedAt}.`}
            </p>
          )}
          {/* Ghi đè thì phải nói ra — xem ghi chú "GHI ĐÈ TRONG IM LẶNG" ở đầu file. */}
          {notice && (
            <p className="flex items-center gap-1.5 rounded-[12px] bg-[#FFF7E0] px-3.5 py-2 text-[12px] font-bold text-gold-textDark">
              <span aria-hidden className="msr text-[16px]">
                edit
              </span>
              {notice}
            </p>
          )}
          {streakDays !== null && (
            <p className="text-[13px] text-muted2">Chuỗi check-in hiện tại: {streakDays} ngày 🔥</p>
          )}
          {queuedOffline && (
            <p className="flex items-center gap-1.5 text-[11px] text-caption2">
              <span aria-hidden className="msr text-[14px]">cloud_off</span>
              Đang offline — đã lưu máy, tự gửi khi có mạng.
            </p>
          )}

          {/* QĐ-2, chiều TỐT: máy chủ đã nhận. Nói "đã tới", KHÔNG nói "cô đã đọc" —
              máy chỉ biết vế đầu, và bịa vế sau thì đứa trẻ lãnh. */}
          {helpState === "da-toi-co" && (
            <p className="flex max-w-[320px] items-center gap-1.5 rounded-[12px] bg-[#E3F8ED] px-3.5 py-2 text-[12px] font-bold leading-relaxed text-[#00693F]">
              <span aria-hidden className="msr flex-none text-[16px]">waving_hand</span>
              Lời “Mình cần gặp thầy cô” của con đã tới chỗ thầy cô rồi.
            </p>
          )}

          {/* QĐ-2, chiều XẤU — khối quan trọng nhất của cả màn này.
              Tâm trạng nằm hàng đợi thì không sao (lời hứa offline-first đã in sẵn), nhưng
              lời cầu cứu nằm hàng đợi là một tín hiệu KHÔNG tới ai. Nói thẳng, và cho hai
              đường đi thật: thử lại ngay, hoặc gặp người thật. */}
          {helpStuck && (
            <div className="flex w-full max-w-[340px] flex-col items-center gap-2 rounded-[14px] border-[1.6px] border-[#FFD5D6] bg-[#FFF5F5] p-3.5 text-center">
              <p className="text-[12.5px] font-bold leading-relaxed text-[#8A4A4C]">
                Thầy cô <b>chưa</b> biết con muốn gặp — máy chưa gửi được lời nhắn này đi.
              </p>
              <p className="text-[11.5px] leading-relaxed text-[#8A4A4C]">
                Máy sẽ tự gửi khi có mạng lại. Nhưng nếu con cần gặp trong hôm nay, con tìm thầy cô
                nói trực tiếp nhé — như vậy chắc chắn hơn.
              </p>
              {lastMood !== null && (
                <button
                  type="button"
                  disabled={submitMood.isPending}
                  onClick={() => void pick(lastMood)}
                  className="min-h-[44px] rounded-full bg-navy px-5 py-2 text-[12.5px] font-black text-white disabled:opacity-50"
                >
                  {submitMood.isPending ? "Đang gửi…" : "Thử gửi lại"}
                </button>
              )}
              <Link
                href="/can-gap-thay-co"
                className="text-[12px] font-black text-[#1D4E8F] underline underline-offset-2"
              >
                Viết rõ hơn cho thầy cô
              </Link>
            </div>
          )}
          {/* min-h-[44px] + inline-flex (01/08/2026): `py-2.5` cho ra ô cao ~33px — dưới mốc
              44px của §11/WCAG 2.5.5, và đây là đường ra DUY NHẤT của màn thành công trên
              điện thoại (mini app không có tab bar Hub, PWA thêm vào màn hình chính không có
              nút Back). min-h trên một <a> nội tuyến không có tác dụng nếu thiếu inline-flex. */}
          <a
            href="/home"
            className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-navy px-6 py-2.5 text-[13px] font-black text-white"
          >
            Về trang chủ
          </a>
        </div>
      </PageShell>
    );
  }

  // -------------------------------------------------------------------------
  // Chưa biết hôm nay đã ghi chưa — không mở form trắng (form trắng = khẳng định
  // "con chưa ghi"). Câu chờ giống hệt /home để hai màn nói cùng một giọng.
  // -------------------------------------------------------------------------
  if (stage === "loading") {
    return (
      <PageShell bg="bg-white">
        <MiniAppHeader title="Check-in cảm xúc" icon="sentiment_satisfied" gradient="from-domain-attendance to-domain-attendanceDark" />
        <LoadingState label="Đang xem hôm nay con đã check-in chưa…" />
      </PageShell>
    );
  }

  // -------------------------------------------------------------------------
  // Hôm nay đã ghi rồi — hiện đúng cái đã ghi, và chỉ đổi khi em bấm nút đổi.
  // -------------------------------------------------------------------------
  if (stage === "recorded") {
    return (
      <PageShell bg="bg-white">
        <MiniAppHeader title="Check-in cảm xúc" icon="sentiment_satisfied" gradient="from-domain-attendance to-domain-attendanceDark" />
        <div className="flex flex-1 flex-col items-center px-6 pb-8 pt-8 text-center">
          <Mascot pose="thumbsup" width={64} />
          <h2 className="mt-3 text-[19px] font-black text-navy">Hôm nay con ghi rồi nhé</h2>
          <p className="mt-2 text-[14px] text-ink">
            {moodToday !== null ? (
              <>
                Con đã ghi: <b className="font-black text-navy">{MOOD_LABEL[moodToday]}</b>
              </>
            ) : (
              // Có bản ghi hôm nay nhưng không đọc được tâm trạng: nói đúng chừng
              // đó, không đoán thêm một tâm trạng nào cho em.
              <>Con đã check-in hôm nay.</>
            )}
          </p>
          {today?.checkedInAt && (
            <p className="mt-1 text-[12.5px] text-muted2">Lúc {today.checkedInAt}</p>
          )}

          {/* Nợ #31 — màn "hôm nay ghi rồi" cũng phải nói ra lần bấm CŨ đã hỏng. Đây là
              màn em thấy nhiều nhất; giấu dấu vết ở đây là giấu ở đúng chỗ đông người. */}
          <div className="w-full max-w-[340px]">
            <QueueFailureNotice
              items={failedCheckins}
              busy={submitMood.isPending}
              onRetry={(item) => void retryFailed(item)}
              onDismiss={(clientId) => void dismissFailed(clientId)}
            />
          </div>
          {/* Nhãn chuẩn DESIGN-GUIDELINES §9 (ADR-026). Không viết tay một câu khác ở đây:
              hai chỗ in nhãn trong cùng file mà lệch nhau một chữ là hai lời hứa khác nhau
              về cùng một ô nhập. */}
          <div className="mt-2 flex items-center justify-center gap-1">
            <span aria-hidden className="msr text-[13px] text-caption">lock</span>
            <span className="text-[12px] text-muted2">{NHAN_AI_DOC_CAM_XUC}</span>
          </div>

          <button
            type="button"
            onClick={() => setWantsChange(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br from-navy to-navy-light py-3.5 text-[13.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)]"
          >
            {/* `edit` chứ không phải mũi tên đổi chiều: font đã cắt gọn theo
                public/fonts/icon-names.txt — tên ngoài danh sách đó hiện ra ô trống,
                không báo lỗi, không ai biết (tests/unit/a11y.test.ts). */}
            <span aria-hidden className="msr text-[19px]">edit</span>
            Đổi tâm trạng
          </button>
          <p className="mt-2 max-w-[300px] text-[11.5px] leading-relaxed text-caption2">
            Đổi thì tâm trạng mới sẽ thay tâm trạng con ghi lúc nãy, mỗi ngày chỉ giữ một.
          </p>

          <Link
            href="/can-gap-thay-co"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] border-[1.6px] border-gold bg-[#FFFBEE] py-3 text-[13px] font-black text-gold-textDark"
          >
            <span aria-hidden className="msr text-[18px] text-[#E8940D]">waving_hand</span>
            Mình cần gặp thầy cô
          </Link>
          {/* inline-flex + min-h-[44px] (§11). Đo thật 360px ngày 02/08/2026: 81×19 — và đây
              là màn KHÔNG có thanh tab (luồng check-in cố ý toàn màn), nên link này là
              đường ra duy nhất. Một đường ra cao 19px trên màn cảm ứng. */}
          <Link
            href="/home"
            className="mt-4 inline-flex min-h-[44px] items-center text-[12.5px] font-extrabold text-[#1D4E8F] underline underline-offset-2"
          >
            Về trang chủ
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell bg="bg-white">
      <MiniAppHeader title="Check-in cảm xúc" icon="sentiment_satisfied" gradient="from-domain-attendance to-domain-attendanceDark" />
      <div className="flex flex-1 flex-col px-5 pt-5">
        <div className="text-center">
          <div className="text-[20px] font-black text-ink">
            {wantsChange ? "Đổi lại tâm trạng hôm nay" : "Hôm nay em thấy thế nào?"}
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1">
            <span aria-hidden className="msr text-[13px] text-caption">lock</span>
            <span className="text-[12px] text-muted2">{NHAN_AI_DOC_CAM_XUC}</span>
          </div>
        </div>

        {/* Đang đổi: nói rõ cái sắp bị thay là gì, và cho đường quay lại giữ nguyên. */}
        {wantsChange && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-[12px] bg-[#F1F4F8] px-3 py-2 text-center text-[12px] text-muted2">
            <span>
              {moodToday !== null ? (
                <>
                  Đang ghi là <b className="font-black text-navy">{MOOD_LABEL[moodToday]}</b>
                </>
              ) : (
                <>Hôm nay con đã ghi một lần</>
              )}
              {today?.checkedInAt ? ` lúc ${today.checkedInAt}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setWantsChange(false)}
              className="font-black text-[#1D4E8F] underline underline-offset-2"
            >
              Giữ nguyên
            </button>
          </div>
        )}

        {/* Không đọc được trạng thái hôm nay: nói thẳng là chưa biết, KHÔNG chặn em
            ghi (offline-first), nhưng cũng KHÔNG hứa đây là lần ghi đầu tiên. */}
        {unknownToday && (
          <div className="mt-3 flex flex-col items-center gap-1.5 rounded-[12px] border-[1.5px] border-[#E4E9F0] bg-[#F7F9FC] px-3.5 py-2.5 text-center">
            <p className="text-[12px] leading-relaxed text-muted2">
              Chưa xem được hôm nay con đã ghi chưa. Con vẫn ghi được — nếu sáng nay con ghi rồi thì
              lần này sẽ thay tâm trạng cũ.
            </p>
            <button
              type="button"
              onClick={() => void todayStatus.refetch()}
              className="text-[12px] font-black text-[#1D4E8F] underline underline-offset-2"
            >
              Thử xem lại
            </button>
          </div>
        )}

        {/* Nợ #31 — đứng NGAY TRÊN bốn ô, không nằm cuối trang: em vào màn này để bấm một
            cái rồi đi, nên thứ nói "lần bấm hôm qua của con không tới nơi" phải nằm trên
            đường mắt em đi tới bốn ô, chứ không phải dưới chỗ em không bao giờ cuộn xuống. */}
        <QueueFailureNotice
          items={failedCheckins}
          busy={submitMood.isPending}
          onRetry={(item) => void retryFailed(item)}
          onDismiss={(clientId) => void dismissFailed(clientId)}
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          {/* `selected`: khi đang đổi, ô đang được ghi phải tự nói ra mình đang được
              chọn — cho cả mắt lẫn trình đọc màn hình (mood-tile khai aria-pressed). */}
          <MoodTile mood={4} selected={wantsChange && moodToday === 4} onSelect={pick} />
          <MoodTile mood={3} selected={wantsChange && moodToday === 3} onSelect={pick} />
          <MoodTile mood={2} selected={wantsChange && moodToday === 2} onSelect={pick} />
          <MoodTile mood={1} selected={wantsChange && moodToday === 1} onSelect={pick} />
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
                className="min-h-[44px] rounded-full bg-navy px-5 py-2 text-[12.5px] font-black text-white disabled:opacity-50"
              >
                {submitMood.isPending ? "Đang gửi…" : "Gửi lại"}
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          aria-pressed={wantsHelp}
          onClick={() => setWantsHelp((v) => !v)}
          className={`mt-4 flex items-center justify-center gap-2 rounded-[14px] border-[1.6px] py-3 text-[13px] font-black transition-colors ${
            wantsHelp ? "border-gold bg-gold/20 text-gold-textDark" : "border-gold bg-[#FFFBEE] text-gold-textDark"
          }`}
        >
          <span aria-hidden className="msr text-[18px] text-[#E8940D]">waving_hand</span>
          {wantsHelp ? "Đã chọn — em cần gặp thầy cô" : "Mình cần gặp thầy cô"}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span aria-hidden className="msr text-[14px] text-caption2">cloud_off</span>
          <span className="text-[10.5px] text-caption2">Offline vẫn lưu — tự gửi sau.</span>
        </div>
      </div>
    </PageShell>
  );
}
