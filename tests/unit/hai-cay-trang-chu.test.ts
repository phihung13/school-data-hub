// tests/unit/hai-cay-trang-chu.test.ts — trang chủ dựng HAI cây, và chúng phải nói cùng
// một điều về "ai thấy khối nào".
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO KHÔNG GỘP HAI CÂY LÀM MỘT
// ═══════════════════════════════════════════════════════════════════════════════
// `home-view.tsx` dựng `MobileHome` và `DesktopHome` riêng, và đó là quyết định ĐÚNG, có
// lý do đo được (ghi ở đầu file đó): bản cũ dựng CẢ HAI rồi ẩn một bằng CSS, nên HTML của
// /home chứa chữ "Mini App" hai lần, mỗi lần dữ liệu đổi React phải đối chiếu hai cây, và
// điện thoại rẻ tiền trả tiền cho cây desktop nó không bao giờ nhìn thấy.
//
// Cái GIÁ của quyết định đó là mọi câu "ai thấy khối này" bị viết hai lần. Và hai lần thì
// có ngày lệch — đã lệch thật, chú thích trong chính file đó ghi lại: bản mobile có
// `relative z-[2]` từ đầu, bản desktop sót, chữ "Mini App" bị nền navy cắt ngang, và CHỈ
// vai người lớn nhìn thấy (ảnh chụp của Cô Hạnh, 31/07/2026).
//
// ═══════════════════════════════════════════════════════════════════════════════
// BÀI NÀY CHẶN ĐƯỢC GÌ, VÀ KHÔNG CHẶN ĐƯỢC GÌ — ĐỌC CẢ HAI VẾ
// ═══════════════════════════════════════════════════════════════════════════════
// CHẶN ĐƯỢC: một khối hiện ở cây này mà không hiện ở cây kia. Sau 02/08/2026 cả hai cây
// đọc chung `khoiChoVai(data)`, nên câu "ai thấy khối này" chỉ còn MỘT bản; bài này canh
// để nó không bị chép lại thành hai.
//
// KHÔNG CHẶN ĐƯỢC: lệch KIỂU DÁNG — đúng ca `relative z-[2]` vừa kể. Không cấu trúc nào
// bắt được một class CSS thiếu ở một nhánh. Thứ bắt được nó là mở cả hai khổ màn ra nhìn:
// `tools/ra-mobile.js`. Ghi ra đây để không ai đọc bài này thành "hai cây đã an toàn".

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { khoiChoVai } from "@/components/home-view";

const src = readFileSync(
  join(fileURLToPath(new URL("../../", import.meta.url)), "apps", "hub", "components", "home-view.tsx"),
  "utf8",
);

/** Thân của một hàm dựng cây, cắt từ `function X(` tới `function ` kế tiếp ở cột 0. */
function than(ten: string): string {
  const i = src.indexOf(`function ${ten}(`);
  expect(i, `không tìm thấy ${ten} — bài test này đang đo một file khác với file thật`).toBeGreaterThan(-1);
  const j = src.indexOf("\nfunction ", i + 1);
  return src.slice(i, j === -1 ? undefined : j);
}

describe("khoiChoVai — một chỗ quyết định, đúng như luật cũ", () => {
  it("học sinh: có thẻ check-in, KHÔNG có lối tắt buồng lái", () => {
    expect(khoiChoVai({ isStudent: true, isHomeroom: false })).toEqual({
      theCheckin: true,
      tuanNay: true,
      loiTatGvcn: false,
    });
  });

  it("GVCN: có lối tắt buồng lái, KHÔNG có thẻ check-in", () => {
    expect(khoiChoVai({ isStudent: false, isHomeroom: true })).toEqual({
      theCheckin: false,
      tuanNay: false,
      loiTatGvcn: true,
    });
  });

  it("tổ hợp hỏng (vừa là em vừa là GVCN): màn của EM thắng", () => {
    // Tổ hợp này không tồn tại trong dữ liệu thật. Nhưng nếu một ngày dữ liệu hỏng mà ra
    // nó thì em KHÔNG được thấy lời nhắc về buồng lái — phép so `&& !isStudent` giữ đúng
    // điều đó, và nó là phép so đã có từ trước, chỉ được chuyển chỗ.
    expect(khoiChoVai({ isStudent: true, isHomeroom: true }).loiTatGvcn).toBe(false);
  });

  it("người lớn không phải GVCN: không khối nào của hai nhóm trên", () => {
    expect(khoiChoVai({ isStudent: false, isHomeroom: false })).toEqual({
      theCheckin: false,
      tuanNay: false,
      loiTatGvcn: false,
    });
  });
});

describe("hai cây đọc CHUNG quyết định, không cây nào tự so vai", () => {
  for (const cay of ["MobileHome", "DesktopHome"] as const) {
    it(`${cay} gọi khoiChoVai(data)`, () => {
      expect(than(cay)).toContain("khoiChoVai(data)");
    });

    it(`${cay} KHÔNG tự viết lại phép so vai cho các khối đã gom`, () => {
      // Cụ thể ba câu đã gom. Không cấm mọi `isStudent` trong thân cây — vẫn còn những
      // chỗ dùng nó cho việc khác (cỡ chữ, khoảng cách, bật/tắt truy vấn), và cấm sạch
      // sẽ là ép người sau đi vòng thay vì đi đúng.
      const t = than(cay);
      const pham = [
        ["data.isHomeroom && !data.isStudent", "lối tắt buồng lái — dùng khoi.loiTatGvcn"],
        ["data.isStudent && <CheckinCard", "thẻ check-in — dùng khoi.theCheckin"],
      ].filter(([chuoi]) => t.includes(chuoi as string));
      expect(pham.map(([, sua]) => sua)).toEqual([]);
    });
  }

  it("lời chào soạn MỘT chỗ, hai cây chỉ khác cỡ chữ", () => {
    // Trước 02/08/2026 câu `Chào {ten}{isStudent ? " 👋" : ""}` viết hai lần, nên luật
    // "emoji chỉ cho học sinh" (§4) cũng có hai bản — sửa một bản là hai bản nói khác nhau.
    for (const cay of ["MobileHome", "DesktopHome"] as const) {
      expect(than(cay), `${cay} không dùng <LoiChao>`).toContain("<LoiChao ten={data.displayName}");
    }
    // Và câu gốc không được còn sót ở đâu.
    expect(src).not.toMatch(/Chào \{data\.displayName\}\{data\.isStudent \? " 👋" : ""\}/);
  });

  it("emoji 👋 chỉ xuất hiện ĐÚNG MỘT LẦN trong MÃ (chú thích không tính)", () => {
    // Phép đếm thô nhất, và là phép chắc nhất: một lần = một chỗ quyết định.
    //
    // BỎ CHÚ THÍCH TRƯỚC KHI ĐẾM. Bản đầu của phép kiểm này đếm cả chú thích và ra 4 —
    // ba trong số đó là những dòng KỂ LẠI luật "👋 chỉ cho học sinh". Đếm chú thích là
    // đếm lời bàn về mã như thể nó là mã; cùng một lỗi đã làm con số "60 nhánh phân
    // quyền" của tôi phồng lên từ 54 sáng nay.
    const ma = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect((ma.match(/👋/g) ?? []).length).toBe(1);
  });
});
