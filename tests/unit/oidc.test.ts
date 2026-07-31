// tests/unit/oidc.test.ts — khoá lại bốn lỗ hổng auth tìm được ngày 31/07/2026.
//
// Bốn thứ được khoá, mỗi thứ là một lỗi ĐANG CÓ trong repo trước bản vá:
//
//  1. MỘT KHOÁ LÀM BA VIỆC. `AUTH_SESSION_SECRET` (khoá HS256 ký cookie `hub_session`)
//     vừa ký phiên, vừa ký cookie của oidc-provider, VỪA ĐƯỢC GỬI QUA MẠNG trong header
//     `x-internal-secret` mỗi lượt đăng xuất — tới `${HUB_URL}` là tên miền công khai.
//     Cả ba chỗ có giá trị mặc định nằm sẵn trong repo.
//
//  2. JWKS SINH MỚI MỖI LẦN KHỞI ĐỘNG NHƯNG GIỮ NGUYÊN `kid = "dev-1"`. RP cache JWKS
//     theo `kid`, thấy `kid` cũ thì không tải lại, verify token mới bằng khoá cũ, chữ ký
//     sai, đăng nhập chung gãy IM LẶNG.
//
//  3. ĐĂNG XUẤT MỘT CHIỀU. Thoát ở app ngoài không xoá `hub_session`, nên mở lại là SSO
//     im lặng đăng nhập lại — trên máy phòng máy dùng chung.
//
//  4. MÃ MỜI 6 KÝ TỰ KHÔNG ĐẾM SỐ LẦN THỬ.
//
// Test chạy ở môi trường node thuần: mọi thứ kiểm ở đây là hàm THUẦN hoặc module chỉ đọc
// biến môi trường — không dựng Provider, không chạm Postgres.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// KHÔNG import thẳng `jose` ở đây: gói đó nằm trong node_modules của apps/hub và
// packages/core, không nằm ở gốc workspace, nên `tests/**` không phân giải được nó.
// Mọi phép toán trên khoá đi qua `keys.ts` — vốn là nơi đúng để chúng ở, và nhờ vậy
// test dùng CHÍNH các hàm mà máy chủ dùng, không phải một bản song song.
import {
  generateSigningJwk,
  importSigningKey,
  kidFor,
  loadSigningKeys,
  normalizeJwks,
  resetSigningKeysForTest,
  toPublicJwk,
  verifyWithJwks,
  type SigningKeySet,
} from "@/server/oidc/keys";
import {
  INTERNAL_BACKCHANNEL_LOGOUT_PATH,
  MIN_SECRET_LENGTH,
  internalRpcOrigin,
  internalRpcSecret,
  isLoopbackAddress,
  oidcCookieKeys,
  requireSecret,
  resetSecretWarningsForTest,
  secretEquals,
  verifyInternalRequest,
} from "@/server/oidc/secrets";
import {
  BACKCHANNEL_LOGOUT_EVENT,
  LOGOUT_TOKEN_TTL_SECONDS,
  buildLogoutToken,
} from "@/server/oidc/logout-token";
import { autoSubmitLogoutPage, clearHubSessionCookie } from "@/server/oidc/rp-logout";
import {
  INVITE_CODE_LOCK_MS,
  INVITE_CODE_MAX_FAILURES,
  checkInviteCode,
  clearInviteFailures,
  inviteCodeFingerprint,
  normalizeInviteCode,
  recordInviteFailure,
  resetInviteGuardForTest,
} from "@/server/oidc/invite-guard";

// ---------------------------------------------------------------------------
// Tiện ích chung: giữ nguyên biến môi trường giữa các ca kiểm thử.
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  "NODE_ENV",
  "AUTH_SESSION_SECRET",
  "INTERNAL_RPC_SECRET",
  "OIDC_COOKIE_KEYS",
  "OIDC_JWKS",
  "OIDC_SIGNING_KEY_PEM",
  "OIDC_DEV_KEY_FILE",
  "PORT",
] as const;

let savedEnv: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  resetSigningKeysForTest();
  resetSecretWarningsForTest();
  resetInviteGuardForTest();
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, savedEnv[k]);
  resetSigningKeysForTest();
  resetSecretWarningsForTest();
  resetInviteGuardForTest();
});

