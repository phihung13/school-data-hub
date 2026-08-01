// tests/unit/dieu-khoan.test.ts — gói "man-dieu-khoan", lớp không cần Postgres.
//
// Ba nhóm, và nhóm 3 là nhóm dễ bị bỏ nhất nên nói trước: NỘI DUNG ĐIỀU KHOẢN LÀ MÃ
// NGUỒN CHỊU KIỂM. Đoạn văn phụ huynh ký nằm trong migration 0046; nó hứa thay mặt cả
// hệ thống, và một lần sửa chữ vô hại ("thông tin của con được mã hoá") biến nó thành
// một lời hứa mà hệ này CỐ Ý không giữ (ADR-002: không mã hoá, không schema riêng).
// Không có gì bắt được lỗi đó — không typecheck, không build, không màn hình nào lỗi.
// Nên nó nằm ở đây.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConsentChildStatus } from "@hub/core/contracts";
import { chuaTraLoiBanBatBuoc, canHoiDieuKhoan } from "@/server/consent-gate";
import {
  parseTermsBlocks,
  nhanQuyetDinh,
  nhanTrangThai,
  nhanTamTrang,
} from "@/components/dieu-khoan/terms-gate-view";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const migration = readFileSync(
  join(repoRoot, "packages", "core", "db", "migrations", "0046_dieu_khoan_dong_y.sql"),
  "utf8",
);
/**
 * Bản điều khoản ĐANG TRÌNH cho phụ huynh nằm ở migration 0047 (bản 2), không còn ở 0046.
 * Bản 1 là bằng chứng pháp lý và bất biến — sửa nó là điều hệ thống cấm — nên đường duy
 * nhất để nói lại cho đúng là công bố bản mới. Bài test phải soi bản NGƯỜI TA ĐANG ĐỌC;
 * soi bản cũ là canh một tờ giấy không ai còn ký.
 */
const migration47 = readFileSync(
  join(repoRoot, "packages", "core", "db", "migrations", "0047_duong_keu_cuu_khong_khoa.sql"),
  "utf8",
);
/**
 * Bỏ chú thích trước khi quét mã nguồn — BẮT BUỘC, cùng lý do với tests/unit/a11y.test.ts:
 * repo này viết comment dài kể lại vì sao KHÔNG làm một việc, nên chính chữ
 * "dangerouslySetInnerHTML" nằm trong lời kể sẽ bị đếm thành vi phạm.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");
}

const viewSrc = stripComments(
  readFileSync(join(repoRoot, "apps", "hub", "components", "dieu-khoan", "terms-gate-view.tsx"), "utf8"),
);

/** Đoạn văn phụ huynh thật sự đọc HÔM NAY — bản 2, trong migration 0047. */
function bodyMd(): string {
  const m = migration47.match(/\$md\$([\s\S]*?)\$md\$/);
  if (!m) throw new Error("Không tìm thấy thân bản điều khoản ($md$…$md$) trong migration 0047");
  return m[1]!;
}

/** Bản 1 (0046) — giữ lại để kiểm rằng nó KHÔNG bị sửa, không phải để kiểm nội dung. */
function bodyMdBan1(): string {
  const m = migration.match(/\$md\$([\s\S]*?)\$md\$/);
  if (!m) throw new Error("Không tìm thấy thân bản điều khoản ($md$…$md$) trong migration 0046");
  return m[1]!;
}

