"use client";
// apps/hub/components/embed/embed-intro.tsx — màn chờ khi mở một mini app.
//
// VÌ SAO CÓ FILE NÀY. Chủ đầu tư 02/08/2026: "việc lên mini app rất bị chậm, chờ như
// 30 giây mới lên, trong khi mục tiêu mở mini app nên là 3 giây, và trong lúc chờ thì
// có intro của app ấy, đừng để màn hình trống load mãi."
//
// Phần "30 giây" đã chữa ở chỗ khác (bật bản chạy thật — nhẹ hơn 18,5 lần khi truyền).
// File này chữa phần còn lại, và phần đó KHÔNG phải chuyện tốc độ mà là chuyện nói
// thật: trước đây khung nhúng chỉ có một iframe trắng. Người dùng không biết máy có
// nhận cú bấm không, không biết đang chờ ai, không biết chờ tới bao giờ. Một màn trắng
// im lặng là câu trả lời tệ nhất — nó để người ta tự đoán, và người ta luôn đoán là hỏng.
//
// BA MỐC THỜI GIAN, và mỗi mốc nói một câu KHÁC nhau:
//   0–3s   : giới thiệu app (logo, tên, một câu app này làm gì) + thanh chạy.
//            3 giây là mục tiêu chủ đầu tư đặt; dưới mốc đó không cần xin lỗi ai.
//   3–10s  : nói THẲNG là đang chờ ứng dụng bên ngoài. Đây là sự thật quan trọng —
//            chậm ở đoạn này là chậm của app con, không phải của Hub, và người dùng
//            có quyền biết mình đang chờ ai.
//   >10s   : thôi quay. Đưa hai nút thật: thử lại, và quay về Hub.
//
// Vì sao mốc cuối phải có nút: một vòng xoay quay mãi là lời hứa "sắp xong" mà không ai
// bảo đảm. Sau 10 giây thì khả năng cao là hỏng, và thứ người dùng cần là một đường ra
// chứ không phải một hoạt ảnh đẹp hơn.
import { useEffect, useState } from "react";

/** Mốc "đủ nhanh" chủ đầu tư đặt. Dưới mốc này màn chờ không nhắc gì tới app ngoài. */
const MOC_BINH_THUONG_MS = 3000;
/** Quá mốc này thì thôi hứa hẹn, đưa đường ra. */
const MOC_QUA_LAU_MS = 10000;

export type EmbedIntroPha = "gioi-thieu" | "cho-app-ngoai" | "qua-lau";

/**
 * Pha nào theo số mili-giây đã trôi. Hàm THUẦN để test được mà không cần đồng hồ thật
 * (tests/unit/embed-intro.test.ts) — thời gian là thứ khó test nhất nếu để lẫn trong
 * component, và một màn chờ sai pha thì không ai phát hiện bằng mắt.
 */
export function phaTheoThoiGian(daTroiMs: number): EmbedIntroPha {
  if (daTroiMs >= MOC_QUA_LAU_MS) return "qua-lau";
  if (daTroiMs >= MOC_BINH_THUONG_MS) return "cho-app-ngoai";
  return "gioi-thieu";
}

/** Câu hiện dưới tên app, theo pha. Tách khỏi JSX để test được từng câu. */
export function cauTheoPha(pha: EmbedIntroPha, tenApp: string, intro?: string): string {
  if (pha === "gioi-thieu") return intro ?? "Đang mở ứng dụng…";
  if (pha === "cho-app-ngoai") return `Đang chờ ${tenApp} phản hồi. Ứng dụng này chạy ngoài Hub.`;
  return `${tenApp} chưa phản hồi sau 10 giây. Hub vẫn bình thường — vấn đề nằm ở phía ứng dụng.`;
}

export function EmbedIntro({
  tenApp,
  intro,
  iconImageUrl,
  onThuLai,
}: {
  tenApp: string;
  intro?: string;
  iconImageUrl?: string;
  onThuLai: () => void;
}) {
  const [daTroi, setDaTroi] = useState(0);

  useEffect(() => {
    // Đếm bằng mốc thật (Date.now) chứ không cộng dồn theo số lần chạy interval: tab bị
    // ẩn thì trình duyệt bóp nhịp interval xuống, cộng dồn sẽ ra một con số nhỏ hơn thời
    // gian thật và màn chờ kẹt vĩnh viễn ở pha đầu.
    const batDau = Date.now();
    const id = window.setInterval(() => setDaTroi(Date.now() - batDau), 250);
    return () => window.clearInterval(id);
  }, []);

  const pha = phaTheoThoiGian(daTroi);
  const cau = cauTheoPha(pha, tenApp, intro);

  return (
    // aria-live="polite" chứ không phải "assertive": câu ở đây đổi theo pha, và người
    // dùng trình đọc màn hình cần nghe nó, nhưng không đến mức cắt ngang thứ họ đang nghe.
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-4 bg-card px-8 text-center"
    >
      {iconImageUrl ? (
        // Ảnh tự host trong /public (xem chú thích iconImageUrl ở registry.ts) — không
        // trỏ domain app ngoài, nên logo vẫn hiện kể cả khi chính app đó đang chết.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconImageUrl} alt="" aria-hidden className="h-16 w-16 rounded-[18px]" />
      ) : (
        // "space_dashboard" chứ không phải "apps": font đã cắt gọn theo
        // public/fonts/icon-names.txt, tên ngoài danh sách đó hiện ra một Ô TRỐNG và
        // KHÔNG báo lỗi gì. Bài tests/unit/a11y.test.ts bắt đúng chỗ này ngay lần chạy
        // đầu tiên — cổng canh làm đúng việc của nó.
        <span aria-hidden className="msr text-[48px] text-cardtitle">space_dashboard</span>
      )}

      <div className="text-[19px] font-black text-ink">{tenApp}</div>

      <p className="max-w-[340px] text-[13.5px] leading-relaxed text-muted">{cau}</p>

      {pha === "qua-lau" ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onThuLai}
            className="flex min-h-[44px] items-center gap-2 rounded-[14px] bg-gradient-to-br from-navy to-navy-light px-5 text-[13.5px] font-black text-white"
          >
            <span aria-hidden className="msr text-[19px]">refresh</span>
            Thử lại
          </button>
          <a
            href="/home"
            className="flex min-h-[44px] items-center gap-2 rounded-[14px] border-[1.6px] border-[#D9E1EC] px-5 text-[13.5px] font-black text-cardtitle"
          >
            <span aria-hidden className="msr text-[19px]">home</span>
            Về Hub
          </a>
        </div>
      ) : (
        // Thanh chạy — KHÔNG giả vờ biết còn bao nhiêu phần trăm. Không ai đo được app
        // ngoài còn bao lâu, nên một thanh đầy dần theo phần trăm bịa là nói dối bằng
        // hình. Thanh này chỉ nói "vẫn đang chạy", đúng chừng đó.
        <div className="mt-1 h-[3px] w-[180px] overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full w-1/3 animate-embedSlide rounded-full bg-navy" />
        </div>
      )}

      {pha !== "gioi-thieu" && (
        <div className="text-[11.5px] text-caption">Đã chờ {Math.round(daTroi / 1000)} giây</div>
      )}
    </div>
  );
}
