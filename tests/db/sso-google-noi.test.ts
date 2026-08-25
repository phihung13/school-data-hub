// tests/db/sso-google-noi.test.ts — mutation nối tài khoản Google phải IDEMPOTENT (§6).
//
// `noiTaiKhoanTruong` là mutation MỚI của gói SSO thật (ADR trong google-provider.ts):
// lần đầu gắn `auth_uid` + ghi `identity_links`; luật checklist của kho đòi mọi mutation
// mới có test "gọi 2 lần" — gọi lại không được tạo thêm gì, không được đổi gì.
//
// Dựng user tạm RIÊNG (email + auth_uid đều mang tiền tố test, xoá ở afterAll) thay vì
// mượn fixture dev: bài này GHI vào core.users, mượn fixture là để lại vết cho bài khác.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { requireDb, asSystem } from "../helpers/db";
import { noiTaiKhoanTruong, laEmailTruong } from "@hub/core/auth-adapter";

let ready = false;

const EMAIL_TAM = "sso-noi-test@truongvietanh.com";
const AUTH_UID_TAM = "99999999-0000-4000-8000-000000000901";
const AUTH_UID_KHAC = "99999999-0000-4000-8000-000000000902";

describe("SSO Google — nối tài khoản trường", () => {
  // KHÔNG xoá cứng core.users — kho có chốt chặn ("đường chính thức là ẩn danh hoá",
  // bắt được ngay lần chạy đầu của chính bài này). Dọn dẹp = gỡ LIÊN KẾT (identity_links
  // + auth_uid về null); dòng người thử ở lại hub_test — database này dựng lại từ số
  // không mỗi lượt pgTAP nên không tích rác.
  beforeAll(async () => {
    ready = await requireDb();
    if (!ready) return;
    await asSystem(async (c) => {
      await c.query("delete from core.identity_links where external_id in ($1, $2)", [AUTH_UID_TAM, AUTH_UID_KHAC]);
      await c.query(
        `insert into core.users (email, full_name, status) values ($1, 'Người Thử SSO', 'active')
         on conflict (email) do nothing`,
        [EMAIL_TAM],
      );
      await c.query("update core.users set auth_uid = null, status = 'active' where email = $1", [EMAIL_TAM]);
    });
  });

  afterAll(async () => {
    if (!ready) return;
    await asSystem(async (c) => {
      await c.query("delete from core.identity_links where external_id in ($1, $2)", [AUTH_UID_TAM, AUTH_UID_KHAC]);
      await c.query("update core.users set auth_uid = null where email = $1", [EMAIL_TAM]);
    });
  });

  it("gọi HAI lần cùng đầu vào: cùng userId, một dòng identity_links, auth_uid không đổi", async ({ skip }) => {
    if (!ready) return skip();
    const dt = { authUid: AUTH_UID_TAM, email: EMAIL_TAM, emailVerified: true };

    const lan1 = await noiTaiKhoanTruong(dt);
    expect(lan1.trangThai).toBe("ok");
    const lan2 = await noiTaiKhoanTruong(dt);
    expect(lan2.trangThai).toBe("ok");
    expect(lan2).toEqual(lan1);

    await asSystem(async (c) => {
      const links = await c.query(
        "select count(*)::int as n from core.identity_links where system = 'supabase' and external_id = $1",
        [AUTH_UID_TAM],
      );
      expect(links.rows[0].n).toBe(1);
      const user = await c.query("select auth_uid from core.users where email = $1", [EMAIL_TAM]);
      expect(user.rows[0].auth_uid).toBe(AUTH_UID_TAM);
    });
  });

  it("email đã kích hoạt bằng auth_uid KHÁC thì từ chối — không âm thầm chiếm chỗ", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await noiTaiKhoanTruong({ authUid: AUTH_UID_KHAC, email: EMAIL_TAM, emailVerified: true });
    expect(kq.trangThai).toBe("email-da-noi-tai-khoan-khac");
    // Và KHÔNG để lại vết: không dòng identity_links nào cho uid bị từ chối.
    await asSystem(async (c) => {
      const links = await c.query("select count(*)::int as n from core.identity_links where external_id = $1", [
        AUTH_UID_KHAC,
      ]);
      expect(links.rows[0].n).toBe(0);
    });
  });

  it("email lạ (không có trong sổ) → chua-co-trong-so; domain sai bị chặn từ hàm thuần", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await noiTaiKhoanTruong({
      authUid: AUTH_UID_KHAC,
      email: "khong-ai-ca@truongvietanh.com",
      emailVerified: true,
    });
    expect(kq.trangThai).toBe("chua-co-trong-so");

    // Hàng rào domain là hàm THUẦN, đo tại đây cho đủ cặp với route dùng nó:
    expect(laEmailTruong("minh@truongvietanh.com")).toBe(true);
    expect(laEmailTruong("MINH@TRUONGVIETANH.COM")).toBe(true);
    expect(laEmailTruong("ai-do@gmail.com")).toBe(false);
    expect(laEmailTruong("gia@truongvietanh.com.evil.vn")).toBe(false);
    expect(laEmailTruong("@truongvietanh.com")).toBe(false);
  });
});
