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
import { ArrivalTime, AttendanceBadge } from "./status-badge";

const CHOICES: TeacherAttendanceStatus[] = ["present", "late", "absent", "excused"];

/**
 * Nền của nút ĐANG CHỌN đổi 01/08/2026 — ba trong bốn nút không đạt 4,5:1.
 *
 * Đo lại theo công thức WCAG trên bản cũ (chữ trắng, chữ 11,5px/900):
 *   · "Có mặt"  trắng trên #00A85E = 3,15:1  ✗
 *   · "Có phép" trắng trên #2C7BF2 = 4,02:1  ✗
 *   · "Vắng"    trắng trên #E23A41 = 4,27:1  ✗
 *   · "Đi muộn" #4A3200 trên #F5A300 = 5,74:1 ✓ (nút duy nhất làm đúng)
 * DESIGN-GUIDELINES §11 ghi thẳng "không có ngoại lệ theo cỡ chữ".
 *
 * Cách sửa: giữ chữ trắng, hạ nền xuống ĐÚNG tông đậm mà bảng màu đã có sẵn và ba nút
 * này đang dùng làm màu chữ ở trạng thái tắt (#4EE39B · #FF8A8F · #35E0FF) — không chế
 * thêm màu mới. Đo lại sau khi đổi: 6,79:1 · 5,88:1 · 8,27:1.
 *
 * Vì sao đáng làm ngay chứ không xếp hàng chờ đợt tiếp cận: đây là đường ghi DUY NHẤT
 * chạm chuyên cần, và chữ trên nút đang chọn là thứ nói cho cô biết mình vừa chọn gì.
 * `tests/unit/a11y-man-nguoi-lon.test.ts` đo lại từ chính bảng này, không chép số.
 */
export const CHOICE_STYLE: Record<TeacherAttendanceStatus, { on: string; off: string }> = {
  present: { on: "bg-[#4EE39B] text-[#00301C]", off: "text-[#4EE39B] hover:bg-[#0C2E22]" },
  late: { on: "bg-[#F5A300] text-[#4A3200]", off: "text-gold-textDark hover:bg-[#3A2E08]" },
  absent: { on: "bg-[#FF8A8F] text-[#4A0D11]", off: "text-[#FF8A8F] hover:bg-[#3D141A]" },
  excused: { on: "bg-[#35E0FF] text-[#04303B]", off: "text-[#35E0FF] hover:bg-[#0E2647]" },
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
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
            <span className="msr text-[17px] text-caption" aria-hidden>
              calendar_month
            </span>
            {/* `aria-label` trên chính ô nhập, không phải một <span class="sr-only"> đứng
                cạnh: nhãn nay nói ĐỦ việc ô này làm — nó vừa chọn ngày để XEM lại vừa
                chọn ngày sẽ GHI vào. Đo trên bản cũ: ô cao 21px, rộng 111px (§11 và WCAG
                2.5.5 đòi 44px). Khung <label> bọc ngoài đã khai 44px, nhưng phần bấm được
                thật của một `input[type=date]` là chính nó — trên iOS chạm vào khoảng
                trống của khung không mở được bộ chọn ngày. */}
            <input
              type="date"
              value={onDate}
              max={toLocalIsoDate(new Date())}
              onChange={(e) => switchDate(e.target.value)}
              aria-label="Ngày điểm danh — chọn ngày cần xem hoặc ghi"
              className="min-h-[44px] bg-transparent text-[12.5px] font-extrabold text-cardtitle2 outline-none"
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
          // CẮT vế "Chỉ giáo viên chủ nhiệm mới ghi được điểm danh hộ" — tiêu đề ngay
          // trên đã nói người này chưa được phân công chủ nhiệm.
          hint="Phân công do văn phòng nhập."
        />
      )}
      {bodyState === "empty" && (
        <EmptyState
          icon="group_off"
          title="Lớp này chưa có học sinh nào"
          hint="Sổ ghi danh của lớp chưa có em nào."
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
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10.5px] font-black uppercase tracking-wide text-muted">Đang lưu</span>
                    <span>
                      <AttendanceBadge status={s.status} />
                      <ArrivalTime status={s.status} checkedInAt={s.checkedInAt} source={s.source} />
                    </span>
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
                  {/* `scope="col"`: không có nó, trình đọc màn hình không nối được ô với
                      tiêu đề cột nào — mà bảng này có ba cột nói ba chuyện khác hẳn nhau
                      ("Đang lưu" là dữ liệu cũ, "Thầy cô ghi" là bản nháp sắp ghi đè). */}
                  <tr className="border-b border-line">
                    <th scope="col" className="px-4 py-3 text-[10.5px] font-black uppercase tracking-wide text-muted">
                      Học sinh
                    </th>
                    <th scope="col" className="px-4 py-3 text-[10.5px] font-black uppercase tracking-wide text-muted">
                      Đang lưu
                    </th>
                    <th scope="col" className="px-4 py-3 text-[10.5px] font-black uppercase tracking-wide text-muted">
                      Thầy cô ghi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const picked = draft[s.studentId] ?? null;
                    const changed = picked !== null && picked !== s.status;
                    return (
                      <tr key={s.studentId} className="border-b border-[#12244A] last:border-0">
                        <td className="px-4 py-3">
                          <div className="text-[13px] font-extrabold text-ink">{s.fullName}</div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-[11px] tabular-nums text-muted">{s.studentCode}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <AttendanceBadge status={s.status} />
                          <ArrivalTime status={s.status} checkedInAt={s.checkedInAt} source={s.source} />
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
              <div className="text-[13px] font-black text-cardtitle" aria-live="polite" aria-atomic="true">
                {changes.length === 0
                  ? "Chưa có thay đổi nào để lưu"
                  : `${changes.length} em sẽ được ghi lại`}
              </div>
              {/* GỠ 06/08/2026 — chủ đầu tư chỉ đích danh câu "Chỉ những em thầy cô vừa
                  chọn mới được ghi. Bấm hai lần cùng một nội dung không tạo bản ghi thứ hai."
                  Vế MỘT đã do thiết kế nói, và nói chính xác hơn chữ: thẻ/dòng của em có
                  thay đổi mang viền navy, và con số ngay trên đây đếm đúng số em sắp ghi
                  ("N em sẽ được ghi lại", có `aria-live` nên tai cũng nghe).
                  Vế HAI là idempotency — cơ chế máy móc, đúng thứ luật cắt gọi tên. Nó
                  không mất: `markAttendance` vẫn upsert theo khoá duy nhất, và
                  `tests/db` vẫn canh gọi hai lần không sinh dòng thứ hai. */}
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
                : `border-line bg-card ${CHOICE_STYLE[choice].off}`
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
