"use client";
// apps/hub/components/embed-frame.tsx — Embed Bridge Tier 2 (08-embedded-apps.md mục 3).
//
// Luồng trao mã, đúng thứ tự tài liệu đã định:
// 1. Nạp iframe hiển thị (app con) với URL trần — KHÔNG kèm code trong query string.
// 2. Đợi app con gửi {type:'embed:ready', codeChallenge} (nó tự sinh cặp PKCE, chỉ gửi challenge).
// 3. Dựng một iframe ẨN trỏ /oidc/auth của chính Hub (cùng origin, đọc được phiên Hub bình
//    thường) dùng đúng challenge đó — luồng OIDC thật, không có gì "giả" ở tầng này.
// 4. iframe ẩn tự động resolve (session đã có) rồi rơi vào /embed/relay (cũng của Hub),
//    trang đó postMessage `code` lên đúng trang này (cùng origin, không qua app con).
// 5. Trang này mới postMessage `code` sang app con qua đúng targetOrigin đã khai trong Manifest.
//    App con tự POST code + verifier của chính nó (chưa từng rời trình duyệt của nó) tới
//    /oidc/token để đổi lấy token thật — Hub không bao giờ thấy verifier của app con.
import { useEffect, useRef, useState } from "react";
import type { EmbedAppConfig } from "@/server/embed/registry";
import { EmbedFloatingMenu } from "@/components/embed-floating-menu";
import { EmbedIntro } from "@/components/embed/embed-intro";

type Status = "waiting-ready" | "authorizing" | "ready" | "timeout" | "error";

