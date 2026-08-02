// tests/unit/canh-build.test.ts — cổng chặn `next build` khi máy chủ đang phục vụ chính
// bản dựng sắp bị ghi đè (tools/canh-build.mjs).
//
// ═══════════════════════════════════════════════════════════════════════════════
// BÀI NÀY KIỂM CÁI GÌ, VÀ VÌ SAO NẶNG VỀ PHÍA "CHO QUA"
// ═══════════════════════════════════════════════════════════════════════════════
// Với một cái cổng, hai kiểu sai KHÔNG cân nhau:
//
//   · CHẶN SAI thì có người kêu ngay trong ba mươi giây — họ đang muốn dựng mà không
//     dựng được. Lỗi ồn, tự sửa.
//   · CHO QUA SAI thì im lặng tuyệt đối. Cổng vẫn ở đó, vẫn chạy, vẫn in ra không gì cả
//     — trông y hệt một cổng đang làm việc. Không ai phát hiện cho tới lần sập kế tiếp,
//     và lúc đó người ta sẽ kết luận "cổng này vô dụng" thay vì "cổng này hỏng".
//
// Nên bốn ca CHO QUA ở dưới mỗi ca một phép kiểm riêng, và mỗi phép nói rõ nó cho qua
// vì lý do nào — không gộp thành một `expect(...).not.toBe("dung")`. Gộp lại thì một
// nhánh đi nhầm sang nhánh khác vẫn xanh.
//
// GIỚI HẠN PHẢI NÓI RA: bài này kiểm phần QUYẾT ĐỊNH, không kiểm phần đọc tệp và gọi
// mạng. Hai phần đó đã chạy thật ngày 02/08/2026 — cổng chặn đúng một lượt `pnpm build`
// khi máy chủ đang phục vụ, in ra BUILD_ID trùng và thoát mã 1.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { quyetDinh } from "../../tools/canh-build.mjs";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const ID = "TfIRaC4wYtk-Gin2IzUll";
const htmlCoId = `<html><script src="/_next/static/${ID}/_buildManifest.js"></script></html>`;
const htmlBanKhac = `<html><script src="/_next/static/mot-ban-dung-khac/_buildManifest.js"></script></html>`;

describe("cổng chặn build: ca DỪNG", () => {
  it("máy chủ đang phục vụ ĐÚNG bản dựng sắp bị ghi đè → DỪNG", () => {
    expect(quyetDinh({ buildIdTrenDia: ID, html: htmlCoId })).toBe("dung");
  });
});

describe("cổng chặn build: bốn ca CHO QUA, mỗi ca một lý do riêng", () => {
  it("người dùng tự tắt cổng → cho qua, và nói rõ là do người tắt", () => {
    // Có đường tắt là điều kiện để cổng sống được: một cổng không tắt được sẽ bị gỡ.
    expect(quyetDinh({ boQua: true, buildIdTrenDia: ID, html: htmlCoId })).toBe(
      "cho-qua-nguoi-dung-tu-tat",
    );
  });

  it("chưa từng dựng bản thật (không có BUILD_ID trên đĩa) → cho qua", () => {
    expect(quyetDinh({ buildIdTrenDia: null, html: htmlCoId })).toBe("cho-qua-chua-tung-dung");
    expect(quyetDinh({ buildIdTrenDia: "", html: htmlCoId })).toBe("cho-qua-chua-tung-dung");
  });

  it("không ai nghe cổng (html = null) → cho qua", () => {
    expect(quyetDinh({ buildIdTrenDia: ID, html: null })).toBe("cho-qua-khong-ai-nghe");
  });

  it("có người nghe nhưng đang phục vụ bản dựng KHÁC → cho qua", () => {
    // Đây là ca của máy chủ chế độ lập trình viên: nó đọc `.next`, còn bản dựng thật ghi
    // vào `.next-prod` (next.config.mjs). Hai thư mục khác nhau, dựng đồng thời không
    // đụng nhau. Chặn nhầm ca này thì người ta sẽ tắt cổng đi — và tắt rồi thì không bao
    // giờ bật lại.
    expect(quyetDinh({ buildIdTrenDia: ID, html: htmlBanKhac })).toBe("cho-qua-khac-ban-dung");
  });
});

describe("cổng chặn build: được cắm thật vào đường dựng", () => {
  it("apps/hub/package.json có prebuild gọi cổng này", () => {
    // Một cái cổng viết xong mà không cắm vào đâu thì nó là một tệp, không phải một cổng.
    // Phép kiểm này là thứ duy nhất phân biệt hai điều đó.
    const pkg = JSON.parse(readFileSync(join(repoRoot, "apps", "hub", "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.prebuild, "apps/hub thiếu script prebuild").toBeTruthy();
    expect(pkg.scripts?.prebuild).toContain("canh-build.mjs");
  });

  it("tệp cổng có thật trên đĩa ở đúng đường mà prebuild trỏ tới", () => {
    expect(existsSync(join(repoRoot, "tools", "canh-build.mjs"))).toBe(true);
  });
});
