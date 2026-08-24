// apps/hub/components/gvcn/report-approval-view.tsx — màn "Duyệt báo cáo".
//
// Báo cáo Trưởng thành là thứ PHỤ HUYNH đọc. Giữa dữ liệu thô và mắt phụ huynh cần một
// con người đọc lại — đó là màn này. Sổ duyệt (report.growth_report_approvals, 0032)
// chỉ lưu QUYẾT ĐỊNH, không lưu nội dung báo cáo: nội dung vẫn sinh lại từ dữ liệu thô
// nên không có bản sao nào để lệch với sự thật.
//
// "Trả lại" bắt buộc kèm lý do (máy chủ cũng chặn, không chỉ giao diện): trả lại mà
// không nói vì sao thì tuần sau lặp lại đúng lỗi đó.
//
// 31/07/2026 — KHỐI XEM TRƯỚC. Trước bản này màn duyệt chỉ hiện hai con số vận hành
// (số ngày check-in, số ngày "Vui") rồi mời cô bấm "Duyệt gửi phụ huynh". Cô ký một thứ
// mình chưa từng đọc. Nay mỗi em kèm nguyên văn bản phụ huynh sẽ nhận — LUÔN MỞ, không
// gấp vào sau một nút "Xem trước": khối gấp cho phép duyệt mà không mở, tức là quay lại
// đúng chỗ cũ. Khối này viết bằng giọng "Glow & Grow" của phụ huynh (DESIGN-GUIDELINES
// §8) và được đóng khung rõ để không lẫn với phần vận hành của cô ở trên.
//
// 31/07/2026 (gói "tuong-phan-vung-cham-icon") — vùng chạm và tương phản. Màn này KÝ
// một quyết định gửi ra ngoài nhà trường, nên hai con số dưới đây không phải chuyện
// thẩm mỹ: hai mũi tên đổi tuần đang là 32×32 (bấm trượt = duyệt nhầm tuần), ba nút
// quyết định đang cao 38px, và mã học sinh — thứ dùng để phân biệt hai em trùng tên —
// in bằng token caption 3,06:1. Nay 44px và token muted (5,03:1) cho cả ba chỗ.
//
// ── 06/08/2026 · CHỌN NHIỀU EM ──────────────────────────────────────────────
//
// Chủ đầu tư, cùng ngày với ADR-029: "báo cáo thì cũng có thể gửi hàng loạt, hoặc sửa,
// hoặc trả lại gì đó hàng loạt". Bản cũ đặt hai nút quyết định DƯỚI TỪNG THẺ, nên một
// lớp 40 em là 40 cú bấm cho một quyết định cô đã ra từ lúc đọc xong danh sách.
//
// Hình dạng lấy nguyên của khối "check-in gửi muộn" (`LateCheckinBoard` trong
// gvcn-dashboard.tsx, dựng cùng ngày): ô tick từng dòng · "Chọn tất cả" · một thanh nói
// số đang chọn · hai nút kết luận · "Để sau" · và câu đọc `{updated, skipped}` sau khi
// ghi. Hai màn của cùng một cô làm cùng một thao tác thì không được nói hai thứ tiếng.
//
// BỐN THỨ CỐ Ý:
//
//   1. MỌI em đều tick được, kể cả em đã có chữ ký (ADR-031, 06/08/2026 — chủ đầu tư
//      duyệt vế "SỬA" trong chính câu mở màn duyệt hàng loạt). Nhưng đè lên một chữ ký đã
//      gửi phụ huynh KHÔNG cùng một cú bấm với ký lần đầu: khi lô đang chọn có em đã ký,
//      thanh dưới mọc thêm ĐÚNG MỘT ô xác nhận nói bằng con số — "Đổi quyết định đã ký
//      cho N em" — và chỉ khi tick nó thì lượt gửi mới mang cờ `ghiDeQuyetDinhDaCo`, kèm
//      lý do bắt buộc. Không tick thì máy chủ giữ nguyên hàng rào cũ (chỉ chạm dòng chưa
//      ai quyết) và những em đó rơi vào `skipped`.
//   2. Phần đã chọn được lọc lại theo danh sách ĐANG CÓ ở mỗi lần vẽ. Đổi tuần hoặc đổi
//      lớp thì id cũ không được lẳng lặng đi theo lượt gửi kế tiếp.
//   3. `clientMutationId` sinh một lần mỗi lượt soạn (§9): bấm hai lần vì mạng chậm là
//      CÙNG một quyết định. Mã đó nay được lưu thật (`report.report_decisions`, 0054), và
//      đó là điều kiện để đường ghi đè tồn tại: ở đó không còn trạng thái `pending` nào
//      để biến lượt thứ hai thành no-op.
//   4. KHÔNG một câu nào dạy cách dùng màn (yêu cầu chủ đầu tư 06/08/2026, §1.5). Nghĩa
//      nằm ở hình: ô tick, số đang chọn, nhãn trạng thái. Chữ còn lại chỉ có ba loại —
//      câu báo lỗi, nhãn trạng thái, và `sr-only` cho tai. Cùng luật đó cắt luôn hai câu
//      "vì sao màn này thiếu một mục Glow" trong khối xem trước: nghĩa lên thành chip
//      `visibility_off` + "Bản phụ huynh có thể khác", bốn chữ, cạnh tiêu đề khối.
"use client";

