// packages/core/auth-adapter/dev-provider.ts
//
// DEV ONLY — thay cho Google OAuth (CBGV/học sinh) và Zalo OAuth (phụ huynh) thật.
// Hạ tầng OAuth thật (client_id/secret Google, app Zalo OA) chưa mua (xem
// `10-mua-sam-ha-tang.md`) nên GĐ1 dùng danh sách tài khoản fixture để dev/demo
// chạy được hết luồng RLS thật trên Postgres thật — không phải màn hình giả.
//
// Khi có Google/Zalo OAuth thật: viết thêm `google-provider.ts`/`zalo-provider.ts`
// cùng shape trả về { authUid, displayName, roles }, đổi UI đăng nhập trỏ sang đó.
// Không đổi session.ts, không đổi db/client.ts, không đổi router nào.

import { withAnonContext, withSystemContext } from "../db/client.ts";
import type { HubRole } from "../contracts/auth.ts";

export interface DevAccount {
  authUid: string;
  email: string;
  displayName: string;
  audience: "staff" | "student"; // tab "Học sinh & Thầy cô"
}

/**
 * Khớp UUID trong packages/core/db/seed/seed.mjs (và test_support.seed_basic() +
 * test_support.seed_khoi()). Danh sách này là CỬA duy nhất để thử một vai trong dev:
 * vai nào không có mặt ở đây thì trên thực tế không ai chạy thử được, dù RLS đã có
 * policy cho nó — và một policy chưa ai từng đi qua thì chưa biết là đúng hay sai.
 *
 * Cả khối 6 (5 lớp) nên có đủ bốn kiểu người lớn, không phải một GVCN mẫu:
 *   · GVCN một lớp   — Cô Lan (6A1), Cô Hạnh (6A2), Thầy Kiên (6A5)
 *   · GVCN HAI lớp   — Cô Vân (6A3 và 6A4): kiểm bộ chọn lớp, lớp mặc định, và
 *                      chuyện số liệu hai lớp không được lẫn vào nhau
 *   · Giáo viên bộ môn — Thầy Nam (Toán 6A1·6A2·6A3), Cô Diệp (Ngữ văn 6A3·6A4·6A5).
 *     Hai người CỐ Ý không dạy hết khối: chỗ trống là mẫu số của mọi câu "thầy cô bộ
 *     môn không thấy em ở lớp mình không dạy". Trước 31/07/2026 seed dev không có
 *     phân công bộ môn nào, nên câu đó xanh vì rỗng chứ không phải vì bị chặn.
 *   · Tâm lý cụm, quản trị kiêm hiệu trưởng cơ sở — như cũ.
 */
