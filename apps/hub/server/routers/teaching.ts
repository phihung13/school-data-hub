// apps/hub/server/routers/teaching.ts — router `teaching`, màn ĐẦU TIÊN của vai `teacher`.
//
// ═══════════════════════════════════════════════════════════════════════════
// VÌ SAO CÓ ROUTER NÀY (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Vai `teacher` (giáo viên bộ môn) đăng nhập vào Hub và chỉ có `/home`. Chủ đầu tư hỏi
// thẳng: "họ không có gì ngoài trang chủ?". Router này mở đúng phần mà TẦNG DỮ LIỆU đã
// cho phép từ trước — không mở thêm một dòng quyền nào.
//
// ═══════════════════════════════════════════════════════════════════════════
// PHẠM VI ĐO ĐƯỢC, KHÔNG PHẢI PHẠM VI SUY ĐOÁN
// ═══════════════════════════════════════════════════════════════════════════
// Đo 06/08/2026 trên hub_dev, trong transaction + `set local role authenticated` +
// `core.begin_user_context`, dưới danh tính Thầy Nam (bộ môn Toán, dạy 6A1/6A2/6A3):
//
//   core.students             36 dòng  — đúng 3 lớp thầy dạy (nhánh `core.teaches` của
//                                        `core.can_see_student`, 0009)
//   attendance.checkins      181 dòng  đọc được
//   cột `mood`                42501 permission denied — grant theo CỘT (0044)
//   care.flags                 0 dòng  (`core.can_see_care` = homeroom ∨ cụm, KHÔNG teaches)
//   attendance.help_requests   0 dòng  (`help_requests_scope`, 0037)
//
// Nên router này ĐỌC: lớp mình dạy · danh sách em · trạng thái điểm danh hôm nay.
// Và KHÔNG câu SQL nào ở đây được chọn `mood`, `care.*`, hay `attendance.help_requests`.
// Ba thứ đó cho ra 0 dòng / permission denied dưới phiên giáo viên bộ môn — nghĩa là nếu
// ai đó nối chúng vào, màn hình sẽ vẽ một ô TRỐNG chứ không báo lỗi, và ô trống đọc thành
// "em này không có gì". Đó đúng là hình dạng hỏng câm mà PRODUCT.md gọi tên: lời "cần gặp
// thầy cô" — "Bạn cùng lớp, thầy cô dạy môn, thầy cô lớp khác, bố mẹ, BGH: không."
//
// ═══════════════════════════════════════════════════════════════════════════
// CHỈ ĐỌC. KHÔNG một mutation nào — và đó là quyết định, không phải thiếu sót
// ═══════════════════════════════════════════════════════════════════════════
// Giáo viên bộ môn hôm nay KHÔNG có policy nào cho ghi `attendance.checkins`:
// `checkins_insert_by_homeroom` / `checkins_update_by_homeroom` (0030/0032) chỉ nhận GVCN.
// Thêm một nút "ghi điểm danh" ở đây là mở quyền ghi chuyên cần cho một vai mới — thứ sẽ đi
// vào học bạ — và việc đó cần ADR, không phải một router mới.
//
// ═══════════════════════════════════════════════════════════════════════════
// LEO QUYỀN — bài học đã trả giá thật, chép lại vì nó áp nguyên vào file này
// ═══════════════════════════════════════════════════════════════════════════
// `care.acknowledgeLate` từng là `protectedProcedure`: nó chỉ hỏi "đã đăng nhập chưa", nên
// một học sinh gọi thẳng procedure dành cho GVCN là tự duyệt được mình thành 'present'
// (tái hiện được trên máy dev — xem đầu migration 0025). Hai hàng rào rút ra, và cả hai có
// mặt ở đây:
//
//   1. THEO VAI — `roleProcedure("teacher", "homeroom")`, đối chiếu `core.v_my_scopes`
//      chứ không tin JWT (token sống 15 phút, người vừa bị thu vai vẫn cầm token cũ).
//   2. THEO LỚP — `requireMyTeachingClass`: `classId` client gửi phải nằm trong tập lớp
//      mà `core.class_assignments` của CHÍNH người gọi công nhận. Hàng rào (1) chỉ trả lời
//      "người này có dạy lớp nào đó không", không trả lời "có phải lớp NÀY không". Thiếu
//      bước này thì đổi một tham số trong request là đọc lớp của đồng nghiệp — RLS vẫn
//      chặn phần lớn, nhưng dựa vào một tầng duy nhất là cách lỗ hổng sinh ra.
//
// RLS ở tầng DB chặn độc lập. Không tầng nào tin tầng kia tử tế.
import { TRPCError } from "@trpc/server";
import {
  GetMyTeachingClassesOutput,
  GetTeachingRosterInput,
  GetTeachingRosterOutput,
} from "@hub/core/contracts";
import type { AttendanceStatus } from "@hub/core/contracts";
import type { PoolClient } from "@hub/core/db";
import { toLocalIsoDate } from "@/lib/date";
import { roleProcedure, router } from "../trpc";

