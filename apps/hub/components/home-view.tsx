// Trang chủ chung (P1 GĐ1) — DESIGN-GUIDELINES §1: MỘT trang chủ, lưới mini app
// đổi theo quyền, không có "trang chủ riêng cho từng vai trò".
//
// Hai bố cục THẬT SỰ khác nhau theo khung, không phải co giãn một bản:
// - Mobile (<md, khớp Hub Mobile.dc.html M3): một cột, thẻ check-in trồi lên
//   vòm, tab bar dưới cùng.
// - Desktop (≥md, khớp Hub Desktop V2.dc.html V2, 29/07/2026): sidebar 240px cố
//   định (HubSidebar) + hero có ô tìm kiếm/chuông + 3 thẻ số liệu thật + thẻ
//   check-in hiện nguyên lưới cảm xúc ngay trên trang (không cần bấm mới thấy).
//
// Sửa 31/07/2026 (gói "frontend-trang-thai"), ba lỗi:
//
//  1. LỖI ĐƯỢC TRÌNH BÀY THÀNH SỐ 0 NHƯ SỐ THẬT. Không chỗ nào đọc isPending/isError,
//     và `?? 0` biến thất bại thành con số: "0/5 ngày tuần này", "0 chuỗi check-in",
//     hai thanh tiến độ rỗng. Đây đi ngược Rev F điều 8 của RULES.md ("không suy tin
//     tốt từ im lặng") — mà còn tệ hơn: nó suy ra tin XẤU từ im lặng, rồi nói tin xấu
//     đó với chính đứa trẻ ("tuần này con chưa đi học buổi nào"). Nay: đang tải →
//     ô xám; lỗi → dấu "—" kèm một dòng nói rõ là chưa tải được.
//
//  2. NÚT CHECK-IN HIỆN CẢ KHI ĐÃ CHECK-IN. `checkedInToday` là undefined trong lúc
//     query chạy và mãi mãi undefined khi query hỏng, mà điều kiện là `!checkedInToday`
//     — nên em đã check-in vẫn thấy nút và bấm lần hai. §9 chặn được bản ghi đôi ở
//     tầng dữ liệu, nhưng em thì vẫn bị hỏi lại "hôm nay con thấy thế nào?" sau khi
//     vừa trả lời. Nay nút chỉ hiện khi truy vấn ĐÃ THÀNH CÔNG và trả về false.
//
//  3. AFFORDANCE GIẢ. Ô "Tìm mini app, hoạt động…" là <div>+<span> không focus được,
//     bấm không có gì xảy ra; chuông thông báo là <Link href="/ho-so"> nên bấm chuông
//     lại ra trang Hồ sơ (bản mobile là <span> trần, bấm không ra gì). Cả hai đã gỡ:
//     GĐ1 chưa có tìm kiếm và chưa có thông báo, vẽ ra chỗ bấm không dẫn tới đâu chỉ
//     dạy người dùng rằng giao diện này không đáng tin.
//
// Sửa 31/07/2026 (gói "giong-noi-va-don-dep"), ba việc:
//
//  1. GIỌNG. Popup check-in nói với đứa trẻ "Chỉ GVCN của con nhìn thấy" — "GVCN" là
//     từ vựng hành chính, DESIGN-GUIDELINES §8 chỉ cho nó sống ở buồng lái/tâm lý/điều
//     hành. Lúc đó câu thay thế là "Chỉ thầy cô chủ nhiệm thấy" — ĐÃ HẾT ĐÚNG từ
//     01/08/2026, xem ADR-026 và chú thích ở chỗ in nhãn bên dưới. Ghi lại thay vì
//     sửa đè: đoạn này kể một lần sửa GIỌNG, và cái sai lúc đó là chữ "GVCN" chứ
//     không phải phạm vi người đọc.
//     Kèm theo: lời chào gọi tên người bằng personName() — trước đây /home in nguyên
//     "Chào Cô Lan (GVCN 6A1) 👋" (full_name kèm hậu tố chức danh) trong khi /gvcn đã
//     gọi đúng "Chào Cô Lan"; và 👋 chỉ dành cho học sinh (§4: emoji chỉ trong lời chào
//     học sinh, tiết chế).
//
//  2. DỰNG MỘT NHÁNH, KHÔNG DỰNG HAI RỒI ẨN. Trang này có hai bố cục THẬT SỰ khác nhau,
//     trước đây cả hai cùng nằm trong DOM (`md:hidden` + `hidden md:flex`): HTML của
//     /home chứa chữ "Mini App" hai lần, mỗi lần dữ liệu đổi React đối chiếu hai cây,
//     và điện thoại rẻ tiền trả tiền cho cây desktop nó không bao giờ nhìn thấy. Nay
//     hỏi khổ màn một lần bằng useIsDesktop() (lib/viewport.ts) rồi dựng đúng một nhánh.
//
//  Kèm theo (bắt buộc, không phải tiện tay): bản mobile nay dựng <HubTabBar> cho MỌI vai
//  thay vì chỉ học sinh. Trước đây người lớn ở trang chủ trên điện thoại không có đường
//  nào tới /ho-so — trang duy nhất có nút Đăng xuất. Từ khi trang chỉ dựng một nhánh,
//  nhánh mobile còn là thứ chạy trước hydrate ở MỌI khổ màn, nên nó không được phép là
//  một trang không lối ra.
//
//  3. HÂM SẴN BUỒNG LÁI. GVCN đăng nhập vào /home rồi bấm tile Buồng lái; trước đây
//     care.getDashboard chỉ bắt đầu chạy SAU khi /gvcn đã hydrate xong, đúng vào 2 phút
//     đầu giờ. Nay /home tự nạp trước dữ liệu đó (staleTime 60s của REACT_QUERY_DEFAULTS
//     đủ để lần bấm sau dùng lại) — chỉ cho vai homeroom, không tốn request của ai khác.
//
// ═══════════════════════════════════════════════════════════════════════════════
// Sửa 06/08/2026 — NỬA MÀN PHẢI CỦA VAI NGƯỜI LỚN
// ═══════════════════════════════════════════════════════════════════════════════
// Chủ đầu tư mở /home bằng tài khoản quản trị rồi tài khoản giáo viên: "thiếu thiếu gì á
// — thiếu nút tìm mini app, cột bên kia thiếu khung gì đó, thiếu chuông thông báo góc
// phải; không chỉ admin, giáo viên cũng thiếu". Bốn thay đổi, và cả bốn đều dựng trên dữ
// liệu ĐANG CÓ, không mở thêm một quyền nào:
//
//  A. CỘT PHẢI (components/cot-phai-nguoi-lon.tsx). DESIGN.md quy định bố cục máy tính là
//     nội dung `flex 1.6–1.7` + rail `flex 1`; trang chủ người lớn không có rail nào nên
//     nửa màn phải trống. Nhân đây sửa luôn TỈ LỆ: hai cột đang là `flex-[3]` và
//     `flex-[1]` — tức 3:1, ngoài dải đã duyệt. Nay 1,65:1 cho CẢ HAI nhánh vai, vì đó là
//     một luật của bố cục chứ không phải một lựa chọn theo vai.
//
//  B. CHUÔNG (components/chuong-viec-cho.tsx) đọc `session.getPendingWork`. Cái chuông bị
//     gỡ ngày 31/07 là một `<Link href="/ho-so">`; cái này dẫn tới đúng màn xử việc, và
//     đường đi do MÁY CHỦ trả về chứ không do màn hình ghép.
//
//  C. Ô TÌM MINI APP (components/tim-mini-app.tsx) chỉ hiện từ `NGUONG_HIEN_O_TIM` app trở
//     lên. Hôm nay hệ có 2 app, nên ở khổ hiện tại nó KHÔNG hiện — đúng như thiết kế.
//
//  D. Thẻ "Buồng lái đang chờ" cũ ĐÃ GỠ. Nó in ba chip tĩnh "Cờ ưu tiên · Gửi muộn · Mood
//     lớp" dưới câu "Sáng nay lớp có:" mà không đọc một con số nào — với cô giáo nó đọc
//     thành "sáng nay lớp mình CÓ cờ ưu tiên", trong khi màn hình không hề biết điều đó.
//     Chỗ của nó nay là khối "Lớp chủ nhiệm" trong rail, với ba con số thật từ
//     `care.getDashboard` và mốc lượt quét đứng ngay dưới ô số nó ảnh hưởng (ADR-030).
//     Dòng "Mở Bảng điều khiển để xem lớp sáng nay" ở bản điện thoại gỡ cùng lượt: nó chỉ
//     đường bằng chữ tới một ô tile đang hiện cách đó 3cm.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { useIsDesktop } from "@/lib/viewport";
import type { HubRole, MiniAppTile as MiniAppTileType, MoodValue } from "@hub/core/contracts";
import { MOOD_LABEL } from "@hub/core/contracts";
import { MiniAppTile } from "./mini-app-tile";
import { MOOD_STYLE } from "./mood-tile";
import { BuongLaiMau } from "./buong-lai-mau";
import { useCongCheckin } from "./cong-checkin";
import { HubTabBar } from "./tab-bar";
import { Mascot } from "./mascot";
import { HubSidebar } from "./hub-sidebar";
import { MainContent } from "./page-shell";
import { ChuongViecCho, useViecCho, type ViecChoQuery } from "./chuong-viec-cho";
import { CotPhaiNguoiLon, coRailNguoiLon } from "./cot-phai-nguoi-lon";
import { OTimMiniApp, useLocMiniApp, type LuoiDaLoc } from "./tim-mini-app";
import { personName } from "./ui/labels";
import { MutationError, SkeletonBlock } from "./ui/query-state";

