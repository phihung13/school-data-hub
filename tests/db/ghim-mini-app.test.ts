// tests/db/ghim-mini-app.test.ts — trang chủ tự ghim app dùng nhiều (ADR-034).
//
// pgTAP `0060` chứng minh BỘ ĐẾM đúng (cửa sổ nguội, ngưỡng ≥3, cửa sổ 30 ngày, RLS).
// Bài này chứng minh phần còn lại — thứ chỉ hỏng ở tầng TypeScript:
//
//   · thứ tự lưới có thật sự đổi không (đếm đúng mà không ai dùng số thì vô nghĩa);
//   · phần KHÔNG được ghim có giữ nguyên thứ tự tương đối không — đây là điều dễ mất
//     nhất khi ai đó "dọn cho gọn" bằng một cú sort toàn lưới, và mất nó thì người dùng
//     mất khả năng nhớ ô mình cần nằm ở đâu;
//   · ô MỜ không được nhấc lên hàng đầu — ghim một ô bấm không được là lấy chỗ đẹp nhất
//     màn hình để hứa suông;
//   · hỏng thì trả lưới gốc chứ không đổ trang chủ.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { asSystem, requireDb, DEV } from "../helpers/db";
import { ghimAppDungNhieu } from "@/server/mini-apps";
import type { MiniAppTile } from "@hub/core/contracts";

let ready = false;

const LUOI: MiniAppTile[] = [
  { key: "checkin", label: "Check-in", icon: "mood", href: "/checkin", available: true },
  { key: "tuan-nay", label: "Tuần này", icon: "insights", href: "/tuan-nay", available: true },
  { key: "bao-cao", label: "Báo cáo", icon: "description", href: "/bao-cao", available: true },
  { key: "sap-co", label: "Sắp có", icon: "hourglass", href: "/sap-co", available: false },
];

const ten = (ds: MiniAppTile[]) => ds.map((t) => t.key);

/** Gieo thẳng số lượt cho một người, bỏ qua cửa sổ nguội (đã có pgTAP canh). */
async function gieo(authUid: string, appKey: string, soLan: number) {
  await asSystem((c) =>
    c.query(
      `insert into ops.mini_app_usage (user_id, app_key, ngay, so_lan)
       select u.id, $2, current_date, $3 from core.users u where u.auth_uid = $1
       on conflict (user_id, app_key, ngay) do update set so_lan = $3`,
      [authUid, appKey, soLan],
    ),
  );
}

describe("ghim app dùng nhiều lên đầu lưới (ADR-034)", () => {
  beforeAll(async () => {
    ready = await requireDb();
  });

  afterEach(async () => {
    if (!ready) return;
    await asSystem((c) => c.query("delete from ops.mini_app_usage"));
  });

  it("chưa dùng gì thì lưới giữ NGUYÊN thứ tự khai báo — không xáo trộn vô cớ", async ({ skip }) => {
    if (!ready) return skip();
    expect(ten(await ghimAppDungNhieu(LUOI, DEV.student))).toEqual([
      "checkin",
      "tuan-nay",
      "bao-cao",
      "sap-co",
    ]);
  });

  it("app dùng nhiều nhảy lên đầu, PHẦN CÒN LẠI GIỮ NGUYÊN thứ tự tương đối", async ({ skip }) => {
    if (!ready) return skip();
    await gieo(DEV.student, "bao-cao", 9);
    // "bao-cao" lên đầu; checkin/tuan-nay/sap-co vẫn đúng thứ tự cũ của chúng.
    expect(ten(await ghimAppDungNhieu(LUOI, DEV.student))).toEqual([
      "bao-cao",
      "checkin",
      "tuan-nay",
      "sap-co",
    ]);
  });

  it("hai app cùng vào hàng ghim thì xếp theo SỐ LƯỢT, không theo thứ tự khai báo", async ({ skip }) => {
    if (!ready) return skip();
    await gieo(DEV.student, "checkin", 4);
    await gieo(DEV.student, "bao-cao", 11);
    expect(ten(await ghimAppDungNhieu(LUOI, DEV.student))).toEqual([
      "bao-cao",
      "checkin",
      "tuan-nay",
      "sap-co",
    ]);
  });

  it("ô MỜ dùng nhiều mấy cũng KHÔNG được ghim — hàng đầu không dành cho ô bấm không được", async ({ skip }) => {
    if (!ready) return skip();
    await gieo(DEV.student, "sap-co", 99);
    expect(ten(await ghimAppDungNhieu(LUOI, DEV.student))).toEqual([
      "checkin",
      "tuan-nay",
      "bao-cao",
      "sap-co",
    ]);
  });

  it("lượt dùng của NGƯỜI KHÁC không đổi được lưới của mình (RLS ở tầng gọi thật)", async ({ skip }) => {
    if (!ready) return skip();
    await gieo(DEV.gvcn, "bao-cao", 50);
    expect(ten(await ghimAppDungNhieu(LUOI, DEV.student))).toEqual([
      "checkin",
      "tuan-nay",
      "bao-cao",
      "sap-co",
    ]);
  });

  it("app trong hàng ghim mà KHÔNG còn trong lưới (vừa bị thu hồi) thì bỏ qua, không sinh ô ma", async ({ skip }) => {
    if (!ready) return skip();
    await gieo(DEV.student, "app-da-go", 30);
    await gieo(DEV.student, "checkin", 5);
    expect(ten(await ghimAppDungNhieu(LUOI, DEV.student))).toEqual([
      "checkin",
      "tuan-nay",
      "bao-cao",
      "sap-co",
    ]);
  });

  it("người không tồn tại (không đọc được số) → trả lưới gốc, KHÔNG đổ trang chủ", async ({ skip }) => {
    if (!ready) return skip();
    expect(ten(await ghimAppDungNhieu(LUOI, "00000000-0000-0000-0000-0000000000ff"))).toEqual([
      "checkin",
      "tuan-nay",
      "bao-cao",
      "sap-co",
    ]);
  });
});
