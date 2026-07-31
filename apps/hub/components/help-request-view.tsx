// components/help-request-view.tsx — V5 Cần gặp thầy cô (Hub Desktop V2, 30/07/2026).
//
// Sửa 31/07/2026 (gói "frontend-trang-thai"). Đây là trang QUAN TRỌNG NHẤT trong
// bốn trang bị chặn ở điện thoại: nó là đường an toàn tâm lý của học sinh, được
// mời từ trang chủ và từ popup check-in — mà mở trên điện thoại thì trước đây chỉ
// hiện một câu "tối ưu cho máy tính". Em cần nói với cô lúc 9 giờ tối, cầm điện
// thoại, và hệ thống trả lời "quay lại bằng máy tính". Không chấp nhận được.
//
// Nội dung vốn đã là form 3 bước xếp dọc nên bản mobile không cần vẽ lại: bỏ khối
// md:hidden, dùng MiniAppHeader thay sidebar dưới md, và để `flex-wrap` sẵn có đẩy
// cột phải ("Ai đọc được lời con?") xuống dưới.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  HELP_REQUEST_TOPIC_LABEL,
  HELP_REQUEST_URGENCY_LABEL,
  type HelpRequestTopic,
  type HelpRequestUrgency,
  type HubRole,
} from "@hub/core/contracts";
import { HubSidebar } from "./hub-sidebar";
import { MiniAppHeader } from "./mini-app-header";
import { Mascot } from "./mascot";
import { MutationError } from "./ui/query-state";
import { personName } from "./ui/labels";

const TOPIC_ICON: Record<HelpRequestTopic, string> = {
  lop: "groups",
  nha: "home",
  hoc: "menu_book",
  suc_khoe: "favorite",
  khac: "more_horiz",
};

