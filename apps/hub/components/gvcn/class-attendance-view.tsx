// apps/hub/components/gvcn/class-attendance-view.tsx — màn "Điểm danh lớp".
//
// Đây là màn GHI duy nhất chạm chuyên cần. Ba quyết định đáng ghi lại:
//
//  1. BẢN NHÁP TRƯỚC, GỬI SAU. Mỗi ô bấm chỉ đổi trạng thái trong bộ nhớ trình duyệt;
//     phải bấm "Lưu điểm danh" mới ghi. Ghi ngay từng ô nghe có vẻ tiện hơn, nhưng nó
//     bắn 40 request rời rạc trong 30 giây và không có bước nào để cô nhìn lại toàn
//     bảng trước khi chốt — mà đây là dữ liệu chuyên cần, thứ sẽ đi vào học bạ.
//  2. CHỈ GỬI EM CÓ THAY ĐỔI. Gửi cả lớp mỗi lần lưu thì lần lưu thứ hai ghi đè cả
//     những dòng do máy/em tự tạo mà cô không hề đụng tới.
//  3. "Chưa điểm danh" KHÔNG mặc định thành "Vắng". Im lặng không phải kết luận
//     (RULES Rev F điều 8) — ô trống vẫn là ô trống cho tới khi con người chọn.
"use client";

import { useMemo, useState } from "react";
import type { ClassRosterEntry, TeacherAttendanceStatus } from "@hub/core/contracts";
import { ATTENDANCE_STATUS_LABEL } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { toLocalIsoDate } from "@/lib/date";
import { useIsDesktop } from "@/lib/viewport";
import { EmptyState, ErrorState, LoadingState, MutationError, MutationSuccess } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { ClassPicker, useSelectedClass } from "./class-picker";
import { Card, GvcnShell } from "./gvcn-shell";
import { AttendanceBadge, MoodChip } from "./status-badge";

const CHOICES: TeacherAttendanceStatus[] = ["present", "late", "absent", "excused"];

const CHOICE_STYLE: Record<TeacherAttendanceStatus, { on: string; off: string }> = {
  present: { on: "bg-[#00A85E] text-white", off: "text-[#00693F] hover:bg-[#E3F8ED]" },
  late: { on: "bg-[#F5A300] text-[#4A3200]", off: "text-gold-textDark hover:bg-[#FFF1C9]" },
  absent: { on: "bg-[#E23A41] text-white", off: "text-[#C0272D] hover:bg-[#FFF0F0]" },
  excused: { on: "bg-[#2C7BF2] text-white", off: "text-[#1D4E8F] hover:bg-[#E2F0FC]" },
};

