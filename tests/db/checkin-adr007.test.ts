// tests/db/checkin-adr007.test.ts
//
// ADR-007 (chống gian lận điểm danh) được cài ở migration 0027, nhưng cho tới
// 31/07/2026 router `checkin.submitMood` vẫn ghi cứng `status='present', source='app'`
// cho MỌI lần bấm — nghĩa là luật nằm trong cơ sở dữ liệu mà không đường nào gọi tới.
//
// Hậu quả đo được trước khi nối: em bấm check-in lúc 11 giờ trưa từ nhà vẫn được ghi
// "có mặt đúng giờ", và hai thẻ "Chờ xác nhận"/"Vắng" trên buồng lái GVCN luôn bằng 0
// — không phải vì lớp đi học đủ, mà vì không có gì sinh ra `queued_late`.
//
// Test này gọi thẳng `attendance.resolve_checkin` (đúng hàm router vừa được nối vào)
// để khoá lại bốn nhánh quyết định của nó.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, databaseAvailable, seedPresent, FIXTURE } from "../helpers/db";

let ready = false;
let hadRule = false;

const CAMPUS_IP = "10.10.0.5";
const OUTSIDE_IP = "203.0.113.7";

beforeAll(async () => {
  ready = (await databaseAvailable()) && (await seedPresent());
  if (!ready) return;

  // Cơ sở Q7 có thể chưa khai luật nào — dựng một bộ luật để test bốn nhánh.
  hadRule = await asSystem(async (c) => {
    const r = await c.query<{ n: string }>(
      "select count(*)::text as n from attendance.checkin_rules where school_id = $1 and active",
      [FIXTURE.schoolQ7],
    );
    return Number(r.rows[0]!.n) > 0;
  });

  if (!hadRule) {
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkin_rules (school_id, opens_at, closes_at, campus_cidrs, active)
         values ($1, '06:45', '07:30', array['10.10.0.0/16']::cidr[], true)`,
        [FIXTURE.schoolQ7],
      ),
    );
  }
});

afterAll(async () => {
  if (ready && !hadRule) {
    await asSystem((c) =>
      c.query("delete from attendance.checkin_rules where school_id = $1", [FIXTURE.schoolQ7]),
    );
  }
});

/** Gọi đúng hàm mà router gọi. */
function resolve(clientAt: string, ip: string | null, fromQueue: boolean) {
  return asSystem(async (c) => {
    const r = await c.query<{
      occurred_on: string;
      status: string;
      source: string;
      rejected_reason: string | null;
    }>(`select occurred_on::text as occurred_on, status, source, rejected_reason
           from attendance.resolve_checkin($1::uuid, $2::timestamptz, $3::inet, $4::boolean)`, [
      FIXTURE.studentMinh,
      clientAt,
      ip,
      fromQueue,
    ]);
    return r.rows[0]!;
  });
}

/** Hôm nay lúc HH:mm theo giờ Việt Nam, dạng ISO có offset. */
function todayAt(hhmm: string): string {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600_000);
  const d = vn.toISOString().slice(0, 10);
  return `${d}T${hhmm}:00+07:00`;
}

describe("ADR-007 · phân loại check-in đọc luật từ bảng, không viết cứng trong code", () => {
  it("trong trường, trong khung giờ → có mặt", async ({ skip }) => {
    if (!ready) return skip();
    const r = await resolve(todayAt("07:00"), CAMPUS_IP, false);
    expect(r.status).toBe("present");
    expect(r.source).toBe("app");
    expect(r.rejected_reason).toBeNull();
  });

  it("trong trường nhưng quá giờ đóng cổng → muộn, KHÔNG phải vắng", async ({ skip }) => {
    if (!ready) return skip();
    const r = await resolve(todayAt("11:00"), CAMPUS_IP, false);
    expect(r.status).toBe("late");
  });

  it("NGOÀI dải IP trường → chờ GVCN xác nhận, không tự tính chuyên cần", async ({ skip }) => {
    if (!ready) return skip();
    const r = await resolve(todayAt("07:00"), OUTSIDE_IP, false);
    expect(r.status).toBe("queued_late");
  });

  it("không đọc được IP → cũng chờ xác nhận, KHÔNG kết luận vắng", async ({ skip }) => {
    if (!ready) return skip();
    // Người lớn cấu hình thiếu (proxy không gắn header) thì không được phạt đứa trẻ.
    const r = await resolve(todayAt("07:00"), null, false);
    expect(r.status).toBe("queued_late");
  });

  it("check-in trực tiếp lấy ngày của MÁY CHỦ, không tin đồng hồ máy em", async ({ skip }) => {
    if (!ready) return skip();
    // Máy em bị chỉnh lùi 3 ngày để "check-in bù" cho hôm trước.
    const threeDaysAgo = new Date(Date.now() - 3 * 86400_000).toISOString();
    const r = await resolve(threeDaysAgo, CAMPUS_IP, false);
    const today = await asSystem(async (c) => {
      const x = await c.query<{ d: string }>("select current_date::text as d");
      return x.rows[0]!.d;
    });
    expect(r.occurred_on).toBe(today);
  });

  it("bản gửi bù từ hàng đợi offline GIỮ ngày thật của máy em", async ({ skip }) => {
    if (!ready) return skip();
    // Đây là lý do tồn tại của cả hàng đợi: em bấm thứ Sáu thì phải nằm ở thứ Sáu,
    // dù máy nối mạng lại vào thứ Hai.
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000);
    const r = await resolve(twoDaysAgo.toISOString(), CAMPUS_IP, true);
    expect(r.status).toBe("queued_late");
    expect(r.source).toBe("offline_queue");
    expect(r.occurred_on).not.toBe(
      await asSystem(async (c) => {
        const x = await c.query<{ d: string }>("select current_date::text as d");
        return x.rows[0]!.d;
      }),
    );
  });

  it("bản gửi bù mang ngày TƯƠNG LAI bị từ chối", async ({ skip }) => {
    if (!ready) return skip();
    const tomorrow = new Date(Date.now() + 86400_000).toISOString();
    const r = await resolve(tomorrow, CAMPUS_IP, true);
    expect(r.rejected_reason).toBe("ngay_o_tuong_lai");
  });

  it("bản gửi bù quá cũ bị từ chối", async ({ skip }) => {
    if (!ready) return skip();
    const longAgo = new Date(Date.now() - 90 * 86400_000).toISOString();
    const r = await resolve(longAgo, CAMPUS_IP, true);
    expect(r.rejected_reason).toBe("ngay_qua_cu");
  });
});
