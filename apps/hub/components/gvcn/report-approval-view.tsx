// apps/hub/components/gvcn/report-approval-view.tsx — màn "Duyệt báo cáo".
//
// Báo cáo Trưởng thành là thứ PHỤ HUYNH đọc. Giữa dữ liệu thô và mắt phụ huynh cần một
// con người đọc lại — đó là màn này. Sổ duyệt (report.growth_report_approvals, 0032)
// chỉ lưu QUYẾT ĐỊNH, không lưu nội dung báo cáo: nội dung vẫn sinh lại từ dữ liệu thô
// nên không có bản sao nào để lệch với sự thật.
//
// "Trả lại" bắt buộc kèm lý do (máy chủ cũng chặn, không chỉ giao diện): trả lại mà
// không nói vì sao thì tuần sau lặp lại đúng lỗi đó.
//
// 31/07/2026 — KHỐI XEM TRƯỚC. Trước bản này màn duyệt chỉ hiện hai con số vận hành
// (số ngày check-in, số ngày «Vui») rồi mời cô bấm "Duyệt gửi phụ huynh". Cô ký một thứ
// mình chưa từng đọc. Nay mỗi em kèm nguyên văn bản phụ huynh sẽ nhận — LUÔN MỞ, không
// gấp vào sau một nút "Xem trước": khối gấp cho phép duyệt mà không mở, tức là quay lại
// đúng chỗ cũ. Khối này viết bằng giọng "Glow & Grow" của phụ huynh (DESIGN-GUIDELINES
// §8) và được đóng khung rõ để không lẫn với phần vận hành của cô ở trên.
//
// 31/07/2026 (gói "tuong-phan-vung-cham-icon") — vùng chạm và tương phản. Màn này KÝ
// một quyết định gửi ra ngoài nhà trường, nên hai con số dưới đây không phải chuyện
// thẩm mỹ: hai mũi tên đổi tuần đang là 32×32 (bấm trượt = duyệt nhầm tuần), ba nút
// quyết định đang cao 38px, và mã học sinh — thứ dùng để phân biệt hai em trùng tên —
// in bằng token caption 3,06:1. Nay 44px và token muted (5,03:1) cho cả ba chỗ.
"use client";

import { useState } from "react";
import type { ReportApprovalRow, ReportPreview } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { mondayOf, toLocalIsoDate } from "@/lib/date";
import { EmptyState, ErrorState, LoadingState, MutationError } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { ClassPicker, useSelectedClass } from "./class-picker";
import { Card, GvcnShell } from "./gvcn-shell";

const STATUS_META = {
  pending: { label: "Chờ duyệt", bg: "bg-chip", fg: "text-[#5B6B80]", icon: "hourglass_empty" },
  approved: { label: "Đã duyệt", bg: "bg-[#E3F8ED]", fg: "text-[#00693F]", icon: "check_circle" },
  rejected: { label: "Đã trả lại", bg: "bg-[#FFF0F0]", fg: "text-[#C0272D]", icon: "undo" },
} as const;

/**
 * Ba màu nhấn của Glow (contract `GlowItem.accentColor`). Giữ đúng bảng màu mood/domain
 * của DESIGN-GUIDELINES §3; màu KHÔNG bao giờ là tín hiệu duy nhất — mỗi dòng luôn kèm
 * icon và chữ (§11).
 */
const GLOW_ACCENT = {
  green: { dot: "bg-[#00A85E]", icon: "workspace_premium" },
  blue: { dot: "bg-[#2C7BF2]", icon: "sentiment_very_satisfied" },
  amber: { dot: "bg-[#F5A300]", icon: "volunteer_activism" },
} as const;

function weekLabel(weekStart: string): string {
  const end = new Date(`${weekStart}T00:00:00`);
  end.setDate(end.getDate() + 4);
  return `${weekStart} → ${toLocalIsoDate(end)}`;
}

