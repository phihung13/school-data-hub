// tests/unit/session-token.test.ts
//
// Khoá lại hợp đồng của phiên đăng nhập — thứ mà mọi lớp phân quyền phía sau đứng lên:
// nếu token giả mạo được, hoặc sống lâu hơn cam kết, thì RLS và ma trận vai chỉ còn là
// trang trí. Ba con số bị khoá ở đây là ba lời hứa đã duyệt:
//   · 15 phút  — tuổi thọ token (ADR-016 / RULES Rev F điều 7)
//   · 12 giờ   — trần tuyệt đối của một phiên, gia hạn trượt không vượt qua được
//   · ≥32 ký tự— độ dài tối thiểu của AUTH_SESSION_SECRET
//
// Import THẲNG session.ts thay vì "@hub/core/auth-adapter": index của adapter kéo theo
// dev-provider → db/client → `pg`. Đây là test THUẦN (tests/unit) nên không được đụng
// tới tầng CSDL, kể cả chỉ là nạp module.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  shouldRenewSession,
  peekSessionDeadlines,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  SESSION_ABSOLUTE_TTL_SECONDS,
  SESSION_RENEW_BEFORE_SECONDS,
} from "../../packages/core/auth-adapter/session.ts";

const SECRET = "a".repeat(48);
const OTHER_SECRET = "b".repeat(48);

const IDENTITY = {
  sub: "90000000-0000-0000-0000-000000000001",
  roles: ["homeroom" as const],
  displayName: "Cô Lan (GVCN 6A1)",
};

