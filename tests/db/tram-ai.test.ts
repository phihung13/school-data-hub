// tests/db/tram-ai.test.ts — trạm AI, sáu bước và thứ tự của chúng (§7 + ADR-034).
//
// Bài này gọi `hoiAi` với một nhà cung cấp GIẢ, trên Postgres THẬT. Nhà cung cấp giả là
// lý do giao diện `NhaCungCap` tồn tại: đo được trọn trạm mà không gọi ra Internet và
// không cần khoá thật — và quan trọng hơn, **đo được cả những lượt trạm KHÔNG gọi ai**,
// thứ mà một bài test đi ra mạng thật không phân biệt nổi với một lượt gọi hỏng.
//
// Bốn nhóm, theo thứ tự thiệt hại nếu hỏng:
//   1. PII KHÔNG ĐƯỢC RỜI MÁY CHỦ — kể cả khi nó lọt vào sau bước bóc.
//   2. NHẬT KÝ không được chứa bản gốc.
//   3. HẠN MỨC chặn đúng tầng và nói ra tầng nào.
//   4. LỌC nội dung, và lượt bị chặn vẫn phải để lại dấu vết.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { asSystem, requireDb, DEV } from "../helpers/db";
import { hoiAi, type NhaCungCap } from "@/server/ai/tram";

let ready = false;

/** Nhà cung cấp giả: ghi lại ĐÚNG chuỗi nó nhận, để bài test soi thứ đã rời máy chủ. */
function nhaCungCapGia(traLoi = "Câu trả lời mẫu"): NhaCungCap & { daNhan: string[] } {
  const daNhan: string[] = [];
  return {
    ten: "gia",
    model: "gia-1",
    daNhan,
    async hoi(chu: string) {
      daNhan.push(chu);
      return { traLoi, tokenVao: 10, tokenRa: 5 };
    },
  };
}

/** Nhà cung cấp luôn hỏng — để đo nhánh lỗi có ghi sổ không. */
const nhaCungCapHong: NhaCungCap = {
  ten: "gia-hong",
  model: "gia-1",
  async hoi() {
    throw new Error("nhà cung cấp trả 500");
  },
};