/**
 * Ai vào được: giáo viên bộ môn, và GVCN — vì GVCN cũng dạy môn.
 *
 * Vì sao `homeroom` có mặt ở đây dù đã có buồng lái riêng: `core.class_assignments` ghi cả
 * hai vai trò phân công (`homeroom` và `subject`) cho cùng một người, và `core.teaches()`
 * không phân biệt chúng. Một cô vừa chủ nhiệm 6A1 vừa dạy Toán 6A2/6A3 mà chỉ có màn "Lớp
 * chủ nhiệm" thì hai lớp kia không có đường nào tới.
 */
const teachingProcedure = roleProcedure("teacher", "homeroom");

/**
 * Lớp mà người đang gọi DẠY, suy từ `core.class_assignments` của chính họ.
 *
 * Đường đi bắt buộc phải vòng, và lý do nằm ở tầng dữ liệu chứ không ở sở thích: bảng
 * `core.class_assignments` (và `core.teachers`) KHÔNG được GRANT cho `authenticated` —
 * migration 0024 có assertion khoá điều đó, và đo lại dưới phiên Thầy Nam ngày 06/08/2026
 * cho `42501 permission denied for table class_assignments`. Cửa duy nhất đang mở là hàm
 * `core.teaches(student_id)` (0009, `security definer`), và nó đọc thẳng bảng đó.
 *
 * Nên câu này lấy DANH SÁCH EM làm gốc rồi hỏi `core.teaches` từng em. Hai hệ quả phải nói
 * ra thay vì để người sau tự phát hiện:
 *
 *   · Đây LÀ phép tự giới hạn theo `core.class_assignments` thật — không phải theo
 *     `core.v_my_scopes`. Sổ vai trò `core.user_role_scopes` có dòng `teacher` kèm
 *     `class_id`, trông tiện hơn hẳn, nhưng nó là BẢN SAO: 0023/0030 chỉ cưỡng chế bản sao
 *     khớp bản gốc cho vai `homeroom`. Đọc bản sao ở đây là dựng nguồn sự thật thứ hai cho
 *     câu hỏi "thầy dạy lớp nào", và hai nguồn thì sẽ có ngày lệch.
 *   · MỘT LỚP KHÔNG CÓ EM NÀO sẽ không xuất hiện, kể cả khi phân công có thật — vì không
 *     có dòng `enrollments` nào để hỏi `core.teaches`. Ở trường thật, một lớp trống sổ ghi
 *     danh là lỗi nhập liệu của văn phòng chứ không phải trạng thái bình thường; ghi ra
 *     đây để lần sau không ai đi tìm lỗi ở tầng phân quyền.
 */
async function readMyTeachingClasses(
  client: PoolClient,
  onDate: string,
): Promise<
  { classId: string; classCode: string; studentCount: number; recordedCount: number; absentCount: number; noRecordCount: number }[]
