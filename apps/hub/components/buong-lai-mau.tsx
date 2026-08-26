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
// LUẬT SỐ MẪU (điều kho không nhân nhượng): đây là số BỊA CÓ CHỦ ĐÍCH để demo tầm nhìn.
// Mọi khối mẫu mang nhãn <NhanMau/>; pill đầu trang ghi "SỐ LIỆU MẪU · DEMO". Khối nào
// có nguồn thật (chuông việc chờ, lớp chủ nhiệm GVCN — render ở home-view) thì là số
// thật và KHÔNG mang nhãn. Ngày nối nguồn thật cho khối nào: gỡ nhãn khối đó, không sớm
// hơn một ngày.
"use client";

import { MiniAppTile } from "./mini-app-tile";
import type { MiniAppTile as MiniAppTileType } from "@hub/core/contracts";

function NhanMau() {
  return (
    <span className="bl-mau" title="Số liệu mẫu để demo — chưa nối nguồn thật">
      MẪU
    </span>
  );
}

// ── KPI — số chép từ chính bản vẽ để khớp câu chuyện demo ──────────────────
const KPI: {
  ten: string;
  so: string;
  donVi?: string;
  phu: string;
  delta: string;
  khiHau: "tot" | "chu-y";
}[] = [
  { ten: "SỸ SỐ", so: "1.645", donVi: "học sinh", phu: "94% công suất · mục tiêu 1.750", delta: "▲ 12", khiHau: "tot" },
  { ten: "REFERRAL", so: "7", donVi: "/ 412", phu: "hôm nay · luỹ kế năm", delta: "▲ 18%", khiHau: "tot" },
  { ten: "CASH IN", so: "486", donVi: "tr / 92,4 tỷ", phu: "hôm nay · luỹ kế năm", delta: "▲ 9%", khiHau: "tot" },
  // Luật bản vẽ: Cash out TĂNG → mũi tên lên nhưng màu HỒNG — chiều tăng ≠ tin tốt.
  { ten: "CASH OUT", so: "312", donVi: "tr / 71,8 tỷ", phu: "hôm nay · luỹ kế năm", delta: "▲ 8%", khiHau: "chu-y" },
  { ten: "QLEAD", so: "34", donVi: "/ 6.180", phu: "hôm nay · luỹ kế năm", delta: "▼ 12%", khiHau: "chu-y" },
  { ten: "CỘNG ĐỒNG", so: "128.400", donVi: "subs", phu: "71% mục tiêu năm đích 180.000", delta: "▲ 1.240", khiHau: "tot" },
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

export function BuongLaiMau({ miniApps }: { miniApps: MiniAppTileType[] }) {
  const tongCamXuc = CAM_XUC.reduce((t, c) => t + c.so, 0);
  return (
    <>
      {/* ── DASHBOARD CỦA TÔI — vị trí số một, hết chiều ngang (luật 3 của bản vẽ) ── */}
      <section aria-label="Dashboard của tôi (số liệu mẫu)" className="relative">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[15.5px] font-black text-cardtitle">DASHBOARD CỦA TÔI</h2>
          <span className="bl-kpi-ten">SỐ LIỆU MẪU · DEMO — chưa nối nguồn thật</span>
        </div>
        <div className="bl-kpi-luoi">
          {/* Cảm xúc hôm nay — ô đặc biệt có thanh phân bố 5 trạng thái */}
          <div className="bl-kpi" style={{ gridColumn: "span 2" }}>
            <NhanMau />
            <div className="bl-kpi-ten">
              CẢM XÚC HÔM NAY
              <span className="bl-delta tot">▲ 4,2% tích cực</span>
            </div>
            <div className="bl-cx" aria-hidden>
              {CAM_XUC.map((c) => (
                <i key={c.ten} style={{ width: `${(c.so / tongCamXuc) * 100}%`, background: c.mau }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {CAM_XUC.map((c) => (
                <span key={c.ten} className="bl-phu">
                  <b className="font-mono text-[12px] text-[#0A2A5E]">{c.so}</b> {c.ten}
                </span>
              ))}
            </div>
          </div>
          {KPI.map((k) => (
            <div key={k.ten} className="bl-kpi">
              <NhanMau />
              <div className="bl-kpi-ten">
                {k.ten}
                <span className={`bl-delta ${k.khiHau}`}>{k.delta}</span>
              </div>
              <div className="bl-so">
                {k.so}
                {k.donVi && <small>{k.donVi}</small>}
              </div>
              <div className="bl-phu">{k.phu}</div>
            </div>
          ))}
          {/* Xu hướng 14 ngày */}
          <div className="bl-kpi" style={{ gridColumn: "span 3" }}>
            <NhanMau />
            <div className="bl-kpi-ten">XU HƯỚNG 14 NGÀY · CASH IN SO VỚI QLEAD</div>
            <svg className="bl-spark" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden>
              <polyline points={duongSpark(XU_HUONG_A, 300, 64)} fill="none" stroke="#F5A300" strokeWidth="2.5" />
              <polyline points={duongSpark(XU_HUONG_B, 300, 64)} fill="none" stroke="#8FA9CC" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            <div className="bl-phu">
              <span className="font-black text-[#8A5A00]">— Cash in</span>
              <span className="ml-4 font-black text-[#5B6B80]">- - Qlead</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Hàng dưới: Hôm nay · Xếp hạng · Dòng dữ liệu ── */}
      <div className="mt-4 grid grid-cols-1 items-start gap-3 xl:grid-cols-[5fr_4fr_6fr]">
        <div className="hv-card relative">
          <NhanMau />
          <div className="hv-ct">
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

        <div className="hv-card relative">
          <NhanMau />
          <div className="hv-ct">
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

        <div className="hv-card relative">
          <NhanMau />
          <div className="hv-ct">
            <h2 className="hv-tt">Dòng dữ liệu</h2>
            <span className="hv-kick">47 EVENTS/GIÂY</span>
          </div>
          <ul className="bl-feed">
            {FEED.map((f) => (
              <li key={f.luc}>
                <span className="luc">{f.luc}</span>
                <span className="loai">{f.loai}</span>
                <span className="noi">{f.noi}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Ứng dụng: tile THẬT của tài khoản trước, hệ sinh thái mẫu sau ── */}
      <div className="hv-card relative mt-4">
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
                className="flex h-[50px] w-[50px] items-center justify-center bg-surface-muted opacity-60 [clip-path:polygon(9px_0,100%_0,100%_calc(100%-9px),calc(100%-9px)_100%,0_100%,0_9px)]"
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
    </>
  );
}
