// apps/hub/components/gvcn/student-detail-view.tsx — màn "một em, mọi tín hiệu về em".
//
// Màn thứ NĂM của buồng lái GVCN (gói "man-hinh-con-thieu-gvcn-hs", 31/07/2026). Bốn màn
// trước đều là màn CỦA CẢ LỚP: bảng "Lớp chủ nhiệm" và buồng lái chỉ ra một cái tên
// ("Cần gặp thầy cô", "Hồ sơ đang mở") rồi dừng lại ở đó. Câu hỏi kế tiếp — "em này mấy
// hôm nay thế nào?" — trước hôm nay không có màn nào trả lời, nên cô phải mở bốn màn lớp
// rồi tự lọc mắt theo một cái tên. Phần lớn sẽ không làm, và dấu hiệu hiện ra rồi trôi qua.
//
// BỐN KHỐI, đúng bốn nguồn có thật trong CSDL — không khối nào vẽ ra để cho đầy màn:
//   1. Dải điểm danh 14/30 ngày (lịch theo thứ, không phải dãy ô trôi ngang). Từ
//      01/08/2026 lịch này tô theo TRẠNG THÁI ĐIỂM DANH, không còn theo tâm trạng —
//      [QĐ-1] cắt quyền đọc cảm xúc của GVCN, và [QĐ-3] đòi năm trạng thái đọc được.
//   2. Tín hiệu "cần gặp thầy cô" + hồ sơ chăm sóc mở/đóng
//   3. Nhật ký can thiệp CỦA RIÊNG EM
//   4. Trạng thái duyệt Báo cáo Trưởng thành mấy tuần gần đây
//
// HAI LUẬT ĐI XUYÊN CẢ MÀN:
//
//   · IM LẶNG KHÔNG PHẢI KẾT LUẬN. Ngày không có dòng check-in hiện là "chưa có dữ liệu",
//     KHÔNG phải "vắng" — và cũng không phải "ổn". Cuối tuần được đánh dấu riêng để không
//     bị đọc nhầm thành 2 ngày mất tín hiệu mỗi tuần. Khối rỗng nói thẳng là chưa có gì,
//     kèm đúng khoảng thời gian đã hỏi.
//   · GIỌNG VẬN HÀNH CHỈ Ở ĐÂY. Đây là màn của người lớn trong buồng lái, nên "cờ / hồ sơ
//     chăm sóc / can thiệp" được phép xuất hiện (DESIGN-GUIDELINES §8). Không một chữ nào
//     của màn này đi ra màn học sinh/phụ huynh.
//
// Lời em viết trong "cần gặp thầy cô" hiện ở khối 2. Lý do đầy đủ nằm trong contract
// (`StudentHelpRequest`): màn /can-gap-thay-co in lên mặt em lời hứa "cô đọc được", mà
// trước hôm nay không màn nào đọc nó — kể cả của cô. Lời hứa in trên màn hình là ràng
// buộc kỹ thuật, không phải lời quảng cáo.
"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  ATTENDANCE_STATUS_ICON,
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_UNKNOWN_ICON,
  ATTENDANCE_UNKNOWN_LABEL,
  HELP_REQUEST_TOPIC_LABEL,
  HELP_REQUEST_URGENCY_LABEL,
  MOOD_LABEL,
  type AttendanceStatus,
  type MoodValue,
  type StudentCheckinDay,
} from "@hub/core/contracts";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { Card, GvcnShell } from "./gvcn-shell";

/**
 * Năm trạng thái điểm danh trong ô lịch ([QĐ-3], 01/08/2026).
 *
 * Trước hôm nay bảng này khoá theo TÂM TRẠNG (`MOOD_CELL`), và đó là gốc của một lỗi
 * đọc-ngược đã đo được: `tone` chỉ đến từ mood, còn `statusIcon` chỉ có giá trị cho
 * 'absent' và 'late' — nên ô ngày mang `status='present'` do CÔ ghi hộ (mà dòng cô ghi
 * hộ luôn có mood = null, vì markAttendance cố ý không đặt hộ tâm trạng cho em) rơi
 * đúng vào nhánh "border-dashed bg-white", TRÙNG KHÍT với ô không có dữ liệu — và chú
 * giải ngay dưới lưới gọi hình dạng đó là "Chưa có dữ liệu". Cô ghi em có mặt, lịch vẽ
 * là chưa ai ghi gì.
 *
 * Nay ô lịch nói về ĐIỂM DANH, đúng thứ nó có dữ liệu để nói sau ADR-026. Màu lấy nguyên
 * các cặp nhạt/đậm mà `status-badge.tsx` đã dùng (không chế màu mới), icon lấy từ
 * `ATTENDANCE_STATUS_ICON` trong contract nên hai màn không thể trôi lệch nhau nữa —
 * chính là chỗ 'late' và 'queued_late' từng dùng CHUNG icon `schedule` ở màn này trong
 * khi huy hiệu bên kia đã tách đúng.
 *
 * `late` và `queued_late` dùng chung cặp màu, nên khác nhau bằng ICON + CHỮ (§11).
 * Tương phản chữ/nền, đo theo công thức WCAG trên chính các cặp dưới đây:
 *     present     #00693F / #E3F8ED = 6,12:1
 *     late        #6B4A00 / #FFF1C9 = 7,17:1
 *     queued_late #6B4A00 / #FFF1C9 = 7,17:1
 *     absent      #C0272D / #FFF0F0 = 5,32:1
 *     excused     #1D4E8F / #E2F0FC = 7,13:1
 */
