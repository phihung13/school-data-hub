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
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { useIsDesktop } from "@/lib/viewport";
import type { HubRole, MiniAppTile as MiniAppTileType, MoodValue } from "@hub/core/contracts";
import { MOOD_LABEL } from "@hub/core/contracts";
import { MiniAppTile } from "./mini-app-tile";
import { HubTabBar } from "./tab-bar";
import { Mascot } from "./mascot";
import { HubSidebar } from "./hub-sidebar";
import { NHAN_AI_DOC_CAM_XUC, personName } from "./ui/labels";
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
}

export function HomeView({
  displayName,
  email,
  isStudent,
  isHomeroom,
  roles,
  classCode,
  initialMiniApps,
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
}) {
  // initialData chứ không phải "đợi query xong": lưới vẽ đúng ngay lần sơn đầu, query chỉ
  // xác nhận lại. Không có nó, miniApps là [] trong ~1s → hiện "0 app" với ô trống rồi mới
  // nhảy sang 2 app, trang giật một nhịp thấy rõ (30/07/2026).
  const miniAppsQuery = trpc.session.miniApps.useQuery(undefined, { initialData: initialMiniApps });
  const todayStatus = trpc.checkin.getTodayStatus.useQuery(undefined, { enabled: isStudent });
  const growthReport = trpc.report.getMyLatestReport.useQuery(undefined, { enabled: isStudent });
  const today = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const isDesktop = useIsDesktop();

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
  };

  // MỘT nhánh, không hai. `md:hidden`/`hidden md:flex` vẫn dựng cả hai cây trong DOM —
  // xem ghi chú 2 đầu file và lib/viewport.ts.
  if (!isDesktop) return <MobileHome data={data} />;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex w-[240px] flex-none">
        <HubSidebar roles={roles} active="home" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <DesktopHome data={data} />
    </div>
  );
}

/**
 * Một con số ở hero: đang tải → ô xám; hỏng → "—"; xong → số thật.
 * KHÔNG có nhánh nào trả về 0 khi chưa biết.
 */
function StatValue({ state, value, width }: { state: StatState; value: string; width: string }) {
  if (state === "loading") return <SkeletonBlock className={`${width} h-6`} />;
  if (state === "error") return <>—</>;
  return <>{value}</>;
}

