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
// Sửa 05/08/2026 — /checkin LÀ MỘT TRANG CỦA HUB, KHÔNG PHẢI MINI APP:
//
// `/checkin` khai trong `lib/man-hinh.ts` như mọi màn Hub khác (vai student), không nằm
// trong `core.embedded_apps`. Nhưng nó dựng bằng <PageShell> + <MiniAppHeader>, tức là
// mượn nguyên bộ vỏ của shell mini app (DESIGN-GUIDELINES §6: header màu chủ + capsule
// ⋯│✕ kiểu Zalo Mini App). Hậu quả ở HAI khổ màn, không riêng máy tính:
//   · Laptop 1440px: khung thẻ `max-w-xl` của PageShell cho ra một thẻ ~576px trôi giữa
//     nền xám, không menu trái, không đường đi đâu ngoài link cuối trang — trong khi ba
//     màn học sinh cạnh nó (/tuan-nay, /diem-danh, /can-gap-thay-co) đã có menu trái thật
//     từ 31/07/2026.
//   · Điện thoại: capsule ⋯│✕ nói với em rằng đây là một app khác vừa mở đè lên Hub, và
//     nó THAY chỗ của thanh tab — nên đứng ở đây em mất luôn đường đi các màn còn lại.
//
// Nay là một trang bình thường, dùng đúng khung của /diem-danh và /tuan-nay: menu trái
// <HubSidebar> từ `md`, thanh tiêu đề trắng ở cả hai khổ, thanh tab học sinh dưới `md`,
// nội dung trong <MainContent>. KHÔNG bịa bố cục desktop mới — nội dung vẫn là một cột
// xếp dọc như cũ, chỉ nằm trong thẻ trắng căn giữa vùng nội dung.
//
// Ghi chú cũ nói "màn này cố ý toàn màn, không có thanh tab" nay hết đúng: cái toàn màn
// ấy đến từ vỏ mini app, không phải từ một quyết định sản phẩm nào.
//
// Sửa 01/08/2026 (ADR-026) — NHÃN: câu "Chỉ thầy cô chủ nhiệm và thầy cô tâm lý thấy"
// đã hết đúng. Migration 0044 cắt nhánh chủ nhiệm khỏi `core.can_read_mood()`, nên
// người đọc được ô cảm xúc nay chỉ còn chính em và thầy cô tâm lý. Nhãn chuẩn chốt ở
// DESIGN-GUIDELINES §9.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { HubRole, MoodValue } from "@hub/core/contracts";
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
import { HubSidebar } from "./hub-sidebar";
import { MoodTile } from "./mood-tile";
import { Mascot } from "./mascot";
import { MainContent } from "./page-shell";
import { StudentTabBar } from "./tab-bar";
import { NHAN_AI_DOC_CAM_XUC, classLabel } from "./ui/labels";
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
            {/* RÚT NGẮN 06/08/2026 (§1.5), KHÔNG BỎ: đây là câu báo một hành động đã hỏng —
                lúc hỏng thì em CẦN chữ, nên ba nhánh vẫn còn ba câu khác nhau. Cái bị cắt là
                phần kể cơ chế của máy, thứ em không dùng để làm gì:
                  · moodOnly: bỏ "Phần “Hôm nay con thấy thế nào” đang tạm tắt vì…" — tiêu đề
                    ngay trên đã nói phần tâm trạng chưa vào sổ. Giữ nguyên vế "không phải lỗi
                    của con", vì đó là điều duy nhất em cần nghe ở đây.
                  · expired: bỏ "Máy đã đăng xuất con từ lúc nào đó, nên lần bấm ấy nằm lại
                    trong máy chứ không đi được" — nút "Đăng nhập lại" ngay dưới đã là lời giải
                    thích đủ, và đường đi thì nút mới là thứ đi được.
                  · nhánh còn lại: bỏ "Máy đã giữ lần bấm ấy trong điện thoại và thử gửi lại" +
                    "lần này con sẽ thấy ngay là đã ghi xong" — cả hai đều kể chuyện bên trong
                    máy, không đổi việc em phải làm (ghi lại). */}
            <p className="text-[11.5px] leading-relaxed text-[#8A5A00]">
              {moodOnly
                ? "Chưa có phiếu đồng ý — không phải lỗi của con."
                : expired
                  ? "Phiên đã hết — con đăng nhập lại rồi ghi lại nhé."
                  : "Trường không nhận được — con ghi lại hôm nay nhé."}
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
                className="min-h-[44px] px-2 text-[12px] font-black text-link underline underline-offset-2"
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