export const STATUS_CELL: Record<AttendanceStatus, { bg: string; fg: string; icon: string }> = {
  present: { bg: "#E3F8ED", fg: "#00693F", icon: ATTENDANCE_STATUS_ICON.present },
  late: { bg: "#FFF1C9", fg: "#6B4A00", icon: ATTENDANCE_STATUS_ICON.late },
  queued_late: { bg: "#FFF1C9", fg: "#6B4A00", icon: ATTENDANCE_STATUS_ICON.queued_late },
  absent: { bg: "#FFF0F0", fg: "#C0272D", icon: ATTENDANCE_STATUS_ICON.absent },
  excused: { bg: "#E2F0FC", fg: "#1D4E8F", icon: ATTENDANCE_STATUS_ICON.excused },
};

/** Thứ tự trong chú giải — đi từ "bình thường nhất" tới "cần chú ý nhất". */
const LEGEND_ORDER: AttendanceStatus[] = ["present", "late", "queued_late", "absent", "excused"];

const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/**
 * "2026-07-31" → Date lúc 00:00 GIỜ MÁY NGƯỜI DÙNG.
 *
 * KHÔNG dùng `new Date("2026-07-31")`: chuỗi chỉ có ngày được ECMAScript quy định là giờ
 * UTC, nên ở mọi múi giờ ÂM (máy của một phụ huynh đang ở Mỹ, máy dev đặt sai múi) ngày
 * hiển thị lùi lại một hôm — và một dải check-in lệch một ngày là loại sai trông như thật.
 */
