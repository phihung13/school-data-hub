import { redirect, notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { findEmbedApp, canOpenEmbedApp } from "@/server/embed/registry";
import { EmbedFrame } from "@/components/embed-frame";

// apps/hub/app/embed/[appId]/page.tsx — Embed Bridge Tier 2 (08-embedded-apps.md mục 3).
// Server Component: cùng origin Hub nên đọc phiên bình thường qua cookie, không có gì
// đặc biệt. KHÔNG dựng thanh header riêng nữa (29/07/2026) — app con đã có logo/thương
// hiệu của chính nó (sidebar riêng), một thanh ngoài lặp lại là thừa. Chỉ còn capsule
// ⋯│✕ NỔI đè lên góc trên phải, giống nút đóng cố định của Zalo Mini App — xem
// embed-floating-menu.tsx (nút ⋯ có chức năng thật: tải lại, mở tab mới).
export default async function EmbedAppPage({ params }: { params: { appId: string } }) {
  const app = findEmbedApp(params.appId);
  if (!app?.embed) notFound();

  const session = await getCurrentSession();
  if (!session) redirect(`/login?then=${encodeURIComponent(`/embed/${params.appId}`)}`);

  const identity = await resolveIdentity(session.authUid);
  if (!identity) redirect("/login");

  // Hàng rào vai (31/07/2026). Trước đây trang này chỉ hỏi "đã đăng nhập chưa" — mà mở trang
  // nghĩa là EmbedFrame đi lấy mã OIDC thật kèm claim hub_profile cho app ngoài. Nghĩa là một
  // em học sinh gõ thẳng /embed/factory sẽ được Hub cấp danh tính hợp lệ vào app nhân viên.
  // notFound() chứ không phải trang "bạn không có quyền": không cho biết app đó có tồn tại hay
  // không cũng là một lớp che, và người dùng đúng vai thì không bao giờ chạm vào nhánh này.
  if (!canOpenEmbedApp(app, identity.roles)) notFound();

  return (
    // Nền gradient của Hub CỐ TÌNH lộ ra quanh viền (padding) — cảm giác "app nằm trong Hub"
    // thay vì một trang web riêng chiếm trọn màn hình (yêu cầu 29/07/2026). Tím-xanh theo
    // yêu cầu, khác dải màu pale mặc định của Hub — chỉ dùng riêng cho khung Embed Bridge.
    <div className="h-screen w-full bg-gradient-to-br from-[#3B2A6B] via-[#2D3E7A] to-[#0A2A5E] p-2.5 sm:p-4">
      <div className="relative h-full w-full overflow-hidden rounded-[20px] shadow-[0_8px_30px_rgba(10,42,94,.14)]">
        <EmbedFrame appId={params.appId} clientId={params.appId} embed={app.embed} />
      </div>
    </div>
  );
}
