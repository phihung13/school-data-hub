// components/profile-view.tsx — V9 Hồ sơ (Hub Desktop V2, 30/07/2026).
// KHÔNG có "huy hiệu"/"đọc sách tuần"/"thiết bị đang đăng nhập"/mục Cài đặt như
// bản vẽ tay — chưa có bảng huy hiệu, chưa theo dõi thiết bị, và 3 công tắc cài
// đặt (ngôn ngữ, nhắc giờ, thêm màn hình chính) chưa có tính năng thật đứng sau.
// GVCN cũng mở /ho-so (sidebar dùng chung) nhưng dùng bản rút gọn — mockup chỉ vẽ
// hồ sơ học sinh.
//
// Sửa 31/07/2026 (gói "frontend-trang-thai"), bốn lỗi:
//   1. `{profile && …}` không có nhánh isPending/error → hết phiên hay mất mạng là
//      màn TRẮNG vĩnh viễn, ngay trên trang duy nhất có nút Đăng xuất.
//   2. Bản mobile là NGÕ CỤT: một câu "tối ưu cho máy tính", không link nào — mà
//      "Hồ sơ" là 1 trong 3 tab chính của học sinh (tab-bar.tsx). Nay có bản
//      mobile thật (ảnh đại diện, tên, lớp, mã học sinh, Đăng xuất) + tab bar.
//   3. SimpleProfile (nhân viên) là `flex h-screen` với sidebar `w-[240px]` KHÔNG
//      tiền tố md: — trên 390px sidebar nuốt 240px, phần còn lại vỡ.
//   4. HubSidebar nhận role="teacher"/"student" cứng: admin, phụ huynh, hiệu
//      trưởng đều rơi vào menu GVCN. Nay truyền `roles` thật của phiên.
//
// Sửa 31/07/2026 (gói "a11y-nen"): mỗi nhánh (học sinh / nhân viên) gộp về MỘT cây
// duy nhất có <MainContent> bọc nội dung — menu trái và tab bar nằm NGOÀI nó, nên
// đường tắt "Bỏ qua menu" ở layout.tsx mới thật sự bỏ qua được menu. Trước đó nhánh
// học sinh là hai cây rời (mobile + desktop) không cây nào có landmark; nếu đặt
// <main id="noi-dung"> vào cả hai thì trang có hai id trùng nhau, trình duyệt chỉ
// nhảy tới cái đầu — cái đang display:none ở khổ màn hiện tại.
//
// Sửa 31/07/2026 (gói "mobile-cho-man-con-thieu"): bản điện thoại vẫn còn là bản RÚT
// GỌN — nó kết bằng câu "Bản đầy đủ (ai thấy gì của mình, liên hệ GVCN) mở trên máy
// tính". Hai thứ bị cắt đúng là hai thứ không được phép cắt:
//   1. Khối "Ai thấy gì của mình?" — DESIGN-GUIDELINES §9 và PRODUCT.md bắt người
//      nhập dữ liệu cảm xúc phải biết ai đọc được. Bối cảnh dùng thật của học sinh
//      THCS là điện thoại, nên để khối này chỉ ở desktop = giấu nó khỏi gần như toàn
//      bộ người mà nó sinh ra để bảo vệ.
//   2. Link "Trợ giúp & liên hệ GVCN" (/can-gap-thay-co) — đường duy nhất từ tab Hồ
//      sơ để em nhờ cô giúp. Em cần nó lúc 9 giờ tối, cầm điện thoại.
// Hai khối nay dựng một lần thành <WhoSeesWhatCard>/<HelpLink> rồi dùng chung cho cả
// hai khổ màn: không chép markup nên không thể lệch nội dung giữa hai bản. Bố cục
// điện thoại vẫn là MỘT CỘT sẵn có, không vẽ mới. Nút Đăng xuất xuống cuối cột —
// hành động rời trang thì đứng sau nội dung, không chen giữa.
//
// Sửa 31/07/2026 (gói "giong-noi-va-don-dep"): ba chỗ trong màn này nói chữ "GVCN" với
// một đứa trẻ 11 tuổi — hai chỗ còn lấy chính chữ viết tắt đó LÀM TÊN người khi chưa
// biết tên cô (`teacherName ?? "GVCN"`). Nay đi qua teacherLabel() ở ngay dưới: cắt hậu
// tố chức danh trong full_name, chưa biết tên thì nói "thầy cô chủ nhiệm".
"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import type { HubRole } from "@hub/core/contracts";
import { Mascot } from "./mascot";
import { HubSidebar } from "./hub-sidebar";
import { MainContent } from "./page-shell";
import { StudentTabBar } from "./tab-bar";
import { ErrorState, LoadingState } from "./ui/query-state";
import { classLabel, personName } from "./ui/labels";

