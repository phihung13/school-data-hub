// components/attendance-view.tsx — V7 Điểm danh (Hub Desktop V2, 29/07/2026).
// KHÔNG có "chuyên cần %"/"ngày có mặt X/Y" như bản vẽ tay — GĐ1 chưa có lịch
// học kỳ (không có mẫu số "tổng ngày học" thật). Bốn thẻ số liệu ở đây đều tính
// được thật từ attendance.checkins: chuỗi hiện tại, kỷ lục, tổng có mặt, gửi muộn.
//
// Sửa 31/07/2026 (gói "frontend-trang-thai"), ba lỗi:
//   1. Dòng dưới tiêu đề viết chết "Lớp 6A1" — mọi học sinh lớp khác đọc được mã
//      lớp không phải của mình. Nay đến từ `classCode` (resolveIdentity.className).
//   2. HubSidebar nhận role="student" cứng: tài khoản nhân viên mở /diem-danh sẽ
//      thấy menu học sinh. Nay truyền `roles` thật của phiên.
//   3. `{query.data && …}` không có nhánh isLoading/error → query hỏng là màn
//      TRẮNG vĩnh viễn. Nay đủ ba trạng thái, nút "Thử lại" gọi refetch().
// Và khối mobile trước đây là NGÕ CỤT: một câu "tối ưu cho máy tính", không một
// <Link> nào, không tab bar — PWA thêm vào màn hình chính không có nút Back.
"use client";

import { trpc } from "@/lib/trpc-client";
import type { HubRole } from "@hub/core/contracts";
import { HubSidebar } from "./hub-sidebar";
import { StudentTabBar } from "./tab-bar";
import { DesktopOnlyNotice } from "./ui/desktop-only-notice";
import { ErrorState, LoadingState } from "./ui/query-state";
import { classLabel } from "./ui/labels";

