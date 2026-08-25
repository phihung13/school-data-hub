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
      ? "bg-[#3D141A] text-[#FF8A8F]"
      : tone === "open"
        ? "bg-surface-info text-link"
        : tone === "quiet"
          ? "bg-[#3A2E08] text-gold-textDark"
          : "bg-chip text-caption";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black ${cls}`}>
      <span className="msr text-[14px]" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

/**
 * Ba con số đầu màn. Dưới `sm` xếp NGANG ba cột chứ không chồng dọc (đổi 01/08/2026).
 *
 * Vì sao: bản cũ dùng `flex-col sm:flex-row`, nên trên điện thoại ba thẻ này chiếm khoảng
 * 212px chiều cao — cộng với header, tiêu đề và khối phạm vi thì ca đầu tiên nằm dưới mép
 * màn hình của một máy 360×640. Ba con số một chữ số thì không cần cả chiều rộng màn hình;
 * cái cần chỗ là danh sách tên bên dưới. Trong ô hẹp, icon và số xuống dòng riêng (`flex-col`)
 * rồi từ `sm` mới quay lại hàng ngang như cũ.
 */
function StatTile({ value, label, icon }: { value: number; label: string; icon: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[16px] border border-line bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3">
      <span className="msr flex-none text-[20px] text-domain-counselor sm:text-[22px]" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[19px] font-black leading-none text-cardtitle">{value}</div>
        <div className="mt-1 text-[11px] font-bold leading-tight text-muted">{label}</div>
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
        <h1 className="text-[22px] font-black text-cardtitle md:text-[24px]">Việc đang chờ trong cụm</h1>
        {/* Rút còn một dòng ngắn (01/08/2026): câu cũ dài 60 ký tự nên xuống hai dòng ở
            360px, và nội dung "hồ sơ đang mở + cờ khẩn" đã được ba StatTile ngay dưới nói
            bằng số. §1.5 — caption tối đa một dòng. Khoảng thời gian thì GIỮ: nó là điều
            duy nhất trong câu mà không con số nào bên dưới nói ra. */}
        <p className="mt-1 text-[12.5px] font-semibold text-caption">
          {data ? `Nhìn lại ${data.urgentWindowDays} ngày` : "Đang xác định phạm vi cụm…"}
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
          // RÚT NGẮN 06/08/2026. Vế giữa của câu cũ ("hệ thống chưa biết cụm của thầy cô
          // gồm những cơ sở nào") diễn giải lại tiêu đề. Hai vế PHẢI giữ: trống ≠ cụm yên
          // (im lặng không phải kết luận), và việc phải làm tiếp theo.
          hint="Trống ≠ cụm đang yên. Nhờ quản trị gán phạm vi."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="task_alt"
          title="Chưa có hồ sơ mở và chưa có cờ khẩn"
          // RÚT NGẮN 06/08/2026: bỏ vế "Tính trên các cơ sở trong cụm" (tiêu đề app đã
          // liệt kê đúng tên các cơ sở) và vế "không phải đã quét xong và kết luận…".
          // GIỮ: khoảng thời gian, và mệnh đề trống-không-phải-kết-luận rút thành một vế.
          hint={`Nhìn lại ${data?.urgentWindowDays ?? 0} ngày · trống ≠ mọi em đều ổn`}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
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
                      <div className="text-[14.5px] font-black text-cardtitle">{row.fullName}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-muted">
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
                        <div className="mt-1.5 text-[11px] text-muted">
                          Em bấm "cần gặp thầy cô" ngày{" "}
                          {new Date(`${row.helpRequestedOn}T00:00:00`).toLocaleDateString("vi-VN")}
                        </div>
                      )}
                    </div>

                    <Link
                      href={`/tam-ly/ho-so/${row.studentId}`}
                      // aria-label mang TÊN EM: trên một danh sách 12 ca, mười hai liên kết
                      // cùng đọc "Mở hồ sơ" là danh sách liên kết vô nghĩa với trình đọc màn
                      // hình. min-h-[44px] (§11) — trước đó ~41px.
                      aria-label={`Mở hồ sơ chăm sóc của ${row.fullName}`}
                      className="flex min-h-[44px] flex-none items-center gap-1.5 rounded-xl bg-gradient-to-br from-domain-counselor to-domain-counselorDark px-4 py-3 text-[12.5px] font-black text-white shadow-[0_6px_14px_rgba(106,52,224,.26)]"
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

          {/* RÚT NGẮN 06/08/2026. Câu cuối ("Ngưỡng N ngày đọc từ bảng ngưỡng của cơ sở,
              không viết trong mã") là lời hứa của người VIẾT PHẦN MỀM với người viết phần
              mềm — mệnh lệnh 7 được thi hành ở `care.thresholds` và ở CI, không phải bằng
              một dòng chữ trên màn cán bộ tư vấn. Con số ngưỡng vẫn hiện, ở đúng chỗ nó
              có nghĩa: nhãn ô "Quá N ngày chưa có hành động".
              GIỮ nguồn của danh sách: nó phân biệt "chưa có tín hiệu" với "chưa ai quét". */}
          <p className="text-[11px] leading-relaxed text-muted">
            Dựng từ tín hiệu thô, không từ lượt quét đêm.
          </p>
        </>
      )}
    </TamLyShell>
  );
}
