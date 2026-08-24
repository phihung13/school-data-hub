// components/profile-view.tsx — V10 Hồ sơ, dựng lại theo ảnh mẫu chủ đầu tư (06/08/2026).
//
// ══════════════════════════════════════════════════════════════════════════════
// SÁU Ô TRONG ẢNH MẪU KHÔNG ĐƯỢC DỰNG, VÀ VÌ SAO
// ══════════════════════════════════════════════════════════════════════════════
// Ảnh mẫu vẽ nhiều hơn số dữ liệu đang có. Điều 20 của hiến pháp UI ("không số liệu bịa,
// không nút dở dang, không liên kết chết") và §3 DESIGN-GUIDELINES cấm dựng chúng bằng số
// giả hay công tắc không nối vào đâu. Với mỗi ô, hai đường: (a) bỏ khỏi bản dựng, hoặc
// (b) dựng ở thể "chưa có" kèm nhãn "· sắp" như ô mini app mờ ở trang chủ. Đường (b) chỉ
// đúng khi người dùng CẦN biết trường có định làm hay không — nó là kỳ vọng, không phải
// quyền (mục 9c của brief). Sáu ô dưới đây đều chọn (a), và đây là lý do từng ô:
//
//  1. HUY HIỆU — không bảng nào, không cột nào trong migration tới 06/08/2026. Một ô số
//     ở đây chỉ có thể là số bịa. Không chọn (b): huy hiệu không phải một mini app trường
//     đã hứa, nên "· sắp" sẽ là lời hứa do màn hình tự đặt ra.
//  2. ĐỌC SÁCH TUẦN (3/5) — "Học tập" là mini app giai đoạn 2, chưa xây. Ô mờ "· sắp" của
//     nó ĐÃ CÓ ở lưới mini app trang chủ; vẽ lại một ô số mờ ở hồ sơ là nói hai lần cùng
//     một điều, lần thứ hai dưới dạng một con số không tồn tại.
//  3. THIẾT BỊ ĐANG ĐĂNG NHẬP — không có sổ thiết bị. Phiên là token 15 phút, hệ KHÔNG
//     biết em đang mở trên máy nào. Đây là ô nguy hiểm nhất trong sáu ô: một danh sách
//     thiết bị sai làm em tưởng có người lạ đăng nhập, hoặc tệ hơn, làm em YÊN TÂM rằng
//     không có ai — trong khi hệ không có cách nào biết.
//  4. NHẮC CHECK-IN BUỔI SÁNG (công tắc) — chưa có kênh đẩy nào (DEBT #40: kênh duy nhất
//     có thật là một tệp nhật ký). Một công tắc bật lên rồi không ai nhận được nhắc là
//     lời hứa suông, và nó còn tệ hơn không có: em bật rồi trông chờ vào nó.
//  5. NGÔN NGỮ — chưa có i18n. Một ô chọn chỉ có một lựa chọn là ô trang trí (§3).
//  6. CHIP "GOOGLE SSO" — Google SSO thật CHƯA bật; /login đang chạy nhà cung cấp thử
//     (login-form.tsx: "Chọn tài khoản thử (thay Google SSO thật)"). In tên nhà cung cấp
//     lên hồ sơ là khai một sự thật kỹ thuật chưa đúng. Dòng "Đăng nhập bằng tài khoản
//     trường" nói đúng thứ đang xảy ra và không phải sửa lại khi SSO bật.
//
// Và một câu bị bỏ hẳn: **"thường trả lời trong ngày"** cạnh tên thầy cô chủ nhiệm. Đó là
// một cam kết SLA không ai đặt ra, in trên màn của một đứa trẻ đang cân nhắc có nên nhờ
// giúp hay không. Không đo được, không ai chịu trách nhiệm — bỏ.
//
// Cổng canh sáu ô này: tests/unit/ho-so-khong-bia-so.test.ts. Có nó để lần sau không ai
// lặng lẽ thêm một con số giả vào, và để người thêm phải đọc lý do trước khi thêm.
//
// ══════════════════════════════════════════════════════════════════════════════
// BỐ CỤC — HAI CỘT, MỘT CÂY DUY NHẤT
// ══════════════════════════════════════════════════════════════════════════════
// Máy tính (1440×900): cột nội dung `flex 1.65` + rail `flex 1`, đúng tỉ lệ brief mục 5.2.
// Điện thoại (390×844): cùng cây đó xếp thành một cột, thứ tự DOM = thứ tự đọc.
//
// Vì sao MỘT cây chứ không phải hai nhánh `md:hidden` như bản trước: bản trước dựng cột
// mobile và cột desktop tách rời, và lỗi đã xảy ra thật hai lần — bản mobile là NGÕ CỤT
// (31/07), rồi bản mobile thiếu khối "Ai thấy gì của mình?" và đường nhờ thầy cô giúp
// (31/07, gói "mobile-cho-man-con-thieu"). Hai lần đều cùng một cơ chế: nội dung mới được
// thêm vào một cột, không ai nhớ cột kia. Một cây thì không có "cột kia" để mà quên.
//
// Sửa 31/07/2026 (gói "a11y-nen") vẫn còn hiệu lực: mỗi nhánh (học sinh / nhân viên) là
// MỘT cây có <MainContent> bọc nội dung — menu trái và tab bar nằm NGOÀI nó, nên đường tắt
// "Bỏ qua menu" ở layout.tsx mới thật sự bỏ qua được menu.
//
// Sửa 31/07/2026 (gói "giong-noi-va-don-dep"): mọi chỗ gọi tên thầy cô đi qua teacherLabel()
// ở ngay dưới — cắt hậu tố chức danh trong full_name, chưa biết tên thì nói "thầy cô chủ
// nhiệm", không bao giờ lấy chữ viết tắt hành chính làm tên người.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import type { HubRole } from "@hub/core/contracts";
import { Mascot } from "./mascot";
import { HubSidebar } from "./hub-sidebar";
import { MainContent } from "./page-shell";
import { StudentTabBar } from "./tab-bar";
import { ErrorState, LoadingState } from "./ui/query-state";
import { classLabel, personName } from "./ui/labels";

