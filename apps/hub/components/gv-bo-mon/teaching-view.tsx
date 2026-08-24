// apps/hub/components/gv-bo-mon/teaching-view.tsx — màn "Lớp tôi dạy".
//
// Màn ĐẦU TIÊN của vai `teacher` (giáo viên bộ môn). Trước 06/08/2026 vai này đăng nhập
// vào Hub và chỉ có `/home`.
//
// ── MÀN CHỈ ĐỌC. Không một nút ghi nào ─────────────────────────────────────
// Giáo viên bộ môn hôm nay không có policy nào cho ghi `attendance.checkins`
// (`checkins_insert_by_homeroom` / `checkins_update_by_homeroom`, 0030/0032 — chỉ GVCN).
// Dựng một nút "ghi điểm danh" ở đây là hứa một hành động mà máy chủ sẽ từ chối, hoặc tệ
// hơn: mở quyền ghi chuyên cần cho một vai mới bằng một gói dựng màn. Cần ADR trước.
//
// ── BA THỨ CỐ Ý KHÔNG CÓ TRÊN MÀN NÀY ──────────────────────────────────────
// Tâm trạng · cờ chăm sóc · lời "cần gặp thầy cô". Không phải quên: đo dưới phiên Thầy
// Nam ngày 06/08/2026 cho `mood` = 42501 permission denied, `care.flags` = 0 dòng,
// `attendance.help_requests` = 0 dòng. PRODUCT.md ghi thẳng với lời "cần gặp thầy cô":
// "Bạn cùng lớp, **thầy cô dạy môn**, thầy cô lớp khác, bố mẹ, BGH: không."
// Hợp đồng `TeachingRosterEntry` không mang những trường đó, nên chúng không có đường
// nào lọt lên đây; `tests/unit/gv-bo-mon-man-hinh.test.ts` quét lại chính file này.
//
// ── QĐ-3 SỐNG Ở HAI CHỖ TRÊN MÀN ───────────────────────────────────────────
// "Chưa ai ghi" ≠ "vắng", nên màn hình phải phân biệt được ở CẢ hai mức:
//   · mức lớp — ba ô số đếm riêng "đã điểm danh" / "vắng" / "chưa điểm danh". Không ô nào
//     là phần bù tính hộ của ô kia, để không ai gộp hai cái sau thành một.
//   · mức một em — `AttendanceBadge` vẽ `status = null` thành "Chưa điểm danh" với icon
//     riêng (`remove`), không phải "Vắng".
"use client";

import {
  ATTENDANCE_STATUS_ICON,
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_UNKNOWN_ICON,
  ATTENDANCE_UNKNOWN_LABEL,
} from "@hub/core/contracts";
import type { HubRole, TeachingClass } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { useIsDesktop } from "@/lib/viewport";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { ClassPicker, useSelectedClass } from "../gvcn/class-picker";
import { Card, GvcnShell } from "../gvcn/gvcn-shell";
import { AttendanceBadge } from "../gvcn/status-badge";

