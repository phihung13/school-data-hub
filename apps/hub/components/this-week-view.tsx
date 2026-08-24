// components/this-week-view.tsx — V6 Tuần này của mình (Hub Desktop V2, 29/07/2026).
// Ghép từ 2 nguồn dữ liệu thật đã có: lịch tuần (checkin.getAttendanceOverview)
// + Glow/Grow (report.getMyLatestReport) — không thêm bảng/truy vấn mới.
//
// Sửa 31/07/2026 (gói "frontend-trang-thai"): khuôn `{attendance.data && report.data && …}`
// không có nhánh isPending/error nên query hỏng là màn TRẮNG vĩnh viễn, và phụ đề
// còn kẹt ở "…" mãi mãi (dấu ba chấm nghĩa là "đang tải" — nói dối khi thật ra là
// đã hỏng). Nay đủ ba trạng thái + nút Thử lại; sidebar nhận `roles`/`classCode`
// thật thay vì role="student" viết cứng; khối mobile có đường ra.
//
// Sửa 31/07/2026 (gói "a11y-nen"): BỎ màn chặn DesktopOnlyNotice — trang này chỉ học
// sinh mới vào được (page.tsx đá vai khác về /home) mà bối cảnh dùng thật của học sinh
// THCS là điện thoại (PRODUCT.md), nên màn chặn "mở trên máy tính" chặn đúng toàn bộ
// người dùng của nó. Nội dung xếp dọc sẵn: bỏ "hidden md:flex", để hai cột tự xuống
// dòng. Kèm theo: vùng nội dung thành <MainContent> (landmark <main id="noi-dung">
// cho đường tắt bàn phím) và tiêu đề màn thành <h1>.
//
// Sửa 31/07/2026 (gói "giong-noi-va-don-dep"), hai việc — đều là GIỌNG, không phải bố cục:
//   1. Màn này nói với chính đứa trẻ nhưng dùng chữ "GVCN" hai lần ("chỉ GVCN xem",
//      "Bản đầy đủ GVCN gửi bố mẹ"). DESIGN-GUIDELINES §8: từ vựng vận hành CHỈ sống ở
//      buồng lái/tâm lý/điều hành. Đây là ràng buộc đạo đức, không phải sở thích văn phong.
//   2. weekLabel từ server là hai ngày ISO ("2026-07-27 – 2026-07-31") in thẳng ra hai chỗ
//      em đọc. Định dạng ở tầng hiển thị bằng formatWeekLabel() — contract giữ nguyên ISO
//      cho buồng lái và job xuất dữ liệu.
"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { formatWeekLabel } from "@/lib/week-label";
import type { HubRole, MoodValue } from "@hub/core/contracts";
import { DayNote, dayCaptionText } from "./attendance-view";
import { HubSidebar } from "./hub-sidebar";
import { Mascot } from "./mascot";
import { MainContent } from "./page-shell";
import { StudentTabBar } from "./tab-bar";
import { ErrorState, LoadingState } from "./ui/query-state";