import { useState } from "react";
import {
  REPORT_DECISIONS,
  REPORT_DECISION_LABEL,
  type DecideReportsOutput,
  type ReportApprovalRow,
  type ReportDecision,
  type ReportPreview,
} from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { mondayOf, toLocalIsoDate } from "@/lib/date";
import { formatWeekLabel } from "@/lib/week-label";
import { EmptyState, ErrorState, LoadingState, MutationError, MutationSuccess } from "../ui/query-state";
import { classLabel } from "../ui/labels";
import { ClassPicker, useSelectedClass } from "./class-picker";
import { Card, GvcnShell } from "./gvcn-shell";
import { newMutationId } from "./mutation-id";

const STATUS_META = {
  pending: { label: "Chờ duyệt", bg: "bg-chip", fg: "text-subtle", icon: "hourglass_empty" },
  approved: { label: "Đã duyệt", bg: "bg-[#0C2E22]", fg: "text-successText", icon: "check_circle" },
  rejected: { label: "Đã trả lại", bg: "bg-[#3D141A]", fg: "text-[#FF8A8F]", icon: "undo" },
} as const;

/**
 * Nền + chữ của nút kết luận ĐANG CHỌN — tách khỏi JSX để đo được bằng một phép kiểm
 * tương phản, đúng cách `DECISION_ON` của khối gửi muộn và `CHOICE_STYLE` của màn điểm
 * danh đang làm.
 *
 * Đo trên nền thật (WCAG 2.x): #4EE39B/#0C2E22 = 6,12:1 · #FFD98A/#3A2E08 = 5,27:1.
 * Nút chưa chọn: #93A9C8 trên trắng = 5,44:1. Không mã hex mới nào — cả hai cặp đã có
 * tên token (`surface-success`/`successText`, `surface-warn`/`gold-textDark`).
 */
const DECISION_ON: Record<ReportDecision, string> = {
  approved: "border-[#4EE39B] bg-surface-success text-successText",
  rejected: "border-gold-dark bg-surface-warn text-gold-textDark",
};

/**
 * Ba màu nhấn của Glow (contract `GlowItem.accentColor`). Giữ đúng bảng màu mood/domain
 * của DESIGN-GUIDELINES §3; màu KHÔNG bao giờ là tín hiệu duy nhất — mỗi dòng luôn kèm
 * icon và chữ (§11).
 */
const GLOW_ACCENT = {
  green: { dot: "bg-[#00A85E]", icon: "workspace_premium" },
  blue: { dot: "bg-[#2C7BF2]", icon: "sentiment_very_satisfied" },
  // #F5A300 → #C77A00 (05/08/2026). Ô icon là phần tử ĐỒ HOẠ mang nghĩa, nên mốc của nó
  // là WCAG 1.4.11 (3:1), không phải 4,5:1 của chữ. Đo icon trắng trên nền cũ: 2,07:1 —
  // ba mục Glow đứng cạnh nhau chỉ khác nhau bằng icon, mà đúng icon của mục thứ ba thì
  // nhoè vào nền. Mã mới đạt 3,38:1, vẫn là tông vàng của §3, không chế màu ngoài bảng.
  // Hai mã kia đã đạt sẵn nên không đụng tới: #00A85E = 3,10:1 · #2C7BF2 = 4,02:1.
  amber: { dot: "bg-[#C77A00]", icon: "volunteer_activism" },
} as const;

/**
 * Nhãn tuần cho MẮT NGƯỜI: "Tuần 27/7 – 31/7".
 *
 * Sửa 01/08/2026. Bản cũ ghép thẳng hai chuỗi ISO — lấy HTML thật bằng curl với phiên Cô
 * Vân thì màn hình in nguyên văn "2026-07-27 → 2026-07-31". ISO là định dạng cho máy đọc;
 * giáo viên Việt Nam đọc dd/mm. Và repo đã có sẵn đúng một chỗ đổi nhãn tuần
 * (`lib/week-label.ts`, có test riêng) mà màn này không dùng, nên buồng lái và màn của
 * học sinh đang in hai chuẩn ngày khác nhau cho cùng một thứ.
 *
 * Dùng lại hàm đó thay vì tự viết lần thứ hai: hai bộ định dạng ngày trong một hệ dữ liệu
 * học sinh là hai chỗ để lệch nhau.
 */
