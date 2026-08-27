// /api/quan-tri/ai — Cài đặt AI (OpenRouter). GET: trạng thái (đã có khoá? model gì —
// KHÔNG trả khoá, §4). POST: lưu khoá/model (chỉ người lớn; học sinh không cấu hình AI).
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { docCauHinhAi, luuCauHinhAi } from "@/server/ai/cau-hinh";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const cfg = await docCauHinhAi();
  const dungEnv = (process.env.AI_API_KEY ?? "").trim().length > 0;
  return NextResponse.json({ daCoKhoa: cfg.khoa.length > 0, model: cfg.model, khoaBangEnv: dungEnv });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Cấu hình AI là việc của người lớn (nhân viên/quản trị), không phải học sinh.
  if (session.roles.includes("student")) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  }
  // Khoá đặt bằng env của trường thì UI không được đè — nói rõ thay vì âm thầm bỏ qua.
  if ((process.env.AI_API_KEY ?? "").trim().length > 0) {
    return NextResponse.json({ error: "Khoá đang đặt bằng biến môi trường của trường — sửa ở .env.local." }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { khoa?: unknown; model?: unknown };
  const khoa = String(body.khoa ?? "").trim();
  const model = String(body.model ?? "").trim();
  if (khoa.length < 12) {
    return NextResponse.json({ error: "API key không hợp lệ." }, { status: 400 });
  }
  await luuCauHinhAi({ khoa, model: model || undefined });
  const cfg = await docCauHinhAi();
  return NextResponse.json({ ok: true, daCoKhoa: true, model: cfg.model });
}
