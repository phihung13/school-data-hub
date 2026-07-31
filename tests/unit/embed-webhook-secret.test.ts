// tests/unit/embed-webhook-secret.test.ts
//
// Hồi quy cho lỗ hổng tìm được ngày 31/07/2026: khi biến môi trường secret của một
// app ngoài chưa được đặt, trường webhookSecret rơi về chuỗi rỗng, và phép so sánh
// `secret !== app.webhookSecret` cho kết quả "khớp" với một header rỗng. Nghĩa là
// bất kỳ ai biết app-id đều ghi được vào cổng nhận sự kiện.
//
// Test này khoá lại cả ba trạng thái mập mờ: chưa cấu hình, không gửi header, gửi rỗng.
import { describe, it, expect } from "vitest";
import { verifyWebhookSecret, type EmbedAppConfig } from "@/server/embed/registry";

const withSecret: EmbedAppConfig = {
  appId: "app-co-secret",
  webhookSecret: "secret-that-is-configured",
  basket: "xanh",
  allowedEventTypes: ["*"],
};

const withoutSecret: EmbedAppConfig = {
  appId: "app-chua-cap-secret",
  webhookSecret: undefined,
  basket: "xanh",
  allowedEventTypes: ["*"],
};

describe("xác thực webhook app ngoài", () => {
  it("secret đúng thì qua", () => {
    expect(verifyWebhookSecret(withSecret, "secret-that-is-configured")).toBe(true);
  });

  it("secret sai thì chặn", () => {
    expect(verifyWebhookSecret(withSecret, "sai-be-bet")).toBe(false);
  });

  it("không gửi header thì chặn", () => {
    expect(verifyWebhookSecret(withSecret, null)).toBe(false);
  });

  it("gửi header RỖNG thì chặn — đây chính là lỗ hổng cũ", () => {
    expect(verifyWebhookSecret(withSecret, "")).toBe(false);
  });

  it("app CHƯA cấu hình secret: cổng đóng hoàn toàn, kể cả khi gửi chuỗi rỗng", () => {
    expect(verifyWebhookSecret(withoutSecret, "")).toBe(false);
    expect(verifyWebhookSecret(withoutSecret, null)).toBe(false);
    expect(verifyWebhookSecret(withoutSecret, "bat-ky-gi")).toBe(false);
  });

  it("secret dài ngắn khác nhau không làm hàm ném lỗi (băm trước khi so)", () => {
    expect(() => verifyWebhookSecret(withSecret, "x")).not.toThrow();
    expect(verifyWebhookSecret(withSecret, "x".repeat(500))).toBe(false);
  });
});
