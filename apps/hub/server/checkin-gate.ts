// apps/hub/server/checkin-gate.ts — cổng "học sinh chưa check-in cảm xúc hôm nay"
// cho Server Component. Dùng ở app/home/page.tsx (ADR-036, 21/08/2026).
//
// QUYẾT ĐỊNH (chủ đầu tư, nguyên văn cách hiểu đã chốt): học sinh đăng nhập lần đầu
// trong ngày phải check-in cảm xúc xong mới vào trang chủ. Một lần mỗi ngày — đã
// check-in rồi (kể cả qua PWA lúc sáng) thì không hỏi lại. Giáo viên không bị chặn.
//
// ĐỌC KỸ TRƯỚC KHI SỬA — ba điều cố ý, thiếu một là cổng thành bẫy:
//
// 1. EM CHƯA CÓ PHIẾU ĐỒNG Ý THÌ KHÔNG CHẶN. Từ 0047 (ADR-027 bản 2), RLS trên
//    `attendance.checkins` không nhận giá trị `mood` khi nhà chưa có phiếu — tức em
//    KHÔNG THỂ hoàn thành đúng cái việc mà cổng đòi. Chặn em là khoá em ngoài cửa
//    vĩnh viễn bằng một điều kiện em không tự thoát được; và về luật, nhà chưa đồng
//    ý thì không được thu — không thu thì không có gì để đòi. `has_student_consent`
//    đứng TRƯỚC mọi điều kiện khác vì thế.
//
// 2. LỖI CSDL KHÔNG ĐƯỢC BIẾN THÀNH CỔNG — cùng luật với consent-gate ngay cạnh:
//    hàm này ném thì app/home/page.tsx ghi log rồi cho qua. Chặn một đứa trẻ khỏi
//    trang chủ vì một lỗi kết nối là phạt sai người.
//
// 3. ĐÂY KHÔNG PHẢI CHỐT CHẶN DỮ LIỆU, và cũng KHÔNG cần thành chốt. Khác với
//    consent-gate (nơi chốt thật là RLS), cổng này không bảo vệ dữ liệu nào cả —
//    nó tạo NHỊP: mỗi ngày một lần dừng lại tự hỏi mình thấy thế nào. Em mở thẳng
//    /tuan-nay bằng URL thì đi qua được, và không sao: trang chủ là cửa chính,
//    mọi đường đăng nhập đều đổ về đó (login-form.tsx nạp lại cả trang về /home).
//
// Múi giờ: client.ts ghim 'Asia/Ho_Chi_Minh' cho mọi kết nối, nên `current_date`
// là "hôm nay" của trường, không phải của UTC.
import { withUserContext } from "@hub/core/db";

/**
 * Em này có phải dừng ở màn check-in trước khi vào trang chủ không.
 *
 * Chạy dưới RLS context của CHÍNH EM: `core.students` cho đọc dòng của mình,
 * `attendance.checkins_care` đi qua `core.can_read_mood` mà nhánh `is_me` luôn mở.
 * Người không phải học sinh không có dòng `students` nào → false, đúng nghĩa
 * "không có gì để đòi" (nơi gọi cũng đã lọc theo vai trước khi hỏi).
 */
export async function phaiDungOCheckin(authUid: string): Promise<boolean> {
  return withUserContext(authUid, async (client) => {
    const { rows } = await client.query<{ phai_dung: boolean }>(
      `select exists (
         select 1
           from core.students s
          where s.user_id = core.current_user_id()
            and core.has_student_consent(s.id)
            and not exists (
              select 1
                from attendance.checkins_care c
               where c.student_id = s.id
                 and c.occurred_on = current_date
                 and c.kind = 'in'
                 and c.mood is not null
            )
       ) as phai_dung`,
    );
    return rows[0]?.phai_dung ?? false;
  });
}