/**
 * Tên cô/thầy chủ nhiệm để GỌI trong câu văn với học sinh.
 *
 * Hai lỗi cùng lúc được vá ở đây (gói "giong-noi-va-don-dep", 31/07/2026):
 *  1. `teacherName ?? "GVCN"` biến một chữ viết tắt hành chính thành TÊN NGƯỜI: em đọc
 *     được "GVCN — cảm xúc, điểm danh, lời nhắn "cần gặp thầy cô"". DESIGN-GUIDELINES §8
 *     cấm từ vựng vận hành ở bề mặt học sinh, và đây còn là chỗ nhạy nhất: khối nói cho
 *     em biết AI đọc được cảm xúc của mình.
 *  2. `core.users.full_name` mang hậu tố chức danh ("Cô Lan (GVCN 6A1)") nên kể cả khi
 *     CÓ tên thật, chữ "GVCN" vẫn hiện — personName() cắt phần trong ngoặc.
 * Chưa biết tên thì nói "thầy cô chủ nhiệm" (đúng người, không bịa tên).
 */
function teacherLabel(fullName: string | null | undefined): string {
  return personName(fullName) || "thầy cô chủ nhiệm";
}

function useLogout() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
}

/**
 * Đăng xuất — hành động KHÔNG LÙI ĐƯỢC, nên phải hỏi lại (điều 15 hiến pháp UI).
 *
 * Trước 06/08/2026 nút này gọi thẳng `/api/auth/logout` ngay cú bấm đầu tiên. Trên điện
 * thoại nó nằm ngay dưới nội dung cuộn, và một cú chạm nhầm đá người dùng ra màn đăng
 * nhập — với nhà cung cấp SSO thật thì đường quay lại còn đi qua một vòng chuyển hướng nữa.
 *
 * Hỏi lại bằng cách MỞ TẠI CHỖ chứ không bằng hộp thoại nổi: hộp thoại đúng chuẩn cần giam
 * focus, trả focus, khoá cuộn nền — hứa `role="dialog"` mà không làm đủ thì tệ hơn không
 * hứa (cùng lý lẽ với `aria-haspopup` ở user-menu.tsx). Khối mở tại chỗ giữ nguyên thứ tự
 * Tab của trang, và con trỏ bàn phím được đặt vào nút xác nhận nên trình đọc màn hình đọc
 * ra câu hỏi ngay khi nó hiện.
 *
 * `Escape` = "Ở lại": phím thoát quen thuộc phải trả về trạng thái an toàn, không phải
 * trạng thái đã thoát.
 */
