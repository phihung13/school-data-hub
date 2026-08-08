// components/gvcn-dashboard.tsx — V10 Trang chủ GVCN (Hub Desktop V2, 30/07/2026).
// KHÔNG có "Duyệt Báo cáo Trưởng thành" (chưa có bảng phê duyệt) và "Chuyển tâm lý
// cụm" (GĐ2, chưa có contract — xem packages/core/contracts/care.ts) như bản vẽ
// tay. care.getDashboard đã có sẵn hầu hết còn lại (chuỗi cờ ưu tiên, xác nhận gửi
// muộn, mood lớp) — thêm totalStudents/openCareCases/recentActions (thật, không bịa).
//
// Sửa 31/07/2026 (gói "frontend-trang-thai"), năm việc:
//
//  1. VỠ HOÀN TOÀN TRÊN ĐIỆN THOẠI. Khung ngoài là `flex h-screen overflow-hidden`
//     với sidebar `w-[240px] flex-none` — KHÔNG một tiền tố md: nào. Trên máy 390px
//     sidebar ăn 240px, cột nội dung còn 150px, bốn StatCard basis-[190px] tràn ra
//     ngoài, và `overflow-hidden` ở khung ngoài khiến phần tràn KHÔNG cuộn tới được:
//     nội dung mất hẳn chứ không phải xấu. Mà GVCN là vai dùng điện thoại nhiều
//     nhất (điểm danh buổi sáng đứng ngay ở lớp), và trang chủ còn chủ động mời
//     "Mở Buồng lái…". Nay: sidebar ẩn dưới md, khung ngoài cuộn được, thẻ số co lại.
//
//  2. LỖI MUTATION KHÔNG HIỆN RA. Hai mutation chỉ khai onSuccess, JSX không đọc
//     .isError bao giờ. Ghi can thiệp thất bại → nút hết mờ, GVCN tin là đã lưu,
//     trong khi không có gì được lưu. Nay mỗi nút có câu lỗi tiếng Việt cạnh nó và
//     một xác nhận ngắn khi thành công.
//
//  3. §9 CHƯA TỚI CLIENT. `clientMutationId` đã có trong contract nhưng client
//     không gửi, nên máy chủ phải tự dựng khoá chống trùng từ (case, người, nội
//     dung, ngày) — gộp nhầm hai lần ghi khác nhau cùng ngày thành một. Nay mỗi
//     thẻ cờ mang một mã riêng, sinh lại sau mỗi lần ghi thành công.
//
//  4. CỜ KHÔNG TẮT ĐƯỢC TỪ MÀN HÌNH. `acknowledgeHelpRequest` và `closeCase` đã
//     sẵn sàng ở router (đợt 2) nhưng không có nút nào gọi tới. Nay có.
//
//  5. THẺ CỜ CHỈ PHÂN BIỆT BẰNG MÀU. Quyết định của chủ đầu tư: GIỮ viền màu làm
//     tín hiệu lớn nhất (nhìn lướt là thấy), THÊM chữ + icon phân mục khẩn, để
//     người không phân biệt được màu (khoảng 8% nam giới) vẫn đọc được mức độ —
//     xem `urgencyPresentation` bên dưới.
//
//  6. (31/07/2026, gói "trung-thuc-trang-thai") MÀN HÌNH NÓI CHẮC ĐIỀU NÓ KHÔNG
//     ĐO ĐƯỢC. Ô "hết việc" khẳng định "lớp mình đang ổn — trạng thái tốt thật
//     sự, không phải thiếu dữ liệu" kể cả khi `lastScanAt = null`, tức chưa có
//     lần quét cảnh báo nào chạy xong. Nay câu kết luận đó chỉ in ra khi có mốc
//     quét CỦA HÔM NAY đứng sau nó — xem `boardEmptyPresentation`.
//
//  8. (01/08/2026, gói "debt-32-buong-lai-doc-care-flags") BA CHỖ VÁ CỦA MỤC 6 CHỈ
//     SỐNG Ở NHÁNH BẢNG TRỐNG. Ba câu fresh/stale/unknown viết đúng, nhưng chúng
//     nằm trong điều kiện `priorityFlags.length === 0 && pendingLateCheckins.length
//     === 0` — có MỘT cờ là mốc quét biến mất khỏi màn hình. Grep toàn repo:
//     `lastScanAt` chỉ được RENDER ở đúng một dòng đó. Trong khi dải "nguồn dữ liệu
//     chưa tươi" thì hiện mọi lúc. Nay có `ScanBanner` cố định ở đầu trang, đọc
//     `d.scanHealth` (`ops.v_job_health`, migration 0041) nên nói được cả những
//     trạng thái mà một dấu thời gian không nói nổi: chưa chạy lần nào · lần gần
//     nhất hỏng · đang treo · bị tắt · quá hạn · không đọc được sổ.
//
//     Kèm theo: câu "Hết việc rồi — lớp mình đang ổn!" nay còn đòi thêm
//     `openCareCases === 0`. Đo trên hub_dev 01/08/2026, lớp 6A2 có 1 hồ sơ chăm
//     sóc đang mở và 0 cờ, nên màn hình in câu đó ngay cạnh ô "1 hồ sơ chăm sóc
//     đang mở" — hai con số cùng màn nói ngược nhau.
//
//  9. (01/08/2026, gói "tiep-can-man-nguoi-lon") BA LỖI TIẾP CẬN ĐO ĐƯỢC BẰNG SỐ:
//     · Chữ nội dung dùng token `caption`. Token đó vừa được gói "tuong-phan-man-hoc-
//       sinh" nâng lên (#8A94A6 → #5F6B7D) nên tự nó đã đạt chuẩn; nhưng những dòng
//       NÓI RA SỰ THẬT VỀ DỮ LIỆU — dòng phụ của bốn thẻ số, hai câu trạng thái rỗng —
//       vẫn đổi sang `muted`, cùng lý do đã ghi ở report-approval-view.tsx: `caption`
//       là tên dành cho chú thích, và một câu như "gửi muộn — chưa phải vắng" không
//       phải chú thích. Đặt đúng tên token là cách duy nhất để lần sau ai đó hạ lại
//       màu của `caption` cũng không kéo theo mấy câu này.
//     · Nút cao ~40px (px-5 py-3 + chữ 12,5px). §11 và WCAG 2.5.5 đòi 44px. Đây là
//       những nút GHI VÀO HỒ SƠ CHĂM SÓC của một đứa trẻ, bấm trượt không hoàn tác
//       được từ giao diện — nay `min-h-[44px]`.
//     · Ô "Cảm xúc lớp hôm nay" in "Chưa có check-in nào hôm nay" trong khi thẻ số
//       ngay trên nó ghi "Đã check-in 25/30". Hai con số đến từ HAI truy vấn khác nhau
//       (xem `MoodEmpty` bên dưới) — nay ba nhánh, mỗi nhánh một sự thật.
//
// 10. (06/08/2026, ADR-029 + ADR-030) HAI VIỆC CHỦ ĐẦU TƯ QUYẾT TRỰC TIẾP SAU KHI MỞ
//     BUỒNG LÁI THẬT:
//
//     · KHỐI GỬI MUỘN KHÔNG LÀM ĐƯỢC VIỆC. Nó là MỘT dòng "N check-in gửi muộn — chờ
//       cô xác nhận" cộng một nút "Xác nhận cả N": không giờ gửi, không chọn từng em,
//       không chỗ ghi vì sao. Mà giờ gửi CHÍNH LÀ dữ kiện để quyết định — em bấm lúc
//       07:55 khác hẳn em bấm lúc 10:20 — và cột `attendance.checkins.occurred_at` có
//       từ migration 0004 mà chưa màn nào đọc. Nay: mỗi em một dòng có giờ gửi và ô
//       chọn, chọn hàng loạt được, và ba kết luận `present`/`late`/`absent` theo
//       `LATE_DECISION_LABEL` — trong đó `absent` là quyền MỚI mà ADR-029 mở cho một
//       CON NGƯỜI biết chuyện gì đã xảy ra trong lớp mình (ADR-007 vẫn cấm MÁY tự suy).
//       Đối trọng của quyền đó nằm ngay trên màn: lý do bắt buộc khi kết luận khác
//       "Có mặt", và kết quả `{updated, skipped}` được đọc ra thành câu chứ không nuốt.
//
//     · BỎ `ScanBanner` (băng vàng "Bộ quét cờ quá hạn"). Nó chiếm cả một dải ngang
//       phía trên năm ô số, trong khi thứ nó cảnh báo chỉ ảnh hưởng ĐÚNG MỘT ô — ô
//       "Em cần để ý", con số duy nhất trong năm ô sinh ra từ lượt quét. RULES.md Rev F
//       điều 8 đổi CHỖ NÓI chứ không bỏ nghĩa vụ nói: dòng phụ của chính ô đó nay ghi
//       mốc lượt quét gần nhất thay cho "chưa em nào" (`dongPhuEmCanDeY`). Bỏ băng mà
//       không chuyển sự thật đi đâu thì "0 — chưa em nào" thành lời nói dối đúng vào
//       lúc bộ quét chết.
//
//  7. (31/07/2026, gói "gvcn-nhieu-lop") BUỒNG LÁI CỐ ĐỊNH Ở LỚP ĐẦU TIÊN. Trang gọi
//     `care.getDashboard()` không tham số, máy chủ lấy lớp chủ nhiệm đầu tiên, và màn
//     hình không có bộ chọn lớp nào. Cô chủ nhiệm hai lớp mở buồng lái chỉ thấy lớp
//     một — bốn màn con (/gvcn/lop, diem-danh, duyet-bao-cao, ghi-chu) đã có bộ chọn
//     từ trước, nên buồng lái là chỗ cuối cùng còn đoán hộ. Nay dùng CHUNG
//     `useSelectedClass`/`ClassPicker` với bốn màn đó: cùng một hàm chọn lớp mặc định
//     thì hai bên không thể mở hai lớp khác nhau trong cùng một phiên.
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  LATE_DECISIONS,
  LATE_DECISION_LABEL,
  type FlagSummary,
  type HubRole,
  type LateDecision,
  type PendingLateCheckin,
} from "@hub/core/contracts";
import Link from "next/link";
import { HubSidebar } from "./hub-sidebar";
import { MainContent } from "./page-shell";
import { HubTabBar } from "./tab-bar";
import { Mascot } from "./mascot";
import { ClassPicker, useSelectedClass } from "./gvcn/class-picker";
import {
  boardEmptyPresentation,
  dongPhuEmCanDeY,
  scanPresentation,
  type ScanPresentation,
} from "./gvcn/scan-status";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MutationError,
  MutationSuccess,
  StaffVoice,
} from "./ui/query-state";
import { classLabel, personName } from "./ui/labels";

