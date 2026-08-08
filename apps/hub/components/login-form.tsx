// Đăng nhập — bản parallax (Login Parallax.dc.html, "Tiếp tục trang đăng nhập.zip" 30/07/2026).
// Hai bố cục THẬT SỰ khác nhau, không phải co giãn một bản:
// - Mobile (<md): dải hero navy tĩnh ở trên (không chạy parallax — máy Android rẻ
//   không nên tải 6 lớp ảnh + vòng lặp rAF chỉ để trang trí, xem login-parallax-bg.tsx).
// - Desktop (≥md): nền minh hoạ lớp học parallax theo chuột toàn màn hình, thẻ đăng
//   nhập nổi bên phải. Một nút "Đăng nhập bằng Google" (tự nhận vai trò sau khi
//   đăng nhập, không chọn tab) + một nút Zalo riêng cho phụ huynh.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "./mascot";
import { LoginParallaxBg } from "./login-parallax-bg";
import { MainContent } from "./page-shell";
import { resolveThenPath } from "@/lib/trpc-client";

interface DevAccount {
  authUid: string;
  email: string;
  displayName: string;
  audience: "staff" | "student";
}

export function LoginForm({
  devAccounts,
  then,
}: {
  devAccounts: DevAccount[];
  /** Đích đã hẹn trong `?then=` (app/login/page.tsx đã lọc). Không có thì về /home. */
  then?: string | null;
}) {
  const router = useRouter();
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Trạng thái CỬA của bản thử (nợ #19 — xem packages/core/auth-adapter/dev-gate.ts).
   * `unknown` là lúc chưa hỏi xong máy chủ: vẽ khung xám thay vì vẽ danh sách tài khoản
   * rồi giật đi, và cũng đừng vẽ ô nhập mã cho một người có thể không cần nhập gì cả.
   */
  // Trạng thái ban đầu SUY TỪ THỨ MÁY CHỦ ĐÃ GỬI, không phải luôn "unknown".
  //
  // app/login/page.tsx chỉ đính kèm danh sách tài khoản khi cửa đang mở (nếu không thì
  // gửi mảng rỗng — xem chú thích chống rò ở đó). Nên "có tài khoản trong tay" ĐÃ LÀ
  // câu trả lời của máy chủ cho câu hỏi cửa mở hay chưa; hỏi lại qua mạng rồi mới tin
  // là để trang nói dối trong khoảnh khắc đầu tiên.
  //
  // Cụ thể cái hỏng đo được 02/08/2026: danh sách 9 tài khoản hiện NGAY trong HTML đầu,
  // còn dòng cảnh báo "cửa đang mở, đừng nạp dữ liệu thật" thì phải chờ một vòng mạng —
  // tức là người dùng nhìn thấy thứ nguy hiểm trước khi nhìn thấy lời cảnh báo về nó.
  const [gate, setGate] = useState<"unknown" | "absent" | "misconfigured" | "locked" | "open">(
    devAccounts.length > 0 ? "open" : "unknown",
  );
  const [secret, setSecret] = useState("");
  /**
   * Tài khoản người dùng đã bấm TRƯỚC khi cửa hiện ra. Giữ lại để mở khoá xong là vào
   * thẳng, không bắt bấm lại — đây chính là chỗ biến "hai lần thao tác" thành ĐÚNG MỘT
   * lần nhập mã, thứ mà người demo bằng điện thoại sẽ cảm nhận được.
   */
  const [pendingAccount, setPendingAccount] = useState<string | null>(null);

  useEffect(() => {
    // Hỏi trạng thái cửa MỘT lần khi mở trang. 404 = cửa không tồn tại (production):
    // không vẽ khối tài khoản thử nữa. 503 = máy chủ chưa đặt bí mật: nói thẳng cho
    // người vận hành, đừng để họ bấm rồi đoán.
    let alive = true;
    fetch("/api/auth/dev-gate")
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 404) return setGate("absent");
        const body = await res.json().catch(() => ({}));
        setGate(body.state === "open" ? "open" : body.state === "misconfigured" ? "misconfigured" : "locked");
        if (res.status === 503 && body.error) setError(body.error);
      })
      .catch(() => {
        // Mạng hỏng: coi như còn khoá. Đoán "mở" ở đây là vẽ ra một danh sách tài khoản
        // bấm vào đâu cũng 401 — thà hiện ô nhập mã, bấm vào là biết ngay đúng hay sai.
        if (alive) setGate("locked");
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Lọc LẦN HAI ngay tại client. Trang cha đã lọc rồi, nhưng đây là biến duy nhất trong màn
   * đăng nhập đi thẳng vào `location.assign` — chi phí một lời gọi thuần, đổi lại thì dù sau
   * này ai đó render LoginForm từ chỗ khác và quên lọc, chỗ này vẫn không thành open redirect.
   */
  const target = resolveThenPath(then);

  /**
   * Nạp lại cả trang thay vì `router.push`: (a) cookie phiên vừa được Set-Cookie ở response
   * trên, hard navigation là cách chắc chắn nhất để mọi Server Component đọc được nó thay vì
   * dùng lại cache RSC dựng lúc CHƯA đăng nhập; (b) `?then=` hợp lệ có thể là
   * `/oidc/interaction/<uid>` — đường do server.mjs phục vụ, router của Next không biết tới.
   */
  function goAfterLogin() {
    window.location.assign(target);
  }

  async function loginDev(authUid: string) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authUid }),
    });
    if (!res.ok) {
      setLoading(false);
      // Cửa vừa đóng lại giữa chừng (cookie hết hạn, hoặc bí mật vừa được đổi để thu
      // hồi một máy). Không hiện câu "đã seed dữ liệu chưa" — đó là câu trả lời cho
      // một câu hỏi khác, và nó sẽ khiến người dùng đi sửa nhầm chỗ.
      const body = await res.json().catch(() => ({} as { state?: string; error?: string }));
      if (res.status === 401 && body.state === "locked") {
        setGate("locked");
        setPendingAccount(authUid);
        setError(null);
        return;
      }
      if (res.status === 503 || res.status === 404) {
        setGate(res.status === 404 ? "absent" : "misconfigured");
        setError(body.error ?? "Cửa đăng nhập thử không dùng được.");
        return;
      }
      setError("Đăng nhập thất bại — đã seed dữ liệu dev chưa?");
      return;
    }
    // KHÔNG tắt `loading` ở nhánh thành công: trang đang được nạp lại, mở khoá các nút lúc này
    // chỉ mời người dùng bấm lần hai và tạo thêm một phiên nữa.
    goAfterLogin();
  }

  /** Nhập mã mở khoá bản thử. Đúng thì máy nhớ 30 ngày — không hỏi lại ở lần sau. */
  async function unlockGate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/dev-gate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (!res.ok) {
      setLoading(false);
      const body = await res.json().catch(() => ({} as { error?: string }));
      setError(body.error ?? "Mã mở khoá không đúng.");
      return;
    }
    setSecret(""); // không giữ bí mật trong state lâu hơn mức cần thiết
    setGate("open");
    // Đã bấm một tài khoản trước khi cửa hiện ra thì đi tiếp luôn. `loading` cố ý KHÔNG
    // tắt ở nhánh này: trang sắp được nạp lại.
    if (pendingAccount) {
      const authUid = pendingAccount;
      setPendingAccount(null);
      await loginDev(authUid);
      return;
    }
    // Từ 02/08/2026 danh sách tài khoản KHÔNG còn đi kèm trang lúc chưa mở khoá (xem
    // app/login/page.tsx). Mở khoá xong thì prop `devAccounts` trong tay vẫn là mảng
    // rỗng của lần dựng trước — phải xin máy chủ dựng lại trang, lúc này cookie cửa đã
    // có nên nó gửi kèm danh sách. Không có dòng này thì cửa mở ra một khối trống,
    // đúng kiểu hỏng im lặng: người dùng nhập đúng mã mà màn hình vẫn không có gì.
    router.refresh();
    setLoading(false);
  }

  async function redeemCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      setLoading(false);
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Mã mời không hợp lệ");
      return;
    }
    goAfterLogin();
  }

  return (
    <div className="flex min-h-screen w-full flex-col md:block">
      <MobileHeroBand />

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-pagebg md:h-screen md:justify-end md:bg-[#F4E9D8] md:px-[54px] md:py-11">
        <div className="hidden md:block">
          <LoginParallaxBg />
        </div>

        {/* CỘT THẺ ĐĂNG NHẬP LÀ <main id="noi-dung"> CỦA TRANG /login (sửa 05/08/2026).
            Đường tắt "Bỏ qua menu" in ở đầu <body> trên MỌI trang (app/layout.tsx) trỏ tới
            #noi-dung, mà /login không có phần tử nào mang id đó: người dùng bàn phím bấm
            đường tắt đầu tiên của trang đầu tiên họ gặp và không đi tới đâu cả.
            Bọc ĐÚNG cột thẻ, KHÔNG bọc nền parallax: nền là trang trí (aria-hidden), đưa
            nó vào landmark là mời trình đọc màn hình đi qua sáu lớp ảnh trước khi tới ô
            đăng nhập — đúng thứ đường tắt sinh ra để tránh. Cả trang chỉ có MỘT id này.

            Bỏ `md:backdrop-blur-[6px]`: nền dưới thẻ đã đục 94% nên hiệu ứng gần như không
            nhìn thấy, trong khi backdrop-filter buộc trình duyệt tách một lớp composite và
            vẽ lại nó theo TỪNG KHUNG HÌNH của vòng parallax 60fps ngay bên dưới. Chi phí
            có thật, hiệu ứng thì không — nền `md:bg-white` giữ nguyên phần nhìn thấy được. */}
        <MainContent className="relative z-[2] flex w-full flex-col gap-4 px-6 py-8 focus:outline-none md:w-[428px] md:gap-[18px] md:rounded-[22px] md:border md:border-[#EFE6D6] md:bg-white md:p-8 md:shadow-[0_2px_6px_rgba(38,39,93,.05),0_18px_34px_rgba(38,39,93,.10),0_44px_80px_rgba(38,39,93,.20)]">
          <div>
            {/* #9A8F6E chỉ đạt 3,22:1 trên thẻ trắng — dưới chuẩn 4,5:1. Mã đầu tiên thử
                thay (#8A7B52) đo lại chỉ được 4,17:1, nên chốt #806E44 = 4,96:1 trên trắng:
                cùng sắc vàng-nâu của bộ nhận diện, đủ biên để không tụt lại ở lần sửa sau. */}
            <div className="hidden text-[12.5px] font-extrabold uppercase tracking-[.14em] text-[#806E44] md:block">
              Chào mừng trở lại
            </div>
            <h1 className="text-[24px] font-black leading-[1.15] tracking-[-.015em] text-ink md:mt-[7px] md:text-[31px] md:text-[#26275D]">
              Viet Anh{" "}
              <span className="relative inline-block">
                School Hub
                <span aria-hidden className="absolute inset-x-0 bottom-[2px] -z-10 h-[9px] rounded-full bg-gold opacity-55" />
              </span>
            </h1>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-[9px] rounded-2xl border border-[#F6D2D2] bg-[#FFF1F1] p-[11px_13px] animate-popIn">
              {/* aria-hidden: tên icon là chữ THẬT trong DOM. Không che thì trình đọc màn
                  hình đọc "error" (tiếng Anh) trước câu lỗi tiếng Việt ngay bên cạnh —
                  khối đã có role="alert" nói đủ rồi, icon chỉ là hình. */}
              <span className="msr flex-none text-[19px] text-[#D2383E]" aria-hidden>
                error
              </span>
              <span className="text-[12.5px] font-bold leading-[1.45] text-[#A32127]">{error}</span>
            </div>
          )}

          {/* Bốn trạng thái cửa, bốn thứ khác nhau hiện ra — không có nhánh nào vẽ danh
              sách tài khoản mà bấm vào lại báo lỗi. `absent` (production) bỏ hẳn khối
              này: khi đó lối vào duy nhất là Zalo cho phụ huynh, đúng như thiết kế. */}
          {gate === "unknown" && <StaffPanelSkeleton />}
          {gate === "locked" && (
            <UnlockPanel secret={secret} setSecret={setSecret} loading={loading} onSubmit={unlockGate} />
          )}
          {gate === "misconfigured" && <GateClosedNotice />}
          {/* Ô cảnh báo "cửa đang mở không mật khẩu" đã GỠ 02/08/2026 theo yêu cầu chủ
              đầu tư. Cảnh báo tương ứng vẫn còn ở `tools/start-local.sh` — chỗ đó là
              người vận hành đọc, không phải người dùng cuối. */}
          {gate === "open" && <StaffPanel devAccounts={devAccounts} loading={loading} onPick={loginDev} />}

          <div className="flex items-center gap-2.5">
            <span className="h-px flex-1 bg-[#EFE9DC]" />
            <span className="text-[11px] font-extrabold text-[#5B6B80]">hoặc</span>
            <span className="h-px flex-1 bg-[#EFE9DC]" />
          </div>

          <button
            type="button"
            onClick={() => setGuardianOpen((v) => !v)}
            className="flex h-[52px] items-center justify-center gap-2.5 rounded-[15px] bg-[#0068FF] text-[14.5px] font-black text-white shadow-[0_8px_20px_rgba(0,104,255,.26)] transition-transform hover:-translate-y-0.5 active:scale-[.985]"
          >
            {/* aria-hidden: nếu không, nút này đọc thành "chat_bubble Dành cho phụ huynh". */}
            <span className="msr text-[19px]" aria-hidden>
              chat_bubble
            </span>
            Dành cho phụ huynh · Zalo
          </button>

          {guardianOpen && <GuardianPanel code={code} setCode={setCode} loading={loading} onSubmit={redeemCode} />}

          {/* Trước 31/07/2026 chỗ này là hai link `href="#"`: "Quyền riêng tư" và "Hỗ trợ".
              Cả hai bấm được mà không dẫn đi đâu — với hệ dữ liệu trẻ em thuộc phạm vi Luật
              91/2025, một link "Quyền riêng tư" rỗng còn tệ hơn không có link: nó nói rằng
              chính sách đã tồn tại và đã được công bố. Repo chưa có trang chính sách nào
              (không route, không nội dung đã duyệt), nên bỏ hẳn link và chỉ để lại đúng
              đường hỗ trợ CÓ THẬT: nhắn GVCN — cùng lối mà GuardianPanel đang chỉ.
              Trả link về khi trang chính sách thật ra đời và được BGH duyệt nội dung.

              Sửa 01/08/2026: màu chữ #9AA0B2 → #5B6B80. Trên thẻ đăng nhập (nền trắng, và
              nền kem #F4E9D8 ở khung máy tính) #9AA0B2 chỉ đạt 2,61:1 / 2,17:1 — dưới chuẩn
              4,5:1. Đây là câu DUY NHẤT trên màn nói cho người chưa đăng nhập được biết phải
              hỏi ai; nó không phải chữ trang trí. #5B6B80 = 5,44:1 trên trắng, 4,53:1 trên
              #F4E9D8. Cùng lý do cho chữ "hoặc" ở dải phân cách. */}
          <p className="border-t border-[#F1EADD] pt-[14px] text-center text-[11px] font-bold leading-[1.5] text-[#5B6B80]">
            Tài khoản do Trường Việt Anh cấp · Cần hỗ trợ, nhắn giáo viên chủ nhiệm.
          </p>
        </MainContent>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero cong mobile (M1) — chỉ hiện <md. Không dùng LoginParallaxBg ở đây,
// xem lý do ở ghi chú đầu file.
// ---------------------------------------------------------------------------
function MobileHeroBand() {
  return (
    <div
      className="relative h-[200px] flex-none overflow-hidden bg-gradient-to-br from-navy to-navy-light md:hidden"
      style={{ borderRadius: "0 0 58% 58% / 0 0 20% 20%" }}
    >
      <div
        aria-hidden
        className="absolute -right-11 -top-[74px] h-[210px] w-[210px] rounded-full"
        style={{ background: "radial-gradient(circle at 36% 36%, rgba(255,198,41,.6), rgba(255,198,41,.08) 72%)" }}
      />
      <div className="relative mt-6 flex flex-col items-center gap-2.5">
        <div className="flex h-[72px] w-[72px] animate-floaty items-center justify-center rounded-[21px] bg-white shadow-[0_10px_26px_rgba(6,32,74,.34)]">
          <img src="/logo.webp?v=ddafa976" alt="" className="h-[58px] w-[58px] rounded-2xl object-cover" />
        </div>
        <div className="text-center">
          <div className="text-[20px] font-black text-white">School Hub</div>
          <div className="mt-0.5 text-[12px] font-bold text-[#FFD98A]">Hệ thống Trường Việt Anh</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Nhóm hiển thị trong ô chọn. Suy từ NHÃN chứ không từ `audience`, vì `audience` chỉ có
 * hai giá trị (staff/student) — không đủ để tách cô chủ nhiệm khỏi thầy cô bộ môn, mà đó
 * lại đúng là thứ người demo cần phân biệt.
 */
/**
 * Nhóm cho ô chọn vai. Hai luật, cả hai đều học từ lỗi đo được 02/08/2026:
 *
 *   1. KHỚP TRƯỚC ĂN TRƯỚC — mỗi tài khoản vào ĐÚNG một nhóm. Bản đầu để mỗi nhóm tự
 *      lọc cả danh sách, nên "Phụ huynh của Minh" (audience `student`, tên có chữ "phụ
 *      huynh") hiện HAI LẦN trong ô chọn.
 *   2. CÓ NHÓM VÉT — tài khoản không khớp luật nào rơi vào "Vai khác". Không có nó thì
 *      thêm một vai mới mà quên sửa file này sẽ làm tài khoản đó BIẾN MẤT khỏi ô chọn:
 *      không lỗi, không dòng trống, chỉ là không có ở đó. Người thử sẽ kết luận "vai đó
 *      chưa làm xong" trong khi nó chạy tốt.
 *
 * Thứ tự quan trọng: "Phụ huynh" phải đứng TRƯỚC "Học sinh" vì phụ huynh cũng mang
 * audience `student` (họ đi qua cùng một cổng đăng nhập).
 */
const NHOM_VAI: Array<{ ten: string; thuoc: (a: DevAccount) => boolean }> = [
  { ten: "Phụ huynh", thuoc: (a) => /phụ huynh/i.test(a.displayName) },
  { ten: "Học sinh", thuoc: (a) => a.audience === "student" },
  { ten: "Giáo viên chủ nhiệm", thuoc: (a) => /chủ nhiệm/i.test(a.displayName) },
  { ten: "Giáo viên bộ môn", thuoc: (a) => /bộ môn/i.test(a.displayName) },
  { ten: "Tâm lý · Quản trị", thuoc: (a) => /tâm lý|quản trị|hiệu trưởng/i.test(a.displayName) },
];

/** Chia danh sách thành các nhóm rời nhau, kèm nhóm vét cho phần không khớp. */
export function chiaNhom(
  ds: DevAccount[],
): Array<{ ten: string; tai: DevAccount[] }> {
  const con = new Set(ds);
  const ra = NHOM_VAI.map((nhom) => {
    const tai = [...con].filter((a) => nhom.thuoc(a));
    for (const a of tai) con.delete(a);
    return { ten: nhom.ten, tai };
  }).filter((n) => n.tai.length > 0);
  if (con.size > 0) ra.push({ ten: "Vai khác", tai: [...con] });
  return ra;
}

function StaffPanel({
  devAccounts,
  loading,
  onPick,
}: {
  devAccounts: DevAccount[];
  loading: boolean;
  onPick: (authUid: string) => void;
}) {
  // Mặc định chọn một em học sinh, không phải cô giáo đứng đầu danh sách: màn đầu tiên
  // người ta muốn xem khi demo gần như luôn là màn của trẻ.
  const [chon, setChon] = useState(
    devAccounts.find((a) => a.audience === "student")?.authUid ?? devAccounts[0]?.authUid ?? "",
  );
  // GHI RA ĐỂ KHÔNG AI TƯỞNG LÀ ĐÃ SẠCH (01/08/2026): HTML thật của /login vẫn chứa chuỗi
  // "Cô Lan (GVCN 6A1)". Nó KHÔNG đến từ file này mà từ `full_name` của bảng tài khoản thử
  // (packages/core/auth-adapter/dev-provider.ts), nên tests/unit/giong-noi.test.ts — vốn chỉ
  // đọc mã nguồn — không thấy được. Cố ý giữ: khối này nằm sau nhãn DEV, người đọc là nhân
  // viên đang chọn tài khoản thử, và hậu tố chức danh chính là thứ phân biệt bốn cô chủ
  // nhiệm với nhau (Cô Vân là "6A3 và 6A4"). Khối biến mất khi Google SSO thật bật.
  // Nếu sau này ai đó cho phụ huynh/học sinh thấy khối này thì phải đi qua personName().
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[11px] font-bold text-caption">
        <span className="rounded bg-chip px-2 py-0.5 text-[10px] font-black uppercase text-caption">DEV</span>
        Chọn tài khoản thử (thay Google SSO thật)
      </p>
      {/* MỘT Ô CHỌN thay cho một danh sách nút (02/08/2026, yêu cầu chủ đầu tư).

          Bản trước vẽ mỗi tài khoản một nút cao 56px. Chín tài khoản là hơn 500px chỉ để
          chọn một thứ — trên điện thoại phải cuộn qua hết đội ngũ giáo viên mới thấy học
          sinh, mà em học sinh lại đúng là màn người ta hay mở đầu tiên khi demo.

          Gộp theo NHÓM VAI chứ không xếp phẳng: người chọn đang tìm "một cô chủ nhiệm"
          hay "một em học sinh", không tìm một cái tên cụ thể. `optgroup` làm đúng việc
          đó, và trình đọc màn hình cũng đọc được tên nhóm. */}
      <div className="flex flex-col gap-2.5">
        <label htmlFor="tk-thu" className="sr-only">
          Chọn tài khoản thử
        </label>
        <div className="flex items-center gap-2.5 rounded-[15px] border-[1.6px] border-[#E4DFD3] bg-white px-3.5 shadow-[0_6px_16px_rgba(38,39,93,.10)]">
          <GoogleMark />
          <select
            id="tk-thu"
            value={chon}
            disabled={loading}
            onChange={(e) => setChon(e.target.value)}
            className="min-h-[52px] min-w-0 flex-1 bg-transparent text-[13.5px] font-black text-[#1B1C3A] outline-none disabled:opacity-50"
          >
            {chiaNhom(devAccounts).map((nhom) => (
              <optgroup key={nhom.ten} label={nhom.ten}>
                {nhom.tai.map((acc) => (
                  <option key={acc.authUid} value={acc.authUid}>
                    {acc.displayName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={loading || !chon}
          onClick={() => onPick(chon)}
          className="flex min-h-[48px] items-center justify-center rounded-[15px] bg-gradient-to-br from-navy to-navy-light text-[14px] font-black text-white shadow-[0_7px_16px_rgba(10,42,94,.28)] transition-[transform,box-shadow] hover:-translate-y-0.5 disabled:opacity-50"
        >
          {loading ? "Đang vào…" : "Vào Hub"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cửa bản thử (nợ #19). Ba khối dưới đây thay chỗ của StaffPanel tuỳ trạng thái cửa.
// ---------------------------------------------------------------------------

/**
 * Ô nhập mã mở khoá. Nhập MỘT lần trên mỗi máy, máy nhớ 30 ngày bằng một cookie riêng.
 *
 * Vì sao có màn này thay vì "chỉ cho localhost": người demo chính đứng ngoài trường,
 * cầm điện thoại, đi qua tên miền công khai — chặn theo địa chỉ máy là cắt đúng người
 * cần đi qua (và lại không chặn được ai, vì đường hầm làm mọi request trông như đến
 * từ chính máy chủ). Xem packages/core/auth-adapter/dev-gate.ts.
 */
function UnlockPanel({
  secret,
  setSecret,
  loading,
  onSubmit,
}: {
  secret: string;
  setSecret: (v: string) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl bg-chip/60 p-4">
      <p className="flex items-center gap-2 text-[11px] font-bold text-caption">
        <span className="rounded bg-chip px-2 py-0.5 text-[10px] font-black uppercase text-caption">DEV</span>
        Bản đang thử — cần mã mở khoá
      </p>
      {/* <label htmlFor> THẬT, không dùng placeholder làm nhãn: placeholder biến mất
          ngay khi gõ ký tự đầu (WCAG 3.3.2), và trình đọc màn hình chỉ nghe ô trống. */}
      <label htmlFor="ma-mo-khoa-ban-thu" className="text-[11.5px] font-black text-muted">
        Mã mở khoá
      </label>
      <input
        id="ma-mo-khoa-ban-thu"
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        // `current-password` để trình duyệt/điện thoại lưu hộ: người demo nhập một lần
        // trên máy này, lần sau cookie đã nhớ, còn máy mới thì trình duyệt gợi ý lại.
        autoComplete="current-password"
        className="rounded-xl border border-line px-4 py-3 text-[15px] font-bold text-navy focus:border-navy"
      />
      <button
        type="submit"
        disabled={loading || secret.length === 0}
        className="rounded-[15px] bg-gradient-to-br from-navy to-navy-light py-3.5 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.3)] disabled:opacity-50"
      >
        Mở khoá
      </button>
      <p className="text-[11px] leading-[1.5] text-caption">
        Nhập một lần, máy này nhớ 30 ngày. Chưa có mã thì hỏi nhóm kỹ thuật của trường.
      </p>
    </form>
  );
}

/** Máy chủ chưa đặt bí mật ⇒ cửa đóng với tất cả. Nói thẳng, đừng để người dùng đoán. */
function GateClosedNotice() {
  return (
    <div role="status" className="rounded-2xl border border-line bg-chip/60 p-4 text-[12px] leading-[1.55] text-muted">
      <b className="text-ink">Cửa đăng nhập thử đang đóng.</b> Máy chủ chưa được cấu hình mã mở khoá,
      nên không tài khoản thử nào dùng được — kể cả từ máy của người quản trị. Đây là trạng thái
      mặc định có chủ ý.
    </div>
  );
}

/** Khoảng chờ trong lúc hỏi trạng thái cửa. Giữ đúng chiều cao để trang không nhảy. */
function StaffPanelSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-[15px] bg-chip/70" />
      ))}
    </div>
  );
}

function GuardianPanel({
  code,
  setCode,
  loading,
  onSubmit,
}: {
  code: string;
  setCode: (v: string) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl bg-chip/60 p-4 animate-popIn">
      <div className="flex flex-col items-center gap-1">
        <Mascot pose="thumbsup" width={52} />
        <div className="text-[15px] font-black text-ink">Chào bố mẹ!</div>
        {/* "GVCN" là từ vựng vận hành — DESIGN-GUIDELINES §8 chỉ cho nó sống ở buồng lái,
            tâm lý cụm và điều hành. Bảng này là bảng dành RIÊNG cho phụ huynh, tức là đúng
            chỗ nó không được xuất hiện. Sửa 01/08/2026: nói như người ta nói. */}
        <p className="text-center text-[11.5px] text-muted">
          Mở link mời trong Zalo, hoặc nhập mã mời thầy cô chủ nhiệm đã gửi.
        </p>
      </div>
      {/* <label htmlFor> THẬT, thêm 01/08/2026. Trước đó nhãn duy nhất của ô này là
          placeholder "ABC123" — mà placeholder biến mất ngay khi bố mẹ gõ ký tự đầu tiên
          (WCAG 3.3.2 Labels or Instructions), nên đúng lúc cần đối chiếu "mình đang gõ cái
          gì vào đâu" thì không còn gì trên màn hình trả lời. Trình đọc màn hình cũng chỉ
          nghe "edit text" trống trơn. help-request-view.tsx:253 đã làm đúng cách này rồi. */}
      <label htmlFor="ma-moi-phu-huynh" className="text-center text-[11.5px] font-black text-muted">
        Mã mời 6 ký tự
      </label>
      <input
        id="ma-moi-phu-huynh"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={6}
        placeholder="ABC123"
        // KHÔNG outline-none trần: nó đè lưới an toàn :focus-visible của globals.css và
        // để lại đúng một tín hiệu focus là màu viền — thứ người mù màu không thấy.
        className="rounded-xl border border-line px-4 py-3 text-center text-[18px] font-black tracking-[0.3em] text-navy focus:border-navy"
      />
      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="rounded-[15px] bg-gradient-to-br from-navy to-navy-light py-3.5 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.3)] disabled:opacity-50"
      >
        Xác nhận mã mời
      </button>
      <p className="text-center text-[11px] text-caption">
        Thất lạc mã? <b className="text-navy">Nhắn thầy cô chủ nhiệm</b>
      </p>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" className="flex-none">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
