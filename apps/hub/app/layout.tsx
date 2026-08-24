import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { TrpcProvider } from "@/lib/trpc-provider";
import { NavProgress } from "@/components/ui/nav-progress";
import { CongCheckinProvider } from "@/components/cong-checkin";
import { IntroCinematic } from "@/components/intro-cinematic";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { phaiDungOCheckin } from "@/server/checkin-gate";
import { log, describeError } from "@/lib/logger";

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

/**
 * CỔNG CHECK-IN ĐỨNG Ở LAYOUT GỐC (ADR-036 bản 21/08/2026) — không ở `/home` nữa.
 *
 * Chủ đầu tư: *"phải hiện ra popup checkin, xung quanh mờ, ko thoát được, thì nó mới là
 * khóa app"*. Khoá app nghĩa là MỌI trang, nên cổng phải đứng ở chỗ phủ mọi trang. Bản
 * trước chỉ gác `/home`, và gõ thẳng `/tuan-nay` là đi vòng được.
 *
 * Ba điều cố ý giữ nguyên từ bản trước (lý do đầy đủ ở `server/checkin-gate.ts`):
 * em chưa có phiếu đồng ý thì KHÔNG chặn · chỉ học sinh · lỗi CSDL thì cho qua.
 *
 * Chỉ hỏi cơ sở dữ liệu khi phiên là HỌC SINH: layout chạy trên mọi request của mọi
 * trang, và một truy vấn thừa ở đây là truy vấn thừa trên đường nóng nhất của Hub.
 */
async function docCong() {
  const session = await getCurrentSession();
  if (!session) return null;
  const laHocSinh = session.roles.includes("student");
  let batBuoc = false;
  if (laHocSinh) {
    try {
      batBuoc = await phaiDungOCheckin(session.authUid);
    } catch (err) {
      // Chặn một đứa trẻ khỏi CẢ APP vì một lỗi kết nối là phạt sai người — và ở layout
      // gốc thì cái giá của việc phạt nhầm lớn hơn hẳn: nó khoá mọi trang cùng lúc.
      log("error", "checkin.gate_read_failed", { authUid: session.authUid, ...describeError(err) });
    }
  }
  // `resolveIdentity` chỉ để popup dựng khung (nhãn lớp) — và chỉ gọi khi CÓ việc để
  // dựng, tức là khi popup thật sự có thể mở ra.
  const identity = laHocSinh ? await resolveIdentity(session.authUid).catch(() => null) : null;
  return {
    batBuoc,
    displayName: session.displayName,
    email: identity?.email ?? "",
    roles: session.roles,
    classCode: identity?.className ?? null,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cong = await docCong();
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body>

        {/* Phần tử BẮT BUỘC đứng đầu <body>: đích Tab đầu tiên của mọi trang. Ẩn khỏi mắt
            cho tới khi nhận focus (kiểu .skip-link trong globals.css). Đích #noi-dung do
            <main> trong components/page-shell.tsx cung cấp — qua <PageShell> (check-in,
            báo cáo) hoặc qua <MainContent> (điểm danh, tuần này, hồ sơ, cần gặp thầy cô).

            Trang nào CHƯA bọc nội dung bằng một trong hai thứ đó thì link này vẫn bấm được
            mà không đi tới đâu — không báo lỗi, không log, chỉ im lặng không nhảy. Tính tới
            31/07/2026 còn: /home, buồng lái GVCN (và các màn con), /login, /embed,
            not-found. Việc còn lại đúng một dòng mỗi màn: bọc CỘT NỘI DUNG (không bọc menu
            trái, không bọc tab bar) bằng
                <MainContent className="…">…</MainContent>
            KHÔNG viết tay id="noi-dung", và MỘT trang chỉ được có MỘT — xem lý lẽ đầy đủ
            trong components/page-shell.tsx và luật khoá trong tests/unit/a11y-nen.test.ts. */}
        <a href="#noi-dung" className="skip-link">
          Bỏ qua menu, tới nội dung chính
        </a>

        {/* MÀN ĐEN CHẶN cho intro — ĐỨNG SAU đường tắt, TRƯỚC nội dung: bài a11y đòi
            skip-link là phần tử đầu <body> (đích Tab đầu tiên), còn script thì chỉ cần
            chạy trước phần thân nặng phía dưới — <script> không chiếm tab-order nên hai
            yêu cầu không giẫm nhau. Sửa 24/08/2026, chủ đầu tư: "khi ấn đăng nhập thì nó
            vào trang home ngay, sau đó nó mới load intro".

            `IntroCinematic` đọc cờ trong useEffect — tức SAU hydrate, mà hydrate chạy sau
            khi HTML trang chủ đã vẽ. Khoảng giữa đó người dùng thấy trang chủ trần trụi
            rồi intro mới phủ lên. Script inline KHÔNG defer này chạy ngay khi parser gặp
            nó — trước khi phần thân phía dưới được vẽ — nên màn đen có mặt trước khung
            hình đầu tiên.

            Ba chốt an toàn, mỗi cái cho một đường hỏng:
            · KHÔNG xoá cờ ở đây — IntroCinematic vẫn là chủ của cờ; xoá hai nơi là hai
              nơi để lệch.
            · Tôn trọng prefers-reduced-motion NGAY TỪ ĐÂY: người tắt chuyển động không
              phải nhìn một màn đen chờ một đoạn phim sẽ không chiếu.
            · setTimeout 6s tự gỡ: nếu hydrate chết (JS lỗi, mạng đứt giữa chừng), màn đen
              không được phép thành nhà tù — 6s là trần, quá đó thà lộ trang còn hơn nhốt. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{if(sessionStorage.getItem("hub:intro")!=="1")return;' +
              'if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;' +
              'var d=document.createElement("div");d.id="intro-man-den";' +
              'd.style.cssText="position:fixed;inset:0;background:#04102A;z-index:79";' +
              'document.documentElement.appendChild(d);' +
              'setTimeout(function(){var e=document.getElementById("intro-man-den");if(e)e.remove()},6000);' +
              '}catch(e){}})();',
          }}
        />

        {/* Thanh báo "đang chuyển trang" — đặt ngoài TrpcProvider vì nó không cần dữ
            liệu nào, chỉ nghe cú bấm. Đứng ở layout gốc nên phủ MỌI trang: thêm màn mới
            không phải nhớ cắm lại, và đó là chủ ý (xem nav-progress.tsx). */}
        <NavProgress />
        <TrpcProvider>
          {/* Chưa đăng nhập (trang /login) thì không có cổng nào — và cũng không có
              truy vấn nào. */}
          {/* Đoạn intro sau đăng nhập. Đứng NGOÀI biểu thức ba ngôi bên dưới, và ngoài
              cổng check-in: nó tự gác bằng cờ `sessionStorage` nên không cần biết người
              dùng là ai, còn cổng check-in là thứ chờ sẵn phía sau khi phim tắt. */}
          <IntroCinematic />
          {cong ? (
            <CongCheckinProvider
              batBuoc={cong.batBuoc}
              displayName={cong.displayName}
              email={cong.email}
              roles={cong.roles}
              classCode={cong.classCode}
            >
              {children}
            </CongCheckinProvider>
          ) : (
            children
          )}
        </TrpcProvider>
      </body>
    </html>
  );
}