/**
 * Tên cô/thầy chủ nhiệm để GỌI trong câu văn với học sinh.
 *
 * Hai lỗi cùng lúc được vá ở đây (gói "giong-noi-va-don-dep", 31/07/2026):
 *  1. `teacherName ?? "GVCN"` biến một chữ viết tắt hành chính thành TÊN NGƯỜI: em đọc
 *     được "GVCN — cảm xúc, điểm danh, lời nhắn "cần gặp thầy cô"". DESIGN-GUIDELINES §8
 *     cấm từ vựng vận hành ở bề mặt học sinh, và đây còn là chỗ nhạy nhất: khối nói cho
 *     em biết AI đọc được cảm xúc của mình.
 *  2. `core.users.full_name` mang hậu tố chức danh ("Cô Lan (GVCN 6A1)") nên kể cả khi
 *     CÓ tên thật, chữ "GVCN" vẫn hiện — personName() cắt phần trong ngoặc.
 * Chưa biết tên thì nói "thầy cô chủ nhiệm" (đúng người, không bịa tên).
 */
function teacherLabel(fullName: string | null | undefined): string {
  return personName(fullName) || "thầy cô chủ nhiệm";
}

function useLogout() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
}

function LogoutButton({ onClick, className }: { onClick: () => void; className: string }) {
  return (
    <button type="button" onClick={onClick} className={className}>
      <span aria-hidden="true" className="msr text-[19px] text-[#D2383E]">logout</span>
      Đăng xuất
    </button>
  );
}

/**
 * "Ai thấy gì của mình?" — bắt buộc có ở MỌI khổ màn (DESIGN-GUIDELINES §9).
 * Dùng chung cho điện thoại và desktop: chép làm hai bản là mở đường cho hai bản
 * nói khác nhau về cùng một luật riêng tư.
 *
 * Viết lại 01/08/2026 (ADR-026, migration 0044). Đây là màn SINH RA để nói thật, nên
 * nó mà nói thiếu thì hỏng gấp đôi — và dòng cô chủ nhiệm là dòng dễ nói thiếu nhất.
 *
 * Cái đã đổi ở tầng dữ liệu: `core.can_read_mood()` mất nhánh chủ nhiệm, nay chỉ còn
 * `is_me ∨ in_my_cluster`. Cô KHÔNG đọc được ô cảm xúc nữa — không trên màn hình, và
 * hỏi thẳng cơ sở dữ liệu cũng bị Postgres từ chối. Nhưng cô KHÔNG mất hết: cô vẫn
 * thấy điểm danh, vẫn đọc lời nhắn "cần gặp thầy cô", và vẫn nhận tín hiệu "em này cần
 * để ý" khi có nhiều ngày liền không vui.
 *
 * Vì thế dòng của cô phải TÁCH LÀM HAI Ý, đúng như §9 chốt, và không được gộp:
 *  · gộp thành "cô không thấy gì" là nói QUÁ — em sẽ tưởng bấm nút cần gặp cũng vô ích,
 *    và đó là đường an toàn duy nhất em có.
 *  · gộp thành "cô thấy cảm xúc" là nói THIẾU SỰ THẬT MỚI — đúng câu vừa bị bỏ.
 * Câu "biết vậy thôi, không biết con đã ghi gì" là câu quan trọng nhất cả khối: nó nói
 * cho em biết ranh giới, để em không phải tự đoán ranh giới đó bằng cách thử.
 */
