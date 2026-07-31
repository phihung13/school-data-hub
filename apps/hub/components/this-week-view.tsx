// components/this-week-view.tsx — V6 Tuần này của mình (Hub Desktop V2, 29/07/2026).
// Ghép từ 2 nguồn dữ liệu thật đã có: lịch tuần (checkin.getAttendanceOverview)
// + Glow/Grow (report.getMyLatestReport) — không thêm bảng/truy vấn mới.
//
// Sửa 31/07/2026 (gói "frontend-trang-thai"): khuôn `{attendance.data && report.data && …}`
// không có nhánh isPending/error nên query hỏng là màn TRẮNG vĩnh viễn, và phụ đề
// còn kẹt ở "…" mãi mãi (dấu ba chấm nghĩa là "đang tải" — nói dối khi thật ra là
// đã hỏng). Nay đủ ba trạng thái + nút Thử lại; sidebar nhận `roles`/`classCode`
// thật thay vì role="student" viết cứng; khối mobile có đường ra.
"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import type { HubRole, MoodValue } from "@hub/core/contracts";
import { HubSidebar } from "./hub-sidebar";
import { Mascot } from "./mascot";
import { DesktopOnlyNotice } from "./ui/desktop-only-notice";
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
const GLOW_ICON_BG: Record<string, string> = { green: "bg-[#E3F8ED]", blue: "bg-[#E2F0FC]", amber: "bg-[#FFF1C9]" };
const GLOW_ICON_COLOR: Record<string, string> = { green: "text-[#00A05F]", blue: "text-[#2C7BF2]", amber: "text-[#E8940D]" };
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
    <>
      <DesktopOnlyNotice
        title="Trang Tuần này đang tối ưu cho máy tính."
        hint="Mở trên máy tính để xem đủ lịch tuần và phần Glow/Grow."
        showTabBar={roles.includes("student")}
      />
      <div className="hidden md:flex md:h-screen md:w-full md:overflow-hidden">
        <div className="flex w-[240px] flex-none">
          <HubSidebar roles={roles} active="week" fullName={displayName} email={email} classCode={classCode} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-pagebgDesktop">
          <div className="flex flex-none items-center gap-3.5 border-b border-[#E9ECF2] bg-white px-7 py-3.5">
            <div className="flex-1">
              <div className="text-[16px] font-black text-ink">Tuần này của mình</div>
              {/* "…" chỉ được phép khi ĐANG tải thật; hỏng thì nói là hỏng. */}
              <div className="text-[11.5px] text-caption">
                {report.data?.report.weekLabel ?? (isPending ? "…" : error ? "chưa tải được" : "")}
              </div>
            </div>
          </div>

          {isPending && <LoadingState label="Đang tải tuần này của con…" />}
          {!isPending && error && <ErrorState error={error} label="Tuần này của mình" onRetry={retry} />}

          {attendance.data && report.data && (
            <div className="flex-1 overflow-y-auto p-7">
              <div className="rounded-[22px] bg-white p-6 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[16px] font-black text-navy">Mỗi ngày của con</span>
                  <span className="text-[11.5px] font-bold text-caption">giờ check-in + cảm xúc</span>
                </div>
                <div className="mt-[18px] grid grid-cols-5 gap-3.5">
                  {attendance.data.week.map((day) => (
                    <div
                      key={day.dateIso}
                      className={
                        day.isToday
                          ? "flex flex-col items-center gap-2 rounded-2xl border-[1.7px] border-navy bg-[#F7FAFF] px-2.5 py-4 shadow-[0_0_0_3px_rgba(30,95,184,.1)]"
                          : "flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-[#EDF1F7] px-2.5 py-4"
                      }
                    >
                      <span className={`text-[12px] font-black ${day.isToday ? "text-navy" : "text-[#5B6B80]"}`}>{day.dayLabel}</span>
                      {day.mood ? (
                        <span
                          className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-[0_5px_12px_rgba(0,0,0,.2)]"
                          style={{ background: MOOD_GRADIENT[day.mood as MoodValue] }}
                        >
                          <span className="msr text-[28px]">{MOOD_ICON[day.mood as MoodValue]}</span>
                        </span>
                      ) : (
                        <span className={`h-[52px] w-[52px] rounded-full border-2 border-dashed ${day.isFuture ? "border-[#C9D2DE]" : "border-[#F0474D]"}`} />
                      )}
                      <span className={`text-[11px] font-bold ${day.isToday ? "text-navy" : "text-caption"}`}>
                        {day.checkedInAt ?? (day.isFuture ? "chưa tới" : "vắng")}
                        {day.isToday && day.checkedInAt ? " · hôm nay" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-[18px] flex flex-wrap items-start gap-[18px]">
                <div className="min-w-0 flex-[2_1_520px] flex flex-col gap-[18px]">
                  {report.data.report.glow.length > 0 && (
                    <div className="rounded-[22px] bg-white p-6 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                      <div className="flex items-center gap-2">
                        <span className="msr text-[20px] text-[#F5A300]">sunny</span>
                        <span className="text-[16px] font-black text-navy">Con đang tỏa sáng ở</span>
                      </div>
                      <div className="mt-4 flex flex-col gap-3">
                        {report.data.report.glow.map((item) => (
                          <div
                            key={item.title}
                            className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 ${GLOW_BG[item.accentColor]}`}
                          >
                            <span className={`flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl ${GLOW_ICON_BG[item.accentColor]}`}>
                              <span className={`msr text-[21px] ${GLOW_ICON_COLOR[item.accentColor]}`}>{GLOW_ICON[item.accentColor]}</span>
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
                    <div className="rounded-[22px] bg-white p-6 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                      <div className="flex items-center gap-2">
                        <span className="msr text-[20px] text-[#00A05F]">psychiatry</span>
                        <span className="text-[16px] font-black text-navy">Con đang lớn lên ở</span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-4">
                        <Mascot pose="think" width={56} />
                        <div className="min-w-0 flex-1 basis-[280px]">
                          <div className="text-[15px] font-black text-ink">{report.data.report.grow[0]!.title}</div>
                          <div className="mt-1.5 text-[13px] leading-relaxed text-[#5B6B80]">{report.data.report.grow[0]!.detail}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-[18px]">
                  <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                    <div className="text-[15px] font-black text-navy">Cảm xúc cả tuần</div>
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
                    <p className="mt-3 text-[11.5px] leading-relaxed text-caption">
                      Cảm xúc là chuyện riêng của con — chỉ GVCN xem để biết khi nào con cần giúp.
                    </p>
                  </div>

                  <Link
                    href="/bao-cao"
                    className="relative overflow-hidden rounded-[20px] bg-gradient-to-r from-gold to-[#FFDD66] p-5"
                  >
                    <div aria-hidden className="absolute -bottom-11 -right-[30px] h-[130px] w-[130px] rounded-full bg-white/35" />
                    <div className="relative text-[15px] font-black text-navy">Báo cáo Trưởng thành {report.data.report.weekLabel}</div>
                    <p className="relative mt-1 text-[12px] leading-relaxed text-gold-text">
                      Bản đầy đủ GVCN gửi bố mẹ — con xem trước được.
                    </p>
                    <span className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-[12px] font-black text-white">
                      Mở báo cáo
                      <span className="msr text-[16px] text-gold">arrow_forward</span>
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
