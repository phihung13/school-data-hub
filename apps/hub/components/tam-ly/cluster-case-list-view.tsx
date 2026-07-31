// apps/hub/components/tam-ly/cluster-case-list-view.tsx — hộp việc của tâm lý cụm.
//
// Câu hỏi màn này trả lời, đúng một câu: "hôm nay ai đang chờ tôi?". Trước gói việc này
// vai tâm lý cụm đăng nhập vào Hub là ngõ cụt — trong khi cô GHI được ba thứ nặng nhất
// của hệ chăm sóc (tắt cờ khẩn, ghi can thiệp, đóng hồ sơ của một đứa trẻ).
//
// BA TRẠNG THÁI RỖNG KHÁC NHAU, và màn này phải phân biệt cả ba — gộp lại là tái phạm
// đúng lỗi "im lặng bị đọc thành kết luận":
//   1. chưa tải xong          → vòng quay
//   2. hỏng / không có quyền  → ErrorState (icon theo đúng loại lỗi)
//   3. tải xong mà rỗng       → còn tách làm hai: "chưa được gán cơ sở nào" (không có
//      phạm vi để nhìn) khác hẳn "cụm đang yên" (có phạm vi, không có tín hiệu nào).
"use client";

import Link from "next/link";
import { HELP_REQUEST_TOPIC_LABEL, HELP_REQUEST_URGENCY_LABEL } from "@hub/core/contracts";
import type { ClusterCaseRow } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { Card, ScopeNotice, TamLyShell } from "./tam-ly-shell";

/** "Chưa ai làm gì" ≠ "vừa làm hôm nay" — hai câu khác nhau cho hai sự thật khác nhau. */
export function lastActionLabel(row: Pick<ClusterCaseRow, "daysSinceLastAction">): string {
  if (row.daysSinceLastAction === null) return "Chưa ai ghi hành động nào";
  if (row.daysSinceLastAction === 0) return "Có hành động hôm nay";
  return `${row.daysSinceLastAction} ngày chưa có hành động`;
}

/** Loại tín hiệu khẩn, gọn thành một dòng. KHÔNG có nội dung lời em viết (xem ScopeNotice). */
export function helpSignalLabel(
  row: Pick<ClusterCaseRow, "helpTopic" | "helpUrgency">,
): string {
  const parts = [
    row.helpTopic ? HELP_REQUEST_TOPIC_LABEL[row.helpTopic] : null,
    row.helpUrgency ? HELP_REQUEST_URGENCY_LABEL[row.helpUrgency] : null,
  ].filter((p): p is string => p !== null);
  // Em bấm nút "cần giúp" kiểu cũ thì cả hai cột đều NULL — nói đúng chừng đó.
  return parts.length > 0 ? parts.join(" · ") : "Không ghi loại";
}

