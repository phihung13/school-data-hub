// tests/db/care-thresholds.test.ts
//
// Mệnh lệnh 7 (CLAUDE.md): ngưỡng cảnh báo phải đọc từ bảng care.thresholds, đổi
// ngưỡng KHÔNG cần deploy. Test này chứng minh luật đó có hiệu lực thật: sửa số
// trong bảng rồi đọc lại phải thấy số mới, không phải số viết chết trong code.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, databaseAvailable } from "../helpers/db";
import { readEmotionThreshold, EMOTION_FALLBACK } from "@/server/care-thresholds";

let ready = false;
let original: unknown = null;

beforeAll(async () => {
  ready = await databaseAvailable();
  if (ready) {
    original = await asSystem(async (c) => {
      const r = await c.query<{ params: unknown }>(
        "select params from care.thresholds where rule_code = 'E_MOOD'",
      );
      return r.rows[0]?.params ?? null;
    });
  }
});

afterAll(async () => {
  if (ready && original) {
    await asSystem((c) =>
      c.query("update care.thresholds set params = $1, active = true where rule_code = 'E_MOOD'", [
        JSON.stringify(original),
      ]),
    );
  }
});

describe("mệnh lệnh 7 · ngưỡng đọc từ bảng, không viết chết trong code", () => {
  it("đọc đúng giá trị đang có trong care.thresholds", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `update care.thresholds
            set params = '{"negative_days_streak": 7, "window_days": 21}'::jsonb, active = true
          where rule_code = 'E_MOOD'`,
      ),
    );
    const t = await asSystem((c) => readEmotionThreshold(c));
    expect(t).toEqual({ negativeDays: 7, windowDays: 21 });
  });

  it("đổi số trong bảng thì lần đọc sau thấy số mới — không cần deploy lại", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `update care.thresholds
            set params = '{"negative_days_streak": 2, "window_days": 5}'::jsonb
          where rule_code = 'E_MOOD'`,
      ),
    );
    const t = await asSystem((c) => readEmotionThreshold(c));
    expect(t.negativeDays).toBe(2);
    expect(t.windowDays).toBe(5);
  });

  it("ngưỡng bị tắt (active = false) thì rơi về giá trị dự phòng, không làm sập buồng lái", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query("update care.thresholds set active = false where rule_code = 'E_MOOD'"),
    );
    const t = await asSystem((c) => readEmotionThreshold(c));
    expect(t).toEqual(EMOTION_FALLBACK);
  });

  it("params rác (số âm, chuỗi) không lọt vào câu truy vấn", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `update care.thresholds
            set params = '{"negative_days_streak": -3, "window_days": "abc"}'::jsonb, active = true
          where rule_code = 'E_MOOD'`,
      ),
    );
    const t = await asSystem((c) => readEmotionThreshold(c));
    expect(t).toEqual(EMOTION_FALLBACK); // rác bị loại, dùng dự phòng
  });
});