export function ReportApprovalView({ displayName, email }: { displayName: string; email: string }) {
  const utils = trpc.useUtils();
  const [weekStart, setWeekStart] = useState(() => toLocalIsoDate(mondayOf(new Date())));

  const classesQuery = trpc.care.getMyClasses.useQuery();
  const { classId, classCode, select } = useSelectedClass(classesQuery.data?.classes);

  const listQuery = trpc.care.listReportApprovals.useQuery(
    { classId: classId ?? undefined, weekStart },
    { enabled: classId !== null },
  );

  const rows = listQuery.data?.rows ?? [];
  const pending = rows.filter((r) => r.status === "pending").length;

  function shiftWeek(days: number) {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + days);
    setWeekStart(toLocalIsoDate(mondayOf(d)));
  }

  return (
    <GvcnShell
      active="review"
      title="Duyệt báo cáo"
      subtitle={
        listQuery.data
          ? `${classLabel(listQuery.data.className)} · tuần ${weekLabel(listQuery.data.weekStart)} · ${pending} em chờ duyệt`
          : undefined
      }
      displayName={displayName}
      email={email}
      classCode={classCode}
      toolbar={
        <div className="flex flex-wrap items-center gap-2.5">
          <ClassPicker classes={classesQuery.data?.classes ?? []} selectedId={classId} onSelect={select} />
          {/* h-11 w-11 = 44px (§11). Trước đó 32×32: đổi tuần là thao tác cô làm bằng
              ngón cái trên điện thoại ngay đầu giờ, bấm trượt sang tuần sai thì cô duyệt
              báo cáo của một tuần khác mà không có gì báo. */}
          <div className="flex items-center gap-1 rounded-xl border border-line bg-white px-1.5 py-1">
            <button
              type="button"
              onClick={() => shiftWeek(-7)}
              aria-label="Tuần trước"
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#F5F8FC]"
            >
              <span className="msr text-[18px] text-navy" aria-hidden>
                chevron_left
              </span>
            </button>
            <span className="px-1 text-[12px] font-extrabold tabular-nums text-[#33507C]">{weekLabel(weekStart)}</span>
            <button
              type="button"
              onClick={() => shiftWeek(7)}
              aria-label="Tuần sau"
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#F5F8FC]"
            >
              <span className="msr text-[18px] text-navy" aria-hidden>
                chevron_right
              </span>
            </button>
          </div>
        </div>
      }
    >
      {classesQuery.isPending ? (
        <LoadingState label="Đang tìm lớp của thầy cô…" />
      ) : classesQuery.error ? (
        <ErrorState error={classesQuery.error} label="danh sách lớp" onRetry={() => classesQuery.refetch()} />
      ) : (classesQuery.data?.classes.length ?? 0) === 0 ? (
        <EmptyState
          icon="school"
          title="Thầy cô chưa được phân công chủ nhiệm lớp nào"
          hint="Chỉ giáo viên chủ nhiệm mới duyệt được báo cáo của lớp."
        />
      ) : listQuery.error ? (
        <ErrorState error={listQuery.error} label="danh sách báo cáo" onRetry={() => listQuery.refetch()} />
      ) : listQuery.isPending ? (
        <LoadingState label="Đang tải báo cáo của lớp…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="group_off"
          title="Lớp này chưa có học sinh nào"
          hint="Chưa có em nào trong sổ ghi danh — chưa có báo cáo nào để duyệt."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <ApprovalRow key={row.studentId} row={row} weekStart={weekStart} onDone={() => utils.care.listReportApprovals.invalidate()} />
          ))}
        </div>
      )}
    </GvcnShell>
  );
}

