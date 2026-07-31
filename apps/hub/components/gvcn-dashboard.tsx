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
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { toLocalIsoDate } from "@/lib/date";
import type { FlagSummary, HubRole } from "@hub/core/contracts";
import Link from "next/link";
import { HubSidebar } from "./hub-sidebar";
import { HubTabBar } from "./tab-bar";
import { Mascot } from "./mascot";
import { ErrorState, LoadingState, MutationError, MutationSuccess } from "./ui/query-state";
import { personName } from "./ui/labels";

const MOOD_META: Record<1 | 2 | 3 | 4, { label: string; dot: string; grad: string }> = {
  4: { label: "Vui", dot: "#00C96F", grad: "linear-gradient(160deg,#00D97A,#00A85E)" },
  3: { label: "Bình thường", dot: "#2C7BF2", grad: "linear-gradient(160deg,#4E9BFF,#2C7BF2)" },
  2: { label: "Mệt", dot: "#F5A300", grad: "linear-gradient(160deg,#FFC833,#F5A300)" },
  1: { label: "Buồn", dot: "#F0474D", grad: "linear-gradient(160deg,#FF7A7F,#F0474D)" },
};

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
      label: "KHẨN · EM ĐÃ BẤM «CẦN GẶP THẦY CÔ»",
      icon: "priority_high",
      borderClass: "border-l-[5px] border-[#F0474D]",
      badgeClass: "bg-[#FFE9E9] text-[#B02A30]",
    };
  }
  return {
    level: "watch",
    label: "CẦN ĐỂ Ý · CẢM XÚC ĐI XUỐNG NHIỀU NGÀY",
    icon: "visibility",
    borderClass: "border-l-[5px] border-gold",
    badgeClass: "bg-[#FFF1C9] text-gold-textDark",
  };
}

