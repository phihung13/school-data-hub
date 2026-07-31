// tests/unit/rate-limit.test.ts
//
// Giới hạn tốc độ là thứ chỉ lộ ra khi bị đẩy tới ranh giới — mà ranh giới đó lại là
// con số đã duyệt trong 03-api.md (60 req/phút, checkin ghi 10 req/phút). Test này
// khoá cả ba tính chất: chặn đúng ngưỡng, hồi lại theo thời gian, và tách khoá theo
// từng người + từng procedure (một em bấm nhiều không được làm cả trường bị chặn).
import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  limitForTrpcCall,
  rateLimit,
  resetRateLimits,
  RATE_LIMITS,
} from "@/lib/rate-limit";

const T0 = 1_800_000_000_000; // mốc thời gian giả, cố định để test không phụ thuộc đồng hồ

beforeEach(() => {
  resetRateLimits();
});

describe("token bucket", () => {
  it("cho qua đúng `limit` lượt rồi chặn lượt kế tiếp", () => {
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit("u1:care.getDashboard", 60, T0).allowed).toBe(true);
    }
    const blocked = checkRateLimit("u1:care.getDashboard", 60, T0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("bắn 70 lượt dồn một lúc thì đúng 10 lượt bị chặn", () => {
    let blocked = 0;
    for (let i = 0; i < 70; i++) {
      if (!checkRateLimit("u2:report.get", 60, T0).allowed) blocked++;
    }
    expect(blocked).toBe(10);
  });

  it("60 lượt/phút RẢI ĐỀU thì không bị chặn — đúng chủ ý của token bucket", () => {
    // Khác cửa sổ cố định: bình hồi liên tục, nên một người dùng thật (mở trang, bấm
    // vài nút, đợi vài giây) không bao giờ chạm trần; chỉ vòng lặp tự động mới chạm.
    let blocked = 0;
    for (let i = 0; i < 120; i++) {
      if (!checkRateLimit("u5:steady", 60, T0 + i * 1_000).allowed) blocked++;
    }
    expect(blocked).toBe(0);
  });

  it("chờ hết một phút thì bình đầy lại", () => {
    for (let i = 0; i < 60; i++) checkRateLimit("u3:x", 60, T0);
    expect(checkRateLimit("u3:x", 60, T0).allowed).toBe(false);
    expect(checkRateLimit("u3:x", 60, T0 + 60_000).allowed).toBe(true);
  });

  it("hồi dần chứ không đợi hết phút mới mở — 1 token mỗi giây ở hạn mức 60", () => {
    for (let i = 0; i < 60; i++) checkRateLimit("u4:x", 60, T0);
    expect(checkRateLimit("u4:x", 60, T0 + 500).allowed).toBe(false);
    expect(checkRateLimit("u4:x", 60, T0 + 1_100).allowed).toBe(true);
  });

  it("khoá khác nhau đếm riêng — người này bị chặn không kéo theo người kia", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("minh:checkin.submitMood", 10, T0);
    expect(checkRateLimit("minh:checkin.submitMood", 10, T0).allowed).toBe(false);
    expect(checkRateLimit("binh:checkin.submitMood", 10, T0).allowed).toBe(true);
    expect(checkRateLimit("minh:checkin.getTodayStatus", 60, T0).allowed).toBe(true);
  });
});

describe("hạn mức theo procedure (03-api.md luật endpoint 5)", () => {
  it("mutation của checkin siết 10 req/phút", () => {
    expect(limitForTrpcCall("checkin.submitMood", "mutation")).toBe(RATE_LIMITS.checkinMutation);
    expect(limitForTrpcCall("checkin.requestHelp", "mutation")).toBe(10);
  });

  it("truy vấn đọc của checkin vẫn ở hạn mức thường — mở một trang có thể gọi vài cái", () => {
    expect(limitForTrpcCall("checkin.getTodayStatus", "query")).toBe(RATE_LIMITS.default);
  });

  it("mọi procedure khác dùng hạn mức mặc định 60", () => {
    expect(limitForTrpcCall("care.getDashboard", "query")).toBe(60);
    expect(limitForTrpcCall("care.logIntervention", "mutation")).toBe(60);
  });
});

describe("helper rateLimit() cho route handler", () => {
  it("dựng khoá từ chính đối tượng request", () => {
    const limiter = rateLimit((ip: string) => `invite:${ip}`, RATE_LIMITS.inviteCode);
    for (let i = 0; i < RATE_LIMITS.inviteCode; i++) {
      expect(limiter("1.2.3.4", T0).allowed).toBe(true);
    }
    expect(limiter("1.2.3.4", T0).allowed).toBe(false);
    // IP khác vẫn thử được — chặn theo nguồn, không chặn cả cổng.
    expect(limiter("5.6.7.8", T0).allowed).toBe(true);
  });
});
