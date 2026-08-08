// tests/unit/phieu-dau-noi.test.ts — PHIẾU ĐẤU NỐI: bản yêu cầu và khuôn phải là MỘT.
//
// ═══════════════════════════════════════════════════════════════════════════════
// BÀI QUAN TRỌNG NHẤT Ở ĐÂY LÀ BÀI CUỐI: VÍ DỤ TRONG TÀI LIỆU PHẢI CHẠY THẬT
// ═══════════════════════════════════════════════════════════════════════════════
// `apps/hub/server/dau-noi/ban-yeu-cau.md` là thứ đi RA NGOÀI tổ chức — quản trị tải xuống,
// gửi cho một đội làm app hoặc một AI, và họ code theo đúng ví dụ trong đó. Nếu khuôn Zod
// đổi mà tài liệu không đổi, hỏng xảy ra ở nơi tệ nhất: đội bên kia làm xong, gửi phiếu,
// phiếu bị từ chối, và không ai ở đây biết là do chính tài liệu mình phát ra.
//
// Bài cuối trích MỌI khối ```json trong tài liệu rồi bắt chúng đi qua đúng khuôn thật. Tài
// liệu và mã không có đường nào trôi khỏi nhau mà vẫn xanh.
//
// Bốn bài đầu đo phần còn lại: ánh xạ có đúng không, và bốn khoá "nhà trường quyết" có bị
// TỪ CHỐI thật không — một khoá bị bỏ qua trong im lặng nguy hiểm hơn một khoá bị chặn, vì
// người dán tin là mình vừa khai nó.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PhieuDauNoi, phieuThanhKhaiBao, tenBienSecret } from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const banYeuCau = join(repoRoot, "apps", "hub", "server", "dau-noi", "ban-yeu-cau.md");

const PHIEU_DU = {
  phienBan: 1,
  maApp: "the-luc",
  tenHienThi: "Thể lực",
  moTaMotCau: "Ghi kết quả kiểm tra thể lực.",
  roDuLieu: "vang",
  doiChiuTrachNhiem: "Đội Thể chất — theluc@truongvietanh.com",
  nhung: { origin: "https://the-luc.truongvietanh.com", urlIframe: "https://the-luc.truongvietanh.com/embed" },
  webhook: { cacLoaiSuKien: ["ket_qua_the_luc"] },
  sso: {
    redirectUris: ["https://the-luc.truongvietanh.com/api/auth/callback"],
    backchannelLogoutUri: "https://the-luc.truongvietanh.com/api/auth/backchannel-logout",
    scopes: ["openid", "profile", "hub_profile"],
  },
};

