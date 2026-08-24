// components/growth-report-view.tsx — V8 Báo cáo Trưởng thành (Hub Desktop V2, 30/07/2026).
// Phụ huynh vẫn mở từ link Zalo trên điện thoại (P3 GĐ1 gốc) — giữ nguyên bản
// mobile compact. Học sinh dùng máy tính ở trường thì thấy bản desktop có
// sidebar theo V2. KHÔNG có "cô X đã duyệt"/"đã đọc lúc.../chia sẻ cho ông bà"
// như bản vẽ tay — chưa có bảng duyệt báo cáo hay theo dõi đã đọc, không bịa
// (chỉ hiện tên + quan hệ người giám hộ thật qua report.getMyGuardians).
//
// Sửa 31/07/2026 (gói "giong-noi-va-don-dep"), ba việc:
//   1. Cuối bản mobile — đúng bản phụ huynh mở từ link Zalo — có dòng "GĐ1: phụ huynh mở
//      báo cáo từ link Zalo — chưa cần cài đặt gì". "GĐ1" là mã giai đoạn của dự án, nói
//      với người trong nhóm làm sản phẩm; nó không nói gì với một người mẹ mở link lúc 9
//      giờ tối, và nó nói về CÔNG VIỆC CỦA CHÚNG TA chứ không nói về con của bà. Gỡ hẳn
//      chứ không viết lại: khối đó không mang thông tin nào phụ huynh cần.
//   2. weekLabel từ server là hai ngày ISO — định dạng ở tầng hiển thị (lib/week-label.ts).
//   3. Dựng MỘT nhánh theo khổ màn thay vì dựng cả hai rồi ẩn bằng CSS (lib/viewport.ts):
//      với phụ huynh, bản mobile là bản duy nhất được xem, mà máy của họ là máy yếu nhất
//      trong hệ.
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import type { GetGrowthReportOutput } from "@hub/core/contracts";
import { mondayOf, toLocalIsoDate } from "@/lib/date";
import { useIsDesktop } from "@/lib/viewport";
import { formatWeekLabel } from "@/lib/week-label";
import { Mascot } from "./mascot";
import { MainContent, PageShell } from "./page-shell";
import { HubSidebar } from "./hub-sidebar";
import { HubTabBar } from "./tab-bar";
import { ErrorState, LoadingState } from "./ui/query-state";
import type { HubRole } from "@hub/core/contracts";

type Report = GetGrowthReportOutput;

/**
 * Icon của ba loại Glow. Trước 01/08/2026 chỉ bản DESKTOP có icon (viết thẳng trong JSX
 * bằng một chuỗi ba ngôi lồng nhau); bản mobile — bản DUY NHẤT phụ huynh mở từ link Zalo —
 * phân biệt ba loại bằng một dải màu `border-l-4` và không gì khác. Khai một chỗ để hai
 * bản không thể nói khác nhau nữa.
 */
const GLOW_ICON: Record<"green" | "blue" | "amber", string> = {
  green: "event_available",
  blue: "pool",
  amber: "menu_book",
};
const GLOW_BG: Record<"green" | "blue" | "amber", string> = {
  green: "bg-[#F6FEF9]",
  blue: "bg-[#F6FAFF]",
  amber: "bg-[#FFFBF2]",
};
const GLOW_ICON_BG: Record<"green" | "blue" | "amber", string> = {
  green: "bg-[#0C2E22]",
  blue: "bg-[#0E2647]",
  amber: "bg-[#3A2E08]",
};
const GLOW_ICON_COLOR: Record<"green" | "blue" | "amber", string> = {
  green: "text-[#4EE39B]",
  blue: "text-[#2C7BF2]",
  amber: "text-[#E8940D]",
};

