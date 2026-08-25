"use client";
// /dang-nhap/google — trạm về đích của lượt đăng nhập Google (qua Supabase Auth).
//
// Supabase đưa người dùng về đây với token trong FRAGMENT (`#access_token=…`) — fragment
// không bao giờ rời trình duyệt (không vào log máy chủ, không vào Referer), nên trang này
// phải là client component: đọc fragment, POST token vào /api/auth/sso-google (body của
// một POST cùng-origin), nhận cookie phiên, rồi đi tiếp đúng luật của màn đăng nhập:
// đích /home thì đặt cờ intro (CO_INTRO) TRƯỚC khi nạp trang — cùng lý lẽ với
// goAfterLogin trong login-form.tsx.
//
// Trang này KHÔNG có giao diện riêng đáng kể — nó sống dưới một giây khi mọi thứ đúng.
// Khi sai, nó nói bằng lời và cho một đường quay lại màn đăng nhập, không để ai đứng
// trước một trang trắng với một URL đầy ký tự lạ.
import { useEffect, useState } from "react";
import { CO_INTRO } from "@/components/intro-cinematic";

export default function TramGoogle() {
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    // Fragment chỉ đọc được sau khi trang đã lên — effect là chỗ sớm nhất và đúng nhất.
    const thamSo = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = thamSo.get("access_token");
    const loiNgoai = thamSo.get("error_description") ?? thamSo.get("error");

    // Xoá fragment NGAY — token không được sống trong thanh địa chỉ lâu hơn cần thiết
    // (chụp màn hình, share link, lịch sử trình duyệt đều là đường rò).
    window.history.replaceState(null, "", window.location.pathname);

    if (loiNgoai) {
      setLoi(`Google từ chối lượt đăng nhập: ${loiNgoai}`);
      return;
    }
    if (!accessToken) {
      setLoi("Không nhận được token từ Google. Hãy đăng nhập lại từ đầu.");
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/auth/sso-google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setLoi(data.error ?? "Không dựng được phiên. Thử lại, hoặc báo quản trị.");
          return;
        }
        try {
          sessionStorage.setItem(CO_INTRO, "1");
        } catch {
          // Chế độ riêng tư chặn sessionStorage: bỏ intro, không chặn đăng nhập.
        }
        // Hard navigation — cùng lý do với goAfterLogin: Server Components phải đọc
        // cookie MỚI, không dùng lại cache RSC dựng lúc chưa đăng nhập.
        window.location.assign("/home");
      } catch {
        setLoi("Mạng trục trặc giữa chừng. Thử lại, hoặc báo quản trị.");
      }
    })();
  }, []);

  return (
    <main
      id="noi-dung"
      className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#04102A] px-6 text-center"
    >
      {loi ? (
        <>
          <p className="max-w-[420px] text-[14px] font-bold leading-relaxed text-[#EAF2FF]">{loi}</p>
          <a
            href="/login"
            className="flex min-h-[44px] items-center rounded-[10px] bg-gradient-to-br from-gold to-gold-dark px-6 text-[13.5px] font-black text-navy"
          >
            Về màn đăng nhập
          </a>
        </>
      ) : (
        <p className="text-[13.5px] font-bold text-[#93A9C8]" role="status" aria-live="polite">
          Đang xác nhận với Trường Việt Anh…
        </p>
      )}
    </main>
  );
}
