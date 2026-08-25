// apps/hub/components/tam-ly/cluster-case-detail-view.tsx — hồ sơ MỘT em, cho tâm lý cụm.
//
// Đây là màn vá đúng lỗ hổng mà audit nêu: trước hôm nay tâm lý cụm TẮT được cờ khẩn và
// ĐÓNG được hồ sơ chăm sóc của một đứa trẻ mà KHÔNG có đường nào nhìn thấy hồ sơ đó
// trước khi tắt. Quyền ghi rộng hơn quyền đọc không phải "chặt hơn" — đó là bắt người
// ta quyết định trong bóng tối, và với hồ sơ chăm sóc thì quyết định mù là quyết định sai.
//
// Vì thế thứ tự trên màn là: ĐỌC trước, NÚT sau. Ba nút hành động (đã gặp em rồi · ghi
// can thiệp · đóng hồ sơ) đặt SAU khối nhật ký và khối tín hiệu, không đặt lên đầu.
//
// Ba nút đó dùng lại ĐÚNG ba mutation đã có (`acknowledgeHelpRequest`, `logIntervention`,
// `closeCase`) — không viết đường ghi thứ hai cho cùng một việc, nên §9 (idempotency) vẫn
// do đúng một chỗ chịu trách nhiệm.
"use client";

import { useState } from "react";
import { HELP_REQUEST_TOPIC_LABEL, HELP_REQUEST_URGENCY_LABEL } from "@hub/core/contracts";
import type { ClusterHelpSignal } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { toLocalIsoDate } from "@/lib/date";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MutationError,
  MutationSuccess,
} from "../ui/query-state";
import { classLabel, personName } from "../ui/labels";
import { newMutationId } from "../gvcn/mutation-id";
import { acknowledgeHelpText } from "../gvcn-dashboard";
import { Card, ScopeNotice, TamLyShell } from "./tam-ly-shell";

/**
 * Hành động hay dùng của tâm lý cụm. Nhãn nói đúng việc ĐÃ LÀM, không nói việc hệ thống
 * sẽ làm hộ — cùng luật đã ghi ở `intervention-notes-view.tsx` (nút "đã chuyển tâm lý
 * cụm" từng khiến GVCN tin là ca đã sang tay người khác trong khi đầu kia không ai biết).
 */
const QUICK_ACTIONS = [
  "Đã gặp và trò chuyện với em",
  "Đã trao đổi với giáo viên chủ nhiệm",
  "Đã trao đổi với phụ huynh",
  "Đã hẹn lịch gặp tiếp",
];

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("vi-VN");
}

export function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN");
}

