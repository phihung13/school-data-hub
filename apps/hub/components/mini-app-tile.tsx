// Lưới mini app — 4 cột, badge góc trên phải, app chưa build hiện mờ (DESIGN-GUIDELINES §3, §6).
import Link from "next/link";
import type { MiniAppTile as MiniAppTileType } from "@hub/core/contracts";

const TILE_GRADIENT: Record<string, string> = {
  attendance: "from-domain-attendance to-domain-attendanceDark shadow-[0_5px_12px_rgba(10,79,191,.3)]",
  report: "from-domain-report to-domain-reportDark shadow-[0_5px_12px_rgba(116,52,232,.28)]",
  cockpit: "from-domain-cockpit to-domain-cockpitDark shadow-[0_5px_12px_rgba(10,42,94,.3)]",
};

export function MiniAppTile({ tile }: { tile: MiniAppTileType }) {
  if (!tile.available) {
    return (
      <div className="flex flex-col items-center gap-1.5 opacity-40">
        {/* aria-hidden cho icon: nội dung DOM của .msr là chữ thô ("insights"...), font chỉ
            đổi hình chứ không đổi nội dung — không ẩn thì trình đọc màn hình đọc "insights
            Báo cáo". Nhãn app nằm ngay dưới, không mất thông tin gì (WCAG 1.1.1). */}
        <span aria-hidden="true" className="flex h-[50px] w-[50px] items-center justify-center overflow-hidden rounded-2xl bg-[#E9ECF2]">
          {tile.iconImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo app ngoài, kích thước cố định nhỏ
            <img src={tile.iconImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true" className="msr text-[24px] text-caption">{tile.icon}</span>
          )}
        </span>
        {/* App chưa mở hiện MỜ — mờ là tín hiệu thị giác, người dùng trình đọc màn hình
            không thấy. Nói thẳng bằng chữ trong nhãn ẩn thay vì để họ tưởng bấm được. */}
        <span className="text-[10px] font-bold text-[#2A3444]">
          {tile.label}
          <span className="sr-only"> — sắp có, chưa mở</span>
        </span>
      </div>
    );
  }

  const gradient = TILE_GRADIENT[tile.key] ?? "from-navy to-navy-light shadow-[0_5px_12px_rgba(10,42,94,.3)]";

  return (
    <Link href={tile.href} className="flex flex-col items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`flex h-[50px] w-[50px] items-center justify-center overflow-hidden rounded-2xl ${
          tile.iconImageUrl ? "bg-white shadow-[0_5px_12px_rgba(10,42,94,.15)]" : `bg-gradient-to-br ${gradient}`
        }`}
      >
        {tile.iconImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo app ngoài, kích thước cố định nhỏ
          <img src={tile.iconImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true" className="msr text-[24px] text-white">{tile.icon}</span>
        )}
      </span>
      <span className="text-[10px] font-bold text-[#2A3444]">{tile.label}</span>
    </Link>
  );
}