export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function toIso(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Thứ Hai = 0 … Chủ nhật = 6. Lịch Việt Nam bắt đầu từ thứ Hai, không phải Chủ nhật. */
export function weekdayIndex(iso: string): number {
  return (isoToLocalDate(iso).getDay() + 6) % 7;
}

/** Mọi ngày trong khoảng [from, to] — kể cả ngày KHÔNG có dòng check-in nào. */
export function daysBetween(fromIso: string, toIso_: string): string[] {
  const out: string[] = [];
  const cursor = isoToLocalDate(fromIso);
  const end = isoToLocalDate(toIso_);
  // Trần 40 vòng: contract chặn `days` ≤ 30, nhưng một `fromDate` hỏng không được phép
  // biến thành vòng lặp vô hạn ngay trong trình duyệt của giáo viên.
  for (let i = 0; i <= 40 && cursor <= end; i += 1) {
    out.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function dayNumber(iso: string): string {
  return String(isoToLocalDate(iso).getDate());
}

/**
 * "2026-07-18" → "18/07".
 *
 * KHÔNG dùng `toLocaleDateString("vi-VN", { day, month })`: với đúng hai trường đó, ICU
 * trả về "18-07" (gạch nối) chứ không phải "18/07" — bắt được trên chính màn này lúc mở
 * bằng trình duyệt thật. Định dạng ngày của một hệ dữ liệu học sinh không nên phụ thuộc
 * vào bản ICU đang có trên máy người dùng.
 */
export function formatDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return day && month ? `${day}/${month}` : iso;
}

/**
 * `timestamptz::text` của Postgres ("2026-07-29 00:07:17.466773+07") → "29/07 00:07".
 *
 * CỐ Ý không đi qua `new Date()`. Chuỗi đó mang offset dạng "+07" — thiếu phút, nên
 * KHÔNG hợp lệ theo ECMAScript. V8 có bộ phân tích rộng rãi nên vẫn đọc được (và vì thế
 * lỗi này không lộ ra khi thử bằng Chrome trên máy dev), còn Safari trả `Invalid Date`.
 * Mà GVCN cầm iPhone là bối cảnh dùng THẬT của màn này: cả cột thời gian sẽ hiện "Invalid
 * Date" đúng trên thiết bị dùng nhiều nhất. Đọc bằng regex thì không có nhánh nào để sai.
 *
 * Giờ hiển thị là giờ MÁY CHỦ (Postgres đã quy về múi giờ phiên) — cùng gốc với mọi giờ
 * khác trên các màn GVCN, không dịch lại theo máy người xem.
 */
export function formatDateTime(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return raw;
  return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}

const WINDOW_CHOICES = [14, 30] as const;

export function StudentDetailView({
  studentId,
  displayName,
  email,
}: {
  studentId: string;
  displayName: string;
  email: string;
}) {
  const [days, setDays] = useState<number>(14);
  const detail = trpc.care.getStudentDetail.useQuery({ studentId, days });

  const d = detail.data;
  const title = d?.student.fullName ?? "Hồ sơ học sinh";

  return (
    <GvcnShell
      active="klass"
      title={title}
      subtitle={
        d ? `${classLabel(d.className)} · mã ${d.student.studentCode}` : undefined
      }
      displayName={displayName}
      email={email}
      classCode={d?.className}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/gvcn/lop"
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-cardtitle2 hover:bg-[#F5F8FC]"
          >
            <span className="msr text-[17px]" aria-hidden>
              arrow_back
            </span>
            Danh sách lớp
          </Link>
          <div role="group" aria-label="Khoảng thời gian" className="flex items-center gap-1.5">
            {WINDOW_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={days === choice}
                onClick={() => setDays(choice)}
                className={
                  days === choice
                    ? "min-h-[44px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 py-2.5 text-[12.5px] font-black text-white shadow-[0_6px_14px_rgba(10,42,94,.24)]"
                    : "min-h-[44px] rounded-xl border border-line bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-cardtitle2 hover:bg-[#F5F8FC]"
                }
              >
                {choice} ngày
              </button>
            ))}
          </div>
        </div>
      }
    >
      {detail.isPending ? (
        <LoadingState label="Đang mở hồ sơ của em…" />
      ) : detail.error ? (
        <ErrorState error={detail.error} label="hồ sơ học sinh" onRetry={() => void detail.refetch()} />
      ) : !d ? (
        <EmptyState
          icon="person_off"
          title="Chưa mở được hồ sơ của em này"
          // §8: người đọc màn này là GVCN, không phải học sinh. Câu cũ — "báo quản trị
          // hệ thống giúp em nhé" — xưng hô với cô như với một đứa trẻ, và tệ hơn: chữ
          // "em" ở đây trùng với chữ "em" chỉ HỌC SINH dùng khắp cùng màn ("Em chưa bấm
          // "cần gặp thầy cô" lần nào", "ghi cho riêng em"), nên câu đó đọc thành "báo
          // quản trị giúp học sinh". Người lớn: gọn, nghiệp vụ.
          hint="Tải lại trang. Vẫn lỗi thì báo quản trị hệ thống."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <CheckinStrip window={d.window} checkins={d.checkins} />
          <SignalCard
            days={d.window.days}
            helpRequests={d.helpRequests}
            careCases={d.careCases}
          />
          <InterventionCard rows={d.interventions} />
          <ApprovalCard rows={d.reportApprovals} />
        </div>
      )}
    </GvcnShell>
  );
}

