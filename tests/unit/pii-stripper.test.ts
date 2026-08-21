// tests/unit/pii-stripper.test.ts — §7, bộ eval của wrapper đứng giữa Hub và model ngoài.
//
// RULES §7 đòi "bộ eval ~30 ca mẫu chạy trong CI". Ba mươi ca dưới đây chia bốn nhóm:
//
//   1. PHẢI BÓC — bốn khuôn chắc chắn là định danh, kể cả khi viết lệch chuẩn.
//   2. KHÔNG ĐƯỢC BÓC NHẦM — văn xuôi bình thường phải đi qua nguyên vẹn. Nhóm này
//      quan trọng ngang nhóm 1: một bộ bóc quá tay làm câu hỏi mất nghĩa, model trả lời
//      sai, và KHÔNG AI BIẾT vì sao — hỏng câm, đúng loại kho này cấm.
//   3. TÊN — thay theo khai báo, dài trước ngắn sau.
//   4. ĐƯỜNG VỀ — phục hồi được tên, và KHÔNG phục hồi số điện thoại/email.
import { describe, it, expect } from "vitest";
import { bocPii, hoanPii, conSotPii } from "@hub/core/pii-stripper";

describe("§7 · phải bóc — bốn khuôn chắc chắn là định danh", () => {
  it("mã học sinh", () => {
    const r = bocPii("Em VA-2026-00417 nghỉ hôm qua");
    expect(r.sach).toBe("Em [MÃ-HS] nghỉ hôm qua");
    expect(r.daBoc.maHocSinh).toBe(1);
  });

  it("mã học sinh bóc TRƯỚC số điện thoại — nếu ngược thì lộ một nửa", () => {
    // `VA-2026-00417` chứa một dãy số dài; bộ bắt điện thoại tham lam sẽ ăn phần đuôi
    // và để lại "VA-2026-" trên đường truyền.
    const r = bocPii("VA-2026-00417");
    expect(r.sach).toBe("[MÃ-HS]");
    expect(r.sach).not.toContain("VA-2026");
  });

  it("số điện thoại 10 số bắt đầu bằng 0", () => {
    expect(bocPii("gọi 0912345678 nhé").sach).toBe("gọi [SĐT] nhé");
  });

  it("số điện thoại có dấu cách và gạch", () => {
    expect(bocPii("0912 345 678").sach).toBe("[SĐT]");
    expect(bocPii("091-234-5678").sach).toBe("[SĐT]");
  });

  it("số điện thoại dạng +84", () => {
    expect(bocPii("+84912345678").sach).toBe("[SĐT]");
  });

  it("email", () => {
    expect(bocPii("minh@va.edu.vn").sach).toBe("[EMAIL]");
  });

  it("email có dấu chấm và dấu cộng", () => {
    expect(bocPii("phu.huynh+lop6@gmail.com").sach).toBe("[EMAIL]");
  });

  it("căn cước 12 số", () => {
    expect(bocPii("CCCD 001234567890").sach).toBe("CCCD [CCCD]");
  });

  it("nhiều loại trong cùng một câu", () => {
    const r = bocPii("VA-2026-00417 · 0912345678 · a@b.vn");
    expect(r.sach).toBe("[MÃ-HS] · [SĐT] · [EMAIL]");
    expect(r.daBoc).toMatchObject({ maHocSinh: 1, dienThoai: 1, email: 1 });
  });

  it("đếm đúng số lần, không chỉ có/không", () => {
    expect(bocPii("0912345678 và 0987654321").daBoc.dienThoai).toBe(2);
  });
});

