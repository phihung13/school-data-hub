// Lưới mini app — 4 cột, badge góc trên phải, app chưa build hiện mờ (DESIGN-GUIDELINES §3, §6).
import Link from "next/link";
import type { MiniAppTile as MiniAppTileType } from "@hub/core/contracts";

const TILE_GRADIENT: Record<string, string> = {
  // "checkin" là tile /checkin của học sinh (đổi tên khoá từ "attendance" ngày 31/07/2026,
  // gói "menu-noi-dung-dich" — nhãn và khoá cùng nói một việc: ghi tâm trạng, không phải
  // sổ điểm danh). Giữ nguyên dải màu cũ để em không thấy trang chủ đổi màu qua đêm.
  checkin: "from-domain-attendance to-domain-attendanceDark shadow-[0_5px_12px_rgba(10,79,191,.3)]",
  attendance: "from-domain-attendance to-domain-attendanceDark shadow-[0_5px_12px_rgba(10,79,191,.3)]",
  report: "from-domain-report to-domain-reportDark shadow-[0_5px_12px_rgba(116,52,232,.28)]",
  cockpit: "from-domain-cockpit to-domain-cockpitDark shadow-[0_5px_12px_rgba(10,42,94,.3)]",
};

export function MiniAppTile({ tile }: { tile: MiniAppTileType }) {
  if (!tile.available) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        {/* aria-hidden cho icon: nội dung DOM của .msr là chữ thô ("insights"...), font chỉ
            đổi hình chứ không đổi nội dung — không ẩn thì trình đọc màn hình đọc "insights
            Báo cáo". Nhãn app nằm ngay dưới, không mất thông tin gì (WCAG 1.1.1). */}
        {/* MỜ CHỈ Ô ICON, KHÔNG MỜ CẢ KHỐI. `opacity-40` đặt ở thẻ cha kéo theo cả nhãn chữ:
            #2A3444 trên nền trang đo được 12,55:1 tụt còn 2,21:1 — dưới chuẩn 4,5:1, và tụt
            đúng ở chỗ mang thông tin (tên app), không phải ở chỗ trang trí.
            DESIGN-GUIDELINES §3 muốn `opacity:.45` cho app chưa mở, §11 nói tương phản chữ
            không có ngoại lệ. Hai điều đó chỉ mâu thuẫn khi mờ cả khối: giữ tín hiệu "chưa
            mở" cho MẮT bằng ô icon mờ, giữ chữ đặc màu cho người đọc chữ. */}
        <span aria-hidden="true" className="flex h-[50px] w-[50px] items-center justify-center overflow-hidden rounded-2xl bg-[#E9ECF2] opacity-45">
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