function WhoSeesWhatCard({ teacherName }: { teacherName: string | null }) {
  const teacher = teacherLabel(teacherName);
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border-[1.5px] border-[#CFE4FB] bg-[#F0F7FF] p-5 text-left md:p-[22px]">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="msr text-[20px] text-[#2C7BF2]">shield_person</span>
        <span className="text-[15px] font-black text-[#1D4E8F]">Ai thấy gì của mình?</span>
      </div>
      {/* Màu không bao giờ là tín hiệu duy nhất (§11): mỗi dòng có icon check/cancel
          KÈM chữ nói rõ thấy gì — người mù màu vẫn đọc đủ nghĩa. */}
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="msr flex-none text-[18px] text-[#00A05F]">check_circle</span>
        <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
          <b>Thầy cô tâm lý</b> — đọc được nhật ký cảm xúc của con và lời nhắn con gửi.
        </span>
      </div>
      {/* Dòng dài nhất của khối, và cố ý dài: nó là chỗ DUY NHẤT em đọc được ranh giới
          mới của cô chủ nhiệm. Icon `visibility` (không phải check/cancel) vì dòng này
          không thuộc hẳn nhóm nào — cô thấy một phần, và phần đó phải được kể ra. */}
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="msr flex-none text-[18px] text-[#2C7BF2]">visibility</span>
        <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
          <b>{teacher}</b> — xem điểm danh và đọc lời nhắn con gửi. Cô <b>không đọc</b> được con đã
          ghi cảm xúc gì mỗi ngày. Cô chỉ biết là con <b>cần được để ý</b> khi con bấm nút cần gặp,
          hoặc khi hệ thống thấy con có nhiều ngày liền không vui — biết vậy thôi, không biết con đã
          ghi gì.
        </span>
      </div>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="msr flex-none text-[18px] text-[#2C7BF2]">visibility</span>
        <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
          <b>Bố mẹ</b> — điểm danh và Báo cáo Trưởng thành (không xem chi tiết cảm xúc từng ngày)
        </span>
      </div>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="msr flex-none text-[18px] text-[#D2383E]">cancel</span>
        <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
          <b>Bạn cùng lớp</b> — không thấy gì cả
        </span>
      </div>
    </div>
  );
}

/**
 * Đường tới "Cần gặp thầy cô". Ở desktop nó là một hàng trong thẻ "Tài khoản";
 * ở điện thoại nó đứng riêng thành một thẻ bấm được — cùng nội dung, khác vỏ, nên
 * `className` là tham số chứ không phải hai bản chép tay.
 */
