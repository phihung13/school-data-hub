// Buồng lái người lớn — SỐ LIỆU MẪU (26/08/2026).
//
// Chủ đầu tư: "mọi trang người lớn vào, đều có 1 dashboard như vậy, nền trắng, trong đó
// có miniapp… đưa sample data vào chứ chưa cần dữ liệu thật, để demo cho mọi người biết
// đây là dashboard, và mọi người cần đi đúng hướng."
//
// Bản vẽ gốc: artifact "Major Operating System" — lưu tại
// public/trinh-dien/buong-lai-nguoi-lon.html, kèm 6 luật "GHI CHÚ THIẾT KẾ CHO ĐỘI DEV"
// ở cuối trang. Ba luật sống trong file này:
//   · Dashboard chiếm vị trí số một — 8 KPI ngay dưới thanh chào, chạy hết chiều ngang;
//   · Mũi tên TÁCH khỏi màu: VÀNG = tốt, HỒNG = cần chú ý (Cash out tăng: mũi tên lên
//     nhưng màu hồng);
//   · Góc sắc, ngoặc góc — đã nằm trong lớp bl-*/hv-* của globals.css.
//
// LUẬT SỐ MẪU: đây là số BỊA để demo tầm nhìn — chưa có nguồn thật (hệ phòng ban chưa dựng).
// 27/08/2026 (chủ đầu tư, cho DEMO): bỏ chip "MẪU" từng thẻ cho gọn, và cho số + dòng dữ
// liệu CHẠY SỐNG (giả lập client, không backend). ĐỂ KHÔNG NÓI DỐI MÀN HÌNH: giữ pill
// "LIVE · DEMO" ở đầu dashboard — cả buồng lái vẫn tự khai là dữ liệu demo. Ngày nối nguồn
// thật: thay số giả lập bằng tRPC/realtime thật rồi mới gỡ pill.
"use client";

import { useEffect, useRef, useState } from "react";
import { MiniAppTile } from "./mini-app-tile";
import type { MiniAppTile as MiniAppTileType } from "@hub/core/contracts";

/**
 * Con số KPI SỐNG — mỗi lần `value` đổi thì tween mượt từ giá trị đang hiện sang mới
 * (lúc mount: 0 → gốc = đếm nhảy; lúc chạy realtime: cũ → mới). Tôn trọng
 * prefers-reduced-motion (hiện thẳng, không chạy rAF).
 */