// ---------------------------------------------------------------------------
// 1. Dải check-in — lịch theo thứ, mỗi ô là MỘT ngày thật.
// ---------------------------------------------------------------------------
function CheckinStrip({
  window: win,
  checkins,
}: {
  window: { days: number; fromDate: string; toDate: string };
  checkins: StudentCheckinDay[];
}) {
  // Ngày cô vừa chạm vào. Xem `DayCell` bên dưới để biết vì sao một ô lịch phải bấm được.
  const [dayDaChon, setDayDaChon] = useState<string | null>(null);
  const byDate = new Map(checkins.map((c) => [c.occurredOn, c]));
  const allDays = daysBetween(win.fromDate, win.toDate);
  const leadingBlanks = allDays.length > 0 ? weekdayIndex(allDays[0]!) : 0;
  const recorded = allDays.filter((iso) => byDate.has(iso)).length;
  const schoolDays = allDays.filter((iso) => weekdayIndex(iso) < 5).length;
  const missingSchoolDays = allDays.filter((iso) => weekdayIndex(iso) < 5 && !byDate.has(iso)).length;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-black text-navy">Check-in {win.days} ngày gần đây</h2>
        <span className="text-[11.5px] font-semibold text-muted">
          {recorded}/{schoolDays} ngày học có dữ liệu
        </span>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} className="text-center text-[10px] font-black uppercase tracking-wide text-muted">
            {w}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}
        {allDays.map((iso) => (
          <DayCell
            key={iso}
            iso={iso}
            entry={byDate.get(iso) ?? null}
            daChon={dayDaChon === iso}
            onChon={() => setDayDaChon((cu) => (cu === iso ? null : iso))}
          />
        ))}
      </div>

      {/* DÒNG CHI TIẾT — chỗ hạ cánh của cú bấm vào một ô ngày.
          Vùng aria-live có mặt SẴN kể cả khi chưa chọn ngày nào: một vùng vừa được tạo
          ra thì trình đọc màn hình thường không đọc nội dung đầu tiên của nó. `min-h`
          giữ chỗ để lưới 7 cột không nhảy lên xuống mỗi lần cô chạm vào một ngày. */}
      <p
        aria-live="polite"
        className="mt-2 min-h-[18px] text-[11.5px] font-semibold leading-relaxed text-cardtitle2"
      >
        {dayDaChon ? dayCellLabel(dayDaChon, byDate.get(dayDaChon) ?? null) : ""}
      </p>

      {/* Chú giải: màu KHÔNG bao giờ là tín hiệu duy nhất (§11).
          Đổi 01/08/2026 — chấm tròn thành CHÍNH icon mà ô ngày đang dùng. Chú giải bằng
          chấm màu chỉ giải thích được cho người đọc ra màu; với người mù màu nó vẽ lại
          đúng bài toán vừa đặt ra. Nay ô ngày và chú giải nói cùng một ngôn ngữ. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-[#F1F4F8] pt-3">
        {LEGEND_ORDER.map((st) => (
          <span key={st} className="flex items-center gap-1 text-[11px] font-bold text-subtle">
            <span
              aria-hidden
              className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md"
              style={{ background: STATUS_CELL[st].bg, color: STATUS_CELL[st].fg }}
            >
              <span className="msr text-[13px]">{STATUS_CELL[st].icon}</span>
            </span>
            {ATTENDANCE_STATUS_LABEL[st]}
          </span>
        ))}
        {/* Ô thứ SÁU, và là ô quan trọng nhất của cả chú giải: "chưa ai ghi" phải có
            hình dạng riêng, khác hẳn "vắng". Một đằng là chưa biết, một đằng là đã biết
            và biết là em không có mặt. */}
        <span className="flex items-center gap-1 text-[11px] font-bold text-subtle">
          <span
            aria-hidden
            className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md border border-dashed border-line2 bg-white text-subtle"
          >
            <span className="msr text-[13px]">{ATTENDANCE_UNKNOWN_ICON}</span>
          </span>
          {ATTENDANCE_UNKNOWN_LABEL}
        </span>
        {/* Ô thứ BẢY: cuối tuần. Phải có mặt trong chú giải vì nó là hình dạng DUY NHẤT
            trong lưới không mang icon nào — và một ô trống không tự giải thích được là
            "không phải ngày học" hay "màn hình lỗi". Ô mẫu để rỗng đúng như trong lưới,
            không vẽ một icon riêng: vẽ icon cho cuối tuần là quay lại đúng chuyện vừa
            sửa — bịa một tín hiệu cho một ngày không có tín hiệu nào. */}
        <span className="flex items-center gap-1 text-[11px] font-bold text-subtle">
          <span aria-hidden className="h-[18px] w-[18px] flex-none rounded-md bg-[#F7F9FC]" />
          Cuối tuần
        </span>
      </div>

      {/* HAI CHIP THAY HAI CÂU (06/08/2026).
          [QĐ-3] "chưa điểm danh ≠ vắng" là luật, nên NGHĨA ở lại; nhưng nó không cần một
          câu 96 ký tự — chú giải ngay trên đã cho "Chưa điểm danh" và "Vắng" hai icon,
          hai màu nền, hai cái tên khác nhau. Chip chỉ còn nói phần chú giải không nói
          được: hôm nay có bao nhiêu ngày như thế.
          Chip thứ hai LẬT 21/08/2026 (ADR-035 · §9): cô đọc lại được cảm xúc, nên câu
          cũ "cảm xúc chỉ thầy cô tâm lý đọc được" thành nói dối nếu để nguyên. Câu mới
          in ra ràng buộc CÒN LẠI — §5, cấm dùng cảm xúc xếp loại — đặt đúng chỗ cô vừa
          đọc được cảm xúc, tức đúng lúc lời nhắc có việc để làm. Vẫn icon `lock`, và chữ
          "điểm danh" vẫn đứng ngay trước: `a11y-man-nguoi-lon.test.ts` đo rằng câu này
          nằm đúng chỗ lịch điểm danh, chứ không trôi sang một khối khác. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-1 text-[10.5px] font-black text-subtle">
          <span className="msr text-[14px]" aria-hidden>
            {missingSchoolDays === 0 ? "task_alt" : ATTENDANCE_UNKNOWN_ICON}
          </span>
          {missingSchoolDays === 0
            ? "Đủ dữ liệu mọi ngày học"
            : `${missingSchoolDays} ngày chưa ai ghi ≠ vắng`}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-1 text-[10.5px] font-black text-subtle">
          <span className="msr text-[14px]" aria-hidden>
            lock
          </span>
          Lịch điểm danh · cảm xúc em ghi không dùng để xếp loại
        </span>
      </div>
      {/* GỠ `ARRIVAL_BAND_UNAVAILABLE_NOTE` khỏi màn này (06/08/2026). Hai câu 187 ký tự
          đó nói về CỘT GIỜ của bảng danh sách lớp, và chúng vẫn đứng ở đó — nay gấp trong
          `<details>` (xem `GhiChuGioBam` ở class-roster-view.tsx). Lịch này không có cột
          giờ nào để mà thiếu nhãn "đi sớm", nên bản thứ hai ở đây chỉ là chữ thừa. */}
    </Card>
  );
}

