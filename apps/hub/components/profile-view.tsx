// components/profile-view.tsx — V9 Hồ sơ (Hub Desktop V2, 30/07/2026).
// KHÔNG có "huy hiệu"/"đọc sách tuần"/"thiết bị đang đăng nhập"/mục Cài đặt như
// bản vẽ tay — chưa có bảng huy hiệu, chưa theo dõi thiết bị, và 3 công tắc cài
// đặt (ngôn ngữ, nhắc giờ, thêm màn hình chính) chưa có tính năng thật đứng sau.
// GVCN cũng mở /ho-so (sidebar dùng chung) nhưng dùng bản rút gọn — mockup chỉ vẽ
// hồ sơ học sinh.
"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { Mascot } from "./mascot";
import { HubSidebar } from "./hub-sidebar";

function useLogout() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
}

export function ProfileView({
  isStudent,
  displayName,
  email,
}: {
  isStudent: boolean;
  displayName: string;
  email: string;
}) {
  return isStudent ? (
    <StudentProfile displayName={displayName} email={email} />
  ) : (
    <SimpleProfile displayName={displayName} email={email} />
  );
}

function SimpleProfile({ displayName, email }: { displayName: string; email: string }) {
  const logout = useLogout();
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex w-[240px] flex-none">
        <HubSidebar role="teacher" active="profile" fullName={displayName} email={email} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-pagebgDesktop px-6">
        <Mascot pose="think" width={64} />
        <div className="text-[18px] font-black text-navy">{displayName}</div>
        <div className="text-[12.5px] text-caption">{email}</div>
        <button
          type="button"
          onClick={logout}
          className="mt-2 flex items-center gap-2 rounded-2xl border-[1.5px] border-[#FFD5D6] bg-[#FFF5F5] px-6 py-3 text-[13.5px] font-black text-[#D2383E]"
        >
          <span className="msr text-[19px] text-[#D2383E]">logout</span>
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

function StudentProfile({ displayName, email }: { displayName: string; email: string }) {
  const logout = useLogout();
  const query = trpc.profile.getMyStudentProfile.useQuery();
  const profile = query.data;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <>
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-2 px-6 text-center md:hidden">
        <span className="msr text-[40px] text-caption">desktop_windows</span>
        <p className="text-[14px] font-bold text-ink">Trang này đang tối ưu cho máy tính.</p>
      </div>
      <div className="hidden md:flex md:h-screen md:w-full md:overflow-hidden">
        <div className="flex w-[240px] flex-none">
          <HubSidebar role="student" active="profile" fullName={displayName} email={email} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-pagebgDesktop">
          <div className="flex flex-none items-center gap-3.5 border-b border-[#E9ECF2] bg-white px-7 py-3.5">
            <div className="flex-1">
              <div className="text-[16px] font-black text-ink">Hồ sơ của mình</div>
              <div className="text-[11.5px] text-caption">Tài khoản trường</div>
            </div>
          </div>

          {profile && (
            <div className="flex-1 overflow-y-auto p-7">
              <div className="flex flex-wrap items-start gap-5">
                <div className="min-w-0 flex-[2_1_520px] flex flex-col gap-[18px]">
                  <div className="flex flex-wrap items-center gap-5 rounded-[22px] bg-white p-[26px] shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                    <span className="flex h-[84px] w-[84px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-[32px] font-black text-navy shadow-[0_8px_18px_rgba(232,148,13,.3)]">
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1 basis-[240px]">
                      <div className="text-[22px] font-black text-ink">{profile.fullName}</div>
                      <div className="mt-1 text-[13px] font-semibold text-[#5B6B80]">
                        Lớp {profile.classCode} · {profile.schoolName} · mã học sinh {profile.studentCode}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-full bg-[#F1F4F8] px-3 py-1.5">
                          <span className="msr text-[15px] text-[#5B6B80]">mail</span>
                          <span className="text-[11.5px] font-bold text-[#33507C]">{email}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <div className="min-w-[92px] rounded-2xl bg-[#FFF7E0] px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="msr text-[19px] text-[#F58F00]">local_fire_department</span>
                          <span className="text-[20px] font-black text-[#E8940D]">{profile.streakDays}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] font-extrabold text-[#8A5A00]">chuỗi check-in</div>
                      </div>
                      <div className="min-w-[92px] rounded-2xl bg-[#E3F8ED] px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="msr text-[19px] text-[#00A05F]">event_available</span>
                          <span className="text-[20px] font-black text-[#00693F]">{profile.presentDays}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] font-extrabold text-[#00693F]">ngày có mặt</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] bg-white p-6 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                    <div className="text-[16px] font-black text-navy">Tài khoản</div>
                    <div className="mt-3.5 flex flex-col">
                      <div className="flex items-center gap-3.5 border-b border-[#F1F4F8] py-[15px]">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-[#F0F7FF]">
                          <span className="msr text-[20px] text-[#2C7BF2]">verified_user</span>
                        </span>
                        <div className="flex-1">
                          <div className="text-[14px] font-extrabold text-ink">Đăng nhập bằng tài khoản trường</div>
                          <div className="mt-px text-[11.5px] text-caption">Không có mật khẩu riêng để quên</div>
                        </div>
                        <span className="rounded-full bg-[#E3F8ED] px-[11px] py-1.5 text-[10px] font-black text-[#00693F]">
                          ĐANG DÙNG
                        </span>
                      </div>
                      <a href="/can-gap-thay-co" className="flex items-center gap-3.5 py-[15px] hover:bg-[#FAFBFD]">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-[#E3F8ED]">
                          <span className="msr text-[20px] text-[#00A05F]">support_agent</span>
                        </span>
                        <div className="flex-1">
                          <div className="text-[14px] font-extrabold text-ink">Trợ giúp &amp; liên hệ GVCN</div>
                          <div className="mt-px text-[11.5px] text-caption">
                            {profile.homeroomTeacherName ?? "GVCN"} · thường trả lời trong ngày
                          </div>
                        </div>
                        <span className="msr text-[20px] text-[#C9D2DE]">chevron_right</span>
                      </a>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-4">
                  <div className="flex flex-col gap-3 rounded-[22px] border-[1.5px] border-[#CFE4FB] bg-[#F0F7FF] p-[22px]">
                    <div className="flex items-center gap-2">
                      <span className="msr text-[20px] text-[#2C7BF2]">shield_person</span>
                      <span className="text-[15px] font-black text-[#1D4E8F]">Ai thấy gì của mình?</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="msr flex-none text-[18px] text-[#00A05F]">check_circle</span>
                      <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
                        <b>{profile.homeroomTeacherName ?? "GVCN"}</b> — cảm xúc, điểm danh, lời nhắn «cần gặp thầy cô»
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="msr flex-none text-[18px] text-[#00A05F]">check_circle</span>
                      <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
                        <b>Bố mẹ</b> — điểm danh và Báo cáo Trưởng thành (không xem chi tiết cảm xúc từng ngày)
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="msr flex-none text-[18px] text-[#D2383E]">cancel</span>
                      <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
                        <b>Bạn cùng lớp</b> — không thấy gì cả
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                    <Mascot pose="think" width={46} />
                    <p className="text-[12.5px] font-semibold leading-relaxed text-[#33507C]">
                      Hồ sơ là của con. Nếu thấy thông tin nào chưa đúng, nói với {profile.homeroomTeacherName ?? "GVCN"} nhé!
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={logout}
                    className="flex items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-[#FFD5D6] bg-[#FFF5F5] p-[15px] text-[14px] font-black text-[#D2383E] hover:bg-[#FFECEC]"
                  >
                    <span className="msr text-[20px] text-[#D2383E]">logout</span>
                    Đăng xuất
                  </button>
                  <div className="text-center text-[10.5px] font-semibold text-[#B6BECB]">
                    School Hub v1.0 · Giai đoạn 1 · Trường Việt Anh
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
