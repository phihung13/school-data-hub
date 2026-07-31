// apps/hub/server/oidc/keys.ts — khoá ký của Hub với tư cách Identity Provider.
//
// LỖI ĐƯỢC VÁ Ở ĐÂY (phát hiện 31/07/2026, đọc code `provider.ts:75-92`):
// mỗi lần tiến trình khởi động, Hub gọi `generateKeyPair("RS256")` sinh một cặp khoá
// HOÀN TOÀN MỚI, rồi gán cứng `kid = "dev-1"` cho nó.
//
// Vì sao chi tiết `kid` mới là chỗ chết người, chứ không phải việc khoá đổi:
// RP (app ngoài) đúng chuẩn sẽ tải JWKS của Hub một lần rồi CACHE THEO `kid`. Lần sau
// nhận id_token có `kid: "dev-1"`, nó thấy "khoá này tôi có rồi" nên KHÔNG tải lại JWKS
// — và verify token mới bằng khoá cũ. Chữ ký không khớp. Đăng nhập chung và đăng xuất
// chung gãy IM LẶNG, còn RP thì không có tín hiệu nào để biết phải làm mới JWKS.
// Nếu `kid` đổi theo khoá thì cùng tình huống đó RP sẽ thấy `kid` lạ, tự tải lại JWKS,
// và mọi thứ tự lành. Nói cách khác: `kid` phải là TÊN RIÊNG của khoá, không phải nhãn
// dán tay lên vị trí "khoá đang dùng".
//
// LUẬT MỚI: `kid` = thumbprint RFC 7638 của chính khoá đó (băm các trường bắt buộc của
// JWK). Hai khoá khác nhau không bao giờ trùng `kid`; cùng một khoá thì `kid` luôn y
// nguyên qua mọi lần khởi động, mọi instance, mọi máy.
//
// Nguồn khoá, theo thứ tự:
//   1. `OIDC_JWKS`            — JSON: một JWK, một mảng JWK, hoặc {"keys":[...]}. Khoá ĐẦU
//                               là khoá đang ký; các khoá sau vẫn được công bố ở /oidc/jwks
//                               để token cũ verify được (đây chính là cách xoay khoá không
//                               gãy: publish cũ+mới một thời gian rồi mới bỏ khoá cũ).
//   2. `OIDC_SIGNING_KEY_PEM` — một khoá riêng PKCS#8 dạng PEM (tiện khi đọc từ file secret).
//   3. Dev: khoá lưu trong file `.oidc-dev-signing.key` (đã nằm trong .gitignore qua `*.key`),
//      tự sinh lần đầu rồi dùng lại — nhờ vậy khởi động lại KHÔNG đổi `kid`, đúng như thật.
//   4. Dev mà không ghi được file: khoá tạm trong RAM, có cảnh báo. Vẫn an toàn về mặt `kid`
//      (đổi khoá thì đổi luôn `kid`), chỉ là RP phải tải lại JWKS sau mỗi lần restart.
//
// Production KHÔNG có nhánh 3 và 4: thiếu khoá là ném lỗi, `server.mjs` await `getProvider()`
// lúc khởi động nên tiến trình từ chối lên thay vì chạy với khoá tạm.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  importPKCS8,
  jwtVerify,
  type JWK,
  type JWTPayload,
  type KeyLike,
} from "jose";
import { isProduction } from "./secrets.ts";

export interface SigningKeySet {
  /** Toàn bộ khoá công bố ở /oidc/jwks. Chứa phần riêng vì oidc-provider cần nó để ký. */
  jwks: JWK[];
  /** `kid` của khoá đang ký — dùng cho header của logout_token. */
  activeKid: string;
  /** Khoá riêng đang ký, đã import sẵn cho jose. */
  activeKey: KeyLike;
  /** Khoá đến từ đâu — để log lúc khởi động và để test khẳng định. */
  source: "env-jwks" | "env-pem" | "dev-file" | "ephemeral";
}

/** `kid` theo RFC 7638: băm SHA-256 các trường bắt buộc của JWK, base64url. */
export function kidFor(jwk: JWK): Promise<string> {
  return calculateJwkThumbprint(jwk, "sha256");
}

