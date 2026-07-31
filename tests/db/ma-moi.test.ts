// tests/db/ma-moi.test.ts — mã mời phụ huynh dùng MỘT LẦN (ADR-024, migration 0036).
//
// Vì sao có file này bên cạnh bài pgTAP: pgTAP chứng minh HÀM đúng, còn đây chứng
// minh ĐƯỜNG MÀ CỬA ĐĂNG NHẬP THẬT ĐI — `redeemInviteCode()` chạy bằng vai `anon`
// qua withAnonContext, rồi `resolveIdentity()` dựng danh tính để mint phiên. Lỗ
// hổng được vá nằm đúng ở đoạn nối đó: hàm SQL trả về một auth_uid, và phía trên
// biến nó thành cookie phiên phụ huynh. Chỉ test tầng SQL thì không ai chứng minh
// được là tầng trên còn gọi đúng hàm đó.
//
// Lỗ hổng (0013:56-60): mã 6 ký tự gửi qua Zalo trả lại phiên MỖI LẦN được nhập,
// suốt tới ngày hết hạn — ai cuộn lại tin nhắn cũ hoặc được forward cũng vào xem
// báo cáo của trẻ. Sau 0036: đổi được đúng một lần, cộng 15 phút nhắc lại cho
// retry mạng (§9), rồi mã chết.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { redeemInviteCode, resolveIdentity } from "@hub/core/auth-adapter";
import { asSystem, requireDb, FIXTURE } from "../helpers/db";

let ready = false;

/** Mã dùng riêng cho bài này — đặt cố định để dọn được, không đụng DEV001 của seed. */
const CODE_RETRY = "TST001"; // đổi hai lần trong cửa sổ
const CODE_DEAD = "TST002"; // đã dùng, quá cửa sổ
const CODE_REVOKED = "TST003"; // bị thu hồi
const ALL_CODES = [CODE_RETRY, CODE_DEAD, CODE_REVOKED];

/**
 * Dọn dấu vết lần chạy trước — bản thân bài test cũng phải chạy lại được.
 *
 * `core.users` bị trigger 0033 chặn DELETE (ADR-021: đường chính thức là ẩn danh
 * hoá). Ở đây là tài khoản RÁC do chính test sinh ra, không phải người thật, nên
 * dùng đúng cửa thoát hiểm mà 0033 khai báo tường minh thay vì để lại một đống
 * "Phụ huynh test" trong CSDL dev.
 */
async function cleanup(): Promise<void> {
  await asSystem(async (c) => {
    await c.query("set local hub.allow_user_hard_delete = 'on'");
    const { rows } = await c.query<{ redeemed_by: string }>(
      `select redeemed_by from core.parent_invite_codes
        where code = any($1) and redeemed_by is not null`,
      [ALL_CODES],
    );
    await c.query("delete from core.parent_invite_codes where code = any($1)", [ALL_CODES]);
    for (const { redeemed_by } of rows) {
      await c.query(
        `delete from core.parent_students
          where parent_id in (select id from core.parents where user_id = $1)`,
        [redeemed_by],
      );
      await c.query("delete from core.parents where user_id = $1", [redeemed_by]);
      await c.query("delete from core.user_role_scopes where user_id = $1", [redeemed_by]);
      await c.query("delete from core.users where id = $1", [redeemed_by]);
    }
  });
}

/** Phát một mã mới như GVCN phát cho phụ huynh (kèm tên phụ huynh). */
async function issue(code: string, fullName: string | null): Promise<void> {
  await asSystem((c) =>
    c.query(
      `insert into core.parent_invite_codes (code, student_id, expires_at, full_name)
       values ($1, $2, now() + interval '7 days', $3)`,
      [code, FIXTURE.studentBinh, fullName],
    ),
  );
}

beforeAll(async () => {
  ready = await requireDb();
  if (ready) await cleanup();
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe("Mã mời phụ huynh · dùng một lần (ADR-024)", () => {
  it("§9 — bấm hai lần / retry mạng trong cửa sổ: cùng một phiên, KHÔNG tài khoản thứ hai", async ({
    skip,
  }) => {
    if (!ready) return skip();
    await issue(CODE_RETRY, "Chị Nguyễn Thu Hà");

    const first = await redeemInviteCode(CODE_RETRY);
    const second = await redeemInviteCode(CODE_RETRY.toLowerCase()); // người dùng gõ chữ thường

    expect(second).toBe(first);

    const parents = await asSystem(async (c) => {
      const r = await c.query<{ n: string }>(
        `select count(*)::text as n
           from core.parent_students ps
           join core.parents p on p.id = ps.parent_id
           join core.users u on u.id = p.user_id
          where ps.student_id = $1 and u.full_name = 'Chị Nguyễn Thu Hà'`,
        [FIXTURE.studentBinh],
      );
      return Number(r.rows[0]!.n);
    });
    expect(parents).toBe(1);

    // Tên GVCN nhập lúc phát mã phải đi thẳng ra màn hình phụ huynh — trước 0036
    // mọi phụ huynh trong hệ đều hiện là "Phụ huynh" (chuỗi viết chết 0013:65).
    const identity = await resolveIdentity(first);
    expect(identity?.displayName).toBe("Chị Nguyễn Thu Hà");
    expect(identity?.roles).toContain("guardian");
  });

  it("quá cửa sổ 15 phút: mã đã dùng KHÔNG đăng nhập lại được (lỗ hổng 0013)", async ({ skip }) => {
    if (!ready) return skip();
    await issue(CODE_DEAD, null);

    await redeemInviteCode(CODE_DEAD); // lần đầu: hợp lệ

    // Không chờ được 15 phút trong một bài test — đẩy mốc lần dùng lùi về quá khứ,
    // đúng trạng thái của một mã nằm trong tin nhắn Zalo hôm qua bị forward.
    await asSystem((c) =>
      c.query(
        "update core.parent_invite_codes set redeemed_at = now() - interval '20 minutes' where code = $1",
        [CODE_DEAD],
      ),
    );

    // SQLSTATE 28000 + DETAIL là hợp đồng giữa hàm SQL và route (0036): route đọc
    // bằng máy để ghi audit đúng lý do, KHÔNG so chuỗi tiếng Việt.
    await expect(redeemInviteCode(CODE_DEAD)).rejects.toMatchObject({
      code: "28000",
      detail: "already_redeemed",
    });

    const users = await asSystem(async (c) => {
      const r = await c.query<{ n: string }>(
        `select count(*)::text as n
           from core.parent_students ps
           join core.parents p on p.id = ps.parent_id
          where ps.student_id = $1
            and p.user_id = (select redeemed_by from core.parent_invite_codes where code = $2)`,
        [FIXTURE.studentBinh, CODE_DEAD],
      );
      return Number(r.rows[0]!.n);
    });
    expect(users).toBe(1); // lần bị từ chối không tạo thêm gì
  });

  it("mã bị thu hồi chết ngay, dù còn hạn và chưa ai dùng", async ({ skip }) => {
    if (!ready) return skip();
    await issue(CODE_REVOKED, null);
    await asSystem((c) =>
      c.query("update core.parent_invite_codes set revoked_at = now() where code = $1", [
        CODE_REVOKED,
      ]),
    );

    await expect(redeemInviteCode(CODE_REVOKED)).rejects.toMatchObject({
      code: "28000",
      detail: "revoked",
    });
  });
});