function Pill({
  tone,
  icon,
  children,
}: {
  tone: "urgent" | "open" | "quiet" | "calm";
  icon: string;
  children: React.ReactNode;
}) {
  // Màu KHÔNG bao giờ là tín hiệu duy nhất (§11): mỗi viên đều có icon và chữ.
  const cls =
    tone === "urgent"
      ? "bg-[#FFF0F0] text-[#C0272D]"
      : tone === "open"
        ? "bg-[#E2F0FC] text-[#1D4E8F]"
        : tone === "quiet"
          ? "bg-[#FFF1C9] text-gold-textDark"
          : "bg-chip text-[#5B6B80]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black ${cls}`}>
      <span className="msr text-[14px]" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

function StatTile({ value, label, icon }: { value: number; label: string; icon: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3">
      <span className="msr flex-none text-[22px] text-domain-counselor" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[19px] font-black leading-none text-navy">{value}</div>
        <div className="mt-1 text-[11px] font-bold text-muted">{label}</div>
      </div>
    </div>
  );
}

export function ClusterCaseListView() {
  const query = trpc.care.listClusterCases.useQuery({});

  const data = query.data;
  const schools = data?.scope.schools ?? [];
  const rows = data?.rows ?? [];

  return (
    <TamLyShell
      title="Tâm lý cụm"
      subtitle={
        schools.length > 0 ? schools.map((s) => s.schoolName).join(" · ") : undefined
      }
    >
      <div>
        <h1 className="text-[22px] font-black text-navy md:text-[24px]">Việc đang chờ trong cụm</h1>
        <p className="mt-1 text-[12.5px] font-semibold text-[#5B6B80]">
          {data
            ? `Hồ sơ chăm sóc đang mở và cờ khẩn chưa xử lý · nhìn lại ${data.urgentWindowDays} ngày`
            : "Đang xác định phạm vi cụm…"}
        </p>
      </div>

      <ScopeNotice />

      {query.isPending ? (
        <LoadingState label="Đang tìm việc đang chờ trong cụm…" />
      ) : query.error ? (
        <ErrorState error={query.error} label="hộp việc tâm lý cụm" onRetry={() => query.refetch()} />
      ) : schools.length === 0 ? (
        // KHÔNG hiện "cụm đang yên" ở đây: cô không có cơ sở nào trong phạm vi thì
        // danh sách rỗng chẳng nói gì về học sinh cả — nó nói về phân quyền.
        <EmptyState
          icon="apartment"
          title="Tài khoản chưa được gán cơ sở nào cho vai tâm lý cụm"
          hint="Danh sách trống ở đây KHÔNG có nghĩa là cụm đang yên — nghĩa là hệ thống chưa biết cụm của thầy cô gồm những cơ sở nào. Nhờ quản trị gán phạm vi rồi mở lại."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="task_alt"
          title="Chưa có hồ sơ nào đang mở và chưa có cờ khẩn nào chờ xử lý"
          hint={`Tính trên ${schools.length > 1 ? "các cơ sở" : "cơ sở"} trong cụm, nhìn lại ${data?.urgentWindowDays ?? 0} ngày. Trống ở đây nghĩa là chưa có tín hiệu nào được ghi — không phải đã quét xong và kết luận mọi em đều ổn.`}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <StatTile value={data!.totals.pendingHelp} label="Cờ khẩn chưa xử lý" icon="priority_high" />
            <StatTile value={data!.totals.openCases} label="Hồ sơ đang mở" icon="folder_shared" />
            <StatTile
              value={data!.totals.overQuietWindow}
              label={`Quá ${data!.quietDays} ngày chưa có hành động`}
              icon="timer"
            />
          </div>

          <ul className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <li key={row.studentId}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-black text-navy">{row.fullName}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-caption">
                        {[row.studentCode, classLabel(row.className), row.schoolName]
                          .filter((p) => p !== "")
                          .join(" · ")}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {row.helpPending && (
                          <Pill tone="urgent" icon="priority_high">
                            Cờ khẩn · {helpSignalLabel(row)}
                          </Pill>
                        )}
                        {row.caseStatus === "open" && (
                          <Pill tone="open" icon="folder_shared">
                            Hồ sơ đang mở
                          </Pill>
                        )}
                        <Pill tone={row.overQuietWindow ? "quiet" : "calm"} icon="history">
                          {lastActionLabel(row)}
                        </Pill>
                      </div>

                      {row.helpRequestedOn && (
                        <div className="mt-1.5 text-[11px] text-caption">
                          Em bấm «cần gặp thầy cô» ngày{" "}
                          {new Date(`${row.helpRequestedOn}T00:00:00`).toLocaleDateString("vi-VN")}
                        </div>
                      )}
                    </div>

                    <Link
                      href={`/tam-ly/ho-so/${row.studentId}`}
                      className="flex flex-none items-center gap-1.5 rounded-xl bg-gradient-to-br from-domain-counselor to-domain-counselorDark px-4 py-3 text-[12.5px] font-black text-white shadow-[0_6px_14px_rgba(106,52,224,.26)]"
                    >
                      Mở hồ sơ
                      <span className="msr text-[17px]" aria-hidden>
                        chevron_right
                      </span>
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          <p className="text-[11px] leading-relaxed text-caption">
            Danh sách dựng trực tiếp từ tín hiệu thô (hồ sơ chăm sóc, «cần gặp thầy cô»), không phải từ
            một lượt quét đêm — bộ quét cờ tự động chưa chạy. Ngưỡng {data!.quietDays} ngày đọc từ bảng
            ngưỡng của cơ sở, không viết trong mã.
          </p>
        </>
      )}
    </TamLyShell>
  );
}