describe("trạm AI (§7)", () => {
  beforeAll(async () => {
    ready = await requireDb();
  });

  afterEach(async () => {
    if (!ready) return;
    await asSystem((c) => c.query("delete from ai.nhat_ky_goi"));
    await asSystem((c) =>
      c.query("update ai.han_muc set so_luot_ngay = case pham_vi when 'truong' then 2000 else 30 end, active = true"),
    );
  });

  // ═══ 1. PII KHÔNG RỜI MÁY CHỦ ═════════════════════════════════════════════
  it("số điện thoại KHÔNG bao giờ tới nhà cung cấp", async ({ skip }) => {
    if (!ready) return skip();
    const ncc = nhaCungCapGia();
    await hoiAi(DEV.student, { cauHoi: "Mẹ em số 0912345678, nhắc mẹ nhé" }, ncc);
    expect(ncc.daNhan[0]).not.toContain("0912345678");
    expect(ncc.daNhan[0]).toContain("[SĐT]");
  });

  it("tên được khai thì tới nhà cung cấp dưới dạng MÃ, và câu trả lời phục hồi tên", async ({ skip }) => {
    if (!ready) return skip();
    const ncc = nhaCungCapGia("HS-01 nên đi ngủ sớm hơn");
    const kq = await hoiAi(
      DEV.student,
      { cauHoi: "Nguyễn Văn Minh hay mệt", tenCanBoc: [{ ten: "Nguyễn Văn Minh", ma: "HS-01" }] },
      ncc,
    );
    expect(ncc.daNhan[0]).not.toContain("Nguyễn Văn Minh");
    // Phục hồi CHỈ ở chiều về, cho người đọc hợp lệ.
    expect(kq).toEqual({ ok: true, traLoi: "Nguyễn Văn Minh nên đi ngủ sớm hơn" });
  });

  it("PII LỌT VÀO PROMPT HỆ THỐNG (ghép SAU khi bóc) thì trạm KHÔNG gọi model", async ({ skip }) => {
    if (!ready) return skip();
    // Đây là bước dễ bỏ nhất trong sáu bước, và là lý do `conSotPii` tồn tại tách khỏi
    // `bocPii`: ghép ngữ cảnh sau khi bóc là cách một mẩu định danh đi ra mà không ai
    // phải sửa bộ bóc cả.
    const ncc = nhaCungCapGia();
    const kq = await hoiAi(
      DEV.student,
      { cauHoi: "hôm nay học gì", promptHeThong: "Liên hệ giáo viên: 0912345678" },
      ncc,
    );
    expect(kq).toMatchObject({ ok: false, ly_do: "con_sot_pii" });
    expect(ncc.daNhan).toHaveLength(0); // KHÔNG gọi, không phải gọi rồi bỏ kết quả
  });

  // ═══ 2. NHẬT KÝ ═══════════════════════════════════════════════════════════
  it("nhật ký lưu chữ ĐÃ BÓC, không lưu bản gốc", async ({ skip }) => {
    if (!ready) return skip();
    await hoiAi(DEV.student, { cauHoi: "gọi mẹ em 0912345678" }, nhaCungCapGia());
    const { rows } = await asSystem((c) =>
      c.query<{ cau_hoi_sach: string; da_boc: Record<string, number> }>(
        "select cau_hoi_sach, da_boc from ai.nhat_ky_goi order by id desc limit 1",
      ),
    );
    expect(rows[0]?.cau_hoi_sach).not.toContain("0912345678");
    expect(rows[0]?.cau_hoi_sach).toContain("[SĐT]");
    // Đếm theo loại: trả lời được "tháng này chặn bao nhiêu số" mà không giữ số nào.
    expect(rows[0]?.da_boc).toMatchObject({ dienThoai: 1 });
  });

  it("nhật ký KHÔNG có cột nào chứa bản đồ đường về — có nó là dựng lại được nguyên văn", async ({ skip }) => {
    if (!ready) return skip();
    const { rows } = await asSystem((c) =>
      c.query<{ cot: string }>(
        `select string_agg(column_name, ',') as cot from information_schema.columns
          where table_schema = 'ai' and table_name = 'nhat_ky_goi'`,
      ),
    );
    expect(rows[0]?.cot).not.toMatch(/duong_ve|ban_do|goc|nguyen_van/);
  });

  it("lượt HỎNG của nhà cung cấp vẫn để lại dấu vết", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await hoiAi(DEV.student, { cauHoi: "hôm nay học gì" }, nhaCungCapHong);
    expect(kq).toMatchObject({ ok: false, ly_do: "loi_nha_cung_cap" });
    const { rows } = await asSystem((c) =>
      c.query<{ ket_qua: string }>("select ket_qua from ai.nhat_ky_goi order by id desc limit 1"),
    );
    expect(rows[0]?.ket_qua).toBe("loi_nha_cung_cap");
  });

  // ═══ 3. HẠN MỨC ═══════════════════════════════════════════════════════════
  it("hết lượt CỦA NGƯỜI thì chặn, và nói đúng là lượt của con", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) => c.query("update ai.han_muc set so_luot_ngay = 1 where pham_vi = 'nguoi'"));
    await hoiAi(DEV.student, { cauHoi: "câu một" }, nhaCungCapGia());
    const kq = await hoiAi(DEV.student, { cauHoi: "câu hai" }, nhaCungCapGia());
    expect(kq).toMatchObject({ ok: false, ly_do: "qua_han_muc" });
    expect((kq as { noi: string }).noi).toContain("con");
  });

  it("hết lượt TOÀN TRƯỜNG nói câu khác — hai câu dẫn tới hai hành động khác nhau", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) => c.query("update ai.han_muc set so_luot_ngay = 0 where pham_vi = 'truong'"));
    const kq = await hoiAi(DEV.student, { cauHoi: "câu một" }, nhaCungCapGia());
    expect(kq).toMatchObject({ ok: false, ly_do: "qua_han_muc" });
    expect((kq as { noi: string }).noi).toContain("Cả trường");
  });

  it("lượt BỊ CHẶN không tiêu hạn mức — nếu tiêu thì một vòng lặp hỏng khoá cả trường", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) => c.query("update ai.han_muc set so_luot_ngay = 2 where pham_vi = 'nguoi'"));
    // Ba lượt bị lọc chặn…
    for (let i = 0; i < 3; i += 1) {
      await hoiAi(DEV.student, { cauHoi: "em muốn tự tử" }, nhaCungCapGia());
    }
    // …rồi một lượt hợp lệ vẫn phải đi được.
    const kq = await hoiAi(DEV.student, { cauHoi: "hôm nay học gì" }, nhaCungCapGia());
    expect(kq).toMatchObject({ ok: true });
  });

  it("hạn mức chặn TRƯỚC khi gọi model — không đốt tiền rồi mới từ chối", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) => c.query("update ai.han_muc set so_luot_ngay = 0 where pham_vi = 'truong'"));
    const ncc = nhaCungCapGia();
    await hoiAi(DEV.student, { cauHoi: "hôm nay học gì" }, ncc);
    expect(ncc.daNhan).toHaveLength(0);
  });

  // ═══ 4. LỌC NỘI DUNG ══════════════════════════════════════════════════════
  it("câu hỏi chạm chủ đề nặng: KHÔNG gọi model, và chỉ đường tới người thật", async ({ skip }) => {
    if (!ready) return skip();
    const ncc = nhaCungCapGia();
    const kq = await hoiAi(DEV.student, { cauHoi: "em muốn tự tử" }, ncc);
    expect(kq).toMatchObject({ ok: false, ly_do: "loc_chan" });
    expect(ncc.daNhan).toHaveLength(0);
    // Câu trả lời phải chỉ tới NGƯỜI, không phải "trợ lý không hỗ trợ nội dung này".
    expect((kq as { noi: string }).noi).toContain("thầy cô");
  });

  it("CÂU TRẢ LỜI của model cũng bị lọc — model nhắc lại chủ đề bằng chữ của nó", async ({ skip }) => {
    if (!ready) return skip();
    const kq = await hoiAi(
      DEV.student,
      { cauHoi: "hôm nay học gì" },
      nhaCungCapGia("Bạn nên thử ma túy cho vui"),
    );
    expect(kq).toMatchObject({ ok: false, ly_do: "loc_chan" });
  });

  it("lượt bị lọc chặn CÓ ghi sổ — im lặng thì 'không ai gọi' giống hệt 'mọi lượt bị chặn'", async ({ skip }) => {
    if (!ready) return skip();
    await hoiAi(DEV.student, { cauHoi: "em muốn tự tử" }, nhaCungCapGia());
    const { rows } = await asSystem((c) =>
      c.query<{ ket_qua: string; ghi_chu: string }>(
        "select ket_qua, ghi_chu from ai.nhat_ky_goi order by id desc limit 1",
      ),
    );
    expect(rows[0]?.ket_qua).toBe("loc_chan");
    expect(rows[0]?.ghi_chu).toContain("từ chặn");
  });
});
