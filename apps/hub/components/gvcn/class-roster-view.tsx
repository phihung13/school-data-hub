// apps/hub/components/gvcn/class-roster-view.tsx — màn "Lớp chủ nhiệm".
//
// Đây là màn ĐỌC: danh sách em trong lớp, mỗi em một dòng, kèm những tín hiệu có thật
// hôm nay (điểm danh + giờ em bấm · đang có hồ sơ chăm sóc mở). KHÔNG có nút hành động
// nào ở đây — hành động nằm ở ba màn còn lại. Trộn "xem" với "sửa" trên cùng một bảng
// 40 dòng là cách sinh ra những cú bấm nhầm không ai phát hiện.
//
// Ba trạng thái bắt buộc (gói "frontend-trang-thai"): đang tải · lỗi · rỗng. Không màn
// nào của Hub được phép trắng.
//
// Cột "Tâm trạng" bị gỡ 01/08/2026 ([QĐ-1], ADR-026): GVCN không còn đọc được nhật ký
// cảm xúc. Thay vào chỗ đó KHÔNG phải một cột trống — là GIỜ EM BẤM dưới huy hiệu trạng
// thái, cộng một câu dưới bảng nói thẳng vì sao không có nhãn "đi sớm" ([QĐ-3]).
"use client";

import Link from "next/link";
import { ARRIVAL_BAND_UNAVAILABLE_NOTE } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { useIsDesktop } from "@/lib/viewport";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { ClassPicker, useSelectedClass } from "./class-picker";
import { Card, GvcnShell } from "./gvcn-shell";
import { ArrivalTime, AttendanceBadge } from "./status-badge";

