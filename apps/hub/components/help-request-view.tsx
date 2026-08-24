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
//
// Sửa 01/08/2026 (ADR-026 + QĐ-2), hai việc — cả hai đều là LỜI HỨA NÓI SAI SỰ THẬT:
//   1. Thẻ "Ai đọc được lời con?" kể đúng MỘT người đọc được (cô chủ nhiệm) trong khi
//      policy `help_requests_scope` (0037) là `core.can_see_care` — gồm cả TÂM LÝ CỤM,
//      đọc được ngay từ lúc em bấm gửi. Và câu chân thẻ còn hứa một thao tác chưa tồn
//      tại ("cô sẽ hỏi ý con trước khi chuyển tới phòng tâm lý"). Đã sửa cả hai tại chỗ.
//   2. `submit.isSuccess` được dùng làm bằng chứng "lời đã tới cô". Nó không phải: câu
//      lệnh ghi có mệnh đề `where handled_at is null`, nên khi hôm nay cô đã xác nhận
//      xong thì lệnh chạy sạch, ghi 0 dòng, và màn hiện "Đã gửi cho cô rồi!". Nay
//      `requestHelp` trả về `delivered`, và có `NotDeliveredPanel` cho nhánh còn lại.
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
  // RÚT NGẮN 06/08/2026 (§1.5), KHÔNG BỎ — nhánh cuối là câu báo một thứ đã hỏng. Bỏ vế
  // "thầy cô vẫn nhận được" (nói lại đúng điều mà "con vẫn gửi được" đã nói).
  const teacherSubtitle = teacher.data
    ? `Gửi riêng cho ${teacherFirstWord} — chủ nhiệm lớp ${teacher.data.class_code}`
    : teacher.isPending
      ? "…"
      : "Chưa tải được tên thầy cô — con vẫn gửi được.";

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
      <MainContent className="flex min-w-0 flex-1 flex-col bg-pagebg s-home-md md:overflow-hidden">
        {/* Tiêu đề màn, dành cho tai — không đổi một pixel nào trên màn.
            Vì sao sr-only chứ không phải đổi thẻ của dòng chữ đang hiện: chữ "Mình cần
            gặp thầy cô" được vẽ ở HAI chỗ khác nhau tuỳ khổ màn (MiniAppHeader ở điện
            thoại, thanh trên ở desktop), mà mỗi chỗ chỉ tồn tại ở một khổ. Đặt <h1> vào
            cả hai là để hai <h1> trong cùng một DOM — mỗi lần đọc lại phải đoán cái nào
            là thật. Một cái duy nhất, luôn có mặt, luôn đúng. */}
        <h1 className="sr-only">Mình cần gặp thầy cô</h1>
        <div className="hidden flex-none items-center gap-3 hv-thanh px-7 py-3.5 md:flex">
            {/* VÙNG CHẠM 44px mà KHÔNG phóng to phần nhìn thấy — cùng mẫu mini-app-header.tsx
                đã dựng: `min-h-[44px] px-1` nằm trên chính phần tử bấm được, vòng tròn 36×36
                và nền hover vẫn nguyên kích thước cũ vì chúng nằm ở lớp trong. Nút này 36×36
                là 8px hụt mốc §11/WCAG 2.5.5, và nó là đường lùi khỏi một màn em vừa gõ
                chuyện riêng vào. (05/08/2026) */}
            <button
              onClick={() => router.back()}
              aria-label="Quay lại"
              className="flex min-h-[44px] items-center justify-center px-1"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-[#4E5F78] hover:bg-[#12244A]">
                <span aria-hidden="true" className="msr text-[21px]">arrow_back</span>
              </span>
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

            {/* `isSuccess` chỉ nói "lời gọi không ném lỗi" — nó KHÔNG nói "lời của con đã
                vào sổ". Hai điều đó tách nhau kể từ 01/08/2026, xem `requestHelp` trong
                apps/hub/server/routers/checkin.ts. */}
            {submit.isSuccess && submit.data?.delivered === false ? (
              <NotDeliveredPanel teacherName={teacherFirstWord} onGoHome={() => router.push("/home")} />
            ) : submit.isSuccess ? (
              <SentSuccessPanel teacherName={teacherFirstWord} onGoHome={() => router.push("/home")} />
            ) : (
              <div className="flex flex-wrap items-start gap-4 md:gap-5">
                <div className="min-w-0 flex-[2.1_1_320px] flex flex-col gap-[22px] rounded-[22px] bg-card p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:flex-[2.1_1_520px] md:p-6">
                  {/* Mỗi bước là một <fieldset> có <legend>: người dùng trình đọc màn hình
                      nghe được "nút Ở lớp, 1 trên 5, trong nhóm CHUYỆN GÌ KHIẾN CON MUỐN
                      GẶP CÔ" chứ không phải một dãy nút rời không rõ thuộc về câu hỏi nào.
                      aria-pressed nói trạng thái đã chọn — trước đó chỉ có màu viền. */}
                  <fieldset className="min-w-0 border-0 p-0">
                    <legend className="text-[13px] font-black tracking-wide text-[#93A9C8]">
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
                            // min-h-[44px]: đo ra ~42px (py-3 + dòng chữ 13,5px), hụt mốc 44px
                            // của §11/WCAG 2.5.5. Năm nút này là bước 1 bắt buộc — không chạm
                            // trúng một nút ở đây thì không có đường nào gửi được lời. Chỉ nới
                            // sàn chiều cao, không đổi padding nên hình dạng giữ nguyên.
                            className={
                              active
                                ? "flex min-h-[44px] items-center gap-2 rounded-2xl border-[1.7px] border-navy bg-[#F5F8FF] px-[18px] py-3 text-[13.5px] font-extrabold text-cardtitle shadow-[0_0_0_3px_rgba(30,95,184,.1)]"
                                : "flex min-h-[44px] items-center gap-2 rounded-2xl border-[1.5px] border-[#1E3A6B] px-[18px] py-3 text-[13.5px] font-bold text-[#A9C4E8] hover:border-[#C9D6E6]"
                            }
                          >
                            <span
                              aria-hidden="true"
                              className={`msr text-[19px] ${active ? "text-[#2C7BF2]" : "text-[#93A9C8]"}`}
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
                    <legend className="text-[13px] font-black tracking-wide text-[#93A9C8]">
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
                                  // dangerText (#FF8A8F) chứ không phải #FF8A8F: đúng cặp
                                  // chữ-đỏ-trên-nền-hồng đo được 4,49:1 — hụt chuẩn 0,01 và
                                  // chỉ lộ ra khi đo trên nền thật (#351216) thay vì nền trắng.
                                  ? "flex-1 basis-[150px] rounded-2xl border-[1.7px] border-[#F0474D] bg-[#351216] px-3.5 py-3.5 text-center text-[13px] font-black text-dangerText"
                                  : "flex-1 basis-[150px] rounded-2xl border-[1.7px] border-navy bg-[#F5F8FF] px-3.5 py-3.5 text-center text-[13px] font-black text-cardtitle"
                                : "flex-1 basis-[150px] rounded-2xl border-[1.5px] border-line px-3.5 py-3.5 text-center text-[13px] font-bold text-cardtitle2 hover:border-[#C9D6E6]"
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
                      <label htmlFor="loi-nhan-cho-co" className="text-[13px] font-black tracking-wide text-[#93A9C8]">
                        3 · CON MUỐN NÓI GÌ TRƯỚC KHÔNG?
                      </label>
                      {/* #9AA5B5 → token muted. Đo sống ở 360px: "không bắt buộc" là 2,49:1
                          trên nền trắng — mà đây là chữ nói cho em biết có được BỎ QUA ô
                          này không, tức là nó quyết định em có bấm gửi hay bỏ dở. #8298B8
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
                      // #0B1B38. Câu gợi ý ở đây không phải trang trí — nó là câu MẪU dạy em
                      // biết ô này viết được gì; ở sân trường lúc 7 giờ sáng, nắng gắt, màn
                      // điện thoại rẻ, 2,45:1 là biến mất. Màu nay đến từ MỘT chỗ duy nhất
                      // trong globals.css (#93A9C8 = 5,34:1 trên #0B1B38) nên mọi ô nhập của
                      // app cùng đọc được, không phải ô nào có người nhớ thì ô đó mới đạt.
                      className="mt-3 min-h-[96px] w-full resize-none rounded-2xl border-[1.5px] border-[#1E3A6B] bg-[#0B1B38] p-4 text-[13.5px] leading-relaxed text-ink focus:border-navy"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-[#12244A] pt-1">
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      // `disabled:opacity-40` trộn nút xanh với nền trắng thành ~#9DAABF, và
                      // chữ trắng trên đó chỉ 2,35:1 — nút "Gửi cho cô" ở trạng thái CHƯA chọn
                      // đủ là thứ em nhìn đầu tiên, mà nó lại là thứ mờ nhất màn hình.
                      //
                      // Bản sửa đầu ngày 05/08 đổi sang nền #8A97AB giữ chữ trắng và ghi "≈4,6:1"
                      // — phép tính bằng tay đó SAI: đo trên DOM thật được 2,96:1. Đây đúng là lý
                      // do repo đòi đo chứ không đòi tính. Nay đảo hẳn cặp màu: nền chip xám nhạt
                      // + chữ `caption` (4,90:1 trên chính nền đó, số đã đo sẵn ở tailwind.config).
                      // Nút xám nhạt cũng nói "chưa bấm được" đúng hơn một nút xám đậm — xám đậm
                      // trông như một nút bấm được nhưng đổi màu. (05/08/2026)
                      className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-navy to-[#1E5FB8] px-7 py-4 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.28)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-chip disabled:text-caption disabled:shadow-none disabled:opacity-100"
                    >
                      <span aria-hidden="true" className="msr text-[20px]">send</span>
                      Gửi cho {teacherFirstWord}
                    </button>
                    <button
                      onClick={() => router.push("/home")}
                      className="rounded-2xl border-[1.5px] border-[#1E3A6B] bg-card px-5 py-4 text-[14px] font-extrabold text-[#93A9C8]"
                    >
                      Để sau
                    </button>
                    {/* Câu lỗi THẬT (hết phiên / mất mạng / vượt hạn mức) thay cho
                        "Gửi chưa được, thử lại nhé." — em cần biết bấm lại có ích không. */}
                    {submit.isError && <MutationError error={submit.error} onRetry={handleSubmit} />}
                  </div>
                </div>

                <div className="min-w-0 flex-[1_1_300px] flex flex-col gap-4">
                  <div className="rounded-[20px] bg-card p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
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

                  <div className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-[#1E4E8C] bg-[#0C1F3C] p-5">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="msr text-[20px] text-[#2C7BF2]">lock</span>
                      <span className="text-[14px] font-black text-[#35E0FF]">Ai đọc được lời con?</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span aria-hidden="true" className="msr flex-none text-[17px] text-[#4EE39B]">check_circle</span>
                      <span className="text-[12.5px] leading-relaxed text-[#35E0FF]">
                        {teacherFirstWord} — chủ nhiệm của con
                      </span>
                    </div>
                    {/* Thêm 01/08/2026. Khối này kể ra người ĐỌC ĐƯỢC lời của em, mà nó thiếu
                        mất một người: policy `help_requests_scope` (0037) là
                        `core.can_see_care` = chính em ∨ chủ nhiệm của em ∨ TÂM LÝ CỤM. Thầy cô
                        tâm lý đọc được lời nhắn NGAY từ lúc em bấm gửi — cùng phạm vi với
                        quyền bấm "đã gặp em rồi" (0026), và tests/db/help-request-rieng-tu.test.ts
                        đo đúng điều đó (1 dòng dưới phiên cô Mai). Nói thiếu một vai đọc được
                        cũng là nói dối, chỉ khó bắt hơn — và ở đúng ô em gõ chuyện riêng nhất
                        thì đây là kiểu nói dối tệ nhất. */}
                    {/* RÚT NGẮN 06/08/2026 (§1.5): bỏ "để giúp khi chuyện cần người chuyên
                        môn" — biện minh cho quyền đọc. Danh sách này trả lời đúng một câu
                        hỏi ("ai đọc được?"), nên mỗi dòng chỉ cần một cái tên. */}
                    <div className="flex items-start gap-2">
                      <span aria-hidden="true" className="msr flex-none text-[17px] text-[#4EE39B]">check_circle</span>
                      <span className="text-[12.5px] leading-relaxed text-[#35E0FF]">
                        Thầy cô tâm lý của trường — đọc cùng {teacherFirstWord}
                      </span>
                    </div>
                    {/* ĐỔI HÌNH 06/08/2026 (§1.5). Dòng cũ là một câu 78 ký tự vắt hai dòng
                        ở khổ 390px, mà nội dung thật của nó là MỘT nhãn ("không nhìn thấy")
                        + một DANH SÁCH bốn vai. Danh sách thì mắt đọc bằng chip nhanh hơn
                        bằng dấu chấm giữa câu. Không vai nào bị bỏ: nói thiếu một vai đọc
                        được hay không đọc được đều là nói sai (§9). Icon `cancel` + chữ
                        "Không nhìn thấy" giữ nguyên vai trò tín hiệu kép của §11 — màu một
                        mình không bao giờ đủ. */}
                    <div className="flex items-start gap-2">
                      <span aria-hidden="true" className="msr flex-none text-[17px] text-[#FF8A8F]">cancel</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-black text-[#35E0FF]">Không nhìn thấy</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {["Bạn cùng lớp", "Thầy cô dạy môn", "Thầy cô lớp khác", "Bố mẹ"].map((ai) => (
                            <span
                              key={ai}
                              className="rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-[#35E0FF]"
                            >
                              {ai}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Câu cũ ở chỗ này ("{cô} sẽ hỏi ý con trước khi chuyển tới phòng tâm lý")
                        đã bỏ, vì nó sai hai lần: thầy cô tâm lý ĐÃ đọc được từ đầu, không cần
                        chuyển; và đường chuyển tuyến có hỏi ý em thì HỆ THỐNG CHƯA CÓ — hứa một
                        thao tác không tồn tại là hứa suông đúng chỗ em đang cân nhắc có nên kể
                        hay không. Thay bằng một câu vừa thật vừa dùng được: ô lời nhắn không bắt
                        buộc, bỏ trống vẫn gửi được. */}
                    {/* Chữ đổi #4E7BB0 → #35E0FF (token link): trên nền thẻ #0C1F3C, #4E7BB0
                        chỉ 4,07:1, dưới mốc 4,5:1 — và đây là câu duy nhất nói cho em biết
                        ô lời nhắn KHÔNG bắt buộc, tức câu quyết định em bấm gửi hay bỏ dở.
                        #35E0FF = 7,66:1, cũng là màu ba dòng ngay trên đã dùng. (05/08/2026) */}
                    {/* RÚT NGẮN 06/08/2026 (§1.5). Ba mệnh đề cũ nói cùng MỘT điều theo ba
                        cách ("viết bao nhiêu cũng được" · "không viết gì cũng gửi được" ·
                        "thầy cô vẫn biết là con muốn gặp"). Giữ cách nói thẳng nhất, vì đây
                        vẫn là câu quyết định em bấm gửi hay bỏ dở. */}
                    <div className="border-t border-[#1E4E8C] pt-2.5 text-[11.5px] text-link">
                      Không viết gì cũng gửi được.
                    </div>
                  </div>

                  {/* BỎ HẲN 06/08/2026 (§1.5) — thẻ mascot + câu "Nói ra là bước dũng cảm.
                      Không có câu trả lời nào là sai cả!". Đây là lời động viên đặt TRƯỚC khi
                      em làm gì: không mang dữ liệu, không mở đường nào, và nó chiếm chỗ ngay
                      dưới khối "Ai đọc được lời con?" — thứ em thật sự cần đọc trước khi gõ.
                      Lời ghi nhận vẫn còn, ở đúng chỗ nó có nghĩa: `SentSuccessPanel`, tức
                      SAU khi em đã mở lời. Một lần, không phải hai. */}
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
      className="mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-[22px] bg-card p-6 text-center shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-10"
    >
      <Mascot pose="celebrate" width={72} />
      <h2 ref={headingRef} tabIndex={-1} className="text-[18px] font-black text-cardtitle">
        Đã gửi cho {teacherName} rồi!
      </h2>
      {/* RÚT NGẮN 06/08/2026 (§1.5): bỏ "Đây là một bước dũng cảm." Lời ghi nhận đó nay do
          HÌNH nói — sư tử `celebrate` ngay trên tiêu đề — đúng cách §1.5 muốn, và nó không
          chiếm dòng chữ nào. Câu còn lại là thứ duy nhất em chưa biết: chuyện gì tiếp theo. */}
      <p className="text-[13.5px] text-caption">{teacherName} sẽ đọc và tìm con sớm.</p>
      <button
        onClick={onGoHome}
        className="min-h-[44px] rounded-[15px] bg-gradient-to-r from-navy to-[#1E5FB8] px-7 py-3.5 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.28)]"
      >
        Về trang chủ
      </button>
    </div>
  );
}

/**
 * Màn "lời này CHƯA vào sổ" — anh em sinh đôi của `SentSuccessPanel`, và lý do nó tồn tại
 * là để `SentSuccessPanel` không bị dùng cho một chuyện nó không đúng.
 *
 * Khi nào gặp: hôm nay em đã gửi một lần, cô đã bấm "cô gặp em rồi", rồi chiều em mở app
 * nhắn tiếp. Câu lệnh ghi có mệnh đề `where handled_at is null` nên nó cập nhật 0 dòng và
 * không báo lỗi gì cả — trước 01/08/2026 màn hình đọc `isSuccess` rồi hiện "Đã gửi cho cô
 * rồi!" cho một lời không đi đâu hết.
 *
 * Ba việc khối này phải làm, theo thứ tự quan trọng:
 *  1. Nói thẳng là chưa vào sổ, không vòng vo.
 *  2. Nói VÌ SAO bằng chuyện em nhớ được ("cô đã gặp con về lời sáng nay"), để em không
 *     tự hiểu thành "máy hỏng" hay "mình bị chặn".
 *  3. Cho đường đi thật ngay hôm nay: gặp cô trực tiếp. Không có đường nào khác trong app
 *     — nói ra chứ không giấu.
 * Giọng KHÔNG phải giọng lỗi hệ thống (không nền đỏ, không "Lỗi"): em không làm sai gì.
 *
 * a11y: cùng hợp đồng với `SentSuccessPanel` — `role="status" aria-live="polite"` và dời
 * focus lên tiêu đề, vì cả form vừa biến mất khỏi DOM cùng cái nút em vừa bấm.
 */
function NotDeliveredPanel({ teacherName, onGoHome }: { teacherName: string; onGoHome: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-[22px] border-[1.5px] border-[#4A3A0C] bg-[#2A2208] p-6 text-center md:p-10"
    >
      <Mascot pose="think" width={72} />
      <h2 ref={headingRef} tabIndex={-1} className="text-[18px] font-black text-cardtitle">
        Lời này chưa vào sổ của {teacherName}
      </h2>
      {/* RÚT NGẮN 06/08/2026 (§1.5), KHÔNG BỎ — khối này báo "lời chưa vào sổ", tức là lúc
          em CẦN chữ. Ba việc của nó (xem docstring) còn nguyên ba, chỉ ngắn lại:
            1. Chưa vào sổ  → tiêu đề <h2> ngay trên đã nói.
            2. Vì sao       → một câu, bằng chuyện em nhớ được.
            3. Đường đi     → một câu.
          Cắt: "nên lời vừa rồi chưa được ghi thêm" (tiêu đề đã nói) và "Ngày mai con gửi ở
          đây được như bình thường" (suy ra được từ "mỗi ngày một lời", và không phải việc
          em làm hôm nay). Luật "mỗi ngày một lời" thành chip vì nó là luật, không phải câu. */}
      <p className="text-[13.5px] leading-relaxed text-[#FFD98A]">
        Hôm nay con đã gửi một lần, và {teacherName} đã gặp con về lời đó.
      </p>
      <span className="flex items-center gap-1 rounded-full bg-card px-3 py-1 text-[11.5px] font-black text-[#FFD98A]">
        {/* `info` chứ không phải `looks_one`: font đã cắt gọn theo public/fonts/icon-names.txt
            — tên ngoài danh sách đó hiện ra ô trống, không báo lỗi, không ai biết. */}
        <span aria-hidden="true" className="msr text-[14px]">info</span>
        Mỗi ngày một lời
      </span>
      <p className="text-[12.5px] leading-relaxed text-[#FFD98A]">
        Còn chuyện <b>hôm nay</b>: con tìm {teacherName} nói trực tiếp nhé.
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
        className="mb-4 flex items-center gap-2 rounded-[18px] bg-card px-4 py-3 text-[12.5px] font-semibold text-caption shadow-[0_3px_14px_rgba(10,42,94,.06)]"
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1E3A6B] border-t-navy" aria-hidden />
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
        className="mb-4 flex flex-wrap items-center gap-2 rounded-[18px] bg-card px-4 py-3 shadow-[0_3px_14px_rgba(10,42,94,.06)]"
      >
        {/* #E8940D trên nền trắng = 2,42:1, dưới mốc 3:1 của WCAG 1.4.11 — và đây là icon
            duy nhất của một dải role="alert" nói "chưa xem được những lần con đã gửi".
            #FFD98A (gold-textDark) = 5,93:1 trên trắng, cùng màu đã dùng cho ba chỗ khác trong
            đợt này. (05/08/2026) */}
        <span className="msr text-[18px] text-gold-textDark" aria-hidden>
          cloud_off
        </span>
        <span className="text-[12.5px] font-semibold text-[#93A9C8]">
          Chưa xem được những lần con đã gửi trước đó.
        </span>
        <button type="button" onClick={onRetry} className="text-[12.5px] font-black text-[#35E0FF] underline underline-offset-2">
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
    // Chữ trên hai nền này vẫn đo đủ: #FFD98A trên #2A2208 = 5,54:1, #4EE39B trên #0C2E22
    // = 6,12:1 — cả hai vượt 4,5:1.
    <div
      className={`mb-4 flex flex-col gap-1.5 rounded-[18px] border p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)] ${
        waiting ? "border-[#4A3A0C] bg-[#2A2208]" : "border-[#B7E6CE] bg-[#0C2E22]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`msr text-[20px] ${waiting ? "text-[#FFD98A]" : "text-[#4EE39B]"}`}
          aria-hidden
        >
          {waiting ? "hourglass_top" : "check_circle"}
        </span>
        <span className="text-[13.5px] font-black text-cardtitle">
          {waiting
            ? `Lời con đã tới chỗ ${teacherName}`
            : `${teacherName} đã nhận lời của con`}
        </span>
      </div>

      <div className="text-[12px] font-semibold text-[#93A9C8]">
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
      {/* RÚT NGẮN 06/08/2026 (§1.5). Mệnh đề trung tâm — "chưa xác nhận ≠ chưa đọc" — KHÔNG
          đổi một chữ, vì suy thêm bất cứ điều gì ở đây thì đứa trẻ lãnh. Cắt vế đuôi
          "{cô} sẽ tìm con": đó đúng là một suy đoán về việc cô sẽ làm, tức là chính thứ câu
          này sinh ra để cấm. */}
      {waiting && (
        <p className="text-[11.5px] leading-relaxed text-caption">
          Chưa có dấu xác nhận — không có nghĩa là chưa ai đọc.
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
