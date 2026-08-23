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
import { PhieuDauNoi, phieuThanhKhaiBao } from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const banYeuCau = join(repoRoot, "apps", "hub", "server", "dau-noi", "ban-yeu-cau.md");

const PHIEU_DU = {
  phienBan: 1,
  maApp: "the-luc",
  tenHienThi: "Thể lực",
  moTaMotCau: "Ghi kết quả kiểm tra thể lực.",
  roDuLieu: "vang",
  doiChiuTrachNhiem: "Đội Thể chất — theluc@truongvietanh.com",
  urlIframe: "https://the-luc.truongvietanh.com/embed",
  cacLoaiSuKien: ["ket_qua_the_luc"],
  redirectUris: ["https://the-luc.truongvietanh.com/api/auth/callback"],
  urlDangXuat: "https://the-luc.truongvietanh.com/api/auth/backchannel-logout",
};

describe("phiếu đấu nối → khai báo app", () => {
  it("phiếu đủ ba nhánh ánh xạ đúng — mọi giá trị nghiệp vụ về đúng chỗ", () => {
    const phieu = PhieuDauNoi.parse(PHIEU_DU);
    const kb = phieuThanhKhaiBao(phieu, "2027-02-07");

    expect(kb.appId).toBe("the-luc");
    expect(kb.basket).toBe("vang");
    expect(kb.reviewDueOn).toBe("2027-02-07");
    expect(kb.origin).toBe("https://the-luc.truongvietanh.com");
    expect(kb.allowedEventTypes).toEqual(["ket_qua_the_luc"]);
    expect(kb.ssoEnabled).toBe(true);
    // `hub_profile` PHẢI có: không có nó thì app không biết ai đang xem là học sinh hay
    // giáo viên, và đội làm app sẽ phải hỏi lại nhà trường — đúng vòng hỏi-đáp đợt này đi xoá.
    expect(kb.ssoScopes).toEqual(["openid", "profile", "hub_profile"]);

  });

  it("khai báo sinh ra KHÔNG có trường secret nào — khái niệm đó đã bị gỡ", () => {
    // Cổng chặn một lỗi ĐÃ XẢY RA THẬT HAI LẦN trong ngày 08/08/2026, không phải một khẳng
    // định lý thuyết. Bản trước sinh sẵn `EMBED_WEBHOOK_SECRET_<MÃ>` và
    // `OIDC_CLIENT_SECRET_<MÃ>` cho mọi phiếu — mà khai một tên biến RIÊNG nghĩa là "app này
    // dùng khoá riêng", và tầng nạp cố ý KHÔNG rơi về chuỗi chung khi khoá riêng chưa đặt.
    // Đo trên bản đang chạy: app vừa dán, đã cấp vai, đã bật → webhook 401, đăng nhập
    // invalid_client. Phiếu tự tay dựng lại đúng cái bước mà cả gói này sinh ra để bỏ.
    //
    // `0058` gỡ hẳn hai trường khỏi hợp đồng, nên bài này khẳng định bằng chính KHOÁ CỦA
    // ĐỐI TƯỢNG: một trường secret quay lại là bài đỏ, dù nó mang tên gì.
    for (const phieu of [PHIEU_DU, { ...PHIEU_DU, cacLoaiSuKien: ["a", "b"] }]) {
      const kb = phieuThanhKhaiBao(PhieuDauNoi.parse(phieu), "2027-02-07") as Record<string, unknown>;
      const traiPhep = Object.keys(kb).filter((k) => /secret/i.test(k));
      expect(traiPhep, "khai báo sinh ra một trường secret — khái niệm khoá riêng đã bị gỡ ở 0058").toEqual([]);
      // Cửa vẫn phải MỞ: khoá đến từ chuỗi chung của trường, không từ một trường nào ở đây.
      expect((kb.allowedEventTypes as string[]).length).toBeGreaterThan(0);
      expect(kb.ssoEnabled).toBe(true);
    }
  });

  it("dán một phiếu KHÔNG BAO GIỜ cấp quyền cho ai — allowedRoles luôn rỗng", () => {
    // Fail-closed, và nó phải đúng cả với phiếu đầy đủ nhất. Vai là quyết định của nhà
    // trường, làm trên màn hình sau khi dán; một phiếu từ ngoài tổ chức không được mang
    // theo quyền của chính nó.
    const kb = phieuThanhKhaiBao(PhieuDauNoi.parse(PHIEU_DU), "2027-02-07");
    expect(kb.allowedRoles).toEqual([]);
  });

  it("KHÔNG dựng được phiếu thiếu nhánh — ba việc là bắt buộc với mọi app", () => {
    // ═══════════════════════════════════════════════════════════════════════
    // LẬT 23/08/2026 — bài này trước đây đo ca "app chỉ có nhúng"
    // ═══════════════════════════════════════════════════════════════════════
    // Chủ đầu tư chốt: *"tất cả các app, đều là app nội bộ, tất cả dùng sso, ko ai được hệ
    // riêng, trang nào cũng bắn dữ liệu về hết, kể cả thực đơn"*. Ca "chỉ có nhúng" nay
    // không tồn tại, nên bài cũ đo một trạng thái đã bị bỏ đi.
    //
    // Lật thành đo CHIỀU NGƯỢC LẠI, và nó vẫn đáng canh: ngày ai đó nới khuôn cho một
    // nhánh thành tuỳ chọn "cho nhanh", ba dòng dưới đây đỏ và buộc người đó đọc lý do.
    const thieu = (bo: string) => {
      const p: Record<string, unknown> = { ...PHIEU_DU };
      delete p[bo];
      return PhieuDauNoi.safeParse(p).success;
    };
    expect(thieu("urlIframe"), "thiếu nhúng mà vẫn qua").toBe(false);
    expect(thieu("cacLoaiSuKien"), "thiếu webhook mà vẫn qua").toBe(false);
    expect(thieu("redirectUris"), "thiếu SSO mà vẫn qua").toBe(false);
    // `urlDangXuat` là thứ DUY NHẤT bỏ được — chưa dựng kịp thì Hub không báo được cho
    // app lúc em thoát, nhưng ba đường chính vẫn chạy.
    expect(thieu("urlDangXuat"), "urlDangXuat phải bỏ được").toBe(true);
  });

  it("ánh xạ: SSO luôn bật, origin tự cắt từ urlIframe, scope do Hub đặt", () => {
    const kb = phieuThanhKhaiBao(PhieuDauNoi.parse(PHIEU_DU), "2027-02-07");
    expect(kb.ssoEnabled).toBe(true);
    expect(kb.origin, "origin phải cắt ra từ urlIframe, không khai tay").toBe(
      "https://the-luc.truongvietanh.com",
    );
    // `hub_profile` PHẢI có: không có nó thì app không biết ai đang xem là học sinh hay
    // giáo viên, và đội làm app sẽ phải hỏi lại nhà trường — đúng vòng hỏi-đáp đợt này đi xoá.
    expect(kb.ssoScopes).toEqual(["openid", "profile", "hub_profile"]);
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
    const kq = PhieuDauNoi.safeParse({ ...PHIEU_DU, clientSecret: "bimat" });
    expect(kq.success).toBe(false);
  });
});