function weekLabel(weekStart: string): string {
  const end = new Date(`${weekStart}T00:00:00`);
  end.setDate(end.getDate() + 4);
  return formatWeekLabel(`${weekStart} – ${toLocalIsoDate(end)}`);
}

/**
 * Vì sao nút ghi đang vô hiệu — hoặc `null` khi nó bấm được.
 *
 * Một nút xám không kèm chữ là nút CHẾT CÂM: người dùng nhìn thấy thứ mình cần bấm, bấm
 * không được, và màn hình không nói vì sao. Ở đây cái chặn còn không nằm ở nút mà nằm ở
 * một ô nhập cách đó vài dòng.
 *
 * MỘT DÒNG, không hơn (§1.5): đây là caption, không phải bài hướng dẫn. Ngưỡng 3 ký tự
 * không phải con số chọn ở đây — nó là `note: z.string().trim().min(3)` trong
 * `DecideReportsInput`, và router canh lại lần nữa. Câu này chỉ nói sớm điều máy chủ sẽ
 * từ chối muộn.
 */
export function lyDoChuaGhiDuoc(
  decision: ReportDecision | null,
  selectedCount: number,
  note: string,
  /** Trong lô đang chọn có bao nhiêu em ĐÃ có chữ ký (ADR-031). 0 = đường mặc định. */
  soEmDaKy = 0,
  /** Cô đã tick bước xác nhận đổi quyết định đã ký chưa. */
  daXacNhanGhiDe = false,
): string | null {
  if (selectedCount === 0) return "Chọn ít nhất một em.";
  if (decision === null) return "Chọn một quyết định.";
  // Bước xác nhận đứng TRƯỚC ô lý do: chưa tick thì máy chủ sẽ bỏ qua đúng những em này
  // (cờ tắt = chỉ chạm dòng chưa ai quyết), nên hỏi lý do trước là hỏi cho một lượt ghi
  // sẽ không xảy ra.
  if (soEmDaKy > 0 && !daXacNhanGhiDe) return `${soEmDaKy} em đã ký — xác nhận để đổi.`;
  const doiLyDo = decision === "rejected" || (soEmDaKy > 0 && daXacNhanGhiDe);
  if (!doiLyDo) return null;
  const du = note.trim().length;
  if (du === 0) return soEmDaKy > 0 ? "Đổi quyết định phải kèm lý do." : "Trả lại phải kèm lý do.";
  if (du < 3) return `Lý do còn ${3 - du} ký tự nữa mới đủ.`;
  return null;
}

/**
 * Đọc `{updated, skipped}` thành câu — KHÔNG được im lặng ở vế `skipped`.
 *
 * `skipped > 0` nghĩa là những em đó máy chủ KHÔNG ghi. Nuốt nó đi thì cô đếm "đã duyệt
 * 30 em" trong khi hệ chỉ ghi 27.
 *
 * NGHĨA CỦA `skipped` ĐỔI THEO ĐƯỜNG ĐANG ĐI, nên câu chữ cũng phải đổi (ADR-031):
 *   · đường mặc định — em đã có người ký trước, hoặc màn hình này đã cũ;
 *   · đường ghi đè   — trạng thái cũ không còn chặn được gì nữa, nên lý do còn lại chỉ là
 *     em không thuộc lớp chủ nhiệm, hoặc đây là lượt gửi lại cùng mã (§9, chỉ mục 0054).
 * In câu của đường này cho đường kia là một lời giải thích sai trông như thật — cô sẽ đi
 * tìm "ai đã ký trước" cho một con số không nói về chuyện đó.
 *
 * `updated = 0 && skipped = 0` không rơi vào được (input đòi `.min(1)`), nhưng nếu máy
 * chủ đổi mà quên chỗ này thì im lặng vẫn là hỏng tệ nhất.
 */
