// tests/db/mini-app-so-dang-ky.test.ts
//
// Sổ đăng ký Mini App (migration 0052) — kiểm END-TO-END qua router thật, trên database
// thật, dưới danh tính thật.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO FILE NÀY PHẢI TỒN TẠI, VÀ BÀI pgTAP 0052 KHÔNG THAY ĐƯỢC NÓ
// ═══════════════════════════════════════════════════════════════════════════════
// pgTAP hỏi database: "cô giáo update thì có đổi được dòng nào không?" Câu trả lời đo
// được là "không đổi dòng nào, và KHÔNG ném lỗi" — RLS trên UPDATE lọc hàng chứ không
// từ chối câu lệnh.
//
// Nhưng câu quan trọng hơn nằm ở TẦNG TRÊN: một router gọi `update` rồi trả về "đã lưu"
// mà không xem `rowCount` sẽ báo THÀNH CÔNG cho một thao tác chưa từng xảy ra. Đó là lỗi
// không database nào bắt được, không typecheck nào bắt được, và không hiện ra cho tới
// ngày có người tưởng mình vừa thu hồi xong một app đang lộ dữ liệu.
//
// Nên nhóm 2 dưới đây gọi ĐÚNG procedure mà màn hình gọi, bằng ĐÚNG phiên của một cô
// giáo, rồi đòi nó NÉM. Không đòi "0 dòng" — đòi một lời từ chối tới được tay người dùng.
//
// ═══════════════════════════════════════════════════════════════════════════════
// FILE NÀY DỰNG VÀ DỌN DỮ LIỆU CỦA RIÊNG NÓ
// ═══════════════════════════════════════════════════════════════════════════════
// Mã app mang tiền tố "zz-test-" và được xoá ở cả beforeAll lẫn afterAll: một lượt chạy
// bị ngắt giữa chừng không được để lại app thừa cho màn quản trị của người khác nhặt phải
// — và không được để bài chạy lần sau xanh nhờ dòng của lần chạy trước.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, requireDb, DEV } from "../helpers/db";
import { adminRouter } from "@/server/routers/admin";
import { buildMiniAppsWithEmbedded } from "@/server/mini-apps";
import { napApps, xoaDem } from "@/server/embed/registry-db";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

const APP_TAT = "zz-test-app-tat";
const APP_BAT = "zz-test-app-bat";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const quanTri = () => adminRouter.createCaller(ctxFor(DEV.admin));
const coGiao = () => adminRouter.createCaller(ctxFor(DEV.gvcn));
const hocSinh = () => adminRouter.createCaller(ctxFor(DEV.student));

async function maLoi(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "KHÔNG NÉM LỖI";
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `LỖI KHÁC: ${String(err)}`;
  }
}

async function donDep(): Promise<void> {
  await asSystem(async (c) => {
    await c.query("delete from core.embedded_apps where app_id like 'zz-test-%'");
  });
  xoaDem();
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;
  await donDep();
  await asSystem(async (c) => {
    await c.query(
      `insert into core.embedded_apps
         (app_id, display_name, basket, enabled, allowed_roles, origin, iframe_url, owner, review_due_on)
       values
         ($1,'App thử đang TẮT','xanh', false, array['homeroom']::text[],
          'https://tat.vidu.test','https://tat.vidu.test/embed','đội thử', current_date + 200),
         ($2,'App thử đang BẬT','xanh', true,  array['homeroom']::text[],
          'https://bat.vidu.test','https://bat.vidu.test/embed','đội thử', current_date + 200)`,
      [APP_TAT, APP_BAT],
    );
  });
  xoaDem();
});

afterAll(async () => {
  if (ready) await donDep();
});