function SoSong({ value }: { value: number }) {
  const [hien, setHien] = useState(0);
  const curRef = useRef(0);
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const lanDau = useRef(true);
  useEffect(() => {
    const giam = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // NHÁY SÁNG khi số ĐỔI (bỏ qua lần mount đầu) — dấu hiệu "dữ liệu vừa cập nhật".
    if (!lanDau.current && !giam && spanRef.current) {
      spanRef.current.animate(
        [{ filter: "brightness(1.7) drop-shadow(0 0 7px rgba(245,163,0,.85))" }, { filter: "none" }],
        { duration: 650, easing: "ease-out" },
      );
    }
    lanDau.current = false;
    if (giam) {
      curRef.current = value;
      setHien(value);
      return;
    }
    const tu = curRef.current;
    const t0 = performance.now();
    let raf = 0;
    const buoc = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(tu + (value - tu) * e);
      curRef.current = v;
      setHien(v);
      if (p < 1) raf = requestAnimationFrame(buoc);
    };
    raf = requestAnimationFrame(buoc);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span ref={spanRef}>{hien.toLocaleString("vi-VN")}</span>;
}

// ── KPI — số chép từ chính bản vẽ để khớp câu chuyện demo ──────────────────
const KPI: {
  ten: string;
  so: string;
  donVi?: string;
  phu: string;
  delta: string;
  khiHau: "tot" | "chu-y";
  /** Khối màu đậm (editorial) — bỏ trống = thẻ trắng. */
  khoi?: "navy" | "gold";
}[] = [
  { ten: "SỸ SỐ", so: "1.645", donVi: "học sinh", phu: "94% công suất · mục tiêu 1.750", delta: "▲ 12", khiHau: "tot" },
  { ten: "REFERRAL", so: "7", donVi: "/ 412", phu: "hôm nay · luỹ kế năm", delta: "▲ 18%", khiHau: "tot" },
  { ten: "CASH IN", so: "486", donVi: "tr / 92,4 tỷ", phu: "hôm nay · luỹ kế năm", delta: "▲ 9%", khiHau: "tot", khoi: "navy" },
  // Luật bản vẽ: Cash out TĂNG → mũi tên lên nhưng màu HỒNG — chiều tăng ≠ tin tốt.
  { ten: "CASH OUT", so: "312", donVi: "tr / 71,8 tỷ", phu: "hôm nay · luỹ kế năm", delta: "▲ 8%", khiHau: "chu-y" },
  { ten: "QLEAD", so: "34", donVi: "/ 6.180", phu: "hôm nay · luỹ kế năm", delta: "▼ 12%", khiHau: "chu-y" },
  { ten: "CỘNG ĐỒNG", so: "128.400", donVi: "subs", phu: "71% mục tiêu năm đích 180.000", delta: "▲ 1.240", khiHau: "tot", khoi: "gold" },
  { ten: "IMPROVEMENT", so: "18", donVi: "đề xuất", phu: "đang chờ duyệt · Leo xếp theo tác động", delta: "▲ 6", khiHau: "tot" },
];

const CAM_XUC = [
  { ten: "Tuyệt vời", so: 145, mau: "#F5A300" },
  { ten: "Vui", so: 249, mau: "#FFD98A" },
  { ten: "Bình thường", so: 35, mau: "#B7D2F0" },
  { ten: "Mệt", so: 67, mau: "#8FA9CC" },
  { ten: "Căng thẳng", so: 4, mau: "#F0919B" },
];

const LICH = [
  { luc: "07:15", ten: "Sinh hoạt đầu tuần", noi: "Sân trường VAGV", nhan: "SẮP TỚI" },
  { luc: "08:30", ten: "Giao ban Ban điều hành", noi: "Phòng Hội đồng · 9 người" },
  { luc: "10:00", ten: "Duyệt ngân sách Q4", noi: "Cùng phòng Tài chính" },
  { luc: "13:30", ten: "Làm việc với KCN Thái Sơn", noi: "Đối tác · ngoài trường" },
  { luc: "16:00", ten: "Duyệt 18 đề xuất cải tiến", noi: "Leo đã xếp theo tác động", nhan: "LEO" },
];

const XEP_HANG = [
  { ten: "VAGV", diem: "2.480", doi: "▲2", tot: true },
  { ten: "VABT", diem: "2.315", doi: "▲1", tot: true },
  { ten: "MGIS Mekong Xanh", diem: "2.190", doi: "▼1", tot: false },
  { ten: "Khối Văn phòng", diem: "1.964", doi: "—", tot: true },
  { ten: "Online Learning", diem: "1.802", doi: "▲3", tot: true },
];

const FEED = [
  { luc: "08:23:25", loai: "quiz.submitted", noi: "thu.le · online_learning" },
  { luc: "08:23:24", loai: "conversation.started", noi: "soạn đề KT · assistant" },
  { luc: "08:23:22", loai: "goal.updated", noi: "tổ Tiếng Anh · wigs" },
  { luc: "08:23:20", loai: "mood.checked_in", noi: "41 học sinh · os_shell" },
  { luc: "08:23:18", loai: "content.viewed", noi: "Unit 3 · lesson_builder" },
  { luc: "08:23:16", loai: "attendance.recorded", noi: "8A1 · viet-anh-class" },
  { luc: "08:23:12", loai: "lesson_plan.published", noi: "lop.tran · lesson_builder" },
];

// ── DỮ LIỆU CHẠY SỐNG (demo, giả lập client) ──────────────────────────────
/** Giá trị GỐC (số nguyên) của 7 KPI để chạy sống. */
const KPI_GOC = KPI.map((k) => parseInt(k.so.replace(/\./g, ""), 10));
/** Biên độ nhích mỗi nhịp (~2,2s) — bịa cho hợp lý, đa số đi lên. Khớp thứ tự KPI. */
const KPI_NHICH: (() => number)[] = [
  () => (Math.random() < 0.25 ? 1 : 0), // SỸ SỐ
  () => (Math.random() < 0.15 ? 1 : 0), // REFERRAL
  () => Math.floor(Math.random() * 4), // CASH IN
  () => Math.floor(Math.random() * 3), // CASH OUT
  () => Math.floor(Math.random() * 3) - 1, // QLEAD (±)
  () => 8 + Math.floor(Math.random() * 55), // CỘNG ĐỒNG
  () => (Math.random() < 0.2 ? 1 : 0), // IMPROVEMENT
];
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
/** Sự kiện cho "Dòng dữ liệu" chảy realtime. */
const FEED_POOL: (() => { loai: string; noi: string })[] = [
  () => ({ loai: "quiz.submitted", noi: `hs.${rnd(1000, 9999)} · online_learning` }),
  () => ({ loai: "mood.checked_in", noi: `${rnd(3, 60)} học sinh · os_shell` }),
  () => ({ loai: "attendance.recorded", noi: `${rnd(6, 12)}A${rnd(1, 4)} · viet-anh-class` }),
  () => ({ loai: "conversation.started", noi: "soạn đề KT · assistant" }),
  () => ({ loai: "goal.updated", noi: "tổ Tiếng Anh · wigs" }),
  () => ({ loai: "content.viewed", noi: `Unit ${rnd(1, 9)} · lesson_builder` }),
  () => ({ loai: "lesson_plan.published", noi: "lop.tran · lesson_builder" }),
  () => ({ loai: "payment.received", noi: "học phí T9 · finance" }),
  () => ({ loai: "lead.captured", noi: "landing · marketing" }),
  () => ({ loai: "referral.created", noi: "phụ huynh giới thiệu · crm" }),
  () => ({ loai: "improvement.proposed", noi: "Leo xếp hạng · wigs" }),
];

// Xu hướng 14 ngày (Cash in vs Qlead) — hai polyline tĩnh, số bịa theo dáng của bản vẽ.
const XU_HUONG_A = [22, 30, 26, 34, 40, 36, 44, 41, 50, 47, 55, 52, 60, 64];
const XU_HUONG_B = [48, 44, 46, 40, 42, 37, 39, 34, 36, 31, 33, 29, 27, 24];

function duongSpark(day: number[], w: number, h: number): string {
  const max = Math.max(...day), min = Math.min(...day);
  return day
    .map((v, i) => `${((i / (day.length - 1)) * w).toFixed(1)},${(h - ((v - min) / (max - min)) * (h - 6) - 3).toFixed(1)}`)
    .join(" ");
}

// Ứng dụng theo lộ trình 3 app + hệ sinh thái trong bản vẽ. `sapCo: true` = ô mờ kiểu
// "chưa mở" của MiniAppTile — KHÔNG bấm được, đúng luật "không vẽ chỗ bấm không dẫn
// tới đâu" (tile thật của tài khoản do sổ đăng ký quyết, render riêng ở dưới).
const APP_MAU = [
  { ten: "Wigs", mo: "Mục tiêu & WIG toàn hệ thống" },
  { ten: "Assistant", mo: "Trợ lý AI cho công việc hằng ngày" },
  { ten: "Chi", mo: "Đề xuất và duyệt chi nội bộ" },
  { ten: "Leadership Notebook", mo: "Sổ tay lãnh đạo bản thân" },
  { ten: "Lesson Builder", mo: "Soạn bài, slide, quiz bằng AI" },
  { ten: "Test Builder", mo: "Ngân hàng câu hỏi, tạo đề" },
  { ten: "Home Work", mo: "Giao, nộp và chấm bài tập" },
  { ten: "Online Learning", mo: "Khoá học trực tuyến, kỹ năng" },
];

/**
 * Đồng hồ CHẠY SỐNG cho dải hero điều hành — nhịp giây thật, cảm giác "trung tâm vận
 * hành". Chỉ dựng ở client (giờ trình duyệt); SSR trả chuỗi rỗng để không lệch hydrate.
 */
export function DongHo() {
  const [gio, setGio] = useState("");
  useEffect(() => {
    const cap = () =>
      setGio(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    cap();
    const id = window.setInterval(cap, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="bl-hero-gio font-mono tabular-nums" suppressHydrationWarning>
      {gio || "--:--:--"}
    </span>
  );
}

export function BuongLaiMau({ miniApps }: { miniApps: MiniAppTileType[] }) {
  // Dữ liệu CHẠY SỐNG (demo, giả lập client): KPI nhích, dòng dữ liệu chảy, cảm xúc dịch nhẹ.
  const [kpiVals, setKpiVals] = useState<number[]>(KPI_GOC);
  const [feed, setFeed] = useState(() => FEED.map((f, i) => ({ ...f, id: i })));
  const [camXuc, setCamXuc] = useState<number[]>(() => CAM_XUC.map((c) => c.so));
  const feedIdRef = useRef(FEED.length);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setKpiVals((v) => v.map((n, i) => Math.max(0, n + (KPI_NHICH[i]?.() ?? 0))));
      const g = (FEED_POOL[Math.floor(Math.random() * FEED_POOL.length)] ?? (() => ({ loai: "event", noi: "" })))();
      const luc = new Date().toLocaleTimeString("en-GB");
      const fid = feedIdRef.current++;
      setFeed((f) => [{ id: fid, luc, ...g }, ...f].slice(0, 7));
      setCamXuc((c) => c.map((n) => Math.max(0, n + (Math.random() < 0.4 ? Math.floor(Math.random() * 5) - 2 : 0))));
    }, 2200);
    return () => window.clearInterval(id);
  }, []);
  const tongCamXuc = camXuc.reduce((t, n) => t + n, 0) || 1;
  return (
    <>
      {/* ── DASHBOARD CỦA TÔI — vị trí số một, hết chiều ngang (luật 3 của bản vẽ) ── */}
      <section aria-label="Dashboard của tôi (demo — dữ liệu chạy sống)" className="relative">
        {/* Tiêu đề + đồng hồ + LIVE·DEMO ĐÃ GỘP LÊN THANH CHÀO (hv-head, 27/08/2026 — chủ
            đầu tư: "2 thẻ này gộp về 1"). Không còn dải hero riêng ở đây để khỏi thành hai
            băng navy chồng nhau; buồng lái vào thẳng lưới KPI. */}
        <div className="bl-kpi-luoi">
          {/* Cảm xúc hôm nay — ô đặc biệt có thanh phân bố 5 trạng thái */}
          <div className="bl-kpi" style={{ gridColumn: "span 2" }}>
            <div className="bl-kpi-ten">CẢM XÚC HÔM NAY</div>
            <div className="mt-[7px]">
              <span className="bl-delta tot">▲ 4,2% tích cực</span>
            </div>
            <div className="mt-3 bl-cx" aria-hidden>
              {CAM_XUC.map((c, i) => (
                <i key={c.ten} style={{ width: `${((camXuc[i] ?? 0) / tongCamXuc) * 100}%`, background: c.mau, transition: "width .7s ease" }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {CAM_XUC.map((c, i) => (
                <span key={c.ten} className="bl-phu">
                  <b className="font-mono text-[12px] text-[#0A2A5E]">{camXuc[i] ?? 0}</b> {c.ten}
                </span>
              ))}
            </div>
          </div>
          {KPI.map((k, i) => (
            <div key={k.ten} className={`bl-kpi${k.khoi ? ` bl-kpi--${k.khoi}` : ""}`}>
              <div className="bl-kpi-ten">{k.ten}</div>
              <div className="bl-so">
                <SoSong value={kpiVals[i] ?? 0} />
                {k.donVi && <small>{k.donVi}</small>}
              </div>
              <div className="bl-kpi-chan">
                <span className={`bl-delta ${k.khiHau}`}>{k.delta}</span>
                <span className="bl-phu">{k.phu}</span>
              </div>
            </div>
          ))}
          {/* Xu hướng 14 ngày */}
          <div className="bl-kpi" style={{ gridColumn: "span 3" }}>
            <div className="bl-kpi-ten">XU HƯỚNG 14 NGÀY · CASH IN SO VỚI QLEAD</div>
            <svg className="bl-spark" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="bl-cash-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F5A300" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#F5A300" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Vùng đổ bóng dưới đường Cash in — hiện dần sau khi đường vẽ xong. */}
              <polygon className="bl-spark-fill" points={`0,64 ${duongSpark(XU_HUONG_A, 300, 64)} 300,64`} fill="url(#bl-cash-fill)" />
              {/* Qlead (nét đứt) vẽ trước, mờ hơn. */}
              <polyline className="bl-spark-b" points={duongSpark(XU_HUONG_B, 300, 64)} pathLength={1} fill="none" stroke="#8FA9CC" strokeWidth="2" strokeDasharray="4 3" />
              {/* Cash in (vàng) — tự vẽ từ trái sang phải. */}
              <polyline className="bl-spark-a" points={duongSpark(XU_HUONG_A, 300, 64)} pathLength={1} fill="none" stroke="#F5A300" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="bl-phu">
              <span className="font-black text-[#8A5A00]">— Cash in</span>
              <span className="ml-4 font-black text-[#5B6B80]">- - Qlead</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Hàng dưới: Hôm nay · Xếp hạng · Dòng dữ liệu ── */}
      <div className="bl-duoi mt-4 grid grid-cols-1 items-start gap-3 xl:grid-cols-[5fr_4fr_6fr]">
        <div className="hv-card the-dong-bo relative">
          <div className="hv-ct pr-[46px]">
            <h2 className="hv-tt">Hôm nay</h2>
            <span className="hv-kick">5 MỤC</span>
          </div>
          <ol className="mt-2">
            {LICH.map((m) => (
              <li key={m.luc} className="flex min-h-[46px] items-baseline gap-3 border-b border-[#EEF3FA] py-2">
                <span className="font-mono text-[11.5px] font-800 font-bold text-[#7A93B8]">{m.luc}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-extrabold text-[#1D3B6E]">{m.ten}</span>
                  <span className="block text-[11px] font-bold text-[#5B6B80]">{m.noi}</span>
                </span>
                {m.nhan && (
                  <span className="bl-delta tot" aria-hidden>
                    {m.nhan}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="hv-card the-dong-bo relative">
          <div className="hv-ct pr-[46px]">
            <h2 className="hv-tt">Xếp hạng</h2>
            <span className="hv-kick">ỨNG DỤNG AI · THEO CƠ SỞ</span>
          </div>
          <ol className="mt-1">
            {XEP_HANG.map((h, i) => (
              <li key={h.ten} className="bl-hang">
                <span className="stt">{String(i + 1).padStart(2, "0")}</span>
                <span className="ten">{h.ten}</span>
                <span className="diem">{h.diem}</span>
                <span className={`bl-delta ${h.tot ? "tot" : "chu-y"}`}>{h.doi}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="hv-card the-dong-bo relative">
          <div className="hv-ct pr-[46px]">
            <h2 className="hv-tt">Dòng dữ liệu</h2>
            <span className="hv-kick">47 EVENTS/GIÂY</span>
          </div>
          <ul className="bl-feed">
            {feed.map((f) => (
              <li key={f.id}>
                <span className="luc">{f.luc}</span>
                <span className="loai">{f.loai}</span>
                <span className="noi">{f.noi}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Ứng dụng: tile THẬT của tài khoản trước, hệ sinh thái mẫu sau ── */}
      <div className="hv-card the-dong-bo bl-vao-cuoi relative mt-4">
        <div className="hv-ct">
          <h2 className="hv-tt">Tất cả ứng dụng</h2>
          <span className="hv-kick">
            {miniApps.length} ĐANG MỞ · {APP_MAU.length} THEO LỘ TRÌNH
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-7 gap-y-4">
          {miniApps.map((tile) => (
            <MiniAppTile key={tile.key} tile={tile} />
          ))}
          {/* Hệ sinh thái theo lộ trình — Ô MỜ kiểu "chưa mở": thấy được tương lai,
              không bấm được vào chỗ chưa tồn tại (cùng khuôn MiniAppTile chưa mở). */}
          {APP_MAU.map((a) => (
            <div key={a.ten} className="flex w-[96px] flex-col items-center gap-1.5 text-center">
              <span
                aria-hidden
                className="flex h-[50px] w-[50px] items-center justify-center rounded-2xl bg-surface-muted opacity-60"
              >
                <span className="msr text-[22px] text-caption">space_dashboard</span>
              </span>
              <span className="text-[10px] font-bold leading-tight text-[#33507C]">
                {a.ten}
                <span className="sr-only"> — theo lộ trình, chưa mở</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <ChatbotAgent />
    </>
  );
}

/**
 * Trợ lý "Leo" — chatbot gọi LLM THẬT qua `/api/leo/chat` (đi qua §7: pii-stripper +
 * tram.ts → OpenRouter). Chưa cấu hình key → gợi ý vào Cài đặt. UI khớp app: navy/gold,
 * góc cắt. Key KHÔNG bao giờ về client (§4) — chỉ gửi câu hỏi, nhận câu trả lời.
 */
function ChatbotAgent() {
  const [mo, setMo] = useState(false);
  const [msgs, setMsgs] = useState<{ ai: boolean; text: string }[]>([
    { ai: true, text: "Chào anh/chị 👋 Em là Leo — trợ lý Major OS. Hỏi em về sỹ số, dòng tiền, cộng đồng hay đề xuất cải tiến nhé." },
  ]);
  const [nhap, setNhap] = useState("");
  const [dangGo, setDangGo] = useState(false);
  const [caiDat, setCaiDat] = useState(false);
  const [khoaMoi, setKhoaMoi] = useState("");
  const [modelMoi, setModelMoi] = useState("");
  const [tt, setTt] = useState<{ daCoKhoa: boolean; model: string; khoaBangEnv: boolean } | null>(null);
  const [luu, setLuu] = useState<"" | "dang" | "xong" | "loi">("");
  const cuonRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    cuonRef.current?.scrollTo({ top: 9e6, behavior: "smooth" });
  }, [msgs, dangGo]);
  useEffect(() => {
    if (!caiDat) return;
    void fetch("/api/quan-tri/ai")
      .then((r) => r.json())
      .then((d) => {
        setTt(d);
        if (d?.model) setModelMoi(d.model);
      })
      .catch(() => {});
  }, [caiDat]);

  const luuKhoa = async () => {
    if (khoaMoi.trim().length < 12) return;
    setLuu("dang");
    try {
      const r = await fetch("/api/quan-tri/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ khoa: khoaMoi.trim(), model: modelMoi.trim() }),
      });
      const d = (await r.json().catch(() => ({}))) as { model?: string };
      if (r.ok) {
        setLuu("xong");
        setKhoaMoi("");
        setTt({ daCoKhoa: true, model: d.model ?? modelMoi, khoaBangEnv: false });
      } else {
        setLuu("loi");
      }
    } catch {
      setLuu("loi");
    }
  };

  const gui = async () => {
    const q = nhap.trim();
    if (!q || dangGo) return;
    const lichSu = msgs.slice(-8);
    setMsgs((m) => [...m, { ai: false, text: q }]);
    setNhap("");
    setDangGo(true);
    try {
      const res = await fetch("/api/leo/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q, history: lichSu }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; chuaCauHinh?: boolean };
      if (res.status === 503 || data.chuaCauHinh) {
        setMsgs((m) => [...m, { ai: true, text: "Chưa cấu hình AI. Vào Cài đặt → AI để nhập OpenRouter API key rồi hỏi lại nhé." }]);
      } else if (!res.ok || !data.reply) {
        setMsgs((m) => [...m, { ai: true, text: "Xin lỗi, em chưa trả lời được lúc này. Thử lại sau ít phút." }]);
      } else {
        setMsgs((m) => [...m, { ai: true, text: data.reply ?? "" }]);
      }
    } catch {
      setMsgs((m) => [...m, { ai: true, text: "Mất kết nối. Thử lại nhé." }]);
    } finally {
      setDangGo(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-8 z-[70] flex flex-col items-end">
      {mo && (
        <div className="mb-3 flex h-[460px] w-[350px] max-w-[calc(100vw-40px)] flex-col overflow-hidden border border-[#1E4C8A] bg-[#081A3A] shadow-[0_24px_60px_-12px_rgba(2,8,22,.7)] [clip-path:polygon(0_0,calc(100%-16px)_0,100%_16px,100%_100%,16px_100%,0_calc(100%-16px))]">
          <div className="flex items-center gap-2.5 border-b border-[rgba(53,224,255,.2)] bg-[linear-gradient(90deg,#0E3C8C,#0A2A5E)] px-4 py-3">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gold text-navy">
              <span className="msr text-[18px]">auto_awesome</span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-black text-white">Leo · Trợ lý Major OS</div>
              <div className="flex items-center gap-1 text-[9px] font-bold tracking-wide text-[#7FB0F0]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#37E0A0]" /> TRỰC TUYẾN
              </div>
            </div>
            <button type="button" onClick={() => setCaiDat((v) => !v)} aria-label="Cài đặt AI" className={`flex-none ${caiDat ? "text-gold" : "text-white/70 hover:text-white"}`}>
              <span className="msr text-[18px]">settings</span>
            </button>
            <button type="button" onClick={() => setMo(false)} aria-label="Đóng" className="flex-none text-white/70 hover:text-white">
              <span className="msr text-[20px]">close</span>
            </button>
          </div>
          {caiDat ? (
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[#D8E4F6]">
              <div className="text-[13px] font-black text-white">Cài đặt AI · OpenRouter</div>
              {tt?.khoaBangEnv ? (
                <div className="bg-[#12294F] p-3 text-[12px] leading-relaxed text-[#A9C4EC]">
                  Khoá đang đặt bằng biến môi trường của trường (AI_API_KEY). Sửa ở <code>apps/hub/.env.local</code>, không đổi ở đây.
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#7FB0F0]">OpenRouter API key</label>
                    <input
                      type="password"
                      value={khoaMoi}
                      onChange={(e) => setKhoaMoi(e.target.value)}
                      placeholder="sk-or-v1-…"
                      autoComplete="off"
                      className="w-full bg-[#0B1B38] px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-[#6C86B0]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#7FB0F0]">Model</label>
                    <input
                      value={modelMoi}
                      onChange={(e) => setModelMoi(e.target.value)}
                      placeholder="openai/gpt-4o-mini"
                      className="w-full bg-[#0B1B38] px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-[#6C86B0]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void luuKhoa()}
                    disabled={luu === "dang" || khoaMoi.trim().length < 12}
                    className="w-full bg-gold py-2 text-[12.5px] font-black text-navy disabled:opacity-50"
                  >
                    {luu === "dang" ? "Đang lưu…" : "Lưu khoá"}
                  </button>
                  {luu === "xong" && <div className="text-[11.5px] font-bold text-[#37E0A0]">Đã lưu ✓ Bấm ← rồi hỏi Leo thử.</div>}
                  {luu === "loi" && <div className="text-[11.5px] font-bold text-[#FF8A8F]">Lưu lỗi — kiểm tra lại key.</div>}
                </>
              )}
              <div className="text-[11px] font-bold text-[#8FA9CC]">
                Trạng thái: {tt ? (tt.daCoKhoa ? `đã cấu hình · ${tt.model}` : "chưa có khoá") : "đang kiểm tra…"}
              </div>
              <div className="text-[10.5px] leading-relaxed text-[#6C86B0]">
                Khoá chỉ lưu ở máy chủ, không hiện lại trên màn (§4). Mọi câu hỏi đi qua bộ lọc PII và trạm AI (§7) trước khi tới OpenRouter.
              </div>
              <button type="button" onClick={() => setCaiDat(false)} className="text-[12px] font-bold text-[#7FB0F0] hover:text-white">
                ← Về chat
              </button>
            </div>
          ) : (
            <>
              <div ref={cuonRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3.5">
                {msgs.map((m, i) => (
                  <div key={i} className={`flex ${m.ai ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[82%] whitespace-pre-wrap px-3 py-2 text-[12.5px] leading-relaxed [clip-path:polygon(0_0,calc(100%-9px)_0,100%_9px,100%_100%,9px_100%,0_calc(100%-9px))] ${m.ai ? "bg-[#12294F] text-[#E6EEFB]" : "bg-gold font-bold text-navy"}`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {dangGo && (
                  <div className="flex justify-start">
                    <div className="flex gap-1 bg-[#12294F] px-3 py-2.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#7FB0F0]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#7FB0F0] [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#7FB0F0] [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-[rgba(53,224,255,.18)] bg-[#0A2148] p-2.5">
                <input
                  value={nhap}
                  onChange={(e) => setNhap(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void gui();
                  }}
                  placeholder="Hỏi Leo…"
                  className="min-w-0 flex-1 bg-[#0B1B38] px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-[#6C86B0]"
                />
                <button type="button" onClick={() => void gui()} aria-label="Gửi" className="flex h-9 w-9 flex-none items-center justify-center bg-gold text-navy">
                  <span className="msr text-[18px]">send</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setMo((v) => !v)}
        aria-label="Trợ lý Leo"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-navy shadow-[0_10px_30px_-6px_rgba(245,163,0,.6)] transition hover:scale-105 active:scale-95"
      >
        <span className="msr text-[26px]">{mo ? "close" : "support_agent"}</span>
      </button>
    </div>
  );
}