function randomState(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function EmbedFrame({
  appId,
  clientId,
  embed,
}: {
  appId: string;
  clientId: string;
  embed: NonNullable<EmbedAppConfig["embed"]>;
}) {
  const [status, setStatus] = useState<Status>("waiting-ready");
  const visibleFrameRef = useRef<HTMLIFrameElement>(null);
  const relayStateRef = useRef<string | null>(null);
  // Factory nhắc lại "embed:ready" mỗi ~700ms cho tới khi Hub đáp (đúng thiết kế — app con
  // không biết Hub đã sẵn sàng nghe chưa). Dùng ref (không phải state) để chặn NGAY trong
  // cùng tick — nếu không, nhiều lượt nhắc lại trước khi re-render kịp sẽ cùng mở nhiều luồng
  // xin mã song song, luồng sau ghi đè relayStateRef của luồng trước, phần lớn mã bị vứt vì
  // lệch state (đã bắt lỗi này thật ngày 29/07/2026).
  const startedRef = useRef(false);

  useEffect(() => {
    // Factory tự nhắc lại "embed:ready" tối đa ~14 giây (20 lần × ~700ms) trước khi bỏ cuộc —
    // 10 giây từng đặt ở đây ngắn hơn khoảng đó, nên banner "không phản hồi" hay tự bật lên
    // rồi tắt ngay sau (đã bắt gặp thật 29/07/2026). Nới ra 18 giây, đủ dư so với 14 giây đó.
    const readyTimeout = window.setTimeout(() => {
      setStatus((s) => (s === "waiting-ready" ? "timeout" : s));
    }, 18_000);

    function handleMessage(event: MessageEvent) {
      // Thông điệp từ chính Hub (trang /embed/relay ẩn) — cùng origin.
      if (event.origin === window.location.origin) {
        if (event.data?.type === "embed:relay-code") {
          if (event.data.state !== relayStateRef.current) return; // không khớp lượt đang chờ — bỏ qua
          const frame = visibleFrameRef.current;
          if (frame?.contentWindow) {
            frame.contentWindow.postMessage({ type: "embed:token", code: event.data.code }, embed.origin);
          }
          setStatus("ready");
        }
        if (event.data?.type === "embed:relay-error") {
          console.error("[embed]", appId, "authorize lỗi:", event.data.error, event.data.errorDescription);
          setStatus("error");
        }
        return;
      }

      // Thông điệp từ app con — BẮT BUỘC kiểm origin khớp Manifest (08-embedded-apps.md mục 3).
      if (event.origin !== embed.origin) {
        console.warn("[embed]", appId, "bỏ qua postMessage từ origin lạ:", event.origin);
        return;
      }

      if (event.data?.type === "embed:ready") {
        if (startedRef.current) return; // đã xử lý lượt nhắc đầu tiên rồi — bỏ qua các lượt sau
        const codeChallenge = event.data.codeChallenge as string | undefined;
        if (!codeChallenge) {
          setStatus("error");
          return;
        }
        startedRef.current = true;
        window.clearTimeout(readyTimeout);
        setStatus("authorizing");
        const state = randomState();
        relayStateRef.current = state;
        const authUrl = new URL("/oidc/auth", window.location.origin);
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("response_type", "code");
        // ĐỌC TỪ HỒ SƠ, KHÔNG GHI CỨNG (sửa 23/08/2026). Bản trước ghi cứng
        // "openid profile", nên app khai `hub_profile` vẫn không nhận được
        // `hub_role`/`hub_school`/`hub_classes` — và hỏng IM LẶNG, vì oidc-provider chỉ
        // lặng lẽ bỏ scope không được phép chứ không báo lỗi. Bản yêu cầu gửi đội làm app
        // (mục 7.1) hứa có ba claim đó; ghi cứng ở đây là biến lời hứa ấy thành lời nói dối.
        authUrl.searchParams.set("scope", embed.ssoScopes.join(" "));
        authUrl.searchParams.set("redirect_uri", `${window.location.origin}/embed/relay`);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("state", state);

        const hidden = document.createElement("iframe");
        hidden.style.display = "none";
        hidden.src = authUrl.toString();
        document.body.appendChild(hidden);
        window.setTimeout(() => hidden.remove(), 15_000); // dọn rác — luồng chỉ cần vài trăm ms
      }

      if (event.data?.type === "embed:error") {
        // Factory dùng "reason" (vd pkce_unavailable, token_exchange_failed) — giữ "message"
        // để đọc được app khác lỡ khai tên trường khác, không coi đây là chuẩn cố định.
        console.error("[embed]", appId, "app con báo lỗi:", event.data.reason ?? event.data.message);
        setStatus("error");
      }

      // "embed:resize" CỐ TÌNH bỏ qua từ 29/07/2026 — khung nhúng giờ có kích thước cố định
      // (thẻ "nằm trong Hub", bo góc + viền cách), không giãn theo nội dung nữa. iframe tự
      // cuộn nội bộ (hành vi mặc định của trình duyệt), không cần JS.
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(readyTimeout);
    };
  }, [appId, clientId, embed.origin]);

  return (
    <div className="relative h-full w-full">
      <iframe
        ref={visibleFrameRef}
        src={embed.iframeUrl}
        title={embed.displayName}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-forms allow-same-origin"
        referrerPolicy="no-referrer"
      />
      {/* MÀN GIỚI THIỆU THAY CHO MÀN TRẮNG (02/08/2026).

          Giữ nguyên iframe BÊN DƯỚI chứ không dựng sau: app con phải được nạp song song
          với lúc người dùng đọc phần giới thiệu, nếu không thì màn chờ này lại chính là
          thứ làm chậm thêm. Lớp phủ chỉ biến mất khi status === "ready" — tức là khi app
          con đã bắt tay xong, KHÔNG phải khi iframe vừa onLoad. Hai thời điểm đó cách
          nhau vài giây, và cái sau mới là lúc người dùng thật sự dùng được app. */}
      {status !== "ready" && status !== "error" && (
        <EmbedIntro
          tenApp={embed.displayName}
          intro={embed.intro}
          iconImageUrl={embed.iconImageUrl}
          onThuLai={() => window.location.reload()}
        />
      )}
      <EmbedFloatingMenu appOrigin={embed.origin} onReload={() => window.location.reload()} />
      {status === "timeout" && (
        <div className="absolute inset-x-0 top-0 bg-[#FFF4E5] px-4 py-2 pr-24 text-[13px] text-[#8A5A00]">
          {embed.displayName} không phản hồi sau 18 giây — bấm ⋯ để tải lại, hoặc ✕ để thoát.
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-x-0 top-0 bg-[#FDECEC] px-4 py-2 pr-24 text-[13px] text-[#B3261E]">
          Có lỗi khi kết nối {embed.displayName} — bấm ⋯ để tải lại, hoặc ✕ để thoát an toàn.
        </div>
      )}
    </div>
  );
}