/** Đủ dài để qua MIN_SECRET_LENGTH; nội dung không quan trọng. */
const LONG_SECRET_A = "a".repeat(MIN_SECRET_LENGTH);
const LONG_SECRET_B = "b".repeat(MIN_SECRET_LENGTH + 7);

const makePrivateJwk = generateSigningJwk;

// ---------------------------------------------------------------------------
// 1. Tách khoá bí mật
// ---------------------------------------------------------------------------

describe("secrets — một khoá cho một việc", () => {
  it("production thiếu INTERNAL_RPC_SECRET thì NÉM LỖI, không rơi về mặc định", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_A; // có sẵn khoá phiên vẫn KHÔNG được mượn
    expect(() => internalRpcSecret()).toThrow(/INTERNAL_RPC_SECRET/);
  });

  it("production thiếu OIDC_COOKIE_KEYS cũng ném lỗi — đây là chỗ trước đây dùng chung khoá phiên", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_A;
    expect(() => oidcCookieKeys()).toThrow(/OIDC_COOKIE_KEYS/);
  });

  it("KHÔNG còn hằng số 'dev-only-secret-do-not-use-in-prod' làm giá trị mặc định", () => {
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_A;
    expect(internalRpcSecret()).not.toContain("dev-only");
    expect(oidcCookieKeys()[0]).not.toContain("dev-only");
  });

  it("secret ngắn hơn 32 ký tự ở production bị từ chối như thể chưa đặt", () => {
    process.env.NODE_ENV = "production";
    process.env.INTERNAL_RPC_SECRET = "qua-ngan";
    expect(() => internalRpcSecret()).toThrow(/32/);
  });

  it("dev suy được secret, nhưng giá trị suy ra KHÁC hẳn khoá ký phiên", () => {
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_A;
    const internal = internalRpcSecret();
    const cookie = oidcCookieKeys()[0]!;

    // Đây là điểm mấu chốt: thứ đi ra khỏi tiến trình không còn ký được phiên nữa.
    expect(internal).not.toBe(process.env.AUTH_SESSION_SECRET);
    expect(cookie).not.toBe(process.env.AUTH_SESSION_SECRET);
    // Và hai việc khác nhau thì hai giá trị khác nhau — không phải cùng một khoá đổi tên.
    expect(internal).not.toBe(cookie);
  });

  it("dev suy secret ổn định: gọi lại vẫn ra đúng giá trị đó", () => {
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_A;
    expect(internalRpcSecret()).toBe(internalRpcSecret());
  });

  it("đổi AUTH_SESSION_SECRET thì secret suy ra cũng đổi theo", () => {
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_A;
    const first = internalRpcSecret();
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_B;
    expect(internalRpcSecret()).not.toBe(first);
  });

  it("biến môi trường thật luôn thắng giá trị suy tạm", () => {
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_A;
    process.env.INTERNAL_RPC_SECRET = LONG_SECRET_B;
    expect(internalRpcSecret()).toBe(LONG_SECRET_B);
  });

  it("dev không có AUTH_SESSION_SECRET thì cũng ném lỗi, không im lặng chạy tiếp", () => {
    expect(() => requireSecret("INTERNAL_RPC_SECRET")).toThrow(/AUTH_SESSION_SECRET/);
  });

  it("OIDC_COOKIE_KEYS nhiều khoá: khoá đầu là khoá đang ký, giữ nguyên thứ tự", () => {
    process.env.OIDC_COOKIE_KEYS = `${LONG_SECRET_A} , ${LONG_SECRET_B}`;
    expect(oidcCookieKeys()).toEqual([LONG_SECRET_A, LONG_SECRET_B]);
  });

  it("OIDC_COOKIE_KEYS có một khoá quá ngắn thì hỏng cả danh sách, không nhận nửa vời", () => {
    process.env.OIDC_COOKIE_KEYS = `${LONG_SECRET_A},ngan`;
    expect(() => oidcCookieKeys()).toThrow(/OIDC_COOKIE_KEYS/);
  });
});