function LogoutBox({ className = "" }: { className?: string }) {
  const logout = useLogout();
  const [hoiLai, setHoiLai] = useState(false);
  const nutXacNhan = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (hoiLai) nutXacNhan.current?.focus();
  }, [hoiLai]);

  if (!hoiLai) {
    return (
      <button
        type="button"
        onClick={() => setHoiLai(true)}
        // Chữ đỏ của nút dùng token `dangerText` (#FF8A8F), không phải #FF8A8F: #FF8A8F đạt
        // 4,80:1 trên trắng nên nhìn qua tưởng đủ — nhưng nút này nằm trên NỀN HỒNG
        // #351216 (token surface-danger), và ở đó nó chỉ 4,49:1, hụt 0,01 so với mốc 4,5:1.
        // #FF8A8F trên #351216 = 4,94:1. (05/08/2026)
        // Icon `logout` giữ #FF8A8F: nó là thành phần phi văn bản (aria-hidden, chữ "Đăng
        // xuất" ngay bên cạnh mới mang nghĩa) nên mốc của nó là 3:1, và 4,49:1 vượt xa.
        //
        // VIỀN ĐỔI 06/08/2026 — #FFD5D6 → token `dangerText`. Đo lại đợt này ra một con số
        // không chống chế được: nền nút #351216 so với nền trang #050F26 là **1,00:1**, và
        // viền cũ #FFD5D6 so với cả hai là 1,25:1. Tức là RANH GIỚI của nút không tồn tại —
        // WCAG 1.4.11 đòi 3:1 cho phần nhìn được dùng để nhận ra một điều khiển, và thứ duy
        // nhất đang làm việc đó là dòng chữ bên trong. Trên một nút KHÔNG LÙI ĐƯỢC thì nhận
        // nhầm ranh giới là bấm nhầm. #FF8A8F cho 4,94:1 trên nền trang — và đúng là "nút
        // Đăng xuất viền đỏ" mà ảnh mẫu vẽ.
        className={`flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dangerText bg-surface-danger px-6 py-3 text-[14px] font-black text-dangerText hover:bg-[#FFECEC] ${className}`}
      >
        <span aria-hidden="true" className="msr text-[20px] text-[#FF8A8F]">logout</span>
        Đăng xuất
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Xác nhận đăng xuất"
      onKeyDown={(e) => {
        if (e.key === "Escape") setHoiLai(false);
      }}
      className={`flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-dangerText bg-surface-danger p-4 ${className}`}
    >
      <p className="text-[13px] font-black text-dangerText">Đăng xuất khỏi tài khoản này?</p>
      <div className="flex gap-2">
        <button
          type="button"
          ref={nutXacNhan}
          onClick={logout}
          // Trắng trên #FF8A8F = 6,03:1 — nút xác nhận là chỗ duy nhất trong màn dùng nền
          // đỏ đặc, và nó phải đọc được chắc chắn hơn nút mở ra nó.
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-dangerText px-4 text-[13px] font-black text-white"
        >
          <span aria-hidden="true" className="msr text-[18px]">logout</span>
          Đăng xuất
        </button>
        <button
          type="button"
          onClick={() => setHoiLai(false)}
          // Viền `subtle` (#93A9C8) chứ không phải `line` (#1E3A6B): nút này màu trắng đứng
          // trên nền hồng #351216 — hai mặt cách nhau 1,03:1, nên viền là thứ DUY NHẤT vẽ
          // ra nó. `line` cho 1,22:1, `subtle` cho 5,09:1. Đường lùi phải nhìn thấy rõ ít
          // nhất bằng đường đi tiếp.
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border-[1.5px] border-subtle bg-card px-4 text-[13px] font-black text-cardtitle2"
        >
          Ở lại
        </button>
      </div>
    </div>
  );
}

