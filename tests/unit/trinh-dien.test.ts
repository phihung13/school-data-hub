// tests/unit/trinh-dien.test.ts — công tắc trình diễn (23/08/2026).
//
// Chủ đầu tư trình diễn cuối tuần, và yêu cầu là: *"giữ nguyên code hiện tại, chỉ tắt nó
// đi"*. Nên thứ đáng canh nhất ở đây KHÔNG phải là "bật có ra trang trình diễn không" —
// mà là **TẮT CÓ TẮT THẬT KHÔNG**, và **app thật có còn nguyên không**.
//
// Bài này có vì đúng hai chỗ đó đã hỏng thật trong lúc dựng:
//
//   1. Bản đầu đọc `process.env` bằng một hằng số ở TẦM MODULE. Hằng số đó chạy một lần
//      lúc middleware được nạp, nên đặt `HUB_TRINH_DIEN=0` xong máy chủ VẪN trả trang
//      trình diễn — đo thật, cả ba cửa. Một công tắc không tắt được thì không phải công
//      tắc, và nó hỏng đúng lúc buổi trình bày xong.
//   2. `matcher` của middleware chỉ loại trừ file có đuôi png/jpg/css/js… — KHÔNG loại
//      `.html`, KHÔNG loại `.mp4`. Nghĩa là chính trang trình diễn cũng chạy qua
//      middleware. Thiếu nhánh `/trinh-dien` là nó tự viết lại về chính nó, vòng vô tận.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chieuTrinhDien, CUA_VAO_TRINH_DIEN } from "@/lib/trinh-dien";

const T = (bat: boolean, pathname: string, that: string | null = null) =>
  chieuTrinhDien({ bat, pathname, that });

describe("công tắc trình diễn", () => {
  it("TẮT thì KHÔNG cửa nào bị che — kể cả ba cửa vào", () => {
    // Điều quan trọng nhất của cả gói: tắt là app trở lại y nguyên, không hoàn tác gì.
    for (const p of [...CUA_VAO_TRINH_DIEN, "/tuan-nay", "/quan-tri/mini-app"]) {
      expect(T(false, p), `tắt rồi mà ${p} vẫn bị che`).toBe(false);
    }
  });

  it("BẬT thì che ĐÚNG ba cửa vào", () => {
    expect(T(true, "/")).toBe(true);
    expect(T(true, "/login")).toBe(true);
    expect(T(true, "/home")).toBe(true);
  });

  it("BẬT vẫn KHÔNG che phần còn lại của app — giữa buổi trình bày còn mở được màn khác", () => {
    for (const p of ["/tuan-nay", "/diem-danh", "/ho-so", "/bao-cao", "/thi-dua", "/quan-tri/mini-app"]) {
      expect(T(true, p), `${p} bị che, đáng lẽ không`).toBe(false);
    }
  });

  it("`?that=1` là cửa sau vào app thật, ngay tại ba cửa bị che", () => {
    for (const p of CUA_VAO_TRINH_DIEN) expect(T(true, p, "1"), p).toBe(false);
    // Chỉ đúng chuỗi "1" — không nhận "true"/"yes"/rỗng, để cửa sau không bị mở nhầm
    // bởi một tham số nào đó tình cờ tên `that`.
    for (const v of ["true", "yes", "", "0", "1 "]) expect(T(true, "/", v), `that=${v}`).toBe(true);
  });

  it("KHÔNG BAO GIỜ che chính trang trình diễn — ca vòng lặp vô tận", () => {
    // `matcher` không loại `.html` và `.mp4`, nên cả ba đường dưới đây ĐỀU đi qua đây.
    for (const p of ["/trinh-dien/index.html", "/trinh-dien/uploads/intro-software.mp4", "/trinh-dien"]) {
      expect(T(true, p), `${p} bị viết lại về chính nó — trang trắng`).toBe(false);
    }
  });

  it("KHỚP CHÍNH XÁC, không khớp theo tiền tố — đây mới là chỗ thật sự canh được", () => {
    // Thử ngược 23/08/2026 dạy đúng một điều, và nó làm tôi phải sửa lại bài trên:
    // gỡ dòng `startsWith("/trinh-dien")` khỏi hàm thì bài đó VẪN XANH. Vì `Set.has` khớp
    // chính xác, `/trinh-dien/...` không bao giờ nằm trong ba cửa vào — chốt kia là lớp
    // phòng THỨ HAI, không phải lớp đang gánh việc. Nói thẳng ở đây thay vì để một bài
    // test trông như đang canh một thứ mà nó không canh.
    //
    // Cái CÓ THỂ hỏng thật là ngày ai đó đổi `Set.has` thành `startsWith` cho "gọn" —
    // lúc đó `/trinh-dien/...` khớp tiền tố `/` và vòng lặp dựng lại ngay. Ba dòng dưới
    // đây đỏ đúng vào ngày đó.
    expect(T(true, "/home/abc"), "khớp tiền tố: /home/abc không phải cửa vào").toBe(false);
    expect(T(true, "/login/x"), "khớp tiền tố: /login/x không phải cửa vào").toBe(false);
    expect(T(true, "/homework"), "khớp tiền tố: /homework không phải cửa vào").toBe(false);
  });

  it("ba cửa vào là ĐÚNG BA — thêm cửa thứ tư phải là một quyết định, không phải một lần gõ", () => {
    expect([...CUA_VAO_TRINH_DIEN].sort()).toEqual(["/", "/home", "/login"]);
  });
});