// `MOOD_META` (bốn nhãn Vui/Bình thường/Mệt/Buồn + màu) đã bị gỡ 01/08/2026 cùng với ô
// "Cảm xúc lớp hôm nay". Không để lại "phòng khi cần": một bảng tra cảm xúc nằm sẵn
// trong bundle của màn GVCN là lời mời cho lần sửa sau nối lại đúng thứ vừa cắt.

/**
 * Bốn màn con của buồng lái. Trên máy tính chúng nằm trong sidebar (TEACHER_ITEMS);
 * trên điện thoại sidebar bị ẩn, nên phải có lối đi khác — nếu không thì đúng bốn
 * trang vừa dựng xong (gói "gvcn-man-hinh") không ai bấm tới được từ điện thoại.
 * href phải khớp TEACHER_ITEMS; tests/unit/dieu-huong-mobile.test.ts đối chiếu hai bên.
 */
const GVCN_SCREENS: Array<{ key: string; label: string; icon: string; href: string }> = [
  { key: "klass", label: "Lớp chủ nhiệm", icon: "groups", href: "/gvcn/lop" },
  { key: "attendance", label: "Điểm danh", icon: "fact_check", href: "/gvcn/diem-danh" },
  { key: "review", label: "Duyệt báo cáo", icon: "rate_review", href: "/gvcn/duyet-bao-cao" },
  { key: "notes", label: "Ghi chú", icon: "edit_note", href: "/gvcn/ghi-chu" },
];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  return `${days} ngày trước`;
}

// ---------------------------------------------------------------------------
// Mức khẩn của một thẻ cờ — thuần hàm để test được (tests/unit/gvcn-flag-card.test.ts).
//
// Quyết định của chủ đầu tư (31/07/2026): viền màu VẪN là tín hiệu lớn nhất, không
// đổi sang bố cục xám. Nhưng màu không được là tín hiệu DUY NHẤT: mỗi thẻ phải có
// thêm một nhãn chữ và một icon riêng cho từng mức, để buồng lái vẫn đọc được khi
// in đen trắng, khi màn hình chói nắng ngoài hành lang, và với người mù màu.
// ---------------------------------------------------------------------------
export interface UrgencyPresentation {
  /** Mã mức — dùng cho test và cho khoá React, không hiển thị. */
  level: "urgent" | "watch";
  /** Chữ trên nhãn — phải tự nó nói đủ mức độ, không cần nhìn màu. */
  label: string;
  /** Icon phân mục, khác nhau giữa hai mức (không chỉ khác màu). */
  icon: string;
  borderClass: string;
  badgeClass: string;
}

export function urgencyPresentation(flag: Pick<FlagSummary, "ruleCode">): UrgencyPresentation {
  if (flag.ruleCode === "E_URGENT") {
    // CẮT 06/08/2026: nhãn cũ là "KHẨN · EM ĐÃ BẤM “CẦN GẶP THẦY CÔ”" — 33 ký tự trên một
    // huy hiệu 10px, và vế sau lặp lại NGUYÊN VĂN dòng tiêu đề ngay dưới nó ("Em cần gặp
    // thầy cô · <tên em>"). Huy hiệu chỉ có một việc: nói MỨC. Icon `priority_high` + viền
    // đỏ + chữ "KHẨN" đã đủ, và `frontend-trang-thai.test.ts` vẫn đo đủ hai mức khác nhau
    // ở cả chữ lẫn icon.
    return {
      level: "urgent",
      label: "KHẨN",
      icon: "priority_high",
      borderClass: "border-l-[5px] border-[#F0474D]",
      badgeClass: "bg-[#FFE9E9] text-[#B02A30]",
    };
  }
  // Nhãn cũ: "CẦN ĐỂ Ý · CẢM XÚC ĐI XUỐNG NHIỀU NGÀY". Đổi 01/08/2026 — DESIGN-GUIDELINES
  // §9 cấm in phía GVCN cả CHIỀU của cảm xúc ("đi xuống") lẫn SỐ NGÀY, vì cả hai đều nói
  // nhiều hơn "cần để ý". Cô cần biết CÓ CHUYỆN, không đọc được CHUYỆN GÌ; "đi xuống
  // nhiều ngày" đã là đọc được chuyện gì rồi, chỉ là bằng ít chữ hơn.
  return {
    level: "watch",
    label: "CẦN ĐỂ Ý",
    icon: "visibility",
    borderClass: "border-l-[5px] border-gold",
    badgeClass: "bg-[#FFF1C9] text-gold-textDark",
  };
}

/**
 * Nhịp của một cờ, viết cho người đọc ([QĐ-2] · VIỆC 4).
 *
 * Buồng lái trộn hai nhịp trong cùng một danh sách: E_URGENT tính thẳng trong lượt gọi
 * (em bấm là lượt tải sau đã thấy), E_MOOD do bộ quét đêm sinh ra. Một bảng gộp hai nhịp
 * mà không nói ra thì chính bảng đó đánh lừa người đọc — nhất là ở chiều VẮNG MẶT: không
 * có cờ khẩn nghĩa là "chưa em nào bấm", còn không có cờ cảm xúc thì có thể chỉ nghĩa là
 * "bộ quét chưa chạy". Hai sự vắng mặt khác nghĩa không được vẽ giống nhau.
 */
/**
 * Phụ đề thẻ "Vắng" — phụ thuộc vào SỐ EM CHƯA ĐIỂM DANH, không đứng một mình.
 *
 * Câu cũ: `absentCount === 0 ? "không có ai vắng" : "học sinh"`. Con số 0 ở đó không phân
 * biệt được "đã ghi và không ai vắng" với "chưa ai ghi gì" — mà buổi sáng sớm thì ca thứ
 * hai mới là ca thường gặp. Thuần hàm để test được.
 */
export function absentSubtitle(absentCount: number, notCheckedInCount: number): string {
  if (notCheckedInCount > 0) {
    return `còn ${notCheckedInCount} em chưa điểm danh — chưa kết luận được`;
  }
  return absentCount === 0 ? "cả lớp đã điểm danh, không ai vắng" : "học sinh";
}

/**
 * CẮT 06/08/2026 (chủ đầu tư: "ngôn ngữ phải được thể hiện qua thiết kế chứ không phải
 * chữ viết"). Hai CÂU cũ nói ra CƠ CHẾ chạy của bộ quét:
 *
 *   "Hiện ngay khi em bấm — không chờ lượt quét đêm."
 *   "Do lượt quét đêm tìm ra — dấu hiệu của hôm nay phải chờ lượt quét kế tiếp."
 *
 * [QĐ-2] KHÔNG bị bỏ: luật là "hai nhịp phải phân biệt được trên màn", không phải "phải
 * giải thích cơ chế bằng hai câu". Nay là NHÃN CHIP hai–bốn từ, đứng cạnh icon `bolt` /
 * `nightlight` đã có sẵn — đúng cách §1.5 đòi (1 icon + 5 từ thì không viết 2 câu).
 * `a11y-man-nguoi-lon.test.ts` giữ nguyên phép đo: hai nhãn khác hẳn nhau, bản tức thì
 * chứa "ngay", bản quét đêm chứa "quét" và "chờ".
 */
export function cadenceNote(cadence: FlagSummary["detail"]["cadence"]): string {
  return cadence === "tuc_thi" ? "Ngay khi em bấm" : "Quét đêm · chờ lượt sau";
}

/**
 * Câu mô tả cờ. Viết lại 01/08/2026 (ADR-026).
 *
 * Bản cũ ghép "mood buồn/mệt {N} ngày gần đây" từ `detail.negativeDays` — đúng ba thứ
 * DESIGN-GUIDELINES §9 cấm in phía GVCN, gói gọn trong một dòng: chiều của cảm xúc, số
 * ngày, và (qua hai chữ "buồn/mệt") nội dung em đã ghi. Nay `FlagDetail` không còn chở
 * con số nào nữa — cắt tại contract, nên hàm này KHÔNG THỂ in ra chúng kể cả nếu ai đó
 * quên mất luật. Đó là cả điểm của việc cắt ở đó thay vì ẩn bằng CSS.
 *
 * CẮT 06/08/2026 — chủ đầu tư chỉ đích danh câu "Em đã bấm “cần gặp thầy cô” và chưa ai
 * đánh dấu đã gặp." Trên một thẻ cờ, LOẠI TÍN HIỆU đã được nói HAI lần phía trên dòng
 * này: huy hiệu mức khẩn, rồi tiêu đề "Em cần gặp thầy cô · <tên em>". Dòng mô tả là bản
 * thứ ba. Thứ duy nhất nó nói thêm là VIỆC CÒN LẠI — chưa ai đánh dấu đã gặp — nên chỉ
 * còn đúng chừng đó.
 *
 * Nhánh cảm xúc: vế "Hệ thấy em có dấu hiệu cần được để ý" cũng đã nằm nguyên trong tiêu
 * đề ("Em cần được để ý"). Giữ lại NHÃN QUYỀN RIÊNG TƯ (ADR-026 · §9) vì đó là thứ duy
 * nhất không màn nào khác nói: cô biết CÓ chuyện, không đọc được CHUYỆN GÌ.
 */