export function TeachingView({
  displayName,
  email,
  roles,
}: {
  displayName: string;
  email: string;
  /** Vai THẬT từ phiên — khung màn dựng menu trái và thanh tab từ đây, không đoán. */
  roles: HubRole[];
}) {
  // Dựng MỘT nhánh theo khổ màn, không dựng hai rồi ẩn bằng CSS: cây bị `md:hidden` vẫn
  // nằm trong DOM, vẫn được React đối chiếu, vẫn đi trong HTML gửi xuống điện thoại.
  // Cùng luật đã áp ở class-roster-view.tsx và class-attendance-view.tsx.
  const isDesktop = useIsDesktop();

  const classesQuery = trpc.teaching.getMyClasses.useQuery();
  const classes: TeachingClass[] = classesQuery.data?.classes ?? [];
  const { classId, classCode, select } = useSelectedClass(classes);

  // `enabled` chờ có lớp thật: gửi query khi chưa biết lớp thì máy chủ tự chọn hộ, và lần
  // render sau lớp lại đổi trước mắt người dùng.
  const rosterQuery = trpc.teaching.getRoster.useQuery(
    { classId: classId ?? undefined },
    { enabled: classId !== null },
  );

  const selected = classes.find((c) => c.classId === classId) ?? null;
  const students = rosterQuery.data?.students ?? [];

  return (
    <GvcnShell
      active="teaching"
      title="Lớp tôi dạy"
      subtitle={
        selected ? `${classLabel(selected.classCode)} · ${selected.studentCount} học sinh` : undefined
      }
      displayName={displayName}
      email={email}
      classCode={classCode}
      roles={roles}
      // Màn GỐC của vai bộ môn — không có buồng lái nào để quay về. Đường ra trên điện
      // thoại là thanh tab dưới đáy (Trang chủ + avatar có nút đăng xuất).
      backTo={null}
      toolbar={
        <ClassPicker
          classes={classes}
          selectedId={classId}
          onSelect={select}
          nhomLabel="Chọn lớp đang dạy"
        />
      }
    >
      {classesQuery.isPending ? (
        <LoadingState label="Đang tìm lớp của thầy cô…" />
      ) : classesQuery.error ? (
        <ErrorState error={classesQuery.error} label="danh sách lớp" onRetry={() => classesQuery.refetch()} />
      ) : classes.length === 0 ? (
        <EmptyState
          icon="school"
          title="Thầy cô chưa được phân công dạy lớp nào"
          hint="Phân công do văn phòng nhập."
        />
      ) : (
        <>
          {selected && <TinhHinhLop lop={selected} />}

          {rosterQuery.error ? (
            <ErrorState
              error={rosterQuery.error}
              label="danh sách học sinh"
              onRetry={() => rosterQuery.refetch()}
            />
          ) : rosterQuery.isPending ? (
            <LoadingState label="Đang tải danh sách học sinh…" />
          ) : students.length === 0 ? (
            <EmptyState
              icon="group_off"
              title="Lớp này chưa có học sinh nào"
              hint="Sổ ghi danh của trường chưa có em nào trong lớp này."
            />
          ) : (
            <>
              {/* ── DƯỚI md: MỘT THẺ MỘT EM, không bảng ───────────────────────────
                  Mẫu đã chạy ở class-attendance-view.tsx và class-roster-view.tsx, và lý
                  do là một lỗi đo được: bảng khai `min-w-…` trong ô `overflow-x-auto`,
                  cột TÊN là cột đầu và không `sticky left-0`. Trên máy 360px, kéo sang
                  phải để đọc trạng thái là tên em đã trôi khỏi màn hình. */}
              {!isDesktop && (
                <div className="flex flex-col gap-2.5">
                  {students.map((s) => (
                    <Card key={s.studentId}>
                      <div className="text-[13.5px] font-extrabold text-ink">{s.fullName}</div>
                      {/* tabular-nums: mã học sinh xếp thẳng cột thì mắt dò nhanh hơn hẳn. */}
                      <div className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-muted">
                        {s.studentCode}
                      </div>
                      <div className="mt-2">
                        <AttendanceBadge status={s.status} />
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {isDesktop && (
                <Card className="p-0 md:p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line">
                          <Th>Học sinh</Th>
                          <Th>Mã học sinh</Th>
                          <Th>Điểm danh hôm nay</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s) => (
                          <tr key={s.studentId} className="border-b border-[#12244A] last:border-0">
                            <td className="px-4 py-3 text-[13px] font-extrabold text-ink">{s.fullName}</td>
                            <td className="px-4 py-3 text-[12px] font-semibold tabular-nums text-muted">
                              {s.studentCode}
                            </td>
                            <td className="px-4 py-3">
                              <AttendanceBadge status={s.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </GvcnShell>
  );
}

/**
 * Ba con số của lớp đang xem — và ba con số này là chỗ QĐ-3 hạ cánh ở mức lớp.
 *
 * "Vắng" và "Chưa điểm danh" là HAI ô riêng, đếm từ hai trường riêng của hợp đồng
 * (`absentCount`, `noRecordCount`), không phải một ô rồi trừ ra. Gộp chúng — hoặc để màn
 * hình tự tính ô thứ hai — là cách một lớp chưa ai điểm danh hiện ra như một lớp vắng cả
 * lớp. PRODUCT.md: "chưa điểm danh ≠ vắng" là ràng buộc không thương lượng.
 *
 * Icon và chữ lấy từ contract (`ATTENDANCE_STATUS_ICON` / `_LABEL` / `_UNKNOWN_*`), không
 * chế lại ở đây: hai màn của cùng một người vẽ cùng một dữ liệu bằng hai bảng icon là lỗi
 * đã xảy ra thật hồi 01/08/2026.
 *
 * Ba cặp màu, đo theo công thức WCAG trên chính nền của chúng (§11 — không ngoại lệ theo
 * cỡ chữ, và đo trên mặt nền tệ nhất chứ không trên trắng):
 *   · `successText` #4EE39B trên `surface-success` #0C2E22 = 6,12:1
 *   · `dangerText`  #FF8A8F trên `surface-danger2` #3D141A = 4,79:1
 *   · `subtle`      #93A9C8 trên `chip`            #12244A = 4,93:1
 * Không mã hex mới — cả sáu giá trị đều là token đã có trong `tailwind.config.ts`.
 */
function TinhHinhLop({ lop }: { lop: TeachingClass }) {
  return (
    <div className="flex flex-wrap gap-2">
      <OSo
        icon="fact_check"
        nhan="Đã điểm danh"
        so={lop.recordedCount}
        className="bg-surface-success text-successText"
      />
      <OSo
        icon={ATTENDANCE_STATUS_ICON.absent}
        nhan={ATTENDANCE_STATUS_LABEL.absent}
        so={lop.absentCount}
        className="bg-surface-danger2 text-dangerText"
      />
      <OSo
        icon={ATTENDANCE_UNKNOWN_ICON}
        nhan={ATTENDANCE_UNKNOWN_LABEL}
        so={lop.noRecordCount}
        className="bg-chip text-subtle"
      />
    </div>
  );
}

/**
 * Một ô số. KHÔNG phải nút — màn này không có hành động nào, nên nó không được trông như
 * bấm được (§11: đích bấm giả là một lời hứa suông cho cả chuột lẫn bàn phím).
 *
 * Icon + chữ + số, ba tín hiệu cho cùng một nghĩa: màu một mình không mang nghĩa được
 * (§11), và ở đây cặp nguy hiểm đúng là xanh/đỏ — khoảng 1/12 nam giới không phân biệt.
 */
function OSo({
  icon,
  nhan,
  so,
  className,
}: {
  icon: string;
  nhan: string;
  so: number;
  className: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 rounded-xl px-3 py-2 ${className}`}>
      <span className="msr text-[17px]" aria-hidden>
        {icon}
      </span>
      <span className="text-[15px] font-black tabular-nums">{so}</span>
      <span className="text-[11.5px] font-extrabold">{nhan}</span>
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
