// tests/unit/embed-intro.test.ts — màn chờ khi mở mini app phải NÓI ĐÚNG THỨ ĐANG XẢY RA.
//
// Vì sao cần test: cái hỏng ở đây không làm đỏ typecheck, không làm đỏ build, và không
// nhìn thấy được trên máy người viết mã — trên máy đó app con nạp trong nửa giây nên pha
// thứ hai và thứ ba KHÔNG BAO GIỜ hiện ra. Chúng chỉ hiện đúng ở nơi không ai nhìn: điện
// thoại của cô giáo, mạng 3G, lúc app ngoài đang chậm.
//
// Ba pha, ba câu khác nhau, và ranh giới giữa chúng là con số chủ đầu tư đặt (3 giây) —
// nên chúng phải được ghim, không phải để trôi theo lần sửa giao diện tiếp theo.
import { describe, it, expect } from "vitest";
import { phaTheoThoiGian, cauTheoPha } from "@/components/embed/embed-intro";

describe("màn chờ mini app · ba pha theo thời gian", () => {
  it("dưới 3 giây là pha giới thiệu — mốc chủ đầu tư đặt cho một lần mở bình thường", () => {
    expect(phaTheoThoiGian(0)).toBe("gioi-thieu");
    expect(phaTheoThoiGian(1500)).toBe("gioi-thieu");
    expect(phaTheoThoiGian(2999)).toBe("gioi-thieu");
  });

  it("đúng 3 giây thì chuyển sang nói là đang chờ app ngoài", () => {
    // Ranh giới là >= chứ không phải >: đúng mốc thì đã hết "bình thường".
    expect(phaTheoThoiGian(3000)).toBe("cho-app-ngoai");
    expect(phaTheoThoiGian(9999)).toBe("cho-app-ngoai");
  });

  it("từ 10 giây thì thôi hứa hẹn, chuyển sang pha có đường ra", () => {
    expect(phaTheoThoiGian(10000)).toBe("qua-lau");
    expect(phaTheoThoiGian(60000)).toBe("qua-lau");
  });

  it("ba pha KHÁC nhau — không pha nào trùng pha nào", () => {
    // Nếu hai pha cho cùng một giá trị thì màn hình nói một câu cho hai tình huống khác
    // hẳn nhau, và người dùng mất đúng thông tin cần nhất.
    const pha = new Set([phaTheoThoiGian(0), phaTheoThoiGian(5000), phaTheoThoiGian(20000)]);
    expect(pha.size).toBe(3);
  });
});

describe("màn chờ mini app · câu chữ nói đúng ai đang làm người ta chờ", () => {
  it("pha đầu in ĐÚNG câu giới thiệu của app, không phải một câu chung chung", () => {
    expect(cauTheoPha("gioi-thieu", "Factory", "Xưởng nội dung của trường")).toBe(
      "Xưởng nội dung của trường",
    );
  });

  it("app chưa khai câu giới thiệu thì nói tối thiểu, KHÔNG bịa một câu nghe hay", () => {
    expect(cauTheoPha("gioi-thieu", "Factory")).toBe("Đang mở ứng dụng…");
  });

  it("pha hai nói RÕ là đang chờ app ngoài — người dùng có quyền biết đang chờ ai", () => {
    const cau = cauTheoPha("cho-app-ngoai", "Factory", "bỏ qua");
    expect(cau).toContain("Factory");
    expect(cau).toContain("ngoài Hub");
    // Câu giới thiệu KHÔNG được lấn sang pha này: lúc này người dùng cần biết chuyện gì
    // đang xảy ra, không cần nghe app đó làm gì nữa.
    expect(cau).not.toContain("bỏ qua");
  });

  it("pha ba nói THẲNG Hub vẫn bình thường — không nhận lỗi thay app ngoài", () => {
    const cau = cauTheoPha("qua-lau", "Factory");
    expect(cau).toContain("Factory");
    expect(cau).toContain("Hub vẫn bình thường");
    // Đây là ranh giới trách nhiệm, và nó có ích thật: người trực đọc câu này rồi biết
    // đi hỏi ai, thay vì mở sổ tay sự cố của Hub ra dò từ đầu.
    expect(cau).toContain("phía ứng dụng");
  });

  it("ba câu KHÁC nhau ở cả ba pha", () => {
    const cau = new Set([
      cauTheoPha("gioi-thieu", "Factory", "giới thiệu"),
      cauTheoPha("cho-app-ngoai", "Factory", "giới thiệu"),
      cauTheoPha("qua-lau", "Factory", "giới thiệu"),
    ]);
    expect(cau.size).toBe(3);
  });
});