describe("phiếu chặn đúng những ca hỏng câm", () => {
  it("urlIframe KHÔNG còn lệch khỏi origin được — origin nay tự cắt ra từ chính nó", () => {
    // Ca "khai lệch nhau" đã bị xoá khỏi thực tế 23/08/2026 bằng cách bỏ hẳn trường
    // `origin`: một thứ chỉ khai một lần thì không tự mâu thuẫn với chính nó được.
    // Bài cũ đo phép kiểm chéo giữa hai trường; nay đo rằng phép cắt ra ĐÚNG.
    for (const [url, mong] of [
      ["https://a.truongvietanh.com/e", "https://a.truongvietanh.com"],
      ["https://b.truongvietanh.com:8443/x/y", "https://b.truongvietanh.com:8443"],
      ["https://c.truongvietanh.com", "https://c.truongvietanh.com"],
    ] as const) {
      const kb = phieuThanhKhaiBao(PhieuDauNoi.parse({ ...PHIEU_DU, urlIframe: url }), "2027-02-07");
      expect(kb.origin, url).toBe(mong);
    }
  });

  it("redirect_uri http:// → từ chối (authorization_code đi qua đường không mã hoá)", () => {
    const kq = PhieuDauNoi.safeParse({
      ...PHIEU_DU,
      redirectUris: ["http://the-luc.truongvietanh.com/cb"],
    });
    expect(kq.success).toBe(false);
  });

  it("redirect_uri mang dấu # → từ chối (OIDC Core 3.1.2.1)", () => {
    const kq = PhieuDauNoi.safeParse({
      ...PHIEU_DU,
      redirectUris: ["https://the-luc.truongvietanh.com/cb#x"],
    });
    expect(kq.success).toBe(false);
  });

  it("khai `scopes` → từ chối: Hub đặt, app không chọn (mọi app nội bộ dùng openid profile)", () => {
    // Bài cũ đo 'thiếu scope openid'. Nay app KHÔNG khai scope nữa, nên ca đó không dựng
    // được — thay bằng ca thật sự có thể xảy ra: đội làm app chép khuôn cũ ở đâu đó về.
    expect(PhieuDauNoi.safeParse({ ...PHIEU_DU, scopes: ["profile"] }).success).toBe(false);
  });

  it("khai webhook mà không loại sự kiện nào → từ chối (Hub sẽ từ chối mọi lời gọi)", () => {
    const kq = PhieuDauNoi.safeParse({ ...PHIEU_DU, cacLoaiSuKien: [] });
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
        // HAI, không phải ba (23/08/2026): ví dụ thứ ba trước đây là "app chỉ có giao diện,
    // webhook null" — một hình dạng nay không dựng được. Khuôn + một ví dụ đã điền là đủ,
    // vì mọi app cùng một hình dạng thì ví dụ thứ hai không dạy thêm điều gì.
    expect(soPhieu, "bản yêu cầu phải có khuôn + ít nhất một ví dụ đã điền").toBeGreaterThanOrEqual(2);
  });

  it("tài liệu nói ĐÚNG bốn khoá mà phiếu sẽ từ chối", () => {
    // Nếu ai đó nới khuôn (bỏ `.strict()`, cho khai `reviewDueOn`) mà quên sửa tài liệu,
    // bài này vẫn xanh — nó chỉ canh chiều ngược lại: tài liệu hứa cấm thì khuôn phải cấm.
    for (const khoa of ["Vai nào được mở app", "App bật hay tắt", "Ngày rà lại", "Tên biến chứa chuỗi bí mật"]) {
      expect(tepMd, `bản yêu cầu thiếu dòng cấm "${khoa}"`).toContain(khoa);
    }
  });
});
