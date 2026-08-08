// apps/hub/components/cot-phai-nguoi-lon.tsx — cột phải (rail) của trang chủ vai NGƯỜI LỚN.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO CÓ FILE NÀY (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════
// `DESIGN.md` mục Layout quy định bố cục máy tính là hai cột — nội dung `flex 1.6–1.7` +
// rail phải `flex 1`. Trang chủ HỌC SINH có rail đó ("Tuần này của mình", "Hôm nay"); trang
// chủ vai người lớn thì KHÔNG có cột nào, nên nửa màn phải trống trơn. Chủ đầu tư mở bằng
// tài khoản quản trị và giáo viên rồi nói đúng một câu: "cột bên kia thiếu khung gì đó".
//
// ═══════════════════════════════════════════════════════════════════════════════
// LUẬT CỦA CẢ FILE: MỘT KHỐI = MỘT TRUY VẤN CÓ THẬT
// ═══════════════════════════════════════════════════════════════════════════════
// Không khối nào ở đây được vẽ từ chữ viết sẵn. Khối cũ mà file này thay thế là một ví dụ
// đúng của thứ bị cấm: thẻ "Buồng lái đang chờ" in ba chip "Cờ ưu tiên · Gửi muộn · Mood
// lớp" dưới câu "Sáng nay lớp có:" — ba chip TĨNH, không đọc một con số nào. Với cô giáo
// nó đọc thành "sáng nay lớp mình CÓ cờ ưu tiên", trong khi màn hình không hề biết điều đó.
// Đó là số liệu bịa bằng cách không có số (điều 20).
//
// Nguồn của từng khối, và chỉ những nguồn này:
//
//   chủ nhiệm      → care.getDashboard        (homeroomProcedure — trang chủ đã nạp sẵn)
//   bộ môn         → teaching.getMyClasses    (roleProcedure teacher|homeroom)
//   tâm lý cụm     → care.listClusterCases    (counselorProcedure)
//   hiệu trưởng/HĐ → report.getOperationsOverview (roleProcedure principal|board)
//   quản trị       → admin.miniApp.list       (adminProcedure)
//
// Mỗi truy vấn bật/tắt bằng `enabled` theo ĐÚNG vai mà máy chủ nhận, không phải theo "có
// vẻ là người lớn": bắn một request chắc chắn 403 cho mỗi lần mở trang chủ là một dòng đỏ
// trong log mỗi sáng, và log đỏ thường xuyên là log không ai đọc nữa.
//
// ── PHỤ HUYNH CỐ Ý KHÔNG CÓ KHỐI NÀO ─────────────────────────────────────────
// `guardian` là vai người lớn nhưng không có truy vấn nào ở tầm "toàn cảnh" dành cho họ:
// báo cáo của con đã là một mini app có ô riêng trong lưới, và không có bảng nào khác họ
// đọc được. Một thẻ rail cho phụ huynh hôm nay chỉ có thể là chữ suông. Nên `coRailNguoiLon`
// trả `false`, rail không dựng, và trang tự hẹp lại còn một cột — thay vì một cột trống.
"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import type {
  GetDashboardOutput,
  GetMyTeachingClassesOutput,
  HubRole,
  ListClusterCasesOutput,
  MiniAppRow,
} from "@hub/core/contracts";
import { scanPresentation } from "./gvcn/scan-status";
import { MutationError, SkeletonBlock, StaffVoice } from "./ui/query-state";

/** Vai có khối rail. Liệt kê TƯỜNG MINH — thêm một vai là một quyết định, không phải suy ra. */
const VAI_CO_RAIL: HubRole[] = ["homeroom", "teacher", "counselor", "principal", "board", "admin"];

/**
 * Vai này có gì để vẽ ở cột phải không.
 *
 * Trang chủ đọc hàm này TRƯỚC KHI dựng cột, vì hai câu trả lời dẫn tới hai bố cục khác
 * nhau: có rail thì chia hai cột 1,65 : 1; không có rail thì nội dung chiếm trọn bề ngang.
 * Dựng một cột rồi để nó rỗng là đúng thứ đang bị phàn nàn.
 */
