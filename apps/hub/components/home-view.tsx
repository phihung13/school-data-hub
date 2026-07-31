// Trang chủ chung (P1 GĐ1) — DESIGN-GUIDELINES §1: MỘT trang chủ, lưới mini app
// đổi theo quyền, không có "trang chủ riêng cho từng vai trò".
//
// Hai bố cục THẬT SỰ khác nhau theo khung, không phải co giãn một bản:
// - Mobile (<md, khớp Hub Mobile.dc.html M3): một cột, thẻ check-in trồi lên
//   vòm, tab bar dưới cùng.
// - Desktop (≥md, khớp Hub Desktop V2.dc.html V2, 29/07/2026): sidebar 240px cố
//   định (HubSidebar) + hero có ô tìm kiếm/chuông + 3 thẻ số liệu thật + thẻ
//   check-in hiện nguyên lưới cảm xúc ngay trên trang (không cần bấm mới thấy).
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import type { MiniAppTile as MiniAppTileType, MoodValue } from "@hub/core/contracts";
import { MOOD_LABEL } from "@hub/core/contracts";
import { MiniAppTile } from "./mini-app-tile";
import { StudentTabBar } from "./tab-bar";
import { Mascot } from "./mascot";
import { HubSidebar } from "./hub-sidebar";

interface HomeData {
  displayName: string;
  email: string;
  isStudent: boolean;
  isHomeroom: boolean;
  today: string;
  miniApps: MiniAppTileType[];
  checkedInToday?: boolean;
  checkedInAt?: string | null;
  streakDays?: number;
  checkinDaysThisWeek?: number;
  happyDaysThisWeek?: number;
}