/**
 * "Ai thấy gì của mình?" — bắt buộc có ở MỌI khổ màn (DESIGN-GUIDELINES §9).
 *
 * Dòng cô chủ nhiệm đã đổi chiều BA LẦN, mỗi lần theo một quyết định chủ đầu tư,
 * và mỗi lần thẻ này phải đổi CÙNG migration — vì đây là màn SINH RA để nói thật:
 *   · 31/07/2026 (ADR-025): cô đọc được cảm xúc.
 *   · 01/08/2026 (ADR-026, 0044): cô bị cắt — dòng tách làm hai ý, có câu
 *     "biết vậy thôi, không biết con đã ghi gì" vạch ranh giới cho em.
 *   · 21/08/2026 (ADR-035, 0059): cô đọc lại được — dòng GỘP về một ý.
 *
 * Vì sao lần này phải GỘP chứ không giữ câu hai-ý cho "an toàn": câu hai-ý nay nói
 * ÍT hơn sự thật — em tưởng ô cảm xúc là chỗ cô không thấy và viết như viết chỗ
 * riêng tư, trong khi cô đọc được. Trấn an sai chỗ chính là kiểu nói dối mà §9 cấm,
 * và ở màn này nó sai theo hướng nguy hiểm nhất cho em.
 *
 * Nếu có lần đổi thứ tư: sửa DESIGN-GUIDELINES §9 trước (câu này là hợp đồng), rồi sửa
 * đây CÙNG một commit với migration.
 *
 * Hằng số `NHAN_AI_DOC_CAM_XUC` từng đứng cạnh câu này ở `ui/labels.ts` — nhãn ngắn in
 * dưới bốn ô mặt cười — nhưng ĐÃ XOÁ 22/08/2026 (chủ đầu tư bỏ câu ở cả ba màn; nợ #70
 * giữ phần nghĩa vụ báo trước theo Luật 91/2025). Thẻ NÀY thì Ở LẠI: nó là câu dài trong
 * hồ sơ, người dùng tự mở ra đọc, không phải một dòng chen vào lúc em đang bấm.
 */
function WhoSeesWhatCard({ teacherName }: { teacherName: string | null }) {
  const teacher = teacherLabel(teacherName);
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border-[1.5px] border-[#1E4E8C] bg-surface-infoSoft p-5 text-left md:p-[22px]">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="msr text-[20px] text-[#2C7BF2]">shield_person</span>
        <span className="text-[15px] font-black text-link">Ai thấy gì của mình?</span>
      </div>
      {/* Màu không bao giờ là tín hiệu duy nhất (§11): mỗi dòng có icon check/cancel
          KÈM chữ nói rõ thấy gì — người mù màu vẫn đọc đủ nghĩa. */}
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="msr flex-none text-[18px] text-[#4EE39B]">check_circle</span>
        <span className="text-[12.5px] leading-relaxed text-link">
          <b>Thầy cô tâm lý</b> — đọc được nhật ký cảm xúc của con và lời nhắn con gửi.
        </span>
      </div>
      {/* GỘP LẠI 21/08/2026 (ADR-035, migration 0059): cô chủ nhiệm đọc lại được nhật ký
          cảm xúc, nên dòng hai-ý của ADR-026 ("cô không đọc được... biết vậy thôi") đã hết
          đúng và PHẢI gộp — giữ nó là hứa với em một ranh giới không còn tồn tại, sai theo
          hướng nguy hiểm: em tưởng cô không thấy và viết như chỗ riêng tư. Icon đổi về
          check_circle vì cô nay thuộc hẳn nhóm "đọc được", không còn lưng chừng. */}
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="msr flex-none text-[18px] text-[#4EE39B]">check_circle</span>
        <span className="text-[12.5px] leading-relaxed text-link">
          <b>{teacher}</b> — xem điểm danh, đọc được nhật ký cảm xúc của con và lời nhắn con gửi.
        </span>
      </div>
      {/* RÚT NGẮN 06/08/2026 (§1.5). Vế trong ngoặc là một GIỚI HẠN QUYỀN, không phải chữ
          thừa — bỏ hẳn là nói nhiều hơn sự thật, đúng thứ §9 gọi là nói dối. Nên nó ở lại,
          chỉ đổi từ đuôi câu trong ngoặc thành một chip `visibility_off` đứng riêng: cùng
          nội dung, ngắn hơn một nửa, và cái "không" thì mắt bắt được ngay bằng icon. */}
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="msr flex-none text-[18px] text-[#2C7BF2]">visibility</span>
        <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] leading-relaxed text-link">
          <span>
            <b>Bố mẹ</b> — điểm danh, Báo cáo Trưởng thành
          </span>
          <span className="flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-black text-link">
            <span aria-hidden="true" className="msr text-[13px]">visibility_off</span>
            không xem cảm xúc
          </span>
        </span>
      </div>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="msr flex-none text-[18px] text-[#FF8A8F]">cancel</span>
        <span className="text-[12.5px] leading-relaxed text-link">
          <b>Bạn cùng lớp</b> — không thấy gì cả
        </span>
      </div>
    </div>
  );
}