export function ClassRosterView({ displayName, email }: { displayName: string; email: string }) {
  // Dựng MỘT nhánh theo khổ màn, không dựng hai rồi ẩn bằng CSS — cùng lý do đã ghi ở
  // class-attendance-view.tsx và lib/viewport.ts: cây bị `md:hidden` vẫn nằm trong DOM,
  // vẫn được React đối chiếu, vẫn đi trong HTML gửi xuống điện thoại của cô.
  const isDesktop = useIsDesktop();
  const classesQuery = trpc.care.getMyClasses.useQuery();
  const { classId, classCode, select } = useSelectedClass(classesQuery.data?.classes);

  // `enabled` chờ có lớp thật: gửi query khi chưa biết lớp thì máy chủ tự chọn hộ, và
  // lần render sau lớp lại đổi trước mắt người dùng.
  const rosterQuery = trpc.care.getClassRoster.useQuery(
    { classId: classId ?? undefined },
    { enabled: classId !== null },
  );

  const students = rosterQuery.data?.students ?? [];
  const present = students.filter((s) => s.status === "present" || s.status === "late").length;

  return (
    <GvcnShell
      active="klass"
      title="Lớp chủ nhiệm"
      subtitle={
        rosterQuery.data
          ? `${classLabel(rosterQuery.data.className)} · ${students.length} học sinh · ${present} em đã có mặt`
          : undefined
      }
      displayName={displayName}
      email={email}
      classCode={classCode}
      toolbar={
        <ClassPicker classes={classesQuery.data?.classes ?? []} selectedId={classId} onSelect={select} />
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
          // CẮT vế "Khi có lớp, mục này sẽ tự hiện danh sách" — tả hành vi hiển nhiên.
          hint="Phân công chủ nhiệm do văn phòng nhập."
        />
      ) : rosterQuery.isPending ? (
        <LoadingState label="Đang tải danh sách lớp…" />
      ) : rosterQuery.error ? (
        <ErrorState error={rosterQuery.error} label="danh sách lớp" onRetry={() => rosterQuery.refetch()} />
      ) : students.length === 0 ? (
        <EmptyState
          icon="group_off"
          title="Lớp này chưa có học sinh nào"
          // CẮT vế "không phải lỗi tải dữ liệu" (06/08/2026): lỗi tải KHÔNG bao giờ đi
          // tới nhánh này — `rosterQuery.error` có ErrorState riêng ngay phía trên, với
          // icon và nút thử lại. Câu cũ phòng một hiểu nhầm mà thiết kế đã chặn.
          hint="Sổ ghi danh của trường chưa có em nào trong lớp này."
        />
      ) : (
        <>
          {/* ── DƯỚI md: MỘT THẺ MỘT EM, không bảng ────────────────────────────────
              Bê nguyên mẫu đã chạy ở class-attendance-view.tsx, vì đây đúng là lỗi đó:
              bảng khai `min-w-[560px]` trong một ô `overflow-x-auto`, mà cột TÊN là cột
              đầu tiên và không có `sticky left-0`. Trên máy 360px, kéo sang phải để đọc
              cột "Chăm sóc" là tên em đã trôi khỏi màn hình — cô đọc "Cần gặp thầy cô"
              mà không biết của em nào. Ở màn ĐỌC thì cái giá không phải là dữ liệu sai,
              nhưng nó là bước đầu của cùng một chuỗi: cô nhớ nhầm tên rồi mở đúng bốn
              màn ghi ở bên cạnh.
              Từ md trở lên bảng bốn cột vẫn là dạng đúng — mắt dò theo cột nhanh hơn. */}
          {!isDesktop && (
            <div className="flex flex-col gap-2.5">
              {students.map((s) => (
                <Card key={s.studentId}>
                  <StudentNameLink studentId={s.studentId} fullName={s.fullName} />
                  {/* tabular-nums: mã học sinh xếp thẳng cột thì mắt dò nhanh hơn hẳn. */}
                  <div className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-muted">
                    {s.studentCode}
                  </div>
                  <div className="mt-2">
                    <AttendanceBadge status={s.status} />
                    <ArrivalTime status={s.status} checkedInAt={s.checkedInAt} source={s.source} />
                  </div>
                  <div className="mt-2">
                    <CareChips helpPending={s.helpPending} hasOpenCase={s.hasOpenCase} />
                  </div>
                </Card>
              ))}
              <GhiChuGioBam className="px-1" />
            </div>
          )}

          {isDesktop && (
            <Card className="p-0 md:p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      <Th>Học sinh</Th>
                      <Th>Mã học sinh</Th>
                      <Th>Điểm danh hôm nay</Th>
                      <Th>Chăm sóc</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.studentId} className="border-b border-[#F1F4F8] last:border-0">
                        <td className="px-4 py-3">
                          <StudentNameLink studentId={s.studentId} fullName={s.fullName} />
                        </td>
                        <td className="px-4 py-3 text-[12px] font-semibold tabular-nums text-muted">
                          {s.studentCode}
                        </td>
                        <td className="px-4 py-3">
                          <AttendanceBadge status={s.status} />
                          <ArrivalTime status={s.status} checkedInAt={s.checkedInAt} source={s.source} />
                        </td>
                        <td className="px-4 py-3">
                          <CareChips helpPending={s.helpPending} hasOpenCase={s.hasOpenCase} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* MỘT lần, dưới bảng, không lặp lại ở từng dòng: [QĐ-3] đòi năm trạng thái mà
                  dữ liệu chỉ đỡ nổi bốn. Nói thẳng chỗ hụt còn hơn phong cho một cột giờ cái
                  tên "đi sớm" mà nó không mang nổi. Lý do đầy đủ nằm trong chính hằng số. */}
              <GhiChuGioBam className="border-t border-line px-4 py-3" />
            </Card>
          )}
        </>
      )}
    </GvcnShell>
  );
}