/**
 * Bản CÔNG KHAI của một khoá — đúng thứ được phép rời khỏi máy chủ.
 *
 * Viết thành hàm riêng thay vì `delete jwk.d` tại chỗ vì `d` KHÔNG phải trường riêng duy
 * nhất: RFC 7518 §6.3.2 còn `p`, `q`, `dp`, `dq`, `qi`, `oth` — và từ `p` với `q` dựng
 * lại được `d` trong vài mili giây. Một chỗ quên là một lần công bố khoá ký của Hub ra
 * internet. Liệt kê tường minh bằng destructuring để TypeScript giữ hộ danh sách này.
 */
export function toPublicJwk(jwk: JWK): JWK {
  // `oth` (multi-prime) không có trong kiểu JWK của jose nên phải bỏ bằng tay — nó vẫn
  // có thể tồn tại lúc chạy nếu khoá được cấp từ công cụ khác.
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...pub } = jwk;
  delete (pub as { oth?: unknown }).oth;
  return pub;
}

/** Sinh một khoá ký RS256 mới ở dạng JWK riêng. Dùng cho khoá dev và cho lệnh cấp khoá mới. */
export async function generateSigningJwk(): Promise<JWK> {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return exportJWK(privateKey);
}

/** Nạp một JWK thành khoá dùng được cho jose. */
export function importSigningKey(jwk: JWK): Promise<KeyLike> {
  return importJWK(jwk, "RS256") as Promise<KeyLike>;
}

/**
 * Verify một token bằng bộ JWKS công bố — CHÍNH XÁC thuật toán mà RP chạy: đọc `kid`
 * trong header, tìm khoá mang đúng `kid` đó, verify bằng phần công khai của nó.
 *
 * Có mặt trong mã sản phẩm (không phải chỉ để test) vì `loadSigningKeys()` dùng nó làm
 * bước tự kiểm lúc khởi động — xem `selfCheck()`. Đây cũng là bản viết-bằng-code của
 * hợp đồng với RP: đọc hàm này là biết Hub mong RP làm gì.
 */
export async function verifyWithJwks(
  token: string,
  jwks: JWK[],
  options?: { issuer?: string; audience?: string },
): Promise<JWTPayload> {
  const header = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as {
    kid?: string;
  };
  const match = jwks.find((k) => k.kid === header.kid);
  if (!match) {
    throw new Error(
      `Không có khoá nào mang kid "${header.kid}" trong JWKS đang công bố — đây đúng là tình huống ` +
        `RP gặp phải khi kid bị dán tay: token mới, khoá cũ.`,
    );
  }
  const { payload } = await jwtVerify(token, await importSigningKey(toPublicJwk(match)), options);
  return payload;
}

function isPrivateRsaJwk(value: unknown): value is JWK {
  const jwk = value as JWK | undefined;
  return !!jwk && jwk.kty === "RSA" && typeof jwk.d === "string" && typeof jwk.n === "string";
}

/**
 * Chuẩn hoá danh sách khoá: kiểm đúng loại, gắn alg/use, và ĐẶT LẠI `kid` bằng
 * thumbprint. Cố tình ghi đè `kid` do người vận hành tự khai: nếu để họ đặt tay thì
 * đúng cái lỗi đang vá (hai khoá khác nhau cùng một `kid`) lại quay về, chỉ là qua
 * đường khác.
 */
export async function normalizeJwks(input: unknown): Promise<JWK[]> {
  const raw: unknown[] = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { keys?: unknown }).keys)
      ? ((input as { keys: unknown[] }).keys)
      : [input];

  if (raw.length === 0) throw new Error("Danh sách khoá ký OIDC rỗng.");

  const out: JWK[] = [];
  for (const item of raw) {
    if (!isPrivateRsaJwk(item)) {
      throw new Error(
        "Khoá ký OIDC phải là JWK RSA có phần riêng (kty=RSA, có trường d). " +
          "Sinh khoá: node -e \"import('jose').then(async j=>{const{privateKey}=await j.generateKeyPair('RS256',{extractable:true});console.log(JSON.stringify(await j.exportJWK(privateKey)))})\"",
      );
    }
    const jwk: JWK = { ...item, alg: "RS256", use: "sig" };
    jwk.kid = await kidFor(jwk);
    out.push(jwk);
  }

  const kids = new Set(out.map((k) => k.kid));
  if (kids.size !== out.length) {
    throw new Error("Danh sách khoá ký OIDC có khoá trùng nhau — bỏ bớt bản sao.");
  }
  return out;
}

function readEnvJwks(): unknown | null {
  const raw = process.env.OIDC_JWKS;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("OIDC_JWKS không phải JSON hợp lệ (cần một JWK, một mảng JWK, hoặc {\"keys\":[...]}).");
  }
}

