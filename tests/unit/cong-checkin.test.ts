// tests/unit/cong-checkin.test.ts — ba trạng thái của popup khoá app (ADR-036).
//
// Bài này canh MỘT hàm thuần, và nó tồn tại vì đúng chỗ đó tôi viết sai ở bản đầu:
// tính `dangKhoa = batBuoc && !daGhi` rồi dựng nút "Vào Hub" trong nhánh
// `dangKhoa && daGhi` — một điều kiện KHÔNG BAO GIỜ đúng. Hậu quả: popup đóng sập ngay
// khi em bấm xong, trước khi kịp đọc câu cảm ơn; và trong một giây đó em không biết
// mình vừa ghi được hay không.
//
// Một logic đã sai một lần thì đáng có bài kiểm riêng, chứ không đáng được "đọc kỹ hơn
// lần sau". Mười sáu tổ hợp dưới đây phủ trọn bốn cờ.
import { describe, it, expect } from "vitest";
import { trangThaiCong } from "@/components/cong-checkin";

const T = (batBuoc: boolean, daGhi: boolean, daDong: boolean, moTay: boolean) =>
  trangThaiCong({ batBuoc, daGhi, daDong, moTay });

describe("cổng check-in — ba trạng thái", () => {
  it("KHÔNG bắt buộc, không ai mở → không có popup", () => {
    expect(T(false, false, false, false)).toEqual({ dangMo: false, khoaCung: false });
  });

  it("BẮT BUỘC, chưa ghi → popup mở và KHOÁ CỨNG", () => {
    expect(T(true, false, false, false)).toEqual({ dangMo: true, khoaCung: true });
  });

  it("BẮT BUỘC, ĐÃ GHI → popup VẪN MỞ nhưng thôi khoá — đây là chỗ bản đầu sai", () => {
    // Đây là khoảnh khắc em đọc "Đã ghi nhận, cảm ơn em!". Bản sai đóng popup ngay tại
    // đây, nên câu cảm ơn không bao giờ được đọc.
    expect(T(true, true, false, false)).toEqual({ dangMo: true, khoaCung: false });
  });

  it("BẮT BUỘC, đã ghi, ĐÃ ĐÓNG → popup biến mất", () => {
    expect(T(true, true, true, false)).toEqual({ dangMo: false, khoaCung: false });
  });

  it("EM TỰ MỞ để đổi tâm trạng → mở, và LUÔN có đường ra", () => {
    expect(T(false, false, false, true)).toEqual({ dangMo: true, khoaCung: false });
  });

  it("em tự mở SAU KHI đã qua cổng bắt buộc → vẫn có đường ra", () => {
    expect(T(true, true, true, true)).toEqual({ dangMo: true, khoaCung: false });
  });

  it("ĐÓNG KHÔNG THOÁT ĐƯỢC CỔNG khi chưa ghi: `daDong` không mở khoá cho lần sau", () => {
    // `daDong` chỉ sống trong một lượt tải trang. Tải lại trang thì máy chủ tính lại
    // `batBuoc` từ cơ sở dữ liệu — và nếu em vẫn chưa ghi thì cổng khoá lại. Assertion
    // này ghim ý nghĩa của `daDong` là "đóng trong phiên này", không phải "đã xong".
    expect(T(true, false, true, false)).toEqual({ dangMo: false, khoaCung: false });
  });

  it("EM ĐÃ BẤM thì cổng MỞ KHOÁ, kể cả khi tâm trạng không vào được kho", () => {
    // Cái bẫy suýt dựng ngày 21/08/2026 khi bỏ màn xác nhận.
    //
    // Nhà em chưa có phiếu đồng ý (0047): máy chủ NHẬN lượt điểm danh nhưng KHÔNG nhận
    // mức tâm trạng. Bản viết đầu để `CheckinView` im lặng ở ca đó — nên `daGhi` không
    // bao giờ bật, `khoaCung` không bao giờ tắt, và em bị nhốt VĨNH VIỄN trong một
    // popup đòi đúng thứ em không thể làm.
    //
    // Luật: `daGhi` bật khi máy chủ NHẬN LƯỢT, không phải khi tâm trạng vào kho. Đóng
    // hay không là chuyện khác, và nó do `daDong` quyết.
    expect(T(true, true, false, false)).toEqual({ dangMo: true, khoaCung: false });
  });

  it("phủ trọn 16 tổ hợp — không tổ hợp nào cho ra 'mở mà không biết có khoá hay không'", () => {
    // Phép kiểm hình dạng: `khoaCung` chỉ được đúng khi `dangMo` cũng đúng. Một trạng
    // thái "khoá cứng mà không mở" là vô nghĩa, và nếu nó lọt ra thì tầng giao diện sẽ
    // truyền `batBuoc` cho một hộp thoại không tồn tại.
    for (const b of [true, false])
      for (const g of [true, false])
        for (const d of [true, false])
          for (const m of [true, false]) {
            const r = T(b, g, d, m);
            if (r.khoaCung) expect(r.dangMo, `${b}/${g}/${d}/${m}`).toBe(true);
          }
  });
});