export function HomeView({
  displayName,
  email,
  isStudent,
  isHomeroom,
  initialMiniApps,
}: {
  displayName: string;
  email: string;
  isStudent: boolean;
  isHomeroom: boolean;
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

  const data: HomeData = {
    displayName,
    email,
    isStudent,
    isHomeroom,
    today,
    miniApps: miniAppsQuery.data ?? [],
    checkedInToday: todayStatus.data?.checkedInToday,
    checkedInAt: todayStatus.data?.checkedInAt,
    streakDays: todayStatus.data?.streakDays,
    checkinDaysThisWeek: growthReport.data?.report.checkinDaysThisWeek,
    happyDaysThisWeek: growthReport.data?.report.happyDaysThisWeek,
  };

  return (
    <>
      <div className="md:hidden">
        <MobileHome data={data} />
      </div>
      <div className="hidden md:flex md:h-screen md:w-full md:overflow-hidden">
        <div className="flex w-[240px] flex-none">
          <HubSidebar role={isStudent ? "student" : "teacher"} active="home" fullName={displayName} email={email} />
        </div>
        <DesktopHome data={data} />
      </div>
    </>
  );
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
            <div className="text-[17px] font-black text-white">Chào {data.displayName} 👋</div>
            <div className="mt-0.5 text-[11.5px] text-[#D6E6FF]">{data.today}</div>
          </div>
          <span className="msr text-[22px] text-white">notifications</span>
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
            {data.streakDays !== undefined && <StreakCard streakDays={data.streakDays} />}
          </>
        )}

        {data.isHomeroom && !data.isStudent && (
          <p className="mt-4 text-center text-[12px] text-muted">
            Mở <b>Buồng lái</b> ở lưới mini app phía trên để xem lớp sáng nay.
          </p>
        )}
      </div>

      {data.isStudent && <StudentTabBar />}
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
          {data.checkedInToday ? "Đã check-in hôm nay, cảm ơn em!" : "Hôm nay con thấy thế nào?"}
        </p>
      </div>
      {!data.checkedInToday && (
        <Link
          href="/checkin"
          className="rounded-[13px] bg-gradient-to-br from-navy to-navy-light py-3 text-center text-[13.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)]"
        >
          Check-in ngay →
        </Link>
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
          <div className="relative mb-5 flex items-center gap-3.5">
            <div className="ml-auto flex w-80 flex-none items-center gap-2.5 rounded-full border border-white/20 bg-white/[.16] px-[15px] py-2.5">
              <span className="msr text-[18px] text-[#C7D8F0]">search</span>
              <span className="text-[12.5px] text-[#C7D8F0]">Tìm mini app, hoạt động…</span>
            </div>
            <Link href="/ho-so" aria-label="Thông báo" className="relative flex-none">
              <span className="msr text-[23px] text-white">notifications</span>
            </Link>
          </div>
          <div className="relative flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-1 basis-[300px]">
              <div className="text-[40px] font-black leading-[1.1] text-white">Chào {data.displayName} 👋</div>
              <div className="mt-2 text-[14px] font-semibold text-[#D6E6FF]">{data.today}</div>
            </div>
            {data.isStudent && (
              <div className="flex flex-none basis-[420px] gap-2.5">
                <HeroStat value={data.checkedInAt ?? "—"} label="đã đến trường" />
                <HeroStat value={`${data.checkinDaysThisWeek ?? 0}/5`} label="ngày tuần này" gold />
                <HeroStat value={String(data.streakDays ?? 0)} label="chuỗi check-in" />
              </div>
            )}
          </div>
        </div>

        <div className="mt-[-34px] flex flex-wrap items-start gap-5 px-7">
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
                checkinDays={data.checkinDaysThisWeek ?? 0}
                happyDays={data.happyDaysThisWeek ?? 0}
              />
            )}
            {data.isStudent && data.checkedInToday && data.checkedInAt && <TodayCard checkedInAt={data.checkedInAt} />}
            {data.isHomeroom && !data.isStudent && (
              <div className="-translate-y-1.5 rounded-[20px] border border-white bg-white p-[22px] shadow-[0_2px_6px_rgba(10,42,94,.06),0_18px_40px_rgba(10,42,94,.18),0_44px_80px_rgba(10,42,94,.12)]">
                <div className="text-[16px] font-black text-navy">Buồng lái đang chờ</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                  Mở <b>Buồng lái</b> ở lưới mini app bên trái để xem lớp sáng nay: cờ ưu tiên, xác nhận gửi muộn, mood lớp.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
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
      <div className="mt-3.5 flex items-center gap-3.5">
        <Mascot pose="wave" width={52} />
        <div className="flex-1 text-[14.5px] font-semibold text-[#33507C]">
          {data.checkedInToday ? `Đã check-in lúc ${data.checkedInAt} — cảm ơn con!` : "Hôm nay con thấy thế nào?"}
        </div>
        {!data.checkedInToday && (
          <button
            type="button"
            onClick={onOpenModal}
            className="flex-none rounded-[14px] bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[13.5px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)]"
          >
            Check-in ngay
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// V3/V3b (Hub Desktop V2): MỘT popup nổi trên trang chủ, hai trạng thái — chọn
// cảm xúc rồi đổi thẳng sang ăn mừng, không điều hướng/không tải trang mới.
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1A32]/50 p-6 backdrop-blur-[2px]">
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-[28px] bg-white shadow-[0_30px_70px_rgba(6,20,45,.4)]">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[5px]"
          style={{ background: "linear-gradient(90deg,#00D97A,#2C7BF2,#FFC833,#F0474D)" }}
        />
        <div className="flex items-center justify-end p-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#9AA5B5] hover:bg-[#F1F4F8]"
          >
            <span className="msr text-[22px]">close</span>
          </button>
        </div>

        {!done ? (
          <div className="flex flex-col items-center px-8 pb-8 pt-1">
            <Mascot pose="wave" width={64} />
            <div className="mt-2 text-center text-[24px] font-black text-ink">Hôm nay con thấy thế nào?</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6B7789]">
              <span className="msr text-[15px] text-caption">lock</span>
              Chỉ GVCN của con nhìn thấy
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
            <Link
              href="/can-gap-thay-co"
              className="mt-5 flex items-center gap-2 rounded-[14px] border-[1.7px] border-gold bg-[#FFFBEE] px-5 py-3.5 text-[13.5px] font-black text-gold-textDark"
            >
              <span className="msr text-[19px] text-[#E8940D]">waving_hand</span>
              Mình cần gặp thầy cô
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center px-8 pb-8 pt-1 text-center">
            <Mascot pose="celebrate" width={76} />
            <div className="mt-2 text-[26px] font-black text-ink">Tuyệt vời!</div>
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

function ThisWeekCard({ checkinDays, happyDays }: { checkinDays: number; happyDays: number }) {
  return (
    <div className="-translate-y-1.5 rounded-[20px] border border-white bg-white p-[22px] shadow-[0_2px_6px_rgba(10,42,94,.06),0_18px_40px_rgba(10,42,94,.18),0_44px_80px_rgba(10,42,94,.12)]">
      <div className="flex items-baseline justify-between">
        <span className="text-[16px] font-black text-navy">Tuần này của mình</span>
        <span className="text-[10.5px] text-caption">{new Date().toLocaleDateString("vi-VN")}</span>
      </div>
      <ProgressRow icon="event_available" iconColor="text-[#00A05F]" label="Đi học" value={checkinDays} max={5} barFrom="#00D97A" barTo="#00A05F" valueColor="text-[#00A05F]" />
      <ProgressRow icon="sentiment_satisfied" iconColor="text-[#2C7BF2]" label="Tâm trạng vui" value={happyDays} max={5} barFrom="#4E9BFF" barTo="#2C7BF2" valueColor="text-[#2C7BF2]" />
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
}: {
  icon: string;
  iconColor: string;
  label: string;
  value: number;
  max: number;
  barFrom: string;
  barTo: string;
  valueColor: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="mt-3 flex items-center gap-[11px]">
      <span className={`msr text-[19px] ${iconColor}`}>{icon}</span>
      <div className="flex-1">
        <div className="mb-1 text-[11.5px] font-bold text-[#5B6B80]">{label}</div>
        <div className="h-2 rounded-[4px] bg-[#EEF1F6]">
          <div className="h-2 rounded-[4px]" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${barFrom},${barTo})` }} />
        </div>
      </div>
      <span className={`text-[12px] font-black ${valueColor}`}>{value}/{max}</span>
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
          <div className="mt-px text-[10.5px] text-[#9AA5B5]">điểm danh tự động</div>
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
