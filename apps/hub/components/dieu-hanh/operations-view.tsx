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
 * Ô SỐ BỊ CHE — vì sao nó không được là một dấu gạch trần (sửa 01/08/2026).
 *
 * Bản cũ in `<span title="Nhóm dưới ngưỡng ẩn danh — không hiện số">—</span>`. Thuộc tính
 * `title` chỉ hiện khi RÊ CHUỘT. Trên điện thoại — thiết bị chính theo §1.4 và §3, và là
 * cái hiệu trưởng cầm khi đứng ngoài sân trường — không có sự kiện hover; bàn phím không
 * tới được; trình đọc màn hình đọc "—" là "em dash" rồi thôi. Nghĩa là lời giải thích duy
 * nhất cho ô trống chỉ tồn tại trên máy tính có chuột.
 *
 * Mà đây đúng là chỗ luật gốc của repo dễ vỡ nhất: tầng dữ liệu đã làm ĐÚNG (server trả
 * `null` chứ không trả 0), rồi tầng hiển thị lại gộp ba sự thật khác nhau — "chưa đủ số em
 * để hiện", "chưa có mẫu số để tính", "không đọc được" — vào cùng một ký tự.
 *
 * Nay: icon `visibility_off` NHÌN THẤY ĐƯỢC đứng cạnh dấu gạch (mắt phân biệt được ngay ô
 * bị che cố ý với ô hỏng — ô hỏng thì cả bảng biến mất và ErrorState chiếm chỗ), `sr-only`
 * nói nguyên câu cho tai, và một dòng chú giải nhìn thấy được đặt ngay dưới bảng.
 */
function HiddenNumber() {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-bold text-muted">
      <span className="msr text-[14px]" aria-hidden>
        visibility_off
      </span>
      <span aria-hidden>—</span>
      <span className="sr-only">chưa đủ số em để hiện — nhóm dưới ngưỡng ẩn danh</span>
    </span>
  );
}

/**
 * Ô số có thể bị che. `null` KHÔNG được rơi về 0 ở bất kỳ nhánh nào — đó là toàn bộ
 * lý do component này tồn tại thay vì viết `{n ?? 0}` tại chỗ.
 */
function Num({ value, tone = "ink" }: { value: number | null; tone?: "ink" | "muted" | "warn" | "danger" }) {
  if (value === null) return <HiddenNumber />;
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

/**
 * Tỉ lệ check-in — trả về LÝ DO chứ không trả về chuỗi "—".
 *
 * Hai nhánh không-có-số ở đây là hai sự thật khác nhau mà bản cũ in cùng một ký tự cho cả
 * hai: `checkedIn === null` là "được phép biết nhưng không được phép NÓI" (dưới ngưỡng ẩn
 * danh), còn `roster === 0` là "không có gì để chia" (khối/lớp chưa có em nào trong sổ).
 * Trên thẻ khối chuỗi đó còn đi thẳng vào con số 26px lớn nhất màn hình, nên hiệu trưởng
 * nhìn một thẻ ghi "— đã check-in" và không có đường nào biết đó là ẩn danh, là chưa có
 * sĩ số, hay là hỏng.
 */
export type CheckinRate =
  | { kind: "ok"; text: string }
  | { kind: "suppressed" }
  | { kind: "no-roster" };

export function checkinRate(checkedIn: number | null, roster: number): CheckinRate {
  if (roster === 0) return { kind: "no-roster" };
  if (checkedIn === null) return { kind: "suppressed" };
  return { kind: "ok", text: `${Math.round((checkedIn / roster) * 100)}%` };
}

/** Câu ngắn cho hai nhánh không có số — dùng chung cho thẻ khối và ô bảng. */
export function rateReason(kind: "suppressed" | "no-roster"): string {
  return kind === "suppressed"
    ? "chưa đủ số em để hiện tỉ lệ"
    : "chưa có sĩ số nên chưa tính được tỉ lệ";
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
    // `reported === null` từng in một dấu "—" TRẦN, không title, không nhãn nào — tức là
    // ô tâm trạng của một lớp bị che trông y hệt một ô hỏng. Nay nói thẳng cả hai nhánh.
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted">
        <span className="msr text-[14px]" aria-hidden>
          visibility_off
        </span>
        {reported === null
          ? "Chưa đủ số em để hiện tâm trạng"
          : `${reported} em đã ghi · chưa đủ để hiện phân bố`}
      </span>
    );
  }
  const total = happy + normal + tired + sad;
  if (total === 0) return <span className="text-[11.5px] font-semibold text-muted">Chưa em nào ghi</span>;
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
      className={`px-3 py-2.5 text-[10.5px] font-black uppercase tracking-wide text-muted ${
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
    // min-h-[44px] (§11): ô chọn ngày trên điện thoại đo được ~34px trước 01/08/2026.
    <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
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
                <p className="text-[12.5px] font-semibold text-muted">
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

                    {/* Con số lớn nhất của thẻ không bao giờ được là một gạch ngang câm:
                        khi không tính được, cả ô đổi thành một CÂU nói rõ vì sao. */}
                    {(() => {
                      const rate = checkinRate(g.checkedInCount, g.rosterCount);
                      return rate.kind === "ok" ? (
                        <div className="flex items-end gap-2">
                          <span className="text-[26px] font-black leading-none text-navy tabular-nums">
                            {rate.text}
                          </span>
                          <span className="pb-1 text-[11.5px] font-bold text-muted">đã check-in</span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-1.5 text-[12px] font-bold leading-relaxed text-muted">
                          <span className="msr mt-[1px] flex-none text-[16px]" aria-hidden>
                            visibility_off
                          </span>
                          {rateReason(rate.kind)}
                        </div>
                      );
                    })()}

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
                          <div className="text-[10.5px] font-semibold text-muted">Khối {c.grade}</div>
                        </td>
                        <td className="px-3 py-3 text-right text-[13px] font-black tabular-nums text-ink">
                          {c.rosterCount}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {(() => {
                            if (c.cohortTooSmall) return <Num value={null} />;
                            const rate = checkinRate(c.checkedInCount, c.rosterCount);
                            return (
                              <span className="text-[13px] font-black tabular-nums text-ink">
                                {c.checkedInCount}{" "}
                                <span className="text-[10.5px] font-bold text-muted">
                                  {rate.kind === "ok" ? `(${rate.text})` : `(${rateReason(rate.kind)})`}
                                </span>
                              </span>
                            );
                          })()}
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
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
                              <span className="msr text-[14px]" aria-hidden>
                                visibility_off
                              </span>
                              Lớp dưới {data.minCohort} em — chưa đủ số em để hiện
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
            {/* Chú giải NHÌN THẤY ĐƯỢC cho ký hiệu ô bị che. Trước 01/08/2026 lời giải
                thích này chỉ nằm trong `title=`, tức là chỉ tồn tại trên máy có chuột. */}
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-[11px] leading-relaxed text-muted">
              <span className="msr text-[14px]" aria-hidden>
                visibility_off
              </span>
              <span aria-hidden>—</span>
              <span>
                nghĩa là <strong className="text-ink">chưa đủ số em để hiện</strong>: nhóm dưới{" "}
                {data.minCohort} em thì con số của lớp chính là dữ liệu của một em. Đây KHÔNG phải lỗi tải —
                lỗi tải thì cả bảng biến mất và màn hình nói ra là hỏng.
              </span>
            </p>
            <p className="px-1 text-[11px] leading-relaxed text-muted">
              "Chưa có dữ liệu" là số em chưa có dòng điểm danh nào trong ngày — <strong>không</strong> phải số
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