> {
  const { rows } = await client.query<{
    id: string;
    code: string;
    student_count: number;
    recorded_count: number;
    absent_count: number;
    no_record_count: number;
  }>(
    // MỘT truy vấn cho cả danh sách, không vòng lặp N+1 theo lớp.
    //
    // Gốc là SỔ GHI DANH (`core.enrollments`) rồi LEFT JOIN check-in — cùng nguyên tắc đã
    // ghi ở `care.getClassRoster`: lấy bảng check-in làm gốc thì em chưa bấm gì biến mất
    // khỏi chính sĩ số lớp mình, và `noRecordCount` sẽ luôn bằng 0 dù không ai điểm danh.
    //
    // NGUỒN LÀ `attendance.checkins`, KHÔNG phải `attendance.checkins_care`: view đó gác
    // cột `mood` sau `core.can_read_mood()` và lọc theo DÒNG, nên với người không qua được
    // cổng mood thì mất mood là mất cả dòng — bảng trắng toàn NULL, và màn hình vẽ NULL
    // thành "Chưa điểm danh". Đo thật dưới phiên Cô Lan hồi 01/08/2026: 5/5 em `NULL` từ
    // `checkins_care` so với 5/5 em `present` từ `attendance.checkins`. Câu này không chọn
    // cột `mood`, nên RLS bảng gốc cho qua.
    //
    // `count(k.status)` đếm trạng thái KHÁC NULL; nhánh `filter (where k.status is null)`
    // gom cả "không có dòng nào" lẫn "có dòng mà chưa có trạng thái". Hai vế cộng lại luôn
    // bằng sĩ số — nên màn hình không bao giờ phải tự trừ để ra "chưa ghi", và không ai
    // trừ nhầm thành "vắng" (QĐ-3).
    `select c.id,
            c.code,
            count(*)::int                                            as student_count,
            count(k.status)::int                                     as recorded_count,
            count(*) filter (where k.status = 'absent')::int          as absent_count,
            count(*) filter (where k.status is null)::int             as no_record_count
       from core.enrollments e
       join core.classes c on c.id = e.class_id
       left join attendance.checkins k
         on k.student_id = e.student_id and k.occurred_on = $1::date and k.kind = 'in'
      where e.valid_to is null
        and core.teaches(e.student_id)
      group by c.id, c.code
      order by c.code`,
    [onDate],
  );

  return rows.map((r) => ({
    classId: r.id,
    classCode: r.code,
    studentCount: r.student_count,
    recordedCount: r.recorded_count,
    absentCount: r.absent_count,
    noRecordCount: r.no_record_count,
  }));
}

/**
 * Nắn `classId` do client gửi về đúng một lớp mình DẠY.
 *
 * Không truyền gì → lớp đầu THEO MÃ LỚP (`readMyTeachingClasses` đã `order by c.code`), nên
 * bộ chọn lớp trên màn hình và mặc định của máy chủ luôn mở cùng một lớp. Truyền lớp không
 * phải của mình → FORBIDDEN, KHÔNG phải một danh sách rỗng: rỗng vì không có gì và rỗng vì
 * không được phép là hai chuyện khác nhau, và trình bày cái sau thành cái trước là dạy người
 * dùng tin vào một câu trả lời sai.
 */
function requireMyTeachingClass(myClasses: { classId: string }[], requested?: string): string {
  if (!requested) {
    const first = myClasses[0]?.classId;
    if (!first) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Thầy cô chưa được phân công dạy lớp nào." });
    }
    return first;
  }
  if (!myClasses.some((c) => c.classId === requested)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Thầy cô không dạy lớp này." });
  }
  return requested;
}