describe("§7 · KHÔNG được bóc nhầm — hỏng câm là loại hỏng tệ nhất", () => {
  // Mỗi ca dưới đây là một chuỗi TỪNG bị một bộ lọc tham lam ăn mất trong thực tế.
  const nguyenVen = [
    ["năm học 2026-2027", "năm học có dấu gạch, không phải mã"],
    ["lớp 6A1 có 32 em", "sĩ số"],
    ["em đi học 5/5 ngày", "phân số ngày"],
    ["điểm 8.5 môn Toán", "điểm số"],
    ["từ 7h30 đến 16h45", "giờ giấc"],
    ["ngày 21/08/2026", "ngày tháng"],
    ["em ở Long An", "địa danh trùng tên người — bộ đoán tên tiếng Việt sẽ ăn cả hai chữ"],
    ["chạy 30m hết 5.8 giây", "số đo thể lực"],
    ["đọc sách 25 phút", "số phút"],
    ["mã lớp 6A1-2026", "mã lớp, không phải mã học sinh"],
  ] as const;

  for (const [chu, vi_sao] of nguyenVen) {
    it(`giữ nguyên: "${chu}" (${vi_sao})`, () => {
      expect(bocPii(chu).sach).toBe(chu);
    });
  }

  it("số 9 chữ số rời KHÔNG bị coi là căn cước", () => {
    expect(bocPii("mã đơn 123456789").sach).toBe("mã đơn 123456789");
  });
});

describe("§7 · tên — thay theo khai báo, dài trước ngắn sau", () => {
  const ten = [
    { ten: "Nguyễn Văn Minh", ma: "HS-01" },
    { ten: "Minh", ma: "HS-01" },
    { ten: "cô Lan", ma: "GV-01" },
  ];

  it("thay tên đầy đủ", () => {
    expect(bocPii("Nguyễn Văn Minh nghỉ học", ten).sach).toBe("HS-01 nghỉ học");
  });

  it("DÀI TRƯỚC: tên đầy đủ không bị tên ngắn ăn mất phần đuôi", () => {
    // Nếu thay "Minh" trước thì còn lại "Nguyễn Văn HS-01" — lộ họ và tên đệm.
    const r = bocPii("Nguyễn Văn Minh", ten);
    expect(r.sach).toBe("HS-01");
    expect(r.sach).not.toContain("Nguyễn");
  });

  it("thay mọi lần xuất hiện, không chỉ lần đầu", () => {
    expect(bocPii("Minh và Minh", [{ ten: "Minh", ma: "HS-01" }]).sach).toBe("HS-01 và HS-01");
  });

  it("tên không xuất hiện thì không vào đường về — đường về là bản đồ của lần gọi NÀY", () => {
    expect(bocPii("hôm nay lớp ổn", ten).duongVe).toEqual({});
  });

  it("không khai tên nào thì tên vẫn đi ra — giới hạn CÓ THẬT, ghi ra chứ không giấu", () => {
    // Đây là lỗ đã biết: người gõ tay tên bạn cùng lớp vào ô tự do. Nó đóng bằng tầng
    // khác (nhắc trên màn hình + bộ lọc phía sau), không bằng heuristic đoán tên.
    expect(bocPii("Nguyễn Văn Minh nghỉ học").sach).toBe("Nguyễn Văn Minh nghỉ học");
  });
});

describe("§7 · đường về", () => {
  it("phục hồi tên cho người đọc hợp lệ", () => {
    const r = bocPii("Minh nghỉ 3 hôm", [{ ten: "Minh", ma: "HS-01" }]);
    expect(hoanPii("HS-01 cần được để ý", r.duongVe)).toBe("Minh cần được để ý");
  });

  it("KHÔNG phục hồi số điện thoại — nó bị XOÁ, không phải mã hoá", () => {
    const r = bocPii("gọi 0912345678", []);
    expect(Object.keys(r.duongVe)).toEqual([]);
    expect(hoanPii("[SĐT]", r.duongVe)).toBe("[SĐT]");
  });

  it("conSotPii bắt được định danh lọt vào SAU khi bóc", () => {
    // Ghép prompt hệ thống/ngữ cảnh sau khi bóc là cách một mẩu định danh đi ra mà
    // không ai phải sửa bocPii. Cổng cuối cùng phải chạy trên đúng chuỗi sắp gửi.
    const daBoc = bocPii("em nghỉ học").sach;
    expect(conSotPii(daBoc)).toBe(false);
    expect(conSotPii(`${daBoc} — liên hệ 0912345678`)).toBe(true);
  });

  it("conSotPii nói KHÔNG với văn xuôi sạch", () => {
    expect(conSotPii("Lớp 6A1 tuần này đi học đủ")).toBe(false);
  });
});
