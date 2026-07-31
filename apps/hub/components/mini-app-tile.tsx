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
        <span className="flex h-[50px] w-[50px] items-center justify-center overflow-hidden rounded-2xl bg-[#E9ECF2]">
          {tile.iconImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo app ngoài, kích thước cố định nhỏ
            <img src={tile.iconImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="msr text-[24px] text-caption">{tile.icon}</span>
          )}
        </span>
        <span className="text-[10px] font-bold text-[#2A3444]">{tile.label}</span>
      </div>
    );
  }

  const gradient = TILE_GRADIENT[tile.key] ?? "from-navy to-navy-light shadow-[0_5px_12px_rgba(10,42,94,.3)]";

  return (
    <Link href={tile.href} className="flex flex-col items-center gap-1.5">
      <span
        className={`flex h-[50px] w-[50px] items-center justify-center overflow-hidden rounded-2xl ${
          tile.iconImageUrl ? "bg-white shadow-[0_5px_12px_rgba(10,42,94,.15)]" : `bg-gradient-to-br ${gradient}`
        }`}
      >
        {tile.iconImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo app ngoài, kích thước cố định nhỏ
          <img src={tile.iconImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="msr text-[24px] text-white">{tile.icon}</span>
        )}
      </span>
      <span className="text-[10px] font-bold text-[#2A3444]">{tile.label}</span>
    </Link>
  );
}