export function describeFlag(detail: FlagSummary["detail"]): string {
  const open = detail.openHelpRequests.length;
  if (open > 0) {
    return open === 1
      ? "Chưa ai đánh dấu đã gặp"
      : `${open} lời nhắn · chưa ai đánh dấu đã gặp`;
  }
  return "Nội dung em ghi chỉ thầy cô tâm lý đọc được";
}

/**
 * Câu trả lời cho cú bấm "Cô đã gặp em rồi" — BỐN câu khác nhau cho bốn kết quả khác nhau.
 *
 * Bản cũ in đúng một chuỗi ("Người khác đã xử lý trước rồi.") cho mọi ca `updated === 0`,
 * mà `updated === 0` có ít nhất bốn nguyên nhân: người khác bấm trước · chính cô bấm
 * trước · không khớp dòng nào · RLS chặn. Tái hiện được trên hub_dev: câu đó hiện ra
 * trong khi KHÔNG AI xử lý gì cả và yêu cầu của em vẫn treo nguyên.
 *
 * `remainingOpen > 0` luôn được nói THÊM ở cuối, kể cả khi lần bấm này thành công: buồng
 * lái không tự làm tươi, nên em hoàn toàn có thể vừa gửi thêm một lời nhắn sau khi màn
 * hình này được tải. Im ở chỗ đó là để cô tin mình đã xử lý xong.
 *
 * Thuần hàm — tests/unit/gvcn-flag-card.test.ts gọi thẳng, không dựng React.
 */
export function acknowledgeHelpText(r: {
  justHandled: number;
  alreadyHandled: number;
  notFound: number;
  remainingOpen: number;
  handledByMe: boolean;
  handledByName: string | null;
  handledAt: string | null;
}): string {
  const parts: string[] = [];

  if (r.justHandled > 0) {
    parts.push(
      r.justHandled === 1
        ? "Đã đánh dấu cô đã gặp em."
        : `Đã đánh dấu cô đã gặp em (${r.justHandled} lời nhắn).`,
    );
  }

  if (r.alreadyHandled > 0) {
    const when = r.handledAt ? ` lúc ${shortTime(r.handledAt)}` : "";
    // "Chính cô" và "người khác" là hai câu chuyện khác nhau: một cái là double-tap vô
    // hại, cái kia nghĩa là có đồng nghiệp đang cùng làm việc trên em này.
    if (r.handledByMe) {
      parts.push(`Thầy cô đã đánh dấu việc này${when} rồi.`);
    } else {
      // `handledByName` null vì `core.users` không mở tên đồng nghiệp — "Thầy cô khác"
      // là sự thật đầy đủ mà màn hình biết, không phải một chỗ trống.
      parts.push(`${r.handledByName ?? "Thầy cô khác"} đã xử lý${when}.`);
    }
  }

  // RÚT NGẮN 06/08/2026: bỏ vế "màn hình có thể đã cũ" ở hai câu dưới — nó ĐOÁN hộ lý do
  // rồi mới nói việc phải làm, mà việc phải làm ("tải lại") thì giống nhau ở mọi lý do.
  if (r.notFound > 0) {
    parts.push(
      r.notFound === 1
        ? "1 lời nhắn không tìm thấy — tải lại."
        : `${r.notFound} lời nhắn không tìm thấy — tải lại.`,
    );
  }

  if (r.remainingOpen > 0) {
    parts.push(`Còn ${r.remainingOpen} lời nhắn chưa xử lý.`);
  }

  // Không rơi vào ca rỗng được (ba rổ cộng lại luôn bằng số id đã gửi, mà input đòi
  // `.min(1)`), nhưng nếu máy chủ đổi mà quên chỗ này thì im lặng vẫn là hỏng tệ nhất.
  return parts.length > 0 ? parts.join(" ") : "Đã gửi, chưa rõ kết quả — tải lại màn hình.";
}

// ---------------------------------------------------------------------------
// Khối "check-in gửi muộn" — ba hàm thuần, tách khỏi React để test được (ADR-029).
// ---------------------------------------------------------------------------

/**
 * Vì sao nút gửi đang vô hiệu — hoặc `null` khi nó bấm được.
 *
 * Một nút xám không kèm chữ là nút CHẾT CÂM: người dùng nhìn thấy thứ mình cần bấm,
 * bấm không được, và màn hình không nói vì sao. Ở đây nó còn tệ hơn mức thường vì cái
 * chặn không nằm ở nút mà nằm ở một ô nhập cách đó vài dòng — không ai tự nối hai thứ
 * đó lại nếu màn hình không nói.
 *
 * Ngưỡng 3 ký tự KHÔNG phải con số chọn ở đây: nó là `reason: z.string().trim().min(3)`
 * trong `DecideLateCheckinsInput`, và còn được database canh lần nữa (0053). Câu chữ
 * dưới đây chỉ nói ra sớm điều mà máy chủ sẽ từ chối muộn.
 */
export function lyDoChuaGuiDuoc(
  decision: LateDecision | null,
  selectedCount: number,
  reason: string,
): string | null {
  if (selectedCount === 0) return "Chọn ít nhất một em trước khi ghi kết luận.";
  if (decision === null) return "Chọn một kết luận: Có mặt, Đi muộn hoặc Vắng.";
  if (decision === "present") return null;
  const du = reason.trim().length;
  if (du === 0) {
    return `Kết luận “${LATE_DECISION_LABEL[decision]}” bắt buộc có lý do — ghi ít nhất 3 ký tự thì nút gửi mở.`;
  }
  if (du < 3) return `Lý do còn ${3 - du} ký tự nữa mới đủ 3 ký tự.`;
  return null;
}

/**
 * Đọc `{updated, skipped}` thành câu — KHÔNG được im lặng ở vế `skipped`.
 *
 * `skipped > 0` nghĩa là những dòng đó không còn ở `queued_late` lúc máy chủ ghi: hoặc
 * một đồng nghiệp đã kết luận trước, hoặc chính màn hình này đã cũ. Cả hai đều là tin
 * mà cô cần biết — nuốt nó đi thì cô đếm "đã xử 5 em" trong khi hệ chỉ đổi 3.
 *
 * `updated = 0 && skipped = 0` không rơi vào được (input đòi `.min(1)`), nhưng nếu máy
 * chủ đổi mà quên chỗ này thì im lặng vẫn là hỏng tệ nhất.
 */