/** `detail` là `Record<string, unknown>` theo contract — đọc số an toàn, không ép kiểu bừa. */
export function readNumber(detail: Record<string, unknown>, key: string): number | null {
  const raw = detail[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

/** Câu mô tả cờ, ghép từ hai tín hiệu thật — không có tín hiệu nào thì nói thẳng là không có. */
export function describeFlag(detail: Record<string, unknown>): string {
  const helpRequested = detail.helpRequested === true;
  const negativeDays = readNumber(detail, "negativeDays");
  const moodPart = negativeDays !== null && negativeDays > 0 ? `mood buồn/mệt ${negativeDays} ngày gần đây` : "";
  if (helpRequested) {
    return moodPart ? `Đã bấm «cần gặp thầy cô» + ${moodPart}` : "Đã bấm «cần gặp thầy cô»";
  }
  return moodPart ? `Mood ${moodPart.slice("mood ".length)}` : "Tín hiệu cảm xúc cần để ý";
}

// ---------------------------------------------------------------------------
// "Hết việc" nghĩa là gì — và khi nào KHÔNG được nói câu đó.
//
// Sửa 31/07/2026 (gói "trung-thuc-trang-thai"). Bản cũ hiện nguyên văn:
//
//     "Hết việc rồi — lớp mình đang ổn! Đây là trạng thái tốt thật sự, không
//      phải thiếu dữ liệu"
//
// …NGAY CẢ KHI `lastScanAt = null`, tức là bộ quét cảnh báo chưa từng chạy thành
// công lần nào. Lúc đó danh sách trống KHÔNG phải kết quả của một phép đo: nó là
// chỗ chưa ai đo. Màn hình đang khẳng định đúng cái điều nó không có cơ sở để
// biết — và khẳng định theo hướng trấn an, đúng hướng nguy hiểm nhất với một hệ
// thống chăm sóc trẻ ("im lặng không phải kết luận", RULES.md Rev F điều 8).
//
// Ba trạng thái, ba câu khác nhau:
//   fresh   — quét XONG trong ngày hôm nay → được nói "tốt thật sự".
//   stale   — có quét, nhưng lần gần nhất KHÔNG phải hôm nay → chỉ được nói
//             "chưa có kết quả mới", kèm mốc thời gian thật.
//   unknown — chưa có lần quét nào → nói thẳng là chưa kết luận được.
//
// Chỉ nhánh `fresh` được dùng mascot ăn mừng và khung xanh. Hai nhánh kia là
// khung xám trung tính: không đoán tin tốt, cũng không doạ tin xấu.
// ---------------------------------------------------------------------------
export type ScanFreshness = "fresh" | "stale" | "unknown";

/** `asOfDate` là ngày địa phương do máy chủ chốt (GetDashboardOutput.asOfDate). */
export function scanFreshness(lastScanAt: string | null | undefined, asOfDate: string): ScanFreshness {
  if (!lastScanAt) return "unknown";
  const at = new Date(lastScanAt);
  if (Number.isNaN(at.getTime())) return "unknown";
  return toLocalIsoDate(at) === asOfDate ? "fresh" : "stale";
}

export interface BoardEmptyPresentation {
  state: ScanFreshness;
  /** Mascot ăn mừng CHỈ dành cho kết quả đo thật của hôm nay. */
  showMascot: boolean;
  /** Icon thay mascot ở hai trạng thái chưa chắc chắn (null khi có mascot). */
  icon: string | null;
  title: string;
  body: string;
  boxClass: string;
  titleClass: string;
  bodyClass: string;
}

/** Mốc quét, dạng người đọc được. Cùng ngày thì chỉ cần giờ; khác ngày phải có ngày. */
export function formatScanMoment(lastScanAt: string, sameDay: boolean): string {
  const at = new Date(lastScanAt);
  return sameDay
    ? at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : at.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function boardEmptyPresentation(
  lastScanAt: string | null | undefined,
  asOfDate: string,
): BoardEmptyPresentation {
  const state = scanFreshness(lastScanAt, asOfDate);

  if (state === "fresh") {
    return {
      state,
      showMascot: true,
      icon: null,
      title: "Hết việc rồi — lớp mình đang ổn!",
      body: `Bộ quét đã chạy lúc ${formatScanMoment(lastScanAt as string, true)} hôm nay và không thấy tín hiệu nào cần xử lý — đây là trạng thái tốt thật sự, không phải thiếu dữ liệu.`,
      boxClass: "border-2 border-dashed border-[#C9D8CB] bg-[#F2F8F3]",
      titleClass: "text-[#00693F]",
      bodyClass: "text-[#4A5B4D]",
    };
  }

  if (state === "stale") {
    return {
      state,
      showMascot: false,
      icon: "history",
      title: "Chưa có kết quả quét cho hôm nay",
      body: `Lần quét gần nhất là ${formatScanMoment(lastScanAt as string, false)}. Danh sách trống lúc này chỉ nói rằng chưa có kết quả mới — chưa kết luận được lớp ổn hay chưa đủ dữ liệu.`,
      boxClass: "border-2 border-dashed border-[#D6DEE9] bg-[#F5F7FA]",
      titleClass: "text-[#33507C]",
      bodyClass: "text-[#4A5460]",
    };
  }

  return {
    state,
    showMascot: false,
    icon: "question_mark",
    title: "Chưa có kết quả quét nào",
    body: "Hệ thống chưa ghi nhận lần quét cảnh báo nào, nên chỗ trống này chưa nói được điều gì: không có nghĩa lớp đang ổn, cũng không có nghĩa đang có chuyện.",
    boxClass: "border-2 border-dashed border-[#D6DEE9] bg-[#F5F7FA]",
    titleClass: "text-[#33507C]",
    bodyClass: "text-[#4A5460]",
  };
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
  const dashboard = trpc.care.getDashboard.useQuery();
  const acknowledgeLate = trpc.care.acknowledgeLate.useMutation({
    onSuccess: () => utils.care.getDashboard.invalidate(),
  });

  const greetName = personName(displayName) || displayName;
  // Lớp thật ưu tiên lấy từ chính buồng lái (đúng lớp đang xem); `classCode` từ
  // phiên là bản dự phòng khi query chưa xong.
  const sidebarClass = dashboard.data?.className ?? classCode;

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
  const frame = (children: React.ReactNode) => (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
        {children}
        <div className="md:hidden">
          <HubTabBar roles={roles} />
        </div>
      </div>
    </div>
  );

  if (dashboard.isPending) return frame(<LoadingState label="Đang tải buồng lái…" />);
  if (dashboard.error || !dashboard.data) {
    return frame(
      <ErrorState error={dashboard.error} label="buồng lái" onRetry={() => void dashboard.refetch()} />,
    );
  }

  const d = dashboard.data;
  const totalMood = d.moodDistribution.reduce((s, m) => s + m.count, 0) || 1;

  return frame(
    <div className="flex-1 p-4 md:overflow-y-auto md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="text-[20px] font-black text-navy md:text-[24px]">Chào {greetName} 👋</div>
          <div className="mt-1 text-[13px] font-semibold text-[#5B6B80]">
            GVCN lớp {d.className} · {d.totals.totalStudents} học sinh
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-[#E9ECF2] bg-white px-[15px] py-2.5">
          <span className="msr text-[17px] text-[#E8940D]">folder_open</span>
          <span className="text-[12px] font-extrabold text-[#33507C]">
            {d.totals.openCareCases} hồ sơ chăm sóc đang mở
          </span>
        </span>
      </div>

      {d.staleSources.length > 0 && (
        <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-[#FFF1C9] px-4 py-2.5 text-[11.5px] font-bold text-gold-textDark">
          <span className="msr text-[16px]">warning</span>
          Nguồn dữ liệu chưa tươi: {d.staleSources.join(", ")} — số liệu có thể chưa cập nhật đủ.
        </div>
      )}

      <div className="mt-[18px] flex flex-wrap gap-3 md:gap-4">
        <StatCard label="Đã check-in" icon="how_to_reg" iconBg="bg-[#E3F8ED]" iconColor="text-[#00A05F]" value={`${d.totals.checkinCount}/${d.totals.totalStudents}`} sub="tính đến giờ" />
        <StatCard label="Chờ xác nhận" icon="schedule" iconBg="bg-[#FFF1C9]" iconColor="text-[#E8940D]" value={String(d.totals.pendingLateCount)} sub="gửi muộn — chưa phải vắng" accentTop="#FFC629" />
        <StatCard label="Cờ đang mở" icon="flag" iconBg="bg-[#FFF0F0]" iconColor="text-[#D2383E]" value={String(d.priorityFlags.length)} sub={d.priorityFlags.length > 0 ? "cần xử lý" : "không có cờ nào"} accentTop={d.priorityFlags.length > 0 ? "#F0474D" : undefined} />
        <StatCard label="Vắng" icon="person_off" iconBg="bg-[#F1F4F8]" iconColor="text-[#5B6B80]" value={String(d.totals.absentCount)} sub={d.totals.absentCount === 0 ? "không có ai vắng" : "học sinh"} />
      </div>

      {/* CHỈ mobile — trên md bốn đích này đã có trong sidebar, vẽ lại là thừa.
          Lưới 4 cột, tile 52px, nhãn 10px: đúng mẫu "lưới mini app" của §6. */}
      <nav aria-label="Màn hình lớp chủ nhiệm" className="mt-[18px] grid grid-cols-4 gap-3 md:hidden">
        {GVCN_SCREENS.map((screen) => (
          <Link key={screen.key} href={screen.href} className="flex flex-col items-center gap-1.5">
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
                className="flex-none rounded-xl border-[1.6px] border-[#2C7BF2] bg-[#E2F0FC] px-5 py-3 text-[12.5px] font-black text-[#1D4E8F] disabled:opacity-50"
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
            <BoardEmpty lastScanAt={d.lastScanAt} asOfDate={d.asOfDate} />
          )}
        </div>

        <div className="min-w-0 flex-[1_1_280px] flex flex-col gap-4">
          <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-black text-navy">Cảm xúc lớp hôm nay</span>
              <span className="flex items-center gap-1 text-[9.5px] font-bold text-caption">
                <span className="msr text-[13px]">lock</span>nội bộ
              </span>
            </div>
            {d.moodDistribution.length > 0 ? (
              <>
                <div className="mt-3.5 flex h-[18px] overflow-hidden rounded-lg">
                  {([4, 3, 2, 1] as const).map((m) => {
                    const count = d.moodDistribution.find((x) => x.mood === m)?.count ?? 0;
                    const pct = (count / totalMood) * 100;
                    return pct > 0 ? <span key={m} style={{ width: `${pct}%`, background: MOOD_META[m].grad }} /> : null;
                  })}
                </div>
                <div className="mt-3.5 flex flex-col gap-2">
                  {([4, 3, 2, 1] as const).map((m) => (
                    <div key={m} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: MOOD_META[m].dot }} />
                      <span className="flex-1 text-[12px] font-bold text-[#33507C]">{MOOD_META[m].label}</span>
                      <span className="text-[12px] font-black text-navy">
                        {d.moodDistribution.find((x) => x.mood === m)?.count ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3.5 text-[12px] text-caption">Chưa có check-in nào hôm nay.</p>
            )}
          </div>

          <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
            <div className="text-[15px] font-black text-navy">Hành động gần đây</div>
            <div className="mt-3.5 flex flex-col gap-3">
              {d.recentActions.length === 0 && (
                <p className="text-[12px] text-caption">Chưa có hành động nào được ghi lại.</p>
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
              Từ «cờ / ngưỡng» chỉ dùng ở đây. Nội dung gửi phụ huynh tự chuyển sang giọng Glow &amp; Grow.
            </span>
          </div>
        </div>
      </div>
    </div>,
  );
}

/**
 * Ô "không còn việc nào" của buồng lái. Ba hình thức cho ba mức chắc chắn — xem
 * `boardEmptyPresentation`. Câu "tốt thật sự" là một KẾT LUẬN, chỉ được in ra khi
 * có phép đo của hôm nay đứng sau nó.
 */
function BoardEmpty({ lastScanAt, asOfDate }: { lastScanAt: string | null; asOfDate: string }) {
  const look = boardEmptyPresentation(lastScanAt, asOfDate);
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
  const helpRequested = flag.detail.helpRequested === true;

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
        <div className="mt-2.5 text-[15px] font-black text-ink">Cờ E — cảm xúc · {flag.studentName}</div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-[#5B6B80]">{describeFlag(flag.detail)}</div>
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
        className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none focus:border-navy"
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={logIntervention.isPending}
          onClick={submitIntervention}
          className="rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white disabled:opacity-50"
        >
          {logIntervention.isPending ? "Đang ghi…" : "Ghi can thiệp"}
        </button>

        {/* Chỉ có nghĩa khi em ĐÃ bấm «cần gặp thầy cô»: nút này tắt đúng tín hiệu đó
            (attendance.help_requests.handled_at), không đụng tới cờ mood. */}
        {helpRequested && (
          <button
            type="button"
            disabled={acknowledgeHelp.isPending || acknowledgeHelp.isSuccess}
            onClick={() => acknowledgeHelp.mutate({ studentId: flag.studentId, requestedOn: flag.asOfDate })}
            className="rounded-xl border-[1.6px] border-[#00A05F] bg-[#E3F8ED] px-5 py-3 text-[12.5px] font-black text-[#00693F] disabled:opacity-50"
          >
            {acknowledgeHelp.isPending ? "Đang ghi…" : "Cô đã gặp em rồi"}
          </button>
        )}

        {/* closeCase đòi UUID thật (CloseCaseInput.caseId là .uuid()) — cờ chưa có
            hồ sơ thì KHÔNG có gì để đóng, ẩn hẳn nút thay vì gửi một mã sai. */}
        {flag.caseId && !closing && (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="rounded-xl border-[1.5px] border-[#E4E9F0] bg-white px-5 py-3 text-[12.5px] font-extrabold text-[#5B6B80]"
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
            className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none focus:border-navy"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={closeCase.isPending || resolution.trim().length === 0}
              onClick={() => closeCase.mutate({ caseId: flag.caseId!, resolution: resolution.trim() })}
              className="rounded-xl bg-[#0F172A] px-5 py-2.5 text-[12.5px] font-black text-white disabled:opacity-40"
            >
              {closeCase.isPending ? "Đang đóng…" : "Xác nhận đóng"}
            </button>
            <button
              type="button"
              onClick={() => setClosing(false)}
              className="text-[12.5px] font-extrabold text-[#5B6B80] underline underline-offset-2"
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
          <MutationSuccess>
            {acknowledgeHelp.data.alreadyHandled ? "Người khác đã xử lý trước rồi." : "Đã đánh dấu là cô đã gặp em."}
          </MutationSuccess>
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
        <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-[11px] ${iconBg}`}>
          <span className={`msr text-[18px] ${iconColor}`}>{icon}</span>
        </span>
      </div>
      <div className="mt-1.5 text-[26px] font-black text-navy md:text-[30px]">{value}</div>
      <div className="mt-1.5 text-[11px] font-semibold text-caption">{sub}</div>
    </div>
  );
}
