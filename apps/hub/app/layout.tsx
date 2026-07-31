import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { TrpcProvider } from "@/lib/trpc-provider";

// Tự host qua next/font (build tải font về, phục vụ từ chính domain Hub) — KHÔNG dùng
// <link> trỏ fonts.googleapis.com nữa. Lý do: tiện ích chặn quảng cáo/riêng tư của trình
// duyệt (uBlock, Brave Shield...) coi domain đó là theo dõi, tự xóa <link> khỏi DOM TRƯỚC
// khi React hydrate — HTML server render có link, DOM client hydrate thì không, gây lỗi
// "Expected server HTML to contain a matching <link> in <head>" (phát hiện thật 29/07/2026,
// tái hiện được ở trình duyệt có chặn quảng cáo, không tái hiện ở trình duyệt tự động không chặn).
//
// Từ 31/07/2026 font ICON cũng tự host theo đúng lý lẽ đó: Material Symbols Rounded không
// có trong danh mục next/font/google (font icon biến thể, không phải font chữ) nên trước
// đây phải tải bằng script từ fonts.googleapis.com — mạng trường lọc nội dung hoặc tiện ích
// chặn quảng cáo chặn domain đó là mất sạch 91 icon, không có nhánh dự phòng. Nay là một
// bản .woff2 cắt gọn nằm trong public/fonts/, khai @font-face ngay trong globals.css;
// component IconFontLoader đã bị xoá cùng cơ chế class msr-ready.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Viet Anh School Hub",
  description: "Super App — Hệ thống Trường Việt Anh",
};

// DESIGN-GUIDELINES §3 — theme-color navy cho thanh trạng thái mobile.
export const viewport: Viewport = {
  themeColor: "#0A2A5E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body>
        {/* Phần tử BẮT BUỘC đứng đầu <body>: đích Tab đầu tiên của mọi trang. Ẩn khỏi mắt
            cho tới khi nhận focus (kiểu .skip-link trong globals.css). Đích #noi-dung do
            <main> trong components/page-shell.tsx cung cấp — trang nào chưa bọc nội dung
            bằng PageShell/<main id="noi-dung"> thì link này chưa nhảy được, xem ghi chú
            phối hợp trong tests/unit/a11y.test.ts. */}
        <a href="#noi-dung" className="skip-link">
          Bỏ qua menu, tới nội dung chính
        </a>
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  );
}