export function coRailNguoiLon(roles: HubRole[]): boolean {
  return roles.some((r) => VAI_CO_RAIL.includes(r));
}

/**
 * Cộng một cột số của màn Điều hành, có tính tới ô BỊ CHE.
 *
 * `report.class_pulse` / `report.grade_pulse` (0040) trả `null` cho nhóm nhỏ hơn
 * `report.min_cohort()` — `null` ở đó nghĩa là "che đi cho khỏi truy ra một em", KHÔNG
 * phải 0. Cộng thẳng bằng `?? 0` là biến phép ẩn danh thành một con số thấp hơn sự thật,
 * rồi in nó ra như một con số đầy đủ. Nên hàm trả về HAI giá trị: tổng của phần đếm được,
 * và số nhóm không đếm được — màn hình có nghĩa vụ nói ra vế thứ hai.
 */
export interface TongCoChe {
  tong: number;
  soNhomBiChe: number;
}
export function congCoChe(gia: Array<number | null>): TongCoChe {
  let tong = 0;
  let soNhomBiChe = 0;
  for (const v of gia) {
    if (v === null) soNhomBiChe += 1;
    else tong += v;
  }
  return { tong, soNhomBiChe };
}

/**
 * Hình dạng `admin.miniApp.list` trả về.
 *
 * Khai tại chỗ vì `packages/core/contracts/admin.ts` chỉ xuất `ListMiniAppsOutput` dưới
 * dạng SCHEMA zod, không xuất kiểu cùng tên (`MiniAppRow` thì có). Khai đúng hai trường mà
 * khối này đọc, không chép cả hợp đồng: chép cả hợp đồng là dựng một bản thứ hai sẽ lạc
 * hậu, còn khai hẹp thì lệch hình dạng nào chạm tới hai trường này vẫn đỏ ở tsc.
 */
interface SoDangKyMiniApp {
  apps: MiniAppRow[];
  soAppCanRaLai: number;
}

/** Ba trạng thái của một khối. Cùng bảng chữ với `statState` của trang chủ. */
type TrangThai = "loading" | "error" | "ready";
function trangThai(q: { isPending: boolean; isError: boolean }): TrangThai {
  if (q.isPending) return "loading";
  if (q.isError) return "error";
  return "ready";
}

// ---------------------------------------------------------------------------

export function CotPhaiNguoiLon({ roles }: { roles: HubRole[] }) {
  const laChuNhiem = roles.includes("homeroom");
  // Chủ nhiệm cũng dạy môn, nhưng khối chủ nhiệm đã nói về đúng lớp của cô sáng nay. Hai
  // thẻ lớp chồng nhau trong một cột 300px là một cột không ai đọc hết.
  const laBoMon = roles.includes("teacher") && !laChuNhiem;
  const laTamLy = roles.includes("counselor");
  const laDieuHanh = roles.includes("principal") || roles.includes("board");
  const laQuanTri = roles.includes("admin");

  const buongLai = trpc.care.getDashboard.useQuery(undefined, { enabled: laChuNhiem });
  const lopDay = trpc.teaching.getMyClasses.useQuery(undefined, { enabled: laBoMon });
  // `limit` để MẶC ĐỊNH (100) chứ không hạ xuống 1: `totals` của procedure đó đếm trên
  // chính mảng `rows` vừa trả về, nên hạ limit là hạ luôn con số. Xem `KhoiTamLy` — chỗ
  // đó nói ra khi chạm trần, không im lặng làm tròn.
  const cum = trpc.care.listClusterCases.useQuery({}, { enabled: laTamLy });
  const toanTruong = trpc.report.getOperationsOverview.useQuery(undefined, { enabled: laDieuHanh });
  const soApp = trpc.admin.miniApp.list.useQuery(undefined, { enabled: laQuanTri });

  if (!coRailNguoiLon(roles)) return null;

  return (
    // <StaffVoice> ở gốc cột: mọi câu lỗi bên trong nói giọng người lớn (§8) mà không chỗ
    // gọi nào phải nhớ truyền prop — cùng lý lẽ với bốn khung màn người lớn đã có.
    <StaffVoice>
      {laChuNhiem && <KhoiChuNhiem q={buongLai} />}
      {laBoMon && <KhoiBoMon q={lopDay} />}
      {laTamLy && <KhoiTamLy q={cum} />}
      {laDieuHanh && <KhoiDieuHanh q={toanTruong} />}
      {laQuanTri && <KhoiQuanTri q={soApp} />}
    </StaffVoice>
  );
}