const MOOD_ICON: Record<MoodValue, string> = {
  4: "sentiment_very_satisfied",
  3: "sentiment_neutral",
  2: "sentiment_dissatisfied",
  1: "sentiment_sad",
};
const MOOD_GRADIENT: Record<MoodValue, string> = {
  4: "linear-gradient(160deg,#00D97A,#00A85E)",
  3: "linear-gradient(160deg,#4E9BFF,#2C7BF2)",
  2: "linear-gradient(160deg,#FFC833,#F5A300)",
  1: "linear-gradient(160deg,#FF7A7F,#F0474D)",
};
const MOOD_NAME: Record<MoodValue, string> = { 4: "Vui", 3: "Bình thường", 2: "Mệt", 1: "Buồn" };
const MOOD_DOT: Record<MoodValue, string> = { 4: "#00C96F", 3: "#2C7BF2", 2: "#F5A300", 1: "#F0474D" };
const GLOW_BG: Record<string, string> = { green: "bg-[#F6FEF9]", blue: "bg-[#F6FAFF]", amber: "bg-[#FFFBF2]" };
const GLOW_ICON_BG: Record<string, string> = { green: "bg-[#0C2E22]", blue: "bg-[#0E2647]", amber: "bg-[#3A2E08]" };
// Mỗi màu icon đo trên ĐÚNG nền ô của nó (GLOW_ICON_BG cùng khoá), mốc 3:1 của WCAG 1.4.11:
//   green #4EE39B trên #0C2E22 = 3,05:1 · blue #2C7BF2 trên #0E2647 = 3,47:1 — giữ nguyên.
//   amber #E8940D trên #3A2E08 = 2,15:1 — trượt, nay là #FFD98A (gold-textDark) = 5,93:1.
// Đây là chỗ thứ hai của chính mã #E8940D: lần sửa 01/08 chỉ chạm được ô "Gửi muộn" ở
// /diem-danh vì sáu chỗ còn lại nằm trong file người sửa không mở ra. (05/08/2026)
const GLOW_ICON_COLOR: Record<string, string> = { green: "text-[#4EE39B]", blue: "text-[#2C7BF2]", amber: "text-gold-textDark" };
const GLOW_ICON: Record<string, string> = { green: "event_available", blue: "pool", amber: "menu_book" };