/**
 * Ba trạng thái của MỘT con số trên trang chủ. Tách ra khỏi JSX vì đây là chỗ đã
 * sai: `value ?? 0` gộp "đang tải" và "hỏng" vào chung một con số có thật.
 */
export type StatState = "loading" | "error" | "ready";

export function statState(query: { isPending: boolean; isError: boolean }): StatState {
  if (query.isPending) return "loading";
  if (query.isError) return "error";
  return "ready";
}

interface HomeData {
  displayName: string;
  email: string;
  /** Vai thật — bản mobile cần để dựng đúng bộ tab (tab-bar.tsx: resolveTabs). */
  roles: HubRole[];
  isStudent: boolean;
  isHomeroom: boolean;
  today: string;
  miniApps: MiniAppTileType[];
  checkedInToday?: boolean;
  checkedInAt?: string | null;
  streakDays?: number;
  checkinDaysThisWeek?: number;
  happyDaysThisWeek?: number;
  /** Trạng thái của checkin.getTodayStatus — quyết định có hiện nút Check-in không. */
  todayState: StatState;
  /** Trạng thái của report.getMyLatestReport — nguồn của hai con số "tuần này". */
  weekState: StatState;
  /** Bấm để tải lại hai truy vấn số liệu. */
  retryStats: () => void;
  /** Nguồn DUY NHẤT của chuông góc phải hero (session.getPendingWork). */
  viecCho: ViecChoQuery;
}

/**
 * Trang chủ này KHÔNG còn việc nào để nói với người đang xem hay không.
 *
 * Ba vế, và phải đủ cả ba: lưới không có ô nào · vai không có khối rail nào · chuông đã
 * tải xong và trả về rỗng. Vế thứ ba đòi `đã tải xong` chứ không phải `không có việc`:
 * lúc query còn chạy hoặc vừa hỏng, "không có việc" là một kết luận dựng từ im lặng —
 * đúng thứ Rev F điều 8 của RULES.md cấm.
 */
export function manRong(d: {
  soApp: number;
  roles: HubRole[];
  viecCho: { isPending: boolean; isError: boolean; soMuc: number };
}): boolean {
  const chuongDaTraLoi = !d.viecCho.isPending && !d.viecCho.isError;
  return d.soApp === 0 && !coRailNguoiLon(d.roles) && chuongDaTraLoi && d.viecCho.soMuc === 0;
}

export function HomeView({
  displayName,
  email,
  isStudent,
  isHomeroom,
  roles,
  classCode,
  initialMiniApps,
  khoManBanDau,
}: {
  displayName: string;
  email: string;
  isStudent: boolean;
  isHomeroom: boolean;
  /** Vai THẬT của phiên. Trước đây sidebar chỉ nhận "student" | "teacher" nên tài
   *  khoản quản trị/hiệu trưởng/phụ huynh đều rơi vào nhánh menu GVCN. */
  roles: HubRole[];
  classCode?: string | null;
  /** Lưới tính sẵn phía server (app/home/page.tsx) — có mặt ngay từ HTML đầu tiên. */
  initialMiniApps: MiniAppTileType[];
  /**
   * Khổ màn trình duyệt tự khai (`Sec-CH-UA-Mobile`). `null` = nó không khai.
   * Chỉ dùng cho LƯỢT VẼ ĐẦU; sau hydrate `useIsDesktop()` giành lại quyền quyết định.
   */
  khoManBanDau: boolean | null;
}) {
  // initialData chứ không phải "đợi query xong": lưới vẽ đúng ngay lần sơn đầu, query chỉ
  // xác nhận lại. Không có nó, miniApps là [] trong ~1s → hiện "0 app" với ô trống rồi mới
  // nhảy sang 2 app, trang giật một nhịp thấy rõ (30/07/2026).
  const miniAppsQuery = trpc.session.miniApps.useQuery(undefined, { initialData: initialMiniApps });
  const todayStatus = trpc.checkin.getTodayStatus.useQuery(undefined, { enabled: isStudent });
  const growthReport = trpc.report.getMyLatestReport.useQuery(undefined, { enabled: isStudent });
  const today = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const khoManThat = useIsDesktop();
  // HAI LƯỢT VẼ, CÓ CHỦ Ý — và thứ tự là toàn bộ điểm của nó.
  //
  // Lượt đầu (cả trên máy chủ lẫn lượt hydrate đầu tiên của trình duyệt) dùng GỢI Ý của
  // trình duyệt. Hai bên phải cho ra CÙNG một cây, nếu không React kêu "hydration
  // mismatch" và vứt cả cây đi dựng lại — đắt hơn hẳn cú nháy đang muốn sửa. Vì thế
  // `daHydrate` khởi tạo `false` ở CẢ hai phía, và chỉ effect mới bật nó.
  //
  // Từ lượt hai trở đi, `useIsDesktop()` (đo bề rộng thật bằng matchMedia) quyết định —
  // vì gợi ý chỉ nói "máy này có phải điện thoại không", không nói cửa sổ rộng bao nhiêu.
  const [daHydrate, setDaHydrate] = useState(false);
  useEffect(() => setDaHydrate(true), []);
  const isDesktop = daHydrate ? khoManThat : khoManBanDau === true;
  // Chuông chỉ dựng cho vai người lớn ở màn này (xem `khoiChoVai`), nên truy vấn cũng chỉ
  // chạy cho họ. Máy chủ CÓ trả mục cho học sinh và phụ huynh; đưa chuông vào nhánh học
  // sinh là việc của gói giữ màn đó, không phải một dòng sửa kèm ở đây.
  const viecCho = useViecCho(!isStudent);

  // Hâm sẵn buồng lái cho GVCN — xem ghi chú 3 đầu file. `prefetch` không ném lỗi ra
  // màn hình: hỏng thì /gvcn tự tải lại như trước, người dùng không thấy gì khác.
  const utils = trpc.useUtils();
  const router = useRouter();
  useEffect(() => {
    if (!isHomeroom || isStudent) return;
    router.prefetch("/gvcn");
    void utils.care.getDashboard.prefetch(undefined).catch(() => {});
  }, [isHomeroom, isStudent, router, utils]);

  const data: HomeData = {
    // Gọi TÊN, không gọi chức danh: core.users.full_name mang hậu tố "(GVCN 6A1)" nên
    // in thẳng ra là vừa dài vừa lọt từ vựng vận hành vào lời chào. Không có tên sạch
    // thì mới dùng lại chuỗi gốc — không bao giờ để trống lời chào.
    displayName: personName(displayName) || displayName,
    email,
    roles,
    isStudent,
    isHomeroom,
    today,
    miniApps: miniAppsQuery.data ?? [],
    checkedInToday: todayStatus.data?.checkedInToday,
    checkedInAt: todayStatus.data?.checkedInAt,
    streakDays: todayStatus.data?.streakDays,
    checkinDaysThisWeek: growthReport.data?.report.checkinDaysThisWeek,
    happyDaysThisWeek: growthReport.data?.report.happyDaysThisWeek,
    // `enabled: isStudent` → với vai khác hai query đứng yên ở isPending mãi mãi;
    // coi là "ready" để không hiện ô xám vĩnh viễn ở chỗ chúng không được dùng.
    todayState: isStudent ? statState(todayStatus) : "ready",
    weekState: isStudent ? statState(growthReport) : "ready",
    retryStats: () => {
      void todayStatus.refetch();
      void growthReport.refetch();
    },
    viecCho,
  };

  // MỘT nhánh, không hai. `md:hidden`/`hidden md:flex` vẫn dựng cả hai cây trong DOM —
  // xem ghi chú 2 đầu file và lib/viewport.ts.
  if (!isDesktop) return <MobileHome data={data} />;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex w-[240px] flex-none">
        <HubSidebar roles={roles} active="home" fullName={displayName} email={email} classCode={classCode} />
      </div>
      {/* Menu trái nằm NGOÀI <MainContent>, nếu không thì đường tắt "Bỏ qua menu" không bỏ
          qua được gì. Hai nhánh khổ màn loại trừ nhau (useIsDesktop), nên mỗi nhánh một
          <MainContent> vẫn giữ đúng luật "một trang một id noi-dung". */}
      <MainContent className="flex min-w-0 flex-1 overflow-hidden">
        <DesktopHome data={data} />
      </MainContent>
    </div>
  );
}

