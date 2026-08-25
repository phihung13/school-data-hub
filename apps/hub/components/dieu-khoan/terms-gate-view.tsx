// components/dieu-khoan/terms-gate-view.tsx — màn điều khoản kèm nút đồng ý.
//
// Ba luật của màn này, không luật nào được nới:
//
//   1. NÓI RÕ VÌ SAO người ta đang đứng ở đây. Repo này đã có tiền lệ "menu 404" và
//      ghét nó: đá người dùng đi đâu đó mà không một lời là kiểu hỏng tệ nhất vì nó
//      không kêu một tiếng nào. Phụ huynh tới đây vì trường chưa được phép ghi tâm trạng
//      của con, và câu đó phải nằm ngay dòng đầu.
//
//   2. NÓI THẬT CÁI GÌ BỊ CHẶN VÀ CÁI GÌ KHÔNG — sửa lớn 0047 (ADR-027 bản 2).
//      Bản đầu của màn này nói "tài khoản đăng nhập của con chưa được bật". Câu đó vừa
//      DOẠ NGƯỜI vừa NÓI SAI kể từ 0047, và cái sai nó che còn nặng hơn: khoá tài khoản
//      của em là khoá luôn `core.is_me()`, tức khoá nút "Mình cần gặp thầy cô" của chính
//      em (đo đầu-cuối 01/08/2026). Nay phiếu đồng ý gác đúng MỘT thứ — việc ghi tâm
//      trạng hằng ngày — và màn này phải nói đúng chừng đó, không hơn.
//
//   3. KHÔNG CÓ NÚT "ĐỂ SAU". Không phải để ép: mà vì "để sau" ở đây là một lời nói dối
//      về mặt kỹ thuật — bấm nó xong phần tâm trạng của con vẫn tắt, và lần mở trang chủ
//      kế tiếp phụ huynh lại bị đưa về đây. Hai lựa chọn thật thì có tên thật: đồng ý,
//      hoặc chưa đồng ý (ghi lại hẳn hoi là đã hỏi và đã trả lời — sau đó cổng thôi đẩy).
//
// Nội dung điều khoản đọc từ CSDL (`core.terms_versions`), KHÔNG viết chết trong tsx:
// cùng tinh thần mệnh lệnh 7. Sửa chữ trong file này là sửa một bản sao mà không ai ký.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import type { ConsentChildStatus, ConsentDecision } from "@hub/core/contracts";
import { MainContent } from "../page-shell";
import { MiniAppHeader } from "../mini-app-header";
import { ErrorState, LoadingState, MutationError, MutationSuccess } from "../ui/query-state";

