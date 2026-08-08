// apps/hub/components/gvcn/intervention-notes-view.tsx — màn "Ghi chú can thiệp".
//
// Hai nửa: nhật ký can thiệp của cả lớp (đọc) + ô ghi mới (viết). Ô ghi dùng lại
// `care.logIntervention` — KHÔNG viết đường ghi thứ hai cho cùng một việc.
//
// `clientMutationId` sinh MỘT LẦN mỗi lần mở form (§9): gửi lại cùng mã = cùng một
// hành động, không phải hành động thứ hai. Buồng lái cũ chưa gửi mã này nên máy chủ
// phải tự dựng khoá chống trùng theo NGÀY — nghĩa là hai lần trò chuyện thật trong
// cùng một ngày bị gộp làm một. Màn này gửi mã tử tế nên không mắc vào đánh đổi đó.
//
// Mỗi dòng nhật ký RESET đồng hồ leo thang 7 ngày (care.interventions, 0005), nên một
// dòng thừa không phải là rác vô hại — nó làm hệ tưởng đã có người xử lý.
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { toLocalIsoDate } from "@/lib/date";
import { EmptyState, ErrorState, LoadingState, MutationError, MutationSuccess } from "../ui/query-state";
import { classLabel, personName } from "../ui/labels";
import { ClassPicker, useSelectedClass } from "./class-picker";
import { Card, GvcnShell } from "./gvcn-shell";
import { newMutationId } from "./mutation-id";

/**
 * Hành động hay dùng — bấm một cái là xong, khỏi gõ lại mỗi lần.
 *
 * Sửa 31/07/2026 (gói "trung-thuc-trang-thai"): nhãn cũ là "Đã chuyển tâm lý cụm".
 * Nút đó KHÔNG chuyển gì cả — nó chỉ ghi thêm một dòng chữ vào nhật ký lớp. Hệ
 * thống chưa có contract chuyển tuyến (packages/core/contracts/care.ts nói rõ là
 * GĐ2), chưa có mutation `referToCounselor`, và tâm lý cụm chưa có hộp việc nào để
 * nhận. Một GVCN bấm nút mang chữ "đã chuyển" hoàn toàn có lý do tin rằng em đã
 * sang tay người khác — trong khi ở đầu kia không ai biết gì. Với một em vừa bấm
 * "cần gặp thầy cô", hiểu nhầm đó là im lặng đúng lúc không được phép im.
 *
 * Nhãn mới nói đúng việc nó làm: ghi lại một cuộc trao đổi ĐÃ diễn ra ngoài hệ
 * thống. Đổi lại thành hành động chuyển tuyến thật khi (và chỉ khi) có đủ ba thứ:
 * contract → mutation → màn hình bên nhận.
 */
const QUICK_ACTIONS = [
  "Đã trò chuyện với học sinh",
  "Đã gọi điện cho phụ huynh",
  "Đã trao đổi với giáo viên bộ môn",
  "Đã trao đổi với tâm lý cụm (ngoài hệ thống)",
];

/** Nhãn nào cần một câu nói rõ "hệ thống không làm gì thêm sau khi bấm". */
export function needsOutOfBandWarning(action: string): boolean {
  return action.includes("tâm lý cụm");
}