export const teachingRouter = router({
  /**
   * Các lớp tôi dạy, kèm tình hình điểm danh của ngày đang xem.
   *
   * Không nhận tham số ngày: màn hình này trả lời câu hỏi buổi sáng ("lớp mình hôm nay ra
   * sao"), và `getRoster` mới là chỗ xem lại một ngày cũ. Ngày tính bằng `toLocalIsoDate`
   * (giờ Việt Nam) chứ không bằng `current_date` của Postgres — pool đã ghim múi giờ, nhưng
   * để tầng ứng dụng và tầng SQL cùng nói một ngày thì phải có đúng MỘT nơi quyết định.
   */
  getMyClasses: teachingProcedure.query(async ({ ctx }) => {
    const onDate = toLocalIsoDate(new Date());
    return ctx.runWithDb(async (client) => {
      const classes = await readMyTeachingClasses(client, onDate);
      return GetMyTeachingClassesOutput.parse({ asOfDate: onDate, classes });
    });
  }),

  /**
   * Danh sách em của MỘT lớp mình dạy, kèm trạng thái điểm danh của ngày đang xem.
   *
   * Hai hàng rào chồng lên nhau, cố ý:
   *   1. `requireMyTeachingClass` — `classId` phải nằm trong tập lớp `core.class_assignments`
   *      công nhận cho chính người gọi.
   *   2. `core.teaches(e.student_id)` LẶP LẠI ngay trong câu SQL. Trông thừa sau bước (1),
   *      và nó thừa đúng theo nghĩa ta muốn: nếu ai đó sửa (1) thành nhẹ tay hơn — hoặc gọi
   *      thẳng câu này từ một procedure khác — thì câu SQL vẫn tự khoá theo phân công dạy.
   *
   * Vế (2) KHÔNG phải trang trí, và đã đo được chỗ nó gánh việc thật: RLS một mình cho đáp
   * số ĐÚNG với tài khoản chỉ mang vai `teacher`, nhưng SAI với người vừa dạy môn vừa kiêm
   * tâm lý cụm — nhánh `in_my_cluster` của `core.can_see_student` mở toàn bộ học sinh cơ
   * sở, và danh sách "Lớp tôi dạy" lặng lẽ mọc từ 3 lên 7 lớp. Xem lượt thử ngược ghi ở đầu
   * `tests/db/gv-bo-mon.test.ts`.
   *
   * `className` lấy từ danh sách ĐÃ ĐƯỢC DUYỆT ở bước (1), không phải một câu
   * `select code from core.classes where id = $1` riêng: `core.classes` không bật RLS nên
   * câu đó trả về mã lớp của BẤT KỲ lớp nào trong trường. Một FORBIDDEN kèm mã lớp có thật
   * là một cửa dò danh sách lớp miễn phí.
   */
  getRoster: teachingProcedure.input(GetTeachingRosterInput).query(async ({ ctx, input }) => {
    const onDate = input.onDate ?? toLocalIsoDate(new Date());

    return ctx.runWithDb(async (client) => {
      const myClasses = await readMyTeachingClasses(client, onDate);
      const classId = requireMyTeachingClass(myClasses, input.classId);
      const className = myClasses.find((c) => c.classId === classId)?.classCode ?? "";

      const { rows } = await client.query<{
        student_id: string;
        student_code: string;
        full_name: string;
        status: string | null;
      }>(
        // BỐN CỘT. Danh sách cột này là một hàng rào, không phải một lựa chọn hiển thị:
        // thêm `k.mood` vào đây thì câu ném 42501 (grant theo cột, 0044) và cả màn hình
        // chết — nhưng thêm một LEFT JOIN sang `care.flags` hay `attendance.help_requests`
        // thì KHÔNG ném gì cả, chỉ lặng lẽ trả về toàn `false`. Cái thứ hai mới là cái
        // nguy hiểm, vì nó trông y hệt "lớp này đang yên".
        `select e.student_id,
                s.student_code,
                s.full_name,
                k.status
           from core.enrollments e
           join core.students s on s.id = e.student_id
           left join attendance.checkins k
             on k.student_id = e.student_id and k.occurred_on = $2::date and k.kind = 'in'
          where e.class_id = $1
            and e.valid_to is null
            and core.teaches(e.student_id)
          order by s.full_name`,
        [classId, onDate],
      );

      return GetTeachingRosterOutput.parse({
        classId,
        className,
        asOfDate: onDate,
        students: rows.map((r) => ({
          studentId: r.student_id,
          studentCode: r.student_code,
          fullName: r.full_name,
          status: r.status as AttendanceStatus | null,
        })),
      });
    });
  }),
});