// ---------------------------------------------------------------------------
// Mobile — M3: hero cong, thẻ check-in trồi lên vòm, tab bar dưới cùng.
// ---------------------------------------------------------------------------
function MobileHome({ data }: { data: HomeData }) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-pagebg">
      <div className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-light pb-[54px]">
        <div
          aria-hidden
          className="absolute -right-11 -top-[72px] h-[190px] w-[190px] rounded-full"
          style={{ background: "radial-gradient(circle at 36% 36%, rgba(255,198,41,.55), rgba(255,198,41,.06) 72%)" }}
        />
        <div className="relative flex items-center gap-3 px-5 pt-4">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-[15px] font-black text-navy">
            {data.displayName.slice(0, 1)}
          </div>
          <div className="flex-1">
            {/* 👋 chỉ đi với lời chào HỌC SINH (§4: emoji tiết chế, chỉ ở đó). Cùng một
                dòng chữ này còn chào hiệu trưởng và kế toán lúc 7 giờ sáng. */}
            <div className="text-[17px] font-black text-white">
              Chào {data.displayName}{data.isStudent ? " 👋" : ""}
            </div>
            <div className="mt-0.5 text-[11.5px] text-[#D6E6FF]">{data.today}</div>
          </div>
          {/* Chuông thông báo đã gỡ 31/07/2026: GĐ1 chưa có thông báo trong sản phẩm,
              và ở đây nó là <span> trần — bấm không ra gì. */}
        </div>
      </div>
      <div className="relative -mt-8 h-8 rounded-t-[100%] bg-pagebg" aria-hidden />

      <div className="flex flex-1 flex-col px-4">
        {data.isStudent && <CheckinCardMobile data={data} />}

        <div className={`${data.isStudent ? "mt-3.5" : "mt-5"} text-[14px] font-black text-navy`}>Mini App</div>
        <div className="grid grid-cols-4 gap-3 py-1.5">
          {data.miniApps.map((tile) => (
            <MiniAppTile key={tile.key} tile={tile} />
          ))}
        </div>

        {data.isStudent && (
          <>
            <GrowthBanner />
            {/* Chuỗi chỉ hiện khi biết chắc — không có nó thì bỏ thẻ, không hiện "0 ngày". */}
            {data.todayState === "ready" && data.streakDays !== undefined && (
              <StreakCard streakDays={data.streakDays} />
            )}
          </>
        )}

        {data.isHomeroom && !data.isStudent && (
          <p className="mt-4 text-center text-[12px] text-muted">
            Mở <b>Bảng điều khiển</b> ở lưới mini app phía trên để xem lớp sáng nay.
          </p>
        )}
      </div>

      {/* Thanh điều hướng của MỌI vai, không riêng học sinh (tab-bar.tsx chọn bộ tab
          theo vai). Trước đây chỉ học sinh có thanh này, nên trên điện thoại phụ huynh,
          GVCN, tâm lý cụm và quản trị đứng ở trang chủ mà không có đường nào tới /ho-so
          — trang DUY NHẤT có nút Đăng xuất. Kể từ khi trang này dựng một nhánh theo khổ
          màn, đây còn là lưới an toàn cho cả khung máy tính: nhánh desktop (có menu trái)
          chỉ dựng sau hydrate, nên HTML đầu tiên phải tự mang được đường đi của nó. */}
      <HubTabBar roles={data.roles} />
    </div>
  );
}