export function ClassAttendanceView({ displayName, email }: { displayName: string; email: string }) {
  const utils = trpc.useUtils();
  const [onDate, setOnDate] = useState(() => toLocalIsoDate(new Date()));
  const [draft, setDraft] = useState<Record<string, TeacherAttendanceStatus>>({});

  const classesQuery = trpc.care.getMyClasses.useQuery();
  const { classId, classCode, select } = useSelectedClass(classesQuery.data?.classes);

  const rosterQuery = trpc.care.getClassRoster.useQuery(
    { classId: classId ?? undefined, onDate },
    { enabled: classId !== null },
  );

  const markAttendance = trpc.care.markAttendance.useMutation({
    onSuccess: () => {
      setDraft({});
      utils.care.getClassRoster.invalidate();
      utils.care.getDashboard.invalidate();
    },
  });

  const students: ClassRosterEntry[] = useMemo(() => rosterQuery.data?.students ?? [], [rosterQuery.data]);

  /** Chỉ những em có ô nháp KHÁC trạng thái đang lưu — xem lý do 2 ở đầu file. */
  const changes = useMemo(
    () =>
      students
        .filter((s) => draft[s.studentId] && draft[s.studentId] !== s.status)
        .map((s) => ({ studentId: s.studentId, status: draft[s.studentId] as TeacherAttendanceStatus })),
    [students, draft],
  );

  function switchClass(next: string) {
    // Đổi lớp mà giữ bản nháp là mang trạng thái lớp này dán sang lớp khác.
    setDraft({});
    select(next);
  }

  function switchDate(next: string) {
    setDraft({});
    setOnDate(next);
  }

  /** Bấm lại đúng ô đang chọn = bỏ chọn, trả về "chưa ghi gì" (xem lý do 3 đầu file). */
  function toggle(studentId: string, choice: TeacherAttendanceStatus) {
    setDraft((d) => {
      if (d[studentId] === choice) {
        const { [studentId]: _removed, ...rest } = d;
        return rest;
      }
      return { ...d, [studentId]: choice };
    });
  }

  const bodyState = pickState(classesQuery, rosterQuery, students.length);
  // Dựng MỘT nhánh, không dựng hai rồi ẩn bằng CSS (lib/viewport.ts giải thích dài). Ở màn
  // này cái giá cụ thể hơn mọi màn khác: một lớp 40 em × 4 nút trạng thái = 160 nút mỗi
  // nhánh. `md:hidden` sẽ dựng 320 nút rồi giấu một nửa, và React đối chiếu lại cả 320 sau
  // MỖI cú bấm của cô — trên đúng chiếc điện thoại đang được cầm giữa lớp.
  const isDesktop = useIsDesktop();

  return (
    <GvcnShell
      active="attendance"
      title="Điểm danh lớp"
      subtitle={
        rosterQuery.data
          ? `${classLabel(rosterQuery.data.className)} · ${students.length} học sinh`
          : undefined
      }
      displayName={displayName}
      email={email}
      classCode={classCode}
      toolbar={
        <div className="flex flex-wrap items-center gap-2.5">
          <ClassPicker
            classes={classesQuery.data?.classes ?? []}
            selectedId={classId}
            onSelect={switchClass}
          />
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
            <span className="msr text-[17px] text-caption" aria-hidden>
              calendar_month
            </span>
            <span className="sr-only">Ngày điểm danh</span>
            <input
              type="date"
              value={onDate}
              max={toLocalIsoDate(new Date())}
              onChange={(e) => switchDate(e.target.value)}
              className="bg-transparent text-[12.5px] font-extrabold text-[#33507C] outline-none"
            />
          </label>
        </div>
      }
    >
      {bodyState === "loading" && <LoadingState label="Đang tải danh sách lớp…" />}
      {bodyState === "classes-error" && (
        <ErrorState error={classesQuery.error} label="danh sách lớp" onRetry={() => classesQuery.refetch()} />
      )}
      {bodyState === "roster-error" && (
        <ErrorState error={rosterQuery.error} label="bảng điểm danh" onRetry={() => rosterQuery.refetch()} />
      )}
      {bodyState === "no-class" && (
        <EmptyState
          icon="school"
          title="Thầy cô chưa được phân công chủ nhiệm lớp nào"
          hint="Chỉ giáo viên chủ nhiệm mới ghi được điểm danh hộ. Phân công do văn phòng nhập."
        />
      )}
      {bodyState === "empty" && (
        <EmptyState
          icon="group_off"
          title="Lớp này chưa có học sinh nào"
          hint="Không có em nào trong sổ ghi danh của lớp — chưa có gì để điểm danh."
        />
      )}

      {bodyState === "ready" && (
        <>
          {/* ── DƯỚI md: một thẻ / một em, KHÔNG bảng ──────────────────────────────
              Vì sao đổi (01/08/2026): bảng cũ khai `min-w-[600px]` trong một ô cuộn
              ngang. Trên máy 360px nghĩa là phải kéo 240px sang phải mới tới cột thao
              tác — mà cột tên là cột ĐẦU TIÊN và không có `sticky left-0`. Cô đứng
              trong lớp bấm trạng thái trong khi tên em đã trôi khỏi màn hình: đúng loại
              sai "trông như thật" mà chính file này chống ở hai chỗ khác (bản nháp
              trước khi gửi, chỉ gửi em có thay đổi). Dữ liệu chuyên cần sai vì bấm
              nhầm dòng thì không có gì trên màn hình báo cho ai biết.
              Từ md trở lên bảng ba cột vẫn là dạng đúng — mắt dò theo cột nhanh hơn. */}
          {!isDesktop && (
          <div className="flex flex-col gap-2.5">
            {students.map((s) => {
              const picked = draft[s.studentId] ?? null;
              const changed = picked !== null && picked !== s.status;
              return (
                <Card key={s.studentId} className={changed ? "border-[1.5px] border-navy" : ""}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13.5px] font-extrabold text-ink">{s.fullName}</span>
                    <span className="text-[11px] tabular-nums text-muted">{s.studentCode}</span>
                    <MoodChip mood={s.mood} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10.5px] font-black uppercase tracking-wide text-muted">Đang lưu</span>
                    <AttendanceBadge status={s.status} />
                  </div>
                  <div className="mt-2.5">
                    <StatusPicker
                      studentName={s.fullName}
                      picked={picked}
                      changed={changed}
                      onPick={(choice) => toggle(s.studentId, choice)}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
          )}

          {isDesktop && (
          <Card className="p-0 md:p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-[10.5px] font-black uppercase tracking-wide text-muted">
                      Học sinh
                    </th>
                    <th className="px-4 py-3 text-[10.5px] font-black uppercase tracking-wide text-muted">
                      Đang lưu
                    </th>
                    <th className="px-4 py-3 text-[10.5px] font-black uppercase tracking-wide text-muted">
                      Thầy cô ghi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const picked = draft[s.studentId] ?? null;
                    const changed = picked !== null && picked !== s.status;
                    return (
                      <tr key={s.studentId} className="border-b border-[#F1F4F8] last:border-0">
                        <td className="px-4 py-3">
                          <div className="text-[13px] font-extrabold text-ink">{s.fullName}</div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-[11px] tabular-nums text-muted">{s.studentCode}</span>
                            <MoodChip mood={s.mood} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <AttendanceBadge status={s.status} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusPicker
                            studentName={s.fullName}
                            picked={picked}
                            changed={changed}
                            onPick={(choice) => toggle(s.studentId, choice)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          )}

          <Card className="sticky bottom-0 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-[220px]">
              {/* aria-live: con số này đổi sau MỖI cú bấm mà không có gì chuyển động trên
                  màn hình ngoài chính nó. Người dùng bàn phím / trình đọc màn hình bấm
                  bốn ô liền rồi bấm "Lưu điểm danh" mà không hề nghe mình sắp ghi mấy em. */}
              <div className="text-[13px] font-black text-navy" aria-live="polite" aria-atomic="true">
                {changes.length === 0
                  ? "Chưa có thay đổi nào để lưu"
                  : `${changes.length} em sẽ được ghi lại`}
              </div>
              <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                Chỉ những em thầy cô vừa chọn mới được ghi. Bấm hai lần cùng một nội dung không tạo bản ghi
                thứ hai.
              </div>
            </div>
            {markAttendance.error && <MutationError error={markAttendance.error} />}
            {markAttendance.isSuccess && changes.length === 0 && (
              <MutationSuccess>
                Đã lưu {markAttendance.data?.applied ?? 0} em
                {(markAttendance.data?.skipped ?? 0) > 0 ? ` · ${markAttendance.data?.skipped} em bị bỏ qua` : ""}
              </MutationSuccess>
            )}
            <button
              type="button"
              disabled={changes.length === 0 || markAttendance.isPending || classId === null}
              onClick={() => {
                if (classId === null || changes.length === 0) return;
                markAttendance.mutate({ classId, occurredOn: onDate, entries: changes });
              }}
              className="min-h-[44px] flex-none rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)] disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
            >
              {markAttendance.isPending ? "Đang lưu…" : "Lưu điểm danh"}
            </button>
          </Card>
        </>
      )}
    </GvcnShell>
  );
}

/**
 * Bốn nút trạng thái của MỘT em. Dùng chung cho thẻ mobile và ô bảng desktop — chép làm
 * hai bản là bảo đảm sau ba lần sửa thì hai khổ màn ghi ra hai kiểu dữ liệu khác nhau.
 *
 * Hai con số ở đây là luật, không phải thẩm mỹ (sửa 01/08/2026):
 *
 *   · `min-h-[44px]` — bản cũ là `px-3 py-2 text-[11.5px]`, tức 8+8 padding cộng hộp dòng
 *     của chữ 11,5px ở line-height:normal ≈ 31px. §11 và WCAG 2.5.5 đòi 44px. Đây là
 *     đường ghi DUY NHẤT chạm chuyên cần — thứ sẽ đi vào học bạ.
 *
 *   · `gap-1` thay cho `inline-flex overflow-hidden` — bốn nút cũ dính liền nhau, không
 *     một pixel nào ngăn cách. Bấm trượt 2mm là rơi thẳng sang trạng thái bên cạnh:
 *     "Có mặt" → "Đi muộn", "Vắng" → "Có phép". Với vùng chạm 31px và ngón cái của một
 *     người đang đứng giữa lớp ồn, "trượt" không phải trường hợp hiếm.
 *
 * Viền khung bọc (đổi theo `changed`) chuyển thành viền của từng nút đang chọn cộng một
 * dấu chấm nhỏ: khung chung không còn vì các nút đã tách rời.
 */
function StatusPicker({
  studentName,
  picked,
  changed,
  onPick,
}: {
  studentName: string;
  picked: TeacherAttendanceStatus | null;
  changed: boolean;
  onPick: (choice: TeacherAttendanceStatus) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Điểm danh ${studentName}`}
      className="flex flex-wrap items-center gap-1"
    >
      {CHOICES.map((choice) => {
        const on = picked === choice;
        return (
          <button
            key={choice}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(choice)}
            className={`min-h-[44px] rounded-xl border px-3 py-2 text-[11.5px] font-black transition-colors ${
              on
                ? `${CHOICE_STYLE[choice].on} ${changed ? "border-navy" : "border-transparent"}`
                : `border-line bg-white ${CHOICE_STYLE[choice].off}`
            }`}
          >
            {ATTENDANCE_STATUS_LABEL[choice]}
          </button>
        );
      })}
    </div>
  );
}

type BodyState = "loading" | "classes-error" | "no-class" | "roster-error" | "empty" | "ready";

/**
 * Một chỗ duy nhất quyết định "màn hình đang ở trạng thái nào". Viết rải rác bằng
 * chuỗi `? :` lồng nhau là cách hai nhánh cùng đúng (hoặc cùng sai) mà không ai thấy.
 */
function pickState(
  classesQuery: { isPending: boolean; error: unknown; data?: { classes: unknown[] } },
  rosterQuery: { isPending: boolean; error: unknown },
  studentCount: number,
): BodyState {
  if (classesQuery.isPending) return "loading";
  if (classesQuery.error) return "classes-error";
  if ((classesQuery.data?.classes.length ?? 0) === 0) return "no-class";
  if (rosterQuery.error) return "roster-error";
  if (rosterQuery.isPending) return "loading";
  if (studentCount === 0) return "empty";
  return "ready";
}