function devKeyFilePath(): string {
  return process.env.OIDC_DEV_KEY_FILE ?? join(process.cwd(), ".oidc-dev-signing.key");
}

async function loadOrCreateDevKey(): Promise<{ jwks: JWK[]; source: SigningKeySet["source"] }> {
  const file = devKeyFilePath();

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return { jwks: await normalizeJwks(parsed), source: "dev-file" };
  } catch {
    // Chưa có file, file hỏng, hoặc không đọc được — sinh khoá mới ở dưới.
  }

  const jwks = await normalizeJwks(await generateSigningJwk());

  try {
    writeFileSync(file, JSON.stringify(jwks, null, 2), { encoding: "utf8", mode: 0o600 });
    console.warn(
      `[oidc] Đã sinh khoá ký DEV mới và lưu vào ${file} (đã nằm trong .gitignore qua "*.key"). ` +
        `Khởi động lại sẽ dùng lại đúng khoá này nên kid không đổi. Production phải dùng OIDC_JWKS.`,
    );
    return { jwks, source: "dev-file" };
  } catch {
    console.warn(
      `[oidc] Không ghi được ${file} — dùng khoá tạm trong RAM. kid đổi theo khoá nên RP vẫn tự ` +
        `tải lại JWKS được, nhưng token cấp trước lần khởi động này sẽ không verify được nữa.`,
    );
    return { jwks, source: "ephemeral" };
  }
}

let cached: Promise<SigningKeySet> | null = null;

async function build(): Promise<SigningKeySet> {
  let jwks: JWK[];
  let source: SigningKeySet["source"];

  const envJwks = readEnvJwks();
  const pem = process.env.OIDC_SIGNING_KEY_PEM;

  if (envJwks) {
    jwks = await normalizeJwks(envJwks);
    source = "env-jwks";
  } else if (pem) {
    const key = await importPKCS8(pem.replace(/\\n/g, "\n"), "RS256", { extractable: true });
    jwks = await normalizeJwks(await exportJWK(key));
    source = "env-pem";
  } else if (isProduction()) {
    throw new Error(
      "Thiếu khoá ký OIDC ở production: đặt OIDC_JWKS (JSON) hoặc OIDC_SIGNING_KEY_PEM. " +
        "KHÔNG sinh khoá tạm ở production — mỗi lần khởi động sẽ đá văng mọi phiên app ngoài.",
    );
  } else {
    ({ jwks, source } = await loadOrCreateDevKey());
  }

  const active = jwks[0]!;
  const activeKey = await importSigningKey(active);
  await selfCheck(activeKey, active.kid!, jwks);
  return { jwks, activeKid: active.kid!, activeKey, source };
}

/**
 * Tự kiểm lúc khởi động: ký một token bỏ đi rồi verify lại bằng ĐÚNG bộ JWKS sắp công bố.
 *
 * Bắt được đúng loại lỗi mà không bước nào khác bắt được, và cả ba loại đều là "server
 * lên bình thường, RP hỏng lặng lẽ":
 *   · `OIDC_SIGNING_KEY_PEM` thật ra là khoá CÔNG KHAI, hoặc khoá của thuật toán khác.
 *   · JWK bị sửa tay, các trường không còn khớp nhau.
 *   · `kid` trong header không tra được trong JWKS (chính là lỗi "dev-1" ở dạng khác).
 *
 * Ném lỗi ở đây nghĩa là tiến trình từ chối khởi động — đúng thứ ta muốn: thà không lên
 * còn hơn lên rồi cấp token không ai verify được.
 */
async function selfCheck(key: KeyLike, kid: string, jwks: JWK[]): Promise<void> {
  const probe = await new SignJWT({ probe: true })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setExpirationTime("1m")
    .sign(key);

  try {
    await verifyWithJwks(probe, jwks);
  } catch (err) {
    throw new Error(
      `Khoá ký OIDC không tự verify được bằng chính JWKS sắp công bố (kid=${kid}). ` +
        `Nguyên nhân thường gặp: đưa nhầm khoá công khai, sai thuật toán, hoặc JWK bị sửa tay. ` +
        `Chi tiết: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function loadSigningKeys(): Promise<SigningKeySet> {
  if (!cached) cached = build();
  return cached;
}

/** CHỈ dùng trong test — nạp lại khoá sau khi đổi biến môi trường. */
export function resetSigningKeysForTest(): void {
  cached = null;
}
