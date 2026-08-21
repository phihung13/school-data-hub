// packages/core/contracts/thi-dua.ts — bảng xếp hạng thi đua (ADR-037, 21/08/2026).
//
// RANH GIỚI, nguyên văn lời chủ đầu tư — chép ra đây vì nó LÀ hợp đồng, không phải
// lời giới thiệu: *"xếp hạng thời gian dùng app thì ok, xếp hạng thi đua cá nhân/lớp/
// khối... thì ok, ko đưa cảm xúc vào"*.
//
// Hợp đồng này CỐ Ý KHÔNG có chỗ nào chở cảm xúc — không field mood, không "vì sao em
// này điểm thấp". Điểm đi ra kèm `chiTiet` chỉ gồm SỐ (số ngày, số lượt). Hàng rào thật
// nằm ở tầng dữ liệu (`evidence.tinh_diem_thi_dua`, pgTAP 0063 đọc thân hàm), nhưng
// hình dạng ở đây là hàng rào thứ hai: thêm một field cảm xúc vào bảng thi đua thì phải
// sửa file này, và file này có tên trong sổ hợp đồng.
import { z } from "zod";

/** Một dòng trên bảng xếp hạng cá nhân. */
export const DongXepHangCaNhan = z.object({
  /**
   * CO Y KHONG co `studentId` (bo 21/08/2026, migration `0064`). Bang xep hang can TEN
   * va DIEM; tra khoa chinh cua mot dua tre ra cho ca truong la phat cho moi nguoi mot
   * chia de noi du lieu. `laToi` do tang du lieu tu tinh, nen tang ung dung khong con
   * can id de to dam dong cua nguoi dang xem.
   */
  hoTen: z.string(),
  lop: z.string(),
  khoi: z.number().int(),
  tongDiem: z.number().int().nonnegative(),
  /**
   * Thứ hạng dùng `rank()` chứ không phải số thứ tự dòng: hai em bằng điểm thì BẰNG
   * HẠNG. Đánh số 1,2,3 tuần tự sẽ tự bịa ra một thứ tự giữa hai em ngang nhau, và với
   * một bảng thi đua của trẻ con thì cái thứ tự bịa đó là thứ các em sẽ tranh cãi.
   */
  thuHang: z.number().int().positive(),
  /** Có phải chính người đang xem không — để màn hình tô đậm dòng của mình. */
  laToi: z.boolean(),
});
export type DongXepHangCaNhan = z.infer<typeof DongXepHangCaNhan>;

export const DongXepHangLop = z.object({
  /** Khong co `classId`, cung ly le voi `DongXepHangCaNhan`. */
  lop: z.string(),
  khoi: z.number().int(),
  tongDiem: z.number().int().nonnegative(),
  /** Trung bình mỗi em — xếp bằng tổng thì bảng đo sĩ số chứ không đo thi đua. */
  diemTrungBinh: z.number().nonnegative(),
  thuHang: z.number().int().positive(),
  laLopToi: z.boolean(),
});
export type DongXepHangLop = z.infer<typeof DongXepHangLop>;

export const DongXepHangKhoi = z.object({
  khoi: z.number().int(),
  tongDiem: z.number().int().nonnegative(),
  diemTrungBinh: z.number().nonnegative(),
  thuHang: z.number().int().positive(),
});
export type DongXepHangKhoi = z.infer<typeof DongXepHangKhoi>;

export const GetBangXepHangInput = z.object({
  /** Số dòng tối đa của bảng cá nhân. Lớp và khối luôn trả đủ (chúng ít dòng). */
  gioiHan: z.number().int().min(3).max(100).default(20),
});
export type GetBangXepHangInput = z.infer<typeof GetBangXepHangInput>;

export const GetBangXepHangOutput = z.object({
  caNhan: z.array(DongXepHangCaNhan),
  lop: z.array(DongXepHangLop),
  khoi: z.array(DongXepHangKhoi),
  /**
   * Dòng của CHÍNH người đang xem, kể cả khi em không lọt vào `gioiHan` dòng đầu.
   * `null` khi người xem không phải học sinh (thầy cô xem bảng của trường).
   *
   * Có mặt vì một bảng top-20 mà em đứng thứ 87 thì em không thấy mình ở đâu — và cái
   * cảm giác "mình không có trên bảng" nặng hơn hẳn con số 87.
   */
  toiDangODau: DongXepHangCaNhan.nullable(),
  /**
   * Lượt tính điểm gần nhất. Rev F.8: ô số nào phụ thuộc lượt quét thì CHÍNH Ô ĐÓ phải
   * nói ra mình đang là số cũ. Bảng này đứng trọn trên một job đêm, nên nó bắt buộc
   * mang mốc — `null` nghĩa là job CHƯA CHẠY LẦN NÀO, và màn hình phải nói ra điều đó
   * chứ không được vẽ một bảng trống như thể cả trường không ai có điểm.
   */
  tinhLuc: z.string().nullable(),
  /** Luật đang áp dụng, để màn hình nói được "điểm ở đâu ra" mà không đoán. */
  luat: z.array(z.object({ maLuat: z.string(), nhan: z.string() })),
});
export type GetBangXepHangOutput = z.infer<typeof GetBangXepHangOutput>;

// ---------------------------------------------------------------------------
// Lịch hôm nay (ADR-034) — ở chung file vì cùng một đợt và cùng một bề mặt (trang chủ).
// ---------------------------------------------------------------------------

export const SuKienHomNay = z.object({
  id: z.string().uuid(),
  tieuDe: z.string(),
  loai: z.enum(["chung", "hoc", "hop", "nghi", "hoat_dong"]),
  /** "07:15" — giờ VN, cắt từ chuỗi máy chủ. KHÔNG để client tự đọc timestamp. */
  gio: z.string(),
  /** "07:45" hoặc null khi sự kiện không khai giờ kết thúc. */
  gioKetThuc: z.string().nullable(),
  diaDiem: z.string().nullable(),
  /** true = sự kiện của cả trường; false = của một lớp cụ thể. */
  caTruong: z.boolean(),
  lop: z.string().nullable(),
});
export type SuKienHomNay = z.infer<typeof SuKienHomNay>;

export const GetLichHomNayOutput = z.object({
  suKien: z.array(SuKienHomNay),
  /**
   * Lịch Google đã nối chưa. **Luôn `false` cho tới khi trả nợ #19** — và màn hình phải
   * nói ra, vì "hôm nay không có sự kiện nào" và "lịch Google chưa nối nên chỉ thấy
   * lịch trường tự nhập" là hai câu khác nhau. Gộp chúng là để im lặng bị đọc thành
   * kết luận, đúng thứ Rev B/C điều 3 cấm.
   */
  daNoiGoogle: z.boolean(),
});
export type GetLichHomNayOutput = z.infer<typeof GetLichHomNayOutput>;