export const DEV_ACCOUNTS: DevAccount[] = [
  { authUid: "90000000-0000-0000-0000-000000000001", email: "gvcn@va.edu.vn", displayName: "Cô Lan (chủ nhiệm 6A1)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-000000000006", email: "gvcn2@va.edu.vn", displayName: "Cô Hạnh (chủ nhiệm 6A2)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-000000000008", email: "gvcn3@va.edu.vn", displayName: "Cô Vân (chủ nhiệm 6A3 và 6A4)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-000000000009", email: "gvcn4@va.edu.vn", displayName: "Thầy Kiên (chủ nhiệm 6A5)", audience: "staff" },
  // Thầy Nam (…0002) bị bỏ 31/07/2026 để nhường chỗ cho tài khoản quản trị, và cùng lúc
  // đó vai "teacher" mất luôn tài khoản demo cuối cùng. Trả lại ở đây — không phải cho
  // đủ danh sách, mà vì không có nó thì nhánh "giáo viên bộ môn" của mọi màn hình và
  // mọi policy chưa từng được ai đi qua một lần nào.
  { authUid: "90000000-0000-0000-0000-000000000002", email: "gvbomon@va.edu.vn", displayName: "Thầy Nam (bộ môn Toán)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-00000000000a", email: "gvbomon2@va.edu.vn", displayName: "Cô Diệp (bộ môn Ngữ văn)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-000000000003", email: "tamly@va.edu.vn", displayName: "Cô Mai (tâm lý cụm)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-000000000007", email: "admin.hung@va.edu.vn", displayName: "Hùng (Quản trị)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-000000000005", email: "minh@va.edu.vn", displayName: "Học sinh Minh (6A1)", audience: "student" },
  // Thêm 02/08/2026 — chủ đầu tư: "quá nhiều thầy cô nhưng lại chỉ 1 học sinh?".
  //
  // Nhận xét đúng, và nó chỉ ra một lỗ kiểm chứng chứ không chỉ một danh sách lệch: cả
  // phía HỌC SINH của hệ chỉ từng được đi qua bằng ĐÚNG MỘT tài khoản, mà em đó lại là
  // em duy nhất KHÔNG mang cờ nào. Nghĩa là màn của một em ĐANG có cờ — thứ mà cả hệ
  // chăm sóc sinh ra để phục vụ — chưa ai mở bằng mắt lần nào.
  //
  // Hai em thêm vào có chủ ý khác nhau (tên lấy đúng theo seed, không tự đặt):
  //   · Khôi là em số 7 của 6A3, mang chuỗi cảm xúc xấu do seed gieo ⇒ đo được 1 cờ
  //     E_MOOD thật, và là lớp của Cô Vân nên đối chiếu được bảng điều khiển ↔ màn của em.
  //   · An là em số 1 cùng lớp, 0 cờ ⇒ mẫu đối chứng. Không có nó thì mọi khẳng định
  //     "em này khác em kia" đều thiếu vế so sánh.
  //
  // Mã bắt đầu từ …0010 vì …000b–…000f đã là năm thầy cô khối 7–8.
  { authUid: "90000000-0000-0000-0000-000000000010", email: "hs.khoi@va.edu.vn", displayName: "Học sinh Khôi (6A3 · đang có cờ)", audience: "student" },
  { authUid: "90000000-0000-0000-0000-000000000011", email: "hs.an@va.edu.vn", displayName: "Học sinh An (6A3)", audience: "student" },
  // Phụ huynh ĐÃ CÓ trong cơ sở dữ liệu từ lâu (core.parents, ph@va.edu.vn) nhưng chưa
  // bao giờ có mặt ở đây — nên vai phụ huynh chỉ vào được bằng mã mời, và Báo cáo
  // Trưởng thành chưa ai xem bằng đúng con mắt sẽ đọc nó.
  { authUid: "90000000-0000-0000-0000-000000000004", email: "ph@va.edu.vn", displayName: "Phụ huynh của Minh", audience: "student" },
];

export function findDevAccount(authUid: string): DevAccount | undefined {
  return DEV_ACCOUNTS.find((a) => a.authUid === authUid);
}

/**
 * Redeem mã mời phụ huynh. Chạy bằng vai `anon` (chưa đăng nhập) qua hàm
 * SECURITY DEFINER `core.redeem_parent_invite_code` (0013) — người gọi không
 * bao giờ tự viết SQL đọc/ghi bảng `core.parent_invite_codes`.
 */
export async function redeemInviteCode(code: string): Promise<string> {
  return withAnonContext(async (client) => {
    const { rows } = await client.query<{ redeem_parent_invite_code: string }>(
      "select core.redeem_parent_invite_code($1) as redeem_parent_invite_code",
      [code],
    );
    const authUid = rows[0]?.redeem_parent_invite_code;
    if (!authUid) throw new Error("Không redeem được mã mời");
    return authUid;
  });
}

export interface ResolvedIdentity {
  userId: string;
  authUid: string;
  displayName: string;
  email: string | null;
  roles: HubRole[];
  studentId: string | null;
  homeroomClassId: string | null;
  /**
   * Mã lớp để hiển thị ("6A1"), KHÔNG phải UUID — `homeroomClassId` ở trên là khóa,
   * dán thẳng lên sidebar sẽ ra một chuỗi 36 ký tự vô nghĩa. Với GVCN là lớp chủ
   * nhiệm; với học sinh là lớp đang học. Người không thuộc hai nhóm đó (phụ huynh,
   * tâm lý cụm, quản trị) là `null` — nơi hiển thị phải bỏ hẳn hậu tố, không bịa.
   *
   * GVCN NHIỀU LỚP (Cô Vân chủ nhiệm 6A3 và 6A4 trong seed): hai trường này trả về
   * lớp ĐẦU TIÊN THEO MÃ LỚP, cùng quy tắc mà `care.getMyClasses` dùng để chọn lớp
   * mặc định — nên nhãn trên sidebar và lớp mà buồng lái mở ra là một. Đây vẫn là
   * NỬA SỰ THẬT khi cô có hai lớp: nhãn ghi "6A3" trong khi cô còn 6A4. Chỗ sửa đúng
   * là bộ chọn lớp ở tầng giao diện, không phải ở đây (xem canPhoiHop của gói việc).
   */
  className: string | null;
}

