// apps/hub/server/routers/thi-dua.ts — bảng xếp hạng thi đua (ADR-037, 21/08/2026).
//
// ═══════════════════════════════════════════════════════════════════════════
// ĐỌC, KHÔNG GHI — cả router này không có một mutation nào, và đó là thiết kế
// ═══════════════════════════════════════════════════════════════════════════
// Điểm chỉ sinh ra từ `evidence.tinh_diem_thi_dua`, chạy bởi job đêm dưới vai hệ thống.
// Không có đường nào cho người dùng cộng điểm — kể cả admin. Muốn đổi điểm thì đổi LUẬT
// (`evidence.luat_tinh_diem`), và điểm tự tính lại. Đây là thứ giữ cho một bảng thi đua
// của trẻ con không thành chỗ xin-cho.
//
// ═══════════════════════════════════════════════════════════════════════════
// BA THỨ KHÔNG ĐI RA MÀN HÌNH, và vì sao
// ═══════════════════════════════════════════════════════════════════════════
// 1. `chi_tiet` của từng dòng điểm (số ngày chuỗi, số lượt mở app). Nó là số THÔ dùng
//    để tính, không phải thứ để so nhau; in ra là mời người ta suy ngược "em này nghỉ
//    mấy hôm". Bảng chỉ trả TỔNG.
// 2. Bất cứ thứ gì từ `care.*` hay `mood`. Ranh giới chủ đầu tư vạch 21/08/2026, và
//    hàng rào thật nằm ở tầng dữ liệu (pgTAP 0063 đọc thân hàm tính điểm).
// 3. Danh sách đầy đủ toàn trường. Trả top-N + đúng dòng của người đang xem — một bảng
//    109 dòng tên trẻ con không giúp ai, và càng nhiều dòng thì càng giống danh sách
//    xếp loại.
import { router, protectedProcedure } from "../trpc";
import { GetBangXepHangInput, GetBangXepHangOutput } from "@hub/core/contracts";

export const thiDuaRouter = router({
  getBangXepHang: protectedProcedure
    .input(GetBangXepHangInput)
    .output(GetBangXepHangOutput)
    .query(async ({ ctx, input }) => {
      return ctx.runWithDb(async (client) => {
        // "Dong nay co phai cua toi khong" do CHINH VIEW tra loi (`la_toi`, migration
        // 0064). Truoc do tang nay tu hoi `core.students` roi so id -- va chinh nhu cau
        // so id la ly do id phai di ra ngoai. Bo duoc ca hai cung luc.
        const { rows: caNhan } = await client.query<{
          full_name: string;
          lop: string;
          khoi: number;
          tong_diem: number;
          thu_hang: string;
          la_toi: boolean;
        }>(
          `select full_name, lop, khoi, tong_diem, thu_hang, la_toi
             from evidence.v_xep_hang_ca_nhan
            order by thu_hang, full_name
            limit $1`,
          [input.gioiHan],
        );

        // Dòng của chính em, hỏi riêng: em có thể đứng ngoài top-N. Một truy vấn nữa
        // rẻ hơn nhiều so với kéo cả bảng về rồi lọc ở Node.
        // `where la_toi` -- khong tham so nao, nen khong co duong nao hoi dong cua
        // nguoi khac qua endpoint nay.
        let toiDangODau: GetBangXepHangOutput["toiDangODau"] = null;
        {
          const { rows } = await client.query<{
            full_name: string;
            lop: string;
            khoi: number;
            tong_diem: number;
            thu_hang: string;
          }>(
            `select full_name, lop, khoi, tong_diem, thu_hang
               from evidence.v_xep_hang_ca_nhan where la_toi`,
          );
          const r = rows[0];
          if (r) {
            toiDangODau = {
              hoTen: r.full_name,
              lop: r.lop,
              khoi: r.khoi,
              tongDiem: r.tong_diem,
              thuHang: Number(r.thu_hang),
              laToi: true,
            };
          }
        }

        const { rows: lop } = await client.query<{
          lop: string;
          khoi: number;
          tong_diem: number | null;
          diem_trung_binh: string | null;
          thu_hang: string;
          la_lop_toi: boolean;
        }>(
          `select lop, khoi, tong_diem, diem_trung_binh, thu_hang, la_lop_toi
             from evidence.v_xep_hang_lop order by thu_hang, lop`,
        );

        const { rows: khoi } = await client.query<{
          khoi: number;
          tong_diem: number | null;
          diem_trung_binh: string | null;
          thu_hang: string;
        }>(
          `select khoi, tong_diem, diem_trung_binh, thu_hang
             from evidence.v_xep_hang_khoi order by thu_hang, khoi`,
        );

        // Rev F.8 — mốc lượt tính. `null` = job CHƯA CHẠY LẦN NÀO, và màn hình phải nói
        // ra thay vì vẽ một bảng trống như thể cả trường không ai có điểm.
        const { rows: mocRows } = await client.query<{ tinh_luc: string | null }>(
          "select max(tinh_luc)::text as tinh_luc from evidence.diem_thi_dua",
        );

        const { rows: luat } = await client.query<{ ma_luat: string; nhan: string }>(
          "select ma_luat, nhan from evidence.luat_tinh_diem where active order by ma_luat",
        );

        return GetBangXepHangOutput.parse({
          caNhan: caNhan.map((r) => ({
            hoTen: r.full_name,
            lop: r.lop,
            khoi: r.khoi,
            tongDiem: r.tong_diem,
            thuHang: Number(r.thu_hang),
            laToi: r.la_toi,
          })),
          lop: lop.map((r) => ({
            lop: r.lop,
            khoi: r.khoi,
            tongDiem: r.tong_diem ?? 0,
            diemTrungBinh: Number(r.diem_trung_binh ?? 0),
            thuHang: Number(r.thu_hang),
            laLopToi: r.la_lop_toi,
          })),
          khoi: khoi.map((r) => ({
            khoi: r.khoi,
            tongDiem: r.tong_diem ?? 0,
            diemTrungBinh: Number(r.diem_trung_binh ?? 0),
            thuHang: Number(r.thu_hang),
          })),
          toiDangODau,
          tinhLuc: mocRows[0]?.tinh_luc ?? null,
          luat: luat.map((r) => ({ maLuat: r.ma_luat, nhan: r.nhan })),
        });
      });
    }),
});
