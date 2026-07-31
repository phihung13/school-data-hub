// Responsive đơn giản cho các màn học sinh/phụ huynh (P1/P2/P3): không tách
// layout desktop riêng (DEBT — xem README), chỉ co giãn + đặt trong khung thẻ
// trên màn rộng để không còn là một cột hẹp trôi nổi giữa nền trống.
export function PageShell({
  children,
  bg = "bg-pagebg",
}: {
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <div className="flex min-h-screen w-full justify-center bg-[#EAEFF6] md:items-center md:py-10">
      <div
        className={`flex w-full max-w-md flex-col md:h-auto md:max-w-xl md:overflow-hidden md:rounded-[28px] md:border md:border-line md:shadow-[0_20px_60px_rgba(10,42,94,.12)] ${bg}`}
      >
        {children}
      </div>
    </div>
  );
}
