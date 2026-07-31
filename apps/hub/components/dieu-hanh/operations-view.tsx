// apps/hub/components/dieu-hanh/operations-view.tsx — màn "Điều hành" cho BGH.
//
// Bốn luật hình thành toàn bộ màn này. Không luật nào là ý thích trình bày:
//
//  1. §9 — CHỈ số tổng hợp theo lô. Đơn vị nhỏ nhất trên màn là MỘT LỚP. Không có ô
//     nào bấm được để đi tới một em, và procedure phía sau cũng không trả về em nào
//     (`report.getOperationsOverview` + 0040). Dòng chữ "không tra cứu học sinh cá
//     nhân" in ngay đầu màn là LỜI HỨA, và lời hứa in trên màn hình là ràng buộc kỹ
//     thuật — nó đúng vì đường dữ liệu không có em nào để mà lộ, không phải vì UI
//     quên vẽ nút.
//  2. "Im lặng không phải kết luận" — em chưa check-in KHÔNG được vẽ chung màu với
//     em vắng. Đây là cột riêng, màu xám, nhãn "chưa có dữ liệu". Trộn hai thứ này
//     là biến một khoảng trống dữ liệu thành một lời buộc tội.
//  3. Ngưỡng ẩn danh — lớp dưới `minCohort` em: server trả `null`, màn hình in "—"
//     kèm giải thích. KHÔNG in 0. `0` và `không được phép nói` là hai câu khác nhau.
//  4. §8 hai giọng — đây là buồng vận hành, nên dùng đúng từ vận hành (khối, sĩ số,
//     chưa có dữ liệu, hồ sơ chăm sóc). Không có một chữ "Glow & Grow" nào ở đây, và
//     ngược lại không chữ nào của màn này được rơi sang màn của học sinh/phụ huynh.
"use client";

import { useState } from "react";
import type { HubRole } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";
import { Card, OperationsShell } from "./operations-shell";

/** Ngày địa phương dạng YYYY-MM-DD (không dùng toISOString — nó đổi ngày theo UTC). */
function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Khớp MAX_LOOKBACK_DAYS ở `server/routers/report.ts` — server vẫn là nơi cưỡng chế. */
const MAX_LOOKBACK_DAYS = 60;

