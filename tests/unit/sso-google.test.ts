// tests/unit/sso-google.test.ts — khoá hình dạng của cửa SSO Google thật (25/08/2026).
//
// Phần DB (idempotency nối tài khoản) ở tests/db/sso-google-noi.test.ts. File này khoá
// những luật đọc được từ mã nguồn — thứ một lần "dọn cho gọn" có thể phá mà không bài
// DB nào kêu:
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { laEmailTruong, supabaseUrl } from "@hub/core/auth-adapter";

const goc = join(__dirname, "..", "..");
const ROUTE = readFileSync(join(goc, "apps/hub/app/api/auth/sso-google/route.ts"), "utf8");
const TRAM = readFileSync(join(goc, "apps/hub/app/dang-nhap/google/page.tsx"), "utf8");
const LOGIN_PAGE = readFileSync(join(goc, "apps/hub/app/login/page.tsx"), "utf8");
const LOGIN_FORM = readFileSync(join(goc, "apps/hub/components/login-form.tsx"), "utf8");

describe("SSO Google thật — luật của cửa", () => {
  it("chưa cấu hình SUPABASE_URL thì cửa KHÔNG TỒN TẠI (404), và supabaseUrl() từ chối http", () => {
    expect(ROUTE).toMatch(/if \(!supabaseUrl\(\)\)[\s\S]{0,120}status: 404/);
    // Môi trường test không đặt SUPABASE_URL → null; và giá trị http:// không bao giờ hợp lệ.
    expect(supabaseUrl()).toBeNull();
  });

  it("hàng rào domain đứng Ở MÁY CHỦ, trước khi chạm sổ người dùng", () => {
    expect(ROUTE).toMatch(/laEmailTruong\(danhTinh\.email\)/);
    expect(ROUTE.indexOf("laEmailTruong")).toBeLessThan(ROUTE.indexOf("noiTaiKhoanTruong("));
    expect(laEmailTruong("ai-do@gmail.com")).toBe(false);
  });

  it("token đi trong BODY của POST, và trạm về đích xoá fragment ngay khi đọc xong", () => {
    // Fragment chứa token không được sống trong thanh địa chỉ (lịch sử, chụp màn, share).
    expect(TRAM).toContain("window.history.replaceState");
    expect(TRAM).toMatch(/fetch\("\/api\/auth\/sso-google",\s*\{\s*method: "POST"/);
    // Và không có đường nào đưa token vào query string.
    expect(TRAM).not.toMatch(/sso-google\?/);
  });

  it("URL authorize dựng Ở MÁY CHỦ (login/page.tsx) — SUPABASE_URL không thành biến NEXT_PUBLIC", () => {
    expect(LOGIN_PAGE).toContain("process.env.SUPABASE_URL");
    expect(LOGIN_PAGE).toContain("/dang-nhap/google");
    expect(LOGIN_FORM).not.toContain("NEXT_PUBLIC_SUPABASE");
  });

  it("nút Google là CÔNG TẮC theo môi trường: có ssoGoogleUrl thì đi Google, không thì giữ cửa dev", () => {
    expect(LOGIN_FORM).toMatch(/ssoGoogleUrl \? window\.location\.assign\(ssoGoogleUrl\) : loginDev\(chon\)/);
  });

  it("trần phiên vẫn là của Hub: route ký phiên bằng createSessionToken, không tự chế TTL", () => {
    expect(ROUTE).toContain("createSessionToken({");
    expect(ROUTE).toContain("sessionCookieOptionsFor(req.url)");
    expect(ROUTE).not.toMatch(/maxAge|expires:/);
  });
});
