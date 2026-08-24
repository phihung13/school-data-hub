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
//
// Sửa 31/07/2026 (gói "a11y-nen"), hai việc:
//   1. BỎ HẲN màn chặn DesktopOnlyNotice. PRODUCT.md ghi bối cảnh dùng thật của học
//      sinh THCS là ĐIỆN THOẠI, 5–10 giây trước giờ vào lớp — mà /diem-danh lại chỉ
//      mở được trên máy tính, và trang này chỉ học sinh mới vào được (page.tsx đá
//      mọi vai khác về /home). Nghĩa là màn chặn đó chặn đúng 100% người dùng thật
//      của nó. Nội dung vốn xếp dọc nên không cần vẽ lại: bỏ "hidden md:flex", cho
//      thẻ số liệu xuống 2 cột và lưới tuần co lại là đọc được — xấu hơn desktop,
//      nhưng đọc được vẫn hơn hẳn chặn hẳn.
//   2. Vùng nội dung là <MainContent> (landmark <main id="noi-dung">) để đường tắt
//      "Bỏ qua menu" ở layout.tsx nhảy tới được, và tiêu đề màn là <h1> thật.
//
// Sửa 01/08/2026 (QĐ-3 phía học sinh) — NGÀY KHÔNG AI GHI GÌ BỊ IN THÀNH "VẮNG":
// lưới tuần viết `day.checkedInAt ?? (day.isFuture ? "—" : "vắng")` và vẽ viền ĐỎ, nên một
// ngày cô chưa kịp điểm danh lớp trông y hệt một ngày em nghỉ học. Chi tiết đầy đủ ở
// `dayCaptionText` phía dưới; kèm theo là dòng luật thứ tư trong khối "Điểm danh tính thế
// nào?" để ô trống được giải thích chứ không để em tự đoán.
"use client";