function hourMinute(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Ô số có thể bị che. `null` KHÔNG được rơi về 0 ở bất kỳ nhánh nào — đó là toàn bộ
 * lý do component này tồn tại thay vì viết `{n ?? 0}` tại chỗ.
 */
function Num({ value, tone = "ink" }: { value: number | null; tone?: "ink" | "muted" | "warn" | "danger" }) {
  if (value === null) {
    return (
      <span className="text-[13px] font-bold text-caption" title="Nhóm dưới ngưỡng ẩn danh — không hiện số">
        —
      </span>
    );
  }
  const cls =
    tone === "muted"
      ? "text-muted"
      : tone === "warn"
        ? "text-gold-textDark"
        : tone === "danger"
          ? "text-[#C0272D]"
          : "text-ink";
  return <span className={`text-[13px] font-black tabular-nums ${cls}`}>{value}</span>;
}

/** Tỉ lệ check-in. Không có mẫu số hoặc bị che → không tính, và nói là không tính. */
function rateLabel(checkedIn: number | null, roster: number): string {
  if (checkedIn === null || roster === 0) return "—";
  return `${Math.round((checkedIn / roster) * 100)}%`;
}

function MoodBar({
  happy,
  normal,
  tired,
  sad,
  reported,
}: {
  happy: number | null;
  normal: number | null;
  tired: number | null;
  sad: number | null;
  reported: number | null;
}) {
  if (happy === null || normal === null || tired === null || sad === null) {
    return (
      <span className="text-[11.5px] font-semibold text-caption">
        {reported === null ? "—" : `${reported} em đã ghi · chưa đủ để hiện phân bố`}
      </span>
    );
  }
  const total = happy + normal + tired + sad;
  if (total === 0) return <span className="text-[11.5px] font-semibold text-caption">Chưa em nào ghi</span>;
  const seg = [
    { n: happy, cls: "bg-mood-happyDark", label: "Vui" },
    { n: normal, cls: "bg-mood-normalDark", label: "Bình thường" },
    { n: tired, cls: "bg-mood-tiredDark", label: "Mệt" },
    { n: sad, cls: "bg-mood-sadDark", label: "Buồn" },
  ];
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-chip" aria-hidden>
        {seg.map((s) => (
          <div key={s.label} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>
      {/* Màu không được là tín hiệu duy nhất (§11): số đi kèm chữ, đọc được bằng màn đọc màn hình. */}
      <span className="text-[10.5px] font-bold text-muted">
        {seg.filter((s) => s.n > 0).map((s) => `${s.label} ${s.n}`).join(" · ")}
      </span>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[10.5px] font-black uppercase tracking-wide text-caption ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function OperationsView({
  displayName,
  email,
  roles,
}: {
  displayName: string;
  email: string;
  roles: HubRole[];
}) {
  const today = localIso(new Date());
  const oldest = (() => {
    const d = new Date();
    d.setDate(d.getDate() - MAX_LOOKBACK_DAYS);
    return localIso(d);
  })();
  const [onDate, setOnDate] = useState(today);

  const query = trpc.report.getOperationsOverview.useQuery({ onDate });
  const data = query.data;

  const toolbar = (
    <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
      <span className="msr text-[18px] text-navy" aria-hidden>
        event
      </span>
      <span className="text-[11.5px] font-black text-muted">Ngày</span>
      <input
        type="date"
        value={onDate}
        min={oldest}
        max={today}
        onChange={(e) => setOnDate(e.target.value || today)}
        aria-label="Ngày xem số liệu"
        className="bg-transparent text-[12.5px] font-extrabold text-ink outline-none"
      />
    </label>
  );

  return (
    <OperationsShell
      title="Điều hành"
      subtitle={
        data
          ? `Số liệu tính đến ${hourMinute(data.asOf)} · ${data.grades.length} khối · ${data.classes.length} lớp`
          : undefined
      }
      displayName={displayName}
      email={email}
      roles={roles}
      toolbar={toolbar}
    >
      {/* Lời hứa §9, in trước cả số liệu. */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-line bg-white px-4 py-3">
        <span className="msr mt-0.5 text-[18px] text-navy" aria-hidden>
          lock
        </span>
        <p className="text-[12px] font-semibold leading-relaxed text-muted">
          Màn hình này chỉ hiện <strong className="text-ink">số tổng hợp theo lô</strong> — không tra cứu học
          sinh cá nhân. Nhóm dưới{" "}
          <strong className="text-ink">{data ? data.minCohort : "ngưỡng"}</strong> em không hiện số, vì ở quy mô
          đó con số của lớp chính là dữ liệu của một em.
        </p>
      </div>

      {query.isPending ? (
        <LoadingState label="Đang tổng hợp số liệu…" />
      ) : query.error ? (
        <ErrorState error={query.error} label="màn Điều hành" onRetry={() => void query.refetch()} />
      ) : !data || data.classes.length === 0 ? (
        <EmptyState
          icon="school"
          title="Chưa có lớp nào trong phạm vi của bạn"
          hint="Danh sách lớp đến từ sổ ghi danh của trường. Trống ở đây nghĩa là sổ chưa có lớp nào, không phải lỗi tải dữ liệu."
        />
      ) : (
        <>
          {/* ── Theo KHỐI ─────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[13px] font-black text-cardtitle">Theo khối</h2>
            {data.grades.length === 0 ? (
              <Card>
                <p className="text-[12.5px] font-semibold text-caption">
                  Chưa khối nào có sĩ số — chưa có gì để cộng.
                </p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.grades.map((g) => (
                  <Card key={`${g.grade}`} className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[15px] font-black text-navy">Khối {g.grade}</span>
                      <span className="text-[11.5px] font-bold text-muted">
                        {g.classCount} lớp · {g.rosterCount} em
                      </span>
                    </div>

                    <div className="flex items-end gap-2">
                      <span className="text-[26px] font-black leading-none text-navy tabular-nums">
                        {rateLabel(g.checkedInCount, g.rosterCount)}
                      </span>
                      <span className="pb-1 text-[11.5px] font-bold text-muted">đã check-in</span>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <Stat label="Chờ xác nhận" value={g.pendingLateCount} tone="warn" />
                      <Stat label="Vắng / có phép" value={g.absentCount} tone="danger" />
                      {/* Cột này KHÔNG mang màu cảnh báo: nó là khoảng trống dữ liệu,
                          không phải một kết luận về em nào. */}
                      <Stat label="Chưa có dữ liệu" value={g.noRecordCount} tone="muted" />
                      <Stat label="Hồ sơ đang mở" value={g.openCareCount} tone="ink" />
                    </dl>

                    <MoodBar
                      happy={g.moodHappy}
                      normal={g.moodNormal}
                      tired={g.moodTired}
                      sad={g.moodSad}
                      reported={g.moodReported}
                    />
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* ── Theo LỚP ──────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[13px] font-black text-cardtitle">Theo lớp</h2>
            <Card className="p-0 md:p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      <Th>Lớp</Th>
                      <Th align="right">Sĩ số</Th>
                      <Th align="right">Đã check-in</Th>
                      <Th align="right">Chờ xác nhận</Th>
                      <Th align="right">Vắng / có phép</Th>
                      <Th align="right">Chưa có dữ liệu</Th>
                      <Th align="right">Hồ sơ mở</Th>
                      <Th>Tâm trạng</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classes.map((c) => (
                      <tr key={c.classId} className="border-b border-[#F1F4F8] last:border-0">
                        <td className="px-3 py-3">
                          <div className="text-[13px] font-extrabold text-ink">{c.classCode}</div>
                          <div className="text-[10.5px] font-semibold text-caption">Khối {c.grade}</div>
                        </td>
                        <td className="px-3 py-3 text-right text-[13px] font-black tabular-nums text-ink">
                          {c.rosterCount}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {c.cohortTooSmall ? (
                            <Num value={null} />
                          ) : (
                            <span className="text-[13px] font-black tabular-nums text-ink">
                              {c.checkedInCount} <span className="text-[10.5px] font-bold text-caption">
                                ({rateLabel(c.checkedInCount, c.rosterCount)})
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Num value={c.pendingLateCount} tone="warn" />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Num value={c.absentCount} tone="danger" />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Num value={c.noRecordCount} tone="muted" />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Num value={c.openCareCount} />
                        </td>
                        <td className="px-3 py-3">
                          {c.cohortTooSmall ? (
                            <span className="text-[11px] font-semibold text-caption">
                              Lớp dưới {data.minCohort} em — không hiện số
                            </span>
                          ) : (
                            <MoodBar
                              happy={c.moodHappy}
                              normal={c.moodNormal}
                              tired={c.moodTired}
                              sad={c.moodSad}
                              reported={c.moodReported}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="px-1 text-[11px] leading-relaxed text-caption">
              «Chưa có dữ liệu» là số em chưa có dòng điểm danh nào trong ngày — <strong>không</strong> phải số
              em vắng. Hai cột tách riêng có chủ đích.
            </p>
          </section>
        </>
      )}
    </OperationsShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "ink" | "muted" | "warn" | "danger";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd>
        <Num value={value} tone={tone} />
      </dd>
    </div>
  );
}
