// tools/alert/gui-bao-dong.mjs — BỘ GỬI. Phần "không nói dối" nằm ở file này.
//
// Nhiệm vụ đúng một câu: lấy tin đang chờ trong ops.outbox_messages, đưa qua các
// kênh đang bật, rồi ghi lại SỰ THẬT về kết quả — kể cả khi sự thật là "không gửi
// được", "không có kênh nào", hay "đã bỏ cuộc".
//
// ── Bốn chỗ dễ nói dối, và cách chặn từng chỗ ───────────────────────────────────
//
//  1. "Không có kênh" bị ghi thành "đã gửi".
//     Chặn ở SQL: ràng buộc `(status='da_gui') = (sent_at is not null)` trên bảng,
//     và ops.ket_thuc_gui() có nhánh riêng cho p_so_kenh = 0. Ở đây chỉ cần ĐẾM
//     đúng và truyền đúng con số xuống.
//
//  2. Adapter ném lỗi nhưng bộ gửi nuốt mất.
//     Không có `catch {}` trống trong file này. Mọi lỗi đều thành một dòng
//     alert_deliveries status='gui_hong' KÈM LÝ DO NGUYÊN VĂN.
//
//  3. Gửi hai lần vì chạy hai lượt (§9).
//     Ba lớp: ops.claim_bao_dong() khoá dòng (`for update skip locked`);
//     ops.da_gui_qua() hỏi trước khi gây tác dụng phụ; và chỉ mục một-phần
//     alert_deliveries_mot_lan_idx chặn ở tầng database kể cả khi hai lớp trên hở.
//
//  4. Tin chết nằm im.
//     Hết lượt thử ⇒ status 'het_luot' ⇒ hiện trong ops.v_bao_dong_ton ⇒ đếm vào
//     metrics.findings của lần chạy job ⇒ ops.v_job_health bật needs_attention.
//     Không dựng cơ chế mới: dùng lại đúng đường mà 0041 đã mở.
//
// ── Thứ tự tác dụng phụ, và cái giá đã chọn ─────────────────────────────────────
// Với mỗi (tin, kênh): GỬI TRƯỚC → GHI SỔ SAU → commit. Cửa sổ hỏng là "đã ghi tệp
// rồi tiến trình chết trước khi commit": lượt sau ghi lại một dòng nữa vào tệp.
// Chọn có ý thức: một dòng chữ trùng trong nhật ký báo động thì người trực nhìn mã
// tin là biết ngay, còn một tin báo động BIẾN MẤT thì không ai biết. Đảo thứ tự
// (ghi sổ trước, gửi sau) đổi lấy đúng cái mất mát đó.
import { boGuiCho } from "./kenh/index.mjs";

/** Mỗi lượt gửi tối đa bao nhiêu tin. Đủ lớn cho một đêm hỏng, đủ nhỏ để không giữ khoá lâu. */
export const SO_TIN_MOI_LUOT = 50;

function loiThanhChu(err) {
  const s = err && err.message ? err.message : String(err);
  // Cắt ngắn: `last_error` là thứ người trực đọc, không phải chỗ đổ stack trace.
  return s.length > 500 ? `${s.slice(0, 500)}…` : s;
}

/**
 * Gửi một lượt. Nhận `client` (một kết nối pg đã mở), KHÔNG nhận pool: cả lượt phải
 * nằm trong MỘT transaction trên MỘT kết nối, vì khoá của claim_bao_dong() chỉ sống
 * tới khi transaction đó kết thúc. Lấy nhầm hai kết nối từ pool là mở lại đúng cửa
 * "hai tiến trình cùng gửi một tin" mà claim sinh ra để đóng.
 *
 * @param {object} client   kết nối pg
 * @param {object} [tuyChon]
 * @param {number} [tuyChon.gioiHan]  số tin tối đa
 * @param {Date}   [tuyChon.luc]      mốc thời gian (test bơm vào để kết quả tất định)
 * @returns {Promise<{da_gui:number, gui_hong:number, khong_co_kenh:number, het_luot:number, tin:Array}>}
 */
