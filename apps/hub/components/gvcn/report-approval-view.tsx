// apps/hub/components/gvcn/report-approval-view.tsx — màn "Duyệt báo cáo".
//
// Báo cáo Trưởng thành là thứ PHỤ HUYNH đọc. Giữa dữ liệu thô và mắt phụ huynh cần một
// con người đọc lại — đó là màn này. Sổ duyệt (report.growth_report_approvals, 0032)
// chỉ lưu QUYẾT ĐỊNH, không lưu nội dung báo cáo: nội dung vẫn sinh lại từ dữ liệu thô
// nên không có bản sao nào để lệch với sự thật.
//
// "Trả lại" bắt buộc kèm lý do (máy chủ cũng chặn, không chỉ giao diện): trả lại mà
// không nói vì sao thì tuần sau lặp lại đúng lỗi đó.
"use client";

import { useState } from "react";
import type { ReportApprovalRow } from "@hub/core/contracts";
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
          <div className="flex items-center gap-1 rounded-xl border border-line bg-white px-1.5 py-1">
            <button
              type="button"
              onClick={() => shiftWeek(-7)}
              aria-label="Tuần trước"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#F5F8FC]"
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
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#F5F8FC]"
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
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-black text-ink">{row.fullName}</span>
            <span className="text-[11px] tabular-nums text-caption">{row.studentCode}</span>
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
            <div className="mt-1 text-[11px] text-caption">
              Quyết định lúc {new Date(row.reviewedAt).toLocaleString("vi-VN")}
              {row.note ? ` · «${row.note}»` : ""}
            </div>
          )}
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={approve.isPending}
            onClick={() => {
              setAskReason(false);
              approve.mutate({ studentId: row.studentId, weekStart, decision: "approved" });
            }}
            className="rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 py-2.5 text-[12.5px] font-black text-white disabled:opacity-40"
          >
            {approve.isPending ? "Đang ghi…" : "Duyệt gửi phụ huynh"}
          </button>
          <button
            type="button"
            disabled={approve.isPending}
            onClick={() => setAskReason((v) => !v)}
            className="rounded-xl border-[1.6px] border-gold bg-[#FFFBEE] px-4 py-2.5 text-[12.5px] font-black text-gold-textDark disabled:opacity-40"
          >
            Trả lại
          </button>
        </div>
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
            className="rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 py-2.5 text-[12.5px] font-black text-white disabled:opacity-40"
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
