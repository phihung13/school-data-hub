// tests/unit/popup-checkin-khong-hoi-hai-lan.test.ts — năm lỗi của popup check-in,
// mỗi lỗi một người canh (rà 21/08/2026).
//
// Chủ đầu tư mở app lên và nói đúng hai câu: *"nó bị full màn, rồi checkin 2 lần"*.
// Rà lại bằng cách ĐỌC MÃ và ĐO HTML thật (không đoán), ra năm lỗi — bốn cái nhìn thấy
// được, một cái chỉ người dùng trình đọc màn hình gặp:
//
//   1. Câu hỏi in HAI LẦN trong chính popup: `HopThoai` in tiêu đề "Hôm nay con thấy
//      thế nào?", rồi màn chọn in tiếp "Hôm nay em thấy thế nào?" — lệch cả đại từ.
//   2. Popup mở ra bằng một VÒNG QUAY CHỜ ("Đang xem hôm nay con đã check-in chưa…"),
//      tức hỏi lại máy chủ đúng thứ máy chủ vừa trả lời để quyết định mở popup.
//   3. Thẻ check-in trên TRANG CHỦ hỏi lần thứ ba, cùng lúc.
//   4. Bốn ô cảm xúc cao 148px — dựng cho một TRANG. Cộng lại 308px trên tổng ~640px
//      của cả hộp; ở khổ iPhone 14 (vùng thật ~660px) thì viền mờ chỉ còn 16px và mắt
//      không đọc ra "đây là một lớp phủ". Đó là "full màn".
//   5. Nền sau popup KHÔNG bị `inert`: bẫy Tab của hộp thoại không che được con trỏ ảo
//      của trình đọc màn hình, nên người dùng NVDA/VoiceOver vẫn đọc được nguyên trang
//      phía sau — gồm cả lời mời check-in thứ hai.
//
// Bài này canh bằng cách đọc NGUỒN, vì bốn trong năm lỗi là lỗi cấu trúc: chúng quay
// lại đúng lúc ai đó "dọn cho gọn" một điều kiện trông thừa.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const goc = fileURLToPath(new URL("../../", import.meta.url));
const doc = (p: string) => readFileSync(join(goc, p), "utf8");

/** Bỏ chú thích: cả ba file dưới đây giải thích chính những chuỗi mà bài này đi tìm. */
const boChuThich = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");

const CHECKIN_VIEW = doc("apps/hub/components/checkin-view.tsx");
const CONG = doc("apps/hub/components/cong-checkin.tsx");
const HOME = doc("apps/hub/components/home-view.tsx");
const MOOD_TILE = doc("apps/hub/components/mood-tile.tsx");

