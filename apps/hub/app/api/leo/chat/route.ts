// POST /api/leo/chat — chatbot "Leo" của buồng lái. Gọi LLM qua TRẠM AI (§7): mọi lượt
// đi qua hoiAi (hạn mức → bóc PII → khai lại → gọi OpenRouter → lọc → ghi sổ). Khoá chỉ
// sống ở server (§4) — client chỉ gửi câu hỏi, nhận câu trả lời.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { hoiAi } from "@/server/ai/tram";
import { nhaCungCapMacDinh } from "@/server/ai/nha-cung-cap";
import { docCauHinhAi } from "@/server/ai/cau-hinh";

export const runtime = "nodejs";

// Bối cảnh buồng lái (SỐ LIỆU DEMO) để Leo trả lời sát — nói thẳng là demo trong prompt.
const PROMPT_HE_THONG = [
  "Bạn là Leo — trợ lý AI của Major OS, hệ điều hành vận hành của Hệ thống Trường Việt Anh.",
  "Xưng 'em', gọi người dùng 'anh/chị'. Trả lời ngắn gọn, thực tế, tiếng Việt.",
  "Bối cảnh buồng lái hôm nay (SỐ LIỆU DEMO, chưa nối nguồn thật — nói rõ nếu được hỏi độ chính xác):",
  "- Sỹ số 1.645/1.750 (94% công suất). Referral hôm nay 7, luỹ kế năm 412.",
  "- Cash in 486tr (luỹ kế 92,4 tỷ), cash out 312tr. Qlead 34/6.180.",
  "- Cộng đồng 128.400 subs (71% mục tiêu 180.000). 18 đề xuất cải tiến chờ duyệt.",
  "- Lịch: 07:15 sinh hoạt đầu tuần, 08:30 giao ban BĐH, 10:00 duyệt ngân sách Q4, 16:00 duyệt đề xuất.",
  "Không bịa dữ liệu học sinh cụ thể. Nếu người dùng buồn/khủng hoảng, khuyên gặp thầy cô tâm lý.",
].join("\n");

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const cfg = await docCauHinhAi();
  if (!cfg.khoa) {
    // 503 + cờ để UI gợi ý vào Cài đặt thay vì báo lỗi chung chung.
    return NextResponse.json({ chuaCauHinh: true }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = String(body.message ?? "").trim().slice(0, 2000);
  if (!message) {
    return NextResponse.json({ error: "Thiếu message" }, { status: 400 });
  }

  try {
    const kq = await hoiAi(
      session.authUid,
      { cauHoi: message, promptHeThong: PROMPT_HE_THONG, appId: "leo" },
      await nhaCungCapMacDinh(),
    );
    if (kq.ok) {
      return NextResponse.json({ reply: kq.traLoi });
    }
    // Trạm chặn có lý do rõ (hạn mức / lọc / còn PII / lỗi nhà cung cấp) — trả câu người-đọc.
    const status = kq.ly_do === "qua_han_muc" ? 429 : kq.ly_do === "loi_nha_cung_cap" ? 502 : 200;
    return NextResponse.json({ reply: kq.noi, ly_do: kq.ly_do }, { status });
  } catch {
    return NextResponse.json({ error: "Trợ lý đang bận, thử lại sau." }, { status: 502 });
  }
}