export function AttendanceView({
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
  const query = trpc.checkin.getAttendanceOverview.useQuery();
  const subtitle = classLabel(classCode);

  return (
    <>
      <DesktopOnlyNotice
        title="Trang Điểm danh đầy đủ đang tối ưu cho máy tính."
        hint="Mở trên máy tính để xem lịch sử và thống kê chi tiết."
        showTabBar={roles.includes("student")}
      />
      <div className="hidden md:flex md:h-screen md:w-full md:overflow-hidden">
      <div className="flex w-[240px] flex-none">
        <HubSidebar roles={roles} active="attendance" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-pagebgDesktop">
        <div className="flex flex-none items-center gap-3.5 border-b border-[#E9ECF2] bg-white px-7 py-3.5">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-gradient-to-br from-[#2C7BF2] to-[#0A4FBF]">
            <span className="msr text-[19px] text-white">fact_check</span>
          </span>
          <div className="flex-1">
            <div className="text-[16px] font-black text-ink">Điểm danh</div>
            {/* Không biết lớp thì bỏ hẳn dòng này — xem ui/labels.ts. */}
            {subtitle && <div className="text-[11.5px] text-caption">{subtitle}</div>}
          </div>
          {query.data?.week.find((d) => d.isToday)?.status && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#E3F8ED] px-[13px] py-[7px]">
              <span className="msr text-[15px] text-[#00A05F]">check_circle</span>
              <span className="text-[11.5px] font-extrabold text-[#00693F]">Hôm nay đã điểm danh</span>
            </span>
          )}
        </div>

        {/* Ba nhánh, không nhánh nào được rơi vào khoảng trắng câm lặng. */}
        {query.isPending && <LoadingState label="Đang tải lịch điểm danh…" />}
        {!query.isPending && query.error && (
          <ErrorState error={query.error} label="Điểm danh" onRetry={() => void query.refetch()} />
        )}

        {query.data && (
          <div className="flex-1 overflow-y-auto p-7">
            <div className="flex flex-wrap gap-4">
              <StatCard icon="local_fire_department" iconBg="bg-[#FFF7E0]" iconColor="text-[#F58F00]" label="Chuỗi hiện tại" value={String(query.data.streakDays)} sub="ngày liên tiếp" />
              <StatCard icon="military_tech" iconBg="bg-[#F0E9FD]" iconColor="text-[#7434E8]" label="Kỷ lục" value={String(query.data.longestStreakDays)} sub="chuỗi dài nhất" />
              <StatCard icon="event_available" iconBg="bg-[#E3F8ED]" iconColor="text-[#00A05F]" label="Tổng ngày có mặt" value={String(query.data.presentDays)} sub="đã ghi nhận" />
              <StatCard icon="schedule" iconBg="bg-[#FFF1C9]" iconColor="text-[#E8940D]" label="Gửi muộn" value={String(query.data.lateCount)} sub="cô đã xác nhận" />
            </div>

            <div className="mt-[18px] rounded-[22px] bg-white p-6 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[16px] font-black text-navy">Tuần này</span>
                <span className="text-[11.5px] font-bold text-caption">giờ check-in mỗi ngày</span>
              </div>
              <div className="mt-[18px] grid grid-cols-5 gap-3.5">
                {query.data.week.map((day) => (
                  <div
                    key={day.dateIso}
                    className={
                      day.isToday
                        ? "flex flex-col items-center gap-2 rounded-2xl border-[1.7px] border-navy bg-[#F7FAFF] px-2.5 py-4 shadow-[0_0_0_3px_rgba(30,95,184,.1)]"
                        : "flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-[#EDF1F7] px-2.5 py-4"
                    }
                  >
                    <span className={`text-[12px] font-black ${day.isToday ? "text-navy" : "text-[#5B6B80]"}`}>
                      {day.dayLabel}
                      {day.isToday && " · hôm nay"}
                    </span>
                    {day.status ? (
                      <span
                        className="flex h-[42px] w-[42px] items-center justify-center rounded-full"
                        style={{
                          background: day.status === "present" ? "linear-gradient(160deg,#00D97A,#00A85E)" : "#E3F8ED",
                          boxShadow: day.status === "present" ? "0 5px 12px rgba(0,168,94,.28)" : undefined,
                        }}
                      >
                        <span className="msr text-[22px] text-[#00A05F]">check</span>
                      </span>
                    ) : (
                      <span className={`h-[42px] w-[42px] rounded-full border-2 border-dashed ${day.isFuture ? "border-[#C9D2DE]" : "border-[#F0474D]"}`} />
                    )}
                    <span className={`text-[11.5px] font-bold ${day.isToday ? "text-navy" : "text-[#33507C]"}`}>
                      {day.checkedInAt ?? (day.isFuture ? "—" : "vắng")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-[18px] flex flex-wrap items-start gap-[18px]">
              <div className="min-w-0 flex-[2_1_520px] rounded-[22px] bg-white p-6 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                <div className="text-[16px] font-black text-navy">Lịch sử gần đây</div>
                <div className="mt-3.5 flex flex-col">
                  {query.data.history.map((h, i) => (
                    <div
                      key={h.occurred_on}
                      className={`flex items-center gap-3.5 py-3.5 ${i < query.data!.history.length - 1 ? "border-b border-[#F1F4F8]" : ""}`}
                    >
                      <span className={`h-2.5 w-2.5 flex-none rounded-full ${h.status === "present" ? "bg-[#00D97A]" : "bg-[#FFB01F]"}`} />
                      <div className="flex-1">
                        <div className="text-[13.5px] font-extrabold text-ink">
                          {new Date(h.occurred_on).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })}
                          {" · "}
                          {h.status === "present" ? "có mặt" : "gửi muộn"}
                        </div>
                        <div className="mt-px text-[11.5px] text-caption">check-in {h.checked_in_at}</div>
                      </div>
                      <span className="msr text-[19px] text-[#00A05F]">verified</span>
                    </div>
                  ))}
                  {query.data.history.length === 0 && (
                    <p className="py-4 text-center text-[12.5px] text-caption">Chưa có lịch sử điểm danh nào.</p>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-[1_1_300px] rounded-[22px] border-[1.5px] border-[#CFE4FB] bg-[#F0F7FF] p-[22px]">
                <div className="flex items-center gap-2">
                  <span className="msr text-[20px] text-[#2C7BF2]">rule</span>
                  <span className="text-[15px] font-black text-[#1D4E8F]">Điểm danh tính thế nào?</span>
                </div>
                <RuleRow n={1} bg="bg-[#00D97A]" color="text-white">
                  <b>Check-in trước 8:00</b> → tự tính là đã điểm danh, không cần làm gì thêm.
                </RuleRow>
                <RuleRow n={2} bg="bg-[#FFB01F]" color="text-[#6B4A00]">
                  <b>Gửi sau 8:00</b> → chờ cô xác nhận. Đây <b>không phải</b> vắng.
                </RuleRow>
                <RuleRow n={3} bg="bg-[#5B6B80]" color="text-white">
                  <b>Mất mạng</b> → máy vẫn lưu và tự gửi khi có mạng, giờ ghi là giờ con chạm.
                </RuleRow>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

function StatCard({ icon, iconBg, iconColor, label, value, sub }: { icon: string; iconBg: string; iconColor: string; label: string; value: string; sub: string }) {
  return (
    <div className="flex-1 basis-[200px] rounded-[20px] bg-white p-[22px] shadow-[0_3px_14px_rgba(10,42,94,.06)]">
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-extrabold text-[#5B6B80]">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <span className={`msr text-[19px] ${iconColor}`}>{icon}</span>
        </span>
      </div>
      <div className="mt-2 text-[34px] font-black text-navy">{value}</div>
      <div className="mt-2.5 text-[11px] font-semibold text-caption">{sub}</div>
    </div>
  );
}

function RuleRow({ n, bg, color, children }: { n: number; bg: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2.5">
      <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-black ${bg} ${color}`}>{n}</span>
      <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">{children}</span>
    </div>
  );
}
