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

/** Khớp UUID trong packages/core/db/seed/seed.mjs (và test_support.seed_basic()). */
export const DEV_ACCOUNTS: DevAccount[] = [
  { authUid: "90000000-0000-0000-0000-000000000001", email: "gvcn@va.edu.vn", displayName: "Cô Lan (GVCN 6A1)", audience: "staff" },
  // Thầy Nam (bộ môn 6A1, auth_uid …0002) đã bỏ 31/07/2026 để nhường chỗ cho tài khoản quản
  // trị dưới đây. Bỏ luôn cả trong seed — vai "teacher" (giáo viên bộ môn) tạm không còn tài
  // khoản demo nào; cần thử lại vai đó thì thêm lại vào cả hai file.
  { authUid: "90000000-0000-0000-0000-000000000003", email: "tamly@va.edu.vn", displayName: "Cô Mai (tâm lý cụm)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-000000000005", email: "minh@va.edu.vn", displayName: "Học sinh Minh", audience: "student" },
  { authUid: "90000000-0000-0000-0000-000000000006", email: "gvcn2@va.edu.vn", displayName: "Cô Hạnh (GVCN 6A2)", audience: "staff" },
  { authUid: "90000000-0000-0000-0000-000000000007", email: "admin.hung@va.edu.vn", displayName: "Hùng (Quản trị)", audience: "staff" },
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
         select array_agg(distinct s.role_code) as roles,
                (array_agg(s.class_id) filter (where s.role_code = 'homeroom'))[1]
                  as homeroom_class_id
           from core.user_role_scopes s
           join u on u.id = s.user_id
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