function HelpLink({ teacherName, className }: { teacherName: string | null; className: string }) {
  return (
    <a href="/can-gap-thay-co" className={className}>
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-[#E3F8ED]">
        <span aria-hidden="true" className="msr text-[20px] text-[#00A05F]">support_agent</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-extrabold text-ink">Trợ giúp &amp; nhắn thầy cô chủ nhiệm</div>
        <div className="mt-px text-[11.5px] text-caption">
          {teacherLabel(teacherName)} · thường trả lời trong ngày
        </div>
      </div>
      <span aria-hidden="true" className="msr text-[20px] text-[#C9D2DE]">chevron_right</span>
    </a>
  );
}

export function ProfileView({
  isStudent,
  displayName,
  email,
  roles,
  classCode,
}: {
  isStudent: boolean;
  displayName: string;
  email: string;
  roles: HubRole[];
  classCode?: string | null;
}) {
  return isStudent ? (
    <StudentProfile displayName={displayName} email={email} roles={roles} classCode={classCode} />
  ) : (
    <SimpleProfile displayName={displayName} email={email} roles={roles} classCode={classCode} />
  );
}

function SimpleProfile({
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
  const logout = useLogout();
  return (
    // `md:h-screen` chứ không phải `h-screen`: trên điện thoại để trang cao tự
    // nhiên và cuộn được, đúng cách bốn màn học sinh đang làm.
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Sidebar 240px chỉ có nghĩa từ md trở lên — dưới đó nó ăn 2/3 chiều ngang máy. */}
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="profile" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <MainContent className="flex flex-1 flex-col items-center justify-center gap-4 bg-pagebgDesktop px-6 py-10">
        <h1 className="sr-only">Hồ sơ của mình</h1>
        <Mascot pose="think" width={64} />
        <div className="text-center text-[18px] font-black text-navy">{displayName}</div>
        <div className="break-all text-center text-[12.5px] text-caption">{email}</div>
        {classLabel(classCode) && (
          <div className="text-[12.5px] font-bold text-[#33507C]">{classLabel(classCode)}</div>
        )}
        <LogoutButton
          onClick={logout}
          className="mt-2 flex items-center gap-2 rounded-2xl border-[1.5px] border-[#FFD5D6] bg-[#FFF5F5] px-6 py-3 text-[13.5px] font-black text-[#D2383E]"
        />
        {/* Nhân viên không có tab bar; nút này là đường ra duy nhất trên điện thoại.
            inline-flex + min-h-[44px]: đo thật trên 360px ngày 02/08/2026 ra 81×19 — một
            đường ra cao 19px trên màn cảm ứng, đúng ở màn mà nó là đường ra DUY NHẤT. */}
        <a
          href="/home"
          className="inline-flex min-h-[44px] items-center text-[12.5px] font-extrabold text-[#1D4E8F] underline underline-offset-2 md:hidden"
        >
          Về trang chủ
        </a>
      </MainContent>
    </div>
  );
}

function StudentProfile({
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
  const logout = useLogout();
  const query = trpc.profile.getMyStudentProfile.useQuery();
  const profile = query.data;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Menu trái và tab bar nằm NGOÀI <MainContent> — đó chính là thứ đường tắt
          "Bỏ qua menu" phải bỏ qua được. */}
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="profile" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <MainContent className="flex min-w-0 flex-1 flex-col bg-pagebg md:overflow-hidden md:bg-pagebgDesktop">
        {/* Một <h1> duy nhất, luôn có mặt ở mọi khổ màn. Không đổi thẻ của dòng chữ
            đang hiện vì mỗi khổ màn vẽ tiêu đề ở một chỗ khác nhau (tên em ở điện
            thoại, thanh trên ở desktop) — đặt <h1> vào cả hai là để hai <h1> trong
            cùng một DOM. */}
        <h1 className="sr-only">Hồ sơ của mình</h1>
        {/* Bản mobile THẬT: một cột, đủ mọi thứ bản desktop có — tên, lớp, mã học sinh
            để đọc cho cô, đường nhờ cô giúp, luật riêng tư, rồi mới tới Đăng xuất.
            Không còn khối nào "chỉ có ở máy tính". */}
        <div className="flex flex-1 flex-col items-center gap-3 px-5 pb-6 pt-10 text-center md:hidden">
          <span className="flex h-[84px] w-[84px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-[32px] font-black text-navy shadow-[0_8px_18px_rgba(232,148,13,.3)]">
            {initial}
          </span>
          <div className="text-[19px] font-black text-ink">{profile?.fullName ?? displayName}</div>
          {query.isPending && <p className="text-[12.5px] text-caption">Đang tải hồ sơ…</p>}
          {!query.isPending && query.error && (
            <p className="text-[12.5px] font-bold text-[#D2383E]">
              Chưa tải được lớp và mã học sinh.{" "}
              <button type="button" onClick={() => void query.refetch()} className="min-h-[44px] underline underline-offset-2">
                Thử lại
              </button>
            </p>
          )}
          {profile && (
            <>
              <div className="text-[12.5px] font-semibold text-[#5B6B80]">
                Lớp {profile.classCode} · {profile.schoolName}
              </div>
              <div className="rounded-full bg-[#F1F4F8] px-3.5 py-1.5 text-[11.5px] font-bold text-[#33507C]">
                Mã học sinh {profile.studentCode}
              </div>
            </>
          )}
          <div className="break-all text-[11.5px] text-caption">{email}</div>

          {/* Hai khối này chỉ vẽ được khi đã biết tên GVCN — chưa có dữ liệu thì không
              vẽ khung rỗng đoán bừa tên cô. */}
          {profile && (
            <div className="mt-3 flex w-full flex-col gap-3">
              <HelpLink
                teacherName={profile.homeroomTeacherName}
                // min-h-[52px] > 44px của §11; cả thẻ là vùng chạm, không chỉ dòng chữ.
                className="flex min-h-[52px] items-center gap-3.5 rounded-[20px] bg-white px-4 py-3 text-left shadow-[0_3px_14px_rgba(10,42,94,.06)]"
              />
              <WhoSeesWhatCard teacherName={profile.homeroomTeacherName} />
            </div>
          )}

          <LogoutButton
            onClick={logout}
            className="mt-4 flex min-h-[44px] items-center gap-2 rounded-2xl border-[1.5px] border-[#FFD5D6] bg-[#FFF5F5] px-6 py-3 text-[13.5px] font-black text-[#D2383E]"
          />
        </div>

        {/* Từ md trở lên: thanh tiêu đề + bản đầy đủ. Ba nhánh tải/lỗi/có dữ liệu nằm
            trong cùng một cột ẩn dưới md để bản điện thoại ở trên không bị lặp. */}
        <div className="hidden flex-none items-center gap-3.5 border-b border-[#E9ECF2] bg-white px-7 py-3.5 md:flex">
            <div className="flex-1">
              <div className="text-[16px] font-black text-ink">Hồ sơ của mình</div>
              <div className="text-[11.5px] text-caption">Tài khoản trường</div>
            </div>
          </div>

        <div className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden">
          {query.isPending && <LoadingState label="Đang tải hồ sơ…" />}
          {!query.isPending && query.error && (
            <ErrorState error={query.error} label="Hồ sơ" onRetry={() => void query.refetch()} />
          )}

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
                          <span aria-hidden="true" className="msr text-[15px] text-[#5B6B80]">mail</span>
                          <span className="text-[11.5px] font-bold text-[#33507C]">{email}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <div className="min-w-[92px] rounded-2xl bg-[#FFF7E0] px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span aria-hidden="true" className="msr text-[19px] text-[#F58F00]">local_fire_department</span>
                          <span className="text-[20px] font-black text-[#E8940D]">{profile.streakDays}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] font-extrabold text-[#8A5A00]">chuỗi check-in</div>
                      </div>
                      <div className="min-w-[92px] rounded-2xl bg-[#E3F8ED] px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span aria-hidden="true" className="msr text-[19px] text-[#00A05F]">event_available</span>
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
                          <span aria-hidden="true" className="msr text-[20px] text-[#2C7BF2]">verified_user</span>
                        </span>
                        <div className="flex-1">
                          <div className="text-[14px] font-extrabold text-ink">Đăng nhập bằng tài khoản trường</div>
                          <div className="mt-px text-[11.5px] text-caption">Không có mật khẩu riêng để quên</div>
                        </div>
                        <span className="rounded-full bg-[#E3F8ED] px-[11px] py-1.5 text-[10px] font-black text-[#00693F]">
                          ĐANG DÙNG
                        </span>
                      </div>
                      <HelpLink
                        teacherName={profile.homeroomTeacherName}
                        className="flex items-center gap-3.5 py-[15px] hover:bg-[#FAFBFD]"
                      />
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-4">
                  <WhoSeesWhatCard teacherName={profile.homeroomTeacherName} />

                  <div className="flex items-center gap-3 rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                    <Mascot pose="think" width={46} />
                    <p className="text-[12.5px] font-semibold leading-relaxed text-[#33507C]">
                      Hồ sơ là của con. Nếu thấy thông tin nào chưa đúng, nói với {teacherLabel(profile.homeroomTeacherName)} nhé!
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={logout}
                    className="flex items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-[#FFD5D6] bg-[#FFF5F5] p-[15px] text-[14px] font-black text-[#D2383E] hover:bg-[#FFECEC]"
                  >
                    <span aria-hidden="true" className="msr text-[20px] text-[#D2383E]">logout</span>
                    Đăng xuất
                  </button>
                  {/* #B6BECB = 1,87:1 trên trắng — dưới cả mốc 3:1 của thành phần phi văn
                      bản, mà đây là dòng em/bố mẹ đọc cho người hỗ trợ khi báo lỗi ("bản
                      nào?"). Token caption2 = 5,03:1. (01/08/2026) */}
                  <div className="text-center text-[10.5px] font-semibold text-caption2">
                    School Hub v1.0 · Giai đoạn 1 · Trường Việt Anh
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainContent>
      <div className="md:hidden">
        <StudentTabBar fullName={displayName} email={email} />
      </div>
    </div>
  );
}