describe("sổ đăng ký Mini App — ai đọc được gì", () => {
  it("quản trị thấy CẢ app đang tắt", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await quanTri().miniApp.list();
    const ma = kq.apps.map((a) => a.appId);
    // Khẳng định KHẲNG ĐỊNH trước: có app tắt trong bảng để mà thấy hay không thấy.
    expect(ma, "mẫu số: app đang tắt phải có trong bảng").toContain(APP_TAT);
    expect(ma).toContain(APP_BAT);
  });

  it("cô giáo và học sinh KHÔNG gọi được sổ đăng ký", async ({ skip }) => {
    if (!ready) return skip();
    expect(await maLoi(() => coGiao().miniApp.list())).toBe("FORBIDDEN");
    expect(await maLoi(() => hocSinh().miniApp.list())).toBe("FORBIDDEN");
  });

  it("tầng đọc app (napApps) CHỈ trả app đang bật", async ({ skip }) => {
    if (!ready) return skip();
    const ma = (await napApps()).map((a) => a.appId);
    expect(ma, "app đang bật phải có mặt — nếu không thì phép phủ định dưới đây vô nghĩa").toContain(APP_BAT);
    expect(ma).not.toContain(APP_TAT);
  });
});

describe("thu hồi: lời từ chối phải TỚI TAY người dùng, không im lặng", () => {
  it("cô giáo bấm công tắc thì NHẬN LỖI, không nhận 'đã lưu'", async ({ skip }) => {
    if (!ready) return skip();
    // Đây là điều cả file này tồn tại để kiểm. Ở tầng database, câu UPDATE của cô giáo
    // chạy xong và đổi 0 dòng — KHÔNG một mã lỗi nào (đo trong pgTAP 0052). Router phải
    // tự đọc rowCount và biến sự im lặng đó thành một lời từ chối.
    expect(await maLoi(() => coGiao().miniApp.setEnabled({ appId: APP_BAT, enabled: false }))).toBe("FORBIDDEN");
  });

  it("và app vẫn ĐANG BẬT sau khi cô giáo bấm — không chỉ 'có lỗi', mà thật sự không đổi", async ({ skip }) => {
    if (!ready) return skip();
    // Một router có thể ném lỗi SAU KHI đã ghi. Phép kiểm trên không loại trừ điều đó;
    // phép kiểm này thì có.
    const { rows } = await asSystem((c) =>
      c.query<{ enabled: boolean }>("select enabled from core.embedded_apps where app_id = $1", [APP_BAT]),
    );
    expect(rows[0]?.enabled).toBe(true);
  });

  it("quản trị tắt được, và app biến khỏi tầng đọc NGAY (không đợi hết hạn bộ đệm)", async ({ skip }) => {
    if (!ready) return skip();
    await quanTri().miniApp.setEnabled({ appId: APP_BAT, enabled: false });
    // KHÔNG gọi xoaDem() ở đây: chính procedure phải tự xoá đệm. Lời hứa ở migration 0052
    // là "tắt là app biến khỏi hệ ngay lượt request kế tiếp" — nếu procedure quên xoá đệm
    // thì dòng dưới đây đỏ, và đó đúng là lỗi cần bắt.
    const ma = (await napApps()).map((a) => a.appId);
    expect(ma).not.toContain(APP_BAT);
  });

  it("bật lại thì nó quay về", async ({ skip }) => {
    if (!ready) return skip();
    await quanTri().miniApp.setEnabled({ appId: APP_BAT, enabled: true });
    expect((await napApps()).map((a) => a.appId)).toContain(APP_BAT);
  });

  it("bấm công tắc cho app không tồn tại thì NOT_FOUND, không im", async ({ skip }) => {
    if (!ready) return skip();
    expect(await maLoi(() => quanTri().miniApp.setEnabled({ appId: "zz-test-khong-co", enabled: true }))).toBe(
      "NOT_FOUND",
    );
  });
});

