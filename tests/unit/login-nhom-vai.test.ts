// Ô chọn vai ở trang đăng nhập dev — hai câu hỏi, cả hai đều sinh ra từ lỗi đo được
// 02/08/2026 chứ không phải từ trí tưởng tượng:
//
//   1. Một tài khoản có bao giờ hiện HAI LẦN không? ("Phụ huynh của Minh" đã từng, vì
//      bạn ấy vừa mang audience `student` vừa có chữ "phụ huynh" trong tên, và bản đầu
//      để mỗi nhóm tự lọc cả danh sách.)
//   2. Một tài khoản có bao giờ hiện KHÔNG LẦN NÀO không? Đây mới là ca nguy hiểm: nó
//      không nổ, không để lại dấu vết, chỉ là vai đó không ai vào thử được — và người
//      thử sẽ kết luận "chưa làm xong" trong khi nó chạy tốt.
//
// Phép kiểm cuối chạy trên CHÍNH DEV_ACCOUNTS thật, không phải danh sách bịa: danh sách
// bịa chỉ chứng minh hàm đúng, không chứng minh trang đăng nhập hiện đủ người.

import { describe, expect, it } from "vitest";
import { chiaNhom } from "../../apps/hub/components/login-form.tsx";
import { DEV_ACCOUNTS } from "../../packages/core/auth-adapter/dev-provider.ts";
import type { DevAccount } from "../../packages/core/auth-adapter/dev-provider.ts";

const a = (displayName: string, audience: DevAccount["audience"]): DevAccount => ({
  authUid: displayName,
  email: `${displayName}@x`,
  displayName,
  audience,
});

describe("chiaNhom — chia vai cho ô chọn", () => {
  it("không tài khoản nào hiện hai lần", () => {
    const nhom = chiaNhom(DEV_ACCOUNTS);
    const hien = nhom.flatMap((n) => n.tai.map((t) => t.authUid));
    const lap = hien.filter((id, i) => hien.indexOf(id) !== i);
    expect(lap).toEqual([]);
  });

  it("không tài khoản nào biến mất", () => {
    const nhom = chiaNhom(DEV_ACCOUNTS);
    const hien = new Set(nhom.flatMap((n) => n.tai.map((t) => t.authUid)));
    const mat = DEV_ACCOUNTS.filter((x) => !hien.has(x.authUid)).map((x) => x.displayName);
    expect(mat).toEqual([]);
  });

  it("phụ huynh về nhóm Phụ huynh, không lẫn vào Học sinh", () => {
    const nhom = chiaNhom([a("Phụ huynh của Minh", "student"), a("Học sinh Minh (6A1)", "student")]);
    expect(nhom.find((n) => n.ten === "Phụ huynh")?.tai.map((t) => t.displayName)).toEqual([
      "Phụ huynh của Minh",
    ]);
    expect(nhom.find((n) => n.ten === "Học sinh")?.tai.map((t) => t.displayName)).toEqual([
      "Học sinh Minh (6A1)",
    ]);
  });

  it("vai lạ rơi vào nhóm vét chứ không rơi ra ngoài", () => {
    const la = a("Bác bảo vệ cổng trước", "staff");
    const nhom = chiaNhom([la]);
    expect(nhom).toEqual([{ ten: "Vai khác", tai: [la] }]);
  });

  it("danh sách rỗng cho ra không nhóm nào (trang khoá cửa vẫn vẽ được)", () => {
    expect(chiaNhom([])).toEqual([]);
  });

  it("mỗi vai thật đều có ít nhất một tài khoản vào thử được", () => {
    const nhom = chiaNhom(DEV_ACCOUNTS);
    const ten = nhom.map((n) => n.ten);
    for (const can of ["Học sinh", "Phụ huynh", "Giáo viên chủ nhiệm", "Giáo viên bộ môn"]) {
      expect(ten, `thiếu nhóm ${can} — không ai thử được vai này`).toContain(can);
    }
    // Ba em học sinh: một em 0 cờ (6A1), một em CÓ cờ (6A3), một em đối chứng cùng lớp.
    // Con số 3 không phải để cho đẹp — dưới 2 thì không so được "em có cờ khác em không".
    expect(nhom.find((n) => n.ten === "Học sinh")?.tai.length).toBeGreaterThanOrEqual(3);
  });
});
