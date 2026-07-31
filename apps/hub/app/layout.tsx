import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { TrpcProvider } from "@/lib/trpc-provider";
import { IconFontLoader } from "@/components/icon-font-loader";

// Tự host qua next/font (build tải font về, phục vụ từ chính domain Hub) — KHÔNG dùng
// <link> trỏ fonts.googleapis.com nữa. Lý do: tiện ích chặn quảng cáo/riêng tư của trình
// duyệt (uBlock, Brave Shield...) coi domain đó là theo dõi, tự xóa <link> khỏi DOM TRƯỚC
// khi React hydrate — HTML server render có link, DOM client hydrate thì không, gây lỗi
// "Expected server HTML to contain a matching <link> in <head>" (phát hiện thật 29/07/2026,
// tái hiện được ở trình duyệt có chặn quảng cáo, không tái hiện ở trình duyệt tự động không chặn).
// Material Symbols Rounded KHÔNG có trong danh mục next/font/google (font icon biến thể,
// không phải font chữ) — nạp riêng qua IconFontLoader (client, sau khi hydrate xong).
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
        <IconFontLoader />
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  );
}
