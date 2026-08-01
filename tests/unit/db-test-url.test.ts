// tests/unit/db-test-url.test.ts — khoá luật "bộ test không bao giờ chạm database vận hành".
//
// Luật này sống ở tests/helpers/db-test-url.ts và được cắm vào ba chỗ: globalSetup của
// vitest, setupFiles của mỗi worker, và cổng đầu tools/run-db-tests.sh. Nó là một hàm
// thuần, nên nó kiểm được ở đây mà không cần Postgres — và PHẢI kiểm được, vì cách hỏng
// của nó là im lặng: đoán sai tên database thì không ai thấy gì, chỉ có `ops.job_runs`
// trên hub_dev dày thêm vài dòng mỗi lượt chạy (nợ #41).
import { describe, it, expect } from "vitest";
import {
  tenDatabase,
  laTenDbTest,
  doiTenDatabase,
  tenDbTestTuongUng,
  urlDbTest,
} from "../helpers/db-test-url.ts";

describe("tên database đọc ra từ chuỗi kết nối", () => {
  it("đọc được dạng URL thường và dạng có tham số", () => {
    expect(tenDatabase("postgres://u:p@localhost:5434/hub_dev")).toBe("hub_dev");
    expect(tenDatabase("postgres://u:p@localhost:5434/hub_dev?sslmode=require")).toBe("hub_dev");
  });

  it("đọc được dạng key=value mà node-postgres cũng nhận", () => {
    expect(tenDatabase("host=localhost port=5434 dbname=hub_dev user=postgres")).toBe("hub_dev");
  });
});

describe("cái gì được tính là database test", () => {
  it("chỉ _test / test_ / test", () => {
    expect(laTenDbTest("hub_test")).toBe(true);
    expect(laTenDbTest("test_hub")).toBe(true);
    expect(laTenDbTest("test")).toBe(true);
  });

  it("KHÔNG nhận những cái tên trông giống database tạm", () => {
    // Trên máy dev đang có thật: hub_tap, hub_ci, hub_flagchk, hub_nt, hub_v… Nhận nhầm
    // một cái tên "trông có vẻ tạm" là mở lại đúng cửa mà gói này đóng.
    for (const ten of ["hub_dev", "hub_tap", "hub_ci", "hub_flagchk", "hub", "testing", "postgres"]) {
      expect(laTenDbTest(ten), ten).toBe(false);
    }
  });
});

describe("suy ra tên database test", () => {
  it("hub_dev → hub_test, không phải hub_dev_test", () => {
    // Cùng một cái tên với .github/workflows/ci.yml và với nợ #41 — hai môi trường phải
    // gọi database test bằng cùng một tên, nếu không thì mỗi bên kiểm một chỗ khác nhau.
    expect(tenDbTestTuongUng("hub_dev")).toBe("hub_test");
  });

  it("tên đã là database test thì giữ nguyên (CI truyền thẳng hub_test)", () => {
    expect(tenDbTestTuongUng("hub_test")).toBe("hub_test");
  });

  it("tên khác thì thêm hậu tố", () => {
    expect(tenDbTestTuongUng("hub")).toBe("hub_test");
    expect(tenDbTestTuongUng("postgres")).toBe("hub_test");
  });
});

describe("đổi tên trong chuỗi kết nối giữ nguyên phần còn lại", () => {
  it("giữ user, mật khẩu, cổng, tham số", () => {
    const ra = doiTenDatabase("postgres://postgres:postgres@localhost:5434/hub_dev?sslmode=disable", "hub_test");
    expect(ra).toContain("postgres:postgres@localhost:5434");
    expect(ra).toContain("/hub_test");
    expect(ra).toContain("sslmode=disable");
    expect(ra).not.toContain("hub_dev");
  });
});

describe("urlDbTest — cổng cuối", () => {
  it("DATABASE_URL trỏ hub_dev thì test vẫn đi vào hub_test", () => {
    const ra = urlDbTest({ DATABASE_URL: "postgres://postgres:postgres@localhost:5434/hub_dev" });
    expect(tenDatabase(ra ?? "")).toBe("hub_test");
  });

  it("TEST_DATABASE_URL được ưu tiên, nhưng vẫn bị soát tên", () => {
    expect(
      tenDatabase(urlDbTest({ TEST_DATABASE_URL: "postgres://x@h/hub_khac_test" }) ?? ""),
    ).toBe("hub_khac_test");
    expect(() => urlDbTest({ TEST_DATABASE_URL: "postgres://x@h/hub_dev" })).toThrow(/hub_dev/);
  });

  it("không có DATABASE_URL thì trả undefined chứ không đoán bừa", () => {
    // Đây là đường của `vitest run tests/unit` trên máy chưa dựng Postgres và của job
    // `unit` trong CI: không có database nào, và đó là chuyện bình thường.
    expect(urlDbTest({})).toBeUndefined();
  });
});
