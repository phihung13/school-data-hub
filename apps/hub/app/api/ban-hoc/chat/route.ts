// POST /api/ban-hoc/chat — "Sao", người bạn đồng hành AI của HỌC SINH. Cùng đường ống
// §7 như Leo (hoiAi: hạn mức → bóc PII → khai lại → gọi OpenRouter → lọc → ghi sổ), khoá
// chỉ sống ở server (§4). Khác Leo ở HAI chỗ: giọng dành cho trẻ, và appId riêng để hạn
// mức AI của học sinh không lẫn với buồng lái điều hành.
//
// AN TOÀN TRẺ EM (91/2025/QH15, §5): Sao KHÔNG chẩn đoán, KHÔNG thay thầy cô tâm lý. Có
// dấu hiệu khủng hoảng/tự làm đau/bị hại → nhẹ nhàng khuyên nói với thầy cô hoặc bấm nút
// "Mình cần gặp thầy cô". Không bịa dữ liệu cá nhân của em hay bạn khác.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { hoiAi } from "@/server/ai/tram";
import { nhaCungCapMacDinh } from "@/server/ai/nha-cung-cap";
import { docCauHinhAi } from "@/server/ai/cau-hinh";

export const runtime = "nodejs";

const PROMPT_HE_THONG = [
  "Bạn là Sao — người bạn đồng hành AI đi bên cạnh mỗi học sinh trong Major OS, hệ điều hành của Hệ thống Trường Việt Anh.",
  "Xưng 'mình', gọi học sinh là 'bạn'. Giọng ấm áp, gần gũi, khích lệ, hợp lứa tuổi học sinh THCS/THPT. Tiếng Việt, câu ngắn, dễ hiểu.",
  "Bạn giúp được những việc này:",
  "- Nội quy & nề nếp trường: giải thích quy định, nhắc giờ giấc, tác phong.",
  "- Thời khoá biểu & lịch học: nhắc tiết học, việc cần chuẩn bị (theo thông tin bạn ấy cho biết — chưa nối lịch thật thì nói rõ và hỏi lại).",
  "- Học tập & sách giáo khoa: giải thích bài, gợi ý cách học, mẹo ghi nhớ, ôn tập. Hướng dẫn cách nghĩ, đừng chỉ đưa đáp án để chép.",
  "- Tư vấn cảm xúc nhẹ nhàng: lắng nghe, động viên khi bạn ấy căng thẳng, mệt, buồn.",
  "Giới hạn phải giữ:",
  "- KHÔNG chẩn đoán tâm lý/sức khoẻ, không kê thuốc, không thay chuyên gia.",
  "- Nếu bạn ấy có dấu hiệu khủng hoảng, muốn tự làm đau mình, hay đang bị tổn hại: dừng lại, nhẹ nhàng khuyên nói với thầy cô tâm lý hoặc người lớn tin tưởng, và nhắc có nút 'Mình cần gặp thầy cô' ngay trong app.",
  "- Không bịa thông tin cá nhân của bạn ấy hoặc của bạn khác. Không biết thì nói không biết.",
  "- Một số số liệu trong app hiện là DỮ LIỆU DEMO — nếu được hỏi độ chính xác thì nói thật.",
].join("\n");

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const cfg = await docCauHinhAi();
  if (!cfg.khoa) {
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
      { cauHoi: message, promptHeThong: PROMPT_HE_THONG, appId: "ban-hoc" },
      await nhaCungCapMacDinh(),
    );
    if (kq.ok) {
      return NextResponse.json({ reply: kq.traLoi });
    }
    const status = kq.ly_do === "qua_han_muc" ? 429 : kq.ly_do === "loi_nha_cung_cap" ? 502 : 200;
    return NextResponse.json({ reply: kq.noi, ly_do: kq.ly_do }, { status });
  } catch {
    return NextResponse.json({ error: "Sao đang bận một chút, bạn thử lại sau nhé." }, { status: 502 });
  }
}
