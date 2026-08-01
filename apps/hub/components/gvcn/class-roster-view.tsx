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

import { ARRIVAL_BAND_UNAVAILABLE_NOTE } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { ClassPicker, useSelectedClass } from "./class-picker";
import { Card, GvcnShell } from "./gvcn-shell";
import { ArrivalTime, AttendanceBadge } from "./status-badge";

export function ClassRosterView({ displayName, email }: { displayName: string; email: string }) {
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
          hint="Phân công chủ nhiệm do văn phòng nhập. Khi có lớp, mục này sẽ tự hiện danh sách."
        />
      ) : rosterQuery.isPending ? (
        <LoadingState label="Đang tải danh sách lớp…" />
      ) : rosterQuery.error ? (
        <ErrorState error={rosterQuery.error} label="danh sách lớp" onRetry={() => rosterQuery.refetch()} />
      ) : students.length === 0 ? (
        <EmptyState
          icon="group_off"
          title="Lớp này chưa có học sinh nào"
          hint="Danh sách lớp đến từ sổ ghi danh của trường. Trống ở đây nghĩa là sổ chưa có em nào, không phải lỗi tải dữ liệu."
        />
      ) : (
        <Card className="p-0 md:p-0">
          {/* Bảng cuộn NGANG trong khung riêng: trên điện thoại, để cả trang trôi ngang
              là mất luôn cột tên khi kéo. */}
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
                    <td className="px-4 py-3 text-[13px] font-extrabold text-ink">{s.fullName}</td>
                    {/* tabular-nums: mã học sinh xếp thẳng cột thì mắt dò nhanh hơn hẳn. */}
                    <td className="px-4 py-3 text-[12px] font-semibold tabular-nums text-muted">{s.studentCode}</td>
                    <td className="px-4 py-3">
                      <AttendanceBadge status={s.status} />
                      <ArrivalTime status={s.status} checkedInAt={s.checkedInAt} source={s.source} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {s.helpPending && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0F0] px-2.5 py-1 text-[10.5px] font-black text-[#C0272D]">
                            <span className="msr text-[14px]" aria-hidden>
                              pan_tool
                            </span>
                            Cần gặp thầy cô
                          </span>
                        )}
                        {s.hasOpenCase && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF1C9] px-2.5 py-1 text-[10.5px] font-black text-gold-textDark">
                            <span className="msr text-[14px]" aria-hidden>
                              folder_open
                            </span>
                            Hồ sơ đang mở
                          </span>
                        )}
                        {!s.helpPending && !s.hasOpenCase && <span className="text-[11.5px] text-muted">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* MỘT lần, dưới bảng, không lặp lại ở từng dòng: [QĐ-3] đòi năm trạng thái mà
              dữ liệu chỉ đỡ nổi bốn. Nói thẳng chỗ hụt còn hơn phong cho một cột giờ cái
              tên "đi sớm" mà nó không mang nổi. Lý do đầy đủ nằm trong chính hằng số. */}
          <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
            {ARRIVAL_BAND_UNAVAILABLE_NOTE}
          </p>
        </Card>
      )}
    </GvcnShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-[10.5px] font-black uppercase tracking-wide text-muted">{children}</th>;
}
