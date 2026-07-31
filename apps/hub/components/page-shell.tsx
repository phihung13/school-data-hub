// Responsive đơn giản cho các màn học sinh/phụ huynh (P1/P2/P3): không tách
// layout desktop riêng (DEBT — xem README), chỉ co giãn + đặt trong khung thẻ
// trên màn rộng để không còn là một cột hẹp trôi nổi giữa nền trống.
//
// Khung thẻ này CHÍNH LÀ vùng nội dung chính của trang, nên nó là <main> — landmark
// duy nhất mà trình đọc màn hình dùng để nhảy thẳng vào nội dung, và là đích của đường
// tắt "Bỏ qua menu" đặt ở đầu <body> (app/layout.tsx). Trước 31/07/2026 grep "<main"
// trong toàn bộ apps/hub trả về RỖNG: không trang nào có landmark, người dùng bàn phím
// phải Tab qua trọn bộ menu trái trên MỌI trang.
//
// id BẮT BUỘC giữ nguyên "noi-dung" — đổi ở đây thì đổi cả href trong layout.tsx
// (tests/unit/a11y.test.ts đối chiếu hai bên).
export const MAIN_CONTENT_ID = "noi-dung";

export function PageShell({
  children,
  bg = "bg-pagebg",
}: {
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <div className="flex min-h-screen w-full justify-center bg-[#EAEFF6] md:items-center md:py-10">
      <main
        id={MAIN_CONTENT_ID}
        // tabIndex={-1}: bấm đường tắt phải ĐẶT ĐƯỢC focus vào đây, không chỉ cuộn tới.
        // Safari/WebKit không tự chuyển focus khi nhảy tới phần tử không focus được —
        // thiếu dòng này thì Tab kế tiếp lại quay về đầu trang, đúng thứ đường tắt sinh
        // ra để tránh. focus:outline-none vì bản thân <main> không phải nút bấm: người
        // dùng vừa chủ động nhảy tới đây nên không cần vẽ vòng quanh cả trang.
        tabIndex={-1}
        className={`flex w-full max-w-md flex-col focus:outline-none md:h-auto md:max-w-xl md:overflow-hidden md:rounded-[28px] md:border md:border-line md:shadow-[0_20px_60px_rgba(10,42,94,.12)] ${bg}`}
      >
        {children}
      </main>
    </div>
  );
}