/**
 * Đường tới "Cần gặp thầy cô" — một hàng trong thẻ "Tài khoản".
 *
 * Dòng phụ chỉ còn TÊN thầy cô. Câu "· thường trả lời trong ngày" trong ảnh mẫu đã bỏ:
 * không có SLA nào của trường nói thế, không ai đo, không ai chịu trách nhiệm. Một lời hứa
 * về thời gian trả lời in ngay tại chỗ em đang cân nhắc có nên nhờ giúp hay không là chỗ
 * tệ nhất để hứa liều.
 */
function HelpLink({ teacherName, className }: { teacherName: string | null; className: string }) {
  return (
    <a href="/can-gap-thay-co" className={className}>
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-surface-success">
        <span aria-hidden="true" className="msr text-[20px] text-[#4EE39B]">support_agent</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-extrabold text-ink">Trợ giúp &amp; nhắn thầy cô chủ nhiệm</div>
        <div className="mt-px text-[11.5px] text-caption">{teacherLabel(teacherName)}</div>
      </div>
      {/* Token `line2` = #27467E. Mũi tên này là trang trí thuần (aria-hidden, chữ ngay bên
          trái đã nói đủ) nên không có mốc tương phản nào áp lên nó — nhưng mỗi mã hex viết
          tay là một chỗ đợt sửa sau bỏ sót. */}
      <span aria-hidden="true" className="msr text-[20px] text-line2">chevron_right</span>
    </a>
  );
}

/** Avatar tròn vàng + chữ cái đầu. Tên rỗng ra "?" chứ không ra một vòng tròn trống. */
function Avatar({ initial }: { initial: string }) {
  return (
    <span className="flex h-[84px] w-[84px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-[32px] font-black text-cardtitle shadow-[0_8px_18px_rgba(232,148,13,.3)]">
      {initial}
    </span>
  );
}

/**
 * Thẻ danh tính. `meta` là một dòng đã ghép sẵn ở nơi gọi — ghép ở đó chứ không ở đây vì
 * học sinh và nhân viên có bộ thông tin khác nhau, và vì phần rỗng phải được LOẠI chứ
 * không được in ra thành dấu chấm giữa hai khoảng trắng ("Lớp  · Trường …").
 */
