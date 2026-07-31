// apps/hub/server/care-thresholds.ts
//
// Mệnh lệnh 7 (CLAUDE.md) và §6 (04-flag-engine.md): KHÔNG hard-code ngưỡng cảnh
// báo — đọc từ bảng `care.thresholds`, để đổi ngưỡng không cần deploy.
//
// Trước 31/07/2026 luật này bị vi phạm: care.getDashboard viết chết `>= 3` ngày
// mood xấu trong cửa sổ `current_date - 14`, trong khi bảng ngưỡng khai
// E_MOOD = {"negative_days_streak": 5}. Hai con số khác nhau cùng tồn tại, và
// người sửa bảng ngưỡng sẽ tưởng mình vừa đổi hành vi hệ thống trong khi không.
//
// QUYẾT ĐỊNH NGHIỆP VỤ 31/07/2026 (chủ đầu tư chốt, không tự đổi):
// cờ E_MOOD bật khi có 5 ngày mood xấu LIÊN TIẾP — streak thật, không phải
// "5 ngày bất kỳ trong cửa sổ 14 ngày". Điểm chưa thống nhất ghi ở bản trước
// (tên tham số nói "streak" còn view lại đếm trong cửa sổ) vì thế đã đóng lại.
//
// Bảng ngưỡng vẫn khai được CẢ HAI cách đếm qua tham số `mode`
// ('streak' | 'window', 0026) — để lần sau đổi cách đếm chỉ là một câu UPDATE,
// không phải một lần sửa code. Mặc định là 'streak'.
import type { PoolClient } from "@hub/core/db";

/** Cách đếm ngày mood xấu. 'streak' = liên tiếp (mặc định), 'window' = bất kỳ trong cửa sổ. */
export type EmotionMode = "streak" | "window";

export interface EmotionRule {
  mode: EmotionMode;
  /** Số ngày mood xấu cần có để bật cờ (LIÊN TIẾP khi mode = 'streak'). */
  negativeDays: number;
  /** Độ dài cửa sổ nhìn lại, tính bằng ngày. */
  windowDays: number;
  /** Mood từ mức này trở xuống là "xấu" (1 = Buồn, 2 = Mệt). */
  badMoodMax: number;
  /** Vừa có can thiệp trong ngần này ngày thì cờ tụt xuống cuối danh sách. */
  quietDays: number;
}

export interface UrgentRule {
  /** Cửa sổ nhìn lại của tín hiệu "cần gặp thầy cô" — khác cửa sổ mood. */
  windowDays: number;
}

export interface CareRules {
  emotion: EmotionRule;
  urgent: UrgentRule;
}

/** Dùng khi bảng ngưỡng thiếu dòng hoặc dòng bị tắt — khớp giá trị seed trong 0005/0026. */
export const EMOTION_FALLBACK_RULE: EmotionRule = {
  mode: "streak",
  negativeDays: 5,
  windowDays: 14,
  badMoodMax: 2,
  quietDays: 7,
};

export const URGENT_FALLBACK: UrgentRule = { windowDays: 14 };

export interface EmotionThreshold {
  /** Số ngày mood xấu trong cửa sổ thì bật cờ. */
  negativeDays: number;
  /** Độ dài cửa sổ nhìn lại, tính bằng ngày. */
  windowDays: number;
}

/** Dùng khi bảng ngưỡng thiếu dòng hoặc dòng bị tắt — khớp giá trị seed trong 0005_care.sql. */
export const EMOTION_FALLBACK: EmotionThreshold = { negativeDays: 5, windowDays: 14 };

/**
 * Đọc trọn bộ ngưỡng của buồng lái trong MỘT lượt hỏi, qua `care.resolve_threshold`
 * (0026) chứ không tự viết câu select riêng — hàm đó là chỗ duy nhất biết luật
 * "dòng của cơ sở thắng dòng toàn hệ".
 *
 * KHÔNG ném lỗi khi bảng thiếu dòng: buồng lái phải mở được kể cả lúc cấu hình lỗi —
 * mất cờ còn hơn mất cả màn hình của giáo viên. Nhưng cũng không im lặng: ghi cảnh
 * báo ra log để còn biết đường sửa.
 */
export async function readCareRules(
  client: PoolClient,
  schoolId: string | null = null,
): Promise<CareRules> {
  const { rows } = await client.query<{
    e_mood: Record<string, unknown> | null;
    e_urgent: Record<string, unknown> | null;
  }>(
    `select care.resolve_threshold('E_MOOD', $1::uuid)   as e_mood,
            care.resolve_threshold('E_URGENT', $1::uuid) as e_urgent`,
    [schoolId],
  );

  const eMood = rows[0]?.e_mood ?? null;
  const eUrgent = rows[0]?.e_urgent ?? null;

  if (!eMood) {
    console.warn("[care] Thiếu ngưỡng E_MOOD đang bật trong care.thresholds — dùng giá trị dự phòng.");
  }

  return {
    emotion: {
      mode: toMode(eMood?.mode) ?? EMOTION_FALLBACK_RULE.mode,
      // `negative_days_streak` là tên có từ 0005; chấp nhận cả `negative_days` để dòng
      // ngưỡng do người sửa tay không bị bỏ qua âm thầm chỉ vì gõ thiếu hậu tố.
      negativeDays:
        toPositiveInt(eMood?.negative_days_streak ?? eMood?.negative_days) ??
        EMOTION_FALLBACK_RULE.negativeDays,
      windowDays: toPositiveInt(eMood?.window_days) ?? EMOTION_FALLBACK_RULE.windowDays,
      badMoodMax: toPositiveInt(eMood?.bad_mood_max) ?? EMOTION_FALLBACK_RULE.badMoodMax,
      quietDays: toPositiveInt(eMood?.quiet_days) ?? EMOTION_FALLBACK_RULE.quietDays,
    },
    urgent: {
      windowDays: toPositiveInt(eUrgent?.window_days) ?? URGENT_FALLBACK.windowDays,
    },
  };
}

/**
 * Bản rút gọn giữ nguyên chữ ký cũ (chỉ hai con số) — còn dùng cho các chỗ chỉ cần
 * "bao nhiêu ngày, trong cửa sổ bao lâu". Cùng đường phân tích tham số với
 * `readCareRules`, nên không có nguy cơ hai nơi đọc ra hai kết quả khác nhau.
 */
export async function readEmotionThreshold(client: PoolClient): Promise<EmotionThreshold> {
  const { emotion } = await readCareRules(client);
  return { negativeDays: emotion.negativeDays, windowDays: emotion.windowDays };
}

function toMode(value: unknown): EmotionMode | null {
  return value === "streak" || value === "window" ? value : null;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}