export function ketQuaGhiKetLuan(
  r: { updated: number; skipped: number },
  decision: LateDecision,
): string {
  const nhan = LATE_DECISION_LABEL[decision];
  const parts: string[] = [];
  if (r.updated > 0) parts.push(`Đã ghi “${nhan}” cho ${r.updated} check-in.`);
  // RÚT NGẮN 06/08/2026: hai câu cũ kể HAI nguyên nhân có thể ("người khác kết luận
  // trước" / "màn hình đã cũ") rồi mới tới việc phải làm. Con số `skipped` là thứ bắt
  // buộc phải nói (nuốt nó đi là cô đếm 5 trong khi hệ đổi 3); nguyên nhân thì không —
  // cô không phân biệt được hai nguyên nhân đó, và cách xử giống hệt nhau.
  if (r.skipped > 0) {
    parts.push(
      r.updated > 0
        ? `${r.skipped} dòng bỏ qua — đã có kết luận trước.`
        : `Không dòng nào đổi: cả ${r.skipped} dòng đã có kết luận. Tải lại.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : "Đã gửi, chưa rõ kết quả — tải lại màn hình.";
}

/** "2026-08-01T09:12:33+07" → "09:12". Không parse được thì trả nguyên văn, KHÔNG bịa giờ. */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function newMutationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : // Trình duyệt cũ / ngữ cảnh không bảo mật: dựng UUID v4 thủ công. Không được
      // trả chuỗi bất kỳ — contract ép `.uuid()`, gửi sai là BAD_REQUEST.
      "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))).toString(16),
      );
}

export function GvcnDashboard({
  displayName,
  email,
  roles,
  classCode,
}: {
  displayName: string;
  email: string;
  roles: HubRole[];
  classCode?: string | null;
}) {
  const utils = trpc.useUtils();

  // Cùng nguồn lớp và cùng hàm chọn mặc định với bốn màn con — xem ghi chú 7 đầu file.
  const classesQuery = trpc.care.getMyClasses.useQuery();
  const myClasses = classesQuery.data?.classes ?? [];
  const { classId, classCode: pickedCode, select } = useSelectedClass(classesQuery.data?.classes);

  // `enabled` chờ biết lớp thật: gửi query khi chưa biết lớp thì máy chủ tự chọn hộ, và
  // lần render sau lớp lại đổi trước mắt người dùng (cùng lý do đã ghi ở class-roster-view).
  const dashboard = trpc.care.getDashboard.useQuery(
    { classId: classId ?? undefined },
    { enabled: classId !== null },
  );
  // `care.acknowledgeLate` không còn được gọi từ đây (ADR-029): nó chỉ biết đổi sang
  // `present` và không để lại dòng sổ nào. `care.decideLateCheckins` thay nó ở cả ba
  // kết luận và ghi `attendance.late_decisions`. Procedure cũ vẫn sống trên máy chủ cho
  // client cũ — bỏ nó là việc của gói khác, không phải một dòng sửa kèm.

  const greetName = personName(displayName) || displayName;
  // Lớp thật ưu tiên lấy từ chính buồng lái (đúng lớp đang xem); mã lớp vừa chọn rồi tới
  // `classCode` của phiên là hai bản dự phòng khi query chưa xong.
  const sidebarClass = dashboard.data?.className ?? pickedCode ?? classCode;

  const sidebar = (
    <div className="hidden md:flex md:w-[240px] md:flex-none">
      <HubSidebar roles={roles} active="cockpit" fullName={displayName} email={email} classCode={sidebarClass} />
    </div>
  );

  // Khung ngoài: dưới md là một cột cuộn được bình thường; từ md mới là bố cục
  // hai cột cao đúng màn hình. `overflow-hidden` chỉ được phép ở nhánh md.
  //
  // Tab bar CHỈ ở nhánh mobile, và nằm TRONG frame nên có mặt ở cả ba trạng thái
  // (đang tải · lỗi · có dữ liệu). Trước 31/07/2026 mọi liên kết nội bộ của màn
  // này nằm trong khối `hidden md:flex` của sidebar, nên dưới md trang không còn
  // một đường ra nào: không về /home, không sang bốn màn con, và KHÔNG ĐĂNG XUẤT
  // ĐƯỢC — mà buồng lái tải chậm hoặc lỗi mạng là lúc người ta cần lối ra nhất.
  //
  // `StaffVoice` bọc CẢ khung, kể cả nhánh đang tải và nhánh lỗi: câu lỗi mặc định của
  // query-state viết cho học sinh ("Thử lại giúp nhé"), và buồng lái xưng "nhé" với
  // GVCN là sai giọng §8 — người lớn dùng câu gọn, nghiệp vụ. Đặt ở đây thay vì truyền
  // prop xuống từng ErrorState để một màn người lớn mới thêm sau này không thể quên.
  const frame = (children: React.ReactNode) => (
    <StaffVoice>
      <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
          {/* LANDMARK <main id="noi-dung"> — thêm 02/08/2026 (gói "audit-giao-dien-chay-tron").
              Đo bằng HTTP thật, phiên Cô Vân: HTML của /gvcn chứa chuỗi "skip-link" hai
              lần (đường tắt "Bỏ qua menu, tới nội dung chính" in ở app/layout.tsx) và
              `id="noi-dung"` không lần nào. Buồng lái là ĐÍCH của nút "Buồng lái" mà năm
              màn con vừa được gắn, nên bỏ sót đúng chỗ này là để nguyên một lỗ ngay giữa
              con đường vừa vá.
              Đặt trong `frame` nên landmark có mặt ở CẢ BA trạng thái (đang tải · lỗi ·
              có dữ liệu) — đường tắt không được sống hay chết theo việc mạng nhanh hay
              chậm. Sidebar và tab bar nằm ngoài nó, nếu không thì "bỏ qua menu" không
              bỏ qua được gì. */}
          <MainContent className="flex min-w-0 flex-1 flex-col md:overflow-hidden">{children}</MainContent>
          <div className="md:hidden">
            <HubTabBar roles={roles} fullName={displayName} email={email} />
          </div>
        </div>
      </div>
    </StaffVoice>
  );

  // Danh sách lớp đi TRƯỚC: buồng lái không được vẽ một con số nào khi còn chưa biết
  // con số đó thuộc lớp nào. Ba trạng thái riêng, không gộp vào trạng thái của dashboard —
  // gộp thì lỗi tải danh sách lớp sẽ hiện thành "đang tải buồng lái" mãi mãi.
  if (classesQuery.isPending) return frame(<LoadingState label="Đang tìm lớp của thầy cô…" />);
  if (classesQuery.error) {
    return frame(
      <ErrorState
        error={classesQuery.error}
        label="danh sách lớp"
        onRetry={() => void classesQuery.refetch()}
      />,
    );
  }
  if (myClasses.length === 0) {
    return frame(
      <EmptyState
        icon="school"
        title="Thầy cô chưa được phân công chủ nhiệm lớp nào"
        // CẮT vế "Khi có lớp, buồng lái sẽ tự hiện tình hình lớp đó" (06/08/2026): nó tả
        // lại hành vi hiển nhiên của phần mềm, không nói thêm gì cho người đang đọc.
        hint="Phân công chủ nhiệm do văn phòng nhập."
      />,
    );
  }

  // Bộ chọn lớp tự ẩn khi chỉ có một lớp (ClassPicker) — nên khối này chỉ hiện với người
  // chủ nhiệm từ hai lớp trở lên. Hai điều cố ý:
  //
  //   · Nút sáng theo `classId` của BỘ CHỌN, không theo lớp trong `dashboard.data`. Đổi
  //     lớp làm đổi khoá truy vấn nên có một nhịp đang tải; nút phải sáng ngay tại cú
  //     bấm, nếu không người ta bấm lần hai vì tưởng hụt.
  //   · CẮT 06/08/2026 câu đứng cạnh bộ chọn ("Thầy cô chủ nhiệm N lớp — buồng lái đang
  //     xem lớp X."). Nó dạy người dùng cách đọc chính màn hình của họ: nút lớp đang chọn
  //     ĐÃ sáng navy, có `aria-pressed`, và mang sẵn sĩ số. Sự thật "số này của lớp nào"
  //     do THIẾT KẾ nói, không cần một câu đứng bên cạnh nói lại.
  const picker =
    myClasses.length > 1 ? (
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ClassPicker classes={myClasses} selectedId={classId} onSelect={select} />
      </div>
    ) : null;

  // Bộ chọn lớp đi kèm CẢ nhánh đang tải và nhánh lỗi: bấm sang lớp khác mà bộ chọn biến
  // mất trong lúc tải thì không còn đường bấm ngược lại, và lỗi tải lớp B sẽ khoá luôn
  // người dùng ở một màn không có lối về lớp A.
  if (dashboard.isPending) {
    return frame(
      <div className="p-4 md:p-7">
        {picker}
        <LoadingState label="Đang tải buồng lái…" />
      </div>,
    );
  }
  if (dashboard.error || !dashboard.data) {
    return frame(
      <div className="p-4 md:p-7">
        {picker}
        <ErrorState error={dashboard.error} label="buồng lái" onRetry={() => void dashboard.refetch()} />
      </div>,
    );
  }

  const d = dashboard.data;
  // Tính MỘT LẦN ở đây rồi truyền xuống: dải trạng thái và ô "hết việc" phải nói cùng một
  // câu chuyện. Gọi hai lần ở hai chỗ là mở đường cho hai câu mâu thuẫn trên cùng màn.
  const scan = scanPresentation(d.scanHealth, d.asOfDate);

  return frame(
    // `key` là lớp do MÁY CHỦ chốt (không phải lớp client vừa bấm): đổi lớp thì cả bảng
    // dựng lại từ đầu — ô cuộn về đỉnh, ghi chú đang soạn dở trong thẻ cờ không sống sót
    // sang lớp khác. Một ghi chú viết cho em này mà nằm lại dưới tên em kia là đúng loại
    // lỗi không ai phát hiện cho tới lúc đã lưu.
    <div key={d.classId} className="flex-1 p-4 md:overflow-y-auto md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          {/* <h1> chứ không phải <div> (02/08/2026). Buồng lái là trang đầu tiên một GVCN
              mở ra, và trước hôm nay nó không có heading nào: trình đọc màn hình mở
              /gvcn không có cách nào biết đây là trang gì ngoài đọc tuần tự từ đầu — đúng
              lỗi mà tests/unit/a11y-nen.test.ts đã gọi tên cho nhóm màn học sinh. Cỡ chữ,
              màu, khoảng cách giữ nguyên từng pixel: đây là đổi THẺ, không đổi thiết kế. */}
          {/* 👋 đã bỏ 05/08/2026. DESIGN-GUIDELINES §4 cho emoji trong lời chào HỌC SINH,
              và `tests/unit/giong-noi.test.ts` khoá đúng một chỗ được phép có nó (lời chào
              của trang chủ, sau điều kiện về vai học sinh). Đây là buồng lái nghiệp vụ của
              người lớn — cùng luật hai giọng (§8) đã bắt màn này bỏ "nhé". */}
          <h1 className="text-[20px] font-black text-navy md:text-[24px]">Chào {greetName}</h1>
          <div className="mt-1 text-[13px] font-semibold text-subtle">
            GVCN {classLabel(d.className)} · {d.totals.totalStudents} học sinh
          </div>
        </div>
        {/* CON SỐ NÀY PHẢI DẪN ĐI ĐÂU ĐÓ (sửa 05/08/2026, chủ đầu tư: "không ấn được thì
            hiện lên làm gì").
            Nó vốn là một <span> trơ: nói với cô rằng lớp có hồ sơ chăm sóc đang mở, rồi để
            cô tự đi tìm xem hồ sơ của EM NÀO. Danh sách lớp là chỗ duy nhất trả lời được câu
            đó — cột "Chăm sóc" ở đó hiện chip `hasOpenCase` cho từng em.
            Khi con số bằng 0 thì KHÔNG bọc link: một cái nút dẫn tới danh sách không có gì
            để xem cũng là một lời hứa suông, chỉ khác là hứa nhỏ hơn. */}
        {d.totals.openCareCases > 0 ? (
          <Link
            href="/gvcn/lop"
            className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#E9ECF2] bg-white px-[15px] py-2.5 hover:border-navy"
          >
            {/* aria-hidden: chữ ngay cạnh đã nói đủ. 10 icon khác trong file này đã khai
                đúng; thiếu ở đây thì trình đọc màn hình đọc thành "folder_open 2 hồ sơ…". */}
            <span className="msr text-[17px] text-gold-textDark" aria-hidden>
              folder_open
            </span>
            <span className="text-[12px] font-extrabold text-cardtitle2">
              {d.totals.openCareCases} hồ sơ chăm sóc đang mở
            </span>
            <span aria-hidden className="msr text-[16px] text-subtle">chevron_right</span>
          </Link>
        ) : (
          <span className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#E9ECF2] bg-white px-[15px] py-2.5">
            <span className="msr text-[17px] text-subtle" aria-hidden>
              folder_open
            </span>
            <span className="text-[12px] font-extrabold text-cardtitle2">Chưa có hồ sơ chăm sóc nào đang mở</span>
          </span>
        )}
      </div>

      {picker}

      {/* GỠ 06/08/2026 (ADR-030) — dải trạng thái bộ quét `<ScanBanner scan={scan} />`
          đứng ở đúng chỗ này từ 01/08. Nó chiếm cả một hàng ngang trên đầu năm ô số để
          cảnh báo một thứ chỉ ảnh hưởng ĐÚNG MỘT ô trong năm.
          Sự thật KHÔNG mất, chỉ đổi chỗ đứng: dòng phụ của ô "Em cần để ý" nay tự nói
          nó đang là số của lượt quét nào (`dongPhuEmCanDeY`), và ô "hết việc" mang câu
          của từng trạng thái quét (`boardEmptyPresentation`). `scan` vẫn được tính một
          lần ở trên và truyền xuống cả hai — hai chỗ đọc cùng một phép tính thì không
          thể nói ngược nhau. */}

      {/* GỠ 02/08/2026 — dải "Nguồn dữ liệu chưa tươi: <tên nguồn kỹ thuật>". Nó nói với
          cô giáo bằng tên bảng dữ liệu ("Dấu chân hoạt động") về một thứ cô không sửa
          được, ngay cạnh bốn con số cô cần đọc. Sức khoẻ nguồn dữ liệu vẫn được canh ở
          đúng chỗ của nó — `ops.v_rule_health` bật đèn cho người trực máy (0043) và kênh
          báo động 0051 đẩy tin đi. Bỏ ở đây không làm mất phép đo nào, chỉ thôi đặt nó
          trước mặt người không có việc gì để làm với nó. */}

      {/* Năm thẻ, không còn bốn ([QĐ-3]). Thẻ "Chưa điểm danh" thêm 01/08/2026 vì thẻ
          "Vắng" một mình đọc sai: nó đếm `status = 'absent'`, nên buổi sáng chưa ai ghi
          gì thì nó bằng 0 và phụ đề in "không có ai vắng" — một kết luận dựng từ im lặng,
          đúng thứ Rev F điều 3 cấm. Nay phụ đề của thẻ Vắng phụ thuộc vào thẻ bên cạnh:
          còn em chưa điểm danh thì nó nói thẳng là chưa kết luận được. */}
      {/* DƯỚI md: MỘT HÀNG CUỘN NGANG, không phải ba hàng xếp chồng (sửa 05/08/2026).
          Đo trên máy 390px: năm thẻ `basis-[150px]` gói thành 3 hàng ≈ 330px, cộng đầu
          trang và dải trạng thái thì khối "Việc cần làm sáng nay" bắt đầu ở khoảng 560px —
          tức là DƯỚI mép màn hình đầu. PRODUCT.md ghi ràng buộc của vai này là "thông tin
          quan trọng nhất nằm trên màn hình đầu, không cần cuộn", mà cô mở buồng lái lúc
          7h sáng để biết PHẢI LÀM GÌ, không phải để đọc năm con số.
          Chọn dải cuộn thay vì đảo thứ tự hai khối: năm con số là câu trả lời cho "hôm nay
          lớp thế nào", nên chúng vẫn phải đứng TRƯỚC danh sách việc — đảo xuống dưới là
          đổi thứ tự đọc ở cả DOM lẫn màn hình, và cô sẽ tìm chúng ở chỗ chúng không còn
          nữa. Một hàng cao ~118px thì việc-cần-làm lên tới ~350px: nằm gọn trên màn đầu.
          `tabIndex` + `role=group`: một vùng cuộn không có chỗ đứng cho bàn phím thì phần
          nội dung nằm ngoài mép phải chỉ tới được bằng ngón tay. */}
      <div
        role="group"
        aria-label="Số liệu lớp hôm nay"
        tabIndex={0}
        className="mt-[18px] -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:gap-4 md:overflow-visible md:px-0 md:pb-0"
      >
        <StatCard label="Đã check-in" icon="how_to_reg" iconBg="bg-[#E3F8ED]" iconColor="text-[#00A05F]" value={`${d.totals.checkinCount}/${d.totals.totalStudents}`} sub="tính đến giờ" />
        <StatCard label="Chờ xác nhận" icon="hourglass_top" iconBg="bg-[#FFF1C9]" iconColor="text-[#E8940D]" value={String(d.totals.pendingLateCount)} sub="gửi muộn — chưa phải vắng" accentTop="#FFC629" />
        {/* "Cờ đang mở" → "Em cần để ý" (02/08/2026). Chủ đầu tư mở trang và hỏi thẳng:
            "cờ đang mở là cờ gì?" — câu hỏi đó CHÍNH LÀ câu trả lời về cái nhãn. "Cờ" là
            từ của người làm hệ thống; con số này đếm SỐ EM mà bộ quét thấy có dấu hiệu
            cần xem. Nhãn mới nói đúng thứ đang đếm, và trùng với từ "cần để ý" mà em học
            sinh và phụ huynh đã đọc ở các màn khác — một khái niệm, một từ. */}
        {/* DÒNG PHỤ CỦA Ô NÀY LÀ CHỖ NÓI SỰ THẬT VỀ LƯỢT QUÉT (06/08/2026, ADR-030 +
            Rev F điều 8). Bốn ô kia đếm thẳng từ `attendance.checkins` trong chính lượt
            gọi nên chúng tươi bằng lúc mở trang; chỉ ô này đếm cờ do BỘ QUÉT sinh, tức
            chỉ nó có thể là số của hôm kia mà trông như số của sáng nay.
            Câu "chưa em nào" vì thế KHÔNG còn được in vô điều kiện — `dongPhuEmCanDeY`
            chỉ trả về nó khi có phép đo của hôm nay đứng sau. */}
        <StatCard label="Em cần để ý" icon="flag" iconBg="bg-[#FFF0F0]" iconColor="text-dangerText" value={String(d.priorityFlags.length)} sub={dongPhuEmCanDeY(scan, d.priorityFlags.length)} accentTop={d.priorityFlags.length > 0 ? "#F0474D" : undefined} />
        <StatCard
          label="Vắng"
          icon="person_off"
          iconBg="bg-[#FFF0F0]"
          iconColor="text-[#C0272D]"
          value={String(d.totals.absentCount)}
          sub={absentSubtitle(d.totals.absentCount, d.totals.notCheckedInCount)}
        />
        <StatCard
          label="Chưa điểm danh"
          icon="remove"
          iconBg="bg-[#F1F4F8]"
          iconColor="text-subtle"
          value={String(d.totals.notCheckedInCount)}
          sub={
            d.totals.notCheckedInCount === 0
              ? "cả lớp đã có dòng điểm danh"
              : "chưa ai ghi — không phải vắng"
          }
        />
      </div>

      {/* CHỈ mobile — trên md bốn đích này đã có trong sidebar, vẽ lại là thừa.
          Lưới 4 cột, tile 52px, nhãn 10px: đúng mẫu "lưới mini app" của §6. */}
      <nav aria-label="Màn hình lớp chủ nhiệm" className="mt-[18px] grid grid-cols-4 gap-3 md:hidden">
        {GVCN_SCREENS.map((screen) => (
          <Link
            key={screen.key}
            href={screen.href}
            className="flex min-h-[44px] flex-col items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className="flex h-[52px] w-[52px] items-center justify-center rounded-[17px] bg-gradient-to-br from-[#2A5DA8] to-navy shadow-[0_5px_12px_rgba(10,42,94,.3)]"
            >
              <span className="msr text-[25px] text-white">{screen.icon}</span>
            </span>
            <span className="text-center text-[10px] font-bold leading-tight text-cardtitle2">{screen.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-[18px] flex flex-wrap items-start gap-[18px]">
        <div className="min-w-0 flex-[2_1_320px] flex flex-col gap-4 md:flex-[2_1_540px]">
          {/* <h2> chứ không phải <div> (05/08/2026). Trang có <h1> "Chào …" ở đầu, rồi hai
              cột này là hai mục ngang cấp — mà trước hôm nay cả hai đều là <div>, nên
              trình đọc màn hình mở buồng lái chỉ có ĐÚNG MỘT mốc cho cả trang: không nhảy
              được tới danh sách việc, phải nghe tuần tự qua năm thẻ số.
              Class giữ nguyên từng ký tự — đổi THẺ, không đổi thiết kế. */}
          <h2 className="text-[16px] font-black text-navy">Việc cần làm sáng nay</h2>

          {d.priorityFlags.map((flag) => (
            <FlagCard key={flag.flagId} flag={flag} />
          ))}

          {/* KHÔNG bọc trong `{length > 0 && …}` nữa (06/08/2026): khối tự quyết định
              khi nào biến mất. Ghi xong lượt cuối thì `getDashboard` được làm mới, danh
              sách rỗng, và nếu điều kiện nằm ở đây thì khối bị tháo NGAY cùng lúc với
              câu trả lời của máy chủ — cô bấm "Vắng" cho 3 em rồi màn hình sạch trơn,
              không một chữ nào nói đã ghi được mấy dòng. */}
          <LateCheckinBoard items={d.pendingLateCheckins} />

          {d.priorityFlags.length === 0 && d.pendingLateCheckins.length === 0 && (
            <BoardEmpty scan={scan} openCareCases={d.totals.openCareCases} />
          )}
        </div>

        <div className="min-w-0 flex-[1_1_280px] flex flex-col gap-4">
          {/* GỠ ô "Cảm xúc lớp hôm nay" khỏi buồng lái (02/08/2026). Chủ đầu tư: "nếu bị
              khoá rồi thì hiển thị lên đây làm gì".
              Ô này KHÔNG có dữ liệu, KHÔNG có việc để làm, và chỉ lặp lại một quy định đã
              có hiệu lực từ 01/08. Lý do cũ để giữ nó — "bỏ đi thì cô tưởng màn hình
              hỏng" — đúng ở TUẦN ĐẦU đổi quy định, không đúng sau một tháng.
              Câu đó KHÔNG biến mất khỏi sản phẩm: nó vẫn đứng ở đúng chỗ người ta thật sự
              đi tìm cảm xúc của một em — `gvcn/student-detail-view.tsx`, ngay dưới lịch
              điểm danh. Nói một lần ở đúng chỗ, thay vì nói mọi lúc ở chỗ không liên quan. */}
          <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
            <h2 className="text-[15px] font-black text-navy">Hành động gần đây</h2>
            <div className="mt-3.5 flex flex-col gap-3">
              {d.recentActions.length === 0 && (
                // "Chưa ai ghi" chứ không phải "chưa có hành động nào": sổ can thiệp chỉ
                // biết việc ĐƯỢC GHI VÀO HỆ THỐNG. Cô gọi điện cho phụ huynh mà không ghi
                // lại thì ô này vẫn trống — trống ở đây nói về cái sổ, không nói về lớp.
                // "Chưa ai GHI" chứ không phải "chưa có hành động nào" — sổ chỉ biết việc
                // được ghi vào. Giữ đúng bốn chữ đó là đủ; câu giải thích phía sau nói lại
                // chính điều bốn chữ đã nói.
                <p className="text-[12px] leading-relaxed text-muted">Chưa ai ghi hành động nào.</p>
              )}
              {d.recentActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className={`mt-[5px] h-[9px] w-[9px] flex-none rounded-full ${i === 0 ? "bg-[#2C7BF2]" : "bg-line2"}`} />
                  <span className="text-[12.5px] leading-relaxed text-[#4A5460]">
                    {a.action} — {a.studentName} · {timeAgo(a.occurredAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* GỠ 02/08/2026 khối "Từ 'cờ / ngưỡng' chỉ dùng ở đây…". Đó là một lời dặn cho
              NGƯỜI VIẾT PHẦN MỀM, in nhầm lên màn hình của người dùng: cô giáo không phải
              là người quyết định từ nào đi vào báo cáo phụ huynh. Luật đó vẫn sống ở nơi
              nó thi hành được — `tests/unit/giong-noi.test.ts` chặn từ vựng vận hành lọt
              sang bề mặt học sinh/phụ huynh, và chặn bằng CI chứ không bằng một dòng chữ. */}
        </div>
      </div>
    </div>,
  );
}

/* Ở đây từng có `ScanBanner` — dải trạng thái bộ quét chạy suốt bề ngang, ngay trên năm
   ô số. Gỡ 06/08/2026 theo ADR-030 (chủ đầu tư quyết trực tiếp).

   KHÔNG để lại component "phòng khi cần", cùng lý do đã ghi hai lần trong file này khi
   cắt bảng tra cảm xúc và `MoodClosedCard`: một thành phần không ai gọi là lời mời cho
   lần sửa sau nối lại đúng thứ vừa cắt.

   Nghĩa vụ nói thì KHÔNG gỡ — Rev F điều 8 chỉ đổi chỗ nói. Hai chỗ nhận lại nó, và cả
   hai đều đã dựng: dòng phụ của ô "Em cần để ý" (`dongPhuEmCanDeY`, hiện MỌI LÚC ngay
   cạnh con số nó nói về) và ô "hết việc" (`boardEmptyPresentation`, nay mang câu riêng
   của từng trạng thái quét thay vì một câu chung). */

/* Ở đây từng có `moodClosedText()` + `MoodClosedCard` — ô "Cảm xúc lớp hôm nay" chỉ để
   nói vì sao nó không còn nội dung. Gỡ 02/08/2026 (chủ đầu tư: "nếu bị khoá rồi thì hiển
   thị lên đây làm gì").

   KHÔNG để lại hàm "phòng khi cần": một hàm không ai gọi là lời mời cho lần sửa sau nối
   lại đúng thứ vừa cắt — chính chú thích ở đầu file này đã nói câu đó khi cắt bảng tra
   cảm xúc, và nó vẫn đúng.

   Sự thật KHÔNG mất: `gvcn/student-detail-view.tsx` vẫn nói "Nhật ký cảm xúc từng ngày
   chỉ thầy cô tâm lý đọc được", ngay dưới lịch điểm danh của từng em — tức ở đúng chỗ
   người ta đi tìm nó, thay vì ở chỗ người ta đi tìm việc phải làm sáng nay. */

/**
 * Ô "không còn việc nào" của buồng lái. Câu "tốt thật sự" là một KẾT LUẬN, chỉ được in ra
 * khi có phép đo của hôm nay VÀ không còn hồ sơ chăm sóc nào đang mở — xem
 * `boardEmptyPresentation` trong components/gvcn/scan-status.ts.
 */
function BoardEmpty({ scan, openCareCases }: { scan: ScanPresentation; openCareCases: number }) {
  const look = boardEmptyPresentation(scan, openCareCases);
  return (
    <div className={`flex items-center gap-3.5 rounded-[20px] px-5 py-[18px] ${look.boxClass}`}>
      {look.showMascot ? (
        <Mascot pose="thumbsup" width={44} />
      ) : (
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white">
          <span className="msr text-[22px] text-subtle" aria-hidden>
            {look.icon}
          </span>
        </span>
      )}
      <div>
        <div className={`text-[14px] font-black ${look.titleClass}`}>{look.title}</div>
        <div className={`mt-0.5 text-[12px] leading-relaxed ${look.bodyClass}`}>{look.body}</div>
      </div>
    </div>
  );
}

/**
 * Khối "check-in gửi muộn" — ADR-029, dựng lại 06/08/2026.
 *
 * Bản cũ: MỘT dòng "N check-in gửi muộn — chờ cô xác nhận" + một nút "Xác nhận cả N".
 * Nó hỏng ở ba chỗ cùng lúc, và cả ba đều do chủ đầu tư chỉ ra khi mở buồng lái thật:
 *   · không có GIỜ GỬI, mà đó chính là dữ kiện quyết định (07:55 khác hẳn 10:20);
 *   · không chọn được từng em — hoặc duyệt cả lớp, hoặc không làm gì;
 *   · chỉ có một kết luận (`present`), nên cô nhìn thấy chỗ ngồi trống mà đường duy
 *     nhất để ghi lại điều đó là mở CSDL sửa tay.
 *
 * BA THỨ CỐ Ý trong bản này:
 *
 *   1. `items` KHÔNG được coi là danh sách cố định. Mỗi lần render, phần đã chọn được
 *      lọc lại theo danh sách đang có — một em vừa bị đồng nghiệp kết luận trước sẽ rời
 *      danh sách, và id của em đó không được lẳng lặng đi theo lượt gửi kế tiếp.
 *   2. Khối tự quyết định khi nào biến mất (`items` rỗng VÀ chưa có kết quả nào để nói),
 *      thay vì để nơi gọi tháo nó ngay lúc máy chủ vừa trả lời. Ghi xong mà màn hình
 *      sạch trơn không một chữ nào là kiểu im lặng tệ nhất: cô không biết đã ghi mấy dòng.
 *   3. `clientMutationId` sinh một lần mỗi lượt soạn (§9): bấm hai lần vì mạng chậm là
 *      CÙNG một quyết định, không phải hai. Sinh mã mới chỉ sau khi ghi xong một lượt thật.
 */
function LateCheckinBoard({ items }: { items: PendingLateCheckin[] }) {
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<LateDecision | null>(null);
  const [reason, setReason] = useState("");
  const [mutationId, setMutationId] = useState(newMutationId);
  // Kết luận của lượt VỪA GỬI, giữ riêng: `onSuccess` xoá `decision` để màn hình sạch cho
  // lượt sau, nên câu xác nhận không đọc được nhãn từ đó nữa. Đọc `decide.variables` thì
  // đúng dữ liệu nhưng sai kiểu (nó là `… | undefined` với mọi lượt render trước lượt gửi
  // đầu tiên), và một `?? "Có mặt"` để chiều kiểu là bịa nhãn cho một dòng đã ghi vào sổ.
  const [daGui, setDaGui] = useState<LateDecision | null>(null);

  const decide = trpc.care.decideLateCheckins.useMutation({
    onSuccess: () => {
      setSelectedIds([]);
      setDecision(null);
      setReason("");
      setMutationId(newMutationId());
      void utils.care.getDashboard.invalidate();
    },
  });

  // Lọc theo danh sách ĐANG CÓ, không tin vào state cũ — xem ghi chú 1 ở trên.
  const conTrenMan = new Set(items.map((c) => c.checkinId));
  const selected = selectedIds.filter((id) => conTrenMan.has(id));
  const chonHet = items.length > 0 && selected.length === items.length;

  const viSaoChuaGui = lyDoChuaGuiDuoc(decision, selected.length, reason);
  const guiDuoc = viSaoChuaGui === null && !decide.isPending;
  const doiLyDo = decision === "late" || decision === "absent";

  function boChon() {
    setSelectedIds([]);
    setDecision(null);
    setReason("");
  }

  function gui() {
    if (decision === null || viSaoChuaGui !== null) return;
    setDaGui(decision);
    decide.mutate({
      checkinIds: selected,
      decision,
      // "Có mặt" không đòi lý do (contract `.refine`), và gửi kèm một chuỗi soạn dở cho
      // kết luận không cần nó là ghi vào sổ một câu không ai hỏi.
      reason: decision === "present" ? undefined : reason.trim(),
      clientMutationId: mutationId,
    });
  }

  const xacNhan = decide.isSuccess && daGui ? ketQuaGhiKetLuan(decide.data, daGui) : null;

  if (items.length === 0 && xacNhan === null) return null;

  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] border-l-[5px] border-domain-attendance bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-surface-info">
          <span className="msr text-[22px] text-link" aria-hidden>
            schedule
          </span>
        </span>
        <div className="min-w-0">
          {/* Hai tiêu đề cho hai tình huống. Khối này còn sống thêm một nhịp sau khi danh
              sách đã rỗng, để câu xác nhận ở cuối kịp được đọc — mà in "0 check-in gửi
              muộn — chờ cô kết luận" lúc đó là mời cô đi làm một việc không còn nữa. */}
          <h3 id="gui-muon-tieu-de" className="text-[14.5px] font-black text-ink">
            {items.length > 0
              ? `${items.length} check-in gửi muộn — chờ cô kết luận`
              : "Đã kết luận xong các check-in gửi muộn"}
          </h3>
          {/* "gửi muộn ≠ vắng" là ràng buộc nghiệp vụ không thương lượng (PRODUCT.md,
              ADR-007) nên NGHĨA ở lại; hình thức thì đổi (06/08/2026).
              Câu cũ dài hai dòng và chở ba việc: phân biệt trạng thái, nói ai là người
              kết luận, và nhắc lý do bắt buộc. Việc thứ ba đã có chỗ riêng — `lyDoChuaGuiDuoc`
              in ra ngay dưới nút gửi, đúng lúc nó chặn. Việc thứ hai thì chính bốn cái nút
              bên dưới đã nói. Còn lại đúng một CHIP cho việc thứ nhất. */}
          {items.length > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-warn px-2.5 py-1 text-[10.5px] font-black text-gold-textDark">
              <span className="msr text-[14px]" aria-hidden>
                schedule
              </span>
              Gửi muộn ≠ vắng
            </span>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <>
          {/* Ô chọn tất cả là CHECKBOX THẬT, không phải một nút đổi màu (§11): trạng thái
              chọn phải đọc được cả bằng tai lẫn khi không phân biệt được màu. `indeterminate`
              đặt qua callback ref — nó không phải thuộc tính HTML, chỉ có ở DOM property,
              nên React không tự đặt được; thiếu nó thì "đã chọn một nửa" trông y hệt
              "chưa chọn gì". */}
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl bg-surface-alt px-3">
            <input
              type="checkbox"
              className="h-5 w-5 flex-none accent-navy"
              checked={chonHet}
              ref={(el) => {
                if (el) el.indeterminate = selected.length > 0 && !chonHet;
              }}
              onChange={() => setSelectedIds(chonHet ? [] : items.map((c) => c.checkinId))}
            />
            <span className="text-[12.5px] font-black text-cardtitle2">
              {chonHet ? "Bỏ chọn tất cả" : "Chọn tất cả"} ({items.length} em)
            </span>
          </label>

          <ul aria-labelledby="gui-muon-tieu-de" className="flex flex-col gap-1.5">
            {items.map((c) => {
              const dangChon = selected.includes(c.checkinId);
              return (
                <li key={c.checkinId}>
                  {/* Cả dòng là <label> nên vùng chạm bằng chiều rộng danh sách, không
                      bằng 20px của ô tick (§11 · WCAG 2.5.5). `min-w-0` + `truncate` ở
                      tên: ở 360px một cái tên dài phải bị cắt, không được đẩy giờ gửi
                      ra ngoài mép — giờ gửi mới là thứ cô cần đọc để quyết định. */}
                  <label
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-1.5 ${
                      dangChon ? "border-navy bg-surface-infoSoft" : "border-line bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 flex-none accent-navy"
                      checked={dangChon}
                      onChange={() =>
                        setSelectedIds((cu) =>
                          cu.includes(c.checkinId)
                            ? cu.filter((id) => id !== c.checkinId)
                            : [...cu, c.checkinId],
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                      {c.studentName}
                    </span>
                    <span className="flex flex-none items-center gap-1 text-[12.5px] font-black tabular-nums text-cardtitle2">
                      <span className="msr text-[15px] text-subtle" aria-hidden>
                        schedule
                      </span>
                      {/* Nhãn cho tai: một con số 07:55 đứng trơ không nói nó là giờ gì. */}
                      <span className="sr-only">gửi lúc </span>
                      {c.occurredAtTime}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2.5 rounded-xl bg-surface-alt p-3">
            {/* `role="status"` để số em đang chọn được đọc lên sau mỗi lần tick — không có
                nó thì người dùng bàn phím tick năm lần mà không nghe được mình đang ở đâu. */}
            <div role="status" className="text-[12px] font-extrabold text-cardtitle2">
              Đang chọn {selected.length}/{items.length} em
            </div>

            <div className="flex flex-wrap gap-2">
              {LATE_DECISIONS.map((k) => {
                const dangChon = decision === k;
                return (
                  <button
                    key={k}
                    type="button"
                    // aria-pressed + icon đổi hình: §11 cấm để trạng thái chọn chỉ khác
                    // nhau ở màu nền.
                    aria-pressed={dangChon}
                    onClick={() => {
                      setDecision(k);
                      if (k === "present") setReason("");
                    }}
                    className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.6px] px-4 py-2.5 text-[12.5px] font-black ${
                      dangChon ? DECISION_ON[k] : "border-line bg-white text-subtle"
                    }`}
                  >
                    <span className="msr text-[16px]" aria-hidden>
                      {dangChon ? "check_circle" : "radio_button_unchecked"}
                    </span>
                    {LATE_DECISION_LABEL[k]}
                  </button>
                );
              })}
            </div>

            {doiLyDo && (
              <div className="flex flex-col gap-1.5">
                {/* Nhãn thật, không phải placeholder: placeholder biến mất ngay khi gõ ký
                    tự đầu (WCAG 3.3.2), mà đây là ô đi thẳng vào `attendance.late_decisions`. */}
                {/* CẮT vế "(dòng này vào sổ, kèm tên cô và giờ ghi)" — mô tả cơ chế ghi
                    sổ. Cái cô cần biết ở đây là ô này BẮT BUỘC, và chừng đó đã đủ. */}
                <label className="text-[12px] font-black text-cardtitle2" htmlFor="gui-muon-ly-do">
                  Vì sao kết luận “{LATE_DECISION_LABEL[decision]}”? (bắt buộc)
                </label>
                <textarea
                  id="gui-muon-ly-do"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Ví dụ: gia đình đã báo nghỉ…"
                  className="w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-navy"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={!guiDuoc}
                onClick={gui}
                // Nút vô hiệu phải nói được VÌ SAO, và nói cho cả tai: `aria-describedby`
                // trỏ tới đúng câu đang hiện bên dưới.
                aria-describedby={viSaoChuaGui ? "gui-muon-vi-sao" : undefined}
                className="min-h-[44px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
              >
                {decide.isPending
                  ? "Đang ghi…"
                  : decision && selected.length > 0
                    ? `Ghi “${LATE_DECISION_LABEL[decision]}” cho ${selected.length} em`
                    : "Ghi kết luận"}
              </button>
              {/* NHÃN NÓI ĐÚNG VIỆC, THAY CHO MỘT ĐOẠN GIẢI THÍCH (06/08/2026).
                  Nút cũ tên "Để sau" rồi phải có một đoạn văn phía dưới đính chính rằng
                  "Để sau" chỉ bằng bỏ chọn — không gọi máy chủ, không đổi trạng thái em
                  nào. Đổi tên nút thành đúng việc nó làm thì đoạn đính chính đó hết lý do
                  tồn tại; đây là chỗ thiết kế nói thay chữ viết, không phải chỗ bớt nghĩa. */}
              <button
                type="button"
                onClick={boChon}
                className="min-h-[44px] px-2 text-[12.5px] font-extrabold text-subtle underline underline-offset-2"
              >
                Bỏ chọn
              </button>
            </div>

            {viSaoChuaGui && (
              <p id="gui-muon-vi-sao" className="text-[11.5px] font-semibold leading-relaxed text-muted">
                {viSaoChuaGui}
              </p>
            )}

            {/* GỠ 06/08/2026 đoạn ""Để sau" chỉ bỏ chọn: không gọi máy chủ, không đổi
                trạng thái em nào…". Nó tồn tại chỉ vì cái nút mang một cái tên nói quá
                việc nó làm. Nút nay tên "Bỏ chọn" (xem ghi chú ở đó), nên đoạn văn này là
                lời đính chính cho một hiểu nhầm không còn nữa.
                Luật thì KHÔNG đổi: vẫn không có `status = 'de_sau'` nào trong dữ liệu, và
                nút này vẫn tuyệt đối không gọi máy chủ. */}
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <MutationError error={decide.error} onRetry={gui} />
        {xacNhan && <MutationSuccess>{xacNhan}</MutationSuccess>}
      </div>
    </div>
  );
}