/**
 * Câu nói khi mục "Tỏa sáng" rỗng. Hai lý do rỗng hoàn toàn khác nhau, không được
 * nói chung một câu: em CÓ đi học mà chưa chạm mốc nào (thì động viên được), hay
 * trường CHƯA GHI NHẬN ngày nào (thì chưa có gì để nói — im lặng không phải kết luận).
 * Trước đây cả hai cùng nhận câu "tuần sau cùng cố gắng nhé", tức là đoán tin không
 * vui từ chỗ trống — đúng thứ phụ huynh sẽ hiểu thành "con học kém tuần này".
 *
 * RÚT NGẮN 06/08/2026 (§1.5). HAI CÂU VẪN LÀ HAI CÂU — đó là cả lý do hàm này tồn tại,
 * và nó không đổi. Cái bị cắt là hai cái đuôi:
 *   · "— chưa có gì để kể, không phải tuần không tốt": biện minh cho chỗ thiếu dữ liệu.
 *     Đúng thể văn mà §1.5 gọi là chữ thừa, và tự nó gieo cái ý mà nó đang chối.
 *   · "— tuần sau cùng cố gắng nhé!": lời động viên, không mang dữ liệu nào.
 */
function glowEmptyMessage(report: Report): string {
  return report.checkinDaysThisWeek === 0
    ? "Tuần này chưa có dữ liệu điểm danh."
    : "Tuần này chưa có mục nào nổi bật.";
}

function mondayOffsetIso(weeksFromNow: number): string {
  const base = new Date();
  base.setDate(base.getDate() + weeksFromNow * 7);
  return toLocalIsoDate(mondayOf(base));
}