describe("phiếu đấu nối → khai báo app", () => {
  it("phiếu đủ ba nhánh ánh xạ đúng, và tên biến secret do HUB sinh chứ không do phiếu khai", () => {
    const phieu = PhieuDauNoi.parse(PHIEU_DU);
    const kb = phieuThanhKhaiBao(phieu, "2027-02-07");

    expect(kb.appId).toBe("the-luc");
    expect(kb.basket).toBe("vang");
    expect(kb.reviewDueOn).toBe("2027-02-07");
    expect(kb.origin).toBe("https://the-luc.truongvietanh.com");
    expect(kb.allowedEventTypes).toEqual(["ket_qua_the_luc"]);
    expect(kb.ssoEnabled).toBe(true);
    expect(kb.ssoScopes).toEqual(["openid", "profile", "hub_profile"]);

    // Đây là chỗ phiếu KHÔNG được chạm tới: mã app viết thường có gạch ngang, tên biến viết
    // HOA có gạch dưới. Để đội ngoài tự khai là mở đường cho một ký tự gõ sai biến thành
    // `undefined` — cùng giá trị với "chưa đặt", không phân biệt được từ trong hệ.
    expect(kb.ssoClientSecretEnv).toBe("OIDC_CLIENT_SECRET_THE_LUC");
    expect(tenBienSecret("OIDC_CLIENT_SECRET", "a-b-c")).toBe("OIDC_CLIENT_SECRET_A_B_C");
  });

  it("dán phiếu KHÔNG BAO GIỜ khai khoá webhook riêng — mọi app dùng chuỗi chung", () => {
    // Luật của chủ đầu tư 08/08/2026: một chuỗi webhook dùng chung cho mọi app, bỏ hẳn bước
    // đặt biến môi trường cho từng app mới.
    //
    // Bài này là CỔNG CHẶN MỘT LỖI ĐÃ XẢY RA THẬT, không phải một khẳng định lý thuyết. Bản
    // trước sinh sẵn `EMBED_WEBHOOK_SECRET_<MÃ>` cho mọi phiếu — mà khai một tên biến RIÊNG
    // nghĩa là "app này dùng khoá riêng", và `registry-db.ts` cố ý KHÔNG rơi về chuỗi chung
    // khi khoá riêng chưa đặt. Đo trên bản đang chạy 08/08: app vừa dán, đã cấp vai, đã bật,
    // gửi bằng chuỗi chung → `{"error":"app_id/secret không hợp lệ"}`. Phiếu tự tay dựng lại
    // đúng cái bước mà cả gói này sinh ra để bỏ.
    for (const phieu of [PHIEU_DU, { ...PHIEU_DU, webhook: { cacLoaiSuKien: ["a", "b"] } }]) {
      const kb = phieuThanhKhaiBao(PhieuDauNoi.parse(phieu), "2027-02-07");
      expect(kb.webhookSecretEnv, "phiếu vừa khai một khoá webhook RIÊNG — app sẽ nhận 401").toBeNull();
      // Cửa vẫn phải MỞ: khoá đến từ chuỗi chung, không phải từ chỗ trống này.
      expect(kb.allowedEventTypes.length).toBeGreaterThan(0);
    }
  });

  it("dán một phiếu KHÔNG BAO GIỜ cấp quyền cho ai — allowedRoles luôn rỗng", () => {
    // Fail-closed, và nó phải đúng cả với phiếu đầy đủ nhất. Vai là quyết định của nhà
    // trường, làm trên màn hình sau khi dán; một phiếu từ ngoài tổ chức không được mang
    // theo quyền của chính nó.
    const kb = phieuThanhKhaiBao(PhieuDauNoi.parse(PHIEU_DU), "2027-02-07");
    expect(kb.allowedRoles).toEqual([]);
  });

  it("phiếu chỉ có nhúng thì KHÔNG bật SSO và KHÔNG khai biến secret nào", () => {
    const phieu = PhieuDauNoi.parse({
      phienBan: 1,
      maApp: "thuc-don-tuan",
      tenHienThi: "Thực đơn tuần",
      roDuLieu: "xanh",
      doiChiuTrachNhiem: "Đội Căn tin",
      nhung: { origin: "https://td.truongvietanh.com", urlIframe: "https://td.truongvietanh.com/tuan-nay" },
      webhook: null,
      sso: null,
    });
    const kb = phieuThanhKhaiBao(phieu, "2027-02-07");
    expect(kb.ssoEnabled).toBe(false);
    expect(kb.ssoClientSecretEnv).toBeNull();
    expect(kb.webhookSecretEnv).toBeNull();
    expect(kb.allowedEventTypes).toEqual([]);
  });
});