export function ThisWeekView({
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
  const attendance = trpc.checkin.getAttendanceOverview.useQuery();
  const report = trpc.report.getMyLatestReport.useQuery();

  const moodCounts: Record<MoodValue, number> = { 4: 0, 3: 0, 2: 0, 1: 0 };
  let recordedDays = 0;
  attendance.data?.week.forEach((d) => {
    if (d.mood) {
      moodCounts[d.mood as MoodValue] += 1;
      recordedDays += 1;
    }
  });

  // Trang cần CẢ HAI truy vấn: đang tải khi còn một cái chưa xong, hỏng khi có
  // cái nào hỏng. Thử lại phải bắn lại cả hai, vì không biết cái nào vừa hỏng.
  const isPending = attendance.isPending || report.isPending;
  const error = attendance.error ?? report.error;
  const retry = () => {
    void attendance.refetch();
    void report.refetch();
  };

  return (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Menu trái 240px chỉ có nghĩa từ md; dưới đó đường ra là tab bar cuối trang. */}
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="week" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <MainContent className="flex min-w-0 flex-1 flex-col bg-pagebg s-home-md md:overflow-hidden">
          <div className="flex flex-none items-center gap-3.5 hv-thanh px-4 py-3 md:px-7 md:py-3.5">
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-black text-ink">Tuần này của mình</h1>
              {/* "…" chỉ được phép khi ĐANG tải thật; hỏng thì nói là hỏng. */}
              <div className="text-[11.5px] text-caption">
                {report.data
                  ? formatWeekLabel(report.data.report.weekLabel)
                  : isPending
                    ? "…"
                    : error
                      ? "chưa tải được"
                      : ""}
              </div>
            </div>
          </div>

          {isPending && <LoadingState label="Đang tải tuần này của con…" />}
          {!isPending && error && <ErrorState error={error} label="Tuần này của mình" onRetry={retry} />}

          {attendance.data && report.data && (
            <div className="flex-1 p-4 md:overflow-y-auto md:p-7">
              <div className="rounded-[22px] bg-card p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[16px] font-black text-cardtitle">Mỗi ngày của con</h2>
                  <span className="text-[11.5px] font-bold text-caption">giờ check-in + cảm xúc</span>
                </div>
                {/* Giữ 5 cột cả ở 390px: ô co còn ~60px, vừa đủ vòng tròn cảm xúc 52px.
                    Cho xuống 2 hàng là mất hình dạng "một tuần" — thứ duy nhất khối này kể. */}
                <div className="mt-[18px] grid grid-cols-5 gap-1.5 md:gap-3.5">
                  {attendance.data.week.map((day) => (
                    <div
                      key={day.dateIso}
                      className={
                        day.isToday
                          ? "flex flex-col items-center gap-2 rounded-2xl border-[1.7px] border-navy bg-[#F7FAFF] px-1 py-3 shadow-[0_0_0_3px_rgba(30,95,184,.1)] md:px-2.5 md:py-4"
                          : "flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-[#EDF1F7] px-1 py-3 md:px-2.5 md:py-4"
                      }
                    >
                      <span className={`text-center text-[12px] font-black leading-tight ${day.isToday ? "text-cardtitle" : "text-[#93A9C8]"}`}>
                        {day.dayLabel}
                      </span>
                      {day.mood ? (
                        <span
                          className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-[0_5px_12px_rgba(0,0,0,.2)]"
                          style={{ background: MOOD_GRADIENT[day.mood as MoodValue] }}
                        >
                          {/* Vòng tròn này nói MỘT điều — hôm đó con thấy thế nào — mà nói
                              bằng đúng màu và hình. Người mù màu và người dùng trình đọc màn
                              hình không nhận được gì (nội dung DOM của .msr là chữ thô
                              "sentiment_sad", đọc lên vô nghĩa). Tên tâm trạng đi kèm ở dạng
                              sr-only: không đổi một pixel nào trên màn, mà thành có nghĩa. */}
                          <span aria-hidden="true" className="msr text-[28px]">{MOOD_ICON[day.mood as MoodValue]}</span>
                          <span className="sr-only">{MOOD_NAME[day.mood as MoodValue]}</span>
                        </span>
                      ) : (
                        // Vòng tròn rỗng = hôm đó KHÔNG có ô cảm xúc nào của em. Viền đỏ cũ
                        // đọc thành "ngày xấu"; nhưng nguyên nhân thường nhất là em bận,
                        // quên, hoặc cô chưa điểm danh — không có gì để trách. Xám.
                        <span className={`h-[52px] w-[52px] rounded-full border-2 border-dashed ${day.isFuture ? "border-[#27467E]" : "border-[#B9C4D4]"}`} />
                      )}
                      {/* Cùng một hàm với /diem-danh (attendance-view.tsx). Trước 01/08/2026
                          hai lưới tuần này chép tay hai câu khác nhau cho cùng một dữ liệu,
                          và cả hai đều in "vắng" cho ngày chưa ai điểm danh. */}
                      <span className={`text-center text-[11px] font-bold leading-tight ${day.isToday ? "text-cardtitle" : "text-caption"}`}>
                        {dayCaptionText(day)}
                        {day.isToday && day.checkedInAt ? (
                          <span className="block md:inline">
                            <span className="hidden md:inline"> · </span>hôm nay
                          </span>
                        ) : null}
                      </span>
                      {/* Trạng thái điểm danh bằng chữ, cùng bảng với /diem-danh: ngày cô ghi
                          tay (vắng / có phép) không có giờ check-in nên nếu thiếu dòng này,
                          ô của nó trống trơn và em không có cách nào biết chuyện gì. */}
                      <DayNote status={day.status} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-[18px] flex flex-wrap items-start gap-[18px]">
                <div className="min-w-0 flex-[2_1_520px] flex flex-col gap-[18px]">
                  {report.data.report.glow.length > 0 && (
                    <div className="rounded-[22px] bg-card p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-6">
                      <h2 className="flex items-center gap-2 text-[16px] font-black text-cardtitle">
                        <span aria-hidden="true" className="msr text-[20px] text-[#F5A300]">sunny</span>
                        Con đang tỏa sáng ở
                      </h2>
                      <div className="mt-4 flex flex-col gap-3">
                        {report.data.report.glow.map((item) => (
                          <div
                            key={item.title}
                            className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 ${GLOW_BG[item.accentColor]}`}
                          >
                            <span className={`flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl ${GLOW_ICON_BG[item.accentColor]}`}>
                              <span aria-hidden="true" className={`msr text-[21px] ${GLOW_ICON_COLOR[item.accentColor]}`}>{GLOW_ICON[item.accentColor]}</span>
                            </span>
                            <div className="flex-1">
                              <div className="text-[14px] font-black text-ink">{item.title}</div>
                              <div className="mt-0.5 text-[12px] leading-relaxed text-caption">{item.detail}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {report.data.report.grow.length > 0 && (
                    <div className="rounded-[22px] bg-card p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-6">
                      <h2 className="flex items-center gap-2 text-[16px] font-black text-cardtitle">
                        <span aria-hidden="true" className="msr text-[20px] text-[#4EE39B]">psychiatry</span>
                        Con đang lớn lên ở
                      </h2>
                      <div className="mt-4 flex flex-wrap items-center gap-4">
                        <Mascot pose="think" width={56} />
                        <div className="min-w-0 flex-1 basis-[280px]">
                          <div className="text-[15px] font-black text-ink">{report.data.report.grow[0]!.title}</div>
                          <div className="mt-1.5 text-[13px] leading-relaxed text-[#93A9C8]">{report.data.report.grow[0]!.detail}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-[18px]">
                  <div className="rounded-[20px] bg-card p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                    <h2 className="text-[15px] font-black text-cardtitle">Cảm xúc cả tuần</h2>
                    {recordedDays > 0 ? (
                      <>
                        <div className="mt-4 flex h-4 overflow-hidden rounded-lg">
                          {([4, 3, 2, 1] as MoodValue[]).map((mood) =>
                            moodCounts[mood] > 0 ? (
                              <span
                                key={mood}
                                style={{ width: `${(moodCounts[mood] / recordedDays) * 100}%`, background: MOOD_GRADIENT[mood] }}
                              />
                            ) : null,
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3.5">
                          {([4, 3, 2, 1] as MoodValue[])
                            .filter((mood) => moodCounts[mood] > 0)
                            .map((mood) => (
                              <span key={mood} className="flex items-center gap-1.5 text-[12px] font-bold text-[#4E5F78]">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: MOOD_DOT[mood] }} />
                                {MOOD_NAME[mood]} {moodCounts[mood]} ngày
                              </span>
                            ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-[12px] text-caption">Chưa có check-in nào tuần này.</p>
                    )}
                  </div>

                  <Link
                    href="/bao-cao"
                    className="relative overflow-hidden rounded-[20px] bg-gradient-to-r from-gold to-[#FFDD66] p-5"
                  >
                    <div aria-hidden className="absolute -bottom-11 -right-[30px] h-[130px] w-[130px] rounded-full bg-card/35" />
                    <div className="relative text-[15px] font-black text-cardtitle">
                      Báo cáo Trưởng thành · {formatWeekLabel(report.data.report.weekLabel)}
                    </div>
                    {/* CẮT 06/08/2026 (§1.5): "Bản đầy đủ thầy cô gửi bố mẹ — con xem trước
                        được." Vế "con xem trước được" là mô tả lại chính cái nút ngay dưới
                        ("Mở báo cáo"), tức chữ nói lại việc mà hình đã nói. Giữ đúng thông
                        tin em chưa biết: bản này còn đi tới bố mẹ. */}
                    <p className="relative mt-1 text-[12px] text-gold-text">Bản đầy đủ gửi bố mẹ</p>
                    <span className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-[12px] font-black text-white">
                      Mở báo cáo
                      <span aria-hidden="true" className="msr text-[16px] text-gold">arrow_forward</span>
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          )}
      </MainContent>
      {/* Đường ra ở điện thoại — /tuan-nay không nằm trong tab bar nhưng tab bar là
          cách duy nhất quay về Hub khi app đã thêm vào màn hình chính (không có nút Back). */}
      {roles.includes("student") && (
        <div className="md:hidden">
          <StudentTabBar fullName={displayName} email={email} />
        </div>
      )}
    </div>
  );
}