/**
 * Trình bày Markdown ở mức TỐI THIỂU, tự viết, đúng bốn thứ bản điều khoản đang dùng:
 * tiêu đề `##`, gạch đầu dòng `-`, đoạn văn, và **đậm**.
 *
 * Vì sao không kéo một thư viện markdown về: mọi thư viện đó sinh ra HTML rồi phải bơm
 * vào trang bằng `dangerouslySetInnerHTML`. Nguồn của chuỗi này là một cột trong CSDL —
 * tức là nếu ngày nào đó có đường ghi khác vào `core.terms_versions`, ta vừa mở một lối
 * chạy HTML tuỳ ý trên chính trang mà phụ huynh bấm nút pháp lý. Bộ dựng dưới đây trả về
 * phần tử React, không bao giờ trả HTML thô, nên cái lối đó không tồn tại.
 */
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`} className="font-black text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    ),
  );
}

/** Một khối đã bóc tách — DỮ LIỆU thuần, không phải phần tử React. */
export type TermsBlock =
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] };

/**
 * Bóc Markdown thành khối. Tách khỏi phần dựng JSX có chủ đích: bộ tách là chỗ DUY NHẤT
 * có logic (dòng nối tiếp gạch đầu dòng, dòng trống ngắt danh sách), nên nó phải kiểm
 * được bằng một bài test thuần, không cần dựng React.
 */
export function parseTermsBlocks(source: string): TermsBlock[] {
  const blocks: TermsBlock[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length === 0) return;
    blocks.push({ kind: "ul", items: bullets });
    bullets = [];
  };

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3) });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    // Dòng thường nối tiếp một gạch đầu dòng (xuống dòng cho vừa bề ngang) thuộc về
    // chính gạch đầu dòng đó — nếu không thì một câu bị tách làm đôi giữa danh sách.
    if (bullets.length > 0) {
      bullets[bullets.length - 1] += " " + line;
      continue;
    }
    blocks.push({ kind: "p", text: line });
  }
  flush();
  return blocks;
}

export function TermsMarkdown({ source }: { source: string }) {
  return (
    <div className="space-y-2.5">
      {parseTermsBlocks(source).map((block, i) => {
        if (block.kind === "h2") {
          return (
            <h2 key={i} className="pt-2 text-[14px] font-black text-cardtitle">
              {block.text}
            </h2>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1.5 text-[13px] leading-relaxed text-muted">
              {block.items.map((b, j) => (
                <li key={j}>{renderInline(b, `b${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-[13px] leading-relaxed text-muted">
            {renderInline(block.text, `p${i}`)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Câu nói về TÀI KHOẢN của con — KHÔNG in mã trạng thái ra màn hình.
 *
 * Từ 0047 câu này KHÔNG còn nói gì về phiếu đồng ý: tài khoản của con bật hay không là
 * chuyện danh tính (còn học ở trường không, đã ẩn danh hoá chưa), không phải chuyện bố mẹ
 * đã bấm nút hay chưa. Thứ cái nút điều khiển nằm ở `nhanTamTrang` ngay dưới.
 */
export function nhanTrangThai(child: ConsentChildStatus): string {
  switch (child.accountStatus) {
    case "active":
      return "Tài khoản của con đang dùng được";
    case "pending":
      return "Tài khoản của con đang chờ trường bàn giao";
    case "disabled":
      return "Tài khoản của con đang khoá — bố mẹ liên hệ nhà trường";
    // `no_account` là ca PHỔ BIẾN (63/64 em trên hub_dev chưa có tài khoản), không phải
    // ca hiếm. Nói "đang chờ" ở đây là nói sai: không có tài khoản nào để chờ cả.
    case "no_account":
    default:
      return "Con chưa có tài khoản đăng nhập";
  }
}

/**
 * Câu nói về thứ cái nút NÀY thật sự điều khiển (0047). Đây là câu quan trọng nhất trong
 * cả màn: nếu phụ huynh không đọc được hậu quả của cú bấm bằng một dòng tiếng Việt thì họ
 * đang ký vào một thứ mà chỉ máy hiểu.
 *
 * Đọc `moodEnabled` (hỏi theo ĐỨA TRẺ) chứ không suy từ `decision` của người đang đăng
 * nhập: nhà có hai người đại diện, người kia đã bấm thì phần này đang bật thật, và nói
 * ngược lại là nói sai với một người bố về chính con mình.
 */
export function nhanTamTrang(child: ConsentChildStatus): string {
  return child.moodEnabled
    ? "Phần ghi tâm trạng hằng ngày của con: đang bật"
    : "Phần ghi tâm trạng hằng ngày của con: đang tắt — trường không ghi mức nào";
}

/** Quyết định hiện tại của chính bố mẹ, nói bằng lời. `null` = chưa bấm gì bao giờ. */
export function nhanQuyetDinh(child: ConsentChildStatus): string {
  if (child.decision === "granted") {
    return child.termsVersion !== null && child.termsVersion < child.requiredVersion
      ? "Bố mẹ đã đồng ý bản cũ — trường vừa cập nhật, xin bố mẹ đọc lại"
      : "Bố mẹ đã đồng ý";
  }
  if (child.decision === "declined") return "Bố mẹ đã trả lời: chưa đồng ý";
  if (child.decision === "withdrawn") return "Bố mẹ đã rút lại đồng ý";
  return "Bố mẹ chưa trả lời";
}

export function TermsGateView({ displayName }: { displayName: string }) {
  const router = useRouter();
  const gate = trpc.consent.getGate.useQuery();
  const decide = trpc.consent.decide.useMutation({
    onSuccess: () => {
      void gate.refetch();
      // Trang chủ vừa đổi điều kiện cổng — làm mới cây server component để lần điều
      // hướng kế tiếp không đọc bản cache cũ rồi đá ngược về đây.
      router.refresh();
    },
  });
  const [daDoc, setDaDoc] = useState(false);

  // CỐ Ý KHÔNG `return <LoadingState/>` sớm cho cả trang. Đo được trên bản chạy thật
  // (curl /dieu-khoan, 01/08/2026): tRPC không prefetch phía máy chủ, nên HTML lần đầu
  // là NGUYÊN VẸN nhánh loading — không <h1>, không landmark <main>, và người dùng
  // trình đọc màn hình nghe đúng hai chữ "Đang tải" ở một trang pháp lý. Khung trang
  // (tiêu đề, lý do vì sao đang đứng ở đây, cái KHÔNG bị chặn) là chữ tĩnh, không phụ
  // thuộc dữ liệu — nó phải có mặt ngay từ byte đầu tiên. Chỉ phần dữ liệu mới chờ.
  const data = gate.data;
  const terms = data?.terms ?? null;
  const children = data?.children ?? [];
  const canHoi = children.filter((c) => c.needsAction);

  const bam = (decision: ConsentDecision) => {
    if (!terms) return;
    decide.mutate({
      // Bấm cho ĐÚNG những đứa con còn cần trả lời. Không gửi cả danh sách: ghi lại một
      // quyết định mới cho đứa con mà bố mẹ đã trả lời rồi là ghi đè ý họ bằng một cú
      // bấm dành cho đứa khác.
      studentIds: (canHoi.length > 0 ? canHoi : children).map((c) => c.studentId),
      termsVersionId: terms.id,
      decision,
      userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent.slice(0, 500),
    });
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-pagebg">
      <MiniAppHeader title="Điều khoản & đồng ý" subtitle={displayName} icon="shield" />

      {/* `focus:outline-none` đã nằm sẵn trong chính <MainContent> (page-shell.tsx) —
          khai lại ở đây là một bản sao im lặng: ngày nào page-shell đổi ý, chỗ này vẫn
          giữ luật cũ mà không ai biết. */}
      <MainContent className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <h1 className="text-[19px] font-black leading-tight text-cardtitle">
          Trường xin phép bố mẹ trước khi ghi tâm trạng của con
        </h1>

        {/* LUẬT 1 — nói rõ vì sao đang đứng ở đây.

            `text-caption` chứ KHÔNG phải `text-muted` (sửa 02/08/2026). Nền trang này là
            #081730 — đậm hơn cả ba mặt nền mà DESIGN-GUIDELINES §11 đem ra đo (#FFFFFF ·
            #050F26 · #12244A), nên hai token xám rơi về hai phía của ngưỡng:
              muted   #8298B8 trên #081730 = 4,35:1  ✗ (chuẩn chữ thường là 4,5:1)
              caption #93A9C8 trên #081730 = 4,68:1  ✓
            Đây không phải chữ trang trí: nó là câu DUY NHẤT trả lời "vì sao tôi đang ở
            trang này", tức LUẬT 1 của chính file này. Một câu pháp lý mà mờ dưới chuẩn
            trên màn điện thoại rẻ ngoài nắng thì luật đó không được thi hành. */}
        <p className="mt-2 text-[13px] leading-relaxed text-caption">
          Bố mẹ đang thấy trang này vì trường chưa nhận được phiếu đồng ý cho con. Xin bố mẹ đọc
          phần bên dưới rồi chọn một trong hai nút ở cuối trang.
        </p>

        {/* LUẬT 2 — nói thật cái gì KHÔNG bị chặn. Ba gạch đầu dòng này KHÔNG phải lời
            trấn an: mỗi dòng là một ràng buộc kỹ thuật đang chạy, và bài
            tests/unit/dieu-khoan.test.ts đối chiếu chúng với chính bản điều khoản trong
            CSDL. Sửa chữ ở đây mà không sửa hệ là làm bài test đỏ, đúng như mong muốn. */}
        <div className="mt-4 rounded-2xl border-[1.5px] border-[#CFE0D4] bg-[#F2F8F4] p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-black text-successText">
            <span aria-hidden="true" className="msr text-[18px]">
              verified_user
            </span>
            Chưa bấm cũng KHÔNG cắt thứ gì của con
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1 text-[12.5px] leading-relaxed text-muted">
            <li>
              Nút “Mình cần gặp thầy cô” của con <b className="font-black text-ink">vẫn bấm được</b> —
              đường một đứa trẻ nhờ giúp đỡ không bao giờ khoá theo quyết định của người lớn.
            </li>
            <li>Tài khoản của con vẫn đăng nhập được như thường.</li>
            <li>Thầy cô vẫn điểm danh cho con, và bố mẹ vẫn xem được Báo cáo Trưởng thành.</li>
            <li>Cái tắt chỉ có một: phần mềm không ghi mức tâm trạng con chọn mỗi ngày.</li>
          </ul>
        </div>

        {/* Ba trạng thái của phần DỮ LIỆU, tách khỏi khung trang tĩnh ở trên. */}
        {gate.error && (
          <div className="mt-4 rounded-2xl border border-line bg-card">
            <ErrorState error={gate.error} onRetry={() => void gate.refetch()} label="điều khoản" />
          </div>
        )}
        {!gate.error && gate.isLoading && (
          <div className="mt-4 rounded-2xl border border-line bg-card">
            <LoadingState label="Đang tải bản điều khoản…" />
          </div>
        )}

        {/* Danh sách con — một phụ huynh có thể có nhiều con, và mỗi con một phiếu. */}
        <section className={`mt-4 ${data ? "" : "hidden"}`} aria-labelledby="ds-con">
          <h2 id="ds-con" className="text-[11px] font-black uppercase tracking-wide text-caption">
            Phiếu này áp dụng cho
          </h2>
          {children.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-line bg-card p-4 text-[13px] text-muted">
              Hệ thống chưa ghi nhận con nào gắn với tài khoản của bố mẹ. Bố mẹ nhắn giáo viên chủ
              nhiệm để trường nối lại giúp.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {children.map((c) => (
                <li key={c.studentId} className="rounded-2xl border border-line bg-card p-4">
                  <p className="text-[14px] font-black text-ink">{c.studentName}</p>
                  <p className="text-[11.5px] font-bold text-caption">{c.studentCode}</p>
                  <p className="mt-1.5 text-[12.5px] font-bold text-ink">{nhanTamTrang(c)}</p>
                  <p className="text-[12.5px] text-muted">{nhanTrangThai(c)}</p>
                  <p className="text-[12.5px] text-muted">{nhanQuyetDinh(c)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Nội dung bản điều khoản, đọc từ CSDL. */}
        <section
          className={`mt-4 rounded-2xl border border-line bg-card p-5 ${data ? "" : "hidden"}`}
          aria-labelledby="noi-dung-dk"
        >
          {terms ? (
            <>
              <h2 id="noi-dung-dk" className="text-[15px] font-black text-cardtitle">
                {terms.title}
              </h2>
              <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-caption">
                Bản {terms.version} · mã kiểm tra {terms.contentHash.slice(0, 12)}
              </p>
              <div className="mt-3">
                <TermsMarkdown source={terms.bodyMd} />
              </div>
            </>
          ) : (
            <p id="noi-dung-dk" className="text-[13px] leading-relaxed text-muted">
              Trường chưa công bố bản điều khoản nào, nên hiện chưa có gì để bố mẹ bấm. Đây không
              phải lỗi của bố mẹ — bố mẹ cứ dùng bình thường, trường sẽ báo khi có.
            </p>
          )}
        </section>

        {terms && children.length > 0 && (
          <section className="mt-4 rounded-2xl border-[1.5px] border-navy/15 bg-card p-5">
            {/* VÙNG CHẠM CỦA Ô TICK — sửa 02/08/2026.

                Ô tick đo được đúng 20 × 20px (`h-5 w-5`), và nó là CỔNG của nút "Tôi đồng
                ý": chưa tick thì nút disabled. §11 và WCAG 2.5.5 đòi 44px. Hàng chữ đứng
                cạnh nó cao ~21px, nên kể cả gộp hai thứ lại thì cả hàng vẫn chưa tới 44px.
                Một phụ huynh trượt tay ở đây không nhận được phản hồi nào — ô không tick,
                nút vẫn mờ, và không có gì trên màn hình nói vì sao.

                Cách sửa: biến chính <label> thành hộp bấm cả hàng (`min-h-[44px]`,
                `py-2.5`). <label htmlFor> đã sẵn có nghĩa "chạm vào chữ = tick ô", nên đây
                chỉ là nới đúng cái vùng mà hành vi đó VỐN ĐÃ phủ — không thêm một cú bấm
                mới nào, không đổi một pixel nào của ô tick nhìn thấy. Bọc ô tick trong
                label thì bỏ được `htmlFor`/`id`, nhưng GIỮ cả hai: trình đọc màn hình cũ
                đọc nhãn ẩn theo id đáng tin hơn theo cây lồng nhau. */}
            <label
              htmlFor="da-doc"
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 py-2.5 text-[13px] font-bold leading-relaxed text-ink"
            >
              <input
                id="da-doc"
                type="checkbox"
                checked={daDoc}
                onChange={(e) => setDaDoc(e.target.checked)}
                className="h-5 w-5 flex-none accent-navy"
              />
              Tôi đã đọc và hiểu những điều trên.
            </label>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={!daDoc || decide.isPending}
                onClick={() => bam("granted")}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[13px] font-black text-white disabled:opacity-40"
              >
                <span aria-hidden="true" className="msr text-[18px]">
                  check_circle
                </span>
                Tôi đồng ý
              </button>
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => bam("declined")}
                className="flex min-h-[44px] items-center rounded-xl border-[1.5px] border-line2 bg-card px-5 py-3 text-[13px] font-extrabold text-caption disabled:opacity-40"
              >
                Tôi chưa đồng ý
              </button>
            </div>

            {/* Nút "chưa đồng ý" KHÔNG được bấm nhầm mà không biết hậu quả. */}
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
              Chọn “Tôi chưa đồng ý” thì phần mềm không ghi tâm trạng của con, và trường ghi nhận là
              đã hỏi. Mọi thứ khác của con giữ nguyên — kể cả nút “Mình cần gặp thầy cô”. Bố mẹ đổi
              ý lúc nào cũng quay lại trang này bấm đồng ý được.
            </p>

            <div className="mt-3 min-h-[20px]">
              {decide.error && <MutationError error={decide.error} />}
              {decide.isSuccess && !decide.error && (
                <MutationSuccess>
                  {/* Nói đúng thứ vừa xảy ra ở CSDL, không nói "đã lưu" chung chung: nếu
                      không có dòng nào mới thì đó là lần bấm thứ hai (§9), và câu chữ
                      phải phân biệt được hai chuyện đó. */}
                  {decide.data?.results.some((r) => r.created)
                    ? "Trường đã ghi nhận. Cảm ơn bố mẹ."
                    : "Quyết định này trường đã ghi nhận từ trước rồi."}
                </MutationSuccess>
              )}
            </div>
          </section>
        )}

        {/* Không phải ngõ cụt: luôn có đường về Hub và đường tới hồ sơ (nơi đăng xuất).

            min-h-[44px] thêm 02/08/2026. Hai liên kết này từng chỉ cao bằng hộp dòng của
            chữ 12,5px (~19px). Chúng KHÔNG phải hai liên kết trong một câu văn: đây là
            hai lối ra DUY NHẤT của một trang mà /home tự đẩy tới — trang này không có
            tab bar Hub (§6 khuôn mini app), và một phụ huynh mở bằng PWA thì cũng không
            có nút Back của trình duyệt. Trượt tay ở lối ra duy nhất là bị nhốt.
            `gap-x-4 gap-y-1` thay cho `gap-4`: hai hộp nay cao 44px, dính nhau theo chiều
            dọc thì khoảng cách 16px cũ thành thừa và đẩy chân trang. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 pb-8 text-[12.5px] font-bold text-cardtitle">
          <a href="/home" className="flex min-h-[44px] items-center underline underline-offset-2">
            Về trang chủ
          </a>
          <a href="/ho-so" className="flex min-h-[44px] items-center underline underline-offset-2">
            Hồ sơ &amp; đăng xuất
          </a>
        </div>
      </MainContent>
    </div>
  );
}