describe("phiếu TỪ CHỐI những gì nhà trường quyết", () => {
  // Mỗi khoá một phép thử riêng, không gộp: gộp lại thì một khoá lọt qua vẫn xanh nhờ ba
  // khoá kia bị chặn.
  for (const [khoa, gia] of Object.entries({
    allowedRoles: ["admin"],
    enabled: true,
    reviewDueOn: "2030-01-01",
    webhookSecretEnv: "TU_DAT_TEN",
    ssoClientSecretEnv: "TU_DAT_TEN",
  })) {
    it(`phiếu khai "${khoa}" thì BỊ TỪ CHỐI, không phải bị bỏ qua`, () => {
      const kq = PhieuDauNoi.safeParse({ ...PHIEU_DU, [khoa]: gia });
      expect(kq.success, `"${khoa}" lọt qua — người dán sẽ tin là mình vừa khai nó`).toBe(false);
      if (!kq.success) {
        expect(kq.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
      }
    });
  }

  it("khối sso cũng đóng — không nhét thêm khoá lạ vào nhánh con được", () => {
    const kq = PhieuDauNoi.safeParse({ ...PHIEU_DU, sso: { ...PHIEU_DU.sso, clientSecret: "bimat" } });
    expect(kq.success).toBe(false);
  });
});

describe("phiếu chặn đúng những ca hỏng câm", () => {
  it("urlIframe lệch khỏi origin → từ chối (nếu không: CSP chặn, khung trắng, không ai hiểu vì sao)", () => {
    const kq = PhieuDauNoi.safeParse({
      ...PHIEU_DU,
      nhung: { origin: "https://a.truongvietanh.com", urlIframe: "https://b.truongvietanh.com/e" },
    });
    expect(kq.success).toBe(false);
  });

  it("redirect_uri http:// → từ chối (authorization_code đi qua đường không mã hoá)", () => {
    const kq = PhieuDauNoi.safeParse({
      ...PHIEU_DU,
      sso: { ...PHIEU_DU.sso, redirectUris: ["http://the-luc.truongvietanh.com/cb"] },
    });
    expect(kq.success).toBe(false);
  });

  it("redirect_uri mang dấu # → từ chối (OIDC Core 3.1.2.1)", () => {
    const kq = PhieuDauNoi.safeParse({
      ...PHIEU_DU,
      sso: { ...PHIEU_DU.sso, redirectUris: ["https://the-luc.truongvietanh.com/cb#x"] },
    });
    expect(kq.success).toBe(false);
  });

  it('thiếu scope "openid" → từ chối (không có id_token thì đây là OAuth2 trần)', () => {
    const kq = PhieuDauNoi.safeParse({ ...PHIEU_DU, sso: { ...PHIEU_DU.sso, scopes: ["profile"] } });
    expect(kq.success).toBe(false);
  });

  it("khai webhook mà không loại sự kiện nào → từ chối (Hub sẽ từ chối mọi lời gọi)", () => {
    const kq = PhieuDauNoi.safeParse({ ...PHIEU_DU, webhook: { cacLoaiSuKien: [] } });
    expect(kq.success).toBe(false);
  });

  it("mã app viết hoa hoặc có dấu → từ chối (mã đi thẳng vào URL)", () => {
    expect(PhieuDauNoi.safeParse({ ...PHIEU_DU, maApp: "The-Luc" }).success).toBe(false);
    expect(PhieuDauNoi.safeParse({ ...PHIEU_DU, maApp: "thể-lực" }).success).toBe(false);
  });
});

describe("bản yêu cầu gửi ra ngoài và khuôn thật KHÔNG được trôi khỏi nhau", () => {
  const tepMd = readFileSync(banYeuCau, "utf8");

  it("tài liệu tồn tại và còn chỗ thay địa chỉ Hub (không ghi cứng tên miền)", () => {
    // Ghi cứng `https://hub.truongvietanh.com` vào tài liệu là để nó nói dối vào ngày đổi
    // tên miền — và nói dối với người ở ngoài tổ chức. Route tải xuống thay `{{HUB_URL}}`
    // bằng giá trị thật của máy chủ đang phục vụ.
    expect(tepMd.length).toBeGreaterThan(3000);
    expect(tepMd).toContain("{{HUB_URL}}");
    expect(tepMd, "tài liệu đang ghi cứng một tên miền — dùng {{HUB_URL}}").not.toMatch(
      /https:\/\/hub\.truongvietanh\.com/,
    );
  });

  it("MỌI khối JSON trong tài liệu đều đọc được, và mọi khối PHIẾU qua được khuôn thật", () => {
    const khoi = [...tepMd.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]!);
    // Mẫu số: không có khối nào thì bài này xanh vì rỗng.
    expect(khoi.length, "không tìm thấy khối ```json nào trong bản yêu cầu").toBeGreaterThanOrEqual(4);

    const hong: string[] = [];
    let soPhieu = 0;
    for (const [i, k] of khoi.entries()) {
      let tho: unknown;
      try {
        tho = JSON.parse(k);
      } catch (e) {
        hong.push(`khối #${i + 1}: JSON không đọc được — ${(e as Error).message}`);
        continue;
      }
      const o = tho as Record<string, unknown>;

      // Tài liệu có HAI loại khối json: phiếu đấu nối, và một ví dụ thân request webhook
      // (mục 4.1). Phân loại bằng khoá đặc trưng chứ không bằng thứ tự — thứ tự đổi khi
      // ai đó chèn thêm một mục, và một bài test đếm theo thứ tự sẽ hỏng vì lý do vô nghĩa.
      if ("phienBan" in o) {
        soPhieu++;
        const kq = PhieuDauNoi.safeParse(tho);
        if (!kq.success) {
          hong.push(`khối #${i + 1}: ${kq.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(" · ")}`);
        }
      } else if (!("external_id" in o)) {
        // Không phải phiếu, không phải thân webhook ⇒ một loại khối thứ ba đã xuất hiện mà
        // bài test này không biết. Bắt lại thay vì bỏ qua: bỏ qua nghĩa là ngày mai có ai
        // thêm một ví dụ phiếu quên khoá `phienBan` thì nó lọt qua trong im lặng.
        hong.push(`khối #${i + 1}: không rõ là phiếu hay thân webhook — thiếu cả phienBan lẫn external_id`);
      }
    }
    expect(hong).toEqual([]);
    expect(soPhieu, "bản yêu cầu phải có ít nhất 3 ví dụ phiếu (khuôn + 2 ví dụ đầy đủ)").toBeGreaterThanOrEqual(3);
  });

  it("tài liệu nói ĐÚNG bốn khoá mà phiếu sẽ từ chối", () => {
    // Nếu ai đó nới khuôn (bỏ `.strict()`, cho khai `reviewDueOn`) mà quên sửa tài liệu,
    // bài này vẫn xanh — nó chỉ canh chiều ngược lại: tài liệu hứa cấm thì khuôn phải cấm.
    for (const khoa of ["Vai nào được mở app", "App bật hay tắt", "Ngày rà lại", "Tên biến chứa chuỗi bí mật"]) {
      expect(tepMd, `bản yêu cầu thiếu dòng cấm "${khoa}"`).toContain(khoa);
    }
  });
});
