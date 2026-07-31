// apps/hub/server/oidc/claims.ts — assemble claims cho scope `hub_profile` (03-api.md).
// Không claim nào chứa tên thật/student_code/số điện thoại — chỉ role + mã cơ sở + mã lớp.
import { withSystemContext } from "@hub/core/db";
import type { HubRole } from "@hub/core/contracts";

export interface HubProfileClaims {
  hub_role: "student" | "teacher" | "parent" | "staff";
  hub_school: string | null;
  hub_classes: string[];
}

function toHubRole(roles: HubRole[]): HubProfileClaims["hub_role"] {
  if (roles.includes("student")) return "student";
  if (roles.includes("guardian")) return "parent";
  if (roles.includes("teacher") || roles.includes("homeroom")) return "teacher";
  return "staff"; // counselor/principal/board/admin — gộp, RP không cần phân biệt sâu hơn
}

export async function resolveHubProfileClaims(userId: string): Promise<HubProfileClaims> {
  return withSystemContext(async (client) => {
    const roleRes = await client.query<{ role_code: HubRole; school_id: string | null; class_id: string | null }>(
      "select role_code, school_id, class_id from core.user_role_scopes where user_id = $1",
      [userId],
    );
    const roles = roleRes.rows.map((r) => r.role_code);

    const schoolIds = Array.from(new Set(roleRes.rows.map((r) => r.school_id).filter((v): v is string => !!v)));
    const classIds = Array.from(new Set(roleRes.rows.map((r) => r.class_id).filter((v): v is string => !!v)));

    // Học sinh không có dòng user_role_scopes riêng cho lớp — lớp suy từ enrollment hiện tại.
    const studentClassRes = await client.query<{ code: string; school_code: string }>(
      `select c.code, s.code as school_code
         from core.students st
         join core.enrollments e on e.student_id = st.id and e.valid_to is null
         join core.classes c on c.id = e.class_id
         join core.schools s on s.id = c.school_id
        where st.user_id = $1`,
      [userId],
    );

    const schoolCodeRes = schoolIds.length
      ? await client.query<{ code: string }>("select code from core.schools where id = any($1::uuid[])", [schoolIds])
      : { rows: [] as { code: string }[] };
    const classCodeRes = classIds.length
      ? await client.query<{ code: string }>("select code from core.classes where id = any($1::uuid[])", [classIds])
      : { rows: [] as { code: string }[] };

    const hub_school =
      schoolCodeRes.rows[0]?.code ?? studentClassRes.rows[0]?.school_code ?? null;
    const hub_classes = Array.from(
      new Set([...classCodeRes.rows.map((r) => r.code), ...studentClassRes.rows.map((r) => r.code)]),
    );

    return { hub_role: toHubRole(roles), hub_school, hub_classes };
  });
}
