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

/**
 * Vùng nội dung chính của MỘT trang — dùng cho các màn KHÔNG dựng bằng <PageShell>
 * (màn có menu trái riêng: điểm danh, tuần này, hồ sơ, cần gặp thầy cô).
 *
 * Vì sao phải là một component chung chứ không phải mỗi màn tự viết <main id="noi-dung">:
 *  - id viết tay là chỗ sinh lỗi im lặng nhất. Gõ sai một ký tự thì đường tắt vẫn "bấm
 *    được", vẫn không báo lỗi, chỉ là không đi tới đâu — đúng loại hỏng không ai phát hiện
 *    ra bằng mắt.
 *  - MỘT trang chỉ được có MỘT phần tử mang id này. Màn nào có hai nhánh mobile/desktop
 *    tách rời thì đặt <MainContent> BỌC NGOÀI cả hai nhánh, không đặt mỗi nhánh một cái:
 *    nhánh kia tuy display:none nhưng vẫn nằm trong DOM, và trình duyệt chỉ nhảy tới id
 *    ĐẦU TIÊN — nếu cái đầu tiên đang ẩn thì đường tắt chết mà không ai biết.
 *
 * Menu trái / tab bar phải nằm NGOÀI phần tử này, nếu không thì "bỏ qua menu" không bỏ
 * qua được gì cả.
 */
export function MainContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // tabIndex={-1} + focus:outline-none: xem lý lẽ ở <main> trong PageShell bên dưới.
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`focus:outline-none ${className}`}>
      {children}
    </main>
  );
}

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
