// apps/hub/components/gvcn/student-detail-view.tsx — màn "một em, mọi tín hiệu về em".
//
// Màn thứ NĂM của buồng lái GVCN (gói "man-hinh-con-thieu-gvcn-hs", 31/07/2026). Bốn màn
// trước đều là màn CỦA CẢ LỚP: bảng "Lớp chủ nhiệm" và buồng lái chỉ ra một cái tên
// ("Cần gặp thầy cô", "Hồ sơ đang mở") rồi dừng lại ở đó. Câu hỏi kế tiếp — "em này mấy
// hôm nay thế nào?" — trước hôm nay không có màn nào trả lời, nên cô phải mở bốn màn lớp
// rồi tự lọc mắt theo một cái tên. Phần lớn sẽ không làm, và dấu hiệu hiện ra rồi trôi qua.
//
// BỐN KHỐI, đúng bốn nguồn có thật trong CSDL — không khối nào vẽ ra để cho đầy màn:
//   1. Dải check-in 14/30 ngày (lịch theo thứ, không phải dãy ô trôi ngang)
//   2. Tín hiệu «cần gặp thầy cô» + hồ sơ chăm sóc mở/đóng
//   3. Nhật ký can thiệp CỦA RIÊNG EM
//   4. Trạng thái duyệt Báo cáo Trưởng thành mấy tuần gần đây
//
// HAI LUẬT ĐI XUYÊN CẢ MÀN:
//
//   · IM LẶNG KHÔNG PHẢI KẾT LUẬN. Ngày không có dòng check-in hiện là "chưa có dữ liệu",
//     KHÔNG phải "vắng" — và cũng không phải "ổn". Cuối tuần được đánh dấu riêng để không
//     bị đọc nhầm thành 2 ngày mất tín hiệu mỗi tuần. Khối rỗng nói thẳng là chưa có gì,
//     kèm đúng khoảng thời gian đã hỏi.
//   · GIỌNG VẬN HÀNH CHỈ Ở ĐÂY. Đây là màn của người lớn trong buồng lái, nên «cờ / hồ sơ
//     chăm sóc / can thiệp» được phép xuất hiện (DESIGN-GUIDELINES §8). Không một chữ nào
//     của màn này đi ra màn học sinh/phụ huynh.
//
// Lời em viết trong «cần gặp thầy cô» hiện ở khối 2. Lý do đầy đủ nằm trong contract
// (`StudentHelpRequest`): màn /can-gap-thay-co in lên mặt em lời hứa "cô đọc được", mà
// trước hôm nay không màn nào đọc nó — kể cả của cô. Lời hứa in trên màn hình là ràng
// buộc kỹ thuật, không phải lời quảng cáo.
"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  HELP_REQUEST_TOPIC_LABEL,
  HELP_REQUEST_URGENCY_LABEL,
  MOOD_LABEL,
  type MoodValue,
  type StudentCheckinDay,
} from "@hub/core/contracts";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { Card, GvcnShell } from "./gvcn-shell";