export function ketQuaDuyetBaoCao(
  r: DecideReportsOutput,
  decision: ReportDecision,
  ghiDe = false,
): string {
  const parts: string[] = [];
  if (r.updated > 0) {
    parts.push(
      ghiDe
        ? `Đã đổi quyết định của ${r.updated} em sang “${REPORT_DECISION_LABEL[decision]}”.`
        : decision === "approved"
          ? `Đã duyệt gửi phụ huynh cho ${r.updated} em.`
          : `Đã trả lại báo cáo của ${r.updated} em.`,
    );
  }
  if (r.skipped > 0) {
    const viSao = ghiDe
      ? "không thuộc lớp chủ nhiệm, hoặc lượt này đã ghi rồi"
      : "đã có người quyết trước";
    parts.push(
      r.updated > 0
        ? `${r.skipped} em bỏ qua vì ${viSao}.`
        : `Không em nào đổi: cả ${r.skipped} em ${viSao}. Tải lại để xem trạng thái thật.`,
    );
  }
  return parts.length > 0
    ? parts.join(" ")
    : "Đã gửi, nhưng máy chủ không nói rõ kết quả — hãy tải lại màn hình.";
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
          ? `${classLabel(listQuery.data.className)} · ${weekLabel(listQuery.data.weekStart)} · ${pending} em chờ duyệt`
          : undefined
      }
      displayName={displayName}
      email={email}
      classCode={classCode}
      toolbar={
        <div className="flex flex-wrap items-center gap-2.5">
          <ClassPicker classes={classesQuery.data?.classes ?? []} selectedId={classId} onSelect={select} />
          {/* h-11 w-11 = 44px (§11). Trước đó 32×32: đổi tuần là thao tác cô làm bằng
              ngón cái trên điện thoại ngay đầu giờ, bấm trượt sang tuần sai thì cô duyệt
              báo cáo của một tuần khác mà không có gì báo. */}
          <div className="flex items-center gap-1 rounded-xl border border-line bg-card px-1.5 py-1">
            <button
              type="button"
              onClick={() => shiftWeek(-7)}
              aria-label="Tuần trước"
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#0E1E3C]"
            >
              <span className="msr text-[18px] text-cardtitle" aria-hidden>
                chevron_left
              </span>
            </button>
            {/* aria-live + aria-atomic: hai nút cạnh nó có aria-label đúng ("Tuần trước" /
                "Tuần sau"), nhưng bấm xong thì THỨ DUY NHẤT đổi là chuỗi này và cả danh
                sách bên dưới — không có gì phát ra tiếng. Người dùng bàn phím / trình đọc
                màn hình bấm "Tuần sau" rồi nghe im lặng, và việc họ sắp làm là DUYỆT GỬI
                PHỤ HUYNH. Duyệt nhầm tuần không hoàn tác được từ giao diện. */}
            <span
              aria-live="polite"
              aria-atomic="true"
              className="px-1 text-[12px] font-extrabold tabular-nums text-cardtitle2"
            >
              {weekLabel(weekStart)}
            </span>
            <button
              type="button"
              onClick={() => shiftWeek(7)}
              aria-label="Tuần sau"
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#0E1E3C]"
            >
              <span className="msr text-[18px] text-cardtitle" aria-hidden>
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
        <ApprovalBoard
          key={`${classId ?? ""}:${weekStart}`}
          rows={rows}
          classId={classId}
          weekStart={weekStart}
          refetching={listQuery.isFetching}
          onDone={() => utils.care.listReportApprovals.invalidate()}
        />
      )}
    </GvcnShell>
  );
}

/**
 * Danh sách + thanh hành động. Trạng thái chọn nằm ở ĐÂY chứ không ở từng thẻ: một lượt
 * ghi là một lượt cho nhiều em, nên nó phải có đúng một chỗ giữ danh sách đang chọn, một
 * mã chống trùng, và một câu kết quả.
 *
 * `key` ở nơi gọi ghim theo lớp + tuần: đổi tuần là đổi hẳn tập quyết định, và một lựa
 * chọn sống sót qua ranh giới đó là một lượt ghi vào tuần cô không nhìn thấy.
 */
