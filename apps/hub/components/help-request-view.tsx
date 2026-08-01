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
//
// Sửa 31/07/2026 (gói "a11y-nen") — bốn việc, tất cả về "đi được bằng bàn phím và
// nghe được bằng tai":
//   1. Vùng nội dung là <MainContent> (landmark <main id="noi-dung">) và màn có <h1>
//      thật. Trước đó trang không có landmark nào nên đường tắt "Bỏ qua menu" ở
//      layout.tsx bấm vào không đi tới đâu.
//   2. Ô tâm sự bỏ `focus:outline-none`. Nó đang ĐÈ lưới an toàn :focus-visible trong
//      globals.css: ô nhập riêng tư nhất của cả app lại là ô duy nhất không cho biết
//      con trỏ đang ở đâu — chỉ đổi màu viền 1.5px, không đạt 3:1, vô hình với người
//      mù màu.
//   3. Nhãn ô tâm sự là <label htmlFor> thật thay cho <span> đứng cạnh: chạm vào chữ
//      là con trỏ nhảy vào ô, và trình đọc màn hình nói được ô đó dùng để làm gì.
//   4. Hai nhóm nút "chuyện gì" / "khi nào" khai aria-pressed — trạng thái đã chọn
//      trước đây chỉ nói bằng MÀU VIỀN (DESIGN-GUIDELINES §11 cấm màu là tín hiệu duy nhất).
//
// Sửa 31/07/2026 (gói "man-hinh-con-thieu-gvcn-hs") — DẢI TRẠNG THÁI đầu trang:
//
// Màn "Đã gửi rồi!" trước hôm nay chỉ sống trong state React (`submit.isSuccess`). Tải
// lại trang, tắt máy, mở lại buổi tối — không còn một dấu vết nào cho biết lời con gửi
// đã đi đâu. Với một đứa trẻ vừa làm việc khó nhất là mở lời, "không thấy gì nữa" đọc ra
// thành "chắc không ai nhận", và lần sau em sẽ không bấm nữa. Nguyên nhân gốc nằm ở tầng
// máy chủ: MỌI đường đọc `attendance.help_requests` đều nằm sau `homeroomProcedure`, nên
// chính người gửi là người duy nhất không xem được. Nay có `checkin.getMyHelpRequests`.
//
// Hai luật của dải này, không luật nào được nới:
//   · CHỈ TRẠNG THÁI, không đọc lại nội dung. Không chủ đề, không mức độ, không lời con
//     đã viết — em đã viết rồi, và câu đó là thứ riêng tư nhất trong cả app; nó không có
//     lý do gì xuất hiện thêm một lần trên màn hình giữa sân trường.
//   · CHƯA XÁC NHẬN ≠ CHƯA ĐỌC. `handled_at` chỉ nói "chưa ai bấm nút đã-gặp-em". Dải
//     phải nói đúng chừng đó, không được suy ra tin xấu ("cô chưa đọc") và cũng không
//     được suy ra tin tốt ("cô đang xử lý rồi").
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  HELP_REQUEST_TOPIC_LABEL,
  HELP_REQUEST_URGENCY_LABEL,
  type HelpRequestTopic,
  type HelpRequestUrgency,
  type HubRole,
} from "@hub/core/contracts";
import { HubSidebar } from "./hub-sidebar";
import { MainContent } from "./page-shell";
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
  const utils = trpc.useUtils();
  const teacher = trpc.checkin.getMyHomeroomTeacher.useQuery();
  const myRequests = trpc.checkin.getMyHelpRequests.useQuery();
  // Gửi xong phải nạp lại dải trạng thái NGAY: nếu không, màn ăn mừng nói "đã gửi" mà
  // dải ngay trên nó vẫn là ảnh chụp cũ — hai câu trái nhau trên cùng một màn hình.
  const submit = trpc.checkin.requestHelp.useMutation({
    onSuccess: () => void utils.checkin.getMyHelpRequests.invalidate(),
  });

  const [topic, setTopic] = useState<HelpRequestTopic | null>(null);
  const [urgency, setUrgency] = useState<HelpRequestUrgency | null>(null);
  const [note, setNote] = useState("");

  // full_name có thể mang theo hậu tố "(GVCN 6A1)" (dữ liệu fixture) — bỏ đi, chỉ
  // hiển thị tên thật để gọi ("Cô Lan"), không đoán thứ tự họ/tên tiếng Việt.
  const teacherName = personName(teacher.data?.full_name) || "thầy cô chủ nhiệm";
  const teacherFirstWord = teacherName;
  const teacherInitial = teacherFirstWord.slice(0, 1).toUpperCase();

  const canSubmit = topic !== null && urgency !== null && !submit.isPending;

  function handleSubmit() {
    if (!topic || !urgency) return;
    submit.mutate({ topic, urgency, note: note.trim() || undefined });
  }

  // Dòng phụ đề: "…" chỉ khi ĐANG tải. Hỏng thì nói rõ là chưa biết tên cô, nhưng
  // KHÔNG chặn em gửi — máy chủ tự tìm GVCN từ phiên, không cần client biết tên.
  // "GVCN" là từ vựng vận hành — DESIGN-GUIDELINES §8 chỉ cho nó sống ở buồng lái, tâm
  // lý cụm và điều hành. Trên màn của học sinh thì nói như người ta nói: "cô chủ nhiệm".
  const teacherSubtitle = teacher.data
    ? `Gửi riêng cho ${teacherFirstWord} — chủ nhiệm lớp ${teacher.data.class_code}`
    : teacher.isPending
      ? "…"
      : "Chưa tải được tên thầy cô chủ nhiệm — con vẫn gửi được, thầy cô vẫn nhận được.";

  return (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Sidebar chỉ từ md; dưới md dùng MiniAppHeader (có đường thoát về Hub). */}
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="home" fullName={displayName} email={email} classCode={classCode} />
      </div>
      {/* MiniAppHeader nằm NGOÀI <main>: nó là đường thoát về Hub, tức là điều hướng.
          Để nó bên trong thì "bỏ qua menu, tới nội dung" nhảy vào ngay trước nó — bỏ
          qua không được gì. */}
      <div className="md:hidden">
        <MiniAppHeader
          title="Mình cần gặp thầy cô"
          subtitle={teacher.data ? `Chủ nhiệm lớp ${teacher.data.class_code}` : undefined}
          icon="waving_hand"
          gradient="from-gold to-gold-dark"
        />
      </div>
      <MainContent className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
        {/* Tiêu đề màn, dành cho tai — không đổi một pixel nào trên màn.
            Vì sao sr-only chứ không phải đổi thẻ của dòng chữ đang hiện: chữ "Mình cần
            gặp thầy cô" được vẽ ở HAI chỗ khác nhau tuỳ khổ màn (MiniAppHeader ở điện
            thoại, thanh trên ở desktop), mà mỗi chỗ chỉ tồn tại ở một khổ. Đặt <h1> vào
            cả hai là để hai <h1> trong cùng một DOM — mỗi lần đọc lại phải đoán cái nào
            là thật. Một cái duy nhất, luôn có mặt, luôn đúng. */}
        <h1 className="sr-only">Mình cần gặp thầy cô</h1>
        <div className="hidden flex-none items-center gap-3 border-b border-[#E9ECF2] bg-white px-7 py-3.5 md:flex">
            <button
              onClick={() => router.back()}
              aria-label="Quay lại"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#4E5F78] hover:bg-[#F1F4F8]"
            >
              <span aria-hidden="true" className="msr text-[21px]">arrow_back</span>
            </button>
            <div className="flex-1">
              <div className="text-[16px] font-black text-ink">Mình cần gặp thầy cô</div>
              <div className="text-[11.5px] text-caption">{teacherSubtitle}</div>
            </div>
          </div>

          <div className="flex-1 p-4 md:overflow-y-auto md:p-7">
            <SentStatusStrip
              teacherName={teacherFirstWord}
              isPending={myRequests.isPending}
              isError={myRequests.isError}
              onRetry={() => void myRequests.refetch()}
              requests={myRequests.data?.requests ?? []}
            />

            {submit.isSuccess ? (
              <SentSuccessPanel teacherName={teacherFirstWord} onGoHome={() => router.push("/home")} />
            ) : (
              <div className="flex flex-wrap items-start gap-4 md:gap-5">
                <div className="min-w-0 flex-[2.1_1_320px] flex flex-col gap-[22px] rounded-[22px] bg-white p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:flex-[2.1_1_520px] md:p-6">
                  {/* Mỗi bước là một <fieldset> có <legend>: người dùng trình đọc màn hình
                      nghe được "nút Ở lớp, 1 trên 5, trong nhóm CHUYỆN GÌ KHIẾN CON MUỐN
                      GẶP CÔ" chứ không phải một dãy nút rời không rõ thuộc về câu hỏi nào.
                      aria-pressed nói trạng thái đã chọn — trước đó chỉ có màu viền. */}
                  <fieldset className="min-w-0 border-0 p-0">
                    <legend className="text-[13px] font-black tracking-wide text-[#5B6B80]">
                      1 · CHUYỆN GÌ KHIẾN CON MUỐN GẶP CÔ?
                    </legend>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {(Object.keys(HELP_REQUEST_TOPIC_LABEL) as HelpRequestTopic[]).map((key) => {
                        const active = topic === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setTopic(key)}
                            className={
                              active
                                ? "flex items-center gap-2 rounded-2xl border-[1.7px] border-navy bg-[#F5F8FF] px-[18px] py-3 text-[13.5px] font-extrabold text-navy shadow-[0_0_0_3px_rgba(30,95,184,.1)]"
                                : "flex items-center gap-2 rounded-2xl border-[1.5px] border-[#E4E9F0] px-[18px] py-3 text-[13.5px] font-bold text-[#33507C] hover:border-[#C9D6E6]"
                            }
                          >
                            <span
                              aria-hidden="true"
                              className={`msr text-[19px] ${active ? "text-[#2C7BF2]" : "text-[#5B6B80]"}`}
                            >
                              {TOPIC_ICON[key]}
                            </span>
                            {HELP_REQUEST_TOPIC_LABEL[key]}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="min-w-0 border-0 p-0">
                    <legend className="text-[13px] font-black tracking-wide text-[#5B6B80]">
                      2 · CON MUỐN GẶP KHI NÀO?
                    </legend>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {(Object.keys(HELP_REQUEST_URGENCY_LABEL) as HelpRequestUrgency[]).map((key) => {
                        const active = urgency === key;
                        const isUrgent = key === "urgent";
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={active}
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
                  </fieldset>

                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      {/* <label htmlFor> thật, không phải <span> đứng cạnh: chạm vào chữ là
                          con trỏ nhảy vào ô (vùng chạm rộng gấp mấy lần trên điện thoại),
                          và trình đọc màn hình nói được ô này để làm gì. */}
                      <label htmlFor="loi-nhan-cho-co" className="text-[13px] font-black tracking-wide text-[#5B6B80]">
                        3 · CON MUỐN NÓI GÌ TRƯỚC KHÔNG?
                      </label>
                      {/* #9AA5B5 → token muted. Đo sống ở 360px: "không bắt buộc" là 2,49:1
                          trên nền trắng — mà đây là chữ nói cho em biết có được BỎ QUA ô
                          này không, tức là nó quyết định em có bấm gửi hay bỏ dở. #66707D
                          = 5,03:1. (01/08/2026) */}
                      <span className="text-[11px] font-bold text-muted">không bắt buộc</span>
                    </div>
                    <textarea
                      id="loi-nhan-cho-co"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      placeholder="Con thấy hơi lo khi phải thuyết trình trước lớp vào thứ Sáu…"
                      // KHÔNG focus:outline-none ở đây. Nó đè lưới an toàn :focus-visible
                      // của globals.css và để lại đúng một tín hiệu: màu viền — thứ người
                      // mù màu không thấy. Đây lại là ô riêng tư nhất trong cả app.
                      //
                      // Đã bỏ `placeholder:text-[#9AA5B5]` (01/08/2026). Đo qua
                      // getComputedStyle(el,'::placeholder') ở 360px: 2,45:1 trên nền ô
                      // #FCFDFE. Câu gợi ý ở đây không phải trang trí — nó là câu MẪU dạy em
                      // biết ô này viết được gì; ở sân trường lúc 7 giờ sáng, nắng gắt, màn
                      // điện thoại rẻ, 2,45:1 là biến mất. Màu nay đến từ MỘT chỗ duy nhất
                      // trong globals.css (#5B6B80 = 5,34:1 trên #FCFDFE) nên mọi ô nhập của
                      // app cùng đọc được, không phải ô nào có người nhớ thì ô đó mới đạt.
                      className="mt-3 min-h-[96px] w-full resize-none rounded-2xl border-[1.5px] border-[#E4E9F0] bg-[#FCFDFE] p-4 text-[13.5px] leading-relaxed text-ink focus:border-navy"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-[#F1F4F8] pt-1">
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-navy to-[#1E5FB8] px-7 py-4 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.28)] disabled:opacity-40"
                    >
                      <span aria-hidden="true" className="msr text-[20px]">send</span>
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
                            ? `Chủ nhiệm lớp ${teacher.data.class_code} · thường trả lời trong ngày`
                            : teacher.isPending
                              ? "…"
                              : "chưa tải được thông tin thầy cô chủ nhiệm"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-[#CFE4FB] bg-[#F0F7FF] p-5">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="msr text-[20px] text-[#2C7BF2]">lock</span>
                      <span className="text-[14px] font-black text-[#1D4E8F]">Ai đọc được lời con?</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span aria-hidden="true" className="msr flex-none text-[17px] text-[#00A05F]">check_circle</span>
                      <span className="text-[12.5px] leading-relaxed text-[#1D4E8F]">
                        {teacherFirstWord} — chủ nhiệm của con
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span aria-hidden="true" className="msr flex-none text-[17px] text-[#D2383E]">cancel</span>
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
      </MainContent>
    </div>
  );
}

/**
 * Màn "Đã gửi cho cô rồi!" — thay chỗ CẢ form sau một cú bấm.
 *
 * Thêm 01/08/2026 (gói "tuong-phan-man-hoc-sinh"). Trước đó khối này là một `<div>` trần:
 * grep `aria-live` trên trọn 10 file màn học sinh trả về ĐÚNG MỘT dòng, và nó không phải
 * dòng này. Hậu quả đo được từ mã, không phải suy đoán:
 *  · Nút "Gửi cho cô" vừa bấm bị gỡ khỏi DOM cùng cả form, nên focus rơi về `<body>` —
 *    người dùng bàn phím mất chỗ đứng, bấm Tab tiếp là quay lại từ đầu trang.
 *  · Không vùng aria-live nào bao khối mới, nên trình đọc màn hình IM LẶNG đúng lúc màn
 *    hình đang báo việc quan trọng nhất em làm trong app hôm nay.
 *
 * Hai việc, đúng cách LoadingState ở ui/query-state.tsx:149 đã làm: bọc `role="status"
 * aria-live="polite"`, và dời focus lên tiêu đề (ref + tabIndex={-1}). Tiêu đề nay là
 * `<h2>` thật chứ không phải `<div>` — dời focus vào một `<div>` thì trình đọc màn hình
 * đọc lên một dòng chữ không có cấp bậc nào.
 *
 * Đặt focus trong effect LÚC GẮN (không phải theo dõi state đổi): khối này chỉ được dựng
 * khi `submit.isSuccess`, nên "gắn xong" chính là "vừa gửi xong" — không cần cờ phụ, và
 * không có ca focus bị cướp khi người dùng đã tự bấm đi chỗ khác.
 */
function SentSuccessPanel({ teacherName, onGoHome }: { teacherName: string; onGoHome: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-[22px] bg-white p-6 text-center shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-10"
    >
      <Mascot pose="celebrate" width={72} />
      <h2 ref={headingRef} tabIndex={-1} className="text-[18px] font-black text-navy">
        Đã gửi cho {teacherName} rồi!
      </h2>
      <p className="text-[13.5px] leading-relaxed text-caption">
        {teacherName} sẽ đọc và tìm con sớm. Đây là một bước dũng cảm.
      </p>
      <button
        onClick={onGoHome}
        className="min-h-[44px] rounded-[15px] bg-gradient-to-r from-navy to-[#1E5FB8] px-7 py-3.5 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.28)]"
      >
        Về trang chủ
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dải trạng thái "lời con đã gửi đi đâu rồi".
// ---------------------------------------------------------------------------

export interface SentHelpRequest {
  requestedOn: string;
  requestedAtTime: string;
  acknowledged: boolean;
  acknowledgedOn: string | null;
  acknowledgedAtTime: string | null;
}

function isoOf(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Ngày hôm nay theo lịch MÁY NGƯỜI DÙNG, dạng YYYY-MM-DD. */
function todayIso(): string {
  return isoOf(new Date());
}

/**
 * "hôm nay" · "hôm qua" · "31/07" — cách một đứa trẻ nói về thời gian, không phải dấu
 * thời gian của máy.
 *
 * Hai điều cố ý ở đây:
 *  · KHÔNG `new Date("2026-07-31")` để so sánh: chuỗi chỉ có ngày được ECMAScript quy là
 *    giờ UTC, nên ở mọi múi giờ âm nó lùi một hôm. So thẳng hai chuỗi ISO là đúng và rẻ.
 *  · KHÔNG `toLocaleDateString(..., { day, month })`: với đúng hai trường đó ICU trả về
 *    "31-07" (gạch nối), khác hẳn cách người Việt viết ngày — và phụ thuộc bản ICU đang
 *    có trên máy người dùng.
 *
 * `today` là tham số (không đọc thẳng đồng hồ trong thân hàm) để hàm kiểm được: một hàm
 * chỉ đúng vào đúng hôm nay là một hàm không ai kiểm được.
 */
export function dayWord(iso: string, today = todayIso()): string {
  if (iso === today) return "hôm nay";
  const [ty, tm, td] = today.split("-").map(Number);
  const previous = new Date(ty ?? 1970, (tm ?? 1) - 1, (td ?? 1) - 1);
  if (iso === isoOf(previous)) return "hôm qua";
  const [, month, day] = iso.split("-");
  return day && month ? `${day}/${month}` : iso;
}

/**
 * Hiện KHI VÀ CHỈ KHI em đã từng gửi. Chưa gửi lần nào thì không vẽ gì: một dòng "con
 * chưa gửi lần nào" ở đầu trang gửi lời là chữ thừa, và tệ hơn — nó giống một lời nhắc
 * rằng em chưa làm gì (DESIGN-GUIDELINES §5).
 */
function SentStatusStrip({
  teacherName,
  isPending,
  isError,
  onRetry,
  requests,
}: {
  teacherName: string;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  requests: SentHelpRequest[];
}) {
  if (isPending) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 flex items-center gap-2 rounded-[18px] bg-white px-4 py-3 text-[12.5px] font-semibold text-caption shadow-[0_3px_14px_rgba(10,42,94,.06)]"
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#E4E9F0] border-t-navy" aria-hidden />
        Đang xem lại những lần con đã gửi…
      </div>
    );
  }

  if (isError) {
    // KHÔNG im lặng bỏ qua: im lặng ở đây trông y hệt "con chưa gửi lần nào", tức là
    // máy nói với em một điều không đúng về chính việc em đã làm.
    return (
      <div
        role="alert"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-[18px] bg-white px-4 py-3 shadow-[0_3px_14px_rgba(10,42,94,.06)]"
      >
        <span className="msr text-[18px] text-[#E8940D]" aria-hidden>
          cloud_off
        </span>
        <span className="text-[12.5px] font-semibold text-[#5B6B80]">
          Chưa xem được những lần con đã gửi trước đó.
        </span>
        <button type="button" onClick={onRetry} className="text-[12.5px] font-black text-[#1D4E8F] underline underline-offset-2">
          Thử lại
        </button>
      </div>
    );
  }

  const latest = requests[0];
  if (!latest) return null;

  const older = requests.slice(1);
  const waiting = !latest.acknowledged;

  return (
    // Sửa 01/08/2026: `border-l-[5px]` → viền 1px + nền nhạt cùng tông.
    //
    // Dải màu dày một cạnh là mẫu bị cấm, nhưng lý do bỏ ở ĐÂY cụ thể hơn thế: khối này đã
    // có icon (hourglass_top / check_circle) VÀ có câu chữ nói thẳng trạng thái ngay bên
    // cạnh — tức thứ mang nghĩa đã đủ, dải màu chỉ là lớp thứ ba nói lại cùng một điều bằng
    // thứ ngôn ngữ mà người mù màu không đọc được. Nền nhạt giữ được cảm giác "hai trạng
    // thái khác nhau" cho mắt mà không giả vờ là tín hiệu.
    // Chữ trên hai nền này vẫn đo đủ: #8A5A00 trên #FFF7E0 = 5,54:1, #00693F trên #E3F8ED
    // = 6,12:1 — cả hai vượt 4,5:1.
    <div
      className={`mb-4 flex flex-col gap-1.5 rounded-[18px] border p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] ${
        waiting ? "border-[#FFE29A] bg-[#FFF7E0]" : "border-[#B7E6CE] bg-[#E3F8ED]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`msr text-[20px] ${waiting ? "text-[#8A5A00]" : "text-[#00693F]"}`}
          aria-hidden
        >
          {waiting ? "hourglass_top" : "check_circle"}
        </span>
        <span className="text-[13.5px] font-black text-navy">
          {waiting
            ? `Lời con đã tới chỗ ${teacherName}`
            : `${teacherName} đã nhận lời của con`}
        </span>
      </div>

      <div className="text-[12px] font-semibold text-[#5B6B80]">
        Con gửi {dayWord(latest.requestedOn)} lúc {latest.requestedAtTime}
        {latest.acknowledged && latest.acknowledgedOn
          ? ` · nhận ${dayWord(latest.acknowledgedOn)}${latest.acknowledgedAtTime ? ` lúc ${latest.acknowledgedAtTime}` : ""}`
          : ""}
      </div>

      {/*
        Câu quan trọng nhất của cả dải. "Chưa có dấu xác nhận" là điều DUY NHẤT máy biết;
        suy thêm bất cứ điều gì — dù là tin tốt ("cô đang xử lý") hay tin xấu ("cô chưa
        đọc") — đều là bịa, và bịa ở đây thì đứa trẻ lãnh.
      */}
      {waiting && (
        <p className="text-[11.5px] leading-relaxed text-caption">
          Chưa có dấu xác nhận. Chưa xác nhận không có nghĩa là chưa ai đọc — {teacherName} sẽ tìm con.
        </p>
      )}

      {older.length > 0 && (
        <p className="text-[11.5px] text-caption">
          Trước đó con đã gửi {older.length} lần nữa ({older.map((r) => dayWord(r.requestedOn)).join(" · ")}).
        </p>
      )}
    </div>
  );
}
