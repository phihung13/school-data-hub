// apps/hub/server/ai/tram.ts — TRẠM AI: cửa duy nhất giữa Hub và mọi model ngoài (§7).
//
// ═══════════════════════════════════════════════════════════════════════════
// SÁU BƯỚC, VÀ THỨ TỰ LÀ MỘT PHẦN CỦA HÀNG RÀO
// ═══════════════════════════════════════════════════════════════════════════
//   1. HẠN MỨC   — hết lượt thì dừng TRƯỚC khi bóc, trước khi gọi. Rẻ nhất trước.
//   2. BÓC       — `packages/core/pii-stripper`. Không đường nào khác.
//   3. KHAI LẠI  — `conSotPii` chạy trên ĐÚNG chuỗi sắp gửi, sau khi đã ghép prompt hệ
//                  thống. Đây là bước dễ bỏ nhất và là bước bắt được lỗi thật: ghép
//                  ngữ cảnh SAU khi bóc là cách một mẩu định danh đi ra mà không ai
//                  phải sửa `bocPii` cả.
//   4. GỌI       — qua `NhaCungCap`, một giao diện. Xem lý do ở chỗ khai nó.
//   5. LỌC       — sàn nội dung theo lứa tuổi. Đọc kỹ phần "sàn, không phải giải pháp".
//   6. GHI SỔ    — kể cả lượt BỊ CHẶN. Không ghi lượt chặn thì "hôm nay không ai gọi
//                  AI" và "hôm nay mọi lượt đều bị chặn" trông y hệt nhau.
//
// Bước 6 chạy trong `finally`: một lượt gọi hỏng giữa chừng vẫn phải để lại dấu vết.
// Đây đúng bài học `run-retention.mjs` đã ghi — hàm ném thì dòng sổ bị cuốn theo
// rollback và lần chạy hỏng biến mất.
import { withSystemContext, withUserContext } from "@hub/core/db";
import { bocPii, conSotPii, hoanPii, type TenCanBoc } from "@hub/core/pii-stripper";
import { log, describeError } from "@/lib/logger";

/**
 * Nhà cung cấp model. Là một GIAO DIỆN, không phải một lời gọi thẳng — ba lý do:
 *
 *   · Bộ test chạy được toàn bộ trạm mà không gọi ra Internet và không cần khoá thật.
 *   · Đổi Claude ↔ Gemini không đụng tới năm bước còn lại (Rev D.4 cùng tinh thần:
 *     đổi nhà cung cấp hạ tầng không được làm đổi code nghiệp vụ).
 *   · §7 nói "import SDK AI ở nơi khác là lỗi lint" — có đúng MỘT chỗ được phép import,
 *     và giao diện này là chỗ đó. `tools/ai-import-gate.mjs` canh.
 */
export interface NhaCungCap {
  ten: string;
  model: string;
  hoi(chuSach: string): Promise<{ traLoi: string; tokenVao?: number; tokenRa?: number }>;
}

export interface YeuCauAi {
  cauHoi: string;
  /** Tên cần bóc — nơi gọi dựng, vì nơi gọi biết mình đang nói về ai. */
  tenCanBoc?: readonly TenCanBoc[];
  /** Prompt hệ thống. Ghép SAU khi bóc, nên nó cũng phải sạch — bước 3 kiểm cả nó. */
  promptHeThong?: string;
  appId?: string;
}

export type KetQuaAi =
  | { ok: true; traLoi: string }
  | { ok: false; ly_do: "qua_han_muc" | "loc_chan" | "loi_nha_cung_cap" | "con_sot_pii"; noi: string };

