// components/gvcn-dashboard.tsx — V10 Trang chủ GVCN (Hub Desktop V2, 30/07/2026).
// KHÔNG có "Duyệt Báo cáo Trưởng thành" (chưa có bảng phê duyệt) và "Chuyển tâm lý
// cụm" (GĐ2, chưa có contract — xem packages/core/contracts/care.ts) như bản vẽ
// tay. care.getDashboard đã có sẵn hầu hết còn lại (chuỗi cờ ưu tiên, xác nhận gửi
// muộn, mood lớp) — thêm totalStudents/openCareCases/recentActions (thật, không bịa).
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { HubSidebar } from "./hub-sidebar";
import { Mascot } from "./mascot";

const MOOD_META: Record<1 | 2 | 3 | 4, { label: string; dot: string; grad: string }> = {
  4: { label: "Vui", dot: "#00C96F", grad: "linear-gradient(160deg,#00D97A,#00A85E)" },
  3: { label: "Bình thường", dot: "#2C7BF2", grad: "linear-gradient(160deg,#4E9BFF,#2C7BF2)" },
  2: { label: "Mệt", dot: "#F5A300", grad: "linear-gradient(160deg,#FFC833,#F5A300)" },
  1: { label: "Buồn", dot: "#F0474D", grad: "linear-gradient(160deg,#FF7A7F,#F0474D)" },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  return `${days} ngày trước`;
}