/**
 * Vì sao cột giờ không có nhãn "đi sớm" ([QĐ-3]) — GẤP LẠI, KHÔNG CẮT (06/08/2026).
 *
 * `ARRIVAL_BAND_UNAVAILABLE_NOTE` là hai câu, 187 ký tự: ở 360px nó chiếm bốn dòng dưới
 * một bảng mà thứ người ta tới đọc là các dòng học sinh. Chủ đầu tư: "loại bỏ tất cả các
 * chữ giải thích bé bé kia, không đáng để tôi đọc".
 *
 * KHÔNG được xoá: đó là lời thú nhận một chỗ hụt dữ liệu thật, và hằng số nằm trong
 * `contracts` (ngoài phạm vi gói này) nên câu chữ giữ nguyên từng ký tự. Nó chuyển vào
 * `<details>` theo đúng mẫu `ScopeNotice` của `tam-ly-shell.tsx`: một dòng tóm tắt trên
 * mặt màn, phần còn lại chỉ hiện khi có người muốn đọc. `<details>/<summary>` là phần tử
 * gốc — bàn phím tới được, trình đọc màn hình đọc được trạng thái đóng/mở, không cần một
 * dòng JavaScript. `min-h-[44px]` vì `<summary>` là đích bấm (§11 · WCAG 2.5.5).
 */
function GhiChuGioBam({ className = "" }: { className?: string }) {
  return (
    <details className={`text-[11px] leading-relaxed text-muted ${className}`}>
      <summary className="flex min-h-[44px] cursor-pointer items-center font-bold">
        Bảng hiện giờ em bấm, không có nhãn “đi sớm”
        <span className="ml-1 font-black text-link">— vì sao?</span>
      </summary>
      <p className="mt-1.5">{ARRIVAL_BAND_UNAVAILABLE_NOTE}</p>
    </details>
  );
}

/**
 * Tên em = ĐƯỜNG VÀO hồ sơ của em (/gvcn/hoc-sinh/<id>).
 *
 * Grep toàn `apps/hub` ngày 05/08/2026: trang đó có page.tsx thật nhưng KHÔNG một
 * `href` nào trong app trỏ tới — vào được duy nhất bằng cách gõ URL. Với người dùng,
 * một màn hình không có lối vào thì nó không tồn tại, và cái hỏng đó không kêu một
 * tiếng nào (chính là chuyện `tests/unit/nav-links.test.ts` đã ghim cho /dieu-hanh).
 *
 * Tên là đích đúng chứ không phải một nút "Xem" thêm vào cuối dòng: cái tên chính là
 * thứ cô đang tìm khi mở màn này, và nó có sẵn ở cả hai khổ màn.
 * `min-h-[44px]` + `inline-flex` — padding trên một <a> nội tuyến KHÔNG cộng lên chiều
 * cao phần tử (§11, WCAG 2.5.5; đúng lỗi đã đo ở link "Về trang chủ", 81×19px).
 */
function StudentNameLink({ studentId, fullName }: { studentId: string; fullName: string }) {
  return (
    <Link
      href={`/gvcn/hoc-sinh/${studentId}`}
      className="inline-flex min-h-[44px] items-center text-[13px] font-extrabold text-link underline underline-offset-2"
    >
      {fullName}
    </Link>
  );
}

/** Hai tín hiệu chăm sóc của một em — dùng chung cho thẻ điện thoại và ô bảng. */
function CareChips({ helpPending, hasOpenCase }: { helpPending: boolean; hasOpenCase: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {helpPending && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0F0] px-2.5 py-1 text-[10.5px] font-black text-[#C0272D]">
          <span className="msr text-[14px]" aria-hidden>
            pan_tool
          </span>
          Cần gặp thầy cô
        </span>
      )}
      {hasOpenCase && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF1C9] px-2.5 py-1 text-[10.5px] font-black text-gold-textDark">
          <span className="msr text-[14px]" aria-hidden>
            folder_open
          </span>
          Hồ sơ đang mở
        </span>
      )}
      {!helpPending && !hasOpenCase && <span className="text-[11.5px] text-muted">—</span>}
    </div>
  );
}

/** `scope="col"`: không có nó, trình đọc màn hình không nối được ô với tiêu đề cột nào. */
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 text-[10.5px] font-black uppercase tracking-wide text-muted">
      {children}
    </th>
  );
}