// ---------------------------------------------------------------------------
// Bước 5 — SÀN nội dung, KHÔNG phải giải pháp
// ---------------------------------------------------------------------------
// Nói thẳng giới hạn trước khi ai đó tin nhầm vào nó: một danh sách từ khoá KHÔNG phải
// bộ lọc an toàn cho trẻ em. Nó bắt được thứ thô thiển nhất và trượt mọi thứ tinh vi —
// ẩn dụ, tiếng lóng, và những đoạn nguy hiểm mà không từ nào trong đó là từ xấu.
//
// Nó vẫn có mặt vì hai lẽ, cả hai đều nhỏ và thật: (a) một sàn rẻ vẫn hơn không có gì
// khi cửa vừa mở; (b) nó là CHỖ ĐỂ CẮM bộ lọc thật — ngày có, chỉ đổi thân hàm này chứ
// không phải đi tìm mọi chỗ gọi model.
//
// Điều KHÔNG được làm: viết trong tài liệu cho phụ huynh rằng "có bộ lọc nội dung phù
// hợp lứa tuổi" và để câu đó đứng một mình. Câu đúng là: "có một sàn chặn thô, chưa
// phải bộ lọc thật, và trường biết điều đó."
const TU_CHAN = [
  "tự tử", "tự sát", "kết liễu", "ma túy", "heroin", "cần sa",
  "khiêu dâm", "sex", "cởi đồ", "dao lam", "rạch tay",
];

function locNoiDung(chu: string): { qua: boolean; tu?: string } {
  const thuong = chu.toLowerCase();
  const tu = TU_CHAN.find((t) => thuong.includes(t));
  return tu ? { qua: false, tu } : { qua: true };
}

/**
 * Gọi model qua trạm. Đây là hàm DUY NHẤT mà tầng nghiệp vụ được gọi.
 *
 * `authUid` để đếm hạn mức và ghi sổ. Không có `authUid` nghĩa là không có người chịu
 * trách nhiệm cho lượt gọi này — và một lượt gọi model không có người chịu trách nhiệm
 * thì không được phép xảy ra, nên hàm đòi nó chứ không cho mặc định.
 */