function child(over: Partial<ConsentChildStatus> = {}): ConsentChildStatus {
  return {
    studentId: "70000000-0000-0000-0000-000000000001",
    studentCode: "VA-2026-00417",
    studentName: "Nguyễn Văn Minh",
    decision: null,
    decidedAt: null,
    termsVersion: null,
    requiredVersion: 1,
    needsAction: true,
    accountStatus: "active",
    moodEnabled: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Cổng đẩy về /dieu-khoan — đẩy đúng người, và KHÔNG đẩy người đã trả lời
// ---------------------------------------------------------------------------
describe("cổng điều khoản: hỏi khi chưa hỏi, không hỏi lại người đã trả lời", () => {
  it("chưa bấm gì bao giờ → phải hỏi", () => {
    expect(chuaTraLoiBanBatBuoc(child({ decision: null }))).toBe(true);
  });

  it("đã đồng ý đúng bản đang bắt buộc → thôi hỏi", () => {
    expect(
      chuaTraLoiBanBatBuoc(child({ decision: "granted", termsVersion: 1, requiredVersion: 1, needsAction: false })),
    ).toBe(false);
  });

  it("đã trả lời KHÔNG → vẫn thôi hỏi, dù tài khoản của con còn chờ", () => {
    // Đây là chỗ dễ làm sai nhất và cũng là chỗ hại nhất: nếu cổng đọc `needsAction`
    // thay vì "đã được hỏi chưa" thì phụ huynh vừa bấm "chưa đồng ý" sẽ bị đưa lại đúng
    // màn hình đó ở MỌI lần mở trang chủ — quyết định của họ biến thành cái bẫy không có
    // đường ra, vì /dieu-khoan là nơi duy nhất họ bị đẩy tới.
    const c = child({ decision: "declined", termsVersion: 1, needsAction: true, accountStatus: "pending" });
    expect(c.needsAction).toBe(true);
    expect(chuaTraLoiBanBatBuoc(c)).toBe(false);
  });

  it("đã rút lại đồng ý → cũng thôi hỏi (đã trả lời rồi)", () => {
    expect(chuaTraLoiBanBatBuoc(child({ decision: "withdrawn", termsVersion: 1, needsAction: true }))).toBe(false);
  });

  it("trường công bố bản mới BUỘC bấm lại → hỏi lại, dù trước đó đã đồng ý", () => {
    // ADR-027 phương án B: bản mới đánh dấu `bat_dong_y_lai` là một câu hỏi MỚI,
    // không phải câu hỏi cũ hỏi lại.
    expect(
      chuaTraLoiBanBatBuoc(child({ decision: "granted", termsVersion: 1, requiredVersion: 2, needsAction: true })),
    ).toBe(true);
  });

  it("nhà hai con: một đứa chưa được hỏi là cổng vẫn đẩy", () => {
    const daXong = child({ decision: "granted", termsVersion: 1, needsAction: false });
    const chuaHoi = child({ studentId: "70000000-0000-0000-0000-000000000002", decision: null });
    expect(canHoiDieuKhoan([daXong])).toBe(false);
    expect(canHoiDieuKhoan([daXong, chuaHoi])).toBe(true);
  });

  it("không có con nào gắn với tài khoản → không đẩy đi đâu cả", () => {
    expect(canHoiDieuKhoan([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Màn hình nói đúng chuyện gì đang xảy ra
// ---------------------------------------------------------------------------
describe("câu chữ trên màn: bốn trạng thái tài khoản là bốn câu khác nhau", () => {
  it("'chưa có tài khoản' KHÔNG được nói thành 'đang chờ'", () => {
    // Đo trên hub_dev 01/08/2026: 63/64 học sinh chưa có tài khoản đăng nhập. Nói với
    // bố mẹ rằng tài khoản "đang chờ bố mẹ đồng ý" trong khi không có tài khoản nào để
    // chờ là đẩy họ đi tìm một cái nút giải quyết chuyện không tồn tại.
    const chua = nhanTrangThai(child({ accountStatus: "no_account" }));
    const cho = nhanTrangThai(child({ accountStatus: "pending" }));
    expect(chua).not.toBe(cho);
    expect(chua).toMatch(/chưa có tài khoản/i);
    expect(cho).toMatch(/chờ/i);
  });

  it("bốn trạng thái cho bốn câu, không câu nào trùng", () => {
    const cau = (["no_account", "pending", "active", "disabled"] as const).map((s) =>
      nhanTrangThai(child({ accountStatus: s })),
    );
    expect(new Set(cau).size).toBe(4);
  });

  it("màn hình nói được thứ cú bấm ĐIỀU KHIỂN, không chỉ thứ nó không điều khiển (0047)", () => {
    // Nếu phụ huynh không đọc được hậu quả của cú bấm bằng một dòng tiếng Việt thì họ đang
    // ký vào một thứ chỉ máy hiểu.
    const bat = nhanTamTrang(child({ moodEnabled: true }));
    const tat = nhanTamTrang(child({ moodEnabled: false }));
    expect(bat).not.toBe(tat);
    expect(bat).toMatch(/đang bật/i);
    expect(tat).toMatch(/đang tắt/i);
  });

  it("nhà hai người đại diện: người kia đã bấm thì nói ĐANG BẬT, dù mình còn phải trả lời", () => {
    // Suy từ `needsAction` là nói với một người bố rằng phần mềm không ghi tâm trạng con
    // mình, trong khi nó có ghi — vì mẹ em đã đồng ý.
    const c = child({ decision: null, needsAction: true, moodEnabled: true });
    expect(nhanTamTrang(c)).toMatch(/đang bật/i);
  });

  it("'chưa trả lời' khác 'đã rút lại' khác 'đã trả lời không'", () => {
    const cau = [
      nhanQuyetDinh(child({ decision: null })),
      nhanQuyetDinh(child({ decision: "declined", termsVersion: 1 })),
      nhanQuyetDinh(child({ decision: "withdrawn", termsVersion: 1 })),
      nhanQuyetDinh(child({ decision: "granted", termsVersion: 1 })),
    ];
    expect(new Set(cau).size).toBe(4);
  });

  it("đồng ý bản CŨ được nói ra, không trình bày như đã xong", () => {
    const cu = nhanQuyetDinh(child({ decision: "granted", termsVersion: 1, requiredVersion: 2 }));
    expect(cu).toMatch(/bản cũ/i);
    expect(cu).not.toBe(nhanQuyetDinh(child({ decision: "granted", termsVersion: 2, requiredVersion: 2 })));
  });
});

// ---------------------------------------------------------------------------
// 3. Nội dung điều khoản: nguồn duy nhất là CSDL, và không hứa thứ hệ chưa làm
// ---------------------------------------------------------------------------
describe("nội dung điều khoản là mã nguồn chịu kiểm", () => {
  it("màn hình đọc nội dung từ CSDL, không viết chết trong tsx (mệnh lệnh 7)", () => {
    expect(viewSrc).toContain("terms.bodyMd");
    // Nếu ai đó chép đoạn văn vào component cho tiện thì sẽ có hai bản, và bản phụ huynh
    // ĐỌC không còn là bản họ KÝ (băm nội dung neo vào bản trong CSDL).
    expect(viewSrc).not.toContain("Ba điều trường cam kết");
    expect(viewSrc).not.toContain("Trường ghi lại những gì");
  });

  it("KHÔNG hứa mã hoá — ADR-002 chốt là không mã hoá, không schema riêng", () => {
    const body = bodyMd();
    expect(body).not.toMatch(/mã ho[áa]/i);
    expect(body).not.toMatch(/encrypt/i);
  });

  it("KHÔNG hứa những thứ chưa xây", () => {
    const body = bodyMd();
    // Nút tự rút lại chưa có (DEBT #40) — bản điều khoản phải nói "gửi yêu cầu tới nhà
    // trường", và nó có nói. Điều bị cấm là hứa một thao tác trên ứng dụng.
    expect(body).toMatch(/gửi yêu cầu tới nhà trường/i);
    // Phụ huynh KHÔNG xem được tâm trạng từng ngày (ADR-025/026). Bản điều khoản phải
    // nói đúng chiều đó, không được hứa ngược.
    expect(body).toMatch(/không\*{0,2}\s*đọc được tâm trạng từng ngày/i);
  });

  it("nói đủ hai lời hứa công khai mà §3/§5 buộc trường giữ", () => {
    const body = bodyMd();
    expect(body, "thiếu lời hứa không dùng cảm xúc để xếp loại (§5)").toMatch(/không dùng cảm xúc để chấm điểm/i);
    expect(body, "thiếu lời hứa xoá chi tiết cảm xúc sau 12 tháng (§3)").toMatch(/12 tháng/);
  });

  it("nói rõ cái KHÔNG bị chặn — nếu không thì màn hình đang doạ người bằng điều không đúng", () => {
    const body = bodyMd();
    expect(body).toMatch(/vẫn điểm danh cho/i);
    expect(body).toMatch(/thầy cô ghi giúp con/i);
    // Cùng một sự thật phải có mặt trên màn hình, không chỉ trong bản điều khoản: phụ
    // huynh đọc dải màu xanh trước khi đọc hết đoạn văn.
    expect(viewSrc).toMatch(/vẫn điểm danh cho con/i);
  });

  // -------------------------------------------------------------------------
  // 0047 (ADR-027 bản 2) — CÂU ĐÃ NÓI SAI VỚI PHỤ HUYNH, VÀ CÂU THAY THẾ
  // -------------------------------------------------------------------------
  it("bản đang trình KHÔNG còn hứa khoá tài khoản của con", () => {
    // Bản 1 viết "Tài khoản đăng nhập của con **chưa được bật**". Câu đó vừa sai (0047 thôi
    // dùng danh tính làm công tắc đồng ý) vừa che một chỗ hỏng chết người: khoá tài khoản
    // của em là khoá luôn nút "Mình cần gặp thầy cô" của chính em.
    const body = bodyMd();
    expect(body).not.toMatch(/chưa được bật/i);
    expect(body, "không được nói tài khoản của con ở trạng thái chờ").not.toMatch(
      /tài khoản của con.{0,30}(chờ|khoá|tắt)/i,
    );
    // Và phải nói ra câu THAY THẾ, đúng thứ đang chạy.
    expect(body).toMatch(/không ghi tâm trạng của con/i);
    expect(body, "phải nói thẳng tài khoản của con vẫn dùng được").toMatch(
      /tài khoản của con vẫn dùng được/i,
    );
  });

  it("bản đang trình hứa đúng ĐIỀU KHÔNG BAO GIỜ KHOÁ — nút kêu cứu của đứa trẻ", () => {
    const body = bodyMd();
    expect(body).toMatch(/vẫn bấm được/i);
    expect(body, "phải nói rõ kể cả sau khi bố mẹ rút lại").toMatch(/sau khi bố mẹ rút lại/i);
    // Lời hứa in trên màn hình là ràng buộc kỹ thuật: câu này cũng phải có mặt ở dải xanh
    // của /dieu-khoan, không chỉ nằm trong đoạn văn dài.
    expect(viewSrc).toMatch(/vẫn bấm được/i);
  });

  it("bản 1 KHÔNG bị sửa — nói lại cho đúng là công bố bản mới, không phải viết đè", () => {
    // `core.terms_versions` bất biến sau khi công bố (trigger, không có cửa thoát hiểm).
    // Nếu ai đó "sửa cho nhanh" ngay trong 0046 thì mọi phiếu "đồng ý bản 1" thành giấy
    // trắng — bài này canh đúng chỗ đó, ở tầng mã nguồn.
    expect(bodyMdBan1()).toMatch(/chưa được bật/i);
    expect(migration47).toMatch(/insert into core\.terms_versions/);
    // Bản 2 KHÔNG được đánh dấu bắt bấm lại: nó không mở rộng dữ liệu thu thập, và đánh dấu
    // true là tắt tâm trạng của toàn bộ học sinh đang dùng vì một lần sửa câu chữ.
    const chen = migration47.slice(migration47.indexOf("insert into core.terms_versions"));
    expect(chen).toMatch(/\n\s*false,\n/);
  });

  it("cổng đồng ý KHÔNG còn chạm vào danh tính của đứa trẻ (0047)", () => {
    // Đây là bài canh cái hỏng gốc. `core.record_consent` mà gọi lại một hàm ghi vào
    // `core.users` là quay về đúng lối đã cắt đường kêu cứu của một đứa trẻ.
    const fn = migration47.slice(migration47.indexOf("create or replace function core.record_consent"));
    // Bỏ chú thích trước khi quét — cùng lý do với `stripComments` ở đầu file: thân hàm CÓ
    // kể lại dòng đã bị gỡ ("v_status := core.sync_student_account_status(...)  -- 0046"),
    // và chính lời kể đó sẽ bị đếm thành vi phạm.
    const than = fn
      .slice(0, fn.indexOf("comment on function core.record_consent"))
      .replace(/^\s*--.*$/gm, "");
    expect(than).not.toMatch(/update\s+core\.users/i);
    expect(than).not.toContain("core.sync_student_account_status");
    // Và hàm đồng bộ trạng thái bị bỏ HẲN, không để lại một cái tên gọi được.
    expect(migration47).toMatch(/drop function if exists core\.sync_student_account_status/);
  });
});

// ---------------------------------------------------------------------------
// 4. Bộ dựng Markdown tối thiểu — không đường nào chạy HTML thô
// ---------------------------------------------------------------------------
describe("bộ dựng Markdown của bản điều khoản", () => {
  it("dựng tiêu đề, đoạn văn và danh sách", () => {
    const blocks = parseTermsBlocks("## Tiêu đề\n\nMột đoạn văn.\n\n- gạch một\n- gạch hai\n");
    expect(blocks.map((b) => b.kind)).toEqual(["h2", "p", "ul"]);
  });

  it("dòng nối tiếp của một gạch đầu dòng không bị tách thành đoạn riêng", () => {
    const blocks = parseTermsBlocks("- câu dài\n  xuống dòng cho vừa\n");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ kind: "ul", items: ["câu dài xuống dòng cho vừa"] });
  });

  it("bản điều khoản THẬT bóc ra được, không rơi hết vào một đoạn văn", () => {
    const blocks = parseTermsBlocks(bodyMd());
    expect(blocks.filter((b) => b.kind === "h2").length).toBeGreaterThanOrEqual(4);
    expect(blocks.filter((b) => b.kind === "ul").length).toBeGreaterThanOrEqual(3);
  });

  it("KHÔNG dùng dangerouslySetInnerHTML ở bất kỳ đâu trong màn này", () => {
    // Nguồn của chuỗi là một cột trong CSDL. Bơm nó vào trang dưới dạng HTML là mở một
    // lối chạy mã tuỳ ý ngay trên trang phụ huynh bấm nút pháp lý.
    expect(viewSrc).not.toContain("dangerouslySetInnerHTML");
  });
});
