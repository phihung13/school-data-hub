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
          <span className="msr text-[19px] text-white">{icon}</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-black leading-tight text-navy">{title}</div>
        {subtitle && <div className="truncate text-[9px] font-black uppercase tracking-wide text-caption">{subtitle}</div>}
      </div>
      <Link
        href="/home"
        aria-label="Thoát về Hub"
        className="flex items-center rounded-full border border-line p-1"
      >
        <span className="msr px-2.5 text-[18px] text-muted">more_horiz</span>
        <span className="h-4 w-px bg-line" />
        <span className="msr px-2.5 text-[17px] text-muted">close</span>
      </Link>
    </div>
  );
}