export async function hoiAi(
  authUid: string,
  yc: YeuCauAi,
  nhaCungCap: NhaCungCap,
): Promise<KetQuaAi> {
  const boc = bocPii(yc.cauHoi, yc.tenCanBoc ?? []);
  let ketQua: "ok" | "qua_han_muc" | "loc_chan" | "loi_nha_cung_cap" | "con_sot_pii" = "ok";
  let traLoiSach: string | null = null;
  let ghiChu: string | null = null;
  let tokenVao: number | null = null;
  let tokenRa: number | null = null;
  let ra: KetQuaAi;

  try {
    // ── 1. Hạn mức ────────────────────────────────────────────────────────
    const { con, tang, daDung, tran } = await withUserContext(authUid, async (client) => {
      const { rows } = await client.query<{ con: boolean; tang: string; da_dung: number; tran: number }>(
        `select * from ai.con_luot(core.current_user_id(), $1)`,
        [yc.appId ?? null],
      );
      const r = rows[0];
      return { con: r?.con ?? false, tang: r?.tang ?? "khong-doc-duoc", daDung: r?.da_dung ?? 0, tran: r?.tran ?? 0 };
    });

    if (!con) {
      ketQua = "qua_han_muc";
      ghiChu = `tầng ${tang}: ${daDung}/${tran}`;
      // Nói ra TẦNG nào chạm trần: "hết lượt của con hôm nay" và "cả trường hết lượt"
      // dẫn tới hai hành động khác nhau.
      ra = {
        ok: false,
        ly_do: "qua_han_muc",
        noi:
          tang === "nguoi"
            ? "Hôm nay con đã dùng hết số lượt hỏi trợ lý. Mai con hỏi tiếp nhé."
            : tang === "app"
              ? "App này đã dùng hết lượt hỏi trợ lý trong ngày."
              : "Cả trường đã dùng hết lượt hỏi trợ lý hôm nay.",
      };
      return ra;
    }

    // ── 3. Khai lại trên ĐÚNG chuỗi sắp gửi ───────────────────────────────
    const chuGui = [yc.promptHeThong, boc.sach].filter(Boolean).join("\n\n");
    if (conSotPii(chuGui)) {
      // KHÔNG gọi model. Đây là cổng cuối, và nó phải đóng chứ không cảnh báo rồi đi
      // tiếp — thứ nó chặn là một mẩu định danh của trẻ đang trên đường rời khỏi trường.
      ketQua = "con_sot_pii";
      ghiChu = "chuỗi sắp gửi còn khớp khuôn định danh sau khi ghép prompt hệ thống";
      ra = { ok: false, ly_do: "con_sot_pii", noi: "Câu hỏi còn chứa thông tin cá nhân — trợ lý không nhận." };
      return ra;
    }

    // ── 5a. Lọc câu HỎI ───────────────────────────────────────────────────
    const locHoi = locNoiDung(boc.sach);
    if (!locHoi.qua) {
      ketQua = "loc_chan";
      ghiChu = `câu hỏi khớp từ chặn: ${locHoi.tu}`;
      ra = {
        ok: false,
        ly_do: "loc_chan",
        noi: "Chuyện này con nên nói với thầy cô tâm lý thay vì hỏi trợ lý. Con bấm nút “Mình cần gặp thầy cô” nhé.",
      };
      return ra;
    }

    // ── 4. Gọi ────────────────────────────────────────────────────────────
    let traLoi: string;
    try {
      const kq = await nhaCungCap.hoi(chuGui);
      traLoi = kq.traLoi;
      tokenVao = kq.tokenVao ?? null;
      tokenRa = kq.tokenRa ?? null;
    } catch (err) {
      ketQua = "loi_nha_cung_cap";
      ghiChu = String((err as Error)?.message ?? err).slice(0, 500);
      ra = { ok: false, ly_do: "loi_nha_cung_cap", noi: "Trợ lý đang bận, con thử lại sau ít phút nhé." };
      return ra;
    }
    traLoiSach = traLoi;

    // ── 5b. Lọc câu TRẢ LỜI ───────────────────────────────────────────────
    // Lọc cả hai chiều: model có thể nhắc lại chủ đề bị chặn bằng chữ của nó.
    const locRa = locNoiDung(traLoi);
    if (!locRa.qua) {
      ketQua = "loc_chan";
      ghiChu = `câu trả lời khớp từ chặn: ${locRa.tu}`;
      ra = { ok: false, ly_do: "loc_chan", noi: "Trợ lý không trả lời được câu này. Con hỏi thầy cô giúp nhé." };
      return ra;
    }

    // ── Phục hồi tên CHỈ ở chiều về ───────────────────────────────────────
    ra = { ok: true, traLoi: hoanPii(traLoi, boc.duongVe) };
    return ra;
  } finally {
    // ── 6. Ghi sổ, kể cả lượt bị chặn ─────────────────────────────────────
    // `withSystemContext` vì `authenticated` cố ý KHÔNG có INSERT trên bảng này: nếu có
    // thì một người tự ghi vào nhật ký để làm loãng chính sổ vết của mình.
    try {
      await withSystemContext((client) =>
        client.query(
          `insert into ai.nhat_ky_goi
             (app_id, nguoi_goi, nha_cung_cap, model, cau_hoi_sach, tra_loi_sach, da_boc,
              token_vao, token_ra, ket_qua, ghi_chu)
           values ($1, (select id from core.users where auth_uid = $2), $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
          [
            yc.appId ?? null,
            authUid,
            nhaCungCap.ten,
            nhaCungCap.model,
            boc.sach,
            traLoiSach,
            JSON.stringify(boc.daBoc),
            tokenVao,
            tokenRa,
            ketQua,
            ghiChu,
          ],
        ),
      );
    } catch (err) {
      // Ghi sổ hỏng KHÔNG được làm hỏng câu trả lời đã có. Nhưng nó phải kêu — một trạm
      // AI chạy mà không ghi được sổ là một trạm không kiểm định được.
      log("error", "ai.ghi_nhat_ky_that_bai", { authUid, ...describeError(err) });
    }
  }
}