function IdentityCard({
  initial,
  name,
  meta,
  email,
}: {
  initial: string;
  name: string;
  meta: string;
  email: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-[22px] bg-card p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-[26px]">
      <Avatar initial={initial} />
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="text-[19px] font-black text-ink md:text-[22px]">{name}</div>
        {meta && <div className="mt-1 text-[13px] font-semibold text-subtle">{meta}</div>}
        {email && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-chip px-3 py-1.5">
              <span aria-hidden="true" className="msr text-[15px] text-subtle">mail</span>
              <span className="break-all text-[11.5px] font-bold text-cardtitle2">{email}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Một ô số. Ảnh mẫu vẽ BA ô; dựng được HAI — ô thứ ba (huy hiệu / đọc sách tuần) không có
 * dữ liệu nào phía sau, xem đầu file. Hai ô còn lại đều là số đếm thật từ
 * `attendance.checkins` (server/routers/profile.ts), không phải số dẫn xuất.
 */
function StatTile({
  icon,
  value,
  label,
  className,
  iconClass,
}: {
  icon: string;
  value: number;
  label: string;
  className: string;
  iconClass: string;
}) {
  return (
    <div className={`min-w-[104px] flex-1 rounded-2xl px-4 py-3.5 text-center ${className}`}>
      <div className="flex items-center justify-center gap-1">
        {/* Cả icon lẫn CON SỐ đều phải đọc được trên nền nhạt: con số là CHỮ nên mốc của nó
            là 4,5:1, và nó lại chính là thứ duy nhất mang dữ liệu trong ô này. Mã cũ
            #E8940D chỉ 2,26:1 trên #2A2208. (05/08/2026) */}
        <span aria-hidden="true" className={`msr text-[19px] ${iconClass}`}>{icon}</span>
        <span className="text-[20px] font-black">{value}</span>
      </div>
      <div className="mt-0.5 text-[10px] font-extrabold">{label}</div>
    </div>
  );
}

/**
 * Hàng ô số, đủ bốn thể của khối có dữ liệu.
 *
 * Thể RỖNG ở đây là thật, không phải giả định: em vừa nhập học thì chưa có lượt check-in
 * nào, và hai ô số sẽ là "0". Số 0 là một con số ĐÚNG, nhưng hai số 0 cạnh nhau đọc giống
 * hệt một màn hỏng — nên thể rỗng nói thẳng ra là chưa có gì được ghi, một dòng.
 * (Thể đang tải và thể lỗi ở tầng màn: cả thẻ danh tính, hàng ô số và đường nhờ giúp đều
 * đến từ MỘT truy vấn, nên vẽ ba khung xương rời nhau chỉ là ba lần nói cùng một điều.)
 */
function StatRow({ presentDays, streakDays }: { presentDays: number; streakDays: number }) {
  if (presentDays === 0 && streakDays === 0) {
    return (
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-2xl bg-card p-4 shadow-[0_3px_14px_rgba(10,42,94,.06)]"
      >
        {/* `caption2` chứ không phải `line2`: #27467E trên trắng là 1,53:1 — icon gần như
            biến mất, mà đây là ô CHỈ CÓ một icon và một dòng chữ. #8298B8 = 5,03:1. */}
        <span aria-hidden="true" className="msr text-[20px] text-caption2">event_busy</span>
        <span className="text-[12.5px] font-bold text-muted">Chưa có ngày nào được ghi</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2.5">
      <StatTile
        icon="local_fire_department"
        value={streakDays}
        label="chuỗi check-in"
        className="bg-surface-warnSoft text-gold-textDark"
        iconClass="text-gold-textDark"
      />
      <StatTile
        icon="event_available"
        value={presentDays}
        label="ngày có mặt"
        className="bg-surface-success text-successText"
        iconClass="text-[#4EE39B]"
      />
    </div>
  );
}

/** Thẻ "Tài khoản". Ảnh mẫu gọi nó là "Tài khoản & thiết bị" — phần thiết bị đã bỏ, xem đầu file. */
function AccountCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-card p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)] md:p-6">
      <div className="text-[15px] font-black text-cardtitle md:text-[16px]">Tài khoản</div>
      <div className="mt-3 flex flex-col">
        <div className="flex items-center gap-3.5 py-[15px]">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-surface-infoSoft">
            <span aria-hidden="true" className="msr text-[20px] text-[#2C7BF2]">verified_user</span>
          </span>
          {/* BỎ 06/08/2026 (§1.5): "Không có mật khẩu riêng để quên" là câu biện minh cho một
              lựa chọn kỹ thuật của trường, không phải thông tin em hay bố mẹ cần để làm việc
              gì trên màn này. Dòng chính + chip ĐANG DÙNG đã nói đủ trạng thái tài khoản. */}
          <div className="min-w-0 flex-1 text-[14px] font-extrabold text-ink">
            Đăng nhập bằng tài khoản trường
          </div>
          <span className="flex-none rounded-full bg-surface-success px-[11px] py-1.5 text-[10px] font-black text-successText">
            ĐANG DÙNG
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Dòng phiên bản — em và bố mẹ đọc nó cho người hỗ trợ khi báo lỗi ("bản nào?"). */
function VersionLine() {
  // #B6BECB = 1,87:1 trên trắng — dưới cả mốc 3:1 của thành phần phi văn bản. Token
  // caption2 = 5,03:1. (01/08/2026)
  return (
    <div className="text-center text-[10.5px] font-semibold text-caption2">
      School Hub v1.0 · Giai đoạn 1 · Trường Việt Anh
    </div>
  );
}

/**
 * Kiểu chữ của `<h1>` — một chuỗi dùng chung, để hai nhánh không trôi khỏi nhau về hình.
 *
 * Vì sao chính thẻ `<h1>` thì KHÔNG gói vào đây mà viết thẳng ở từng nhánh: cổng
 * tests/unit/a11y-nen.test.ts đếm số `<h1>` trong mã nguồn và đòi nó bằng số vùng
 * <MainContent>. Gói `<h1>` vào một component dùng chung làm phép đếm ra 1 cho 2 vùng —
 * đúng lúc chạy, sai lúc đếm. Nới phép đếm để nhận một `<h1>` gián tiếp là mở đúng cái
 * cửa mà cổng đó sinh ra để đóng: hai `<h1>` cùng lúc trong một DOM. Nên chỗ này chịu lặp
 * đúng MỘT dòng thẻ ở mỗi nhánh, và lặp có kiểm.
 */
const H1_CLASS = "text-[16px] font-black text-ink md:text-[17px]";

/**
 * Thanh tiêu đề màn, có ở CẢ HAI khổ. `<h1>` truyền vào từ nhánh gọi (xem H1_CLASS).
 *
 * `<h1>` thật chứ không phải `sr-only` + một `<div>` vẽ lại cùng chữ: hai thứ nói cùng một
 * điều thì một trong hai sẽ trôi.
 */
function ScreenHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-none items-center gap-3.5 border-b border-line bg-card px-5 py-3.5 md:px-7">
      <div className="min-w-0 flex-1">
        {children}
        <div className="text-[11.5px] text-caption">Tài khoản trường</div>
      </div>
    </div>
  );
}

