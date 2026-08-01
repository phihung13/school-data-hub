// Header của mini app (Buồng lái, Check-in…) — capsule ⋯│✕ luôn nổi để thoát về
// Hub. Mini app KHÔNG dùng tab bar Hub (DESIGN-GUIDELINES §6).
import Link from "next/link";

export function MiniAppHeader({
  title,
  subtitle,
  icon,
  iconImageUrl,
  gradient = "from-navy to-navy-light",
}: {
  title: string;
  subtitle?: string;
  icon: string;
  /** Logo thật của app ngoài (Tier 2) — ưu tiên hơn "icon" nếu có. */
  iconImageUrl?: string;
  gradient?: string;
}) {
  return (
    <div className="flex h-[68px] items-center gap-4 border-b border-line bg-white px-5">
      <span
        className={`flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-[12px] ${
          iconImageUrl ? "bg-[#EAEFF6]" : `bg-gradient-to-br ${gradient}`
        }`}
      >
        {iconImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo app ngoài, kích thước cố định nhỏ
          <img src={iconImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true" className="msr text-[19px] text-white">{icon}</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-black leading-tight text-navy">{title}</div>
        {/* 9px → 10px: DESIGN-GUIDELINES §4 đặt sàn 9,5px, mà dòng này không phải trang trí
            — ở /can-gap-thay-co nó là chỗ DUY NHẤT nói em đang gửi cho lớp nào. (01/08/2026) */}
        {subtitle && <div className="truncate text-[10px] font-black uppercase tracking-wide text-caption">{subtitle}</div>}
      </div>
      {/* VÙNG CHẠM — sửa 01/08/2026 (gói "tuong-phan-man-hoc-sinh").
          Đo sống bằng getBoundingClientRect ở viewport 360×780, phiên học sinh: capsule này
          là 51,0 × 28,0px, và trên /checkin ở trạng thái chọn cảm xúc nó là phần tử BẤM ĐƯỢC
          DUY NHẤT của cả trang — mini app không có tab bar Hub (§6), còn PWA đã thêm vào màn
          hình chính thì không có nút Back của trình duyệt. Thiếu 16px chiều cao so với mốc
          44px của §11/WCAG 2.5.5, đúng ở đường ra duy nhất, dành cho ngón cái một em lớp 6
          đang đi giữa sân trường.
          `min-h-[44px] px-1` nới VÙNG CHẠM bằng padding mà không đổi một pixel nào của phần
          nhìn thấy: viền capsule vẫn 28px cao vì border nằm trên lớp trong. */}
      <span className="flex items-center">
        <Link
          href="/home"
          aria-label="Thoát về Hub"
          className="flex min-h-[44px] items-center px-1"
        >
          <span className="flex items-center rounded-full border border-line p-1">
            <span aria-hidden="true" className="msr px-2.5 text-[18px] text-muted">more_horiz</span>
            <span aria-hidden="true" className="h-4 w-px bg-line" />
            <span aria-hidden="true" className="msr px-2.5 text-[17px] text-muted">close</span>
          </span>
        </Link>
      </span>
    </div>
  );
}