export function GvcnDashboard({ displayName, email }: { displayName: string; email: string }) {
  const utils = trpc.useUtils();
  const dashboard = trpc.care.getDashboard.useQuery();
  const acknowledgeLate = trpc.care.acknowledgeLate.useMutation({
    onSuccess: () => utils.care.getDashboard.invalidate(),
  });
  const logIntervention = trpc.care.logIntervention.useMutation({
    onSuccess: () => utils.care.getDashboard.invalidate(),
  });
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const greetName = displayName.replace(/\s*\([^)]*\)\s*$/, "").trim() || displayName;

  if (dashboard.isLoading) {
    return <div className="p-8 text-center text-[13px] text-muted">Đang tải buồng lái…</div>;
  }
  if (dashboard.error || !dashboard.data) {
    return (
      <div className="p-8 text-center text-[13px] text-mood-sadDark">
        Không tải được buồng lái — {dashboard.error?.message ?? "vui lòng thử lại."}
      </div>
    );
  }
  const d = dashboard.data;
  const totalMood = d.moodDistribution.reduce((s, m) => s + m.count, 0) || 1;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex w-[240px] flex-none">
        <HubSidebar role="teacher" active="home" fullName={displayName} email={email} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-pagebgDesktop">
        <div className="flex-1 overflow-y-auto p-7">
          <div className="flex flex-wrap items-end justify-between gap-3.5">
            <div>
              <div className="text-[24px] font-black text-navy">Chào {greetName} 👋</div>
              <div className="mt-1 text-[13px] font-semibold text-[#5B6B80]">
                GVCN lớp {d.className} · {d.totals.totalStudents} học sinh
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-[#E9ECF2] bg-white px-[15px] py-2.5">
              <span className="msr text-[17px] text-[#E8940D]">folder_open</span>
              <span className="text-[12px] font-extrabold text-[#33507C]">
                {d.totals.openCareCases} hồ sơ chăm sóc đang mở
              </span>
            </span>
          </div>

          {d.staleSources.length > 0 && (
            <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-[#FFF1C9] px-4 py-2.5 text-[11.5px] font-bold text-gold-textDark">
              <span className="msr text-[16px]">warning</span>
              Nguồn dữ liệu chưa tươi: {d.staleSources.join(", ")} — số liệu có thể chưa cập nhật đủ.
            </div>
          )}

          <div className="mt-[18px] flex flex-wrap gap-4">
            <StatCard label="Đã check-in" icon="how_to_reg" iconBg="bg-[#E3F8ED]" iconColor="text-[#00A05F]" value={`${d.totals.checkinCount}/${d.totals.totalStudents}`} sub="tính đến giờ" />
            <StatCard label="Chờ xác nhận" icon="schedule" iconBg="bg-[#FFF1C9]" iconColor="text-[#E8940D]" value={String(d.totals.pendingLateCount)} sub="gửi muộn — chưa phải vắng" accentTop="#FFC629" />
            <StatCard label="Cờ đang mở" icon="flag" iconBg="bg-[#FFF0F0]" iconColor="text-[#D2383E]" value={String(d.priorityFlags.length)} sub={d.priorityFlags.length > 0 ? "cần xử lý" : "không có cờ nào"} accentTop={d.priorityFlags.length > 0 ? "#F0474D" : undefined} />
            <StatCard label="Vắng" icon="person_off" iconBg="bg-[#F1F4F8]" iconColor="text-[#5B6B80]" value={String(d.totals.absentCount)} sub={d.totals.absentCount === 0 ? "không có ai vắng" : "học sinh"} />
          </div>

          <div className="mt-[18px] flex flex-wrap items-start gap-[18px]">
            <div className="min-w-0 flex-[2_1_540px] flex flex-col gap-4">
              <div className="text-[16px] font-black text-navy">Việc cần làm sáng nay</div>

              {d.priorityFlags.map((flag) => (
                <div
                  key={flag.flagId}
                  className="flex flex-col gap-3.5 rounded-[20px] border-l-[5px] border-gold bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]"
                >
                  <div>
                    <span className="rounded-full bg-[#FFF1C9] px-[11px] py-1.5 text-[10px] font-black tracking-wide text-gold-textDark">
                      {flag.ruleCode === "E_URGENT" ? "ƯU TIÊN — CẦN GẶP THẦY CÔ" : "ƯU TIÊN HÔM NAY"}
                    </span>
                    <div className="mt-2.5 text-[15px] font-black text-ink">
                      Cờ E — cảm xúc · {flag.studentName}
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-[#5B6B80]">
                      {flag.detail.helpRequested
                        ? `Đã bấm «cần gặp thầy cô»${flag.detail.negativeDays ? ` + mood buồn/mệt ${flag.detail.negativeDays} ngày gần đây` : ""}`
                        : `Mood buồn/mệt ${flag.detail.negativeDays} ngày gần đây`}
                    </div>
                  </div>
                  <textarea
                    value={noteDraft[flag.flagId] ?? ""}
                    onChange={(e) => setNoteDraft((s) => ({ ...s, [flag.flagId]: e.target.value }))}
                    placeholder="Ghi lại đã trò chuyện gì với em…"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[12.5px] outline-none focus:border-navy"
                  />
                  <button
                    type="button"
                    disabled={logIntervention.isPending}
                    onClick={() =>
                      logIntervention.mutate({
                        caseId: flag.caseId ?? flag.flagId,
                        action: "Đã trò chuyện với học sinh",
                        note: noteDraft[flag.flagId] || undefined,
                      })
                    }
                    className="self-start rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white disabled:opacity-50"
                  >
                    Ghi can thiệp
                  </button>
                </div>
              ))}

              {d.pendingLateCheckins.length > 0 && (
                <div className="flex flex-wrap items-center gap-4 rounded-[20px] border-l-[5px] border-[#2C7BF2] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-[#E2F0FC]">
                    <span className="msr text-[22px] text-[#2C7BF2]">schedule</span>
                  </span>
                  <div className="min-w-0 flex-1 basis-[260px]">
                    <div className="text-[14.5px] font-black text-ink">
                      {d.pendingLateCheckins.length} check-in gửi muộn — chờ cô xác nhận
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[#5B6B80]">
                      {d.pendingLateCheckins.map((c) => c.studentName).join(" · ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={acknowledgeLate.isPending}
                    onClick={() => acknowledgeLate.mutate({ checkinIds: d.pendingLateCheckins.map((c) => c.checkinId) })}
                    className="flex-none rounded-xl border-[1.6px] border-[#2C7BF2] bg-[#E2F0FC] px-5 py-3 text-[12.5px] font-black text-[#1D4E8F] disabled:opacity-50"
                  >
                    Xác nhận cả {d.pendingLateCheckins.length}
                  </button>
                </div>
              )}

              {d.priorityFlags.length === 0 && d.pendingLateCheckins.length === 0 && (
                <div className="flex items-center gap-3.5 rounded-[20px] border-2 border-dashed border-[#C9D8CB] bg-[#F2F8F3] px-5 py-[18px]">
                  <Mascot pose="thumbsup" width={44} />
                  <div>
                    <div className="text-[14px] font-black text-[#00693F]">Hết việc rồi — lớp mình đang ổn!</div>
                    <div className="mt-0.5 text-[12px] leading-relaxed text-[#5D6B60]">
                      Đây là trạng thái tốt thật sự, không phải thiếu dữ liệu
                      {d.lastScanAt ? ` (quét gần nhất ${new Date(d.lastScanAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })})` : ""}.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-4">
              <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-black text-navy">Cảm xúc lớp hôm nay</span>
                  <span className="flex items-center gap-1 text-[9.5px] font-bold text-caption">
                    <span className="msr text-[13px]">lock</span>nội bộ
                  </span>
                </div>
                {totalMood > 1 || d.moodDistribution.length > 0 ? (
                  <>
                    <div className="mt-3.5 flex h-[18px] overflow-hidden rounded-lg">
                      {([4, 3, 2, 1] as const).map((m) => {
                        const count = d.moodDistribution.find((x) => x.mood === m)?.count ?? 0;
                        const pct = (count / totalMood) * 100;
                        return pct > 0 ? <span key={m} style={{ width: `${pct}%`, background: MOOD_META[m].grad }} /> : null;
                      })}
                    </div>
                    <div className="mt-3.5 flex flex-col gap-2">
                      {([4, 3, 2, 1] as const).map((m) => (
                        <div key={m} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: MOOD_META[m].dot }} />
                          <span className="flex-1 text-[12px] font-bold text-[#33507C]">{MOOD_META[m].label}</span>
                          <span className="text-[12px] font-black text-navy">
                            {d.moodDistribution.find((x) => x.mood === m)?.count ?? 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-3.5 text-[12px] text-caption">Chưa có check-in nào hôm nay.</p>
                )}
              </div>

              <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                <div className="text-[15px] font-black text-navy">Hành động gần đây</div>
                <div className="mt-3.5 flex flex-col gap-3">
                  {d.recentActions.length === 0 && (
                    <p className="text-[12px] text-caption">Chưa có hành động nào được ghi lại.</p>
                  )}
                  {d.recentActions.map((a, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className={`mt-[5px] h-[9px] w-[9px] flex-none rounded-full ${i === 0 ? "bg-[#2C7BF2]" : "bg-[#C9D2DE]"}`} />
                      <span className="text-[12.5px] leading-relaxed text-[#4A5460]">
                        {a.action} — {a.studentName} · {timeAgo(a.occurredAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-[20px] border-[1.5px] border-[#FFE29A] bg-[#FFF7E0] p-[18px]">
                <span className="msr flex-none text-[19px] text-[#E8940D]">translate</span>
                <span className="text-[12px] font-semibold leading-relaxed text-[#8A5A00]">
                  Từ «cờ / ngưỡng» chỉ dùng ở đây. Nội dung gửi phụ huynh tự chuyển sang giọng Glow &amp; Grow.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  icon,
  iconBg,
  iconColor,
  value,
  sub,
  accentTop,
}: {
  label: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  value: string;
  sub: string;
  accentTop?: string;
}) {
  return (
    <div
      className="flex-1 basis-[190px] rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]"
      style={accentTop ? { borderTop: `3px solid ${accentTop}` } : undefined}
    >
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-extrabold text-[#5B6B80]">{label}</span>
        <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-[11px] ${iconBg}`}>
          <span className={`msr text-[18px] ${iconColor}`}>{icon}</span>
        </span>
      </div>
      <div className="mt-1.5 text-[30px] font-black text-navy">{value}</div>
      <div className="mt-1.5 text-[11px] font-semibold text-caption">{sub}</div>
    </div>
  );
}