/** Khung hai cột dùng chung cho hai nhánh: cột nội dung 1.65, rail 1 (brief mục 5.2). */
function TwoColumn({ main, rail }: { main: React.ReactNode; rail: React.ReactNode }) {
  return (
    // `md:min-h-0` là bắt buộc, không phải thừa: trong một flex-col, con `flex-1` mặc định
    // có `min-height:auto` nên nó KHÔNG co lại được — vùng này sẽ tràn ra ngoài
    // <MainContent> (đang `md:overflow-hidden`) thay vì tự cuộn, và ở khổ 1440×900 phần
    // cuối rail (nút Đăng xuất, dòng phiên bản) rơi khỏi khung nhìn mà không cuộn tới được.
    <div className="flex-1 px-5 py-5 md:min-h-0 md:overflow-y-auto md:p-7">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 md:flex-row md:items-start md:gap-5">
        <div className="flex min-w-0 flex-col gap-4 md:flex-[1.65]">{main}</div>
        <div className="flex min-w-0 flex-col gap-4 md:flex-1">{rail}</div>
      </div>
    </div>
  );
}

export function ProfileView({
  isStudent,
  displayName,
  email,
  roles,
  classCode,
}: {
  isStudent: boolean;
  displayName: string;
  email: string;
  roles: HubRole[];
  classCode?: string | null;
}) {
  return isStudent ? (
    <StudentProfile displayName={displayName} email={email} roles={roles} classCode={classCode} />
  ) : (
    <StaffProfile displayName={displayName} email={email} roles={roles} classCode={classCode} />
  );
}