describe("đích gọi nội bộ — không bao giờ là HUB_URL", () => {
  it("luôn là loopback của chính máy này, kể cả khi HUB_URL là tên miền công khai", () => {
    process.env.HUB_URL = "https://hub.truongvietanh.com";
    expect(internalRpcOrigin()).toBe("http://127.0.0.1:3000");
    expect(internalRpcOrigin()).not.toContain("truongvietanh");
  });

  it("bám theo PORT thật của tiến trình", () => {
    process.env.PORT = "4123";
    expect(internalRpcOrigin()).toBe("http://127.0.0.1:4123");
  });

  it("đường dẫn endpoint nội bộ là hằng số dùng chung cho cả hai đầu", () => {
    expect(INTERNAL_BACKCHANNEL_LOGOUT_PATH).toBe("/internal/oidc/backchannel-logout");
  });
});

describe("isLoopbackAddress", () => {
  it("nhận đủ ba dạng Node có thể trả về", () => {
    for (const addr of ["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1", "localhost"]) {
      expect(isLoopbackAddress(addr), addr).toBe(true);
    }
  });

  it("chặn địa chỉ ngoài, kể cả dải nội bộ của docker/LAN", () => {
    for (const addr of ["10.0.0.5", "192.168.1.9", "172.17.0.2", "8.8.8.8", "::ffff:10.0.0.5", "1.2.3.4"]) {
      expect(isLoopbackAddress(addr), addr).toBe(false);
    }
  });

  it("không có địa chỉ thì KHÔNG coi là nội bộ (fail closed)", () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress(null)).toBe(false);
    expect(isLoopbackAddress("")).toBe(false);
  });

  it("chuỗi mở đầu bằng 127 nhưng không phải IP thì không lọt", () => {
    expect(isLoopbackAddress("127.0.0.1.evil.com")).toBe(false);
    expect(isLoopbackAddress("1127.0.0.1")).toBe(false);
  });
});

describe("verifyInternalRequest — cổng /internal/*", () => {
  beforeEach(() => {
    process.env.INTERNAL_RPC_SECRET = LONG_SECRET_A;
  });

  it("gọi từ ngoài loopback trả 404, KHÔNG phải 401", () => {
    // 401 là xác nhận với người quét rằng endpoint có thật và chỉ thiếu khoá.
    const verdict = verifyInternalRequest({ remoteAddress: "203.0.113.9", secretHeader: LONG_SECRET_A });
    expect(verdict).toEqual({ ok: false, status: 404, reason: "not-loopback" });
  });

  it("đúng khoá nhưng sai nơi vẫn 404 — địa chỉ được kiểm TRƯỚC khoá", () => {
    expect(verifyInternalRequest({ remoteAddress: "10.0.0.5", secretHeader: LONG_SECRET_A }).ok).toBe(false);
  });

  it("loopback nhưng sai khoá thì 401", () => {
    const verdict = verifyInternalRequest({ remoteAddress: "127.0.0.1", secretHeader: "sai-be-bet" });
    expect(verdict).toEqual({ ok: false, status: 401, reason: "bad-secret" });
  });

  it("loopback nhưng KHÔNG gửi header thì 401", () => {
    expect(verifyInternalRequest({ remoteAddress: "::1", secretHeader: undefined }).ok).toBe(false);
    expect(verifyInternalRequest({ remoteAddress: "::1", secretHeader: "" }).ok).toBe(false);
  });

  it("gửi AUTH_SESSION_SECRET thay vì INTERNAL_RPC_SECRET cũng bị chặn", () => {
    // Hồi quy cho chính lỗi cũ: khoá ký phiên KHÔNG còn là chìa của cửa nội bộ.
    process.env.AUTH_SESSION_SECRET = LONG_SECRET_B;
    expect(verifyInternalRequest({ remoteAddress: "127.0.0.1", secretHeader: LONG_SECRET_B }).ok).toBe(false);
  });

  it("loopback + đúng khoá thì qua", () => {
    expect(verifyInternalRequest({ remoteAddress: "::ffff:127.0.0.1", secretHeader: LONG_SECRET_A })).toEqual({
      ok: true,
    });
  });

  it("header lặp (mảng) lấy giá trị đầu, không ném lỗi", () => {
    expect(
      verifyInternalRequest({ remoteAddress: "127.0.0.1", secretHeader: [LONG_SECRET_A, "rác"] }).ok,
    ).toBe(true);
  });
});