describe("lưới tile trang chủ đọc từ sổ, và lọc đúng vai", () => {
  it("chủ nhiệm thấy tile của app đang bật cấp cho vai mình", async ({ skip }) => {
    if (!ready) return skip();
    const tiles = await buildMiniAppsWithEmbedded(["homeroom"]);
    expect(tiles.map((t) => t.href)).toContain(`/embed/${APP_BAT}`);
  });

  it("học sinh KHÔNG thấy tile đó — và mẫu số chứng minh phép gọi CÓ chạy", async ({ skip }) => {
    if (!ready) return skip();
    // ═══════════════════════════════════════════════════════════════════════════
    // MẪU SỐ ĐỔI 22/08/2026, VÌ LƯỚI CỦA HỌC SINH NAY RỖNG THẬT
    // ═══════════════════════════════════════════════════════════════════════════
    // Bản cũ chống một cái bẫy có thật: `not.toContain` trên mảng rỗng thì LUÔN xanh, kể
    // cả khi phép gọi hỏng hoàn toàn. Nó chống bằng cách đòi lưới của học sinh không rỗng.
    //
    // Hôm nay lưới ấy rỗng — và rỗng ĐÚNG: Thi đua và Báo cáo đã ra khỏi lưới (chúng là
    // trang trong menu, không phải mini app), hai ô "GĐ2" đã gỡ, và học sinh chưa được
    // cấp mini app nào. Giữ mẫu số cũ là bắt bài test đòi một thứ vừa bị bỏ đi.
    //
    // Mẫu số mới đo ĐÚNG cái nó cần đo — rằng phép gọi có chạy và app có tồn tại — bằng
    // cách gọi CÙNG hàm, CÙNG app, khác mỗi vai. Chủ nhiệm thấy; học sinh không. Nếu phép
    // gọi hỏng thì vế chủ nhiệm đỏ, nên vế học sinh không còn xanh-vì-rỗng được nữa.
    const cuaCo = await buildMiniAppsWithEmbedded(["homeroom"]);
    expect(cuaCo.map((t) => t.href), "phép gọi hỏng — mẫu số không còn nghĩa").toContain(
      `/embed/${APP_BAT}`,
    );

    const tiles = await buildMiniAppsWithEmbedded(["student"]);
    expect(tiles.map((t) => t.href)).not.toContain(`/embed/${APP_BAT}`);
    // Và ghim luôn điều vừa quyết: lưới của học sinh RỖNG. Ngày ai đó cấp mini app đầu
    // tiên cho học sinh, dòng này đỏ và buộc người đó đọc cả khối lý lẽ ở trên.
    expect(tiles, "học sinh vừa có tile — đọc khối lý lẽ ở trên rồi hãy sửa").toEqual([]);
  });

  it("app đang TẮT không hiện tile cho bất kỳ vai nào", async ({ skip }) => {
    if (!ready) return skip();
    for (const vai of [["homeroom"], ["admin"], ["student"], ["guardian"]] as const) {
      const tiles = await buildMiniAppsWithEmbedded([...vai]);
      expect(tiles.map((t) => t.href), `vai ${vai.join("+")}`).not.toContain(`/embed/${APP_TAT}`);
    }
  });
});

describe("khai app mới — §9 gọi hai lần cho cùng một kết quả", () => {
  const MOI = "zz-test-app-moi";

  it("gọi hai lần KHÔNG sinh dòng thứ hai và KHÔNG nổ", async ({ skip }) => {
    if (!ready) return skip();
    const input = {
      appId: MOI,
      displayName: "App khai hai lần",
      basket: "xanh" as const,
      owner: "đội thử",
      reviewDueOn: "2027-06-30",
      allowedRoles: [],
      allowedEventTypes: [],
    };
    const lan1 = await quanTri().miniApp.create(input);
    const lan2 = await quanTri().miniApp.create(input);
    expect(lan2.app).toEqual(lan1.app);

    const { rows } = await asSystem((c) =>
      c.query<{ n: string }>("select count(*)::text as n from core.embedded_apps where app_id = $1", [MOI]),
    );
    expect(rows[0]?.n).toBe("1");
  });

  it("app mới ra đời TẮT và chưa cấp cho vai nào", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await quanTri().miniApp.list();
    const app = kq.apps.find((a) => a.appId === MOI);
    expect(app?.enabled).toBe(false);
    expect(app?.allowedRoles).toEqual([]);
  });

  it("cô giáo KHÔNG khai được app", async ({ skip }) => {
    if (!ready) return skip();
    expect(
      await maLoi(() =>
        coGiao().miniApp.create({
          appId: "zz-test-co-giao-khai",
          displayName: "Không được đâu",
          basket: "xanh",
          owner: "cô",
          reviewDueOn: "2027-06-30",
          allowedRoles: [],
          allowedEventTypes: [],
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("sửa app không tồn tại thì NOT_FOUND", async ({ skip }) => {
    if (!ready) return skip();
    expect(
      await maLoi(() => quanTri().miniApp.update({ appId: "zz-test-khong-co", displayName: "X" })),
    ).toBe("NOT_FOUND");
  });
});