function ApprovalBoard({
  rows,
  classId,
  weekStart,
  refetching,
  onDone,
}: {
  rows: ReportApprovalRow[];
  classId: string | null;
  weekStart: string;
  refetching: boolean;
  onDone: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<ReportDecision | null>(null);
  const [note, setNote] = useState("");
  // Bước xác nhận của ADR-031. Một ô tick, không phải một hộp thoại: hộp thoại chặn màn
  // hình để hỏi một câu mà con số ngay cạnh đã trả lời rồi.
  const [xacNhanGhiDe, setXacNhanGhiDe] = useState(false);
  const [mutationId, setMutationId] = useState(newMutationId);
  // Quyết định của lượt VỪA GỬI, giữ riêng: `onSuccess` xoá `decision` để màn hình sạch
  // cho lượt sau, nên câu xác nhận không đọc được nhãn từ đó nữa. Đọc `decide.variables`
  // thì đúng dữ liệu nhưng sai kiểu, và một `?? "approved"` để chiều kiểu là bịa nhãn cho
  // một dòng đã ghi vào sổ. Giữ cả cờ ghi đè vì câu kết quả nói khác nhau ở hai đường.
  const [daGui, setDaGui] = useState<{ decision: ReportDecision; ghiDe: boolean } | null>(null);

  const decide = trpc.care.decideReports.useMutation({
    onSuccess: () => {
      setSelectedIds([]);
      setDecision(null);
      setNote("");
      setXacNhanGhiDe(false);
      setMutationId(newMutationId());
      onDone();
    },
  });

  // MỌI em đều chọn được kể từ ADR-031 — kể cả em đã có chữ ký. Lọc theo danh sách ĐANG
  // CÓ, không tin state cũ: một em vừa rời lớp (hoặc màn vừa đổi tuần) không được lẳng
  // lặng đi theo lượt gửi kế tiếp.
  const conTrenMan = new Set(rows.map((r) => r.studentId));
  const selected = selectedIds.filter((id) => conTrenMan.has(id));
  const chonHet = rows.length > 0 && selected.length === rows.length;

  // Bao nhiêu em trong lô đang chọn ĐÃ có chữ ký. Đây là con số quyết định cả bước xác
  // nhận lẫn cờ gửi xuống máy chủ — tính từ dữ liệu đang hiện, không từ một biến nhớ.
  const daKy = rows.filter((r) => r.status !== "pending" && selected.includes(r.studentId));
  // Cờ chỉ bật khi CẢ HAI cùng đúng. Cô tick xác nhận rồi bỏ chọn hết em đã ký thì lượt
  // gửi quay về đường mặc định — không gửi một cờ ghi đè cho một lô không có gì để đè.
  const ghiDe = daKy.length > 0 && xacNhanGhiDe;

  const viSaoChuaGhi = lyDoChuaGhiDuoc(decision, selected.length, note, daKy.length, xacNhanGhiDe);
  const ghiDuoc = viSaoChuaGhi === null && !decide.isPending;
  const doiLyDo = decision === "rejected" || ghiDe;
  const xacNhan =
    decide.isSuccess && daGui ? ketQuaDuyetBaoCao(decide.data, daGui.decision, daGui.ghiDe) : null;

  function ghi() {
    if (decision === null || viSaoChuaGhi !== null) return;
    setDaGui({ decision, ghiDe });
    decide.mutate({
      classId: classId ?? undefined,
      studentIds: selected,
      weekStart,
      decision,
      // "Duyệt gửi phụ huynh" trên một lô toàn em chưa ai quyết không đòi lý do; gửi kèm
      // một chuỗi soạn dở cho quyết định không cần nó là ghi vào sổ một câu không ai hỏi.
      note: doiLyDo ? note.trim() : undefined,
      ghiDeQuyetDinhDaCo: ghiDe,
      clientMutationId: mutationId,
    });
  }

  return (
    // aria-busy trong lúc nạp lại: đổi tuần giữ nguyên danh sách cũ trên màn hình
    // (react-query trả dữ liệu cũ trước), nên nếu không khai thì trong nửa giây đó
    // màn hình đang trình bày báo cáo TUẦN KHÁC dưới nhãn tuần vừa đổi.
    <div className="flex flex-col gap-3" aria-busy={refetching}>
      {/* Ô chọn tất cả là CHECKBOX THẬT, không phải một nút đổi màu (§11): trạng thái
          chọn phải đọc được cả bằng tai lẫn khi không phân biệt được màu. `indeterminate`
          đặt qua callback ref — nó không phải thuộc tính HTML, chỉ có ở DOM property, nên
          React không tự đặt được; thiếu nó thì "đã chọn một nửa" trông y hệt "chưa chọn gì". */}
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl bg-surface-alt px-3">
        <input
          type="checkbox"
          className="h-5 w-5 flex-none accent-navy"
          checked={chonHet}
          ref={(el) => {
            if (el) el.indeterminate = selected.length > 0 && !chonHet;
          }}
          onChange={() => setSelectedIds(chonHet ? [] : rows.map((r) => r.studentId))}
        />
        <span className="text-[12.5px] font-black text-cardtitle2">
          {chonHet ? "Bỏ chọn tất cả" : "Chọn tất cả"} ({rows.length} em)
        </span>
      </label>

      {rows.map((row) => (
        <ApprovalRow
          key={row.studentId}
          row={row}
          selected={selected.includes(row.studentId)}
          onToggle={() =>
            setSelectedIds((cu) =>
              cu.includes(row.studentId)
                ? cu.filter((id) => id !== row.studentId)
                : [...cu, row.studentId],
            )
          }
        />
      ))}

      {/* Thanh dính đáy: với 40 thẻ, mỗi thẻ cao bằng nguyên bản xem trước, một thanh
          đứng yên trên đầu danh sách là một thanh cô không nhìn thấy lúc cần bấm. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-3 shadow-[0_-4px_16px_rgba(10,42,94,.10)]">
        {/* `role="status"` để số em đang chọn được đọc lên sau mỗi lần tick — không có
            nó thì người dùng bàn phím tick năm lần mà không nghe được mình đang ở đâu. */}
        <div role="status" className="text-[12px] font-extrabold text-cardtitle2">
          Đang chọn {selected.length}/{rows.length} em
        </div>

        <div className="flex flex-wrap gap-2">
          {REPORT_DECISIONS.map((k) => {
            const dangChon = decision === k;
            return (
              <button
                key={k}
                type="button"
                // aria-pressed + icon đổi hình: §11 cấm để trạng thái chọn chỉ khác nhau
                // ở màu nền.
                aria-pressed={dangChon}
                onClick={() => setDecision(k)}
                className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.6px] px-4 py-2.5 text-[12.5px] font-black ${
                  dangChon ? DECISION_ON[k] : "border-line bg-card text-subtle"
                }`}
              >
                <span className="msr text-[16px]" aria-hidden>
                  {dangChon ? "check_circle" : "radio_button_unchecked"}
                </span>
                {REPORT_DECISION_LABEL[k]}
              </button>
            );
          })}
        </div>

        {/* BƯỚC XÁC NHẬN của ADR-031 — đúng một bước, và nó chỉ tồn tại khi có thứ để đè.
            Nói bằng CON SỐ và NHÃN, không bằng một đoạn văn cảnh báo: cô đã nhìn thấy nhãn
            "Đã duyệt"/"Đã trả lại" trên từng thẻ vừa tick, nên thứ còn thiếu là một hành
            động khai rằng mình cố ý, không phải một bài giảng.
            Checkbox thật chứ không phải nút đổi màu (§11), và nền vàng `surface-warn` là
            tín hiệu THỨ HAI chứ không phải tín hiệu duy nhất. */}
        {daKy.length > 0 && (
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl bg-surface-warn px-3">
            <input
              type="checkbox"
              className="h-5 w-5 flex-none accent-navy"
              checked={xacNhanGhiDe}
              onChange={() => setXacNhanGhiDe((v) => !v)}
            />
            <span className="text-[12.5px] font-black text-gold-textDark">
              Đổi quyết định đã ký cho {daKy.length} em
            </span>
          </label>
        )}

        {doiLyDo && (
          <div className="flex flex-col gap-1.5">
            {/* Nhãn thật, không phải placeholder: placeholder biến mất ngay khi gõ ký tự
                đầu (WCAG 3.3.2), mà đây là ô đi thẳng vào sổ vết (0054). */}
            <label className="text-[12px] font-black text-cardtitle2" htmlFor="duyet-ly-do">
              {ghiDe ? "Lý do đổi quyết định (bắt buộc)" : "Lý do trả lại (bắt buộc)"}
            </label>
            <textarea
              id="duyet-ly-do"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ví dụ: tuần này em nghỉ ốm 3 ngày, báo cáo chưa phản ánh đúng…"
              className="w-full resize-none rounded-xl border border-line bg-card px-3.5 py-2.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-navy"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!ghiDuoc}
            onClick={ghi}
            // Nút vô hiệu phải nói được VÌ SAO, và nói cho cả tai: `aria-describedby`
            // trỏ tới đúng câu đang hiện bên dưới.
            aria-describedby={viSaoChuaGhi ? "duyet-vi-sao" : undefined}
            className="min-h-[44px] rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white disabled:cursor-not-allowed disabled:border-line disabled:bg-none disabled:bg-chip disabled:text-muted disabled:shadow-none"
          >
            {decide.isPending
              ? "Đang ghi…"
              : decision && selected.length > 0
                ? `${REPORT_DECISION_LABEL[decision]} · ${selected.length} em`
                : "Ghi quyết định"}
          </button>
          {/* "Để sau" KHÔNG phải một trạng thái mới trong dữ liệu — không có
              `status = 'de_sau'` nào, và bịa ra một cái là thêm một khái niệm mà cả sổ
              duyệt lẫn báo cáo phụ huynh đều không biết đọc. Nó đúng bằng "bỏ chọn". */}
          <button
            type="button"
            onClick={() => {
              setSelectedIds([]);
              setDecision(null);
              setNote("");
              setXacNhanGhiDe(false);
            }}
            className="min-h-[44px] px-2 text-[12.5px] font-extrabold text-subtle underline underline-offset-2"
          >
            Để sau
          </button>
        </div>

        {viSaoChuaGhi && (
          <p id="duyet-vi-sao" className="text-[11.5px] font-semibold leading-relaxed text-muted">
            {viSaoChuaGhi}
          </p>
        )}

        <MutationError error={decide.error} onRetry={ghi} />
        {xacNhan && <MutationSuccess>{xacNhan}</MutationSuccess>}
      </div>
    </div>
  );
}

function ApprovalRow({
  row,
  selected,
  onToggle,
}: {
  row: ReportApprovalRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = STATUS_META[row.status];

  return (
    <Card className={selected ? "ring-[1.6px] ring-navy" : ""}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* MỌI em đều tick được kể từ ADR-031, kể cả em đã có chữ ký — đường sửa đi qua
              đúng ô này cộng bước xác nhận ở thanh dưới. Trước ADR-031 chỗ này ẩn ô tick
              với em đã quyết, vì máy chủ từ chối ghi đè; lý do đó không còn đúng nữa.
              Cả tên nằm trong <label> nên vùng chạm bằng chiều rộng của tên, không bằng
              20px của ô tick (§11 · WCAG 2.5.5). */}
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="h-5 w-5 flex-none accent-navy"
              checked={selected}
              onChange={onToggle}
            />
            <span className="text-[14.5px] font-black text-ink">{row.fullName}</span>
          </label>
          {/* text-muted chứ không phải text-caption: mã học sinh là thứ cô đối chiếu với
              sổ giấy khi hai em trùng tên — đọc sai một ký tự là duyệt nhầm người.
              caption (#8A94A6) chỉ đạt 3,06:1. */}
          <span className="text-[11px] tabular-nums text-muted">{row.studentCode}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black ${meta.bg} ${meta.fg}`}
          >
            <span className="msr text-[14px]" aria-hidden>
              {meta.icon}
            </span>
            {meta.label}
          </span>
        </div>
        {/* `happyDays` là `null` với GVCN kể từ ADR-026 / migration 0044 — cô không đọc được
            nguồn của con số đó nữa. Câu cũ nội suy thẳng `{row.happyDays}` vào giữa dòng, và
            React vẽ `null` thành CHUỖI RỖNG: đo thật qua HTTP phiên Cô Lan 01/08/2026, dòng
            in ra là `Tuần này: 5 ngày có check-in ·  ngày tâm trạng "Vui"` — một khoảng trống
            đúng chỗ con số. Cô đọc nó thành "màn hình lỗi", không thành "mình không được
            phép biết". Đó là im lặng bị đọc thành kết luận, ngay trên màn KÝ một thứ gửi ra
            ngoài nhà trường.
            Không thay bằng `0` (0 là một lời nói dối trông giống hệt một phép đo) và không
            bỏ hẳn vế đó (bỏ rồi im là bắt cô tự dựng lấy lời giải thích). Nói thẳng ra. */}
        <div className="mt-1 text-[12px] leading-relaxed text-muted">
          Tuần này: {row.checkinDays} ngày có check-in ·{" "}
          {row.happyDays === null
            ? "số ngày tâm trạng “Vui” thì chỉ thầy cô tâm lý đọc được"
            : `${row.happyDays} ngày tâm trạng “Vui”`}
          {row.checkinDays === 0 && " — báo cáo tuần này gần như không có dữ liệu thật để kể"}
        </div>
        {row.reviewedAt && (
          <div className="mt-1 text-[11px] text-muted">
            Quyết định lúc {new Date(row.reviewedAt).toLocaleString("vi-VN")}
            {row.note ? ` · "${row.note}"` : ""}
          </div>
        )}
      </div>

      <ReportPreviewBlock preview={row.preview} studentName={row.fullName} />
    </Card>
  );
}

/**
 * Nguyên văn thứ phụ huynh sẽ đọc. Không tóm tắt, không diễn giải lại cho người trong
 * nghề: nếu bản này khác bản kia dù chỉ một câu thì chữ ký duyệt lại vô nghĩa như trước.
 *
 * Ba lựa chọn có chủ ý:
 *   · LUÔN MỞ, không gấp sau nút "Xem trước" — gấp lại là cho phép duyệt mà không đọc.
 *   · Không có glow thì NÓI THẲNG là chưa có, không độn một câu khen chung chung. Im lặng
 *     không phải kết luận tốt (DESIGN-GUIDELINES §8) và phụ huynh sẽ đọc đúng sự trống đó.
 *   · Không một từ vận hành nào (cờ, ngưỡng, leo thang) lọt vào khối này — đây là vùng
 *     giọng "Glow & Grow", dù đang hiện trên màn hình của cô.
 */
function ReportPreviewBlock({ preview, studentName }: { preview: ReportPreview; studentName: string }) {
  const empty = preview.glow.length === 0 && preview.grow.length === 0;

  return (
    <section
      aria-label={`Bản phụ huynh sẽ đọc — ${studentName}`}
      className="mt-3 rounded-2xl border border-line bg-[#FBFCFE] p-3.5"
    >
      <div className="flex items-center gap-1.5">
        {/* `visibility` chứ không phải một icon phong bì: font đã cắt gọn (public/fonts)
            và tên ngoài danh sách sẽ hiện Ô TRỐNG không báo lỗi — xem tests/unit/a11y. */}
        <span className="msr text-[16px] text-cardtitle" aria-hidden>
          visibility
        </span>
        {/* <h4> → <h2> (05/08/2026). Trang này có đúng một <h1> (tiêu đề màn, do GvcnShell
            đặt) và KHÔNG có <h2>/<h3> nào, nên một <h4> ở đây là nhảy ba cấp: trình đọc
            màn hình nghe "heading cấp bốn" và không có cấp hai, cấp ba nào để nó thuộc
            vào. Đây là cấp hai thật — mỗi thẻ duyệt có đúng một mục con, chính là nguyên
            văn bản phụ huynh sẽ đọc. Class giữ nguyên từng ký tự: đổi THẺ, không đổi cỡ chữ. */}
        <h2 className="text-[11.5px] font-black uppercase tracking-wide text-cardtitle2">
          Phụ huynh sẽ đọc đúng thế này
        </h2>

        {/* `glowIncomplete` do MÁY CHỦ phát ra, không phải màn hình tự suy: nó bật khi
            `attendance.happy_days()` trả `null` cho cô (ADR-026), nghĩa là bản dựng ở đây
            có thể THIẾU mục Glow "Cả tuần đến lớp với tâm trạng vui vẻ" mà bản phụ huynh
            đọc vẫn có. Người ký phải biết mình đang ký bản rút gọn.
            06/08/2026 — CÂU THÀNH CHIP. Chỗ này từng là hai câu giải thích vì sao màn
            thiếu dữ liệu; chủ đầu tư chỉ đích danh nó. Nghĩa không bỏ (bỏ là quay lại đúng
            lỗi màn duyệt sinh ra để chữa: cô ký một bản khác bản người khác đọc), nhưng
            nghĩa đó vừa đúng bốn chữ. "CÓ THỂ khác", không phải "khác" — máy chủ chỉ biết
            mình không đọc được nguồn, không biết em có đủ 3 ngày Vui hay không; nhãn in ra
            không được nói mạnh hơn thứ máy chủ thật sự biết.
            #93A9C8 trên #12244A = 4,93:1. Icon `aria-hidden`, chữ là chữ thật nên trình
            đọc màn hình vẫn nghe được — không phải một dấu hiệu chỉ dành cho mắt. */}
        {preview.glowIncomplete && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 text-[10.5px] font-black text-subtle">
            <span className="msr text-[13px]" aria-hidden>
              visibility_off
            </span>
            Bản phụ huynh có thể khác
          </span>
        )}
      </div>

      <p className="mt-2 text-[14px] font-black text-cardtitle">"{preview.headline}"</p>

      {/* Ở đây từng có hai câu giải thích vì sao bản của cô có thể thiếu một mục Glow.
          Gỡ 06/08/2026 — chủ đầu tư chỉ đích danh nó trong danh sách "chữ giải thích bé bé".
          Nghĩa KHÔNG mất: nó lên thành chip `visibility_off` cạnh tiêu đề khối, ngay trên
          đầu. Không để lại đoạn văn "phòng khi cần" — cùng lý do gvcn-dashboard.tsx đã ghi
          hai lần khi cắt `MoodClosedCard`: một khối không ai đọc là lời mời cho lần sửa sau
          nối lại đúng thứ vừa cắt. */}

      {empty ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Tuần này chưa có đủ dữ liệu để kể điều gì về {studentName}. Duyệt bây giờ là gửi đi một
          báo cáo gần như trống.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {preview.glow.map((item) => {
            const accent = GLOW_ACCENT[item.accentColor];
            return (
              <li key={item.title} className="flex gap-2.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg ${accent.dot}`}
                >
                  <span className="msr text-[15px] text-white" aria-hidden>
                    {accent.icon}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-extrabold leading-snug text-ink">
                    {item.title}
                  </span>
                  <span className="block text-[11.5px] leading-snug text-muted">{item.detail}</span>
                </span>
              </li>
            );
          })}

          {preview.grow.map((item) => (
            <li key={item.title} className="flex gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-[#7434E8]">
                <span className="msr text-[15px] text-white" aria-hidden>
                  trending_up
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-extrabold leading-snug text-ink">
                  {item.title}
                </span>
                <span className="block text-[11.5px] leading-snug text-muted">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