export function HelpRequestView({
  displayName,
  email,
  roles,
  classCode,
}: {
  displayName: string;
  email: string;
  roles: HubRole[];
  classCode?: string | null;
}) {
  const router = useRouter();
  const teacher = trpc.checkin.getMyHomeroomTeacher.useQuery();
  const submit = trpc.checkin.requestHelp.useMutation();

  const [topic, setTopic] = useState<HelpRequestTopic | null>(null);
  const [urgency, setUrgency] = useState<HelpRequestUrgency | null>(null);
  const [note, setNote] = useState("");

  // full_name có thể mang theo hậu tố "(GVCN 6A1)" (dữ liệu fixture) — bỏ đi, chỉ
  // hiển thị tên thật để gọi ("Cô Lan"), không đoán thứ tự họ/tên tiếng Việt.
  const teacherName = personName(teacher.data?.full_name) || "GVCN";
  const teacherFirstWord = teacherName;
  const teacherInitial = teacherFirstWord.slice(0, 1).toUpperCase();

  const canSubmit = topic !== null && urgency !== null && !submit.isPending;

  function handleSubmit() {
    if (!topic || !urgency) return;
    submit.mutate({ topic, urgency, note: note.trim() || undefined });
  }

  // Dòng phụ đề: "…" chỉ khi ĐANG tải. Hỏng thì nói rõ là chưa biết tên cô, nhưng
  // KHÔNG chặn em gửi — máy chủ tự tìm GVCN từ phiên, không cần client biết tên.
  const teacherSubtitle = teacher.data
    ? `Gửi riêng cho ${teacherFirstWord} — GVCN lớp ${teacher.data.class_code}`
    : teacher.isPending
      ? "…"
      : "Chưa tải được tên GVCN — em vẫn gửi được, cô vẫn nhận được.";

  return (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Sidebar chỉ từ md; dưới md dùng MiniAppHeader (có đường thoát về Hub). */}
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="home" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
        <div className="md:hidden">
          <MiniAppHeader
            title="Mình cần gặp thầy cô"
            subtitle={teacher.data ? `GVCN ${teacher.data.class_code}` : undefined}
            icon="waving_hand"
            gradient="from-gold to-gold-dark"
          />
        </div>
        <div className="hidden flex-none items-center gap-3 border-b border-[#E9ECF2] bg-white px-7 py-3.5 md:flex">
            <button
              onClick={() => router.back()}
              aria-label="Quay lại"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#4E5F78] hover:bg-[#F1F4F8]"
            >
              <span className="msr text-[21px]">arrow_back</span>
            </button>
            <div className="flex-1">
              <div className="text-[16px] font-black text-ink">Mình cần gặp thầy cô</div>
              <div className="text-[11.5px] text-caption">{teacherSubtitle}</div>
            </div>
          </div>

          <div className="flex-1 p-4 md:overflow-y-auto md:p-7">
            {submit.isSuccess ? (
              <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-[22px] bg-white p-6 text-center shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-10">
                <Mascot pose="celebrate" width={72} />
                <div className="text-[18px] font-black text-navy">Đã gửi cho {teacherFirstWord} rồi!</div>
                <p className="text-[13.5px] leading-relaxed text-caption">
                  {teacherFirstWord} sẽ đọc và tìm con sớm. Đây là một bước dũng cảm.
                </p>
                <button
                  onClick={() => router.push("/home")}
                  className="rounded-[15px] bg-gradient-to-r from-navy to-[#1E5FB8] px-7 py-3.5 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.28)]"
                >
                  Về trang chủ
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-4 md:gap-5">
                <div className="min-w-0 flex-[2.1_1_320px] flex flex-col gap-[22px] rounded-[22px] bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:flex-[2.1_1_520px] md:p-6">
                  <div>
                    <div className="text-[13px] font-black tracking-wide text-[#5B6B80]">
                      1 · CHUYỆN GÌ KHIẾN CON MUỐN GẶP CÔ?
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {(Object.keys(HELP_REQUEST_TOPIC_LABEL) as HelpRequestTopic[]).map((key) => {
                        const active = topic === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setTopic(key)}
                            className={
                              active
                                ? "flex items-center gap-2 rounded-2xl border-[1.7px] border-navy bg-[#F5F8FF] px-[18px] py-3 text-[13.5px] font-extrabold text-navy shadow-[0_0_0_3px_rgba(30,95,184,.1)]"
                                : "flex items-center gap-2 rounded-2xl border-[1.5px] border-[#E4E9F0] px-[18px] py-3 text-[13.5px] font-bold text-[#33507C] hover:border-[#C9D6E6]"
                            }
                          >
                            <span className={`msr text-[19px] ${active ? "text-[#2C7BF2]" : "text-[#5B6B80]"}`}>
                              {TOPIC_ICON[key]}
                            </span>
                            {HELP_REQUEST_TOPIC_LABEL[key]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-[13px] font-black tracking-wide text-[#5B6B80]">2 · CON MUỐN GẶP KHI NÀO?</div>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {(Object.keys(HELP_REQUEST_URGENCY_LABEL) as HelpRequestUrgency[]).map((key) => {
                        const active = urgency === key;
                        const isUrgent = key === "urgent";
                        return (
                          <button
                            key={key}
                            onClick={() => setUrgency(key)}
                            className={
                              active
                                ? isUrgent
                                  ? "flex-1 basis-[150px] rounded-2xl border-[1.7px] border-[#F0474D] bg-[#FFF5F5] px-3.5 py-3.5 text-center text-[13px] font-black text-[#D2383E]"
                                  : "flex-1 basis-[150px] rounded-2xl border-[1.7px] border-navy bg-[#F5F8FF] px-3.5 py-3.5 text-center text-[13px] font-black text-navy"
                                : "flex-1 basis-[150px] rounded-2xl border-[1.5px] border-[#E4E9F0] px-3.5 py-3.5 text-center text-[13px] font-bold text-[#33507C] hover:border-[#C9D6E6]"
                            }
                          >
                            {HELP_REQUEST_URGENCY_LABEL[key]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-black tracking-wide text-[#5B6B80]">
                        3 · CON MUỐN NÓI GÌ TRƯỚC KHÔNG?
                      </span>
                      <span className="text-[11px] font-bold text-[#9AA5B5]">không bắt buộc</span>
                    </div>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      placeholder="Con thấy hơi lo khi phải thuyết trình trước lớp vào thứ Sáu…"
                      className="mt-3 min-h-[96px] w-full resize-none rounded-2xl border-[1.5px] border-[#E4E9F0] bg-[#FCFDFE] p-4 text-[13.5px] leading-relaxed text-ink placeholder:text-[#9AA5B5] focus:border-navy focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-[#F1F4F8] pt-1">
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-navy to-[#1E5FB8] px-7 py-4 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.28)] disabled:opacity-40"
                    >
                      <span className="msr text-[20px]">send</span>
                      Gửi cho {teacherFirstWord}
                    </button>
                    <button
                      onClick={() => router.push("/home")}
                      className="rounded-2xl border-[1.5px] border-[#E4E9F0] bg-white px-5 py-4 text-[14px] font-extrabold text-[#5B6B80]"
                    >
                      Để sau
                    </button>
                    {/* Câu lỗi THẬT (hết phiên / mất mạng / vượt hạn mức) thay cho
                        "Gửi chưa được, thử lại nhé." — em cần biết bấm lại có ích không. */}
                    {submit.isError && <MutationError error={submit.error} onRetry={handleSubmit} />}
                  </div>
                </div>

                <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-4">
                  <div className="rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gradient-to-br from-navy to-[#1E5FB8] text-[16px] font-black text-white">
                        {teacherInitial}
                      </span>
                      <div>
                        <div className="text-[14px] font-black text-ink">{teacherName}</div>
                        <div className="text-[11.5px] text-caption">
                          {teacher.data
                            ? `GVCN ${teacher.data.class_code} · thường trả lời trong ngày`
                            : teacher.isPending
                              ? "…"
                              : "chưa tải được thông tin GVCN"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-[#CFE4FB] bg-[#F0F7FF] p-5">
                    <div className="flex items-center gap-2">
                      <span className="msr text-[20px] text-[#2C7BF2]">lock</span>
                      <span className="text-[14px] font-black text-[#1D4E8F]">Ai đọc được lời con?</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="msr flex-none text-[17px] text-[#00A05F]">check_circle</span>
                      <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
                        {teacherFirstWord} — GVCN của con
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="msr flex-none text-[17px] text-[#D2383E]">cancel</span>
                      <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
                        Bạn cùng lớp · thầy cô khác · bố mẹ — <b>không</b> nhìn thấy
                      </span>
                    </div>
                    <div className="border-t border-[#CFE4FB] pt-2.5 text-[11.5px] leading-relaxed text-[#4E7BB0]">
                      Nếu chuyện cần người chuyên môn hỗ trợ, {teacherFirstWord} sẽ hỏi ý con trước khi chuyển tới
                      phòng tâm lý.
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-[20px] bg-white p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                    <Mascot pose="think" width={44} />
                    <p className="text-[12.5px] font-semibold leading-relaxed text-[#33507C]">
                      Nói ra là bước dũng cảm. Không có câu trả lời nào là sai cả!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