// ---------------------------------------------------------------------------
// Vỏ chung của một thẻ rail — bốn thể, không thể nào bị bỏ quên
// ---------------------------------------------------------------------------

interface TheProps {
  tieuDe: string;
  trangThai: TrangThai;
  error?: unknown;
  onRetry?: () => void;
  /** Đường đi tiếp. `null` = khối này không dẫn đi đâu (chưa xảy ra, nhưng phải khai được). */
  di?: { href: string; nhan: string } | null;
  children?: React.ReactNode;
}

function TheRail({ tieuDe, trangThai, error, onRetry, di, children }: TheProps) {
  return (
    <div className="rounded-[20px] border border-white bg-white p-[18px] shadow-[0_3px_14px_rgba(10,42,94,.06)]">
      <h2 className="text-[15px] font-black text-navy">{tieuDe}</h2>
      {trangThai === "loading" && (
        // Khung xương, KHÔNG vòng xoay giữa màn (§13 "ưu tiên cảm giác nhanh"): thẻ này
        // cao ~130px và một vòng xoay ở đó làm cột nhảy hai lần mỗi lần tải trang.
        <div role="status" aria-live="polite" className="mt-3 flex flex-col gap-2">
          <span className="sr-only">Đang tải {tieuDe}</span>
          <SkeletonBlock className="h-5 w-3/4" />
          <SkeletonBlock className="h-5 w-1/2" />
        </div>
      )}
      {trangThai === "error" && (
        <div className="mt-3">
          <MutationError error={error} onRetry={onRetry} />
        </div>
      )}
      {trangThai === "ready" && children}
      {trangThai === "ready" && di && (
        <Link
          href={di.href}
          className="mt-3.5 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-surface-alt py-[11px] text-[12.5px] font-extrabold text-link"
        >
          {di.nhan}
          <span aria-hidden="true" className="msr text-[17px]">
            arrow_forward
          </span>
        </Link>
      )}
    </div>
  );
}

/**
 * Một dòng số. `phu` là dòng phụ NGẮN đứng dưới đúng ô số nó nói về — hình dạng mà ADR-030
 * chốt cho mọi câu "số này đang cũ / đang thiếu", thay cho một dải cảnh báo toàn màn.
 */