/** Loại tín hiệu — KHÔNG có nội dung lời em viết (xem ScopeNotice và contracts/care.ts). */
export function signalLabel(signal: Pick<ClusterHelpSignal, "topic" | "urgency">): string {
  const parts = [
    signal.topic ? HELP_REQUEST_TOPIC_LABEL[signal.topic] : null,
    signal.urgency ? HELP_REQUEST_URGENCY_LABEL[signal.urgency] : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : "Không ghi loại";
}

export function ClusterCaseDetailView({ studentId }: { studentId: string }) {
  const utils = trpc.useUtils();
  const query = trpc.care.getClusterCaseDetail.useQuery({ studentId });

  const [action, setAction] = useState(QUICK_ACTIONS[0] as string);
  const [note, setNote] = useState("");
  // Sinh MỘT LẦN mỗi lần soạn (§9); đổi mã sau khi ghi xong để lần ghi kế tiếp là một
  // hành động mới thật sự, không bị gộp vào hành động vừa rồi.
  const [mutationId, setMutationId] = useState(newMutationId);
  const [resolution, setResolution] = useState("");

  const refreshAll = () => {
    utils.care.getClusterCaseDetail.invalidate();
    utils.care.listClusterCases.invalidate();
  };

  const logIntervention = trpc.care.logIntervention.useMutation({
    onSuccess: () => {
      setNote("");
      setMutationId(newMutationId());
      refreshAll();
    },
  });
  const closeCase = trpc.care.closeCase.useMutation({ onSuccess: refreshAll });

  const data = query.data;
  const openCase = data?.openCase ?? null;
  const pendingSignals = (data?.helpSignals ?? []).filter((s) => s.handledAt === null);

  return (
    <TamLyShell
      title="Hồ sơ chăm sóc"
      subtitle={data ? data.student.schoolName : undefined}
      backHref="/tam-ly"
      backLabel="Về danh sách việc đang chờ"
    >
      {query.isPending ? (
        <LoadingState label="Đang mở hồ sơ…" />
      ) : query.error ? (
        <ErrorState error={query.error} label="hồ sơ chăm sóc" onRetry={() => query.refetch()} />
      ) : (
        <>
          <div>
            <h1 className="text-[22px] font-black text-cardtitle md:text-[24px]">{data!.student.fullName}</h1>
            <p className="mt-1 text-[12.5px] font-semibold text-subtle">
              {[data!.student.studentCode, classLabel(data!.student.className), data!.student.schoolName]
                .filter((p) => p !== "")
                .join(" · ")}
            </p>
          </div>

          <ScopeNotice />

          {/* ── Trạng thái hồ sơ ───────────────────────────────────────── */}
          {/* BẢY TIÊU ĐỀ THẺ CỦA MÀN NÀY LÀ <h2>, KHÔNG PHẢI <div> (sửa 05/08/2026).
              Trước đó cả màn chỉ có đúng một mốc tiêu đề là <h1> tên em; bảy khối còn lại
              — hồ sơ, tín hiệu, nhật ký, ghi chú tư vấn, cờ khẩn, ghi việc, đóng hồ sơ —
              chỉ là chữ to. Người đọc bằng tai duyệt trang bằng phím tiêu đề, nên một
              màn hồ sơ dài như thế này đọc thành một dòng liên tục không có mốc nào để
              nhảy: muốn tới nút "Đóng hồ sơ" phải nghe hết cả nhật ký can thiệp.
              Class giữ nguyên từng ký tự — đây là sửa NGỮ NGHĨA, không phải sửa hình thức.
              Mẫu đúng đã có sẵn ở dieu-hanh/operations-view.tsx ("Theo khối", "Theo lớp"). */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-black text-cardtitle">Hồ sơ chăm sóc</h2>
                <div className="mt-1 text-[12.5px] font-semibold text-[#4A5460]">
                  {openCase
                    ? `Đang mở từ ${formatDateTime(openCase.openedAt)}`
                    : "Chưa có hồ sơ nào đang mở cho em"}
                </div>
                {!openCase && (
                  // "Chưa có hồ sơ" là một trạng thái THẬT, không phải dữ liệu thiếu:
                  // hồ sơ chỉ sinh ra khi có người ghi hành động đầu tiên.
                  // RÚT NGẮN: hai câu cũ nói cùng một điều theo hai chiều. Giữ chiều
                  // HÀNH ĐỘNG được, bỏ chiều mô tả cơ chế.
                  <div className="mt-1 text-[11px] leading-relaxed text-muted">
                    Ghi một dòng ở dưới là hồ sơ tự mở.
                  </div>
                )}
              </div>
              {data!.cases.length > 1 && (
                <div className="text-[11px] font-bold text-muted">
                  {data!.cases.length} hồ sơ trong lịch sử
                </div>
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {/* ── Cột trái: những gì ĐÃ XẢY RA ────────────────────────── */}
            <div className="flex min-w-0 flex-1 basis-[460px] flex-col gap-4">
              <Card>
                <h2 className="text-[15px] font-black text-cardtitle">Tín hiệu "cần gặp thầy cô"</h2>
                {/* CẮT vế "Nội dung em viết chỉ GVCN của em đọc được" (06/08/2026): đó
                    đúng là điều `<ScopeNotice />` cách trên vài chục pixel vừa nói, và
                    ScopeNotice là chỗ luật cắt chỉ định giữ nhãn đó. Hai bản của cùng một
                    lời hứa quyền riêng tư trên cùng một màn là hai bản sẽ trôi lệch nhau. */}
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Loại tín hiệu và ngày · {data!.window.days} ngày gần nhất
                </p>
                {data!.helpSignals.length === 0 ? (
                  <EmptyState
                    icon="search_off"
                    title="Chưa có tín hiệu nào trong khoảng này"
                    hint="Em chưa bấm nút nào — không phải em không có chuyện gì."
                  />
                ) : (
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {data!.helpSignals.map((s) => (
                      <li key={s.helpRequestId} className="flex items-start gap-2.5">
                        <span
                          className={`mt-[6px] h-2 w-2 flex-none rounded-full ${s.handledAt ? "bg-line2" : "bg-[#F0474D]"}`}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-extrabold text-ink">{signalLabel(s)}</div>
                          <div className="mt-0.5 text-[11px] text-muted">
                            {formatDate(s.requestedOn)} ·{" "}
                            {s.handledAt
                              ? `đã có người bấm "đã gặp em rồi" lúc ${formatDateTime(s.handledAt)}`
                              : "chưa ai bấm “đã gặp em rồi”"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <h2 className="text-[15px] font-black text-cardtitle">Nhật ký can thiệp</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Của cả GVCN lẫn tâm lý cụm
                </p>
                {data!.interventions.length === 0 ? (
                  <EmptyState
                    icon="edit_note"
                    title="Chưa ai ghi hành động nào"
                    // RÚT NGẮN: bỏ vế "không phải mất dữ liệu" (nhánh hỏng đã có
                    // ErrorState riêng). GIỮ vế còn lại — sổ chỉ biết việc ĐƯỢC GHI, và
                    // đọc nó thành "chưa ai làm gì" là hiểu ngược.
                    hint="Sổ chỉ biết việc được ghi — không phải việc ngoài đời."
                  />
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {data!.interventions.map((i) => (
                      <li key={i.interventionId} className="flex items-start gap-2.5">
                        <span
                          className={`mt-[6px] h-2 w-2 flex-none rounded-full ${i.caseStatus === "open" ? "bg-[#2C7BF2]" : "bg-line2"}`}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-extrabold text-ink">{i.action}</div>
                          {i.note && (
                            <div className="mt-0.5 text-[12px] leading-relaxed text-[#4A5460]">{i.note}</div>
                          )}
                          <div className="mt-0.5 text-[10.5px] text-muted">
                            {personName(i.actorName)} · {formatDateTime(i.occurredAt)}
                            {i.caseStatus === "closed" ? " · hồ sơ đã đóng" : ""}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                {/* `visibility_off` thay `lock` (06/08/2026): DESIGN-GUIDELINES §9 và
                    ADR-026 chốt ĐÚNG badge đó cho ghi chú tư vấn, và cùng một icon đang
                    được dùng cho "ô này bị che" ở màn Điều hành — một khái niệm, một hình.
                    Nhãn quyền riêng tư thì GIỮ (luật cắt liệt kê nó ở nhóm không được bỏ),
                    chỉ rút một câu rưỡi còn một vế: "GVCN và phụ huynh không xem được" là
                    cách nói ngược của "chỉ người viết và tâm lý cụm đọc được". */}
                <div className="flex items-center gap-1.5">
                  <span className="msr text-[17px] text-domain-counselor" aria-hidden>
                    visibility_off
                  </span>
                  <h2 className="text-[15px] font-black text-cardtitle">Ghi chú tư vấn</h2>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Chỉ người viết và tâm lý cụm đọc được
                </p>
                {data!.counselorNotes.length === 0 ? (
                  <EmptyState
                    icon="sticky_note_2"
                    title="Chưa có ghi chú tư vấn nào"
                    hint="Hub chưa có màn nhập — trống ở đây không nói được gì."
                  />
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {data!.counselorNotes.map((n) => (
                      <li key={n.noteId} className="rounded-[14px] bg-[#F7F3FF] px-3.5 py-3">
                        <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#332154]">
                          {n.body}
                        </div>
                        <div className="mt-1 text-[10.5px] text-[#6B5A94]">
                          {n.mine ? "Thầy cô ghi" : personName(n.authorName)} · {formatDateTime(n.createdAt)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {!data!.notesWritable && (
                  // Nói THẲNG là chưa ghi được, thay vì hiện một ô soạn thảo rồi bắn lỗi
                  // quyền vào mặt người dùng lúc bấm Lưu.
                  <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-[#2A2208] px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-[#FFD98A]">
                    <span className="msr mt-[1px] flex-none text-[15px]" aria-hidden>
                      info
                    </span>
                    {/* RÚT NGẮN, KHÔNG BỎ: khối này thay cho một ô soạn thảo giả. Vế
                        "chỉ đọc được ghi chú đã có sẵn trong cơ sở dữ liệu" thì chính
                        danh sách ngay trên đã cho thấy. */}
                    Chưa ghi được ở Hub — ghi mới làm ngoài hệ thống.
                  </p>
                )}
              </Card>
            </div>

            {/* ── Cột phải: những gì CÔ SẮP LÀM ───────────────────────── */}
            <div className="flex min-w-0 flex-1 basis-[380px] flex-col gap-4">
              {pendingSignals.length > 0 && (
                <Card>
                  <h2 className="text-[15px] font-black text-cardtitle">Cờ khẩn đang chờ</h2>
                  {/* CẮT vế "Tín hiệu tắt khỏi hộp việc của cả GVCN lẫn tâm lý cụm" —
                      mô tả cơ chế. Điều cô cần biết trước khi bấm là ĐIỀU KIỆN bấm. */}
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Bấm khi đã thật sự gặp em.
                  </p>
                  {/* MỖI DÒNG MỘT COMPONENT, mỗi component một mutation riêng — đổi
                      01/08/2026. Bản cũ khai đúng MỘT `useMutation` cho cả danh sách, rồi
                      `disabled={acknowledgeHelp.isPending}` áp cho MỌI nút và câu kết quả
                      vẽ dưới cả danh sách. Với em có hai yêu cầu treo (đúng ba em trên
                      hub_dev hôm nay), cô bấm dòng 31/07 thì cả hai nút cùng khoá và câu
                      "Đã tắt cờ khẩn" hiện cho cả dòng 01/08 chưa ai đụng tới.
                      Khoá React cũng đổi từ `requestedOn` sang `helpRequestId`: khoá tự
                      nhiên chỉ hợp lệ nhờ `unique(student_id, requested_on)`, và nó gãy
                      im lặng ngay khi bảng cho phép hai yêu cầu trong một ngày. */}
                  <ul className="mt-3 flex flex-col gap-2">
                    {pendingSignals.map((s) => (
                      <PendingSignalRow
                        key={s.helpRequestId}
                        studentId={studentId}
                        signal={s}
                        onDone={refreshAll}
                      />
                    ))}
                  </ul>
                </Card>
              )}

              <Card>
                {/* GỠ 06/08/2026 câu "Có dòng ở đây thì hồ sơ không còn là "đo rồi để
                    đó", và đồng hồ nhắc được đặt lại." — cơ chế đồng hồ leo thang, cùng
                    lý do đã ghi ở `gvcn/intervention-notes-view.tsx`. Luật không đổi. */}
                <h2 className="text-[15px] font-black text-cardtitle">Ghi một việc vừa làm</h2>

                <div className="mt-3">
                  <span className="text-[11.5px] font-extrabold text-cardtitle2">Việc đã làm</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {QUICK_ACTIONS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={action === a}
                        onClick={() => setAction(a)}
                        className={
                          action === a
                            ? "min-h-[44px] rounded-full bg-domain-counselor px-4 py-1.5 text-[11.5px] font-black text-white"
                            : "min-h-[44px] rounded-full border border-line bg-card px-4 py-1.5 text-[11.5px] font-bold text-cardtitle2 hover:bg-chip"
                        }
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <input
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    maxLength={200}
                    aria-label="Việc đã làm"
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] placeholder:text-subtle focus:border-navy"
                  />
                </div>

                <label className="mt-3 block">
                  <span className="text-[11.5px] font-extrabold text-cardtitle2">Ghi chú (không bắt buộc)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Nội dung ngắn gọn, đủ để lần sau đọc lại còn hiểu…"
                    className="mt-1 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] placeholder:text-subtle focus:border-navy"
                  />
                </label>
                {/* GIỮ vế AI ĐỌC ĐƯỢC (nhãn quyền riêng tư, ADR-026): nó là ranh giới
                    giữa ô này và khối "Ghi chú tư vấn" ở cột trái, mà hai khối có hai
                    tập người đọc khác nhau. Vế "Nội dung buổi tư vấn thì không ghi vào
                    đây" là hệ quả tự nhiên của nó, cắt. Icon nói phần còn lại. */}
                <p className="mt-1 flex items-center gap-1 text-[10.5px] leading-relaxed text-muted">
                  <span className="msr text-[13px]" aria-hidden>
                    visibility
                  </span>
                  GVCN của em đọc được ô này
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={action.trim().length === 0 || logIntervention.isPending}
                    onClick={() =>
                      logIntervention.mutate({
                        // Có hồ sơ mở thì ghi thẳng vào đó; chưa có thì gửi khoá ghép
                        // "studentId:ngày" — `resolveOpenCase` tự mở hồ sơ đúng một lần.
                        caseId: openCase?.caseId ?? `${studentId}:${toLocalIsoDate(new Date())}`,
                        action: action.trim(),
                        note: note.trim() || undefined,
                        clientMutationId: mutationId,
                      })
                    }
                    className="min-h-[44px] rounded-xl bg-gradient-to-br from-domain-counselor to-domain-counselorDark px-5 py-3 text-[12.5px] font-black text-white shadow-[0_7px_16px_rgba(106,52,224,.28)] disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
                  >
                    {logIntervention.isPending ? "Đang ghi…" : "Ghi can thiệp"}
                  </button>
                  {logIntervention.error && <MutationError error={logIntervention.error} />}
                  {logIntervention.isSuccess && !logIntervention.error && (
                    <MutationSuccess>
                      {logIntervention.data?.deduplicated
                        ? "Việc này đã được ghi trước đó"
                        : "Đã ghi vào hồ sơ"}
                    </MutationSuccess>
                  )}
                </div>
              </Card>

              {openCase && (
                <Card>
                  <h2 className="text-[15px] font-black text-cardtitle">Đóng hồ sơ</h2>
                  {/* CẮT vế "nên lý do phải ghi lại để lần sau đọc còn hiểu vì sao" —
                      biện minh cho một ô mà nút bên dưới đã khoá cho tới khi có chữ.
                      GIỮ HẬU QUẢ: đóng hồ sơ là em rời hộp việc của cụm. Đó không phải
                      cơ chế, đó là thứ cô đang quyết định. */}
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                    Đóng thì em rời hộp việc của cụm.
                  </p>
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    aria-label="Lý do đóng hồ sơ"
                    placeholder="Vì sao đóng: em đã ổn định, đã bàn giao…"
                    className="mt-2 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] placeholder:text-subtle focus:border-navy"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={resolution.trim().length === 0 || closeCase.isPending}
                      onClick={() =>
                        closeCase.mutate({ caseId: openCase.caseId, resolution: resolution.trim() })
                      }
                      className="min-h-[44px] rounded-xl border-[1.6px] border-line bg-card px-5 py-3 text-[12.5px] font-black text-cardtitle2 disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
                    >
                      {closeCase.isPending ? "Đang đóng…" : "Đóng hồ sơ này"}
                    </button>
                    {closeCase.error && <MutationError error={closeCase.error} />}
                    {closeCase.isSuccess && !closeCase.error && (
                      <MutationSuccess>
                        {closeCase.data?.alreadyClosed ? "Hồ sơ đã đóng từ trước" : "Đã đóng hồ sơ"}
                      </MutationSuccess>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </TamLyShell>
  );
}

/**
 * MỘT dòng cờ khẩn đang chờ, với mutation RIÊNG của nó.
 *
 * Tách ra thành component là cả điểm của lần sửa này: trạng thái `isPending` /
 * `isSuccess` / `error` phải thuộc về ĐÚNG dòng vừa bấm. Gộp chung một mutation cho cả
 * danh sách thì một cú bấm khoá mọi nút và câu xác nhận nói thay cho những dòng chưa ai
 * đụng tới — và người đọc không có cách nào biết câu đó nói về dòng nào.
 *
 * `acknowledgeHelpText` dùng chung với buồng lái GVCN: hai vai bấm cùng một nút, gọi
 * cùng một mutation, thì phải đọc được cùng một câu trả lời. Hai bản văn cho cùng một
 * kết quả là cách hai màn bắt đầu nói khác nhau về cùng một sự thật.
 */
function PendingSignalRow({
  studentId,
  signal,
  onDone,
}: {
  studentId: string;
  signal: ClusterHelpSignal;
  onDone: () => void;
}) {
  const acknowledgeHelp = trpc.care.acknowledgeHelpRequest.useMutation({ onSuccess: onDone });

  return (
    <li className="flex flex-col gap-1.5 border-b border-[#12244A] pb-2 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-ink">
          {formatDate(signal.requestedOn)} · {signalLabel(signal)}
        </span>
        <button
          type="button"
          // KHÔNG có `|| isSuccess` ở đây: trạng thái nút suy từ DỮ LIỆU (dòng còn treo
          // thì còn bấm được), không suy từ lịch sử lời gọi trước. Dòng đã xử lý xong sẽ
          // biến mất khỏi `pendingSignals` ở lượt tải lại — đó mới là thứ tắt nút.
          disabled={acknowledgeHelp.isPending}
          onClick={() =>
            acknowledgeHelp.mutate({ studentId, helpRequestIds: [signal.helpRequestId] })
          }
          className="min-h-[44px] rounded-xl border-[1.6px] border-gold bg-[#2A2208] px-4 py-2.5 text-[12px] font-black text-gold-textDark disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
        >
          {acknowledgeHelp.isPending ? "Đang ghi…" : "Cô đã gặp em rồi"}
        </button>
      </div>
      {/* Kết quả nằm NGAY DƯỚI DÒNG vừa bấm, không dưới cả danh sách. */}
      {acknowledgeHelp.error && <MutationError error={acknowledgeHelp.error} />}
      {acknowledgeHelp.isSuccess && !acknowledgeHelp.error && (
        <MutationSuccess>{acknowledgeHelpText(acknowledgeHelp.data)}</MutationSuccess>
      )}
    </li>
  );
}