export function dayCellLabel(iso: string, entry: StudentCheckinDay | null): string {
  // BA loại ô, không phải hai (sửa 02/08/2026, gói "audit-giao-dien-chay-tron").
  //
  // Bản trước trả về ĐÚNG MỘT câu — "18/07 · chưa có dữ liệu" — cho cả ngày học chưa ai
  // ghi LẪN thứ Bảy/Chủ nhật. Chú thích đầu file lại hứa ngược: "Cuối tuần được đánh dấu
  // riêng để không bị đọc nhầm thành 2 ngày mất tín hiệu mỗi tuần". Lời hứa đó chỉ tồn
  // tại cho MẮT, và tồn tại rất mờ: đo theo công thức WCAG, khác biệt duy nhất giữa hai
  // loại ô là nền #F7F9FC so với #FFFFFF = 1,04:1, cộng một viền nét đứt #D8DFE9 = 1,34:1.
  // Cho tai thì không có gì cả — `title=` và `sr-only` đọc ra hai câu giống hệt nhau.
  // Nên trong 14 ngày, một cô dùng trình đọc màn hình nghe 4 lần "chưa có dữ liệu" mà 4
  // lần đó KHÔNG phải tín hiệu thiếu; còn màn hình thì in một icon "Chưa điểm danh" lên
  // một ngày không hề có gì để điểm danh — nói sai, không phải nói thiếu.
  const weekend = weekdayIndex(iso) >= 5;
  if (!entry && weekend) return `${formatDate(iso)} · cuối tuần, không phải ngày học`;
  return [
    formatDate(iso),
    entry?.status ? statusWord(entry.status) : "chưa có dữ liệu",
    // TRỞ LẠI 21/08/2026 (ADR-035, migration 0059): cảm xúc em ghi đọc ra ở đây —
    // đúng chỗ cô bấm vào MỘT ngày, tức đọc theo từng ngày như nhật ký, không phải một
    // cột màu tô sẵn cả lưới (bài học MOOD_CELL cũ ở đầu file vẫn đứng: lịch khoá theo
    // ĐIỂM DANH, cảm xúc là chi tiết của ngày được chọn). Không có mood thì im — dòng
    // cô ghi hộ và ngày em không ghi đều không có, và "không ghi" không phải tín hiệu.
    entry?.mood != null ? `em ghi cảm xúc: ${MOOD_LABEL[entry.mood as MoodValue]}` : null,
    // Giờ CHỈ đọc ra khi em tự bấm. Nhãn cũ ghép "lúc HH:MM" cho mọi dòng, nên ô ngày
    // cô đánh vắng đọc thành "… vắng · lúc 03:28 · thầy cô ghi hộ" — vừa nói em vắng
    // vừa nói em có giờ check-in, mà con số đó là giờ cô bấm Lưu.
    entry?.source === "app" && entry.checkedInAt ? `em bấm lúc ${entry.checkedInAt}` : null,
    entry?.source === "teacher" ? "thầy cô ghi hộ" : null,
    entry?.source === "offline_queue" ? "gửi bù khi có mạng lại" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Một ô = một ngày. Là <button>, không phải <span> (05/08/2026).
 *
 * Ô này chở đúng ba thứ mà số ngày + icon KHÔNG nói ra: nguồn của dòng điểm danh (em tự
 * bấm · thầy cô ghi hộ · gửi bù), giờ em bấm, và sự khác nhau giữa "cuối tuần" với "chưa
 * ai ghi". Trước hôm nay cả ba chỉ nằm trong `title=` — tức là chỉ tới được bằng CHUỘT.
 * GVCN cầm iPhone là bối cảnh dùng thật của màn này (xem `formatDateTime` cùng file), mà
 * cảm ứng không có hover: trên điện thoại ba thứ đó không tồn tại. Bàn phím cũng không
 * tới được vì <span> không nằm trong thứ tự Tab.
 *
 * Nay bấm (hoặc Tab + Enter) vào một ngày là câu đầy đủ hiện ra ngay dưới lưới. `title=`
 * giữ nguyên cho người dùng chuột — nó không còn là đường DUY NHẤT nữa.
 * `min-h-[44px]` đã có sẵn từ trước (§11, WCAG 2.5.5); ô rộng ~46px ở khổ 360px.
 */
function DayCell({
  iso,
  entry,
  daChon,
  onChon,
}: {
  iso: string;
  entry: StudentCheckinDay | null;
  daChon: boolean;
  onChon: () => void;
}) {
  const weekend = weekdayIndex(iso) >= 5;
  // Đổi 01/08/2026: `tone` bám vào TRẠNG THÁI ĐIỂM DANH, không còn bám vào tâm trạng.
  // Và điều kiện viền nét đứt đổi từ "không có tone" sang "KHÔNG CÓ DÒNG NÀO" — nét đứt
  // phải nghĩa là chưa ai ghi, không phải là chưa có tâm trạng.
  const tone = entry?.status ? STATUS_CELL[entry.status] : null;
  const label = dayCellLabel(iso, entry);

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={daChon}
      onClick={onChon}
      className={`flex min-h-[44px] w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center ${
        daChon ? "ring-2 ring-navy" : ""
      } ${
        entry
          ? ""
          : weekend
            ? "bg-[#F7F9FC]"
            : "border border-dashed border-[#D8DFE9] bg-white"
      }`}
      style={tone ? { background: tone.bg, color: tone.fg } : undefined}
    >
      {/* Ngày cuối tuần từng dùng #B4BECC trên #F7F9FC = 1,78:1 — không phải "mờ cho
          nhẹ", là không đọc được. Ngày thường chưa có dữ liệu từng dùng #8A94A6 = 3,06:1.
          Cả hai nay là `muted`; sự khác nhau giữa cuối tuần và ngày học đã do NỀN và
          viền nét đứt nói, không cần nói lại bằng cách làm chữ nhạt đi. */}
      <span className={`text-[12px] font-black tabular-nums ${tone ? "" : "text-muted"}`}>
        {dayNumber(iso)}
      </span>
      {/* Hàng icon — thứ biến ô này từ "chỉ có màu" thành đọc được không cần màu.
          `aria-hidden` vì `aria-label` của nút đã đọc nguyên câu đầy đủ, có cả ngày lẫn giờ.

          Ô CUỐI TUẦN KHÔNG CÓ ICON (sửa 02/08/2026). Trước đó nó in `remove` — đúng cái
          icon mà chú giải ngay dưới lưới gọi tên là "Chưa điểm danh". Thứ Bảy không phải
          một ngày chưa ai điểm danh; nó là một ngày không có gì để điểm danh, và hai
          chuyện đó không được vẽ giống nhau (§11: hai trạng thái khác nghĩa phải khác
          icon + chữ, chứ không chỉ khác nền — mà ở đây nền chỉ khác 1,04:1).
          `h-[13px]` giữ nguyên chiều cao hàng: bỏ icon mà để hàng tự co thì ô cuối tuần
          thấp hơn ô ngày học và cả lưới 7 cột bị giật so le. */}
      <span className="flex h-[13px] items-center justify-center leading-none">
        {(tone || !weekend) && (
          <span className={`msr text-[13px] ${tone ? "" : "text-muted"}`} aria-hidden>
            {tone ? tone.icon : ATTENDANCE_UNKNOWN_ICON}
          </span>
        )}
      </span>
      {/* `sr-only` cũ đã bỏ: `aria-label` trên chính nút ĐÈ nội dung, nên câu đó không
          bao giờ được đọc ra nữa — để lại là một dòng chết mà lần sửa sau sẽ tưởng là
          đường đọc thật. Câu đầy đủ vẫn tới tai qua aria-label, và tới MẮT qua dòng chi
          tiết dưới lưới. */}
    </button>
  );
}

function statusWord(status: string): string {
  switch (status) {
    case "present":
      return "có mặt";
    case "late":
      return "đi muộn";
    case "absent":
      return "vắng";
    case "excused":
      return "có phép";
    case "queued_late":
      return "gửi muộn, chờ xác nhận";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// 2. Tín hiệu cần để ý — "cần gặp thầy cô" + hồ sơ chăm sóc.
// ---------------------------------------------------------------------------
function SignalCard({
  days,
  helpRequests,
  careCases,
}: {
  days: number;
  helpRequests: Array<{
    requestedOn: string;
    topic: string | null;
    urgency: string | null;
    note: string | null;
    handledAt: string | null;
  }>;
  careCases: Array<{ caseId: string; status: "open" | "closed"; openedAt: string; closedAt: string | null }>;
}) {
  const openCase = careCases.find((c) => c.status === "open") ?? null;

  return (
    <Card>
      <h2 className="text-[15px] font-black text-navy">Tín hiệu cần để ý</h2>

      {/* Hai khối dưới đây bỏ `border-l-[5px]` (02/08/2026) — dải màu dày một cạnh làm
          điểm nhấn là mẫu bị cấm, và help-request-view.tsx đã sửa đúng kiểu này hôm
          01/08 nhưng hai chỗ ở đây bị bỏ sót. Lý do bỏ cụ thể hơn "vì có luật": cả hai
          khối ĐÃ có icon (folder_open · pan_tool) và ĐÃ có câu chữ nói thẳng trạng thái
          ngay cạnh, nên dải màu là lớp thứ ba nói lại cùng một điều bằng thứ ngôn ngữ
          mà người mù màu không đọc được. Viền 1px cùng tông giữ được cảm giác "khối này
          khác khối kia" cho mắt mà không giả vờ là tín hiệu. Hai mã viền lấy từ bảng
          đang dùng (#FFE29A 6 chỗ · #FFD5D6 5 chỗ), không chế màu mới. */}
      {openCase ? (
        <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-[#FFE29A] bg-[#FFFBEE] px-3.5 py-3">
          <span className="msr text-[19px] text-[#E8940D]" aria-hidden>
            folder_open
          </span>
          <span className="text-[12.5px] font-black text-gold-textDark">
            Hồ sơ chăm sóc đang mở từ {formatDateTime(openCase.openedAt)}
          </span>
          <span className="basis-full text-[11.5px] text-[#8A5A00]">
            Đóng hồ sơ ở buồng lái, tại thẻ cờ của em.
          </span>
        </div>
      ) : careCases.length > 0 ? (
        <p className="mt-3 text-[12px] text-muted">
          Không hồ sơ nào đang mở · đóng gần nhất{" "}
          {careCases[0]?.closedAt ? formatDateTime(careCases[0].closedAt) : "trước đó"}
        </p>
      ) : null}

      {helpRequests.length === 0 ? (
        // CẮT vế "Đây là một sự thật về nút bấm đó, không phải một kết luận về em."
        // (06/08/2026): câu đầu ĐÃ nói đúng phạm vi của mình — nó nói về nút bấm, trong
        // {days} ngày. Vế hai chỉ dặn người đọc đừng suy diễn, tức là dạy cách đọc.
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Chưa bấm “cần gặp thầy cô” lần nào trong {days} ngày qua.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {helpRequests.map((h) => (
            <li key={h.requestedOn} className="rounded-xl border border-[#FFD5D6] bg-[#FFF7F7] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFE9E9] px-2.5 py-1 text-[10px] font-black tracking-wide text-[#B02A30]">
                  <span className="msr text-[14px]" aria-hidden>
                    pan_tool
                  </span>
                  ĐÃ BẤM "CẦN GẶP THẦY CÔ"
                </span>
                <span className="text-[12px] font-extrabold text-ink">{formatDate(h.requestedOn)}</span>
                {h.urgency && (
                  <span className="text-[11.5px] font-bold text-subtle">
                    {HELP_REQUEST_URGENCY_LABEL[h.urgency as keyof typeof HELP_REQUEST_URGENCY_LABEL]}
                  </span>
                )}
                {h.topic && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-cardtitle2">
                    {HELP_REQUEST_TOPIC_LABEL[h.topic as keyof typeof HELP_REQUEST_TOPIC_LABEL]}
                  </span>
                )}
              </div>

              {h.note && (
                <blockquote className="mt-2.5 rounded-xl bg-white p-3">
                  <div className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-wide text-muted">
                    <span className="msr text-[14px]" aria-hidden>
                      lock
                    </span>
                    Lời em viết riêng cho thầy cô
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-ink">{h.note}</p>
                </blockquote>
              )}

              <div className="mt-2.5 text-[11.5px] font-bold">
                {h.handledAt ? (
                  <span className="text-successText">Đã đánh dấu “cô đã gặp em” {formatDateTime(h.handledAt)}</span>
                ) : (
                  <span className="text-[#B02A30]">Chưa ai đánh dấu đã gặp em</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Nhật ký can thiệp CỦA RIÊNG EM.
// ---------------------------------------------------------------------------
function InterventionCard({
  rows,
}: {
  rows: Array<{
    interventionId: string;
    action: string;
    note: string | null;
    occurredAt: string;
    actorName: string;
    caseStatus: "open" | "closed";
  }>;
}) {
  return (
    <Card>
      <h2 className="text-[15px] font-black text-navy">Nhật ký can thiệp của em</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Chưa ai ghi hành động nào — ghi ở buồng lái.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.interventionId} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={`mt-[6px] h-[9px] w-[9px] flex-none rounded-full ${
                  r.caseStatus === "open" ? "bg-[#2C7BF2]" : "bg-line2"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-extrabold text-ink">{r.action}</div>
                {r.note && <div className="mt-0.5 text-[12px] leading-relaxed text-subtle">{r.note}</div>}
                <div className="mt-0.5 text-[11px] text-muted">
                  {r.actorName} · {formatDateTime(r.occurredAt)}
                  {r.caseStatus === "closed" && " · hồ sơ đã đóng"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Trạng thái duyệt Báo cáo Trưởng thành.
// ---------------------------------------------------------------------------
const APPROVAL_TONE: Record<string, { bg: string; fg: string; icon: string; label: string }> = {
  approved: { bg: "bg-[#E3F8ED]", fg: "text-successText", icon: "task_alt", label: "Đã duyệt" },
  rejected: { bg: "bg-[#FFF0F0]", fg: "text-[#C0272D]", icon: "undo", label: "Đã trả lại" },
  pending: { bg: "bg-chip", fg: "text-subtle", icon: "hourglass_top", label: "Chưa quyết định" },
};

function ApprovalCard({
  rows,
}: {
  rows: Array<{ weekStart: string; status: string; reviewedAt: string | null; note: string | null }>;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-black text-navy">Duyệt Báo cáo Trưởng thành</h2>
        <Link
          href="/gvcn/duyet-bao-cao"
          className="inline-flex min-h-[44px] items-center text-[11.5px] font-black text-link underline underline-offset-2"
        >
          Mở màn duyệt
        </Link>
      </div>
      {rows.length === 0 ? (
        // RÚT NGẮN 06/08/2026. Vế "Sổ duyệt chỉ ghi việc con người đã quyết" là mô tả cơ
        // chế; vế phân biệt "chưa ai ký ≠ đã từ chối" thì GIỮ, vì nó là chỗ dễ đọc ngược
        // nhất của khối này (chú giải trạng thái ngay dưới có riêng chip "Đã trả lại").
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Chưa ai ký tuần nào — không phải đã từ chối.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((r) => {
            const tone = APPROVAL_TONE[r.status] ?? APPROVAL_TONE.pending!;
            return (
              <li key={r.weekStart} className="flex flex-wrap items-center gap-2.5 border-b border-[#F1F4F8] pb-2 last:border-0 last:pb-0">
                <span className="text-[12.5px] font-extrabold tabular-nums text-ink">
                  Tuần {formatDate(r.weekStart)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black ${tone.bg} ${tone.fg}`}
                >
                  <span className="msr text-[14px]" aria-hidden>
                    {tone.icon}
                  </span>
                  {tone.label}
                </span>
                {r.reviewedAt && <span className="text-[11px] text-muted">{formatDateTime(r.reviewedAt)}</span>}
                {r.note && <span className="basis-full text-[11.5px] leading-relaxed text-subtle">{r.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
