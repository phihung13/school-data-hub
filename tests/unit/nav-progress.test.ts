// tests/unit/nav-progress.test.ts — thanh "đang chuyển trang" chỉ được bật ĐÚNG LÚC.
//
// Vì sao đây mới là phần đáng test, chứ không phải hoạt ảnh: một thanh tiến trình bật
// nhầm thì nó chạy rồi KHÔNG BAO GIỜ tắt (vì đường dẫn không đổi, mà nó chỉ tắt khi
// đường dẫn đổi). Người dùng nhìn thấy vài lần như vậy là học được rằng thanh đó vô
// nghĩa — và từ đó nó không còn nói được gì kể cả khi nói đúng.
//
// Bốn ca bật nhầm dễ gặp nhất, và cả bốn đều có thật ở Hub: mở tab mới bằng Ctrl-click
// (menu nổi của mini app có nút "mở tab ngoài"), tải file, link ra domain khác
// (factory.vietanh.org), và bấm vào chính mục đang đứng ở thanh điều hướng.
import { describe, it, expect, beforeAll } from "vitest";
import { laChuyenTrangNoiBo } from "@/components/ui/nav-progress";

const GOC = "https://hub.truongvietanh.com";

beforeAll(() => {
  // Hàm đọc window.location.origin để biết thế nào là "trong Hub".
  Object.defineProperty(globalThis, "window", {
    value: { location: { origin: GOC } },
    writable: true,
    configurable: true,
  });
});

const link = (p: Partial<Parameters<typeof laChuyenTrangNoiBo>[0]> = {}) => ({
  href: "/gvcn",
  target: "",
  download: "",
  origin: GOC,
  pathname: "/gvcn",
  ...p,
});

describe("thanh chuyển trang · BẬT đúng lúc", () => {
  it("bấm một mục điều hướng trong Hub, sang trang khác → bật", () => {
    expect(laChuyenTrangNoiBo(link(), "/home", false)).toBe(true);
  });
});

describe("thanh chuyển trang · KHÔNG bật nhầm (phần quan trọng hơn)", () => {
  it("Ctrl/Cmd-click mở tab mới — trang hiện tại KHÔNG đổi, bật là kẹt vĩnh viễn", () => {
    expect(laChuyenTrangNoiBo(link(), "/home", true)).toBe(false);
  });

  it('target="_blank" — cùng lý do trên', () => {
    expect(laChuyenTrangNoiBo(link({ target: "_blank" }), "/home", false)).toBe(false);
  });

  it("link tải file — trang không đi đâu cả", () => {
    expect(laChuyenTrangNoiBo(link({ download: "bao-cao.pdf" }), "/home", false)).toBe(false);
  });

  it("link ra ngoài Hub (app ngoài) — Hub không chuyển trang", () => {
    expect(
      laChuyenTrangNoiBo(link({ origin: "https://factory.vietanh.org" }), "/home", false),
    ).toBe(false);
  });

  it("bấm vào CHÍNH mục đang đứng — không có gì để chờ", () => {
    // Ca này gặp thật mỗi ngày: thanh dưới điện thoại luôn có mục của trang hiện tại.
    expect(laChuyenTrangNoiBo(link({ pathname: "/gvcn" }), "/gvcn", false)).toBe(false);
  });

  it("neo trong trang (#) — cuộn chứ không chuyển trang", () => {
    expect(laChuyenTrangNoiBo(link({ href: "#noi-dung", pathname: "" }), "/home", false)).toBe(false);
  });
});