export async function guiMotLuot(client, tuyChon = {}) {
  const gioiHan = tuyChon.gioiHan ?? SO_TIN_MOI_LUOT;
  const luc = tuyChon.luc ?? new Date();

  const tomTat = { da_gui: 0, gui_hong: 0, khong_co_kenh: 0, het_luot: 0, tin: [] };

  await client.query("begin");
  try {
    const { rows: tins } = await client.query(
      "select * from ops.claim_bao_dong($1::int)",
      [gioiHan],
    );

    for (const tin of tins) {
      const { rows: kenhs } = await client.query("select * from ops.kenh_cho($1::text)", [
        tin.channel,
      ]);

      let soGuiDuoc = 0;
      const lyDo = [];

      for (const kenh of kenhs) {
        // Hỏi trước khi gây tác dụng phụ (xem chú thích ở đầu file, mục 3).
        const { rows: da } = await client.query(
          "select ops.da_gui_qua($1::bigint, $2::text) as roi",
          [tin.id, kenh.channel_id],
        );
        if (da[0].roi) {
          soGuiDuoc += 1;
          continue;
        }

        // Savepoint quanh TỪNG kênh: một kênh hỏng không được kéo theo kết quả của
        // kênh khác trong cùng lượt. Không có nó, một lỗi SQL bất kỳ làm abort cả
        // transaction và cả lượt gửi biến mất không dấu vết.
        await client.query("savepoint kenh");
        try {
          const adapter = boGuiCho(kenh); // ném khi kind chưa có bộ gửi
          const kq = await adapter.gui({ tin, kenh, luc });
          await client.query(
            "select ops.ghi_ket_qua_gui($1::bigint, $2::text, true, $3::text)",
            [tin.id, kenh.channel_id, kq?.chiTiet ?? null],
          );
          await client.query("release savepoint kenh");
          soGuiDuoc += 1;
        } catch (err) {
          await client.query("rollback to savepoint kenh");
          const chu = loiThanhChu(err);
          lyDo.push(`${kenh.channel_id}: ${chu}`);
          await client
            .query("select ops.ghi_ket_qua_gui($1::bigint, $2::text, false, $3::text)", [
              tin.id,
              kenh.channel_id,
              chu,
            ])
            .catch(() => {
              // Ngay cả việc GHI LẠI cái hỏng cũng có thể hỏng (database mất kết nối).
              // Không nuốt im: in ra stderr để mã thoát và log của bộ lịch còn thấy.
              console.error(`  (không ghi được kết quả gửi cho tin #${tin.id}/${kenh.channel_id})`);
            });
        }
      }

      const { rows: kq } = await client.query(
        "select ops.ket_thuc_gui($1::bigint, $2::int, $3::int, $4::text) as trang_thai",
        [tin.id, kenhs.length, soGuiDuoc, lyDo.length > 0 ? lyDo.join(" | ") : null],
      );
      const trangThai = kq[0].trang_thai;
      if (tomTat[trangThai] !== undefined) tomTat[trangThai] += 1;
      tomTat.tin.push({ id: tin.id, dedup_key: tin.dedup_key, trang_thai: trangThai });
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }

  return tomTat;
}

/**
 * Đếm tin đang MẮC KẸT. Con số này đi thẳng vào metrics.findings của lần chạy job,
 * nên `ops.v_job_health.needs_attention` bật lên — đó là cách một hàng đợi đầy tin
 * chết tự tố cáo mình thay vì nằm im.
 */
export async function demTinMacKet(client) {
  const { rows } = await client.query(
    `select count(*)::int                                          as tong,
            count(*) filter (where status = 'het_luot')::int        as het_luot,
            count(*) filter (where status = 'khong_co_kenh')::int   as khong_co_kenh,
            count(*) filter (where status = 'cho_gui')::int         as ton_lau
       from ops.v_bao_dong_ton`,
  );
  return rows[0];
}

/**
 * Đếm KÊNH đang hỏng. Tách khỏi demTinMacKet() vì đây là câu hỏi khác hẳn: một tin
 * gửi được qua kênh A vẫn là 'da_gui' dù kênh B hỏng, và tin đã da_gui thì không bao
 * giờ được thử lại — nên nếu chỉ đếm tin thì kênh B chết trong im lặng.
 */
export async function demKenhHong(client) {
  const { rows } = await client.query(
    `select channel_id, label, ly_do_hong_gan_nhat
       from ops.v_suc_khoe_kenh
      where needs_attention
      order by channel_id`,
  );
  return rows;
}