describe("secretEquals", () => {
  it("so được hai chuỗi khác độ dài mà không ném lỗi", () => {
    expect(() => secretEquals("x", "xxxxxxxxxxxx")).not.toThrow();
    expect(secretEquals("x", "xxxxxxxxxxxx")).toBe(false);
  });

  it("giống nhau thì true", () => {
    expect(secretEquals(LONG_SECRET_A, LONG_SECRET_A)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. JWKS — kid phải là tên riêng của khoá
// ---------------------------------------------------------------------------

describe("keys — kid theo thumbprint RFC 7638", () => {
  it("hai khoá KHÁC nhau không bao giờ trùng kid (lỗi cũ: cả hai đều là 'dev-1')", async () => {
    const [a, b] = await Promise.all([makePrivateJwk(), makePrivateJwk()]);
    const [ka] = await normalizeJwks(a);
    const [kb] = await normalizeJwks(b);
    expect(ka!.kid).not.toBe(kb!.kid);
    expect(ka!.kid).not.toBe("dev-1");
  });

  it("CÙNG một khoá luôn ra CÙNG một kid — nạp lại bao nhiêu lần cũng vậy", async () => {
    const jwk = await makePrivateJwk();
    const [first] = await normalizeJwks(structuredClone(jwk));
    const [second] = await normalizeJwks(structuredClone(jwk));
    expect(first!.kid).toBe(second!.kid);
  });

  it("kid do người vận hành tự khai bị GHI ĐÈ — không ai đặt tay được nữa", async () => {
    const jwk = await makePrivateJwk();
    const [normalized] = await normalizeJwks({ ...jwk, kid: "dev-1" });
    expect(normalized!.kid).not.toBe("dev-1");
    expect(normalized!.kid).toBe(await kidFor({ ...jwk, alg: "RS256", use: "sig" }));
  });

  it("gắn alg/use để RP không phải đoán", async () => {
    const [normalized] = await normalizeJwks(await makePrivateJwk());
    expect(normalized!.alg).toBe("RS256");
    expect(normalized!.use).toBe("sig");
  });

  it("nhận cả ba dạng khai báo: một JWK, mảng JWK, {keys:[...]}", async () => {
    const jwk = await makePrivateJwk();
    expect(await normalizeJwks(structuredClone(jwk))).toHaveLength(1);
    expect(await normalizeJwks([structuredClone(jwk)])).toHaveLength(1);
    expect(await normalizeJwks({ keys: [structuredClone(jwk)] })).toHaveLength(1);
  });

  it("khoá CÔNG KHAI (thiếu phần riêng) bị từ chối — ký bằng nó là không ký được", async () => {
    const jwk = await makePrivateJwk();
    delete jwk.d;
    await expect(normalizeJwks(jwk)).rejects.toThrow(/RSA/);
  });

  it("danh sách rỗng bị từ chối", async () => {
    await expect(normalizeJwks([])).rejects.toThrow(/rỗng/);
  });

  it("hai bản sao cùng một khoá bị từ chối — trùng kid là đúng thứ đang vá", async () => {
    const jwk = await makePrivateJwk();
    await expect(normalizeJwks([structuredClone(jwk), structuredClone(jwk)])).rejects.toThrow(/trùng/);
  });
});

describe("keys — nguồn khoá và tính ổn định qua các lần khởi động", () => {
  let devDir: string;

  beforeEach(() => {
    devDir = mkdtempSync(join(tmpdir(), "hub-oidc-key-"));
    process.env.OIDC_DEV_KEY_FILE = join(devDir, "signing.key");
  });

  afterEach(() => {
    rmSync(devDir, { recursive: true, force: true });
  });

  it("PRODUCTION thiếu khoá thì ném lỗi — không sinh khoá tạm", async () => {
    process.env.NODE_ENV = "production";
    await expect(loadSigningKeys()).rejects.toThrow(/OIDC_JWKS/);
  });

  it("dev: khởi động lại tiến trình KHÔNG làm đổi kid (lỗi cũ: đổi khoá, giữ nguyên kid)", async () => {
    const first = await loadSigningKeys();
    expect(first.source).toBe("dev-file");

    resetSigningKeysForTest(); // ~ khởi động lại tiến trình
    const second = await loadSigningKeys();

    expect(second.source).toBe("dev-file");
    expect(second.activeKid).toBe(first.activeKid);
    expect(second.jwks[0]!.n).toBe(first.jwks[0]!.n); // đúng khoá cũ, không phải khoá mới
  });

  it("token ký trước khi khởi động lại vẫn verify được sau khi khởi động lại", async () => {
    const before = await loadSigningKeys();
    const token = await buildLogoutToken({
      issuer: "https://hub.test",
      clientId: "factory",
      userId: "11111111-1111-4111-8111-111111111111",
      key: before.activeKey,
      kid: before.activeKid,
    });

    resetSigningKeysForTest();
    const after = await loadSigningKeys();

    // Đúng kịch bản của RP: tra JWKS theo kid trong header rồi verify.
    await expect(verifyWithJwks(token, after.jwks, { issuer: "https://hub.test" })).resolves.toBeTruthy();
  });

  it("JWKS công bố ra ngoài KHÔNG mang phần riêng của khoá", async () => {
    const keys = await loadSigningKeys();
    const published = toPublicJwk(keys.jwks[0]!);
    // `d` là trường ai cũng nhớ; `p`/`q` mới là chỗ dễ quên — từ chúng dựng lại được `d`.
    for (const field of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(published, field).not.toHaveProperty(field);
    }
    expect(published.n).toBeTruthy(); // vẫn còn phần công khai để verify
    expect(published.kid).toBe(keys.activeKid);
  });

  it("khoá tự verify được bằng chính JWKS sắp công bố (tự kiểm lúc khởi động)", async () => {
    // Nếu bước tự kiểm trong keys.ts hỏng, loadSigningKeys() đã ném lỗi trước dòng này.
    await expect(loadSigningKeys()).resolves.toMatchObject({ source: "dev-file" });
  });

  it("OIDC_JWKS trong env thắng khoá dev, và công bố ĐỦ mọi khoá để token cũ còn verify được", async () => {
    const [a, b] = await Promise.all([makePrivateJwk(), makePrivateJwk()]);
    process.env.OIDC_JWKS = JSON.stringify({ keys: [a, b] });

    const keys = await loadSigningKeys();
    expect(keys.source).toBe("env-jwks");
    expect(keys.jwks).toHaveLength(2); // khoá cũ vẫn được công bố — xoay khoá không gãy
    expect(keys.activeKid).toBe(keys.jwks[0]!.kid); // khoá ĐẦU là khoá đang ký
  });

  it("OIDC_JWKS không phải JSON thì báo lỗi rõ ràng, không im lặng rơi về khoá tạm", async () => {
    process.env.OIDC_JWKS = "{khong-phai-json";
    await expect(loadSigningKeys()).rejects.toThrow(/OIDC_JWKS/);
  });
});

// ---------------------------------------------------------------------------
// 3. logout_token
// ---------------------------------------------------------------------------

describe("logout_token", () => {
  // Bộ khoá dựng tay, không qua loadSigningKeys — cố ý, để phần này kiểm ĐÚNG hình dạng
  // token chứ không kiểm luôn cả đường nạp khoá.
  let jwks: Awaited<ReturnType<typeof normalizeJwks>>;
  let key: Awaited<ReturnType<typeof importSigningKey>>;
  let kid: string;

  beforeEach(async () => {
    jwks = await normalizeJwks(await makePrivateJwk());
    kid = jwks[0]!.kid!;
    key = await importSigningKey(jwks[0]!);
  });

  const base = () => ({
    issuer: "https://hub.truongvietanh.com",
    clientId: "factory",
    userId: "22222222-2222-4222-8222-222222222222",
    key,
    kid,
  });

  it("CÓ claim exp (lỗi cũ: thiếu hẳn — token dùng lại được vĩnh viễn)", async () => {
    const token = await buildLogoutToken(base());
    const payload = await verifyWithJwks(token, jwks, { issuer: base().issuer });

    expect(payload.exp).toBeDefined();
    expect(payload.exp! - payload.iat!).toBe(LOGOUT_TOKEN_TTL_SECONDS);
  });

  it("hết hạn thì RP từ chối", async () => {
    const longAgo = Date.now() - (LOGOUT_TOKEN_TTL_SECONDS + 60) * 1000;
    const token = await buildLogoutToken({ ...base(), now: longAgo });
    await expect(verifyWithJwks(token, jwks)).rejects.toThrow(/exp/i);
  });

  it("kid trong header là kid THẬT của khoá, không phải 'dev-1'", async () => {
    const token = await buildLogoutToken(base());
    const header = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"));
    expect(header.kid).toBe(kid);
    expect(header.kid).not.toBe("dev-1");
    expect(header.alg).toBe("RS256");
    expect(header.typ).toBe("logout+jwt");
  });

  it("mang đủ iss/aud/sub/jti/events theo Back-Channel Logout 1.0 §2.4", async () => {
    const token = await buildLogoutToken(base());
    const payload = await verifyWithJwks(token, jwks, { issuer: base().issuer, audience: "factory" });

    expect(payload.sub).toBe(base().userId);
    expect(payload.jti).toBeTruthy();
    expect(payload.events).toEqual({ [BACKCHANNEL_LOGOUT_EVENT]: {} });
    expect(payload.nonce).toBeUndefined(); // §2.6 CẤM có nonce
  });

  it("mỗi lần ký một jti khác — RP chống phát lại được", async () => {
    const [t1, t2] = await Promise.all([buildLogoutToken(base()), buildLogoutToken(base())]);
    const p1 = await verifyWithJwks(t1, jwks);
    const p2 = await verifyWithJwks(t2, jwks);
    expect(p1.jti).not.toBe(p2.jti);
  });

  it("RP đang giữ JWKS CŨ thì verify hỏng — đây chính xác là triệu chứng của lỗi kid cũ", async () => {
    // Trước bản vá: khoá mới, kid vẫn "dev-1" → RP tưởng có khoá rồi, không tải lại JWKS,
    // verify bằng khoá cũ, chữ ký sai, không có tín hiệu nào để tự sửa.
    // Sau bản vá: kid lạ → RP biết ngay phải tải lại JWKS.
    const staleJwks = await normalizeJwks(await makePrivateJwk());
    const token = await buildLogoutToken(base());
    await expect(verifyWithJwks(token, staleJwks)).rejects.toThrow(/kid/);
  });
});

// ---------------------------------------------------------------------------
// 4. Đăng xuất chiều ngược (RP → Hub)
// ---------------------------------------------------------------------------

describe("đăng xuất do app ngoài khởi xướng", () => {
  it("xoá cookie hub_session thật sự (Max-Age=0 + Expires quá khứ)", () => {
    const header = clearHubSessionCookie();
    expect(header).toMatch(/^hub_session=;/);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("giữ nguyên Path và HttpOnly của cookie gốc — sai Path là trình duyệt không ghi đè", () => {
    const header = clearHubSessionCookie();
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
  });

  it("trang xen giữa gửi logout=yes — thiếu trường này là 'ở lại, đừng đăng xuất'", () => {
    const page = autoSubmitLogoutPage('<form id="op.logoutForm" method="post" action="/x"></form>');
    expect(page).toContain('name="logout" value="yes"');
    expect(page).toContain('form="op.logoutForm"');
  });

  it("nhúng nguyên form của thư viện (chứa token xsrf) và tự gửi", () => {
    const form = '<form id="op.logoutForm" method="post" action="/oidc/session/end/confirm"><input type="hidden" name="xsrf" value="abc"></form>';
    const page = autoSubmitLogoutPage(form);
    expect(page).toContain(form);
    expect(page).toContain("submit()");
  });

  it("có đường thoát cho trình duyệt tắt JavaScript", () => {
    const page = autoSubmitLogoutPage("<form id=\"op.logoutForm\"></form>");
    expect(page).toContain("<noscript>");
  });
});

// ---------------------------------------------------------------------------
// 4b. Provider thật, qua HTTP thật
//
// Ba ca dưới đây dựng Provider và bắn request thật vào nó. Đắt hơn test hàm thuần, nhưng
// là cách DUY NHẤT bắt được lớp lỗi "cấu hình đúng trên giấy, thư viện lại đi nhánh khác":
// đúng lúc viết bản vá này, `logoutSource` đo ra là KHÔNG chạy khi chưa có phiên OIDC —
// nếu chỉ test hàm thuần thì bản vá đã trông như xanh trong khi cookie không hề bị xoá.
// ---------------------------------------------------------------------------

describe("provider thật — kiểm qua HTTP", () => {
  let server: Server;
  let base: string;
  let keys: SigningKeySet;
  let keyDir: string;

  beforeAll(async () => {
    keyDir = mkdtempSync(join(tmpdir(), "hub-oidc-http-"));
    process.env.OIDC_DEV_KEY_FILE = join(keyDir, "signing.key");
    process.env.AUTH_SESSION_SECRET = "h".repeat(40);
    delete process.env.NODE_ENV;

    // Nạp động: provider.ts đọc khoá/secret lúc import + lúc dựng, nên phải đặt env trước.
    const { getProvider } = await import("@/server/oidc/provider");
    const provider = (await getProvider()) as { callback(): (req: unknown, res: unknown) => void };
    keys = await loadSigningKeys();

    server = createServer(provider.callback() as never);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(keyDir, { recursive: true, force: true });
  });

  it("/oidc/jwks công bố kid thumbprint và KHÔNG kèm phần riêng của khoá", async () => {
    const res = await fetch(`${base}/oidc/jwks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Record<string, unknown>[] };

    expect(body.keys[0]!.kid).toBe(keys.activeKid);
    expect(body.keys[0]!.kid).not.toBe("dev-1");
    for (const field of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(body.keys[0]![field], field).toBeUndefined();
    }
  });

  it("discovery quảng cáo đúng những gì 03-api.md hứa (refresh_token, back-channel logout)", async () => {
    const meta = (await (await fetch(`${base}/.well-known/openid-configuration`)).json()) as Record<
      string,
      unknown
    >;

    expect(meta.end_session_endpoint).toContain("/oidc/session/end");
    // Lỗi cũ: tài liệu hứa có refresh, code chỉ khai authorization_code.
    expect(meta.grant_types_supported).toContain("refresh_token");
    expect(meta.scopes_supported).toContain("offline_access");
    expect(meta.backchannel_logout_supported).toBe(true);
  });

  it("/oidc/session/end LUÔN kèm Set-Cookie xoá hub_session — đăng xuất hai chiều", async () => {
    const res = await fetch(`${base}/oidc/session/end`, { redirect: "manual" });
    const cookies = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).join("|");

    // Ca này chạy ở nhánh "chưa có phiên OIDC" — chính nhánh mà `logoutSource` bị thư
    // viện bỏ qua. Cookie vẫn phải bị xoá, vì middleware bám theo đường dẫn.
    expect(cookies).toContain("hub_session=");
    expect(cookies).toContain("Max-Age=0");
    expect(cookies).toContain("HttpOnly");
  });
});

// ---------------------------------------------------------------------------
// 5. Mã mời phụ huynh
// ---------------------------------------------------------------------------

describe("normalizeInviteCode", () => {
  it("chuẩn hoá hoa/thường — nếu không thì đổi kiểu gõ là có thêm lượt thử miễn phí", () => {
    // Hàm SQL 0013 gọi upper(p_code): "abc123" và "ABC123" là CÙNG một mã.
    expect(normalizeInviteCode("abc123")).toBe("ABC123");
    expect(normalizeInviteCode("AbC123")).toBe("ABC123");
  });

  it("bỏ khoảng trắng thừa hai đầu (dán từ Zalo hay dính dấu cách)", () => {
    expect(normalizeInviteCode("  ABC123  ")).toBe("ABC123");
  });

  it("từ chối mọi thứ không thể là mã — chặn trước khi chạm cơ sở dữ liệu", () => {
    for (const bad of ["", "ABC12", "ABC1234", "!!!!!!", "      ", "ABC-12", "ĐBC123"]) {
      expect(normalizeInviteCode(bad), bad).toBeNull();
    }
  });
});

describe("inviteCodeFingerprint", () => {
  it("KHÔNG lộ mã trần — audit log có nhiều người đọc hơn bảng mã mời", () => {
    const fp = inviteCodeFingerprint("ABC123");
    expect(fp).not.toContain("ABC123");
    expect(fp).toHaveLength(8);
  });

  it("cùng mã ra cùng vân tay, khác mã ra khác vân tay", () => {
    expect(inviteCodeFingerprint("ABC123")).toBe(inviteCodeFingerprint("ABC123"));
    expect(inviteCodeFingerprint("ABC123")).not.toBe(inviteCodeFingerprint("ABC124"));
  });
});

describe("khoá brute-force theo mã", () => {
  const t0 = 1_800_000_000_000;

  it("mã chưa ai thử thì mở", () => {
    expect(checkInviteCode("ABC123", t0)).toEqual({ locked: false, failures: 0, retryAfterSeconds: 0 });
  });

  it("sai đủ N lần thì treo", () => {
    for (let i = 0; i < INVITE_CODE_MAX_FAILURES; i++) {
      expect(checkInviteCode("ABC123", t0).locked, `lần thử ${i + 1}`).toBe(false);
      recordInviteFailure("ABC123", t0 + i);
    }
    const verdict = checkInviteCode("ABC123", t0 + INVITE_CODE_MAX_FAILURES);
    expect(verdict.locked).toBe(true);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("treo chỉ áp cho ĐÚNG mã đó — không đá nhầm phụ huynh khác", () => {
    for (let i = 0; i < INVITE_CODE_MAX_FAILURES; i++) recordInviteFailure("ABC123", t0);
    expect(checkInviteCode("ABC123", t0).locked).toBe(true);
    expect(checkInviteCode("XYZ789", t0).locked).toBe(false);
  });

  it("hết cửa sổ treo thì mở lại — phụ huynh gõ nhầm không mất buổi", () => {
    for (let i = 0; i < INVITE_CODE_MAX_FAILURES; i++) recordInviteFailure("ABC123", t0);
    expect(checkInviteCode("ABC123", t0 + INVITE_CODE_LOCK_MS - 1).locked).toBe(true);
    expect(checkInviteCode("ABC123", t0 + INVITE_CODE_LOCK_MS).locked).toBe(false);
  });

  it("bắn liên tục thì cửa KHÔNG mở lại — đồng hồ tính từ lần sai gần nhất", () => {
    for (let i = 0; i < INVITE_CODE_MAX_FAILURES; i++) recordInviteFailure("ABC123", t0);
    // Kẻ dò tiếp tục bắn ngay trước mỗi lần hết hạn.
    let now = t0;
    for (let i = 0; i < 5; i++) {
      now += INVITE_CODE_LOCK_MS - 1000;
      recordInviteFailure("ABC123", now);
    }
    expect(checkInviteCode("ABC123", now + 1000).locked).toBe(true);
  });

  it("thành công thì xoá bộ đếm — §9 cho phép đổi lại cùng một mã (retry mạng, bấm đúp)", () => {
    recordInviteFailure("ABC123", t0);
    recordInviteFailure("ABC123", t0);
    clearInviteFailures("ABC123");
    expect(checkInviteCode("ABC123", t0)).toEqual({ locked: false, failures: 0, retryAfterSeconds: 0 });
  });

  it("bộ đếm cộng dồn đúng số lần", () => {
    expect(recordInviteFailure("ABC123", t0)).toBe(1);
    expect(recordInviteFailure("ABC123", t0 + 1)).toBe(2);
    expect(recordInviteFailure("ABC123", t0 + 2)).toBe(3);
  });

  it("sai lẻ tẻ cách nhau quá cửa sổ thì đếm lại từ đầu, không cộng dồn vô hạn", () => {
    expect(recordInviteFailure("ABC123", t0)).toBe(1);
    expect(recordInviteFailure("ABC123", t0 + INVITE_CODE_LOCK_MS + 1)).toBe(1);
  });
});