/** Bốn màu tâm trạng — DESIGN-GUIDELINES §3, ràng buộc cứng với bản giấy dùng trong lớp. */
const MOOD_CELL: Record<MoodValue, { bg: string; fg: string }> = {
  4: { bg: "linear-gradient(160deg,#00D97A,#00A85E)", fg: "#FFFFFF" },
  3: { bg: "linear-gradient(160deg,#4E9BFF,#2C7BF2)", fg: "#FFFFFF" },
  2: { bg: "linear-gradient(160deg,#FFC833,#F5A300)", fg: "#6B4A00" },
  1: { bg: "linear-gradient(160deg,#FF7A7F,#F0474D)", fg: "#FFFFFF" },
};

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
            className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-[#33507C] hover:bg-[#F5F8FC]"
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
                    ? "rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 py-2.5 text-[12.5px] font-black text-white shadow-[0_6px_14px_rgba(10,42,94,.24)]"
                    : "rounded-xl border border-line bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-[#33507C] hover:bg-[#F5F8FC]"
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
          hint="Thử tải lại trang. Nếu vẫn không được, báo quản trị hệ thống giúp em nhé."
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
          <div key={w} className="text-center text-[10px] font-black uppercase tracking-wide text-caption">
            {w}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}
        {allDays.map((iso) => (
          <DayCell key={iso} iso={iso} entry={byDate.get(iso) ?? null} />
        ))}
      </div>

      {/* Chú giải: màu KHÔNG bao giờ là tín hiệu duy nhất (§11). */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-[#F1F4F8] pt-3">
        {([4, 3, 2, 1] as MoodValue[]).map((m) => (
          <span key={m} className="flex items-center gap-1.5 text-[11px] font-bold text-[#5B6B80]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: MOOD_CELL[m].bg }}
            />
            {MOOD_LABEL[m]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#5B6B80]">
          <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full border border-dashed border-[#C9D2DE]" />
          Chưa có dữ liệu
        </span>
      </div>

      {/*
        Câu này là cả lý do khối trên tồn tại. "Chưa có dữ liệu" ≠ "em vắng" và cũng
        ≠ "em ổn": hai cách đọc sai đó đã xuất hiện bốn lần trong repo này.
      */}
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-caption">
        {missingSchoolDays === 0
          ? "Mọi ngày học trong khoảng này đều có dữ liệu."
          : `${missingSchoolDays} ngày học chưa có dòng điểm danh nào — nghĩa là chưa ai ghi, không phải là em vắng.`}
      </p>
    </Card>
  );
}

function DayCell({ iso, entry }: { iso: string; entry: StudentCheckinDay | null }) {
  const weekend = weekdayIndex(iso) >= 5;
  const mood = entry?.mood ?? null;
  const tone = mood ? MOOD_CELL[mood] : null;

  const label = [
    formatDate(iso),
    entry?.status ? statusWord(entry.status) : "chưa có dữ liệu",
    mood ? `tâm trạng ${MOOD_LABEL[mood]}` : null,
    entry?.checkedInAt ? `lúc ${entry.checkedInAt}` : null,
    entry?.source === "teacher" ? "thầy cô ghi hộ" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={label}
      className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center ${
        tone
          ? ""
          : weekend
            ? "bg-[#F7F9FC]"
            : "border border-dashed border-[#D8DFE9] bg-white"
      }`}
      style={tone ? { background: tone.bg, color: tone.fg } : undefined}
    >
      <span className={`text-[12px] font-black tabular-nums ${tone ? "" : weekend ? "text-[#B4BECC]" : "text-[#8A94A6]"}`}>
        {dayNumber(iso)}
      </span>
      {entry?.status === "absent" ? (
        <span className="msr text-[13px]" aria-hidden>
          person_off
        </span>
      ) : entry?.status === "queued_late" || entry?.status === "late" ? (
        <span className="msr text-[13px]" aria-hidden>
          schedule
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
    </span>
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
// 2. Tín hiệu cần để ý — «cần gặp thầy cô» + hồ sơ chăm sóc.
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

      {openCase ? (
        <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border-l-[5px] border-gold bg-[#FFFBEE] px-3.5 py-3">
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
          Không có hồ sơ chăm sóc nào đang mở. Gần nhất đã đóng{" "}
          {careCases[0]?.closedAt ? formatDateTime(careCases[0].closedAt) : "trước đó"}.
        </p>
      ) : null}

      {helpRequests.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Em chưa bấm «cần gặp thầy cô» lần nào trong {days} ngày qua. Đây là một sự thật về{" "}
          <b>nút bấm đó</b>, không phải một kết luận về em.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {helpRequests.map((h) => (
            <li key={h.requestedOn} className="rounded-xl border-l-[5px] border-[#F0474D] bg-[#FFF7F7] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFE9E9] px-2.5 py-1 text-[10px] font-black tracking-wide text-[#B02A30]">
                  <span className="msr text-[14px]" aria-hidden>
                    pan_tool
                  </span>
                  ĐÃ BẤM «CẦN GẶP THẦY CÔ»
                </span>
                <span className="text-[12px] font-extrabold text-ink">{formatDate(h.requestedOn)}</span>
                {h.urgency && (
                  <span className="text-[11.5px] font-bold text-[#5B6B80]">
                    {HELP_REQUEST_URGENCY_LABEL[h.urgency as keyof typeof HELP_REQUEST_URGENCY_LABEL]}
                  </span>
                )}
                {h.topic && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#33507C]">
                    {HELP_REQUEST_TOPIC_LABEL[h.topic as keyof typeof HELP_REQUEST_TOPIC_LABEL]}
                  </span>
                )}
              </div>

              {h.note && (
                <blockquote className="mt-2.5 rounded-xl bg-white p-3">
                  <div className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-wide text-caption">
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
                  <span className="text-[#00693F]">Đã đánh dấu “cô đã gặp em” {formatDateTime(h.handledAt)}</span>
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
          Chưa có hành động nào được ghi cho riêng em. Ghi can thiệp ở buồng lái, tại thẻ cờ của em.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.interventionId} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={`mt-[6px] h-[9px] w-[9px] flex-none rounded-full ${
                  r.caseStatus === "open" ? "bg-[#2C7BF2]" : "bg-[#C9D2DE]"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-extrabold text-ink">{r.action}</div>
                {r.note && <div className="mt-0.5 text-[12px] leading-relaxed text-[#5B6B80]">{r.note}</div>}
                <div className="mt-0.5 text-[11px] text-caption">
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
  approved: { bg: "bg-[#E3F8ED]", fg: "text-[#00693F]", icon: "task_alt", label: "Đã duyệt" },
  rejected: { bg: "bg-[#FFF0F0]", fg: "text-[#C0272D]", icon: "undo", label: "Đã trả lại" },
  pending: { bg: "bg-chip", fg: "text-[#5B6B80]", icon: "hourglass_top", label: "Chưa quyết định" },
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
        <Link href="/gvcn/duyet-bao-cao" className="text-[11.5px] font-black text-[#1D4E8F] underline underline-offset-2">
          Mở màn duyệt
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Chưa tuần nào của em được quyết định. Sổ duyệt chỉ ghi việc con người đã quyết — không có dòng nào
          nghĩa là chưa ai ký, không phải là đã từ chối.
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
                {r.reviewedAt && <span className="text-[11px] text-caption">{formatDateTime(r.reviewedAt)}</span>}
                {r.note && <span className="basis-full text-[11.5px] leading-relaxed text-[#5B6B80]">{r.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