export function GrowthReportView({
  isStudent,
  displayName,
  email,
  roles,
  classCode,
}: {
  isStudent: boolean;
  displayName: string;
  email: string;
  /**
   * Vai thật của phiên. `optional` vì app/bao-cao/page.tsx thuộc gói khác và chưa
   * truyền xuống; khi thiếu thì suy từ `isStudent` — an toàn ở đây vì màn desktop
   * có sidebar CHỈ render cho học sinh, phụ huynh luôn xem bản mobile.
   */
  roles?: HubRole[];
  classCode?: string | null;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const query = trpc.report.getReportForWeek.useQuery({ weekStart: mondayOffsetIso(weekOffset) });
  const effectiveRoles: HubRole[] = roles ?? (isStudent ? ["student"] : ["guardian"]);
  const isDesktop = useIsDesktop();

  if (query.isPending) {
    return <LoadingState label="Đang soạn báo cáo…" />;
  }
  if (query.error || !query.data) {
    // Trước đây chỉ in message trần, KHÔNG có nút nào — phụ huynh mở link Zalo gặp
    // lỗi mạng là hết đường, không thử lại được mà cũng không về đâu được.
    return <ErrorState error={query.error} label="Báo cáo Trưởng thành" onRetry={() => void query.refetch()} />;
  }
  const { report } = query.data;

  // PHỤ HUYNH NAY CŨNG CÓ BẢN DESKTOP (02/08/2026). Chủ đầu tư mở /bao-cao trên máy tính
  // và mô tả đúng cái đang có: "1 cái trang chết không có lối thoát không có gì cả, thậm
  // chí ở desktop nó còn không phù hợp".
  //
  // Cả hai vế đều đúng, và vế thứ hai nặng hơn vế thứ nhất:
  //   · Không lối thoát — bản mobile dựng bằng <PageShell> trần, KHÔNG thanh tab, KHÔNG
  //     menu. Phụ huynh mở link Zalo vào đây thì đường duy nhất đi tiếp là nút Back của
  //     trình duyệt. Không có cả nút đăng xuất.
  //   · Không phù hợp trên máy tính — dòng cũ ở đây ép `!isStudent` xuống bản mobile ở MỌI
  //     khổ màn, nên trên màn 1920px phụ huynh nhận một thẻ rộng 576px trôi giữa nền trống.
  //
  // Lý lẽ cũ ("sidebar là menu của em") đã sai từ lâu mà không ai kiểm lại: `resolveNav()`
  // có GUARDIAN_ITEMS riêng từ 31/07, và `DesktopReport` không đọc `isStudent` một lần nào
  // — grep cả file chỉ thấy nó ở đúng dòng này. Tức là bản desktop đã chạy được cho phụ
  // huynh suốt, chỉ có một câu điều kiện chặn lại.
  if (!isDesktop) {
    return <MobileReport report={report} roles={effectiveRoles} displayName={displayName} email={email} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex w-[240px] flex-none">
        <HubSidebar roles={effectiveRoles} active="report" fullName={displayName} email={email} classCode={classCode} />
      </div>
      {/* Nhánh desktop trước đây trả về <div> trần: /bao-cao trên máy tính KHÔNG có landmark
          nào, nên đường tắt "Bỏ qua menu" ở đầu trang bấm xong không đi tới đâu. Bản mobile
          đã có <main> sẵn nhờ <PageShell>, và hai nhánh loại trừ nhau (useIsDesktop) nên
          không bao giờ có hai id "noi-dung" cùng lúc. Menu trái ở NGOÀI. */}
      <MainContent className="flex min-w-0 flex-1 overflow-hidden">
        <DesktopReport
          report={report}
          isStudent={isStudent}
          weekOffset={weekOffset}
          onPrevWeek={() => setWeekOffset((w) => w - 1)}
          onNextWeek={() => setWeekOffset((w) => w + 1)}
        />
      </MainContent>
    </div>
  );
}

function MobileReport({
  report,
  roles,
  displayName,
  email,
}: {
  report: Report | undefined;
  roles: HubRole[];
  displayName: string;
  email: string;
}) {
  if (!report) return null;
  return (
    // flex-col + min-h-screen: thanh tab phải nằm ĐÁY MÀN HÌNH, không trôi ngay dưới nội
    // dung khi báo cáo ngắn. <PageShell> đã tự căn giữa nên nó ở trong, không ở ngoài.
    <div className="flex min-h-screen w-full flex-col bg-[#081730]">
      <PageShell>
      <div className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-light px-5 pb-12 pt-4">
        <div
          aria-hidden
          className="absolute -right-11 -top-16 h-[190px] w-[190px] rounded-full"
          style={{ background: "radial-gradient(circle at 36% 36%, rgba(255,198,41,.55), rgba(255,198,41,.06) 72%)" }}
        />
        <div className="relative">
          {/* Tiêu đề trang thật, không phải chữ to: màn này không có <h1> nào, nên trình
              đọc màn hình mở link Zalo ra không biết đang đứng ở đâu. Giữ nguyên class. */}
          <h1 className="text-[17px] font-black text-white">Báo cáo Trưởng thành</h1>
          <div className="mt-0.5 text-[11px] text-[#C7D8F0]">
            {report.studentName} · {report.className} · {formatWeekLabel(report.weekLabel)}
          </div>
        </div>
      </div>
      <div className="relative -mt-7 h-7 rounded-t-[100%] bg-pagebg" aria-hidden />

      <div className="relative z-[2] -mt-8 flex items-center gap-3 rounded-2xl bg-card px-4 py-3.5 shadow-[0_12px_30px_rgba(10,42,94,.13)]">
        <Mascot pose="celebrate" width={52} />
        <div>
          <div className="text-[14px] font-black text-cardtitle">{report.headline}</div>
          <div className="mt-0.5 text-[11.5px] text-muted2">
            {report.glow.length} tỏa sáng · {report.grow.length} đang lớn lên
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-8 pt-4">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="msr text-[17px] text-gold-dark">sunny</span>
          <h2 className="text-[13.5px] font-black text-cardtitle">Tỏa sáng (Glow)</h2>
        </div>
        {report.glow.length === 0 && (
          <p className="text-[12px] text-muted">{glowEmptyMessage(report)}</p>
        )}
        {/* Sửa 01/08/2026 — DẢI MÀU MỘT CẠNH LÀ TÍN HIỆU DUY NHẤT, và nó không mang nghĩa gì.
            Bản mobile này là bản DUY NHẤT phụ huynh nhìn thấy (mở từ link Zalo), mà nó phân
            biệt ba loại Glow bằng đúng một dải `border-l-4` xanh/lam/vàng: không icon, không
            chữ nói loại. Người mù màu đỏ-lục và người đọc bằng tai không nhận được gì —
            DESIGN-GUIDELINES §11 "màu không phải tín hiệu duy nhất". Tệ hơn: bản desktop
            CÙNG DỮ LIỆU lại vẽ bằng nền nhạt + ô icon, tức hai bản đang nói khác nhau.
            Nay bản mobile dùng đúng bộ GLOW_BG + GLOW_ICON_BG + GLOW_ICON của bản desktop.
            Icon vẫn là trang trí (aria-hidden) vì tiêu đề ngay bên cạnh đã nói đủ nghĩa —
            thứ được sửa là "loại nào ra loại nấy cho MẮT", không phải thêm chữ cho tai. */}
        {report.glow.map((item, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 rounded-2xl p-3 shadow-[0_3px_12px_rgba(10,42,94,.07)] ${GLOW_BG[item.accentColor]}`}
          >
            <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${GLOW_ICON_BG[item.accentColor]}`}>
              <span aria-hidden="true" className={`msr text-[19px] ${GLOW_ICON_COLOR[item.accentColor]}`}>
                {GLOW_ICON[item.accentColor]}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-black text-cardtitle">{item.title}</div>
              {/* ĐO LẠI 05/08/2026, KHÔNG ĐỔI: token muted2 vừa nâng lên #93A9C8, nên chi
                  tiết Glow trên ba nền thẻ đạt 5,16:1 (#F6FAFF) · 5,23:1 (#FFFBF2) ·
                  5,27:1 (#F6FEF9). Trước lần nâng đó nó là 4,33–4,42:1. Không hạ xuống
                  text-caption nữa: hai token nay cùng một mã màu, đổi chỉ là đổi tên. */}
              <div className="mt-0.5 text-[11px] text-muted2">{item.detail}</div>
            </div>
          </div>
        ))}

        {report.grow.length > 0 && (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span aria-hidden="true" className="msr text-[17px] text-domain-studyDark">psychiatry</span>
              <h2 className="text-[13.5px] font-black text-cardtitle">Đang lớn lên (Grow)</h2>
            </div>
            {report.grow.map((item, i) => (
              <div key={i} className="rounded-2xl bg-card p-3 shadow-[0_3px_12px_rgba(10,42,94,.07)]">
                <div className="text-[12.5px] font-black text-cardtitle">{item.title}</div>
                <div className="mt-1 text-[11.5px] leading-relaxed text-muted2">{item.detail}</div>
              </div>
            ))}
          </>
        )}
        {/* Đã gỡ 31/07/2026: khối "GĐ1: phụ huynh mở báo cáo từ link Zalo — chưa cần cài
            đặt gì". Mã giai đoạn dự án là chuyện của người làm sản phẩm, không phải điều
            một người mẹ mở link lúc 9 giờ tối cần đọc (§8 · PRODUCT.md "không thuật ngữ"). */}
      </div>
      </PageShell>
      {/* LỐI RA. Đây là thứ trang này thiếu suốt từ đầu: phụ huynh mở link Zalo vào /bao-cao
          không có một đường nào đi tiếp — không thanh tab, không menu, không cả nút đăng
          xuất. Nút Back của trình duyệt là "lối ra" duy nhất, và với người mở từ ứng dụng
          Zalo thì nó cũng không có nốt. Thanh tab này còn mang theo avatar tài khoản, nên
          nó đồng thời trả lại đường tới Hồ sơ và đường thoát phiên. */}
      <HubTabBar roles={roles} fullName={displayName} email={email} />
    </div>
  );
}