/**
 * Một con số ở hero: đang tải → ô xám; hỏng → "—"; xong → số thật.
 * KHÔNG có nhánh nào trả về 0 khi chưa biết.
 */
/**
 * KHỐI NÀO hiện với người đang xem — quyết định MỘT LẦN, hai cây cùng đọc.
 *
 * Vì sao cần, dù hai cây bố cục là chuyện đúng: trang này cố ý dựng hai cây riêng cho
 * điện thoại và máy tính (xem ghi chú 2 ở đầu file — dựng cả hai rồi ẩn bằng CSS khiến
 * máy yếu trả tiền cho cây nó không bao giờ thấy). Cái giá của quyết định đó là mọi câu
 * "ai thấy khối này" bị viết HAI LẦN, và hai lần thì có ngày lệch.
 *
 * Đã lệch thật, và chú thích ngay trong file này ghi lại: bản mobile có `relative z-[2]`
 * từ đầu, bản desktop sót — chữ "Mini App" bị nền navy cắt ngang, và CHỈ vai người lớn
 * nhìn thấy (ảnh chụp của Cô Hạnh, 31/07/2026).
 *
 * PHẢI NÓI RÕ GIỚI HẠN: hàm này chỉ gom được câu hỏi "khối này có hiện không". Nó KHÔNG
 * chặn được ca vừa kể — đó là lệch KIỂU DÁNG, và không cấu trúc nào bắt được. Thứ bắt
 * được ca đó là mở cả hai khổ màn ra nhìn: `tools/ra-mobile.js`.
 */
export function khoiChoVai(data: { isStudent: boolean; isHomeroom: boolean }) {
  return {
    theCheckin: data.isStudent,
    tuanNay: data.isStudent,
    /**
     * Chuông "việc đang chờ" + cột phải theo vai. `!isStudent` chứ không phải một danh
     * sách vai: đây là câu hỏi "màn này đang nói với ai", và nó chỉ có hai câu trả lời.
     * VAI NÀO thấy khối nào TRONG rail là câu hỏi thứ hai, và nó ở `coRailNguoiLon` —
     * gộp hai câu hỏi vào một chỗ là cách một trong hai bị nuốt.
     *
     * Vế `!isStudent` giữ nguyên tinh thần phép so cũ (`isHomeroom && !isStudent`): một em
     * học sinh đồng thời là GVCN không tồn tại trong dữ liệu thật, nhưng nếu dữ liệu hỏng
     * mà ra tổ hợp đó thì màn của EM phải thắng — em không được thấy việc của buồng lái.
     */
    khoiNguoiLon: !data.isStudent,
  };
}

/**
 * Lời chào. MỘT chỗ soạn câu, hai cây chỉ khác cỡ chữ.
 *
 * 👋 chỉ đi với lời chào HỌC SINH (§4: emoji tiết chế, chỉ ở đó) — cùng dòng chữ này còn
 * chào hiệu trưởng và kế toán lúc 7 giờ sáng. Trước 02/08/2026 câu này viết hai lần, nên
 * luật "emoji chỉ cho học sinh" cũng có hai bản.
 */
function LoiChao({ ten, laHocSinh }: { ten: string; laHocSinh: boolean }) {
  return (
    <>
      Chào {ten}
      {laHocSinh ? " 👋" : ""}
    </>
  );
}

function StatValue({ state, value, width }: { state: StatState; value: string; width: string }) {
  if (state === "loading") return <SkeletonBlock className={`${width} h-6`} />;
  if (state === "error") return <>—</>;
  return <>{value}</>;
}

/**
 * LƯỚI MINI APP — ba thể, MỘT bản cài đặt cho hai cây bố cục.
 *
 * Ba thể là ba câu khác nhau, và trước hôm nay cả ba đều vẽ ra cùng một thứ (một `<div>`
 * lưới, rỗng thì rỗng):
 *   · có app        → lưới 4 cột, giữ nguyên ở cả hai khổ (§6).
 *   · lọc không ra  → lỗi của TỪ KHOÁ, sửa được bằng một cú bấm ngay tại chỗ.
 *   · không có app  → sự thật về TÀI KHOẢN, không sửa được bằng cách gõ lại.
 *
 * Gộp hai thể rỗng cuối là để người dùng tự đoán mình đang ở ca nào — và đoán sai theo
 * hướng tệ hơn: "hệ thống này chẳng có gì".
 */
