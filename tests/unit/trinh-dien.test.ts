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

// ---------------------------------------------------------------------------
// VIDEO INTRO — vừa màn, và chạy trước khi lộ diện
// ---------------------------------------------------------------------------
// Chủ đầu tư 23/08/2026: *"vẫn hơi khựng, cho nó bắt đầu dần đi trước khi cái nền đen tắt
// đi thì mượt hơn, ngoài ra tôi thấy video intro vẫn hơi to về chiều cao"*.
//
// Đọc mã ra hai nguyên nhân riêng, và cả hai đều dễ mất khi đồng bộ lại từ Claude Design:
//
//   1. Thẻ `#intro-video` mang `transform: scale(1.06)`, chỉ thu về `scale(1)` SAU khi sự
//      kiện `playing` bắn. Buffer chậm thì nó ngồi ở 6% quá khổ suốt thời gian chờ — đúng
//      cái "hơi to về chiều cao". Đã bỏ hẳn transform; hiệu ứng lộ diện còn lại `opacity`.
//
//   2. `startShow()` là chỗ DUY NHẤT gọi `play()`, mà nó chạy ở t=900ms trong
//      `showFromPanel()` — đúng lúc khối đen sắp tan. Tải và giải mã đều bắt đầu từ đó.
//      Đã thêm `chayTruoc()` gọi ngay tại `go-dark` (t=0): video chạy câm suốt 900ms màn
//      còn đen, rồi `startShow()` tua về 0 (miễn phí, vùng đó đã đệm) và mở tiếng.
describe("video intro — vừa màn và chạy trước khi lộ diện", () => {
  const TRANG = readFileSync(
    join(fileURLToPath(new URL("../../", import.meta.url)), "apps/hub/public/trinh-dien/index.html"),
    "utf8",
  );

  it("KHÔNG có transform trên thẻ video — mọi transform đều làm nó lệch khỏi màn", () => {
    const the = TRANG.match(/<video id="intro-video"[^>]*>/);
    expect(the, "không tìm thấy thẻ #intro-video").not.toBeNull();
    // Bất kỳ transform nào cũng thu/phóng video khỏi đúng kích thước màn, và nó nằm im ở
    // trạng thái sai suốt thời gian chờ buffer. Cấm cả họ, không chỉ cấm `scale(1.06)`.
    expect(the![0], "thẻ video mang transform — sẽ lệch khỏi màn khi buffer chậm").not.toMatch(
      /transform\s*:/,
    );
    // Và JS cũng không được đặt lại.
    expect(TRANG, "JS đặt transform cho video intro").not.toContain("introVideo.style.transform");
  });

  it("video chạy TRƯỚC, ngay lúc màn bắt đầu đen — không đợi tới lúc lộ diện", () => {
    expect(TRANG, "thiếu hàm chạy trước").toContain("function chayTruoc()");
    const i = TRANG.indexOf("function showFromPanel()");
    const than = TRANG.slice(i, TRANG.indexOf("\n}", i));
    const goDark = than.indexOf('classList.add("go-dark")');
    const goi = than.indexOf("chayTruoc();");
    expect(goDark, "không thấy go-dark").toBeGreaterThan(-1);
    expect(goi, "showFromPanel không gọi chayTruoc").toBeGreaterThan(-1);
    // Phải gọi Ở PHA ĐẦU, không phải trong setTimeout của pha sau — cả 900ms màn đen mới
    // là thứ đang mua được. Gọi muộn hơn thì mua được ít hơn, và bài này không thấy.
    expect(goi - goDark, "gọi quá xa go-dark — có thể đã rơi vào pha sau").toBeLessThan(200);
  });

  it("chạy trước phải CÂM, và startShow phải tua về đầu", () => {
    const i = TRANG.indexOf("function chayTruoc()");
    const than = TRANG.slice(i, TRANG.indexOf("\n}", i));
    expect(than, "chạy trước mà không câm — người xem nghe tiếng lúc màn còn đen").toContain(
      "introVideo.muted = true",
    );
    // Không tua về đầu thì người xem mất ~0,9 giây đầu của đoạn intro.
    expect(TRANG).toMatch(/currentTime > 0\.0\d.*currentTime = 0/s);
  });
});