function StudentProfile({
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
  const query = trpc.profile.getMyStudentProfile.useQuery();
  const profile = query.data;
  // CHỮ CÁI TRÊN AVATAR LẤY TỪ TÊN ĐANG HIỆN NGAY CẠNH NÓ, không lấy từ tên phiên.
  //
  // Đo thật 06/08/2026 trên hub_dev: phiên của em trả `displayName = "Học sinh Minh (6A1)"`
  // (tên tài khoản thử), trong khi thẻ in tên thật "Nguyễn Văn Minh". Lấy ký tự đầu của tên
  // phiên cho ra chữ **H** nằm cạnh chữ "Nguyễn Văn Minh" — một avatar không khớp với chính
  // cái tên nó đứng cạnh. Và tiếng Việt gọi nhau bằng TÊN, nên chữ đúng là chữ đầu của từ
  // cuối cùng: "Nguyễn Văn Minh" → M.
  const tenHienThi = profile?.fullName?.trim() || displayName.trim();
  const initial = (tenHienThi.split(/\s+/).pop() ?? "").slice(0, 1).toUpperCase() || "?";

  // Ghép ở đây chứ không trong thẻ: phần nào rỗng thì BIẾN MẤT khỏi dòng. Chưa có lớp
  // (chưa xếp lớp, hoặc đã kết thúc niên khoá) mà in "Lớp  · …" là in ra một chỗ trống
  // trông như dữ liệu bị mất.
  const meta = profile
    ? [classLabel(profile.classCode), profile.schoolName, `mã học sinh ${profile.studentCode}`]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Menu trái và tab bar nằm NGOÀI <MainContent> — đó chính là thứ đường tắt
          "Bỏ qua menu" phải bỏ qua được. Sidebar 240px chỉ có nghĩa từ md trở lên;
          dưới đó nó ăn 2/3 chiều ngang máy. */}
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="profile" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <MainContent className="flex min-w-0 flex-1 flex-col bg-pagebg md:overflow-hidden md:bg-pagebgDesktop">
        <ScreenHeader>
          <h1 className={H1_CLASS}>Hồ sơ của mình</h1>
        </ScreenHeader>

        {query.isPending && <LoadingState label="Đang tải hồ sơ…" />}
        {!query.isPending && query.error && (
          <ErrorState error={query.error} label="Hồ sơ" onRetry={() => void query.refetch()} />
        )}

        {profile && (
          <TwoColumn
            main={
              <>
                <IdentityCard
                  initial={initial}
                  name={profile.fullName}
                  meta={meta}
                  email={email}
                />
                <StatRow presentDays={profile.presentDays} streakDays={profile.streakDays} />
                <AccountCard>
                  <HelpLink
                    teacherName={profile.homeroomTeacherName}
                    // min-h-[52px] > 44px của §11; cả hàng là vùng chạm, không chỉ dòng chữ.
                    className="flex min-h-[52px] items-center gap-3.5 border-t border-chip py-[15px] hover:bg-[#FAFBFD]"
                  />
                </AccountCard>
              </>
            }
            rail={
              <>
                <WhoSeesWhatCard teacherName={profile.homeroomTeacherName} />
                {/* RÚT NGẮN 06/08/2026 (§1.5). Bỏ "Hồ sơ là của con." — không mang thông
                    tin nào. Giữ phần dùng được: sai thì báo cho ai. */}
                <div className="flex items-center gap-3 rounded-[20px] bg-card p-5 shadow-[0_3px_14px_rgba(10,42,94,.06)]">
                  <Mascot pose="think" width={46} />
                  <p className="text-[12.5px] font-semibold text-cardtitle2">
                    Thông tin chưa đúng — nói với {teacherLabel(profile.homeroomTeacherName)} nhé.
                  </p>
                </div>
                <LogoutBox />
                <VersionLine />
              </>
            }
          />
        )}
      </MainContent>
      <div className="md:hidden">
        <StudentTabBar fullName={displayName} email={email} />
      </div>
    </div>
  );
}

/**
 * Nhánh NHÂN VIÊN — cùng bố cục hai cột, khác nội dung và khác giọng (§8: người lớn gọn,
 * nghiệp vụ; không "nhé", không mascot).
 *
 * Ba khối của nhánh học sinh KHÔNG có ở đây, và không phải vì làm tắt:
 *  · "Ai thấy gì của mình?" nói về quyền đọc dữ liệu cảm xúc của MỘT HỌC SINH. Nhân viên
 *    không có dữ liệu đó nên thẻ này với họ là một khối trống có tiêu đề.
 *  · Ô số chuỗi check-in / ngày có mặt là dữ liệu điểm danh của học sinh.
 *  · Đường "nhắn thầy cô chủ nhiệm" là đường của em, không phải của đồng nghiệp.
 * Thứ nhân viên THẬT SỰ cần ở màn này — biết mình đang đăng nhập bằng tài khoản nào, và
 * thoát ra được — thì có đủ, ở cả hai khổ màn.
 */
function StaffProfile({
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
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="profile" fullName={displayName} email={email} classCode={classCode} />
      </div>
      <MainContent className="flex min-w-0 flex-1 flex-col bg-pagebg md:overflow-hidden md:bg-pagebgDesktop">
        <ScreenHeader>
          <h1 className={H1_CLASS}>Hồ sơ của tôi</h1>
        </ScreenHeader>
        <TwoColumn
          main={
            <>
              <IdentityCard initial={initial} name={displayName} meta={classLabel(classCode)} email={email} />
              <AccountCard />
            </>
          }
          rail={
            <>
              <LogoutBox />
              {/* Nhân viên không có thanh tab; trên điện thoại đây là đường về Hub duy nhất.
                  inline-flex + min-h-[44px]: đo thật trên 360px ngày 02/08/2026 ra 81×19 —
                  một đường ra cao 19px trên màn cảm ứng, đúng ở màn mà nó là đường ra DUY NHẤT. */}
              <a
                href="/home"
                className="inline-flex min-h-[44px] items-center justify-center text-[12.5px] font-extrabold text-link underline underline-offset-2 md:hidden"
              >
                Về trang chủ
              </a>
              <VersionLine />
            </>
          }
        />
      </MainContent>
    </div>
  );
}