describe("popup check-in — năm lỗi đã sửa, mỗi lỗi một người canh", () => {
  it("1. tiêu đề màn chọn CHỈ in khi KHÔNG ở trong popup", () => {
    // Popup đã hỏi ở tiêu đề hộp thoại. In lại là hỏi hai lần và lệch đại từ.
    // Bỏ chú thích TRƯỚC khi đo khoảng cách: khối lý lẽ giữa hai chỗ dài hơn cửa sổ dò,
    // nên bản đầu của assertion này đỏ vì chính lời giải thích của nó.
    const ma = boChuThich(CHECKIN_VIEW);
    const i = ma.indexOf('"Hôm nay em thấy thế nào?"');
    expect(i, "không tìm thấy tiêu đề màn chọn").toBeGreaterThan(0);
    expect(ma.slice(Math.max(0, i - 300), i)).toContain("!trongPopup");
  });

  it("2. `checkinStage` bỏ qua vòng quay chờ khi máy chủ ĐÃ BIẾT", () => {
    // Cắt tới `return args.checkedInToday` chứ không tới `\n}`: KIỂU THAM SỐ của hàm
    // kết thúc bằng một dòng `}): CheckinStage {`, nên `\n}` khớp ngay ở đó và thân hàm
    // bị cắt cụt — bản đầu của assertion này đỏ vì đúng chuyện đó, và đỏ theo hướng
    // nguy hiểm: nó báo "thiếu nhánh" trong khi nhánh có thật.
    const ma = boChuThich(CHECKIN_VIEW);
    const i = ma.indexOf("export function checkinStage");
    const than = ma.slice(i, ma.indexOf("return args.checkedInToday", i));
    // Nhánh phải đứng TRƯỚC `isPending`, nếu không thì vòng quay vẫn thắng.
    const viTriBiet = than.indexOf("mayChuDaBietChuaKhai) return");
    const viTriCho = than.indexOf("isPending) return");
    expect(viTriBiet, "thiếu nhánh máy chủ đã biết").toBeGreaterThan(0);
    expect(viTriBiet, "nhánh đã-biết phải đứng TRƯỚC nhánh đang-chờ").toBeLessThan(viTriCho);
    // Và phải đứng SAU `wantsChange`: em tự bấm đổi thì luôn ra ô chọn.
    expect(than.indexOf("wantsChange) return")).toBeLessThan(viTriBiet);
  });

  it("3. thẻ check-in trang chủ TỰ TẮT khi cổng đang khoá", () => {
    const i = HOME.indexOf("function CheckinCardMobile");
    const than = boChuThich(HOME.slice(i, i + 1200));
    expect(than).toContain("dangKhoa");
    expect(than).toMatch(/if\s*\(dangKhoa\)\s*return null/);
  });

  it("4. ô cảm xúc có chế độ GỌN cho popup, và popup dùng nó", () => {
    expect(boChuThich(MOOD_TILE)).toContain('gon ? "h-[112px]" : "h-[148px]"');
    // Cả bốn ô đều phải truyền cờ — sót một ô là một hàng cao một hàng thấp.
    const soO = (CHECKIN_VIEW.match(/<MoodTile mood=\{\d\} gon=\{trongPopup\}/g) ?? []).length;
    expect(soO, "không đủ bốn ô truyền cờ gọn").toBe(4);
  });

  it("5. nền bị `inert` NGAY TRONG HTML máy chủ, không đợi hydrate", () => {
    // Bản đầu đặt bằng `useEffect` và đo ra thuộc tính KHÔNG có trong HTML máy chủ —
    // effect chỉ chạy sau khi hydrate. Phải là một prop trong JSX.
    const maCong = boChuThich(CONG);
    expect(maCong).toContain('dangMo ? { inert: "" } : {}');
    expect(maCong).toMatch(/<div \{\.\.\.nenInert\}>\{children\}<\/div>/);
    expect(maCong, "quay lại dùng useEffect thì HTML máy chủ lại hở").not.toContain("useEffect");
  });

  it("6. CHỈ MỘT bản popup check-in trong kho — không còn `CheckinModal` của trang chủ", () => {
    // Lượt rà thứ hai (chủ đầu tư: *"vẫn còn, checkin 2 lần… có 2 loại checkin"*).
    // `home-view.tsx` có sẵn MỘT popup check-in riêng, tự mở bằng useEffect khi
    // `checkedInToday === false`, với lưới cảm xúc riêng và đường gửi riêng. Nó ra đời
    // trước cổng ADR-036, và tôi thêm cổng mà không thấy nó — nên trên máy tính em nhận
    // HAI popup chồng nhau.
    const ma = boChuThich(HOME);
    expect(ma, "CheckinModal của trang chủ đã gỡ, đừng dựng lại").not.toContain("function CheckinModal");
    expect(ma, "và cả cái effect tự mở nó").not.toContain("setModalOpen");
    // Thẻ máy tính Ở LẠI (khổ máy tính không có thanh tab, nó là đường duy nhất để mở
    // lại popup) — nhưng nút của nó phải gọi popup CHUNG, và phải tắt khi cổng đang khoá.
    const the = ma.slice(ma.indexOf("function CheckinCardDesktop"), ma.indexOf("function ThisWeekCard"));
    expect(the).toContain("moCheckin");
    expect(the).toMatch(/if\s*\(dangKhoa\)\s*return null/);
  });

  it("7. `CheckinView` tải RỜI khỏi gói của layout gốc", () => {
    // Cổng đứng ở layout gốc = có mặt trên MỌI trang. Import thẳng `CheckinView` (~950
    // dòng, kèm hàng đợi IndexedDB) là kéo nó vào gói JS của mọi trang, kể cả trang của
    // giáo viên và của em đã khai xong. Gói nặng thì hydrate lâu, mà trang chủ chỉ chọn
    // được bố cục máy tính SAU hydrate — nên cú nháy "hiện bản điện thoại rồi mới đổi"
    // dài ra đúng bằng phần vừa thêm.
    const ma = boChuThich(CONG);
    expect(ma).toContain('dynamic(() => import("./checkin-view")');
    expect(ma, "import thẳng là kéo lại vào gói mọi trang").not.toMatch(
      /import \{ CheckinView \} from "\.\/checkin-view"/,
    );
  });

  it("8. gợi ý khổ màn đọc ở module SERVER, không phải module `\"use client\"`", () => {
    // `lib/viewport.ts` mở đầu bằng `"use client"`, nên mọi thứ nó xuất ra đều là tham
    // chiếu client: Server Component import hàm từ đó sẽ nhận cái vỏ và nổ
    // `TypeError: … is not a function`. Đo được: trang chủ trả **500** ở lượt chạy đầu.
    // Bỏ chú thích trước khi soi: chính file đó GIẢI THÍCH vì sao nó không được có
    // `"use client"`, nên soi cả chú thích là bài test đỏ vì lời giải thích của nó —
    // lần thứ tư trong buổi này tôi mắc đúng lỗi ấy.
    const khoMan = boChuThich(doc("apps/hub/lib/kho-man.ts"));
    expect(khoMan, "file này phải dùng được ở server").not.toContain('"use client"');
    expect(boChuThich(doc("apps/hub/lib/viewport.ts"))).not.toContain("export function khoManTuHeader");
  });

  it("9. bấm xong là ĐÓNG NGAY, và ca 'chưa có phiếu' KHÔNG bị nhốt vĩnh viễn", () => {
    // Chủ đầu tư 21/08/2026: *"chỉ cần ấn vào icon là được, ẩn đi, không cần hiện lên
    // xác nhận"*. Popup đóng ngay khi máy chủ nhận lượt bấm.
    //
    // Cái bẫy suýt dựng khi làm việc đó: để `CheckinView` IM LẶNG ở ca `moodBlocked`
    // (nhà chưa có phiếu đồng ý — máy chủ nhận lượt điểm danh nhưng không nhận mức tâm
    // trạng). Im lặng thì cổng không bao giờ mở khoá, và em bị nhốt trong một popup đòi
    // đúng thứ em KHÔNG THỂ làm. Bài `cong-checkin.test.ts` không bắt được — nó đo hàm
    // thuần, còn bẫy nằm ở phía GỌI.
    //
    // Luật: báo ở CẢ HAI ca, và nói rõ tâm trạng có vào kho không.
    const ma = boChuThich(CHECKIN_VIEW);
    expect(ma, "phải báo ở MỌI ca, kèm cả hai cờ").toContain(
      'onGhiXong?.({ moodSaved: !moodBlocked, choMang: queuedOffline })',
    );
    expect(ma, "gài điều kiện vào lời gọi là nhốt em vĩnh viễn").not.toMatch(
      /"success" &&[^)]*\)\s*onGhiXong/,
    );

    // Và phía nhận: mở khoá TRƯỚC, rồi mới xét có đóng hay không.
    const maCong = boChuThich(CONG);
    const i = maCong.indexOf("function ghiXong");
    const than = maCong.slice(i, i + 400);
    expect(than.indexOf("setDaGhi(true)")).toBeGreaterThan(0);
    expect(than.indexOf("setDaGhi(true)"), "mở khoá phải đứng TRƯỚC nhánh thoát sớm").toBeLessThan(
      than.indexOf("return"),
    );

    // ĐÚNG HAI NGOẠI LỆ, và ca chờ mạng là ngoại lệ tôi suýt bỏ sót: mất mạng thì lượt
    // bấm nằm trong hàng đợi, `getTodayStatus` không được dọn, nên thẻ trang chủ vẫn đọc
    // bản cũ và MỜI EM CHECK-IN LẦN NỮA. Đóng sập ở đó là dựng lại "check-in 2 lần".
    expect(than, "phải ở lại cả ca chưa-có-phiếu lẫn ca chờ-mạng").toContain(
      "if (!moodSaved || choMang) return",
    );
  });

  it("chế độ khoá cứng vẫn KHÔNG có nút đóng — hàng rào chính không bị dọn nhầm", () => {
    // Bốn lỗi trên đều sửa bằng cách BỚT thứ trong popup. Câu này đứng cạnh để lần dọn
    // sau không bớt luôn thứ làm nên cái cổng.
    const hopThoai = boChuThich(doc("apps/hub/components/ui/hop-thoai.tsx"));
    expect(hopThoai).toContain("{!batBuoc && (");
    expect(hopThoai).toContain("if (!batBuoc) onDong();");
  });
});