// ---------------------------------------------------------------------------
// AV1 TRƯỚC, H.264 SAU — và cái bẫy làm mất hẳn đường lui
// ---------------------------------------------------------------------------
// Chủ đầu tư 23/08/2026: *"video intro hơi mờ, có phải bạn giảm chất lượng ko"* — có, và
// đo được: VMAF của bản H.264 2,9 Mbps chỉ **89,5**, đúng mức mắt bắt đầu thấy mờ. SSIM
// 0,972 mà tôi tin trước đó đo cấu trúc, không đo độ nét.
//
// Rồi: *"có cách nào giảm dung lượng nhưng chất lượng giữ nguyên"* — có, đổi codec.
// Cùng nguồn 4K, cùng 1080p24, đo bằng VMAF so nguồn xuống thang:
//
//     H.264  3,44 MB  →  89,5      (đang chạy, mờ)
//     AV1    2,51 MB  →  94,9      nhỏ hơn VÀ nét hơn
//     AV1    3,58 MB  →  97,7      ← chọn: cùng cỡ, chất lượng nhảy 8 điểm
//     AV1    5,16 MB  →  99,1
//     H.264 10,32 MB  →  99,5      H.264 cần GẤP BA để bằng AV1
//
// BÀI NÀY CANH ĐƯỜNG LUI, không canh chất lượng. Hai cách làm mất nó, cả hai đều im lặng:
//
//   1. Thẻ `<video>` mang `src=` trực tiếp. Thuộc tính đó ÁT hết mọi `<source>` bên trong,
//      nên bản AV1 không bao giờ được dùng — hoặc tệ hơn, nếu `src` trỏ bản AV1 thì máy
//      không đọc được AV1 sẽ chết hẳn thay vì rơi xuống H.264.
//   2. Hai `<source>` cùng ghi `type="video/mp4"` trơn. Trình duyệt không có cách nào biết
//      cái đầu là AV1, nó nhận cái đầu rồi chết ở đó. Chuỗi codec RFC 6381 phải khai chính
//      xác — `av01.0.08M.08`, lấy từ ffprobe: Main profile, level 8, tier Main, 8 bit.
describe("trang trình diễn — AV1 trước, H.264 làm đường lui", () => {
  const TRANG = readFileSync(
    join(fileURLToPath(new URL("../../", import.meta.url)), "apps/hub/public/trinh-dien/index.html"),
    "utf8",
  );

  it("KHÔNG thẻ <video> nào mang `src=` — nó át hết <source> bên trong", () => {
    expect(TRANG, "còn <video src=…>, bản AV1 sẽ không bao giờ được dùng").not.toMatch(
      /<video[^>]*\ssrc=/,
    );
  });

  it("mỗi video có ĐÚNG hai nguồn: AV1 trước, H.264 sau", () => {
    for (const the of ['<video class="cin-bg"', '<video id="intro-video"']) {
      const i = TRANG.indexOf(the);
      expect(i, `không thấy ${the}`).toBeGreaterThan(-1);
      const khoi = TRANG.slice(i, TRANG.indexOf("</video>", i));
      // Thuộc tính dùng nháy đơn bọc ngoài, nháy kép bên trong — bắt cả hai kiểu.
      // Thuộc tính dùng nháy ĐƠN bọc ngoài, nháy KÉP bên trong:
      //     type='video/mp4; codecs="av01.0.08M.08"'
      // Bản đầu của regex này dừng ở dấu nháy kép đầu tiên nên chỉ lấy được nửa chuỗi.
      const src = [...khoi.matchAll(/<source src="([^"]+)"[^>]*type=('[^']*'|"[^"]*")/g)].map(
        (m) => [m[1], m[2].slice(1, -1)] as const,
      );
      expect(src.length, `${the} không có đúng 2 nguồn`).toBe(2);
      expect(src[0][1], "nguồn đầu phải khai codec AV1").toContain("av01.0.08M.08");
      expect(src[1][1].trim(), "nguồn hai phải là mp4 trơn (H.264)").toBe("video/mp4");
      expect(src[0][0], "nguồn đầu phải là file av1").toMatch(/av1\.mp4$/);
    }
  });

  it("hai nguồn KHÔNG được cùng một kiểu — trùng kiểu là mất đường lui", () => {
    // Nếu cả hai cùng `video/mp4` trơn thì trình duyệt nhận cái đầu rồi chết ở đó.
    const kieu = [...TRANG.matchAll(/<source[^>]*type=('[^']*'|"[^"]*")/g)].map((m) =>
      m[1].slice(1, -1).trim(),
    );
    expect(kieu.length).toBe(4);
    expect(new Set(kieu).size, "bốn nguồn chỉ có một kiểu — không phân biệt được").toBe(2);
  });
});
