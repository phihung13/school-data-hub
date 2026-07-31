// apps/hub/app/api/embed/alias/route.ts
// Đường B (ADR-017 mục 1.1): app ngoài đưa access_token OIDC của chính người đang dùng app,
// Hub trả về alias riêng của app đó cho em học sinh tương ứng — Hub sinh alias, app không tự khai.
import { NextResponse } from "next/server";
import { withServiceRole } from "@hub/core/db";
import { findEmbedApp } from "@/server/embed/registry";

function getIssuer(): string {
  return process.env.HUB_URL ?? "http://localhost:3000";
}

export async function POST(req: Request) {
  const appId = req.headers.get("x-embed-app");
  const auth = req.headers.get("authorization");
  if (!appId || !findEmbedApp(appId)) {
    return NextResponse.json({ error: "app_id không hợp lệ" }, { status: 400 });
  }
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "thiếu access_token" }, { status: 401 });
  }

  // Xác thực token bằng chính userinfo endpoint của Hub — app ngoài không cầm khóa riêng (mục 1.3).
  const userinfo = await fetch(`${getIssuer()}/oidc/me`, { headers: { authorization: auth } });
  if (!userinfo.ok) {
    return NextResponse.json({ error: "access_token không hợp lệ hoặc hết hạn" }, { status: 401 });
  }
  const claims = (await userinfo.json()) as { sub: string; hub_role?: string };
  if (claims.hub_role !== "student") {
    return NextResponse.json({ error: "chỉ học sinh mới có alias evidence" }, { status: 403 });
  }

  // withServiceRole('connector') thay cho withSystemContext (§8): withSystemContext không
  // SET ROLE nên chạy bằng vai chủ schema — bỏ qua RLS và mọi GRANT, đúng thứ §8 sinh ra để
  // chặn. Đổi user_id → student_id làm BÊN TRONG core.issue_embed_alias_for_user (security
  // definer, 0028) để connector không cần một mẩu quyền đọc nào trên core.students.
  const alias = await withServiceRole("connector", async (client) => {
    const { rows } = await client.query<{ issue_embed_alias_for_user: string | null }>(
      "select core.issue_embed_alias_for_user($1, $2)",
      [appId, claims.sub],
    );
    return rows[0]?.issue_embed_alias_for_user ?? null;
  });

  if (!alias) {
    return NextResponse.json({ error: "user này không map được sang core.students" }, { status: 404 });
  }
  return NextResponse.json({ alias });
}