/**
 * Nền + chữ của nút kết luận ĐANG CHỌN. Tách ra khỏi JSX để đọc được bằng một phép kiểm
 * tương phản, đúng cách `CHOICE_STYLE` của màn điểm danh đang làm.
 *
 * Đo trên nền thật (WCAG 2.x): #00693F/#E3F8ED = 6,12:1 · #8A5A00/#FFF1C9 = 5,27:1 ·
 * #C7333A/#FFF5F5 = 4,95:1. Nút chưa chọn: #5B6B80 trên trắng = 5,44:1.
 */
const DECISION_ON: Record<LateDecision, string> = {
  present: "border-[#00A05F] bg-surface-success text-successText",
  late: "border-gold-dark bg-surface-warn text-gold-textDark",
  absent: "border-dangerText bg-surface-danger text-dangerText",
};

/**
 * Một thẻ cờ = một em cần cô để mắt tới. Tách thành component riêng vì mỗi thẻ có
 * trạng thái riêng: nội dung ghi chú, mã chống trùng (§9), và ba mutation độc lập
 * (ghi can thiệp · đã gặp em rồi · đóng hồ sơ) — trạng thái lỗi/thành công của em
 * này không được hiện dưới tên em kia.
 */
function FlagCard({ flag }: { flag: FlagSummary }) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [closing, setClosing] = useState(false);
  // §9 — sinh MỘT LẦN mỗi lần soạn. Gửi lại cùng mã (double-tap, retry mạng) là
  // cùng một hành động; sinh mã mới chỉ sau khi đã ghi xong một hành động thật.
  const [mutationId, setMutationId] = useState(newMutationId);

  const invalidate = () => utils.care.getDashboard.invalidate();
  const logIntervention = trpc.care.logIntervention.useMutation({
    onSuccess: () => {
      setNote("");
      setMutationId(newMutationId());
      void invalidate();
    },
  });
  const acknowledgeHelp = trpc.care.acknowledgeHelpRequest.useMutation({ onSuccess: () => void invalidate() });
  const closeCase = trpc.care.closeCase.useMutation({
    onSuccess: () => {
      setClosing(false);
      setResolution("");
      void invalidate();
    },
  });

  const look = urgencyPresentation(flag);
  const openHelp = flag.detail.openHelpRequests;

  function submitIntervention() {
    logIntervention.mutate({
      // `flag.caseId ?? flag.flagId` là ĐÚNG, không phải chỗ vá tạm: contract
      // LogInterventionInput.caseId cố tình KHÔNG ép .uuid(), và resolveOpenCase()
      // trong server/routers/care.ts nhận cả dạng ghép "studentId:asOfDate" rồi tự
      // mở hồ sơ chăm sóc cho em đó. Đổi sang chặn nút khi caseId == null sẽ khoá
      // đúng những em CHƯA có hồ sơ — tức là những em cần mở hồ sơ nhất.
      caseId: flag.caseId ?? flag.flagId,
      action: "Đã trò chuyện với học sinh",
      note: note.trim() || undefined,
      clientMutationId: mutationId,
    });
  }

  return (
    <div
      className={`flex flex-col gap-3.5 rounded-[20px] bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-5 ${look.borderClass}`}
    >
      <div>
        {/* Màu viền vẫn là tín hiệu lớn nhất; nhãn chữ + icon là bản sao lưu cho
            người không đọc được màu, cho bản in đen trắng và cho màn hình chói nắng. */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-[11px] py-1.5 text-[10px] font-black tracking-wide ${look.badgeClass}`}
        >
          <span className="msr text-[14px]" aria-hidden>
            {look.icon}
          </span>
          {look.label}
        </span>
        {/* Tên em là ĐƯỜNG VÀO hồ sơ của em — cùng lý do đã ghi ở class-roster-view:
            /gvcn/hoc-sinh/<id> có trang thật nhưng đến 05/08/2026 không một href nào
            trong app trỏ tới. Ở đây nó còn cần hơn: thẻ cờ nói "em có dấu hiệu cần để ý"
            và câu hỏi kế tiếp của cô luôn là "mấy hôm nay em thế nào?" — hỏi trước khi
            bấm "Ghi can thiệp" ngay bên dưới. Không có lối đi này thì cô phải nhớ tên rồi
            mở màn khác đi tìm, và phần lớn sẽ ghi mà không xem.
            min-h-[44px] + inline-flex: padding trên <a> nội tuyến không tạo chiều cao. */}
        <div className="mt-2.5 text-[15px] font-black text-ink">
          {flag.ruleCode === "E_URGENT" ? "Em cần gặp thầy cô" : "Em cần được để ý"} ·{" "}
          <Link
            href={`/gvcn/hoc-sinh/${flag.studentId}`}
            className="inline-flex min-h-[44px] items-center text-link underline underline-offset-2"
          >
            {flag.studentName}
          </Link>
        </div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-subtle">{describeFlag(flag.detail)}</div>
        {/* NHỊP của thẻ này, in ngay dưới câu mô tả — VIỆC 4 / [QĐ-2]. Hai thẻ cạnh nhau
            trong cùng một danh sách có thể đến từ hai đồng hồ khác nhau, và người đọc
            không có cách nào tự biết điều đó. `msr` + chữ, không chỉ màu (§11). */}
        <div className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold leading-relaxed text-muted">
          <span className="msr mt-[1px] flex-none text-[14px]" aria-hidden>
            {flag.detail.cadence === "tuc_thi" ? "bolt" : "nightlight"}
          </span>
          <span>{cadenceNote(flag.detail.cadence)}</span>
        </div>
      </div>

      <label className="sr-only" htmlFor={`note-${flag.flagId}`}>
        Ghi lại đã trò chuyện gì với {flag.studentName}
      </label>
      <textarea
        id={`note-${flag.flagId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi lại đã trò chuyện gì với em…"
        rows={2}
        // Token `subtle` (#5B6B80) = 5,44:1 trên trắng. globals.css đã đặt đúng màu này làm lưới an toàn
        // cho mọi ::placeholder; khai lại ở đây là cố ý — ô này là chỗ GVCN ghi lời đã
        // nói với một đứa trẻ, không được phụ thuộc vào việc lưới an toàn còn sống.
        className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-navy"
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={logIntervention.isPending}
          onClick={submitIntervention}
          className="min-h-[44px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
        >
          {logIntervention.isPending ? "Đang ghi…" : "Ghi can thiệp"}
        </button>

        {/* Chỉ có nghĩa khi em ĐANG có yêu cầu treo: nút này tắt đúng những dòng đó
            (attendance.help_requests.handled_at), không đụng tới cờ cảm xúc.

            HAI thứ đổi 01/08/2026, và cả hai đều là sửa lỗi tái hiện được:
              · Gửi TẬP ID đang hiện trên thẻ, không gửi `flag.asOfDate`. Ngày suy từ
                trường hiển thị là nguyên nhân cờ khẩn không tắt được (xem
                `acknowledgeHelpRequest` trong routers/care.ts).
              · Bỏ `isSuccess` khỏi điều kiện `disabled`. Trước đây bấm xong một lần là
                nút xám vĩnh viễn cho tới khi thẻ được dựng lại — kể cả khi cờ VẪN CÒN
                trên màn. Cô nhìn thấy một cờ đỏ với một nút xám và không có chữ nào giải
                thích. Trạng thái nút nay suy từ DỮ LIỆU (còn yêu cầu treo thì còn bấm
                được), không suy từ lịch sử của lời gọi trước. */}
        {openHelp.length > 0 && (
          <button
            type="button"
            disabled={acknowledgeHelp.isPending}
            onClick={() =>
              acknowledgeHelp.mutate({
                studentId: flag.studentId,
                helpRequestIds: openHelp.map((h) => h.helpRequestId),
              })
            }
            className="min-h-[44px] rounded-xl border-[1.6px] border-[#00A05F] bg-[#E3F8ED] px-5 py-3 text-[12.5px] font-black text-successText disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
          >
            {acknowledgeHelp.isPending
              ? "Đang ghi…"
              : openHelp.length > 1
                ? `Cô đã gặp em rồi (${openHelp.length} lời nhắn)`
                : "Cô đã gặp em rồi"}
          </button>
        )}

        {/* closeCase đòi UUID thật (CloseCaseInput.caseId là .uuid()) — cờ chưa có
            hồ sơ thì KHÔNG có gì để đóng, ẩn hẳn nút thay vì gửi một mã sai. */}
        {flag.caseId && !closing && (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="min-h-[44px] rounded-xl border-[1.5px] border-[#E4E9F0] bg-white px-5 py-3 text-[12.5px] font-extrabold text-subtle"
          >
            Đóng hồ sơ
          </button>
        )}
      </div>

      {flag.caseId && closing && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-[#F7FAFF] p-3.5">
          {/* CẮT vế "để lần sau còn học được từ nó" — biện minh cho một ô đã ghi rõ là
              bắt buộc. */}
          <label className="text-[12px] font-black text-cardtitle2" htmlFor={`close-${flag.flagId}`}>
            Vì sao đóng hồ sơ này? (bắt buộc)
          </label>
          <textarea
            id={`close-${flag.flagId}`}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={2}
            placeholder="Ví dụ: em đã ổn định, đã bàn giao…"
            className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-navy"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={closeCase.isPending || resolution.trim().length === 0}
              onClick={() => closeCase.mutate({ caseId: flag.caseId!, resolution: resolution.trim() })}
              className="min-h-[44px] rounded-xl bg-[#0F172A] px-5 py-2.5 text-[12.5px] font-black text-white disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
            >
              {closeCase.isPending ? "Đang đóng…" : "Xác nhận đóng"}
            </button>
            <button
              type="button"
              onClick={() => setClosing(false)}
              className="min-h-[44px] px-2 text-[12.5px] font-extrabold text-subtle underline underline-offset-2"
            >
              Thôi
            </button>
          </div>
        </div>
      )}

      {/* Kết quả của TỪNG mutation, ngay dưới nhóm nút — im lặng sau khi bấm là
          cách nhanh nhất khiến GVCN tin nhầm rằng đã lưu. */}
      <div className="flex flex-col gap-1.5">
        <MutationError error={logIntervention.error} onRetry={submitIntervention} />
        {logIntervention.isSuccess && (
          <MutationSuccess>
            {/* CẮT vế "— không ghi thêm dòng mới" (06/08/2026): đó là mô tả cơ chế chống
                trùng, đúng thứ chủ đầu tư gọi tên. "Đã ghi trước đó" nói đủ. */}
            {logIntervention.data.deduplicated
              ? "Đã ghi trước đó."
              : "Đã ghi vào hồ sơ chăm sóc."}
          </MutationSuccess>
        )}
        <MutationError error={acknowledgeHelp.error} />
        {acknowledgeHelp.isSuccess && (
          <MutationSuccess>{acknowledgeHelpText(acknowledgeHelp.data)}</MutationSuccess>
        )}
        <MutationError error={closeCase.error} />
        {closeCase.isSuccess && (
          <MutationSuccess>
            {closeCase.data.alreadyClosed ? "Hồ sơ đã đóng từ trước." : "Đã đóng hồ sơ chăm sóc."}
          </MutationSuccess>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  icon,
  iconBg,
  iconColor,
  value,
  sub,
  accentTop,
}: {
  label: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  value: string;
  sub: string;
  accentTop?: string;
}) {
  return (
    <div
      // Dưới md: bề rộng CỐ ĐỊNH 142px + `snap-start`, để năm thẻ nằm trên một hàng cuộn
      // và mỗi lần vuốt dừng đúng mép một thẻ (xem lý do ở khối cha). 142px vì thẻ hẹp
      // nhất còn chứa trọn "Chưa điểm danh" trên một dòng ở chữ 12px/800.
      // Từ md trở lên trả về hành vi cũ: co giãn, tối thiểu 190px (ghi chú 1 đầu file).
      className="w-[142px] flex-none snap-start rounded-[20px] bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:w-auto md:flex-1 md:basis-[190px] md:p-5"
      style={accentTop ? { borderTop: `3px solid ${accentTop}` } : undefined}
    >
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-extrabold text-subtle">{label}</span>
        <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-[11px] ${iconBg}`} aria-hidden>
          <span className={`msr text-[18px] ${iconColor}`}>{icon}</span>
        </span>
      </div>
      <div className="mt-1.5 text-[26px] font-black text-navy md:text-[30px]">{value}</div>
      {/* `muted` chứ không phải `caption`: dòng này là chỗ DUY NHẤT nói "gửi muộn — chưa
          phải vắng" và "không có ai vắng". Nó đọc được thì con số phía trên mới có nghĩa;
          đọc không ra thì con số trở thành một con số trần. */}
      <div className="mt-1.5 text-[11px] font-semibold text-muted">{sub}</div>
    </div>
  );
}