/**
 * Nạp đủ thông tin phiên từ authUid — dùng ngay sau đăng nhập để mint session
 * token, và ở tRPC context để dựng SessionUser mà không phải query lại nhiều nơi.
 * Chạy bằng `withSystemContext` (không SET ROLE, không mang RLS) vì đây LÀ bước
 * xác lập ai đứng sau request — chưa có authUid nào để đặt vào RLS context cả.
 *
 * MỘT truy vấn, không phải ba. Hàm này nằm trên đường render của 7 trang server
 * component, mỗi lượt gọi là một kết nối pool + begin/commit; ba lượt đi-về nối
 * tiếp cộng thẳng vào TTFB của mọi trang. Gộp bằng CTE cho cùng kết quả, và
 * `left join` giữ đúng ngữ nghĩa cũ (không có vai/không phải học sinh vẫn trả về
 * người dùng chứ không phải null).
 */
export async function resolveIdentity(authUid: string): Promise<ResolvedIdentity | null> {
  return withSystemContext(async (client) => {
    const { rows } = await client.query<{
      id: string;
      full_name: string;
      email: string | null;
      status: string;
      roles: HubRole[] | null;
      student_id: string | null;
      homeroom_class_id: string | null;
      class_name: string | null;
    }>(
      `with u as (
         select id, full_name, email, status
           from core.users
          where auth_uid = $1
       ),
       scopes as (
         -- ORDER BY cl.code KHÔNG phải trang trí. Với một GVCN hai lớp (Cô Vân:
         -- 6A3 + 6A4), array_agg không ORDER BY trả về thứ tự của planner: hôm nay
         -- ra 6A3, sau một lần VACUUM ra 6A4, và người dùng thấy tên lớp trên sidebar
         -- tự đổi giữa hai lần đăng nhập. Sắp theo mã lớp cho ra CÙNG một lớp mà
         -- care.getMyClasses chọn làm mặc định — hai nơi không còn trả lời khác nhau.
         select array_agg(distinct s.role_code) as roles,
                (array_agg(s.class_id order by cl.code)
                   filter (where s.role_code = 'homeroom'))[1]
                  as homeroom_class_id
           from core.user_role_scopes s
           join u on u.id = s.user_id
           left join core.classes cl on cl.id = s.class_id
       ),
       st as (
         select s.id from core.students s join u on u.id = s.user_id
       )
       select u.id, u.full_name, u.email, u.status,
              scopes.roles,
              st.id as student_id,
              scopes.homeroom_class_id,
              coalesce(
                (select c.code from core.classes c where c.id = scopes.homeroom_class_id),
                (select c.code
                   from core.enrollments e
                   join core.classes c on c.id = e.class_id
                  where e.student_id = st.id and e.valid_to is null
                  order by e.valid_from desc
                  limit 1)
              ) as class_name
         from u
         cross join scopes
         left join st on true`,
      [authUid],
    );

    const row = rows[0];
    // Không có người dùng, hoặc tài khoản đã khoá — cùng một câu trả lời: không có
    // phiên. "Khoá là cắt" (ADR-016) phải đúng ngay từ bước dựng phiên, không đợi
    // RLS chặn ở tầng dưới.
    if (!row || row.status !== "active") return null;

    return {
      userId: row.id,
      authUid,
      displayName: row.full_name,
      email: row.email,
      roles: row.roles ?? [],
      studentId: row.student_id,
      homeroomClassId: row.homeroom_class_id,
      className: row.class_name,
    };
  });
}
