// apps/hub/components/ban-dong-hanh.tsx — "Sao", người bạn đồng hành AI của HỌC SINH.
//
// Chủ đầu tư (27/08/2026): *"học sinh cũng có ai agent … mỗi AI sẽ là 1 đứa bên cạnh học
// sinh đó"* — biết nội quy, giờ giấc, sách giáo khoa, học tập, tư vấn cảm xúc.
//
// Là bản GỌN của ChatbotAgent (buồng lái): BỎ hẳn panel cài đặt — học sinh KHÔNG được
// nhập/khoá API key (§4, và không phải việc của trẻ). Khoá do thầy cô/quản trị đặt một
// lần ở buồng lái, dùng chung cho cả trường; Sao chỉ gọi `/api/ban-hoc/chat` (qua §7).
//
// Giao diện KHÁC buồng lái có chủ ý: navy/gold là giọng điều hành, còn đây là góc của một
// đứa trẻ — bo tròn, tím-hổ phách, ngôi sao. Cùng một app, hai giọng cho hai người dùng.
"use client";

import { useEffect, useRef, useState } from "react";

type Tin = { ai: boolean; text: string };

const CHAO =
  "Chào bạn! 🌟 Mình là Sao — người bạn đi cùng bạn ở trường. Bạn có thể hỏi mình về bài học, thời khoá biểu, nội quy, hay kể cho mình nghe hôm nay bạn thấy thế nào nhé.";

export function BanDongHanh() {
  const [mo, setMo] = useState(false);
  const [msgs, setMsgs] = useState<Tin[]>([{ ai: true, text: CHAO }]);
  const [nhap, setNhap] = useState("");
  const [dangGo, setDangGo] = useState(false);
  const cuonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    cuonRef.current?.scrollTo({ top: 9e6, behavior: "smooth" });
  }, [msgs, dangGo, mo]);

  const gui = async () => {
    const q = nhap.trim();
    if (!q || dangGo) return;
    setMsgs((m) => [...m, { ai: false, text: q }]);
    setNhap("");
    setDangGo(true);
    try {
      const res = await fetch("/api/ban-hoc/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; chuaCauHinh?: boolean };
      if (res.status === 503 || data.chuaCauHinh) {
        setMsgs((m) => [...m, { ai: true, text: "Sao đang được thầy cô kết nối, bạn quay lại sau một chút nhé 💛" }]);
      } else if (!res.ok || !data.reply) {
        setMsgs((m) => [...m, { ai: true, text: "Mình chưa trả lời được lúc này, bạn thử lại sau ít phút nha." }]);
      } else {
        setMsgs((m) => [...m, { ai: true, text: data.reply ?? "" }]);
      }
    } catch {
      setMsgs((m) => [...m, { ai: true, text: "Mình bị mất kết nối rồi, bạn thử lại nhé." }]);
    } finally {
      setDangGo(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-8 z-[70] flex flex-col items-end">
      {mo && (
        <div className="mb-3 flex h-[460px] w-[350px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-3xl border border-[#E4DBFA] bg-white shadow-[0_24px_60px_-12px_rgba(76,29,149,.28)]">
          <div className="flex items-center gap-2.5 rounded-t-3xl bg-[linear-gradient(120deg,#6D5AE6,#8B6BF0)] px-4 py-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/20 text-[#FFE08A]">
              <span className="msr text-[20px]">star</span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-black text-white">Sao · Bạn đồng hành</div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-white/80">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#8CF2C4]" /> Đang ở đây với bạn
              </div>
            </div>
            <button type="button" onClick={() => setMo(false)} aria-label="Đóng" className="flex-none text-white/80 hover:text-white">
              <span className="msr text-[22px]">close</span>
            </button>
          </div>

          <div ref={cuonRef} className="flex-1 space-y-2.5 overflow-y-auto bg-[#FAF8FF] px-3.5 py-3.5">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.ai ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[82%] whitespace-pre-wrap px-3.5 py-2 text-[13px] leading-relaxed ${
                    m.ai
                      ? "rounded-[18px_18px_18px_4px] bg-white text-[#3A3357] shadow-sm"
                      : "rounded-[18px_18px_4px_18px] bg-[#6D5AE6] font-semibold text-white"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {dangGo && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-[18px_18px_18px_4px] bg-white px-3.5 py-3 shadow-sm">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#B7A8F2]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#B7A8F2] [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#B7A8F2] [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-[#EFE9FC] bg-white p-2.5">
            <input
              value={nhap}
              onChange={(e) => setNhap(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void gui();
              }}
              placeholder="Nhắn cho Sao…"
              className="min-w-0 flex-1 rounded-full bg-[#F3EFFE] px-4 py-2 text-[13px] text-[#3A3357] outline-none placeholder:text-[#A99FD0]"
            />
            <button
              type="button"
              onClick={() => void gui()}
              aria-label="Gửi"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#6D5AE6] text-white"
            >
              <span className="msr text-[18px]">send</span>
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setMo((v) => !v)}
        aria-label="Bạn đồng hành Sao"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#7C63F0] to-[#6D5AE6] text-[#FFE08A] shadow-[0_10px_30px_-6px_rgba(109,90,230,.6)] transition hover:scale-105 active:scale-95"
      >
        <span className="msr text-[26px]">{mo ? "close" : "star"}</span>
      </button>
    </div>
  );
}