export function InterventionNotesView({ displayName, email }: { displayName: string; email: string }) {
  const utils = trpc.useUtils();
  const classesQuery = trpc.care.getMyClasses.useQuery();
  const { classId, classCode, select } = useSelectedClass(classesQuery.data?.classes);

  const rosterQuery = trpc.care.getClassRoster.useQuery(
    { classId: classId ?? undefined },
    { enabled: classId !== null },
  );
  const logQuery = trpc.care.listClassInterventions.useQuery(
    { classId: classId ?? undefined, limit: 50 },
    { enabled: classId !== null },
  );

  const [studentId, setStudentId] = useState("");
  const [action, setAction] = useState(QUICK_ACTIONS[0] as string);
  const [note, setNote] = useState("");
  // Sinh MỘT LẦN cho mỗi lần soạn; đổi mã sau khi ghi xong để lần ghi kế tiếp là một
  // hành động mới thật sự, không bị gộp vào hành động vừa rồi.
  const [mutationId, setMutationId] = useState(newMutationId);

  const logIntervention = trpc.care.logIntervention.useMutation({
    onSuccess: () => {
      setNote("");
      setMutationId(newMutationId());
      utils.care.listClassInterventions.invalidate();
      utils.care.getDashboard.invalidate();
    },
  });

  const students = rosterQuery.data?.students ?? [];
  const rows = logQuery.data?.rows ?? [];
  const canSubmit = studentId !== "" && action.trim().length > 0 && !logIntervention.isPending;

  return (
    <GvcnShell
      active="notes"
      title="Ghi chú can thiệp"
      subtitle={
        logQuery.data ? `${classLabel(logQuery.data.className)} · ${rows.length} ghi chú gần nhất` : undefined
      }
      displayName={displayName}
      email={email}
      classCode={classCode}
      toolbar={<ClassPicker classes={classesQuery.data?.classes ?? []} selectedId={classId} onSelect={select} />}
    >
      {classesQuery.isPending ? (
        <LoadingState label="Đang tìm lớp của thầy cô…" />
      ) : classesQuery.error ? (
        <ErrorState error={classesQuery.error} label="danh sách lớp" onRetry={() => classesQuery.refetch()} />
      ) : (classesQuery.data?.classes.length ?? 0) === 0 ? (
        <EmptyState
          icon="school"
          title="Thầy cô chưa được phân công chủ nhiệm lớp nào"
          hint="Ghi chú can thiệp gắn với một lớp cụ thể."
        />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <Card className="min-w-0 flex-1 basis-[420px]">
            {/* <h2> chứ không phải <div>: <h1> của trang do GvcnShell đặt, và hai thẻ của
                màn này là hai mục ngang cấp dưới nó. Trước hôm nay trình đọc màn hình
                nghe hết cả màn mà không có mốc nào để nhảy giữa hai nửa "ghi" và "đọc".
                Cỡ chữ, màu, khoảng cách giữ nguyên từng pixel — đổi THẺ, không đổi thiết kế. */}
            {/* GỠ 06/08/2026 câu "Ghi lại việc CON NGƯỜI đã làm với em. Có dòng ở đây thì
                hồ sơ không còn là "đo rồi để đó", và đồng hồ nhắc 7 ngày được đặt lại."
                Vế đầu lặp lại tiêu đề ngay trên nó. Vế sau là CƠ CHẾ (đồng hồ leo thang
                được reset) — đúng thứ luật cắt gọi tên, và nó còn viết chết con số 7 ngày
                trong khi ngưỡng đọc từ `care.thresholds` (mệnh lệnh 7). Luật không đổi:
                mỗi dòng vẫn reset đồng hồ, vẫn theo ngưỡng của bảng. */}
            <h2 className="text-[15px] font-black text-navy">Ghi một việc vừa làm</h2>

            {/* BA TRẠNG THÁI CỦA Ô CHỌN EM, ba câu khác nhau (sửa 01/08/2026).

                Bản cũ đọc danh sách bằng `rosterQuery.data?.students ?? []` rồi chỉ rẽ
                nhánh theo `isPending`. Grep `rosterQuery.error` trong file này trả về 0
                kết quả — nghĩa là khi truy vấn danh sách lớp HỎNG: isPending=false,
                students=[], select bị khoá và hiện "— chọn em —", `canSubmit` mãi false
                nên nút "Ghi can thiệp" mờ vĩnh viễn. Màn hình trông y hệt trường hợp lớp
                thật sự chưa có em nào, và không một dòng chữ nào giải thích. Đây là đường
                GHI duy nhất của màn: hỏng lặng nghĩa là cô không ghi được can thiệp mà
                không biết vì sao, và cũng không biết là mình nên thử lại.

                Bất đối xứng lộ rõ ngay trong cùng file: `logQuery.error` ĐÃ được xử lý tử
                tế bằng ErrorState + nút thử lại ở cột phải. Một nửa màn nói thật, nửa kia
                im lặng. */}
            <label className="mt-3.5 block">
              <span className="text-[11.5px] font-extrabold text-cardtitle2">Học sinh</span>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={rosterQuery.isPending || Boolean(rosterQuery.error) || students.length === 0}
                aria-describedby={rosterQuery.error ? "loi-danh-sach-lop" : undefined}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[12.5px] font-semibold text-ink outline-none focus:border-navy disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
              >
                <option value="">
                  {rosterQuery.isPending
                    ? "Đang tải danh sách lớp…"
                    : rosterQuery.error
                      ? "Không đọc được danh sách lớp"
                      : students.length === 0
                        ? "Lớp này chưa có em nào trong sổ"
                        : "— chọn em —"}
                </option>
                {students.map((s) => (
                  <option key={s.studentId} value={s.studentId}>
                    {s.fullName} · {s.studentCode}
                  </option>
                ))}
              </select>
            </label>
            {rosterQuery.error && (
              <div id="loi-danh-sach-lop" className="mt-2">
                <MutationError error={rosterQuery.error} onRetry={() => void rosterQuery.refetch()} />
              </div>
            )}

            <div className="mt-3">
              <span className="text-[11.5px] font-extrabold text-cardtitle2">Việc đã làm</span>
              {/* role="group" + aria-label: bốn nút này khai `aria-pressed`, tức mỗi nút tự
                  nói "đang chọn / không chọn" — nhưng chúng nằm trong một <div> trơn, nên
                  trình đọc màn hình đọc bốn nút rời rạc, không nói được chúng là BỐN LỰA
                  CHỌN CỦA CÙNG MỘT CÂU HỎI. Chữ "Việc đã làm" ngay trên chỉ dành cho mắt.
                  Cùng mẫu đã dùng cho bốn nút trạng thái ở class-attendance-view. */}
              <div role="group" aria-label="Việc đã làm" className="mt-1.5 flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={action === a}
                    onClick={() => setAction(a)}
                    className={
                      action === a
                        ? "min-h-[44px] rounded-full bg-navy px-4 py-1.5 text-[11.5px] font-black text-white"
                        : "min-h-[44px] rounded-full border border-line bg-white px-4 py-1.5 text-[11.5px] font-bold text-cardtitle2 hover:bg-[#F5F8FC]"
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
                className="mt-2 min-h-[44px] w-full rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-navy"
              />
              {/* Ghi rõ ranh giới của cái nút: nó ghi nhật ký, nó không chuyển việc.
                  Không có câu này thì "đã trao đổi" dễ bị đọc thành "đã bàn giao". */}
              {needsOutOfBandWarning(action) && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-[#FFF7E0] px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-[#8A5A00]">
                  <span className="msr mt-[1px] flex-none text-[15px]" aria-hidden>
                    info
                  </span>
                  {/* RÚT NGẮN 06/08/2026, KHÔNG BỎ. Câu này là ranh giới của cái nút:
                      không có nó, "đã trao đổi với tâm lý cụm" bị đọc thành "đã bàn giao",
                      và với một em vừa bấm "cần gặp thầy cô" thì hiểu nhầm đó là im lặng
                      đúng lúc không được phép im. Bốn từ nói đủ chừng đó. */}
                  Chỉ ghi nhật ký — không chuyển tuyến.
                </p>
              )}
            </div>

            {/* <label htmlFor> thật, không chỉ là <label> bọc ngoài (mẫu: help-request-view).
                Bọc ngoài đúng theo chuẩn HTML, nhưng nối bằng id thì còn sống sót qua lần
                sửa bố cục sau — chỉ cần ai đó tách ô ra khỏi khung là nhãn đứt lặng lẽ. */}
            <label className="mt-3 block" htmlFor="ghi-chu-can-thiep">
              <span className="text-[11.5px] font-extrabold text-cardtitle2">Ghi chú (không bắt buộc)</span>
              <textarea
                id="ghi-chu-can-thiep"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Nội dung ngắn gọn, đủ để lần sau đọc lại còn hiểu…"
                className="mt-1 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-navy"
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() =>
                  logIntervention.mutate({
                    // Flag engine chưa chạy nên hồ sơ được mở theo khoá ghép
                    // "studentId:ngày" — đúng dạng mà care.logIntervention đang nhận.
                    caseId: `${studentId}:${toLocalIsoDate(new Date())}`,
                    action: action.trim(),
                    note: note.trim() || undefined,
                    clientMutationId: mutationId,
                  })
                }
                className="min-h-[44px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)] disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
              >
                {logIntervention.isPending ? "Đang ghi…" : "Ghi can thiệp"}
              </button>
              {logIntervention.error && <MutationError error={logIntervention.error} />}
              {logIntervention.isSuccess && !logIntervention.error && (
                <MutationSuccess>
                  {logIntervention.data?.deduplicated ? "Việc này đã được ghi trước đó" : "Đã ghi vào hồ sơ"}
                </MutationSuccess>
              )}
            </div>
          </Card>

          <Card className="min-w-0 flex-1 basis-[420px]">
            <h2 className="text-[15px] font-black text-navy">Nhật ký của lớp</h2>
            {logQuery.error ? (
              <div className="mt-2">
                <ErrorState error={logQuery.error} label="nhật ký can thiệp" onRetry={() => logQuery.refetch()} />
              </div>
            ) : logQuery.isPending ? (
              <LoadingState label="Đang tải nhật ký…" />
            ) : rows.length === 0 ? (
              <EmptyState
                icon="edit_note"
                // CẮT hint "Trống ở đây nghĩa là chưa ai ghi việc gì — không phải mất dữ
                // liệu": tiêu đề đã nói đúng chừng đó, và nhánh mất dữ liệu có ErrorState
                // riêng ngay phía trên nên hiểu nhầm được thiết kế chặn rồi.
                title="Chưa ai ghi ghi chú nào cho lớp này"
              />
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {rows.map((r) => (
                  <li key={r.interventionId} className="flex items-start gap-2.5">
                    <span
                      className={`mt-[6px] h-2 w-2 flex-none rounded-full ${r.caseStatus === "open" ? "bg-[#2C7BF2]" : "bg-line2"}`}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-extrabold text-ink">
                        {r.action} — {r.studentName}
                      </div>
                      {r.note && <div className="mt-0.5 text-[12px] leading-relaxed text-[#4A5460]">{r.note}</div>}
                      <div className="mt-0.5 text-[10.5px] text-muted">
                        {personName(r.actorName)} · {new Date(r.occurredAt).toLocaleString("vi-VN")}
                        {r.caseStatus === "closed" ? " · hồ sơ đã đóng" : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </GvcnShell>
  );
}
