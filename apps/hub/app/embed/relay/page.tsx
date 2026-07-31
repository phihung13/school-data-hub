"use client";
// apps/hub/app/embed/relay/page.tsx
//
// Trang trung chuyển RIÊNG của Hub trong luồng Embed Bridge (08-embedded-apps.md mục 3).
// Chạy trong một iframe ẨN (không phải iframe hiển thị của app ngoài) do chính
// embed-frame.tsx dựng — cùng origin với Hub nên đọc được phiên Hub bình thường qua
// /oidc/auth như mọi lượt đăng nhập khác, KHÔNG có gì đặc biệt ở tầng OIDC.
//
// Việc duy nhất ở đây: đọc `code`/`state`/`error` từ URL rồi chuyển tiếp lên đúng
// window cha (trang /embed/<app-id>, cùng origin) — code không rời khỏi trình duyệt
// của Hub ở bước này.
import { useEffect } from "react";

export default function EmbedRelayPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = params.get("error")
      ? { type: "embed:relay-error", error: params.get("error"), errorDescription: params.get("error_description") }
      : { type: "embed:relay-code", code: params.get("code"), state: params.get("state") };

    // Cùng origin với trang cha (cả hai đều hub.truongvietanh.com) — targetOrigin chính xác
    // theo origin hiện tại, không dùng "*".
    window.parent.postMessage(message, window.location.origin);
  }, []);

  return null;
}