// ---------------------------------------------------------------------------
// TRANG TRÌNH DIỄN PHẢI PHỦ TRỌN MÀN
// ---------------------------------------------------------------------------
// Chủ đầu tư hỏi 23/08/2026: *"bạn đã cho chiều cao video bằng chiều cao màn chưa"*.
//
// Đọc chuỗi thừa kế trong CSS thì câu hỏi đó rút gọn được:
//
//     html      zoom: k                      ← thêm 23/08 để trang vừa màn nhỏ
//      └ .scene position:fixed; inset:0
//         └ .cin-bg position:absolute; inset:0; width:100%; height:100%; object-fit:cover
//
// `.cin-bg` bằng đúng `.scene`, và `object-fit:cover` luôn phủ kín hộp cả hai chiều. Nên
// "video có cao bằng màn không" = "`.scene` có bằng đúng màn không".
//
// Trước khi có `zoom` thì chắc chắn. SAU khi có, nó phụ thuộc vào việc trình duyệt giải
// nghĩa `position:fixed` trong hệ toạ độ đã thu nhỏ hay chưa — hai cách hiểu, hai kết quả,
// và cách hiểu sai để lộ viền trống ở mép phải và mép dưới.
//
// Nên script không dựa vào cách hiểu nào: nó ĐẶT THẲNG kích thước bằng số cho mọi phần tử
// phủ trọn màn. Bài test này canh đúng một điều — DANH SÁCH ĐÓ KHÔNG ĐƯỢC SÓT. Thêm một
// phần tử `fixed; inset:0` mới mà quên khai vào script thì nó hụt mép, và hụt lặng lẽ.
describe("trang trình diễn — mọi lớp phủ màn đều được ép kích thước", () => {
  const TRANG = readFileSync(
    join(fileURLToPath(new URL("../../", import.meta.url)), "apps/hub/public/trinh-dien/index.html"),
    "utf8",
  );

  /** Selector có `position:fixed` VÀ `inset:0` — tức khai ý định phủ trọn màn. */
  function phuTronMan(): string[] {
    const ra = new Set<string>();
    for (const m of TRANG.matchAll(/([#.][A-Za-z0-9_-]+)\{([^}]*)\}/g)) {
      if (m[2].includes("position:fixed") && m[2].includes("inset:0")) ra.add(m[1]);
    }
    return [...ra].sort();
  }

  it("script ép kích thước ĐÚNG danh sách phần tử phủ màn — không sót, không thừa", () => {
    const khai = TRANG.match(/var PHU_MAN = "([^"]+)"/);
    expect(khai, "không tìm thấy danh sách trong script").not.toBeNull();
    expect(khai![1].split(",").sort()).toEqual(phuTronMan());
  });

  it("có ít nhất `.scene` trong danh sách — nó là thứ quyết định chiều cao video", () => {
    // Mẫu số: nếu regex hỏng hoặc file đọc ra rỗng thì bài trên xanh vì hai mảng cùng rỗng.
    expect(phuTronMan()).toContain(".scene");
    expect(phuTronMan().length).toBeGreaterThanOrEqual(5);
  });

  it("video nền vẫn `inset:0` + `cover` — bỏ một trong hai là video hết phủ kín", () => {
    const bg = TRANG.match(/\.cin-bg\{([^}]*)\}/);
    expect(bg, "không tìm thấy .cin-bg").not.toBeNull();
    expect(bg![1]).toContain("inset:0");
    expect(bg![1]).toContain("height:100%");
    expect(bg![1]).toContain("object-fit:cover");
  });
});
