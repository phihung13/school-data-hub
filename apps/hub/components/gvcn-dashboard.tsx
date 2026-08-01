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
import type { FlagSummary, HubRole } from "@hub/core/contracts";
import Link from "next/link";
import { HubSidebar } from "./hub-sidebar";
import { MainContent } from "./page-shell";
import { HubTabBar } from "./tab-bar";
import { Mascot } from "./mascot";
import { ClassPicker, useSelectedClass } from "./gvcn/class-picker";
import {
  boardEmptyPresentation,
  scanBannerPresentation,
  type ScanBannerPresentation,
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
    return {
      level: "urgent",
      label: "KHẨN · EM ĐÃ BẤM “CẦN GẶP THẦY CÔ”",
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

export function cadenceNote(cadence: FlagSummary["detail"]["cadence"]): string {
  return cadence === "tuc_thi"
    ? "Hiện ngay khi em bấm — không chờ lượt quét đêm."
    : "Do lượt quét đêm tìm ra — dấu hiệu của hôm nay phải chờ lượt quét kế tiếp.";
}

/**
 * Câu mô tả cờ. Viết lại 01/08/2026 (ADR-026).
 *
 * Bản cũ ghép "mood buồn/mệt {N} ngày gần đây" từ `detail.negativeDays` — đúng ba thứ
 * DESIGN-GUIDELINES §9 cấm in phía GVCN, gói gọn trong một dòng: chiều của cảm xúc, số
 * ngày, và (qua hai chữ "buồn/mệt") nội dung em đã ghi. Nay `FlagDetail` không còn chở
 * con số nào nữa — cắt tại contract, nên hàm này KHÔNG THỂ in ra chúng kể cả nếu ai đó
 * quên mất luật. Đó là cả điểm của việc cắt ở đó thay vì ẩn bằng CSS.
 */
export function describeFlag(detail: FlagSummary["detail"]): string {
  const open = detail.openHelpRequests.length;
  if (open > 0) {
    return open === 1
      ? "Em đã bấm “cần gặp thầy cô” và chưa ai đánh dấu đã gặp."
      : `Em đã bấm “cần gặp thầy cô” ${open} lần, chưa ai đánh dấu đã gặp.`;
  }
  return "Hệ thấy em có dấu hiệu cần được để ý. Nội dung em ghi chỉ thầy cô tâm lý đọc được.";
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

  if (r.notFound > 0) {
    parts.push(
      r.notFound === 1
        ? "Có 1 lời nhắn không tìm thấy — màn hình có thể đã cũ, hãy tải lại."
        : `Có ${r.notFound} lời nhắn không tìm thấy — màn hình có thể đã cũ, hãy tải lại.`,
    );
  }

  if (r.remainingOpen > 0) {
    parts.push(`Em này còn ${r.remainingOpen} lời nhắn chưa xử lý — hãy xem lại.`);
  }

  // Không rơi vào ca rỗng được (ba rổ cộng lại luôn bằng số id đã gửi, mà input đòi
  // `.min(1)`), nhưng nếu máy chủ đổi mà quên chỗ này thì im lặng vẫn là hỏng tệ nhất.
  return parts.length > 0 ? parts.join(" ") : "Đã gửi, nhưng máy chủ không nói rõ kết quả — hãy tải lại màn hình.";
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
  const acknowledgeLate = trpc.care.acknowledgeLate.useMutation({
    onSuccess: () => utils.care.getDashboard.invalidate(),
  });

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
            <HubTabBar roles={roles} />
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
        hint="Phân công chủ nhiệm do văn phòng nhập. Khi có lớp, buồng lái sẽ tự hiện tình hình lớp đó."
      />,
    );
  }

  // Bộ chọn lớp tự ẩn khi chỉ có một lớp (ClassPicker) — nên khối này chỉ hiện với người
  // chủ nhiệm từ hai lớp trở lên. Hai điều cố ý:
  //
  //   · Nút sáng theo `classId` của BỘ CHỌN, không theo lớp trong `dashboard.data`. Đổi
  //     lớp làm đổi khoá truy vấn nên có một nhịp đang tải; nút phải sáng ngay tại cú
  //     bấm, nếu không người ta bấm lần hai vì tưởng hụt.
  //   · Câu dưới nút không phải trang trí: bốn thẻ số, biểu đồ cảm xúc và mọi thẻ cờ bên
  //     dưới đều là của MỘT lớp, và một con số không nói rõ của lớp nào là một con số
  //     dùng được mà sai.
  const picker =
    myClasses.length > 1 ? (
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ClassPicker classes={myClasses} selectedId={classId} onSelect={select} />
        <span className="text-[11.5px] font-semibold text-muted">
          Thầy cô chủ nhiệm {myClasses.length} lớp — buồng lái đang xem{" "}
          <b className="font-black text-[#33507C]">lớp {pickedCode}</b>.
        </span>
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
  const scan = scanBannerPresentation(d.scanHealth, d.asOfDate);

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
          <h1 className="text-[20px] font-black text-navy md:text-[24px]">Chào {greetName} 👋</h1>
          <div className="mt-1 text-[13px] font-semibold text-[#5B6B80]">
            GVCN {classLabel(d.className)} · {d.totals.totalStudents} học sinh
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-[#E9ECF2] bg-white px-[15px] py-2.5">
          <span className="msr text-[17px] text-[#E8940D]">folder_open</span>
          <span className="text-[12px] font-extrabold text-[#33507C]">
            {d.totals.openCareCases} hồ sơ chăm sóc đang mở
          </span>
        </span>
      </div>

      {picker}

      {/* Dải trạng thái bộ quét — HIỆN MỌI LÚC, ngay dưới đầu trang và TRƯỚC mọi con số.
          Trước 01/08/2026 mốc quét chỉ xuất hiện ở nhánh bảng trống, nên có một cờ là
          nó biến mất: đúng lúc GVCN đang đọc số thì màn hình thôi nói số đó cũ hay mới.
          Vị trí này cũng có chủ ý — đứng TRƯỚC bốn thẻ số, vì nó là câu trả lời cho
          "bốn con số này đáng tin tới đâu", không phải một ghi chú cuối trang. */}
      <ScanBanner scan={scan} />

      {d.staleSources.length > 0 && (
        <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-[#FFF1C9] px-4 py-2.5 text-[11.5px] font-bold text-gold-textDark">
          <span className="msr text-[16px]">warning</span>
          Nguồn dữ liệu chưa tươi: {d.staleSources.join(", ")} — số liệu có thể chưa cập nhật đủ.
        </div>
      )}

      {/* Năm thẻ, không còn bốn ([QĐ-3]). Thẻ "Chưa điểm danh" thêm 01/08/2026 vì thẻ
          "Vắng" một mình đọc sai: nó đếm `status = 'absent'`, nên buổi sáng chưa ai ghi
          gì thì nó bằng 0 và phụ đề in "không có ai vắng" — một kết luận dựng từ im lặng,
          đúng thứ Rev F điều 3 cấm. Nay phụ đề của thẻ Vắng phụ thuộc vào thẻ bên cạnh:
          còn em chưa điểm danh thì nó nói thẳng là chưa kết luận được. */}
      <div className="mt-[18px] flex flex-wrap gap-3 md:gap-4">
        <StatCard label="Đã check-in" icon="how_to_reg" iconBg="bg-[#E3F8ED]" iconColor="text-[#00A05F]" value={`${d.totals.checkinCount}/${d.totals.totalStudents}`} sub="tính đến giờ" />
        <StatCard label="Chờ xác nhận" icon="hourglass_top" iconBg="bg-[#FFF1C9]" iconColor="text-[#E8940D]" value={String(d.totals.pendingLateCount)} sub="gửi muộn — chưa phải vắng" accentTop="#FFC629" />
        <StatCard label="Cờ đang mở" icon="flag" iconBg="bg-[#FFF0F0]" iconColor="text-[#D2383E]" value={String(d.priorityFlags.length)} sub={d.priorityFlags.length > 0 ? "cần xử lý" : "không có cờ nào"} accentTop={d.priorityFlags.length > 0 ? "#F0474D" : undefined} />
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
          iconColor="text-[#5B6B80]"
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
            <span className="text-center text-[10px] font-bold leading-tight text-[#33507C]">{screen.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-[18px] flex flex-wrap items-start gap-[18px]">
        <div className="min-w-0 flex-[2_1_320px] flex flex-col gap-4 md:flex-[2_1_540px]">
          <div className="text-[16px] font-black text-navy">Việc cần làm sáng nay</div>

          {d.priorityFlags.map((flag) => (
            <FlagCard key={flag.flagId} flag={flag} />
          ))}

          {d.pendingLateCheckins.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 rounded-[20px] border-l-[5px] border-[#2C7BF2] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-[#E2F0FC]">
                <span className="msr text-[22px] text-[#2C7BF2]">schedule</span>
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="text-[14.5px] font-black text-ink">
                  {d.pendingLateCheckins.length} check-in gửi muộn — chờ cô xác nhận
                </div>
                <div className="mt-0.5 text-[12.5px] text-[#5B6B80]">
                  {d.pendingLateCheckins.map((c) => c.studentName).join(" · ")}
                </div>
              </div>
              <button
                type="button"
                disabled={acknowledgeLate.isPending}
                onClick={() => acknowledgeLate.mutate({ checkinIds: d.pendingLateCheckins.map((c) => c.checkinId) })}
                className="min-h-[44px] flex-none rounded-xl border-[1.6px] border-[#2C7BF2] bg-[#E2F0FC] px-5 py-3 text-[12.5px] font-black text-[#1D4E8F] disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
              >
                {acknowledgeLate.isPending ? "Đang ghi…" : `Xác nhận cả ${d.pendingLateCheckins.length}`}
              </button>
              {/* Trước đây thất bại chỉ làm nút hết mờ — cô tin là đã duyệt. */}
              <div className="basis-full">
                <MutationError error={acknowledgeLate.error} />
              </div>
            </div>
          )}

          {d.priorityFlags.length === 0 && d.pendingLateCheckins.length === 0 && (
            <BoardEmpty scan={scan} openCareCases={d.totals.openCareCases} />
          )}
        </div>

        <div className="min-w-0 flex-[1_1_280px] flex flex-col gap-4">
          <MoodClosedCard visibility={d.moodVisibility} />

          <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
            <div className="text-[15px] font-black text-navy">Hành động gần đây</div>
            <div className="mt-3.5 flex flex-col gap-3">
              {d.recentActions.length === 0 && (
                // "Chưa ai ghi" chứ không phải "chưa có hành động nào": sổ can thiệp chỉ
                // biết việc ĐƯỢC GHI VÀO HỆ THỐNG. Cô gọi điện cho phụ huynh mà không ghi
                // lại thì ô này vẫn trống — trống ở đây nói về cái sổ, không nói về lớp.
                <p className="text-[12px] leading-relaxed text-muted">
                  Chưa ai ghi hành động nào cho lớp này. Trống ở đây nghĩa là sổ chưa có dòng nào — không
                  phải là mọi việc đã xong.
                </p>
              )}
              {d.recentActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className={`mt-[5px] h-[9px] w-[9px] flex-none rounded-full ${i === 0 ? "bg-[#2C7BF2]" : "bg-[#C9D2DE]"}`} />
                  <span className="text-[12.5px] leading-relaxed text-[#4A5460]">
                    {a.action} — {a.studentName} · {timeAgo(a.occurredAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-[20px] border-[1.5px] border-[#FFE29A] bg-[#FFF7E0] p-[18px]">
            <span className="msr flex-none text-[19px] text-[#E8940D]">translate</span>
            <span className="text-[12px] font-semibold leading-relaxed text-[#8A5A00]">
              Từ "cờ / ngưỡng" chỉ dùng ở đây. Nội dung gửi phụ huynh tự chuyển sang giọng Glow &amp; Grow.
            </span>
          </div>
        </div>
      </div>
    </div>,
  );
}

/**
 * Dải trạng thái bộ quét — một dòng duy nhất trả lời "màn hình này đứng sau phép đo nào".
 *
 * `role="status"` chứ không phải `role="alert"`: đây là thông tin thường trực chứ không
 * phải một cảnh báo vừa nổ ra, nên trình đọc màn hình đọc nó khi tới lượt thay vì cắt
 * ngang câu đang đọc dở. Icon mang `aria-hidden` — chữ đã nói đủ, đúng luật đã dùng cho
 * thẻ cờ: màu và icon không bao giờ là tín hiệu duy nhất.
 */
function ScanBanner({ scan }: { scan: ScanBannerPresentation }) {
  return (
    <div
      role="status"
      data-scan-state={scan.state}
      className={`mt-3.5 flex items-start gap-2.5 rounded-xl px-4 py-2.5 ${scan.boxClass}`}
    >
      <span className={`msr mt-[1px] flex-none text-[16px] ${scan.titleClass}`} aria-hidden>
        {scan.icon}
      </span>
      <div className="min-w-0">
        <div className={`text-[11.5px] font-black ${scan.titleClass}`}>{scan.title}</div>
        <div className={`mt-0.5 text-[11.5px] font-semibold leading-relaxed ${scan.bodyClass}`}>
          {scan.detail}
        </div>
      </div>
    </div>
  );
}

/**
 * Chỗ từng là ô "Cảm xúc lớp hôm nay" — nay là MỘT câu nói vì sao nó không còn.
 *
 * Vì sao không bỏ hẳn ô đi (01/08/2026, [QĐ-1]): cô mở buồng lái quen thuộc, thấy thiếu
 * một ô, và kết luận màn hình đang lỗi rồi đi báo IT. Bỏ trong im lặng cũng là một cách
 * nói dối — nó để người dùng tự dựng lấy một lời giải thích sai. Một câu, gọn, đúng một
 * lần: đây là quy định, không phải hỏng.
 *
 * Câu chữ bám sát NHÃN CHUẨN đã chốt ở DESIGN-GUIDELINES §9 ("Chỉ thầy cô tâm lý đọc"),
 * và cố ý KHÔNG hứa hẹn gì thêm: không "sẽ mở lại sau", không "liên hệ quản trị" — chưa
 * ai quyết hai điều đó.
 */
export function moodClosedText(visibility: { readable: boolean; reason: string | null }): string {
  if (visibility.readable) {
    // Chưa có ca này hôm nay (buồng lái là màn của GVCN). Có nhánh để lần sau ai mở lại
    // quyền thì không phải sửa hàm này ở hai chỗ.
    return "Nhật ký cảm xúc của lớp hiện ở màn riêng.";
  }
  if (visibility.reason === "chi_tam_ly") {
    return "Từ 01/08/2026, nhật ký cảm xúc từng ngày chỉ thầy cô tâm lý đọc được. Thầy cô vẫn nhận cờ “cần để ý” và vẫn nhận ngay khi em bấm nút cần gặp — biết là có chuyện, không đọc nội dung em ghi.";
  }
  // Máy chủ nói không đọc được nhưng không nói vì sao: KHÔNG bịa lý do hộ nó.
  return "Mục này hiện không mở cho thầy cô. Màn hình chưa nhận được lý do cụ thể — nếu cần biết, hỏi quản trị hệ thống.";
}

function MoodClosedCard({ visibility }: { visibility: { readable: boolean; reason: string | null } }) {
  return (
    <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-black text-navy">Cảm xúc lớp hôm nay</span>
        <span className="flex flex-none items-center gap-1 rounded-full bg-chip px-2 py-1 text-[9.5px] font-bold text-[#5B6B80]">
          <span className="msr text-[13px]" aria-hidden>
            lock
          </span>
          chỉ thầy cô tâm lý
        </span>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">{moodClosedText(visibility)}</p>
    </div>
  );
}

/**
 * Ô "không còn việc nào" của buồng lái. Câu "tốt thật sự" là một KẾT LUẬN, chỉ được in ra
 * khi có phép đo của hôm nay VÀ không còn hồ sơ chăm sóc nào đang mở — xem
 * `boardEmptyPresentation` trong components/gvcn/scan-status.ts.
 */
function BoardEmpty({ scan, openCareCases }: { scan: ScanBannerPresentation; openCareCases: number }) {
  const look = boardEmptyPresentation(scan, openCareCases);
  return (
    <div className={`flex items-center gap-3.5 rounded-[20px] px-5 py-[18px] ${look.boxClass}`}>
      {look.showMascot ? (
        <Mascot pose="thumbsup" width={44} />
      ) : (
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white">
          <span className="msr text-[22px] text-[#5B6B80]" aria-hidden>
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
        <div className="mt-2.5 text-[15px] font-black text-ink">
          {flag.ruleCode === "E_URGENT" ? "Em cần gặp thầy cô" : "Em cần được để ý"} · {flag.studentName}
        </div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-[#5B6B80]">{describeFlag(flag.detail)}</div>
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
        // #5B6B80 = 5,44:1 trên trắng. globals.css đã đặt đúng màu này làm lưới an toàn
        // cho mọi ::placeholder; khai lại ở đây là cố ý — ô này là chỗ GVCN ghi lời đã
        // nói với một đứa trẻ, không được phụ thuộc vào việc lưới an toàn còn sống.
        className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none placeholder:text-[#5B6B80] focus:border-navy"
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
            className="min-h-[44px] rounded-xl border-[1.6px] border-[#00A05F] bg-[#E3F8ED] px-5 py-3 text-[12.5px] font-black text-[#00693F] disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
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
            className="min-h-[44px] rounded-xl border-[1.5px] border-[#E4E9F0] bg-white px-5 py-3 text-[12.5px] font-extrabold text-[#5B6B80]"
          >
            Đóng hồ sơ
          </button>
        )}
      </div>

      {flag.caseId && closing && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-[#F7FAFF] p-3.5">
          <label className="text-[12px] font-black text-[#33507C]" htmlFor={`close-${flag.flagId}`}>
            Vì sao đóng hồ sơ này? (bắt buộc — để lần sau còn học được từ nó)
          </label>
          <textarea
            id={`close-${flag.flagId}`}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={2}
            placeholder="Ví dụ: em đã ổn định, gia đình đã phối hợp, đã bàn giao cho tâm lý cụm…"
            className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none placeholder:text-[#5B6B80] focus:border-navy"
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
              className="min-h-[44px] px-2 text-[12.5px] font-extrabold text-[#5B6B80] underline underline-offset-2"
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
            {logIntervention.data.deduplicated
              ? "Hành động này đã được ghi trước đó — không ghi thêm dòng mới."
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
      // basis-[150px] dưới md: bốn thẻ vẫn xếp 2 cột trên máy 390px thay vì tràn ra
      // ngoài khung rồi bị cắt mất (xem ghi chú 1 ở đầu file).
      className="flex-1 basis-[150px] rounded-[20px] bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:basis-[190px] md:p-5"
      style={accentTop ? { borderTop: `3px solid ${accentTop}` } : undefined}
    >
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-extrabold text-[#5B6B80]">{label}</span>
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