beforeEach(() => {
  vi.stubEnv("AUTH_SESSION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});

describe("token phiên đăng nhập", () => {
  it("đi và về giữ nguyên sub / roles / displayName", async () => {
    const token = await createSessionToken(IDENTITY);
    const claims = await verifySessionToken(token);

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe(IDENTITY.sub);
    expect(claims?.roles).toEqual(["homeroom"]);
    expect(claims?.displayName).toBe("Cô Lan (GVCN 6A1)");
  });

  it("sửa một ký tự trong token là hỏng chữ ký → null", async () => {
    const token = await createSessionToken(IDENTITY);

    // KHÔNG đổi ký tự CUỐI của chữ ký. Chữ ký HS256 dài 32 byte = 256 bit, mã hoá
    // base64url thành 43 ký tự = 258 bit — nên ký tự cuối chỉ mang 4 bit có nghĩa,
    // 2 bit còn lại là đệm. Đổi 'A'→'B' chỉ chạm bit đệm, giải ra ĐÚNG chuỗi byte
    // cũ, chữ ký vẫn hợp lệ và bài test "pass oan". Bản trước làm đúng như vậy nên
    // nó xanh hay đỏ tuỳ vào ký tự cuối ngẫu nhiên của từng lần ký (31/07/2026:
    // pass khi chạy một mình, fail khi chạy cả bộ — chỉ vì dấu thời gian khác đi).
    //
    // Sửa: đổi một ký tự ở GIỮA phần chữ ký, nơi mọi bit đều có nghĩa.
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const sig = parts[2]!;
    const at = Math.floor(sig.length / 2);
    const tamperedSig = sig.slice(0, at) + (sig[at] === "A" ? "B" : "A") + sig.slice(at + 1);
    expect(tamperedSig).not.toBe(sig);

    expect(await verifySessionToken(`${parts[0]}.${parts[1]}.${tamperedSig}`)).toBeNull();
  });

  it("token ký bằng secret khác → null (không nhận token của hệ khác)", async () => {
    const token = await createSessionToken(IDENTITY);

    vi.stubEnv("AUTH_SESSION_SECRET", OTHER_SECRET);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("quá 15 phút là hết hạn — khoá đúng con số của ADR-016", async () => {
    const base = new Date("2026-07-31T08:00:00+07:00").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(base);

    const token = await createSessionToken(IDENTITY);
    // 14 phút: vẫn còn hạn (nếu không, mọi phiên bình thường đã gãy).
    vi.setSystemTime(base + 14 * 60 * 1000);
    expect(await verifySessionToken(token)).not.toBeNull();

    // 16 phút: phải chết. Đây là ranh giới mà lớp gia hạn trượt tồn tại để phục vụ.
    vi.setSystemTime(base + 16 * 60 * 1000);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("AUTH_SESSION_SECRET 31 ký tự thì từ chối ký, không âm thầm dùng khoá yếu", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "a".repeat(31));
    await expect(createSessionToken(IDENTITY)).rejects.toThrow(/AUTH_SESSION_SECRET/);
  });

  it("thiếu hẳn AUTH_SESSION_SECRET cũng từ chối ký", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "");
    await expect(createSessionToken(IDENTITY)).rejects.toThrow(/AUTH_SESSION_SECRET/);
  });
});

describe("trần tuyệt đối 12 giờ", () => {
  it("gia hạn giữ NGUYÊN trần cũ — phiên không tự nối dài mãi", async () => {
    const base = new Date("2026-07-31T08:00:00+07:00").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(base);

    const first = await verifySessionToken(await createSessionToken(IDENTITY));
    expect(first?.absoluteExpiresAt).toBe(Math.floor(base / 1000) + SESSION_ABSOLUTE_TTL_SECONDS);

    // 11 giờ sau, mint lại đúng cách lớp gia hạn làm: truyền lại trần cũ.
    vi.setSystemTime(base + 11 * 60 * 60 * 1000);
    const renewed = await verifySessionToken(
      await createSessionToken({ ...IDENTITY, absoluteExpiresAt: first!.absoluteExpiresAt }),
    );
    expect(renewed?.absoluteExpiresAt).toBe(first?.absoluteExpiresAt);
  });

  it("token mint sát trần không sống quá trần", async () => {
    const base = new Date("2026-07-31T08:00:00+07:00").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(base);
    const nowSec = Math.floor(base / 1000);

    // Trần chỉ còn 60 giây: token phải hết hạn sau 60 giây, không phải 15 phút.
    const token = await createSessionToken({ ...IDENTITY, absoluteExpiresAt: nowSec + 60 });
    const claims = await verifySessionToken(token);
    expect(claims?.expiresAt).toBe(nowSec + 60);

    vi.setSystemTime(base + 61 * 1000);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("chuỗi gia hạn trượt dừng đúng ở mốc 12 giờ, không sống mãi", async () => {
    // Mô phỏng đúng vòng đời thật: cứ 10 phút middleware lại gọi /api/auth/refresh,
    // route đó mint token mới và truyền lại trần cũ. Đây là bài kiểm quan trọng nhất
    // của cả lớp gia hạn — nếu trần không cắn, một máy phòng máy dùng chung quên đăng
    // xuất là một cánh cửa mở vĩnh viễn.
    const base = new Date("2026-07-31T07:00:00+07:00").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(base);

    let token = await createSessionToken(IDENTITY);
    let renewals = 0;
    let deadAtMinute = -1;

    for (let minute = 10; minute <= 14 * 60; minute += 10) {
      vi.setSystemTime(base + minute * 60 * 1000);
      const claims = await verifySessionToken(token);
      if (!claims) {
        deadAtMinute = minute;
        break;
      }
      if (shouldRenewSession(claims)) {
        token = await createSessionToken({ ...IDENTITY, absoluteExpiresAt: claims.absoluteExpiresAt });
        renewals++;
      }
    }

    // Có gia hạn thật (nếu không, test này không chứng minh được gì).
    expect(renewals).toBeGreaterThan(60);
    // Và chết đúng ở mốc 12 giờ (trong vòng một nhịp 10 phút), không hơn.
    expect(deadAtMinute).toBeGreaterThanOrEqual(12 * 60);
    expect(deadAtMinute).toBeLessThanOrEqual(12 * 60 + 10);
  });
});

describe("quyết định gia hạn trượt", () => {
  const now = 1_800_000_000;

  it("còn trên 5 phút thì CHƯA gia hạn — không mint lại mỗi request", () => {
    expect(
      shouldRenewSession(
        { expiresAt: now + SESSION_RENEW_BEFORE_SECONDS + 30, absoluteExpiresAt: now + 3600 },
        now,
      ),
    ).toBe(false);
  });

  it("còn dưới 5 phút thì gia hạn", () => {
    expect(
      shouldRenewSession({ expiresAt: now + 60, absoluteExpiresAt: now + 3600 }, now),
    ).toBe(true);
  });

  it("đã quá trần tuyệt đối thì KHÔNG gia hạn, dù token còn hạn", () => {
    expect(shouldRenewSession({ expiresAt: now + 60, absoluteExpiresAt: now - 1 }, now)).toBe(false);
  });
});

describe("peekSessionDeadlines (đọc không xác minh, dùng ở middleware Edge)", () => {
  it("đọc ra đúng hai mốc mà verify đầy đủ trả về", async () => {
    const token = await createSessionToken(IDENTITY);
    const verified = await verifySessionToken(token);
    const peeked = peekSessionDeadlines(token);

    expect(peeked?.expiresAt).toBe(verified?.expiresAt);
    expect(peeked?.absoluteExpiresAt).toBe(verified?.absoluteExpiresAt);
    expect(peeked?.expiresAt).toBe((peeked?.absoluteExpiresAt ?? 0) - SESSION_ABSOLUTE_TTL_SECONDS + SESSION_TTL_SECONDS);
  });

  it("chuỗi rác không làm ném lỗi (middleware không được sập vì cookie hỏng)", () => {
    expect(peekSessionDeadlines("khong-phai-jwt")).toBeNull();
    expect(peekSessionDeadlines("")).toBeNull();
    expect(peekSessionDeadlines("a.b.c")).toBeNull();
  });
});

describe("cookie phiên", () => {
  it("ở production: secure + httpOnly bật, sameSite lax, maxAge đúng 15 phút", async () => {
    // SESSION_COOKIE.options.secure được tính lúc nạp module, nên phải nạp lại module
    // sau khi đặt NODE_ENV — nếu không thì test luôn chạy với giá trị của môi trường test.
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const mod = await import("../../packages/core/auth-adapter/session.ts");

    expect(mod.SESSION_COOKIE.options.secure).toBe(true);
    expect(mod.SESSION_COOKIE.options.httpOnly).toBe(true);
    expect(mod.SESSION_COOKIE.options.sameSite).toBe("lax");
    expect(mod.SESSION_COOKIE.options.maxAge).toBe(15 * 60);
    expect(mod.SESSION_COOKIE.options.path).toBe("/");
  });

  it("tên cookie và TTL là hằng số dùng chung, không viết lại ở nơi khác", () => {
    expect(SESSION_COOKIE.name).toBe("hub_session");
    expect(SESSION_TTL_SECONDS).toBe(15 * 60);
    expect(SESSION_ABSOLUTE_TTL_SECONDS).toBe(12 * 60 * 60);
  });
});