/** Người đang đứng ở màn này — chỉ dùng để dựng menu trái và thanh tab, không đụng dữ liệu. */
export type CheckinViewProps = {
  displayName: string;
  email: string;
  roles: HubRole[];
  classCode?: string | null;
  /**
   * Đang nằm TRONG popup (ADR-036 bản 21/08/2026) chứ không phải một trang riêng.
   *
   * Khi bật: bỏ khung trang (menu trái, thanh tab, header màn) — vì popup đã có khung
   * của chính nó, và một thanh tab bên trong một lớp phủ là hai bộ điều hướng chồng lên
   * nhau. Ruột của bốn thể giữ NGUYÊN: cùng một dòng logic gửi, cùng hàng đợi ngoại
   * tuyến, cùng lời nhắn "cần gặp thầy cô". Không chép lại gì cả.
   */
  trongPopup?: boolean;
  /** Popup gọi để biết em đã ghi xong — lúc đó nó mới mọc đường ra. */
  onGhiXong?: () => void;
};

/**
 * Khung trang, dùng chung cho CẢ BỐN thể của màn (đang xem · đã ghi · chọn · vừa ghi xong).
 *
 * Một khung duy nhất chứ không phải mỗi thể tự dựng: trước hôm nay ba trong bốn thể tự viết
 * lấy <PageShell> + <MiniAppHeader> còn thể "vừa ghi xong" thì không có header nào — nên
 * ngay giữa một lần bấm, thanh trên của trang biến mất. Bốn thể là bốn CÂU NÓI khác nhau
 * trong cùng một trang, không phải bốn trang.
 *
 * `active="checkin"`: /checkin cố ý không có mục trong menu trái (nó là nút tròn giữa thanh
 * tab — xem `lib/man-hinh.ts`), nên không mục nào sáng lên. Đó là đúng: sáng "Trang chủ" khi
 * em đang ở màn check-in là menu nói dối chỗ em đang đứng.
 */
function CheckinShell({
  displayName,
  email,
  roles,
  classCode,
  trongPopup,
  children,
}: CheckinViewProps & { children: React.ReactNode }) {
  const subtitle = classLabel(classCode);
  // Trong popup: KHÔNG khung trang. Popup tự có tiêu đề, nền mờ và bẫy focus của nó;
  // dựng thêm menu trái + thanh tab bên trong là hai bộ điều hướng chồng nhau, và ở khổ
  // 390px thì lớp phủ không còn chỗ cho nội dung thật.
  if (trongPopup) return <>{children}</>;
  return (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Menu trái 240px chỉ có nghĩa từ md; dưới đó đường ra là thanh tab cuối trang. */}
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="checkin" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <MainContent className="flex min-w-0 flex-1 flex-col bg-white md:overflow-hidden md:bg-pagebgDesktop">
        <div className="flex flex-none items-center gap-3 border-b border-[#E9ECF2] bg-white px-4 py-3 md:gap-3.5 md:px-7 md:py-3.5">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-gradient-to-br from-domain-attendance to-domain-attendanceDark">
            <span aria-hidden="true" className="msr text-[19px] text-white">sentiment_satisfied</span>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-black text-ink">Check-in cảm xúc</h1>
            {/* Không biết lớp thì bỏ hẳn dòng này, không đoán — xem ui/labels.ts. */}
            {subtitle && <div className="text-[11.5px] text-caption">{subtitle}</div>}
          </div>
        </div>
        <div className="flex flex-1 flex-col md:overflow-y-auto md:p-7">
          {/* Điện thoại: thẻ trải sát mép như cũ (nội dung tự có padding riêng). Máy tính:
              thẻ trắng DÙNG HẾT bề ngang vùng nội dung (chặn ở 1160px cho màn siêu rộng —
              quá mốc đó thì mắt phải quét ngang cả gang tay để đọc một câu). Bản 05/08 đầu
              tiên chặn ở 620px và chủ đầu tư nói ngay "vẫn bị bó trong một cái khung": một
              thẻ 620px giữa vùng 1200px thì vẫn là bản điện thoại phóng to, chỉ khác là có
              thêm menu bên cạnh. Các thể bên trong tự trải theo chiều ngang đó (bốn ô cảm
              xúc thành MỘT HÀNG, khối "đã ghi" thành hai cột) chứ không xếp dọc rồi chừa
              trống hai bên. */}
          <div className="flex flex-1 flex-col bg-white md:mx-auto md:w-full md:max-w-[1160px] md:flex-none md:rounded-[22px] md:shadow-[0_3px_14px_rgba(10,42,94,.06)]">
            {children}
          </div>
        </div>
      </MainContent>
      {/* Đường ra ở điện thoại, giống /diem-danh và /tuan-nay. page.tsx đá mọi vai không
          phải học sinh về /home nên `roles` luôn có "student" — vẫn hỏi cho đúng §6 (chỉ
          học sinh mới có thanh tab Hub), không dựa vào một điều kiện ngầm. */}
      {roles.includes("student") && (
        <div className="md:hidden">
          <StudentTabBar fullName={displayName} email={email} />
        </div>
      )}
    </div>
  );
}

