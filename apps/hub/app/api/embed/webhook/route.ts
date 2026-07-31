// apps/hub/app/api/embed/webhook/route.ts
// Đường B (03-api.md "Đường 2 — Connector", 08-embedded-apps.md mục 4.3): webhook app ngoài
// → staging.raw_embedded_events (UQ source+external_id, §9) → promote() ngay lập tức.
// Không có đường ghi thứ ba: app không bao giờ ghi thẳng evidence/core từ đây.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withServiceRole } from "@hub/core/db";
import { findEmbedApp, verifyWebhookSecret } from "@/server/embed/registry";
import { readJsonBody } from "@/lib/read-json";

const Body = z.object({
  external_id: z.string().min(1),
  event_type: z.string().min(1),
  // Rổ Xanh (cổng nhận chung): ai thực hiện hành động — sub thật của người đó, app đã có sẵn
  // từ lúc họ đăng nhập qua OIDC bridge (Đường A). Không bắt buộc — có sự kiện không gắn với
  // ai cụ thể (vd tác vụ hệ thống).
  actor_user_id: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
});

/** Kết quả promote() → mã HTTP. Xem chú thích ở cuối file vì sao import_error là 202. */
const HTTP_BY_STATUS: Record<string, number> = {
  promoted: 200,
  already_promoted: 200,
  import_error: 202,
  already_failed: 202,
  raw_not_found: 500,
};

export async function POST(req: Request) {
  const appId = req.headers.get("x-embed-app");
  const secret = req.headers.get("x-embed-secret");
  const app = appId ? findEmbedApp(appId) : undefined;
  if (!app || !verifyWebhookSecret(app, secret)) {
    return NextResponse.json({ error: "app_id/secret không hợp lệ" }, { status: 401 });
  }

  const body = await readJsonBody(req);
  if (!body.ok) return body.response;

  const parsed = Body.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "payload không hợp lệ", detail: parsed.error.flatten() }, { status: 400 });
  }
  const eventAllowed = app.allowedEventTypes.includes("*") || app.allowedEventTypes.includes(parsed.data.event_type);
  if (!eventAllowed) {
    return NextResponse.json({ error: `event_type '${parsed.data.event_type}' không thuộc Manifest của app này` }, { status: 403 });
  }

  const source = `embed:${app.appId}`;
  const fullPayload = {
    ...parsed.data.payload,
    event_type: parsed.data.event_type,
    ...(parsed.data.actor_user_id ? { actor_user_id: parsed.data.actor_user_id } : {}),
  };

  // ── Giao dịch 1: nhận và CHỐT bản ghi thô ────────────────────────────────────
  // Tách khỏi promote() một cách CÓ CHỦ Ý. Trước 31/07/2026 hai việc nằm chung một
  // transaction, nên bất kỳ lỗi nào của promote() cũng rollback luôn cả bản ghi thô: sự
  // kiện biến mất khỏi staging, không có dòng import_errors, app ngoài nhận 500 rồi retry
  // vô hạn. §8 nói ngược lại — bản ghi hỏng phải NẰM LẠI chờ người xử.
  //
  // withServiceRole('connector') chứ không phải withSystemContext: withSystemContext không
  // SET ROLE, chạy bằng vai chủ schema, bỏ qua cả RLS lẫn mọi GRANT — nghĩa là hàng rào §8
  // ("connector chỉ INSERT trên staging") chưa từng được cưỡng chế trên đường đi này.
  let rawId: string | null;
  try {
    rawId = await withServiceRole("connector", async (client) => {
      const { rows } = await client.query<{ ingest_embedded_event: string | null }>(
        "select staging.ingest_embedded_event($1, $2, $3)",
        [source, parsed.data.external_id, JSON.stringify(fullPayload)],
      );
      return rows[0]?.ingest_embedded_event ?? null;
    });
  } catch (err) {
    console.error("[embed/webhook] không ghi được staging", { appId: app.appId, err });
    return NextResponse.json({ error: "không nhận được sự kiện, thử lại sau" }, { status: 503 });
  }

  if (!rawId) {
    console.error("[embed/webhook] ingest không trả raw_id", { appId: app.appId });
    return NextResponse.json({ error: "không nhận được sự kiện, thử lại sau" }, { status: 503 });
  }

  // ── Giao dịch 2: đẩy vào schema nghiệp vụ ───────────────────────────────────
  // Hỏng ở đây không làm mất bản ghi thô nữa (đã commit ở trên). Nếu cả lời gọi này cũng
  // sập (mất kết nối DB giữa chừng), bản ghi vẫn nằm trong staging với promoted_at NULL —
  // lần webhook sau, hoặc job quét lại, promote nó bình thường.
  let status: string;
  try {
    status = await withServiceRole("connector", async (client) => {
      const { rows } = await client.query<{ promote_embedded_event: string }>(
        "select core.promote_embedded_event($1)",
        [rawId],
      );
      return rows[0]?.promote_embedded_event ?? "unknown";
    });
  } catch (err) {
    console.error("[embed/webhook] promote lỗi", { appId: app.appId, rawId, err });
    // 202: đã nhận, chưa xử xong. App ngoài không cần gửi lại — dữ liệu đã nằm trong staging.
    return NextResponse.json(
      { ok: false, rawId, status: "queued", message: "Đã nhận, đang chờ xử lý lại phía Hub." },
      { status: 202 },
    );
  }

  const ok = status === "promoted" || status === "already_promoted";
  // Vì sao 202 chứ không phải 200 cho import_error: trước bản này route trả `ok: true` cho
  // MỌI kết quả, kể cả sự kiện vừa rơi vào hàng đợi lỗi — app ngoài không có cách nào biết
  // dữ liệu của mình không vào kho. Và vì sao không phải 4xx: request hoàn toàn hợp lệ, Hub
  // đã nhận và giữ nó; gửi lại y hệt không sửa được gì (§9 giữ nguyên bản đầu tiên).
  return NextResponse.json(
    {
      ok,
      rawId,
      status,
      ...(ok
        ? {}
        : { message: "Sự kiện đã được nhận nhưng chưa vào kho — đang nằm trong hàng đợi lỗi chờ người xử. Không cần gửi lại." }),
    },
    { status: HTTP_BY_STATUS[status] ?? 500 },
  );
}