function DongSo({
  icon,
  nhan,
  so,
  phu,
  manh,
}: {
  icon: string;
  nhan: string;
  so: React.ReactNode;
  phu?: string;
  /** true = con số đang có người chờ mình xử lý. Nền + icon, không phải màu chữ đơn độc. */
  manh?: boolean;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <span
        className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl ${
          manh ? "bg-surface-danger2 text-dangerText" : "bg-surface-info text-domain-attendanceDark"
        }`}
      >
        <span aria-hidden="true" className="msr text-[18px]">
          {icon}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold text-subtle">{nhan}</span>
        {phu && <span className="mt-px block text-[10.5px] text-caption">{phu}</span>}
      </span>
      <span className="text-[17px] font-black text-navy">{so}</span>
    </div>
  );
}

/** Thể RỖNG bên trong một thẻ đã tải xong: nói ra, không để một khoảng trắng. */
function TrongThe({ icon, chu }: { icon: string; chu: string }) {
  return (
    <div role="status" aria-live="polite" className="mt-3 flex items-center gap-2">
      <span aria-hidden="true" className="msr text-[20px] text-line2">
        {icon}
      </span>
      <span className="text-[12px] font-semibold text-subtle">{chu}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Khối theo vai
// ---------------------------------------------------------------------------

type Q<T> = { data: T | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => void };

function KhoiChuNhiem({ q }: { q: Q<GetDashboardOutput> }) {
  const d = q.data;
  // Mốc lượt quét đi kèm ĐÚNG ô số mà nó ảnh hưởng (cờ cần để ý), không phải một dải riêng
  // — RULES.md §8 bắt nói ra khi con số là của lượt quét cũ, ADR-030 chốt hình dạng.
  const quet = d ? scanPresentation(d.scanHealth, d.asOfDate) : null;
  return (
    <TheRail
      tieuDe="Lớp chủ nhiệm"
      trangThai={trangThai(q)}
      error={q.error}
      onRetry={() => void q.refetch()}
      di={d ? { href: "/gvcn/lop", nhan: `Lớp ${d.className}` } : null}
    >
      {d && (
        <>
          <DongSo
            icon="flag"
            nhan="Cần để ý"
            so={d.priorityFlags.length}
            phu={quet?.mocQuet ? `Cập nhật ${quet.mocQuet}` : "Chưa có lượt quét nào"}
            manh={d.priorityFlags.length > 0}
          />
          <DongSo
            icon="hourglass_top"
            nhan="Gửi muộn chờ xác nhận"
            so={d.totals.pendingLateCount}
            manh={d.totals.pendingLateCount > 0}
          />
          <DongSo icon="folder_shared" nhan="Hồ sơ chăm sóc đang mở" so={d.totals.openCareCases} />
        </>
      )}
    </TheRail>
  );
}

function KhoiBoMon({ q }: { q: Q<GetMyTeachingClassesOutput> }) {
  const d = q.data;
  return (
    <TheRail
      tieuDe="Lớp tôi dạy"
      trangThai={trangThai(q)}
      error={q.error}
      onRetry={() => void q.refetch()}
      di={d && d.classes.length > 0 ? { href: "/lop-toi-day", nhan: "Mở danh sách lớp" } : null}
    >
      {d && d.classes.length === 0 && (
        // "Chưa được phân lớp nào" là một sự thật về PHÂN CÔNG, không phải một lỗi. Nó nói
        // luôn cho cô biết phải đi hỏi ai — hai chuyện đó khác nhau và ô trống thì không.
        <TrongThe icon="group_off" chu="Chưa được phân lớp nào" />
      )}
      {d?.classes.slice(0, 3).map((c) => (
        <DongSo
          key={c.classId}
          icon="groups"
          nhan={`Lớp ${c.classCode}`}
          so={`${c.recordedCount}/${c.studentCount}`}
          // "Đã ghi" chứ không phải "Có mặt": `recordedCount` đếm em ĐÃ CÓ một dòng điểm
          // danh ở bất kỳ trạng thái nào trong năm trạng thái ([QĐ-3]).
          phu={c.noRecordCount > 0 ? `${c.noRecordCount} em chưa ai ghi` : "Đã ghi đủ"}
          manh={c.noRecordCount > 0}
        />
      ))}
    </TheRail>
  );
}

function KhoiTamLy({ q }: { q: Q<ListClusterCasesOutput> }) {
  const d = q.data;
  // Trần của procedure: `totals` đếm trên mảng `rows` đã bị `limit` cắt. Chạm trần thì con
  // số in ra là "100+", không phải "100" — một con số tròn trịa hơn sự thật là một con số
  // nói dối, và đây là bảng đếm hồ sơ của trẻ đang mở.
  const chamTran = d ? d.rows.length >= 100 : false;
  const so = (n: number) => (chamTran ? `${n}+` : `${n}`);
  return (
    <TheRail
      tieuDe="Cụm của tôi"
      trangThai={trangThai(q)}
      error={q.error}
      onRetry={() => void q.refetch()}
      di={{ href: "/tam-ly", nhan: "Mở hộp việc" }}
    >
      {d && d.scope.schools.length === 0 && (
        // Rỗng vì CHƯA AI GÁN CỤM khác hẳn rỗng vì cụm đang yên. Procedure phân biệt được
        // hai ca đó (`scope.schools`), nên màn hình không được gộp chúng lại.
        <TrongThe icon="person_off" chu="Chưa được gán cơ sở nào" />
      )}
      {d && d.scope.schools.length > 0 && (
        <>
          <DongSo
            icon="folder_shared"
            nhan="Hồ sơ đang mở"
            so={so(d.totals.openCases)}
            phu={`${d.scope.schools.length} cơ sở`}
          />
          <DongSo
            icon="waving_hand"
            nhan="Cần gặp thầy cô"
            so={so(d.totals.pendingHelp)}
            manh={d.totals.pendingHelp > 0}
          />
        </>
      )}
    </TheRail>
  );
}

function KhoiDieuHanh({ q }: { q: Q<{ grades: Array<{ rosterCount: number; checkedInCount: number | null; noRecordCount: number | null }> }> }) {
  const d = q.data;
  const siSo = d ? d.grades.reduce((n, g) => n + g.rosterCount, 0) : 0;
  const daGhi = congCoChe(d ? d.grades.map((g) => g.checkedInCount) : []);
  const chuaGhi = congCoChe(d ? d.grades.map((g) => g.noRecordCount) : []);
  const thieu = (t: TongCoChe) => (t.soNhomBiChe > 0 ? `Thiếu ${t.soNhomBiChe} khối chưa đủ nhóm` : undefined);
  return (
    <TheRail
      tieuDe="Toàn trường hôm nay"
      trangThai={trangThai(q)}
      error={q.error}
      onRetry={() => void q.refetch()}
      di={{ href: "/dieu-hanh", nhan: "Mở màn Điều hành" }}
    >
      {d && d.grades.length === 0 && <TrongThe icon="apartment" chu="Chưa có khối nào trong phạm vi" />}
      {d && d.grades.length > 0 && (
        <>
          <DongSo icon="school" nhan="Sĩ số" so={siSo} />
          <DongSo icon="event_available" nhan="Đã điểm danh" so={daGhi.tong} phu={thieu(daGhi)} />
          {/* Chưa ai ghi KHÔNG phải vắng ([QĐ-3]) — hai cột khác nhau ở tầng dữ liệu, và
              gộp chúng ở tầng màn hình là dựng lại đúng cái lỗi đã tách ra. */}
          <DongSo
            icon="pending"
            nhan="Chưa ai ghi"
            so={chuaGhi.tong}
            phu={thieu(chuaGhi)}
            manh={chuaGhi.tong > 0}
          />
        </>
      )}
    </TheRail>
  );
}

function KhoiQuanTri({ q }: { q: Q<SoDangKyMiniApp> }) {
  const d = q.data;
  const dangBat = d ? d.apps.filter((a) => a.enabled).length : 0;
  return (
    <TheRail
      tieuDe="Sổ đăng ký Mini App"
      trangThai={trangThai(q)}
      error={q.error}
      onRetry={() => void q.refetch()}
      di={{ href: "/quan-tri/mini-app", nhan: "Mở sổ đăng ký" }}
    >
      {d && d.apps.length === 0 && <TrongThe icon="space_dashboard" chu="Sổ chưa có app nào" />}
      {d && d.apps.length > 0 && (
        <>
          <DongSo icon="space_dashboard" nhan="App đang bật" so={`${dangBat}/${d.apps.length}`} />
          {/* `soAppCanRaLai` do MÁY CHỦ đếm (mục 5 của 08-embedded-apps: rà lại mỗi 6
              tháng). Màn hình không tự trừ ngày — luật nghiệp vụ tính ở tầng hiển thị thì
              mỗi màn tính một kiểu. */}
          <DongSo
            icon="rule"
            nhan="Tới hạn rà lại"
            so={d.soAppCanRaLai}
            manh={d.soAppCanRaLai > 0}
          />
        </>
      )}
    </TheRail>
  );
}