export function CheckinView({ displayName, email, roles, classCode, trongPopup, onGhiXong }: CheckinViewProps) {
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
  const shellProps = { displayName, email, roles, classCode, trongPopup };
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

  // Báo cho popup biết em đã ghi xong — ĐÓ là lúc đường ra mọc lên, không sớm hơn.
  // Gọi ở effect chứ không trong hàm gửi: hàng đợi ngoại tuyến cũng đặt state thành
  // "success" (em bấm khi mất mạng vẫn là đã ghi), và một lời gọi đặt trong hàm gửi sẽ
  // bỏ sót đúng nhánh đó.
  useEffect(() => {
    if (state === "success") onGhiXong?.();
  }, [state, onGhiXong]);

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
      <CheckinShell {...shellProps}>
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
            <div className="flex w-full max-w-[340px] flex-col items-center gap-2 rounded-[14px] border-[1.6px] border-[#DDE6F2] bg-[#F4F8FD] p-3.5 text-center">
              {/* RÚT NGẮN 06/08/2026 (§1.5). Bỏ "Phần “Hôm nay con thấy thế nào” đang tạm tắt
                  vì…": tiêu đề <h2> ngay trên đã nói đúng chuyện đó ("Trường chưa ghi tâm
                  trạng của con"), nên câu này là lần nói thứ hai. */}
              {/* Hai dòng ngắn chứ không một dòng dài: ở khổ 390px một câu 56 ký tự vẫn vắt
                  hai dòng, mà vế thứ hai ("không phải lỗi của con") là vế em cần đọc rõ nhất
                  ở màn này. Tách ra thì nó đứng riêng thay vì trôi ở cuối câu. */}
              <p className="text-[12.5px] font-bold text-ink">Chưa có phiếu đồng ý của bố mẹ.</p>
              <p className="text-[12px] font-black text-navy">Không phải lỗi của con.</p>
              {/* Luật 2 của khối (xem ba luật ở trên) KHÔNG bị cắt, chỉ đổi hình: cái em
                  KHÔNG mất nay là hai chip icon + nhãn ngắn thay cho một câu hai mệnh đề.
                  Chip nói nhanh hơn câu ở đúng chỗ này, vì em đang quét màn hình tìm xem
                  mình có mất gì không. */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-[#E3F8ED] px-2.5 py-1 text-[11px] font-black text-successText">
                  <span aria-hidden className="msr text-[14px]">check_circle</span>
                  Điểm danh vẫn ghi
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[#FFF7E0] px-2.5 py-1 text-[11px] font-black text-gold-textDark">
                  <span aria-hidden className="msr text-[14px]">waving_hand</span>
                  Nút cần gặp vẫn dùng được
                </span>
              </div>
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
          {/* CẮT 06/08/2026 (§1.5 + §4). Câu cũ: "Chuỗi check-in hiện tại: {n} ngày 🔥".
              Hai chữ "hiện tại" không thêm nghĩa nào (không có con số chuỗi nào khác trên
              màn), và 🔥 đang làm ICON — §4 cấm emoji làm icon UI, đúng cặp ví dụ nó nêu
              (🔥 → `local_fire_department`). Nay là chip: icon lửa + "Chuỗi {n} ngày", cùng
              hình dạng với chip chuỗi ở popup check-in trang chủ. */}
          {streakDays !== null && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#FFF7E0] px-3 py-1.5 text-[12px] font-black text-gold-textDark">
              <span aria-hidden className="msr text-[16px]">local_fire_department</span>
              Chuỗi {streakDays} ngày
            </span>
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
            // RÚT NGẮN 06/08/2026 (§1.5): bỏ phần nhắc lại nguyên văn nhãn của nút em vừa
            // bấm ("Lời “Mình cần gặp thầy cô” của con…") — em vừa bấm nó xong, không cần
            // đọc lại. Chữ còn lại giữ ĐÚNG mệnh đề của QĐ-2 ("đã tới", không phải "đã đọc").
            <p className="flex items-center gap-1.5 rounded-full bg-[#E3F8ED] px-3.5 py-2 text-[12px] font-black text-successText">
              <span aria-hidden className="msr flex-none text-[16px]">waving_hand</span>
              Lời cần gặp đã tới chỗ thầy cô
            </p>
          )}

          {/* QĐ-2, chiều XẤU — khối quan trọng nhất của cả màn này.
              Tâm trạng nằm hàng đợi thì không sao (lời hứa offline-first đã in sẵn), nhưng
              lời cầu cứu nằm hàng đợi là một tín hiệu KHÔNG tới ai. Nói thẳng, và cho hai
              đường đi thật: thử lại ngay, hoặc gặp người thật. */}
          {helpStuck && (
            <div className="flex w-full max-w-[340px] flex-col items-center gap-2 rounded-[14px] border-[1.6px] border-[#FFD5D6] bg-[#FFF5F5] p-3.5 text-center">
              {/* RÚT NGẮN 06/08/2026 (§1.5), KHÔNG BỎ — đây là câu báo hỏng của QĐ-2.
                  Bỏ "Máy sẽ tự gửi khi có mạng lại": chip `cloud_off` ngay trên khối này
                  ("Đang offline — đã lưu máy, tự gửi khi có mạng") đã nói đúng câu đó, và
                  nó chỉ hiện ở đúng nhánh này. Giữ trọn hai điều em cần: thầy cô CHƯA biết,
                  và đường đi thật cho hôm nay. */}
              <p className="text-[12.5px] font-bold text-[#8A4A4C]">
                Thầy cô <b>chưa</b> biết con muốn gặp.
              </p>
              <p className="text-[11.5px] leading-relaxed text-[#8A4A4C]">
                Cần gặp hôm nay: con tìm thầy cô nói trực tiếp nhé.
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
                className="text-[12px] font-black text-link underline underline-offset-2"
              >
                Viết rõ hơn cho thầy cô
              </Link>
            </div>
          )}
          {/* NÚT "VỀ TRANG CHỦ" ĐÃ BỎ (05/08/2026). Nó sinh ra ngày 01/08 khi màn này còn là
              vỏ mini app: không thanh tab, không menu trái, nên nó là đường ra DUY NHẤT và
              phải đạt 44px. Từ hôm nay /checkin là một trang bình thường của Hub — có menu
              trái từ md và thanh tab học sinh dưới md — nên nút này thành đường ra thứ ba cho
              cùng một chỗ, và không màn nào khác của Hub có nó. Giữ lại là để một dấu vết của
              kiến trúc cũ nằm trên màn hình mới. */}
        </div>
      </CheckinShell>
    );
  }

  // -------------------------------------------------------------------------
  // Chưa biết hôm nay đã ghi chưa — không mở form trắng (form trắng = khẳng định
  // "con chưa ghi"). Câu chờ giống hệt /home để hai màn nói cùng một giọng.
  // -------------------------------------------------------------------------
  if (stage === "loading") {
    return (
      <CheckinShell {...shellProps}>
        <LoadingState label="Đang xem hôm nay con đã check-in chưa…" />
      </CheckinShell>
    );
  }

  // -------------------------------------------------------------------------
  // Hôm nay đã ghi rồi — hiện đúng cái đã ghi, và chỉ đổi khi em bấm nút đổi.
  // -------------------------------------------------------------------------
  if (stage === "recorded") {
    return (
      <CheckinShell {...shellProps}>
        {/* HAI CỘT TỪ `md` (DESIGN-GUIDELINES "Desktop 2 cột").
            Cột trái KỂ chuyện đã xảy ra (em ghi gì, lúc mấy giờ, ai đọc được), cột phải
            320px là NHỮNG VIỆC LÀM TIẾP. Ở điện thoại hai cột xếp dọc thành đúng thứ tự cũ
            nên không màn nào bị vẽ lại — `md:` là thứ duy nhất thêm vào. */}
        <div className="flex flex-1 flex-col items-center px-6 pb-8 pt-8 text-center md:flex-row md:items-center md:justify-center md:gap-10 md:px-10 md:py-12 md:text-left">
          <div className="flex flex-col items-center md:flex-1 md:items-start">
            <Mascot pose="thumbsup" width={64} />
            <h2 className="mt-3 text-[19px] font-black text-navy md:text-[24px]">Hôm nay con ghi rồi nhé</h2>
            <p className="mt-2 text-[14px] text-ink md:text-[16px]">
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

            {/* Nhãn chuẩn DESIGN-GUIDELINES §9 (ADR-026). Không viết tay một câu khác ở đây:
                hai chỗ in nhãn trong cùng file mà lệch nhau một chữ là hai lời hứa khác nhau
                về cùng một ô nhập. */}
            <div className="mt-2 flex items-center gap-1">
              <span aria-hidden className="msr text-[13px] text-caption">lock</span>
              <span className="text-[12px] text-muted2">{NHAN_AI_DOC_CAM_XUC}</span>
            </div>

            {/* Nợ #31 — màn "hôm nay ghi rồi" cũng phải nói ra lần bấm CŨ đã hỏng. Đây là
                màn em thấy nhiều nhất; giấu dấu vết ở đây là giấu ở đúng chỗ đông người. */}
            <div className="w-full max-w-[340px] md:max-w-[420px]">
              <QueueFailureNotice
                items={failedCheckins}
                busy={submitMood.isPending}
                onRetry={(item) => void retryFailed(item)}
                onDismiss={(clientId) => void dismissFailed(clientId)}
              />
            </div>
          </div>

          <div className="flex w-full flex-col items-center md:w-[320px] md:flex-none md:items-stretch">
            <button
              type="button"
              onClick={() => setWantsChange(true)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br from-navy to-navy-light py-3.5 text-[13.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)] md:mt-0"
            >
              {/* `edit` chứ không phải mũi tên đổi chiều: font đã cắt gọn theo
                  public/fonts/icon-names.txt — tên ngoài danh sách đó hiện ra ô trống,
                  không báo lỗi, không ai biết (tests/unit/a11y.test.ts). */}
              <span aria-hidden className="msr text-[19px]">edit</span>
              Đổi tâm trạng
            </button>
            {/* RÚT NGẮN 06/08/2026 (§1.5). Câu cũ nói LUẬT ("mỗi ngày chỉ giữ một") sau khi
                đã kể lại cơ chế của nút ngay trên nó ("Đổi thì tâm trạng mới sẽ thay tâm
                trạng con ghi lúc nãy") — mà cơ chế đó thì `changeNotice` nói thẳng bằng dữ
                liệu thật ngay sau khi em bấm ("Đã đổi từ Vui sang Mệt"). Giữ đúng phần luật. */}
            <p className="mt-2 text-center text-[11.5px] text-caption2">
              Mỗi ngày chỉ giữ một tâm trạng.
            </p>

            <Link
              href="/can-gap-thay-co"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] border-[1.6px] border-gold bg-[#FFFBEE] py-3 text-[13px] font-black text-gold-textDark"
            >
              <span aria-hidden className="msr text-[18px] text-gold-textDark">waving_hand</span>
              Mình cần gặp thầy cô
            </Link>
            {/* Link "Về trang chủ" đã bỏ ở đây cùng lượt với nút bên màn thành công — xem lý
                lẽ ở đó. Tóm tắt: đường về nhà nay nằm ở menu trái và thanh tab như mọi trang
                khác của Hub, nên một link riêng ở giữa cột hành động là thừa và lạc kiểu. */}
          </div>
        </div>
      </CheckinShell>
    );
  }

  return (
    <CheckinShell {...shellProps}>
      <div className="flex flex-1 flex-col px-5 pb-6 pt-5 md:px-10 md:py-10">
        <div className="text-center">
          <div className="text-[20px] font-black text-ink md:text-[26px]">
            {wantsChange ? "Đổi lại tâm trạng hôm nay" : "Hôm nay em thấy thế nào?"}
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1">
            <span aria-hidden className="msr text-[13px] text-caption">lock</span>
            <span className="text-[12px] text-muted2">{NHAN_AI_DOC_CAM_XUC}</span>
          </div>
        </div>

        {/* Đang đổi: nói rõ cái sắp bị thay là gì, và cho đường quay lại giữ nguyên. */}
        {wantsChange && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-[12px] bg-chip px-3 py-2 text-center text-[12px] text-muted2">
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
              className="font-black text-link underline underline-offset-2"
            >
              Giữ nguyên
            </button>
          </div>
        )}

        {/* Không đọc được trạng thái hôm nay: nói thẳng là chưa biết, KHÔNG chặn em
            ghi (offline-first), nhưng cũng KHÔNG hứa đây là lần ghi đầu tiên. */}
        {unknownToday && (
          <div className="mt-3 flex flex-col items-center gap-1.5 rounded-[12px] border-[1.5px] border-line bg-pagebg px-3.5 py-2.5 text-center">
            {/* RÚT NGẮN 06/08/2026 (§1.5), KHÔNG BỎ — khối này là câu "máy chưa biết", và
                theo `checkinStage` nó phải nói ra chứ không được im. Bỏ hai vế thừa: "Con vẫn
                ghi được" (bốn ô cảm xúc ngay dưới đã mời em ghi — hình đã nói) và "nếu sáng
                nay con ghi rồi thì lần này sẽ thay tâm trạng cũ" (kể cơ chế ghi đè; việc đó
                `changeNotice` nói bằng dữ liệu thật ngay sau khi em bấm). */}
            <p className="text-[12px] text-muted2">Chưa xem được hôm nay con đã ghi chưa.</p>
            <button
              type="button"
              onClick={() => void todayStatus.refetch()}
              className="text-[12px] font-black text-link underline underline-offset-2"
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

        {/* Điện thoại 2×2 (ô ~162px, vừa ngón cái). Máy tính MỘT HÀNG bốn ô — cùng cách
            trang chủ desktop bày thẻ check-in (D2), và là lý do duy nhất đáng để có chiều
            ngang: bốn lựa chọn nằm ngang tầm mắt, không phải quét dọc hai lượt. */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:mt-7 md:grid-cols-4 md:gap-5">
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
            {/* RÚT NGẮN 06/08/2026 (§1.5), KHÔNG BỎ — câu báo hỏng. Bỏ vế chỉ đường bằng
                chữ ("Bấm lại ô em đã chọn để gửi lại nhé"): nút "Gửi lại" ngay dưới làm đúng
                việc đó, và nút thì bấm được còn câu thì không. */}
            <p className="text-[11.5px] text-[#8A4A4C]">
              Cảm xúc của em <b>chưa</b> được gửi.
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
          // md:w-[420px] mx-auto: nút này trải hết 1100px thì thành một thanh ngang chắn
          // ngay dưới bốn ô — to hơn cả thứ nó đứng cạnh, trong khi nó là lối RẼ chứ không
          // phải việc chính của màn.
          className={`mt-4 flex items-center justify-center gap-2 rounded-[14px] border-[1.6px] py-3 text-[13px] font-black transition-colors md:mx-auto md:mt-7 md:w-[420px] ${
            wantsHelp ? "border-gold bg-gold/20 text-gold-textDark" : "border-gold bg-[#FFFBEE] text-gold-textDark"
          }`}
        >
          <span aria-hidden className="msr text-[18px] text-gold-textDark">waving_hand</span>
          {wantsHelp ? "Đã chọn — em cần gặp thầy cô" : "Mình cần gặp thầy cô"}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span aria-hidden className="msr text-[14px] text-caption2">cloud_off</span>
          <span className="text-[10.5px] text-caption2">Offline vẫn lưu — tự gửi sau.</span>
        </div>
      </div>
    </CheckinShell>
  );
}