import { trpc } from "@/lib/trpc-client";
import type { AttendanceStatus, HubRole } from "@hub/core/contracts";
import { ATTENDANCE_STATUS_LABEL } from "@hub/core/contracts";
import { HubSidebar } from "./hub-sidebar";
import { MainContent } from "./page-shell";
import { StudentTabBar } from "./tab-bar";
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
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Menu trái 240px chỉ có nghĩa từ md; dưới đó đường ra là tab bar cuối trang. */}
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="attendance" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <MainContent className="flex min-w-0 flex-1 flex-col bg-pagebg s-home-md md:overflow-hidden">
        <div className="hv-thanh flex flex-none items-center gap-3 px-4 py-3 md:gap-3.5 md:px-7 md:py-3.5">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-gradient-to-br from-[#2C7BF2] to-[#0A4FBF]">
            <span aria-hidden="true" className="msr text-[19px] text-white">fact_check</span>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-black text-ink">Điểm danh</h1>
            {/* Không biết lớp thì bỏ hẳn dòng này — xem ui/labels.ts. */}
            {subtitle && <div className="text-[11.5px] text-caption">{subtitle}</div>}
          </div>
          {/* Huy hiệu này trước đây hiện xanh lá "Đã điểm danh" cho BẤT KỲ trạng thái nào có
              mặt trong dữ liệu hôm nay — kể cả 'absent' hay 'queued_late'. Nay chỉ nói "đã
              điểm danh" khi trạng thái thật sự là `present`; còn lại thì nói đúng tên trạng
              thái bằng nhãn của contract, trên nền cùng tông với lưới tuần. (01/08/2026) */}
          <TodayBadge status={query.data?.week.find((d) => d.isToday)?.status ?? null} />
        </div>

        {/* Ba nhánh, không nhánh nào được rơi vào khoảng trắng câm lặng. */}
        {query.isPending && <LoadingState label="Đang tải lịch điểm danh…" />}
        {!query.isPending && query.error && (
          <ErrorState error={query.error} label="Điểm danh" onRetry={() => void query.refetch()} />
        )}

        {query.data && (
          <div className="flex-1 p-4 md:overflow-y-auto md:p-7">
            <div className="flex flex-wrap gap-3 md:gap-4">
              {/* Icon lửa đổi #F58F00 → #FFD98A (token gold-textDark): #F58F00 trên nền
                  #2A2208 chỉ 2,23:1, dưới mốc 3:1 cho thành phần phi văn bản (WCAG 1.4.11).
                  Đây đúng loại lỗi mà đợt 01/08 chỉ vá được một chỗ trong bảy. (05/08/2026) */}
              <StatCard icon="local_fire_department" iconBg="bg-[#2A2208]" iconColor="text-gold-textDark" label="Chuỗi hiện tại" value={String(query.data.streakDays)} sub="ngày liên tiếp" />
              <StatCard icon="military_tech" iconBg="bg-[#F0E9FD]" iconColor="text-[#7434E8]" label="Kỷ lục" value={String(query.data.longestStreakDays)} sub="chuỗi dài nhất" />
              <StatCard icon="event_available" iconBg="bg-[#0C2E22]" iconColor="text-[#4EE39B]" label="Tổng ngày có mặt" value={String(query.data.presentDays)} sub="đã ghi nhận" />
              {/* Phụ đề cũ là "cô đã xác nhận" — nói ngược với chính con số: câu SQL đếm
                  `status in ('late','queued_late')`, mà `queued_late` đúng là những ngày
                  CHƯA ai xác nhận (care.acknowledgeLate đổi chúng thành 'present'). Một
                  con số mà dòng chữ dưới nó nói sai về chính nó thì tệ hơn không có số.
                  Icon cũng đổi sang màu #FFD98A: #E8940D trên nền #3A2E08 chỉ 2,15:1,
                  dưới mốc 3:1 cho thành phần phi văn bản. (01/08/2026) */}
              <StatCard icon="schedule" iconBg="bg-[#3A2E08]" iconColor="text-[#FFD98A]" label="Gửi muộn" value={String(query.data.lateCount)} sub="gồm cả ngày đang chờ cô xác nhận" />
            </div>

            <div className="mt-[18px] hv-card-toi p-4 md:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-black text-cardtitle">Tuần này</h2>
                <span className="text-[11.5px] font-bold text-caption">giờ check-in mỗi ngày</span>
              </div>
              {/* 5 cột giữ nguyên cả ở 390px: ô co lại còn ~62px, vẫn đủ cho vòng tròn
                  42px + giờ "07:32". Xuống 2 hàng sẽ mất hình dạng "một tuần". */}
              <div className="mt-[18px] grid grid-cols-5 gap-1.5 md:gap-3.5">
                {query.data.week.map((day) => (
                  <div
                    key={day.dateIso}
                    className={
                      day.isToday
                        ? "flex flex-col items-center gap-2 rounded-2xl border-[1.7px] border-navy bg-[#F7FAFF] px-1 py-3 shadow-[0_0_0_3px_rgba(30,95,184,.1)] md:px-2.5 md:py-4"
                        : "flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-[#EDF1F7] px-1 py-3 md:px-2.5 md:py-4"
                    }
                  >
                    {/* "hôm nay" xuống dòng riêng ở điện thoại (ô chỉ ~60px) nhưng KHÔNG
                        được bỏ đi: bỏ rồi thì ngày hôm nay chỉ còn được đánh dấu bằng
                        màu viền — màu là tín hiệu duy nhất, DESIGN-GUIDELINES §11 cấm. */}
                    <span
                      className={`text-center text-[12px] font-black leading-tight ${day.isToday ? "text-cardtitle" : "text-[#93A9C8]"}`}
                    >
                      {day.dayLabel}
                      {day.isToday && (
                        <span className="block md:inline">
                          <span className="hidden md:inline"> · </span>hôm nay
                        </span>
                      )}
                    </span>
                    {day.status ? (
                      <DayMark status={day.status} />
                    ) : (
                      // Vòng tròn rỗng của ngày CHƯA CÓ DÒNG NÀO trong sổ. Viền đỏ cũ nói
                      // "vắng" bằng màu — xem ghi chú của `dayCaptionText`. Nay viền xám và
                      // có nhãn cho tai, vì thứ duy nhất máy biết là "chưa ai ghi gì".
                      <span
                        className={`flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-dashed ${day.isFuture ? "border-[#27467E]" : "border-[#B9C4D4]"}`}
                      >
                        <span className="sr-only">
                          {day.isFuture ? "chưa tới ngày này" : "chưa có ai điểm danh ngày này"}
                        </span>
                      </span>
                    )}
                    <span className={`text-center text-[11.5px] font-bold leading-tight ${day.isToday ? "text-cardtitle" : "text-[#A9C4E8]"}`}>
                      {dayCaptionText(day)}
                    </span>
                    {/* Dòng chữ ngắn cho ĐÚNG những ngày không phải "có mặt". Ngày có mặt
                        không cần chữ (giờ check-in đã nói đủ), còn ngày gửi muộn thì giờ
                        check-in KHÔNG nói đủ — nó trông y hệt một ngày có mặt. */}
                    <DayNote status={day.status} />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-[18px] flex flex-wrap items-start gap-[18px]">
              <div className="min-w-0 flex-[2_1_320px] hv-card-toi p-4 md:flex-[2_1_520px] md:p-6">
                <h2 className="text-[16px] font-black text-cardtitle">Lịch sử gần đây</h2>
                <div className="mt-3.5 flex flex-col">
                  {query.data.history.map((h, i) => (
                    <div
                      key={h.occurred_on}
                      className={`flex items-center gap-3.5 py-3.5 ${i < query.data!.history.length - 1 ? "border-b border-[#12244A]" : ""}`}
                    >
                      {/* Chấm màu KHÔNG còn là tín hiệu duy nhất và cũng không còn nói sai:
                          trước đây mọi trạng thái không phải 'present' đều bị gọi chung là
                          "gửi muộn" (kể cả 'absent'/'excused' do cô ghi tay), và icon
                          `verified` xanh lá đứng cuối dòng cho MỌI trạng thái — tức một
                          ngày vắng vẫn được đóng dấu "đã xác nhận" màu xanh. Nay chữ lấy
                          từ ATTENDANCE_STATUS_LABEL của contract, chấm và icon đi theo
                          cùng một bảng với lưới tuần phía trên. (01/08/2026) */}
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 flex-none rounded-full"
                        style={{ background: dayMarkStyle(h.status)?.iconColor ?? "#93A9C8" }}
                      />
                      <div className="flex-1">
                        <div className="text-[13.5px] font-extrabold text-ink">
                          {new Date(h.occurred_on).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })}
                          {" · "}
                          {(ATTENDANCE_STATUS_LABEL as Record<string, string | undefined>)[h.status] ??
                            "trạng thái chưa đọc được"}
                        </div>
                        <div className="mt-px text-[11.5px] text-caption">check-in {h.checked_in_at}</div>
                      </div>
                      <span
                        aria-hidden="true"
                        className="msr text-[19px]"
                        style={{ color: dayMarkStyle(h.status)?.iconColor ?? "#93A9C8" }}
                      >
                        {dayMarkStyle(h.status)?.icon ?? "question_mark"}
                      </span>
                    </div>
                  ))}
                  {query.data.history.length === 0 && (
                    <p className="py-4 text-center text-[12.5px] text-caption">Chưa có lịch sử điểm danh nào.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </MainContent>
      {/* Đường ra ở điện thoại. page.tsx đá mọi vai không phải học sinh về /home nên
          ở đây roles luôn có "student" — vẫn hỏi cho đúng luật DESIGN-GUIDELINES §6
          (chỉ học sinh mới có tab bar Hub), không dựa vào một điều kiện ngầm. */}
      {roles.includes("student") && (
        <div className="md:hidden">
          <StudentTabBar fullName={displayName} email={email} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ô một ngày trong lưới tuần.
//
// Sửa 01/08/2026 (gói "tuong-phan-man-hoc-sinh") — HAI TRẠNG THÁI KHÁC NGHĨA VẼ GIỐNG
// HỆT NHAU, và dấu tick gần như vô hình. Hai lỗi nằm chung một khối mã cũ:
//
//  1. `text-[#4EE39B]` cho dấu tick nằm NGOÀI toán tử ba ngôi, nên cùng một màu icon dùng
//     cho cả hai nhánh nền. Trên nền ngày có mặt (gradient #00D97A→#00A85E) nó chỉ đạt
//     1,81:1 ở đầu sáng và 1,09:1 ở đầu đậm — chuẩn phi văn bản (WCAG 1.4.11) là 3:1.
//     Nói cách khác: dấu tick, thứ duy nhất bên trong vòng tròn, gần như biến mất.
//  2. Ngày `late`/`queued_late` chỉ khác ngày `present` ở MÀU NỀN vòng tròn. Cùng icon
//     `check`, cùng dòng giờ bên dưới, không chữ, không sr-only. Contract có đủ năm trạng
//     thái (packages/core/contracts/care.ts) nhưng giao diện chỉ vẽ hai — và vẽ "gửi muộn"
//     thành xanh lá tức là để em đọc nó thành "có mặt". DESIGN-GUIDELINES §8 ghi thẳng:
//     "gửi muộn ≠ vắng (vàng, "chờ xác nhận")". Đối chiếu nội bộ càng rõ: khối "Lịch sử
//     gần đây" ngay dưới cùng trang thì CÓ chữ "có mặt"/"gửi muộn" — hai khối trên một
//     trang đang nói khác nhau về cùng một dữ liệu.
//
// Màu tick ngày có mặt nay là #003D24: 6,62:1 trên #00D97A và 3,99:1 trên #00A85E — vượt
// 3:1 ở CẢ HAI đầu gradient. Chữ trắng (cách this-week-view vẽ vòng tròn tâm trạng) chỉ
// được 1,87:1 ở đầu sáng nên KHÔNG dùng lại ở đây; bảng màu không đổi một mã nào.
// ---------------------------------------------------------------------------

interface DayMarkStyle {
  icon: string;
  background: string;
  boxShadow?: string;
  iconColor: string;
  /** Chữ ngắn hiện dưới giờ check-in. `null` = không cần (giờ đã nói đủ). */
  note: string | null;
}

const DAY_MARK: Record<AttendanceStatus, DayMarkStyle> = {
  present: {
    icon: "check",
    background: "linear-gradient(160deg,#00D97A,#00A85E)",
    boxShadow: "0 5px 12px rgba(0,168,94,.28)",
    iconColor: "#003D24",
    note: null,
  },
  // Cô đã ghi tay là đi muộn — đã xong việc, không còn chờ ai.
  late: { icon: "schedule", background: "#3A2E08", iconColor: "#FFD98A", note: "đi muộn" },
  // Máy nhận lúc sau 8:00 và ĐANG chờ cô xác nhận (care.acknowledgeLate đổi nó thành
  // 'present'). Đây chính là trạng thái trước đây bị vẽ thành xanh lá.
  queued_late: { icon: "hourglass_top", background: "#3A2E08", iconColor: "#FFD98A", note: "chờ xác nhận" },
  absent: { icon: "close", background: "#FFECEC", iconColor: "#A32127", note: "vắng" },
  excused: { icon: "event_busy", background: "#081730", iconColor: "#A9C4E8", note: "có phép" },
};

/** Trạng thái lạ (schema đi trước giao diện) KHÔNG được vẽ thành dấu tick xanh. */
function dayMarkStyle(status: string): DayMarkStyle | null {
  return (DAY_MARK as Record<string, DayMarkStyle | undefined>)[status] ?? null;
}

/**
 * Chữ ngắn dưới giờ check-in. Rỗng cho ngày có mặt (giờ đã nói đủ) và cho ngày chưa có dữ
 * liệu; có chữ cho mọi trạng thái còn lại — kể cả trạng thái lạ, vì "chưa rõ" vẫn là một
 * câu thật, còn vẽ nó thành dấu tick xanh thì không.
 * Màu lấy đúng màu icon của trạng thái nên hai tín hiệu không bao giờ nói khác nhau; mọi
 * cặp đều đo trên nền ô (trắng, và #F7FAFF của ngày hôm nay): #FFD98A = 5,93:1 · #A32127
 * = 7,49:1 · #A9C4E8 = 8,14:1 · #93A9C8 = 5,44:1.
 */
export function dayNoteText(status: string | null): string | null {
  if (!status) return null;
  const style = dayMarkStyle(status);
  // KHÔNG viết `style?.note ?? "chưa rõ"` ở đây. Đó là lỗi thật đã nằm trong bản đầu của
  // gói này (sửa 01/08/2026): `??` nhận cả `null`, mà `present` CỐ Ý mang note = null để
  // không có chữ. Viết bằng `??` thì hai thứ khác hẳn nghĩa bị trộn làm một — "trạng thái
  // đã biết, cố ý im" và "trạng thái lạ, không đọc được" — nên MỌI ngày có mặt in ra chữ
  // "chưa rõ" ngay dưới giờ check-in. Dữ liệu demo của Minh là 5/5 ngày `present`, tức lỗi
  // phủ trọn lưới tuần của màn chính, và nó lọt được đúng vì hydrate đang hỏng nên không
  // ai soi được lưới này bằng mắt. Câu hỏi đúng là "trạng thái này CÓ trong bảng không",
  // và nó phải hỏi trên `style`, không phải trên `style.note`.
  return style ? style.note : "chưa rõ";
}

/**
 * Dòng chữ NGAY DƯỚI vòng tròn của một ngày: giờ check-in nếu có, còn không thì nói đúng
 * cái đang thiếu.
 *
 * Sửa 01/08/2026 (QĐ-3 phía học sinh) — "VẮNG" IN CHO NGÀY KHÔNG AI GHI GÌ:
 *
 * Câu cũ là `day.checkedInAt ?? (day.isFuture ? "—" : "vắng")`. Nó gộp hai chuyện khác hẳn
 * nhau vào một chữ: (a) cô đã ghi `absent` — em nghỉ thật, và (b) hôm đó KHÔNG có dòng nào
 * trong sổ, tức em không tự check-in và cô cũng chưa điểm danh lớp. Trường hợp (b) rất
 * thường: cô mở màn điểm danh lúc 8 giờ 15, còn em mở app lúc 7 giờ tối. Máy khi đó không
 * biết gì cả — mà màn hình lại kết luận "vắng", rồi vẽ thêm viền ĐỎ cho chắc.
 *
 * Đây đúng là luật "im lặng không phải kết luận" đọc ngược: thiếu dữ liệu bị in thành một
 * tin xấu về chính em, trên màn em mở ra để tự kiểm tra. QĐ-3 (01/08/2026) đòi bảng của cô
 * phân biệt đủ năm trạng thái, trong đó có "chưa điểm danh"; màn của em phải phân biệt
 * đúng chừng ấy, bằng chữ của em.
 *
 * Bốn nhánh, không nhánh nào đoán:
 *  · có giờ check-in       → in giờ (đủ nghĩa, không cần chữ).
 *  · ngày chưa tới         → "chưa tới".
 *  · có dòng, không có giờ → "—", vì `DayNote` ngay dưới đã gọi tên trạng thái (vắng / có
 *                            phép / đi muộn). Lặp lại ở đây là hai dòng nói một điều.
 *  · KHÔNG có dòng nào     → "chưa điểm danh". KHÔNG phải "vắng".
 *
 * Thuần hàm để test được (tests/unit/checkin-view.test.ts).
 */
export function dayCaptionText(day: {
  status: string | null;
  checkedInAt: string | null;
  isFuture: boolean;
}): string {
  if (day.checkedInAt) return day.checkedInAt;
  if (day.isFuture) return "chưa tới";
  if (day.status) return "—";
  return "chưa điểm danh";
}

/** Export để /tuan-nay dùng lại — hai lưới tuần phải nói cùng một câu về cùng một ngày. */
export function DayNote({ status }: { status: string | null }) {
  const note = dayNoteText(status);
  if (!note) return null;
  const style = status ? dayMarkStyle(status) : null;
  return (
    <span
      className="text-center text-[10px] font-bold leading-tight"
      style={{ color: style?.iconColor ?? "#93A9C8" }}
    >
      {note}
    </span>
  );
}

/**
 * Huy hiệu "hôm nay" ở thanh tiêu đề. Không có dữ liệu hôm nay thì KHÔNG vẽ gì — im lặng
 * ở đây là đúng: thanh tiêu đề không phải chỗ kết luận "em chưa check-in", lưới tuần ngay
 * dưới đã nói việc đó bằng vòng tròn nét đứt.
 */
function TodayBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const style = dayMarkStyle(status);
  const label =
    (ATTENDANCE_STATUS_LABEL as Record<string, string | undefined>)[status] ?? "trạng thái chưa đọc được";
  const present = status === "present";
  return (
    <span
      className="flex flex-none items-center gap-1.5 rounded-full px-[13px] py-[7px]"
      style={{ background: present ? "#0C2E22" : (style?.background ?? "#081730") }}
    >
      <span aria-hidden="true" className="msr text-[15px]" style={{ color: present ? "#4EE39B" : (style?.iconColor ?? "#A9C4E8") }}>
        {present ? "check_circle" : (style?.icon ?? "question_mark")}
      </span>
      <span className="text-[11.5px] font-extrabold" style={{ color: present ? "#4EE39B" : (style?.iconColor ?? "#A9C4E8") }}>
        {present ? (
          <>
            <span className="md:hidden">Đã điểm danh</span>
            <span className="hidden md:inline">Hôm nay đã điểm danh</span>
          </>
        ) : (
          <>
            <span className="md:hidden">{label}</span>
            <span className="hidden md:inline">Hôm nay: {label}</span>
          </>
        )}
      </span>
    </span>
  );
}

function DayMark({ status }: { status: string }) {
  const style = dayMarkStyle(status);
  // Nhãn đầy đủ cho tai lấy từ contract, không viết tay: nơi khác đổi chữ thì chỗ này đổi
  // theo. Trạng thái ngoài contract nói thẳng là chưa đọc được, không đoán.
  const label =
    (ATTENDANCE_STATUS_LABEL as Record<string, string | undefined>)[status] ?? "trạng thái chưa đọc được";

  if (!style) {
    return (
      <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-dashed border-[#27467E]">
        <span aria-hidden="true" className="msr text-[20px] text-[#93A9C8]">question_mark</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span
      className="flex h-[42px] w-[42px] items-center justify-center rounded-full"
      style={{ background: style.background, boxShadow: style.boxShadow }}
    >
      <span aria-hidden="true" className="msr text-[22px]" style={{ color: style.iconColor }}>
        {style.icon}
      </span>
      {/* Không đổi một pixel nào trên màn, mà vòng tròn thành có nghĩa cho người đọc bằng
          tai — cùng cách this-week-view.tsx:147 đã làm đúng cho vòng tròn tâm trạng. */}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function StatCard({ icon, iconBg, iconColor, label, value, sub }: { icon: string; iconBg: string; iconColor: string; label: string; value: string; sub: string }) {
  return (
    // basis nhỏ hơn ở điện thoại để 4 thẻ xếp 2×2 thay vì 4 hàng cao (390px chỉ chứa
    // được một thẻ basis-200 mỗi hàng — phải cuộn hết màn hình mới thấy lịch tuần).
    <div className="flex-1 basis-[140px] hv-card-toi p-4 md:basis-[200px] md:p-[22px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-extrabold text-[#93A9C8]">{label}</span>
        <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${iconBg}`}>
          <span aria-hidden="true" className={`msr text-[19px] ${iconColor}`}>{icon}</span>
        </span>
      </div>
      <div className="mt-2 text-[28px] font-black text-cardtitle md:text-[34px]">{value}</div>
      <div className="mt-2.5 text-[11px] font-semibold text-caption">{sub}</div>
    </div>
  );
}

function RuleRow({ n, bg, color, children }: { n: number; bg: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2.5">
      <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-black ${bg} ${color}`}>{n}</span>
      <span className="text-[12.5px] leading-relaxed text-[#35E0FF]">{children}</span>
    </div>
  );
}