function LuoiMiniApp({
  loc,
  tongApp,
  laQuanTri,
  rongCaMan,
  oTimTrongThe,
  sang = false,
}: {
  loc: LuoiDaLoc;
  /** Số app THẬT của tài khoản — không phải số sau khi lọc. */
  tongApp: number;
  laQuanTri: boolean;
  /** Cả trang không còn gì khác để nói (xem `manRong`) — thêm một lối đi thứ hai. */
  rongCaMan: boolean;
  /** Khổ điện thoại đặt ô tìm trong thẻ này; khổ máy tính đặt nó ở hero. */
  oTimTrongThe: boolean;
  /**
   * Thẻ chứa là thẻ TRẮNG của skin HUD (24/08/2026)? Token chữ của app nay là bảng tối
   * (text-ink #EAF2FF…) — đặt nguyên xi vào thẻ trắng là chữ trắng trên nền trắng. Khổ
   * máy tính truyền true; khổ điện thoại giữ nền tối, không truyền gì.
   */
  sang?: boolean;
}) {
  const mau = sang
    ? { chu: "text-[#0A2A5E]", phu: "text-[#33507C]", nut: "bg-[#E8F1FC] text-[#1E5FB8]" }
    : { chu: "text-ink", phu: "text-caption", nut: "bg-surface-alt text-link" };
  return (
    <>
      {oTimTrongThe && loc.hienOTim && (
        <div className="mb-3">
          <OTimMiniApp tuKhoa={loc.tuKhoa} datTuKhoa={loc.datTuKhoa} nen="the" />
        </div>
      )}

      {tongApp > 0 && !loc.locKhongRa && (
        <div className="grid grid-cols-4 gap-3 py-1.5">
          {loc.luoi.map((tile) => (
            <MiniAppTile key={tile.key} tile={tile} />
          ))}
        </div>
      )}

      {loc.locKhongRa && (
        <div role="status" aria-live="polite" className="flex flex-col items-start gap-2 py-4">
          <span className={`flex items-center gap-2 text-[12.5px] font-extrabold ${mau.chu}`}>
            <span aria-hidden="true" className={`msr text-[19px] ${mau.phu}`}>search_off</span>
            Không app nào khớp từ khoá
          </span>
          <button
            type="button"
            onClick={() => loc.datTuKhoa("")}
            className={`flex min-h-[44px] items-center rounded-xl px-4 text-[12.5px] font-extrabold ${mau.nut}`}
          >
            Xoá từ khoá
          </button>
        </div>
      )}

      {tongApp === 0 && (
        <div role="status" aria-live="polite" className="flex flex-col items-start gap-2 py-4">
          <span className={`flex items-center gap-2 text-[12.5px] font-extrabold ${mau.chu}`}>
            <span aria-hidden="true" className={`msr text-[19px] ${mau.phu}`}>space_dashboard</span>
            Tài khoản này chưa có mini app nào
          </span>
          {laQuanTri && (
            // Quản trị là vai DUY NHẤT sửa được tình trạng này, và sổ đăng ký bật/tắt app
            // trong mười giây. Với vai khác thì đây là một sự thật về phân quyền, không
            // phải một việc chờ họ làm — nên không có nút nào giả vờ ngược lại.
            <Link
              href="/quan-tri/mini-app"
              className={`flex min-h-[44px] items-center rounded-xl px-4 text-[12.5px] font-extrabold ${mau.nut}`}
            >
              Mở sổ đăng ký Mini App
            </Link>
          )}
          {rongCaMan && !laQuanTri && (
            // Không có app, không có việc, không có khối rail nào: nếu chỗ này cũng không
            // dẫn đi đâu thì /home là một màn cụt — trang duy nhất mọi vai đi qua sau khi
            // đăng nhập lại là trang không đi tiếp được (điều 21).
            <Link
              href="/ho-so"
              className={`flex min-h-[44px] items-center rounded-xl px-4 text-[12.5px] font-extrabold ${mau.nut}`}
            >
              Hồ sơ và trợ giúp
            </Link>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Mobile — M3: hero cong, thẻ check-in trồi lên vòm, tab bar dưới cùng.
// ---------------------------------------------------------------------------
function MobileHome({ data }: { data: HomeData }) {
  const khoi = khoiChoVai(data);
  const loc = useLocMiniApp(data.miniApps);
  const rongCaMan = manRong({
    soApp: data.miniApps.length,
    roles: data.roles,
    viecCho: {
      isPending: data.viecCho.isPending,
      isError: data.viecCho.isError,
      soMuc: data.viecCho.data?.items.length ?? 0,
    },
  });
  return (
    <div className="flex min-h-screen w-full flex-col bg-pagebg">
      {/* Thanh tab ở cuối nằm NGOÀI vùng này — nó là điều hướng, không phải nội dung. */}
      <MainContent className="flex flex-1 flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-light pb-[54px]">
        <div
          aria-hidden
          className="absolute -right-11 -top-[72px] h-[190px] w-[190px] rounded-full"
          style={{ background: "radial-gradient(circle at 36% 36%, rgba(255,198,41,.55), rgba(255,198,41,.06) 72%)" }}
        />
        <div className="relative flex items-center gap-3 px-5 pt-4">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-[15px] font-black text-cardtitle">
            {data.displayName.slice(0, 1)}
          </div>
          <div className="flex-1">
            {/* Tiêu đề trang, không phải chữ to: trước đây /home không có <h1> nào, trình
                đọc màn hình mở ra không có cách nào biết đây là trang gì ngoài đọc tuần tự
                từ đầu. Chỉ đổi THẺ, giữ nguyên class — hình dạng không đổi một pixel. */}
            <h1 className="text-[17px] font-black text-white">
              <LoiChao ten={data.displayName} laHocSinh={data.isStudent} />
            </h1>
            <div className="mt-0.5 text-[11.5px] text-[#C7D8F0]">{data.today}</div>
          </div>
          {/* Chuông cũ bị gỡ 31/07/2026 vì ở đây nó là <span> trần — bấm không ra gì. Bản
              này đọc `session.getPendingWork` và mỗi dòng dẫn tới đúng màn xử việc. */}
          {khoi.khoiNguoiLon && <ChuongViecCho work={data.viecCho} />}
        </div>
      </div>
      <div className="relative -mt-8 h-8 rounded-t-[100%] bg-pagebg" aria-hidden />

      <div className="flex flex-1 flex-col px-4">
        {khoi.theCheckin && <CheckinCardMobile data={data} />}

        <h2 className="mt-4 mb-2 text-[14px] font-black text-cardtitle">Mini App</h2>
        {/* Ô tìm đứng NGAY TRÊN thứ nó lọc ở khổ này. Bản máy tính đặt nó ở hero cạnh
            chuông (brief mục 5.1) — hero 390px không còn chỗ cho một ô nhập bên cạnh tên
            người dùng, và một ô tìm nằm cách xa lưới nó lọc là một ô người ta phải học
            cách dùng. Cùng MỘT component, hai chỗ đứng. */}
        <LuoiMiniApp
          loc={loc}
          tongApp={data.miniApps.length}
          laQuanTri={data.roles.includes("admin")}
          rongCaMan={rongCaMan}
          oTimTrongThe
        />

        {data.isStudent && (
          <>
            <GrowthBanner />
            {/* Chuỗi chỉ hiện khi biết chắc — không có nó thì bỏ thẻ, không hiện "0 ngày". */}
            {data.todayState === "ready" && data.streakDays !== undefined && (
              <StreakCard streakDays={data.streakDays} />
            )}
          </>
        )}

        {/* Cột phải của khổ máy tính, ở đây XẾP XUỐNG DƯỚI nội dung chứ không biến mất:
            trên điện thoại nó là khối duy nhất nói cho cô biết sáng nay lớp có gì. */}
        {khoi.khoiNguoiLon && (
          <div className="mt-4 flex flex-col gap-3 pb-2">
            <CotPhaiNguoiLon roles={data.roles} />
          </div>
        )}
      </div>
      </MainContent>

      {/* Thanh điều hướng của MỌI vai, không riêng học sinh (tab-bar.tsx chọn bộ tab
          theo vai). Trước đây chỉ học sinh có thanh này, nên trên điện thoại phụ huynh,
          GVCN, tâm lý cụm và quản trị đứng ở trang chủ mà không có đường nào tới /ho-so
          — trang DUY NHẤT có nút Đăng xuất. Kể từ khi trang này dựng một nhánh theo khổ
          màn, đây còn là lưới an toàn cho cả khung máy tính: nhánh desktop (có menu trái)
          chỉ dựng sau hydrate, nên HTML đầu tiên phải tự mang được đường đi của nó. */}
      <HubTabBar roles={data.roles} fullName={data.displayName} email={data.email} />
    </div>
  );
}

function CheckinCardMobile({ data }: { data: HomeData }) {
  const { moCheckin, dangKhoa } = useCongCheckin();
  // KHÔNG hỏi lần thứ hai khi popup đang hỏi (sửa 21/08/2026). Đo được trong HTML thật:
  // popup hỏi "Hôm nay con thấy thế nào?" trong khi thẻ này hỏi "Check-in cảm xúc · Đang
  // xem hôm nay con đã check-in chưa…" — cùng một việc, cùng một lúc, hai chỗ.
  //
  // Chỉ ẩn lúc ĐANG KHOÁ, không ẩn hẳn: khai xong thì thẻ này là chỗ duy nhất ở khổ máy
  // tính (không có thanh tab) để em mở lại popup mà đổi tâm trạng.
  if (dangKhoa) return null;
  return (
    <div className="relative z-[2] -mt-[46px] flex flex-col gap-2.5 rounded-[22px] bg-card p-3.5 shadow-[0_14px_32px_rgba(10,42,94,.14)]">
      <div className="flex items-center justify-between">
        <h2 className="text-[14.5px] font-black text-cardtitle">Check-in cảm xúc</h2>
        <span className="rounded-full bg-surface-warn px-2.5 py-1 text-[10px] font-black text-gold-text">TRƯỚC 8:00</span>
      </div>
      <div className="flex items-center gap-2.5">
        <Mascot pose="wave" width={42} />
        <p className="flex-1 text-[12px] leading-relaxed text-muted2">
          {data.todayState === "loading"
            ? "Đang xem hôm nay con đã check-in chưa…"
            : data.todayState === "error"
              ? "Chưa xem được hôm nay con đã check-in chưa."
              : data.checkedInToday
                ? "Đã check-in hôm nay, cảm ơn em!"
                : "Hôm nay con thấy thế nào?"}
        </p>
      </div>
      {/* Chỉ mời check-in khi BIẾT CHẮC là chưa check-in. Trước đây `!checkedInToday`
          đúng cả khi chưa biết → em đã check-in vẫn bị hỏi lại. */}
      {data.todayState === "ready" && data.checkedInToday === false && (
        // min-h-[44px] (§11, WCAG 2.5.8): đo thật ra 42px cho nút này và 36px cho nút
        // "Thử lại" bên dưới. Padding dọc một mình không kéo đủ chiều cao, nên min-h
        // đi kèm flex căn giữa để chữ không dính mép khi ô cao hơn nội dung.
        // NÚT, KHÔNG PHẢI LINK (21/08/2026): check-in nay là popup mở ngay tại chỗ,
        // không phải một trang để đi tới. Mũi tên "→" cũng bỏ theo — nó là ký hiệu của
        // "đi sang chỗ khác", và ở đây không đi đâu cả.
        <button
          type="button"
          onClick={moCheckin}
          aria-haspopup="dialog"
          className="flex min-h-[44px] items-center justify-center rounded-[13px] bg-gradient-to-br from-navy to-navy-light py-3 text-center text-[13.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)]"
        >
          Check-in ngay
        </button>
      )}
      {data.todayState === "error" && (
        <button
          type="button"
          onClick={data.retryStats}
          className="flex min-h-[44px] items-center justify-center rounded-[13px] border-[1.5px] border-line2 py-2.5 text-center text-[12.5px] font-extrabold text-link"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop — Hub Desktop V2 (29/07/2026): sidebar bên ngoài (HomeView) + hero
// tìm kiếm/chuông/3 thẻ số liệu + check-in hiện lưới cảm xúc ngay trên trang +
// rail phải "Tuần này của mình" (số thật) + "Hôm nay" (chỉ sự kiện thật, không
// bịa lịch CLB/đọc sách — GĐ1 chưa có dữ liệu đó).
// ---------------------------------------------------------------------------
function DesktopHome({ data }: { data: HomeData }) {
  const khoi = khoiChoVai(data);
  const loc = useLocMiniApp(data.miniApps);
  const rongCaMan = manRong({
    soApp: data.miniApps.length,
    roles: data.roles,
    viecCho: {
      isPending: data.viecCho.isPending,
      isError: data.viecCho.isError,
      soMuc: data.viecCho.data?.items.length ?? 0,
    },
  });

  // SKIN "SCI-FI HUD" (24/08/2026) — chủ đầu tư: "trang home bây giờ không phải theme
  // đen, mà là cái theme tôi đã gửi". Toàn bộ lớp hv-*/s-home nằm ở globals.css, chép
  // từ TRẠNG THÁI CASCADE CUỐI của bản thiết kế (xem khối chú thích ở đó): trang trắng,
  // đầu trang "command strip" navy, chip số liệu tối, thẻ trắng vát góc, check-in vàng
  // kem. NỘI DUNG và luật dữ liệu theo vai giữ nguyên — chỉ da đổi:
  //   · lịch hôm nay + cột phải người lớn vẫn đứng trong rail (thẻ token tối của chúng
  //     đứng được trên nền trắng vì chính bản vẽ cũng trộn thẻ tối/sáng);
  //   · lưới mini app vẫn là sổ đăng ký thật (KHÔNG có tile "GĐ2" bịa như bản vẽ —
  //     lệnh gỡ tile giả trước đây vẫn đứng);
  //   · ba trạng thái loading/error/ready của từng con số giữ nguyên luật "không suy
  //     số 0 từ im lặng".
  return (
    <div className="s-home flex min-w-0 flex-1 flex-col overflow-hidden">
      <UfoBay />
      <div className="flex-1 overflow-y-auto px-7 pb-[26px] pt-[18px]">
        <header className="hv-head">
          <div className="hv-hello min-w-0">
            {/* Cùng lý lẽ với bản mobile: đây là <h1> của trang. Hai nhánh khổ màn loại
                trừ nhau nên KHÔNG có hai <h1> cùng nằm trong một DOM. */}
            <h1>
              <LoiChao ten={data.displayName} laHocSinh={data.isStudent} />
            </h1>
            <div className="hv-date">{data.today}</div>
          </div>
          {data.isStudent && (
            <div className="flex min-w-0 flex-col items-end gap-2">
              <div className="hv-stats">
                <HvStat
                  icon="check_circle"
                  mauIcon="#35E0FF"
                  label="đã đến trường"
                  // Đã tải xong mà chưa check-in thì "—" là SỰ THẬT (chưa có giờ nào),
                  // khác hẳn "—" của nhánh lỗi.
                  value={<StatValue state={data.todayState} value={data.checkedInAt ?? "—"} width="w-14" />}
                />
                <HvStat
                  icon="event_available"
                  mauIcon="#FFC629"
                  label="ngày tuần này"
                  value={<StatValue state={data.weekState} value={`${data.checkinDaysThisWeek ?? 0}/5`} width="w-12" />}
                />
                <HvStat
                  icon="military_tech"
                  mauIcon="#35E0FF"
                  label="chuỗi check-in"
                  value={<StatValue state={data.todayState} value={String(data.streakDays ?? 0)} width="w-8" />}
                />
              </div>
              {(data.todayState === "error" || data.weekState === "error") && (
                <button
                  type="button"
                  onClick={data.retryStats}
                  className="text-[11px] font-bold text-white underline underline-offset-2"
                >
                  Chưa tải được số liệu — thử lại
                </button>
              )}
            </div>
          )}
          {khoi.khoiNguoiLon && (
            <div className="flex flex-none items-center gap-3 self-start">
              {loc.hienOTim && (
                <div className="w-[248px]">
                  <OTimMiniApp tuKhoa={loc.tuKhoa} datTuKhoa={loc.datTuKhoa} nen="hero" />
                </div>
              )}
              <ChuongViecCho work={data.viecCho} />
            </div>
          )}
        </header>

        {/* NGƯỜI LỚN (26/08/2026): "mọi trang người lớn vào, đều có 1 dashboard như vậy,
            nền trắng… đưa sample data vào… để demo cho mọi người biết đây là dashboard".
            Buồng lái mẫu theo bản vẽ Major OS (buong-lai-mau.tsx — luật số mẫu ghi ở đó);
            khối SỐ THẬT còn lại của vai (lớp chủ nhiệm, hạn báo cáo…) đứng ngay dưới,
            không nhãn MẪU — ranh giới thật/mẫu phải nhìn thấy được. */}
        {khoi.khoiNguoiLon && (
          <>
            <BuongLaiMau miniApps={data.miniApps} />
            <div className="hv-r mt-4 max-w-[560px]">
              <CotPhaiNguoiLon roles={data.roles} />
            </div>
          </>
        )}

        {data.isStudent && (
        <div className="hv-grid">
          <div className="hv-l">
            {khoi.theCheckin && <CheckinCardDesktop data={data} />}

            <div className="hv-card">
              <div className="hv-ct">
                <h2 className="hv-tt">Mini App</h2>
                <span className="hv-kick">GIAI ĐOẠN 1 · {data.miniApps.length} APP</span>
              </div>
              <div className="mt-1.5">
                {/* `sang`: thẻ này nền TRẮNG — các thể rỗng của lưới phải đổi sang chữ
                    tối, xem chú thích ở LuoiMiniApp. */}
                <LuoiMiniApp
                  loc={loc}
                  tongApp={data.miniApps.length}
                  laQuanTri={data.roles.includes("admin")}
                  rongCaMan={rongCaMan}
                  oTimTrongThe={false}
                  sang
                />
              </div>
            </div>

            {data.isStudent && (
              // hv-bn thay GrowthBanner ở khổ này — cùng đích /bao-cao, cùng lời.
              <Link href="/bao-cao" className="hv-bn">
                <i className="bn-circuit" aria-hidden="true" />
                <span className="hv-bi">
                  <span aria-hidden="true" className="msr">military_tech</span>
                </span>
                <span className="hv-btx">
                  <b>Báo cáo Trưởng thành</b>
                  <span>Xem tuần này mình lớn lên thế nào →</span>
                </span>
                <span className="hv-bai">
                  <span aria-hidden="true" className="msr">arrow_forward</span>
                </span>
              </Link>
            )}
          </div>

          <div className="hv-r">
            {data.isStudent && (
              <ThisWeekCard
                state={data.weekState}
                checkinDays={data.checkinDaysThisWeek}
                happyDays={data.happyDaysThisWeek}
                onRetry={data.retryStats}
              />
            )}
            {data.isStudent && data.checkedInToday && data.checkedInAt && <TodayCard checkedInAt={data.checkedInAt} />}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// Chip số liệu trên "command strip" — .hv-stat của bản vẽ: nền #0B1E44, vát góc 8px,
// viền lam bằng drop-shadow. Màu icon là màu CỦA BẢN VẼ (khối !important cuối: ô 1 & 3
// lam #35E0FF, ô 2 vàng #FFC629); số trắng mono trên nền tối đo 15,9:1.
function HvStat({ icon, mauIcon, value, label }: { icon: string; mauIcon: string; value: React.ReactNode; label: string }) {
  return (
    <div className="hv-stat">
      <span aria-hidden="true" className="msr hv-si" style={{ color: mauIcon }}>{icon}</span>
      <span className="hv-st">
        <b>{value}</b>
        <i>{label}</i>
      </span>
    </div>
  );
}

function CheckinCardDesktop({ data }: { data: HomeData }) {
  const { moCheckin, dangKhoa } = useCongCheckin();
  // Cùng luật với thẻ bản điện thoại: KHÔNG hỏi lần thứ hai khi popup đang hỏi.
  if (dangKhoa) return null;
  // Bốn ô cảm xúc của bản vẽ KHÔNG tự gửi tâm trạng — chúng (và nút CTA) cùng mở popup
  // cổng ADR-036, nơi duy nhất được ghi check-in. Bảng màu lấy từ MOOD_STYLE của
  // mood-tile.tsx — một nguồn, không chép hex lần hai. Thứ tự 4→1 (Vui trước) là thứ
  // tự của bản vẽ và của chính popup.
  const cacO: MoodValue[] = [4, 3, 2, 1];
  return (
    <div className="hv-card hv-check">
      <i className="card-sweep" aria-hidden="true" />
      <div className="hv-ct">
        <h2 className="hv-tt">Check-in cảm xúc</h2>
        <span className="hv-badge">TRƯỚC 8:00</span>
      </div>
      <div className="hv-q">
        {data.todayState === "loading"
          ? "Đang xem hôm nay con đã check-in chưa…"
          : data.todayState === "error"
            ? "Chưa xem được hôm nay con đã check-in chưa."
            : data.checkedInToday
              ? "Hôm nay của con đã được ghi lại."
              : "Hôm nay con thấy thế nào?"}
      </div>
      {/* Chỉ mời check-in khi BIẾT CHẮC là chưa check-in — xem ghi chú 2 đầu file. */}
      {data.todayState === "ready" && data.checkedInToday === false && (
        <>
          <div className="hv-moods">
            {cacO.map((m) => (
              <button
                key={m}
                type="button"
                onClick={moCheckin}
                aria-haspopup="dialog"
                title={MOOD_LABEL[m]}
                className={`hv-m bg-gradient-to-br ${MOOD_STYLE[m].gradient} ${MOOD_STYLE[m].text}`}
              >
                <span aria-hidden="true" className="msr">{MOOD_STYLE[m].icon}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={moCheckin} aria-haspopup="dialog" className="hv-cta">
            Check-in ngay
            <span aria-hidden="true" className="msr">arrow_forward</span>
          </button>
        </>
      )}
      {data.todayState === "ready" && data.checkedInToday === true && (
        <div className="hv-done">
          <span aria-hidden="true" className="msr" style={{ color: "#00A85E" }}>check_circle</span>
          Đã check-in lúc {data.checkedInAt} — cảm ơn con!
        </div>
      )}
      {data.todayState === "error" && (
        <button type="button" onClick={data.retryStats} className="hv-cta">
          Thử lại
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POPUP CHECK-IN THỨ HAI ĐÃ GỠ 21/08/2026 — và đây là lý do, không phải dọn dẹp.
// ---------------------------------------------------------------------------
// Chỗ này từng có `CheckinModal`: một popup RIÊNG của trang chủ, tự mở bằng `useEffect`
// khi `checkedInToday === false`, với lưới cảm xúc riêng, đường gửi riêng, màn ăn mừng
// riêng. Nó ra đời trước cổng ADR-036 và làm gần đúng việc mà cổng nay làm.
//
// Ngày 21/08/2026 tôi thêm popup cổng ở `app/layout.tsx` mà KHÔNG thấy cái này — nên
// một em học sinh mở trang chủ trên máy tính nhận HAI popup check-in chồng lên nhau.
// Chủ đầu tư gọi đúng tên: *"có 2 loại checkin"*.
//
// Cái được giữ là cái của cổng, vì nó làm được ba việc cái cũ không làm được:
//   · khoá THẬT (không ✕, không Escape) — cái cũ tự mở nhưng đóng lúc nào cũng được;
//   · phủ MỌI trang, không riêng trang chủ;
//   · dùng lại NGUYÊN ruột `CheckinView` — cùng hàng đợi ngoại tuyến, cùng đường gửi,
//     cùng lời nhắn "cần gặp thầy cô". Cái cũ có một bản sao của tất cả những thứ đó,
//     và một bản sao là một chỗ sẽ lệch.
//
// Thẻ `CheckinCardDesktop` thì Ở LẠI — nó là chỗ DUY NHẤT ở khổ máy tính (không có
// thanh tab) để em mở lại popup mà đổi tâm trạng. Nút của nó nay gọi `moCheckin()`.


function ThisWeekCard({
  state,
  checkinDays,
  happyDays,
  onRetry,
}: {
  state: StatState;
  checkinDays: number | undefined;
  happyDays: number | undefined;
  onRetry: () => void;
}) {
  return (
    <div className="hv-card">
      <div className="hv-ct">
        <h2 className="hv-tt">Tuần này của mình</h2>
        <span className="hv-kick">{new Date().toLocaleDateString("vi-VN")}</span>
      </div>
      {/* Hai thanh RỖNG khi query hỏng là lời nói dối tệ nhất trên trang này: nó bảo
          đứa trẻ rằng tuần này em chưa đi học buổi nào. Hỏng thì không vẽ thanh. */}
      {state === "error" ? (
        <div className="mt-3 flex flex-col items-start gap-1.5">
          <p className="text-[12px] font-semibold text-[#33507C]">Chưa tải được số liệu tuần này (—).</p>
          <button type="button" onClick={onRetry} className="text-[12px] font-black text-[#1E5FB8] underline underline-offset-2">
            Thử lại
          </button>
        </div>
      ) : (
        <>
          {/* Màu SỐ theo bản vẽ (khối !important cuối: hàng 1 #00A85E, hàng 2 #2C7BF2 —
              đè lên màu inline của icon). Chữ 13,5px đậm 900 = chữ lớn theo WCAG, mốc
              3:1: #00A85E đo 3,07:1 và #2C7BF2 đo 4,02:1 trên nền trắng — đạt. */}
          <HvWkRow loading={state === "loading"} icon="event_available" mau="#00A85E" label="Đi học" value={checkinDays ?? 0} max={5} nen="linear-gradient(90deg,#00D97A,#00A85E)" />
          <HvWkRow loading={state === "loading"} icon="sentiment_satisfied" mau="#2C7BF2" label="Tâm trạng vui" value={happyDays ?? 0} max={5} nen="linear-gradient(90deg,#4E9BFF,#2C7BF2)" />
        </>
      )}
      <Link href="/bao-cao" className="hv-link">
        Xem Báo cáo Trưởng thành
        <span aria-hidden="true" className="msr text-[17px]">arrow_forward</span>
      </Link>
    </div>
  );
}

// Một hàng .hv-wk của bản vẽ: icon · nhãn + thanh có vạch chia 5 · con số mono.
function HvWkRow({
  icon,
  mau,
  label,
  value,
  max,
  nen,
  loading,
}: {
  icon: string;
  mau: string;
  label: string;
  value: number;
  max: number;
  nen: string;
  loading?: boolean;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="hv-wk">
      <span aria-hidden="true" className="msr hv-wi" style={{ color: mau }}>{icon}</span>
      <div className="hv-wm">
        <div className="hv-wl">{label}</div>
        <div className={`hv-bar ${loading ? "animate-pulse" : ""}`}>
          {!loading && <span className="hv-fill" style={{ width: `${pct}%`, background: nen }} />}
          <i className="hv-seg" />
        </div>
      </div>
      <b className="hv-wn" style={{ color: mau }}>{loading ? "…" : `${value}/${max}`}</b>
    </div>
  );
}

function TodayCard({ checkedInAt }: { checkedInAt: string }) {
  return (
    <div className="hv-card hv-radar">
      <div className="hv-ct">
        <h2 className="hv-tt">Hôm nay</h2>
        <span className="hv-chk">
          <span aria-hidden="true" className="msr">check_circle</span>
        </span>
      </div>
      <div className="hv-line">Đã đến trường {checkedInAt} — điểm danh tự động khi con vào cổng trường.</div>
      <div className="radar" aria-hidden="true">
        <i className="rd-ring" />
        <i className="rd-ring r2" />
        <i className="rd-beam" />
        <i className="rd-dot" />
      </div>
    </div>
  );
}

function GrowthBanner() {
  return (
    <Link
      href="/bao-cao"
      className="relative flex items-center gap-3 overflow-hidden rounded-[18px] bg-gradient-to-r from-gold to-[#FFDD66] px-[18px] py-3"
    >
      <div aria-hidden className="absolute -right-6 -bottom-[42px] h-[110px] w-[110px] rounded-full bg-card/35" />
      <span aria-hidden="true" className="msr relative text-[26px] text-cardtitle">workspace_premium</span>
      <div className="relative flex-1">
        <div className="text-[13px] font-black text-cardtitle">Báo cáo Trưởng thành</div>
        <div className="mt-0.5 text-[11px] text-gold-text">Xem tuần này mình lớn lên thế nào →</div>
      </div>
    </Link>
  );
}

function StreakCard({ streakDays }: { streakDays: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-[10px] shadow-[0_3px_12px_rgba(10,42,94,.07)]">
      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl bg-surface-success">
        <span aria-hidden="true" className="msr text-[19px] text-domain-studyDark">local_fire_department</span>
      </span>
      {/* BỎ 06/08/2026 (§1.5): "Giữ đều mỗi ngày để chuỗi không đứt" là lời dặn dò, không
          mang dữ liệu nào — con số ngay trên nó đã là toàn bộ nội dung của thẻ. */}
      <div className="flex-1">
        <div className="text-[12.5px] font-extrabold text-cardtitle">Chuỗi check-in: {streakDays} ngày</div>
      </div>
    </div>
  );
}



// ---------------------------------------------------------------------------
// UFO của bản vẽ — nay có "não" (24/08/2026, chủ đầu tư: "ufo phải thông minh hơn
// và tương tác chuột tốt hơn"). Vật lý chép NGUYÊN HẰNG SỐ từ script #ufo-fly của
// bản trình diễn:
//   · lang thang: tự bốc điểm đậu ngẫu nhiên, bay tới (lực 130), tới nơi thì lượn
//     tại chỗ 0,5–2,7s rồi bốc điểm mới;
//   · SỢ CHUỘT trong bán kính 180px: lực đẩy 3200 tỉ lệ theo độ gần, trần tốc độ
//     nhảy 75 → 680, lớp `scared` bật dấu "!", thân run (ufoShiver), đèn chiếu tắt;
//   · nghiêng theo vận tốc ngang (±18°), càng xuống thấp càng to (depth 0.78–1.28);
//   · nảy lại ở bốn mép của .ufo-track.
// Khác bản vẽ hai chỗ, đều là luật của kho:
//   · prefers-reduced-motion: không chạy vòng rAF nào (CSS đã giấu cả .ufo-track —
//     media query trong globals.css — nên cũng không có gì để vẽ);
//   · giấu tab thì dừng rAF (một hiệu ứng nền không được phép ăn pin ở tab nền),
//     mở lại thì đi tiếp — cùng khuôn nền-sao cũ của màn đăng nhập (đã gỡ 25/08 vì nặng).
// Toạ độ tính trong KHUNG .ufo-track (bản vẽ dùng viewport vì cảnh của nó fixed;
// ở đây track nằm sau sidebar 240px nên chuột phải trừ gốc track).
// ---------------------------------------------------------------------------
function UfoBay() {
  const vetRef = useRef<HTMLDivElement | null>(null);
  const bayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const vet = vetRef.current;
    const bay = bayRef.current;
    if (!vet || !bay) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let W = vet.clientWidth, H = vet.clientHeight;
    let goc = vet.getBoundingClientRect();
    const doKhung = () => {
      W = vet.clientWidth;
      H = vet.clientHeight;
      goc = vet.getBoundingClientRect();
    };

    let x = W * 0.6, y = 110, vx = 0, vy = 0, tx = 0, ty = 0, dau = 0, so = 0;
    let mx = -9e3, my = -9e3;
    const bocDiem = () => {
      tx = 40 + Math.random() * Math.max(1, W - 240);
      ty = 40 + Math.random() * Math.max(1, H - 260);
      dau = 500 + Math.random() * 2200;
    };
    bocDiem();

    const onMouse = (e: MouseEvent) => {
      mx = e.clientX - goc.left;
      my = e.clientY - goc.top;
    };

    let raf = 0;
    let truoc = performance.now();
    const buoc = (now: number) => {
      // 30fps là đủ cho một vật trôi chậm — nửa số lần raster lại cái đĩa có filter
      // (25/08: "web cứ giật giật" — mọi hiệu ứng nền đều phải trả bớt khung hình).
      if (now - truoc < 30) {
        raf = requestAnimationFrame(buoc);
        return;
      }
      const dt = Math.min(50, now - truoc) / 1000;
      truoc = now;

      // Sợ chuột: tâm thân tàu (~70,48 trong SVG 140×100) so với con trỏ.
      const cx = x + 70, cy = y + 48;
      const dxm = cx - mx, dym = cy - my;
      const dm = Math.hypot(dxm, dym) || 1;
      if (dm < 180) {
        const f = (180 - dm) / 180;
        vx += (dxm / dm) * 3200 * f * dt;
        vy += (dym / dm) * 3200 * f * dt;
        if (so <= 0) bay.classList.add("scared");
        so = 1;
      } else if (so > 0) {
        so -= dt;
        if (so <= 0) bay.classList.remove("scared");
      }

      // Lang thang khi không sợ: bay về điểm đậu, tới nơi thì nghỉ rồi bốc điểm mới.
      const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
      if (d < 26) {
        if (dau > 0) dau -= dt * 1000;
        else bocDiem();
      } else if (so <= 0) {
        vx += (dx / d) * 130 * dt;
        vy += (dy / d) * 130 * dt;
      }

      // Ma sát + trần tốc độ — hai chế độ: thong thả 75, bỏ chạy 680.
      const k = Math.pow(so > 0 ? 0.9 : 0.93, dt * 60);
      vx *= k;
      vy *= k;
      const vmax = so > 0 ? 680 : 75;
      const v = Math.hypot(vx, vy);
      if (v > vmax) {
        vx *= vmax / v;
        vy *= vmax / v;
      }
      x += vx * dt;
      y += vy * dt;

      // Nảy ở bốn mép khung.
      if (x < 8) { x = 8; vx = Math.abs(vx); }
      if (x > W - 150) { x = W - 150; vx = -Math.abs(vx); }
      if (y < 8) { y = 8; vy = Math.abs(vy); }
      if (y > H - 170) { y = H - 170; vy = -Math.abs(vy); }

      // Nghiêng theo vận tốc ngang; càng thấp càng gần mắt nên càng to.
      const nghieng = Math.max(-18, Math.min(18, vx * 0.05));
      const sau = 0.78 + (y / (H || 1)) * 0.5;
      bay.style.transform =
        "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) rotate(" + nghieng.toFixed(1) + "deg) scale(" + sau.toFixed(3) + ")";
      raf = requestAnimationFrame(buoc);
    };
    raf = requestAnimationFrame(buoc);

    // Giấu tab thì dừng vòng vẽ — cùng luật với sao-nen.tsx.
    const onHidden = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        truoc = performance.now();
        raf = requestAnimationFrame(buoc);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("resize", doKhung);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", doKhung);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  return (
    <div ref={vetRef} className="ufo-track" aria-hidden="true">
      <div ref={bayRef} className="ufo-fly">
        <span className="ufo-alert">!</span>
        <div className="ufo-bob">
          <svg width="140" height="100" viewBox="0 0 140 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="uDome" cx=".38" cy=".26" r=".95"><stop offset="0" stopColor="#F2FDFF" /><stop offset=".35" stopColor="#8FDCFF" /><stop offset=".72" stopColor="#2E9BD6" /><stop offset="1" stopColor="#155C9C" /></radialGradient>
              <radialGradient id="uBody" cx=".4" cy=".18" r="1.05"><stop offset="0" stopColor="#6D9EE0" /><stop offset=".42" stopColor="#1E5FB8" /><stop offset=".78" stopColor="#0A2A5E" /><stop offset="1" stopColor="#051534" /></radialGradient>
              <linearGradient id="uHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E3C7E" /><stop offset="1" stopColor="#03102A" /></linearGradient>
              <linearGradient id="uBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFC629" stopOpacity=".55" /><stop offset="1" stopColor="#FFC629" stopOpacity="0" /></linearGradient>
              <radialGradient id="uGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFEDB3" /><stop offset="1" stopColor="#FFC629" stopOpacity="0" /></radialGradient>
            </defs>
            <path className="ufo-beam" d="M54 52 L86 52 L104 96 L36 96 Z" fill="url(#uBeam)" />
            <ellipse cx="70" cy="57" rx="30" ry="7.5" fill="url(#uHull)" />
            <ellipse cx="70" cy="44" rx="54" ry="15" fill="url(#uBody)" />
            <path d="M16 44 Q70 29 124 44 Q70 38.5 16 44 Z" fill="#A5DCFF" opacity=".55" />
            <path d="M18 47.5 Q70 61 122 47.5 Q70 55 18 47.5 Z" fill="#020B1C" opacity=".42" />
            <ellipse cx="70" cy="27" rx="21" ry="15.5" fill="url(#uDome)" />
            <ellipse cx="62" cy="19.5" rx="7.5" ry="4.5" fill="#fff" opacity=".85" transform="rotate(-18 62 19.5)" />
            <g>
              <circle cx="28" cy="47" r="6" fill="url(#uGlow)" /><circle cx="28" cy="47" r="2.6" fill="#FFC629" />
              <circle cx="49" cy="52" r="6" fill="url(#uGlow)" /><circle cx="49" cy="52" r="2.6" fill="#FFD98A" />
              <circle cx="70" cy="54" r="6" fill="url(#uGlow)" /><circle cx="70" cy="54" r="2.6" fill="#FFC629" />
              <circle cx="91" cy="52" r="6" fill="url(#uGlow)" /><circle cx="91" cy="52" r="2.6" fill="#FFD98A" />
              <circle cx="112" cy="47" r="6" fill="url(#uGlow)" /><circle cx="112" cy="47" r="2.6" fill="#FFC629" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
