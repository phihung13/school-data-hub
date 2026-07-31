// apps/hub/server/oidc/logout-token.ts — dựng `logout_token` cho Back-Channel Logout.
//
// Tách khỏi provider.ts vì hai lý do, và lý do thứ hai mới là lý do thật:
//  1. provider.ts chạm DB + dựng cả Provider, không test được bằng test thuần.
//  2. Cái cần khoá lại bằng test là ĐÚNG BA CHI TIẾT dưới đây — chúng là thứ quyết
//     định RP có chấp nhận token hay không, và cả ba đều đã từng sai trong repo này.
//
// BA CHI TIẾT ĐÓ:
//
//  a) `exp` — trước bản vá (provider.ts:238-247) logout_token KHÔNG có `exp`. RP viết
//     đúng chuẩn (jose `jwtVerify` với `maxTokenAge`, hoặc thư viện tự bắt) từ chối
//     token không hạn; RP viết dễ dãi thì nhận, và khi đó một logout_token bị chép lại
//     dùng được VĨNH VIỄN để đá bất kỳ ai ra khỏi RP đó. Hạn 2 phút: đủ rộng cho lệch
//     đồng hồ giữa hai máy, đủ hẹp để bản sao chép nguội không dùng lại được.
//
//  b) `kid` — phải là `kid` THẬT của khoá đang ký (thumbprint RFC 7638, xem keys.ts),
//     không phải nhãn dán tay "dev-1". RP tra JWKS theo `kid`; sai `kid` là sai khoá,
//     là chữ ký không khớp, là đăng xuất chung gãy im lặng.
//
//  c) `events` — RP dùng đúng claim này để phân biệt logout_token với id_token. Thiếu
//     nó thì token bị từ chối; đặt sai URN cũng vậy.
//
// Chuẩn tham chiếu: OpenID Connect Back-Channel Logout 1.0 §2.4.

import { randomUUID } from "node:crypto";
import { SignJWT, type KeyLike } from "jose";

/** Hạn của logout_token, tính bằng giây. Xem lý do chọn 2 phút ở đầu file. */
export const LOGOUT_TOKEN_TTL_SECONDS = 120;

/** URN bắt buộc trong claim `events` — RP nhận diện logout_token bằng đúng chuỗi này. */
export const BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

export interface LogoutTokenInput {
  issuer: string;
  clientId: string;
  /** `sub` = core.users.id, đúng subject Hub đã cấp cho RP lúc đăng nhập. */
  userId: string;
  key: KeyLike;
  kid: string;
  /** Cho test bơm thời gian giả; mặc định là bây giờ. */
  now?: number;
}

export function buildLogoutToken(input: LogoutTokenInput): Promise<string> {
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);

  return (
    new SignJWT({ events: { [BACKCHANNEL_LOGOUT_EVENT]: {} } })
      // `typ` do §2.4 khuyến nghị: giúp RP từ chối ngay nếu ai đó thử đưa id_token vào
      // cửa logout (hoặc ngược lại). jose bỏ qua `typ` khi RP không yêu cầu, nên thêm
      // vào không làm gãy RP đang chạy.
      .setProtectedHeader({ alg: "RS256", kid: input.kid, typ: "logout+jwt" })
      .setIssuer(input.issuer)
      .setAudience(input.clientId)
      .setSubject(input.userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + LOGOUT_TOKEN_TTL_SECONDS)
      // `jti` để RP chống phát lại (§2.4 yêu cầu). Không có `nonce` — §2.6 CẤM.
      .setJti(randomUUID())
      .sign(input.key)
  );
}