function DesktopReport({
  report,
  weekOffset,
  onPrevWeek,
  onNextWeek,
  isStudent,
}: {
  report: Report;
  weekOffset: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** Người ĐANG XEM là em hay là phụ huynh — quyết định khối "gửi cho ai" có nghĩa hay không. */
  isStudent: boolean;
}) {
  // Chỉ hỏi khi khối đó thật sự được vẽ. Trước 02/08/2026 màn này chỉ học sinh mở nên câu
  // hỏi luôn có nghĩa; nay phụ huynh cũng vào đây, và với họ `report.getMyGuardians` trả
  // rỗng (họ không có "phụ huynh" nào của riêng mình) — gọi rồi bỏ đi là một lượt truy vấn
  // thừa trên mọi lần mở báo cáo của mọi phụ huynh.
  const guardians = trpc.report.getMyGuardians.useQuery(undefined, { enabled: isStudent });
  if (!report) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden s-home">
      <div className="hv-thanh flex flex-none items-center gap-3.5 px-7 py-3.5">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-gradient-to-br from-[#9D6BFF] to-[#7434E8]">
          <span aria-hidden="true" className="msr text-[19px] text-white">workspace_premium</span>
        </span>
        <div className="flex-1">
          <h1 className="text-[16px] font-black text-ink">Báo cáo Trưởng thành</h1>
          <div className="text-[11.5px] text-caption">{formatWeekLabel(report.weekLabel)}</div>
        </div>
        <button
          onClick={onPrevWeek}
          className="flex min-h-[44px] items-center gap-2 rounded-xl border-[1.5px] border-[#1E3A6B] bg-card px-4 py-2.5 text-[12.5px] font-extrabold text-cardtitle2 hover:border-[#C9D6E6]"
        >
          <span aria-hidden="true" className="msr text-[17px] text-subtle">chevron_left</span>
          Tuần trước
        </button>
        {weekOffset < 0 && (
          <button
            onClick={onNextWeek}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border-[1.5px] border-[#1E3A6B] bg-card px-4 py-2.5 text-[12.5px] font-extrabold text-cardtitle2 hover:border-[#C9D6E6]"
          >
            Tuần sau
            <span aria-hidden="true" className="msr text-[17px] text-subtle">chevron_right</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-7">
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-0 flex-[2.2_1_560px] flex flex-col gap-[18px]">
            <div className="relative flex flex-wrap items-center gap-5 overflow-hidden rounded-[24px] bg-gradient-to-br from-navy to-[#1E5FB8] p-[26px]">
              <div
                aria-hidden
                className="absolute -right-10 -top-[90px] h-[280px] w-[280px] rounded-full"
                style={{ background: "radial-gradient(circle at 36% 36%, rgba(255,198,41,.4), transparent 70%)" }}
              />
              <Mascot pose="celebrate" width={88} />
              <div className="relative min-w-0 flex-1 basis-[280px]">
                <div className="text-[24px] font-black text-white">{report.headline}</div>
                <div className="mt-1.5 text-[13.5px] leading-relaxed text-[#C7D8F0]">
                  {report.glow.length} điều con đang tỏa sáng · {report.grow.length} điều con đang lớn lên.
                </div>
              </div>
              {/* Hai thẻ số liệu này nằm ở đầu SÁNG của hero (#1E5FB8) y hệt ba thẻ trên
                  trang chủ, và mắc đúng một lỗi: `bg-card/15` làm sáng chỗ đó thêm lần
                  nữa, nhãn #C7D8F0 chỉ còn 3,12:1 và số vàng 2,88:1. Nền navy pha 70%
                  (kết quả ≈ #103A79) đưa nhãn lên 7,62:1, số vàng 7,02:1, số trắng
                  11,03:1 — vẫn là thẻ nổi trên hero, chỉ nổi bằng tối thay vì sáng. */}
              <div className="relative flex gap-2.5">
                <div className="rounded-2xl border border-cardline/15 bg-navy/70 px-[18px] py-3.5 text-center">
                  <div className="text-[22px] font-black text-gold">{report.checkinDaysThisWeek}/5</div>
                  <div className="mt-0.5 text-[10px] font-bold text-[#C7D8F0]">ngày đến lớp</div>
                </div>
                <div className="rounded-2xl border border-cardline/15 bg-navy/70 px-[18px] py-3.5 text-center">
                  <div className="text-[22px] font-black text-white">{report.streakDays}</div>
                  <div className="mt-0.5 text-[10px] font-bold text-[#C7D8F0]">chuỗi check-in</div>
                </div>
              </div>
            </div>

            <div className="hv-card-toi p-6">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="msr text-[21px] text-[#F5A300]">sunny</span>
                <h2 className="text-[17px] font-black text-cardtitle">Tỏa sáng (Glow)</h2>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {report.glow.length === 0 && (
                  <p className="text-[13px] text-caption">{glowEmptyMessage(report)}</p>
                )}
                {report.glow.map((item, i) => (
                  <div key={i} className={`flex items-start gap-3.5 rounded-xl px-[18px] py-4 ${GLOW_BG[item.accentColor]}`}>
                    <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${GLOW_ICON_BG[item.accentColor]}`}>
                      {/* Cùng bảng GLOW_ICON với bản mobile — chuỗi ba ngôi lồng nhau viết
                          tay ở đây chính là thứ khiến hai bản lệch nhau suốt (01/08/2026). */}
                      <span aria-hidden="true" className={`msr text-[20px] ${GLOW_ICON_COLOR[item.accentColor]}`}>
                        {GLOW_ICON[item.accentColor]}
                      </span>
                    </span>
                    <div className="flex-1">
                      <div className="text-[14.5px] font-black text-ink">{item.title}</div>
                      <div className="mt-0.5 text-[12.5px] leading-relaxed text-caption">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {report.grow.length > 0 && (
              <div className="hv-card-toi p-6">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="msr text-[21px] text-[#4EE39B]">psychiatry</span>
                  <h2 className="text-[17px] font-black text-cardtitle">Đang lớn lên (Grow)</h2>
                </div>
                <div className="mt-4 flex flex-wrap items-start gap-4">
                  <Mascot pose="think" width={56} />
                  <div className="min-w-0 flex-1 basis-[320px]">
                    <div className="text-[15px] font-black text-ink">{report.grow[0]!.title}</div>
                    <div className="mt-1.5 text-[13px] leading-relaxed text-[#93A9C8]">{report.grow[0]!.detail}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-4">
            {/* KHỐI NÀY CHỈ CÓ NGHĨA VỚI HỌC SINH (ẩn cho phụ huynh 02/08/2026).
                "Báo cáo này gửi cho ai?" là câu em hỏi về bố mẹ mình. Với người đang đọc
                CHÍNH LÀ bố mẹ, `getMyGuardians` trả rỗng nên khối in ra "Chưa có phụ huynh
                nào gắn với tài khoản này" — một câu vừa vô nghĩa vừa gây hoang mang đúng
                cho người mà cả trang này sinh ra để phục vụ. Đo thật ngay lần đầu mở bản
                desktop bằng phiên phụ huynh. */}
            {isStudent && (
            <div className="hv-card-toi p-5">
              <div className="text-[15px] font-black text-cardtitle">Báo cáo này gửi cho ai?</div>
              <div className="mt-3.5 flex flex-col gap-3">
                {/* "Chưa có phụ huynh nào" là một KHẲNG ĐỊNH — không được nói nó khi
                    mới chỉ là chưa tải xong hoặc đã hỏng. */}
                {guardians.isPending ? (
                  <p className="text-[12px] text-caption">Đang tải…</p>
                ) : guardians.error ? (
                  <p className="text-[12px] font-bold text-[#FF8A8F]">
                    Chưa tải được danh sách người nhận.{" "}
                    <button type="button" onClick={() => void guardians.refetch()} className="underline underline-offset-2">
                      Thử lại
                    </button>
                  </p>
                ) : guardians.data?.length ? (
                  guardians.data.map((g, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[#3A2E08] text-[12.5px] font-black text-gold-text">
                        {g.full_name.trim().slice(0, 1).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0 flex-1 text-[12.5px] font-bold text-ink">{g.full_name}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] text-caption">Chưa có phụ huynh nào gắn với tài khoản này.</p>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