function ApprovalRow({
  row,
  weekStart,
  onDone,
}: {
  row: ReportApprovalRow;
  weekStart: string;
  onDone: () => void;
}) {
  const [note, setNote] = useState(row.note ?? "");
  const [askReason, setAskReason] = useState(false);
  const approve = trpc.care.approveReport.useMutation({ onSuccess: onDone });
  const meta = STATUS_META[row.status];

  return (
    <Card>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-black text-ink">{row.fullName}</span>
          {/* text-muted chứ không phải text-caption: mã học sinh là thứ cô đối chiếu với
              sổ giấy khi hai em trùng tên — đọc sai một ký tự là duyệt nhầm người.
              caption (#8A94A6) chỉ đạt 3,06:1. */}
          <span className="text-[11px] tabular-nums text-muted">{row.studentCode}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black ${meta.bg} ${meta.fg}`}
          >
            <span className="msr text-[14px]" aria-hidden>
              {meta.icon}
            </span>
            {meta.label}
          </span>
        </div>
        <div className="mt-1 text-[12px] leading-relaxed text-muted">
          Tuần này: {row.checkinDays} ngày có check-in · {row.happyDays} ngày tâm trạng «Vui»
          {row.checkinDays === 0 && " — báo cáo tuần này gần như không có dữ liệu thật để kể"}
        </div>
        {row.reviewedAt && (
          <div className="mt-1 text-[11px] text-muted">
            Quyết định lúc {new Date(row.reviewedAt).toLocaleString("vi-VN")}
            {row.note ? ` · «${row.note}»` : ""}
          </div>
        )}
      </div>

      <ReportPreviewBlock preview={row.preview} studentName={row.fullName} />

      {/* Nút đặt SAU khối xem trước, không phải bên cạnh tên: thứ tự đọc trên màn hình
          chính là thứ tự việc phải làm — đọc bản phụ huynh sẽ nhận rồi mới quyết định.

          min-h-[44px] (§11): đây là nút GỬI THẬT cho phụ huynh, không hoàn tác được từ
          giao diện. Nút cao 38px cạnh nhau 8px là đúng khoảng cách sinh ra bấm nhầm.
          aria-expanded trên "Trả lại": nó mở/đóng một khối bên dưới, người dùng trình đọc
          màn hình phải nghe được là mình vừa mở cái gì. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={approve.isPending}
          onClick={() => {
            setAskReason(false);
            approve.mutate({ studentId: row.studentId, weekStart, decision: "approved" });
          }}
          className="min-h-[44px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 py-2.5 text-[12.5px] font-black text-white disabled:opacity-40"
        >
          {approve.isPending ? "Đang ghi…" : "Duyệt gửi phụ huynh"}
        </button>
        <button
          type="button"
          disabled={approve.isPending}
          aria-expanded={askReason}
          onClick={() => setAskReason((v) => !v)}
          className="min-h-[44px] rounded-xl border-[1.6px] border-gold bg-[#FFFBEE] px-4 py-2.5 text-[12.5px] font-black text-gold-textDark disabled:opacity-40"
        >
          Trả lại
        </button>
      </div>

      {askReason && (
        <div className="mt-3 flex flex-wrap items-end gap-2.5 border-t border-[#F1F4F8] pt-3">
          <label className="min-w-0 flex-1 basis-[260px]">
            <span className="text-[11.5px] font-extrabold text-[#33507C]">Lý do trả lại (bắt buộc)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ví dụ: tuần này em nghỉ ốm 3 ngày, báo cáo chưa phản ánh đúng…"
              className="mt-1 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none focus:border-navy"
            />
          </label>
          <button
            type="button"
            disabled={approve.isPending || note.trim().length === 0}
            onClick={() =>
              approve.mutate({
                studentId: row.studentId,
                weekStart,
                decision: "rejected",
                note: note.trim(),
              })
            }
            className="min-h-[44px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 py-2.5 text-[12.5px] font-black text-white disabled:opacity-40"
          >
            Xác nhận trả lại
          </button>
        </div>
      )}

      {approve.error && (
        <div className="mt-2.5">
          <MutationError error={approve.error} />
        </div>
      )}
    </Card>
  );
}

/**
 * Nguyên văn thứ phụ huynh sẽ đọc. Không tóm tắt, không diễn giải lại cho người trong
 * nghề: nếu bản này khác bản kia dù chỉ một câu thì chữ ký duyệt lại vô nghĩa như trước.
 *
 * Ba lựa chọn có chủ ý:
 *   · LUÔN MỞ, không gấp sau nút "Xem trước" — gấp lại là cho phép duyệt mà không đọc.
 *   · Không có glow thì NÓI THẲNG là chưa có, không độn một câu khen chung chung. Im lặng
 *     không phải kết luận tốt (DESIGN-GUIDELINES §8) và phụ huynh sẽ đọc đúng sự trống đó.
 *   · Không một từ vận hành nào (cờ, ngưỡng, leo thang) lọt vào khối này — đây là vùng
 *     giọng "Glow & Grow", dù đang hiện trên màn hình của cô.
 */
function ReportPreviewBlock({ preview, studentName }: { preview: ReportPreview; studentName: string }) {
  const empty = preview.glow.length === 0 && preview.grow.length === 0;

  return (
    <section
      aria-label={`Bản phụ huynh sẽ đọc — ${studentName}`}
      className="mt-3 rounded-2xl border border-line bg-[#FBFCFE] p-3.5"
    >
      <div className="flex items-center gap-1.5">
        {/* `visibility` chứ không phải một icon phong bì: font đã cắt gọn (public/fonts)
            và tên ngoài danh sách sẽ hiện Ô TRỐNG không báo lỗi — xem tests/unit/a11y. */}
        <span className="msr text-[16px] text-navy" aria-hidden>
          visibility
        </span>
        <h4 className="text-[11.5px] font-black uppercase tracking-wide text-[#33507C]">
          Phụ huynh sẽ đọc đúng thế này
        </h4>
      </div>

      <p className="mt-2 text-[14px] font-black text-navy">«{preview.headline}»</p>

      {empty ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Tuần này chưa có đủ dữ liệu để kể điều gì về {studentName}. Duyệt bây giờ là gửi đi một
          báo cáo gần như trống.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {preview.glow.map((item) => {
            const accent = GLOW_ACCENT[item.accentColor];
            return (
              <li key={item.title} className="flex gap-2.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg ${accent.dot}`}
                >
                  <span className="msr text-[15px] text-white" aria-hidden>
                    {accent.icon}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-extrabold leading-snug text-ink">
                    {item.title}
                  </span>
                  <span className="block text-[11.5px] leading-snug text-muted">{item.detail}</span>
                </span>
              </li>
            );
          })}

          {preview.grow.map((item) => (
            <li key={item.title} className="flex gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-[#7434E8]">
                <span className="msr text-[15px] text-white" aria-hidden>
                  trending_up
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-extrabold leading-snug text-ink">
                  {item.title}
                </span>
                <span className="block text-[11.5px] leading-snug text-muted">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