function CheckinCardMobile({ data }: { data: HomeData }) {
  return (
    <div className="relative z-[2] -mt-[46px] flex flex-col gap-2.5 rounded-[22px] bg-white p-3.5 shadow-[0_14px_32px_rgba(10,42,94,.14)]">
      <div className="flex items-center justify-between">
        <span className="text-[14.5px] font-black text-navy">Check-in cảm xúc</span>
        <span className="rounded-full bg-[#FFF1C9] px-2.5 py-1 text-[10px] font-black text-gold-textDark">TRƯỚC 8:00</span>
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
        <Link
          href="/checkin"
          className="rounded-[13px] bg-gradient-to-br from-navy to-navy-light py-3 text-center text-[13.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)]"
        >
          Check-in ngay →
        </Link>
      )}
      {data.todayState === "error" && (
        <button
          type="button"
          onClick={data.retryStats}
          className="rounded-[13px] border-[1.5px] border-[#E4E9F0] py-2.5 text-center text-[12.5px] font-extrabold text-[#1D4E8F]"
        >
          Thử lại
        </button>
      )}
      <div className="flex items-center justify-center gap-1.5">
        <span className="msr text-[14px] text-caption2">cloud_off</span>
        <span className="text-[10.5px] text-caption2">Offline vẫn lưu — tự gửi sau.</span>
      </div>
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
  const [modalOpen, setModalOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  // V3: popup mở tự động lần đầu trang chủ tải xong khi chưa check-in hôm nay —
  // chỉ tự mở MỘT lần/phiên tải trang, không mở lại nếu em tự bấm đóng.
  useEffect(() => {
    if (data.isStudent && data.checkedInToday === false && !autoOpened) {
      setModalOpen(true);
      setAutoOpened(true);
    }
  }, [data.isStudent, data.checkedInToday, autoOpened]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {modalOpen && <CheckinModal onClose={() => setModalOpen(false)} />}
      <div className="flex-1 overflow-y-auto pb-[26px]">
        <div className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-light px-7 pb-[74px] pt-4">
          <div
            aria-hidden
            className="absolute -right-[50px] -top-[100px] h-[320px] w-[320px] rounded-full"
            style={{ background: "radial-gradient(circle at 36% 36%, rgba(255,198,41,.45), rgba(255,198,41,.04) 72%)" }}
          />
          {/* Ô tìm kiếm giả và chuông thông báo đã gỡ 31/07/2026 — xem ghi chú 3 ở
              đầu file. Khi GĐ2 có tìm kiếm thật thì dựng lại bằng <input>/<button>. */}
          <div className="relative mt-3 flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-1 basis-[300px]">
              <div className="text-[40px] font-black leading-[1.1] text-white">
                Chào {data.displayName}{data.isStudent ? " 👋" : ""}
              </div>
              <div className="mt-2 text-[14px] font-semibold text-[#D6E6FF]">{data.today}</div>
            </div>
            {data.isStudent && (
              <div className="flex flex-none basis-[420px] flex-col gap-2">
                <div className="flex gap-2.5">
                  <HeroStat
                    label="đã đến trường"
                    // Đã tải xong mà chưa check-in thì "—" là SỰ THẬT (chưa có giờ nào),
                    // khác hẳn "—" của nhánh lỗi bên dưới.
                    value={<StatValue state={data.todayState} value={data.checkedInAt ?? "—"} width="w-14" />}
                  />
                  <HeroStat
                    label="ngày tuần này"
                    gold
                    value={
                      <StatValue
                        state={data.weekState}
                        value={`${data.checkinDaysThisWeek ?? 0}/5`}
                        width="w-12"
                      />
                    }
                  />
                  <HeroStat
                    label="chuỗi check-in"
                    value={<StatValue state={data.todayState} value={String(data.streakDays ?? 0)} width="w-8" />}
                  />
                </div>
                {(data.todayState === "error" || data.weekState === "error") && (
                  <button
                    type="button"
                    onClick={data.retryStats}
                    className="self-end text-[11px] font-bold text-gold underline underline-offset-2"
                  >
                    Chưa tải được số liệu — thử lại
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/*
          `relative z-[2]` KHÔNG phải trang trí — thiếu nó thì hero navy vẽ ĐÈ LÊN thẻ đầu tiên.
          Lý do: hero ở trên là `relative` (phần tử có định vị), còn khối này chỉ có margin âm.
          CSS vẽ mọi phần tử có định vị lên trên phần tử không định vị, bất kể thứ tự trong DOM.

          Chỉ vai NGƯỜI LỚN nhìn thấy lỗi (bắt gặp thật 31/07/2026, ảnh chụp của Cô Hạnh: chữ
          "Mini App" bị cắt ngang bởi nền navy): với học sinh, thẻ đầu tiên là thẻ check-in vốn
          đã mang sẵn `relative` nên tự thoát; người lớn không có thẻ đó nên thẻ Mini App lĩnh trọn.
          Bản mobile (dòng ~211) từ đầu đã có `relative z-[2]` — chỉ bản desktop bị sót.
          DESIGN-GUIDELINES §6 cũng đã dặn đúng điều này cho mẫu "hero cong".
        */}
        <div className="relative z-[2] mt-[-34px] flex flex-wrap items-start gap-5 px-7">
          <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-[18px]">
            {data.isStudent && <CheckinCardDesktop data={data} onOpenModal={() => setModalOpen(true)} />}

            <div className="rounded-[22px] border border-white bg-white p-6 shadow-[0_2px_6px_rgba(10,42,94,.06),0_18px_40px_rgba(10,42,94,.18),0_44px_80px_rgba(10,42,94,.12)]">
              <div className="flex items-baseline justify-between">
                <span className="text-[18px] font-black text-navy">Mini App</span>
                <span className="text-[11.5px] font-extrabold text-gold-text">Giai đoạn 1 · {data.miniApps.length} app</span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-[14px]">
                {data.miniApps.map((tile) => (
                  <MiniAppTile key={tile.key} tile={tile} />
                ))}
              </div>
            </div>

            {data.isStudent && <GrowthBanner />}
          </div>

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-[18px]">
            {data.isStudent && (
              <ThisWeekCard
                state={data.weekState}
                checkinDays={data.checkinDaysThisWeek}
                happyDays={data.happyDaysThisWeek}
                onRetry={data.retryStats}
              />
            )}
            {data.isStudent && data.checkedInToday && data.checkedInAt && <TodayCard checkedInAt={data.checkedInAt} />}
            {data.isHomeroom && !data.isStudent && (
              <div className="-translate-y-1.5 rounded-[20px] border border-white bg-white p-[22px] shadow-[0_2px_6px_rgba(10,42,94,.06),0_18px_40px_rgba(10,42,94,.18),0_44px_80px_rgba(10,42,94,.12)]">
                <div className="text-[16px] font-black text-navy">Buồng lái đang chờ</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                  Mở <b>Bảng điều khiển</b> ở lưới mini app bên trái để xem lớp sáng nay: cờ ưu tiên, xác nhận gửi muộn, mood lớp.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ value, label, gold }: { value: React.ReactNode; label: string; gold?: boolean }) {
  return (
    <div className="flex-1 rounded-2xl border border-white/[.16] bg-white/[.15] px-2.5 py-[15px] text-center">
      <div className={`text-2xl font-black ${gold ? "text-gold" : "text-white"}`}>{value}</div>
      <div className="mt-[3px] text-[10.5px] font-bold text-[#C7D8F0]">{label}</div>
    </div>
  );
}

const MOOD_STYLE: Record<MoodValue, { bg: string; shadow: string; text: string; icon: string }> = {
  4: { bg: "linear-gradient(160deg,#00D97A,#00A85E)", shadow: "0 8px 18px rgba(0,168,94,.3)", text: "text-white", icon: "sentiment_very_satisfied" },
  3: { bg: "linear-gradient(160deg,#4E9BFF,#2C7BF2)", shadow: "0 8px 18px rgba(44,123,242,.3)", text: "text-white", icon: "sentiment_neutral" },
  2: { bg: "linear-gradient(160deg,#FFC833,#F5A300)", shadow: "0 8px 18px rgba(245,163,0,.3)", text: "text-[#6B4A00]", icon: "sentiment_dissatisfied" },
  1: { bg: "linear-gradient(160deg,#FF7A7F,#F0474D)", shadow: "0 8px 18px rgba(240,71,77,.3)", text: "text-white", icon: "sentiment_sad" },
};
const MOOD_ORDER: MoodValue[] = [4, 3, 2, 1];

function CheckinCardDesktop({ data, onOpenModal }: { data: HomeData; onOpenModal: () => void }) {
  return (
    <div className="relative -translate-y-1.5 rounded-[22px] border border-white bg-white p-6 shadow-[0_2px_6px_rgba(10,42,94,.06),0_18px_40px_rgba(10,42,94,.18),0_44px_80px_rgba(10,42,94,.12)]">
      <div className="flex items-center justify-between">
        <span className="text-[19px] font-black text-navy">Check-in cảm xúc</span>
        <span className="rounded-full bg-[#FFF1C9] px-[11px] py-[5px] text-[10.5px] font-black text-gold-textDark">TRƯỚC 8:00</span>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-3.5">
        <Mascot pose="wave" width={52} />
        <div className="min-w-0 flex-1 basis-[240px] text-[14.5px] font-semibold text-[#33507C]">
          {data.todayState === "loading"
            ? "Đang xem hôm nay con đã check-in chưa…"
            : data.todayState === "error"
              ? "Chưa xem được hôm nay con đã check-in chưa."
              : data.checkedInToday
                ? `Đã check-in lúc ${data.checkedInAt} — cảm ơn con!`
                : "Hôm nay con thấy thế nào?"}
        </div>
        {/* Chỉ mời check-in khi BIẾT CHẮC là chưa check-in — xem ghi chú 2 đầu file. */}
        {data.todayState === "ready" && data.checkedInToday === false && (
          <button
            type="button"
            onClick={onOpenModal}
            className="flex-none rounded-[14px] bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[13.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)]"
          >
            Check-in ngay
          </button>
        )}
        {data.todayState === "error" && (
          <button
            type="button"
            onClick={data.retryStats}
            className="flex-none rounded-[14px] border-[1.5px] border-[#E4E9F0] px-5 py-3 text-[13px] font-extrabold text-[#1D4E8F]"
          >
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// V3/V3b (Hub Desktop V2): MỘT popup nổi trên trang chủ, hai trạng thái — chọn
// cảm xúc rồi đổi thẳng sang ăn mừng, không điều hướng/không tải trang mới.
//
// Sửa 01/08/2026 (gói "tuong-phan-man-hoc-sinh") — POPUP TỰ MỞ MÀ KHÔNG PHẢI HỘP THOẠI.
//
// Đọc mã hôm 01/08: `grep -n 'role="dialog"\|aria-modal\|Escape'` trên trọn 10 file màn học
// sinh trả về RỖNG. Khối này là một `<div className="fixed inset-0 z-50 …">` trần, mà nó TỰ
// MỞ khi trang chủ tải xong (useEffect ở DesktopHome, điều kiện checkedInToday === false).
// Bốn hậu quả, tất cả đọc thẳng ra từ mã:
//   1. Focus vẫn nằm ở <body> phía sau. Người dùng bàn phím bấm Tab lần đầu rơi vào
//      skip-link rồi menu trái — những thứ nằm DƯỚI lớp phủ, tức bấm vào một thứ không
//      nhìn thấy được.
//   2. Trình đọc màn hình không được báo là vừa có gì mở ra; nó vẫn đang đọc trang chủ.
//   3. Không có Escape. Cách duy nhất đóng là tìm cho ra nút ✕ và bấm chuột vào.
//   4. Nút ✕ đo được 36×36px — dưới mốc 44px của §11.
//
// Cách sửa: giữ nguyên toàn bộ phần nhìn thấy, thêm đủ hợp đồng của một hộp thoại —
// role/aria-modal/aria-labelledby, đặt focus vào trong khi mở, TRẢ focus về chỗ cũ khi
// đóng, Escape đóng, và vòng Tab quẩn trong hộp. Không dùng <dialog>+showModal() (trình
// duyệt sẽ tự lo cả bốn việc) vì nó kéo theo ::backdrop và một tầng z-index riêng, đủ để
// đổi hình dạng lớp phủ hiện tại — mà việc hôm nay là vá hành vi, không phải vẽ lại.
// ---------------------------------------------------------------------------
function CheckinModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [done, setDone] = useState<{ mood: MoodValue; checkedInAt: string; streakDays: number } | null>(null);
  const submitMood = trpc.checkin.submitMood.useMutation({
    onSuccess: (result, variables) => {
      void utils.checkin.getTodayStatus.invalidate();
      void utils.report.getMyLatestReport.invalidate();
      setDone({
        mood: variables.mood,
        checkedInAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        streakDays: result.streakDays,
      });
    },
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Đưa focus vào hộp khi mở, và TRẢ nó về đúng phần tử vừa mở hộp khi đóng. Vế trả về
  // mới là vế hay bị quên: thiếu nó thì đóng xong focus rơi về <body> và người dùng bàn
  // phím phải Tab lại từ đầu trang — popup này còn TỰ mở, nên "chỗ cũ" có thể là chỗ em
  // đang đọc dở chứ không phải một cái nút nào.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Escape đóng, và Tab quẩn trong hộp. Danh sách phần tử focus được tính LẠI mỗi lần bấm
  // phím chứ không chụp một lần lúc mở: nội dung hộp đổi hẳn sau khi em chọn cảm xúc (bốn
  // ô biến mất, hai nút ăn mừng hiện ra), nên một ảnh chụp lúc mở sẽ giam focus vào những
  // nút không còn tồn tại.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }

  return (
    // onKeyDown đặt ở LỚP PHỦ chứ không phải trên từng nút: phím Tab/Escape đến từ bất kỳ
    // phần tử nào bên trong và nổi bọt lên đây, nên một chỗ bắt là đủ cho cả hộp — kể cả
    // sau khi nội dung hộp đổi hẳn sang màn ăn mừng.
    <div
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1A32]/50 p-6 backdrop-blur-[2px]"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        // Trỏ vào chính câu hỏi đang hiện, không vào một nhãn ẩn viết riêng: hai chuỗi thì
        // sớm muộn có một chuỗi lạc hậu, mà chuỗi lạc hậu ở đây chỉ người mù mới nghe thấy.
        aria-labelledby={done ? "checkin-modal-xong" : "checkin-modal-hoi"}
        className="relative w-full max-w-[560px] overflow-hidden rounded-[28px] bg-white shadow-[0_30px_70px_rgba(6,20,45,.4)]"
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[5px]"
          style={{ background: "linear-gradient(90deg,#00D97A,#2C7BF2,#FFC833,#F0474D)" }}
        />
        <div className="flex items-center justify-end p-3">
          {/* h-11 w-11 = 44×44 (§11). Màu icon #9AA5B5 cũ chỉ 2,49:1 trên trắng — dưới cả
              mốc 3:1 dành cho thành phần phi văn bản (WCAG 1.4.11); token muted = 5,03:1. */}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-[#F1F4F8]"
          >
            <span aria-hidden="true" className="msr text-[22px]">close</span>
          </button>
        </div>

        {!done ? (
          <div className="flex flex-col items-center px-8 pb-8 pt-1">
            <Mascot pose="wave" width={64} />
            <div id="checkin-modal-hoi" className="mt-2 text-center text-[24px] font-black text-ink">
              Hôm nay con thấy thế nào?
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6B7789]">
              <span aria-hidden="true" className="msr text-[15px] text-caption">lock</span>
              {/* Nhãn nay đến từ MỘT hằng số dùng chung (ui/labels.ts), không chép tay.
                  Vì sao: câu này đã đổi ba lần trong ngày 01/08/2026 — "Chỉ thầy cô chủ
                  nhiệm thấy" → "…chủ nhiệm và thầy cô tâm lý thấy" → câu hiện tại, mỗi lần
                  vì phạm vi core.can_read_mood() ở tầng dữ liệu đổi. Lần cuối là ADR-026 +
                  migration 0044: nhánh chủ nhiệm bị cắt hẳn, cô không đọc được ô cảm xúc
                  nữa (cô vẫn nhận cờ "cần để ý" và vẫn nhận ngay tín hiệu cần gặp). Ba lần
                  chép tay ra ba màn là ba cơ hội cho một màn quên sửa — và popup này là màn
                  duy nhất TỰ MỞ trước mặt em, tức chỗ lời hứa sai sẽ được đọc nhiều nhất. */}
              {NHAN_AI_DOC_CAM_XUC}
            </div>
            <div className="mt-5 grid w-full grid-cols-4 gap-3">
              {MOOD_ORDER.map((mood) => {
                const style = MOOD_STYLE[mood];
                return (
                  <button
                    key={mood}
                    type="button"
                    disabled={submitMood.isPending}
                    onClick={() => submitMood.mutate({ mood })}
                    className={`flex flex-col items-center gap-2 rounded-[18px] px-2 py-5 disabled:opacity-60 ${style.text}`}
                    style={{ background: style.bg, boxShadow: style.shadow }}
                  >
                    <span className="msr text-[40px]">{style.icon}</span>
                    <span className="text-[13.5px] font-black">{MOOD_LABEL[mood]}</span>
                  </button>
                );
              })}
            </div>
            {/* Trước đây mutation hỏng thì bốn ô chỉ hết mờ rồi đứng im — em bấm lại
                mãi mà không hiểu vì sao không có gì xảy ra. */}
            {submitMood.isError && (
              <div className="mt-4 w-full">
                <MutationError error={submitMood.error} />
              </div>
            )}
            <Link
              href="/can-gap-thay-co"
              className="mt-5 flex items-center gap-2 rounded-[14px] border-[1.7px] border-gold bg-[#FFFBEE] px-5 py-3.5 text-[13.5px] font-black text-gold-textDark"
            >
              <span className="msr text-[19px] text-[#E8940D]">waving_hand</span>
              Mình cần gặp thầy cô
            </Link>
          </div>
        ) : (
          <div role="status" aria-live="polite" className="flex flex-col items-center px-8 pb-8 pt-1 text-center">
            <Mascot pose="celebrate" width={76} />
            <div id="checkin-modal-xong" className="mt-2 text-[26px] font-black text-ink">Tuyệt vời!</div>
            <p className="mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-[#5B6B80]">
              Hôm nay con thấy <b className="text-[#00A05F]">{MOOD_LABEL[done.mood]}</b> — đã ghi lúc{" "}
              <b className="text-navy">{done.checkedInAt}</b>.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <span className="flex items-center gap-2 rounded-2xl bg-[#E3F8ED] px-[18px] py-3">
                <span className="msr text-[21px] text-[#00A05F]">check_circle</span>
                <span className="text-[12.5px] font-black text-[#00693F]">Điểm danh hôm nay</span>
              </span>
              <span className="flex items-center gap-2 rounded-2xl bg-[#FFF7E0] px-[18px] py-3">
                <span className="msr text-[21px] text-[#F58F00]">local_fire_department</span>
                <span className="text-[12.5px] font-black text-[#8A5A00]">Chuỗi {done.streakDays} ngày</span>
              </span>
            </div>
            <div className="mt-5 flex w-full flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 basis-[200px] rounded-[15px] bg-gradient-to-r from-navy to-navy-light py-[15px] text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.28)]"
              >
                Xong, về trang chủ
              </button>
              <Link
                href="/can-gap-thay-co"
                className="flex items-center gap-2 rounded-[15px] border-[1.7px] border-gold bg-[#FFFBEE] px-5 py-[15px] text-[14px] font-black text-gold-textDark"
              >
                <span className="msr text-[19px] text-[#E8940D]">waving_hand</span>
                Cần gặp thầy cô
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
    <div className="-translate-y-1.5 rounded-[20px] border border-white bg-white p-[22px] shadow-[0_2px_6px_rgba(10,42,94,.06),0_18px_40px_rgba(10,42,94,.18),0_44px_80px_rgba(10,42,94,.12)]">
      <div className="flex items-baseline justify-between">
        <span className="text-[16px] font-black text-navy">Tuần này của mình</span>
        <span className="text-[10.5px] text-caption">{new Date().toLocaleDateString("vi-VN")}</span>
      </div>
      {/* Hai thanh RỖNG khi query hỏng là lời nói dối tệ nhất trên trang này: nó bảo
          đứa trẻ rằng tuần này em chưa đi học buổi nào. Hỏng thì không vẽ thanh. */}
      {state === "error" ? (
        <div className="mt-3 flex flex-col items-start gap-1.5">
          <p className="text-[12px] font-semibold text-[#5B6B80]">Chưa tải được số liệu tuần này (—).</p>
          <button type="button" onClick={onRetry} className="text-[12px] font-black text-[#1D4E8F] underline underline-offset-2">
            Thử lại
          </button>
        </div>
      ) : (
        <>
          <ProgressRow loading={state === "loading"} icon="event_available" iconColor="text-[#00A05F]" label="Đi học" value={checkinDays ?? 0} max={5} barFrom="#00D97A" barTo="#00A05F" valueColor="text-[#00A05F]" />
          <ProgressRow loading={state === "loading"} icon="sentiment_satisfied" iconColor="text-[#2C7BF2]" label="Tâm trạng vui" value={happyDays ?? 0} max={5} barFrom="#4E9BFF" barTo="#2C7BF2" valueColor="text-[#2C7BF2]" />
        </>
      )}
      <Link
        href="/bao-cao"
        className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-[#F5F8FC] py-[11px] text-[12.5px] font-extrabold text-[#1D4E8F]"
      >
        Xem Báo cáo Trưởng thành
        <span className="msr text-[17px]">arrow_forward</span>
      </Link>
    </div>
  );
}

function ProgressRow({
  icon,
  iconColor,
  label,
  value,
  max,
  barFrom,
  barTo,
  valueColor,
  loading,
}: {
  icon: string;
  iconColor: string;
  label: string;
  value: number;
  max: number;
  barFrom: string;
  barTo: string;
  valueColor: string;
  loading?: boolean;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="mt-3 flex items-center gap-[11px]">
      <span className={`msr text-[19px] ${iconColor}`}>{icon}</span>
      <div className="flex-1">
        <div className="mb-1 text-[11.5px] font-bold text-[#5B6B80]">{label}</div>
        <div className={`h-2 rounded-[4px] bg-[#EEF1F6] ${loading ? "animate-pulse" : ""}`}>
          {!loading && (
            <div className="h-2 rounded-[4px]" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${barFrom},${barTo})` }} />
          )}
        </div>
      </div>
      <span className={`text-[12px] font-black ${valueColor}`}>{loading ? "…" : `${value}/${max}`}</span>
    </div>
  );
}

function TodayCard({ checkedInAt }: { checkedInAt: string }) {
  return (
    <div className="-translate-y-1.5 rounded-[20px] border border-white bg-white p-[22px] shadow-[0_2px_6px_rgba(10,42,94,.06),0_18px_40px_rgba(10,42,94,.18),0_44px_80px_rgba(10,42,94,.12)]">
      <div className="text-[16px] font-black text-navy">Hôm nay</div>
      <div className="mt-[15px] flex items-center gap-3">
        <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl bg-[#E3F8ED]">
          <span className="msr text-[19px] text-[#00A05F]">event_available</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-extrabold text-navy">Đã đến trường {checkedInAt}</div>
          {/* #9AA5B5 (2,49:1) → token caption2 (#66707D, 5,03:1). Dòng này giải thích VÌ SAO
              có mốc giờ ở trên — nó là nội dung, không phải chữ trang trí. (01/08/2026) */}
          <div className="mt-px text-[10.5px] text-caption2">điểm danh tự động</div>
        </div>
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
      <div aria-hidden className="absolute -right-6 -bottom-[42px] h-[110px] w-[110px] rounded-full bg-white/35" />
      <span className="msr relative text-[26px] text-navy">workspace_premium</span>
      <div className="relative flex-1">
        <div className="text-[13px] font-black text-navy">Báo cáo Trưởng thành</div>
        <div className="mt-0.5 text-[11px] text-gold-text">Xem tuần này mình lớn lên thế nào →</div>
      </div>
    </Link>
  );
}

function StreakCard({ streakDays }: { streakDays: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-[10px] shadow-[0_3px_12px_rgba(10,42,94,.07)]">
      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl bg-[#E3F8ED]">
        <span className="msr text-[19px] text-domain-studyDark">local_fire_department</span>
      </span>
      <div className="flex-1">
        <div className="text-[12.5px] font-extrabold text-navy">Chuỗi check-in: {streakDays} ngày</div>
        <div className="mt-0.5 text-[10.5px] text-caption2">Giữ đều mỗi ngày để chuỗi không đứt</div>
      </div>
    </div>
  );
}
