// Đăng nhập — bản ĐIỆN ẢNH, dựng theo TRẠNG THÁI CUỐI của `#s-login` trong bản thiết kế
// (apps/hub/public/trinh-dien/index.html, dự án Claude Design "School data hub app").
//
// ═══════════════════════════════════════════════════════════════════════════════
// "TRẠNG THÁI CUỐI" — bài học đắt nhất của màn này
// ═══════════════════════════════════════════════════════════════════════════════
// File thiết kế có NĂM khối CSS viết sau (dòng ~945–989) ghi đè khối đầu: không @media,
// cùng specificity, luật sau thắng. Ba lượt liền tôi (và cả bài test đối chiếu) chỉ đọc
// khối ĐẦU — tức dựng theo bản nháp mà chính người thiết kế đã thay thế. Ba máy soát độc
// lập (workflow 24/08/2026) tìm ra chuyện đó.
//
// Bản cuối là MỘT PANEL: rộng 392px, căn giữa dọc bên phải, viền vàng gradient vẽ bằng
// lớp nền + lớp trong inset 1,5px, cắt góc 26px trên-phải/dưới-trái, nền trong hai radial
// sáng + lưới cyan 46px + gradient tối, bệ đỡ lệch 13px/17px, dập dềnh `panelFloat` 7s,
// vệt sáng `panelSheen` 5,4s. Chữ 33px. Nút xếp CỘT: Google 56px trên, Zalo 52px dưới,
// cả hai bo 10px và rộng 100%. KHÔNG còn khối chữ 72px góc phải dưới — đó là bản nháp.
//
// Danh sách tài khoản thử là MỘT Ô CHỌN (lệnh chủ đầu tư 24/08/2026: "thành 1 dropdown")
// đặt trong khuôn tách dòng của `.devrow` cuối. Phần chức năng thật (cửa mở khoá nợ #19,
// mã mời phụ huynh, trạng thái lỗi) không có trong thiết kế — đứng dưới các hàng chuẩn,
// cùng khuôn kẻ trên để không phá hình panel.
//
// `tests/unit/login-khop-thiet-ke.test.ts` đọc file thiết kế theo CASCADE (giá trị CUỐI
// của mỗi thuộc tính) và so với đây. Sửa màn này thì chạy bài đó trước tiên.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "./mascot";
import { CO_INTRO } from "./intro-cinematic";
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

  /**
   * Tài khoản đang chọn trong ô chọn — nút Google đăng nhập bằng tài khoản này.
   *
   * State sống Ở ĐÂY chứ không trong một panel con: nút Google (trong `.cin-cta`) và ô
   * chọn (trong vùng DEV) là hai thành phần anh em cách nhau một tầng, cùng đọc một giá
   * trị — giá trị đó thuộc về cha chung.
   *
   * Mặc định chọn một em học sinh, không phải cô giáo đứng đầu danh sách: màn đầu tiên
   * người ta muốn xem khi demo gần như luôn là màn của trẻ.
   */
  const [chon, setChon] = useState(
    () => devAccounts.find((a) => a.audience === "student")?.authUid ?? devAccounts[0]?.authUid ?? "",
  );
  useEffect(() => {
    // Sau khi mở khoá cửa, `router.refresh()` mang danh sách tài khoản về qua props —
    // nhưng initializer của useState không chạy lại. Không có effect này thì cửa mở ra
    // một ô chọn không giá trị, và nút Google bị disabled không lý do.
    if (!chon && devAccounts.length > 0) {
      setChon(devAccounts.find((a) => a.audience === "student")?.authUid ?? devAccounts[0]!.authUid);
    }
  }, [devAccounts, chon]);

  useEffect(() => {
    // TẢI TRƯỚC VIDEO INTRO trong lúc người dùng còn đứng ở màn đăng nhập (24/08/2026,
    // chủ đầu tư: "ấn đăng nhập xong load video lâu cực kì" — ba lần, và họ đúng).
    //
    // Intro chỉ được IntroCinematic đụng tới SAU cú bấm đăng nhập + một lần nạp trang,
    // tức 3,4 MB bắt đầu tải đúng lúc người dùng đang nhìn màn đen chặn. Đã đo mô hình
    // cache trước khi chọn cách này: Next trả `max-age=0 + ETag` (lần hai = 304, không
    // tốn byte), Cloudflare `max-age=14400` — nên tải trước ở đây là sang trang chủ
    // trình duyệt lấy từ cache, gần như tức thì.
    //
    // Chỉ tải BẢN ĐÚNG CODEC — cùng phép chọn mà thẻ <video> sẽ làm; tải cả hai là phí
    // gấp đôi băng thông cho một file không bao giờ phát. Lùi 1,2s để nhường những giây
    // đầu cho video nền của chính màn này (poster đã che nên không ai thấy khoảng lùi).
    const t = window.setTimeout(() => {
      try {
        const co = document.createElement("video").canPlayType('video/mp4; codecs="av01.0.08M.08"');
        const file = co ? "/trinh-dien/uploads/intro-av1.mp4" : "/trinh-dien/uploads/intro-software.mp4";
        // Hỏng thì thôi — đây là tối ưu, không phải điều kiện: IntroCinematic có trần
        // chờ 2,5s và tự bỏ intro khi mạng không kịp.
        void fetch(file, { cache: "force-cache" }).catch(() => {});
      } catch {
        // canPlayType/fetch không có (môi trường lạ): bỏ qua, không chặn đăng nhập.
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

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
    // Đặt cờ intro NGAY TRƯỚC khi nạp trang. `sessionStorage` sống sót qua hard navigation
    // (cùng tab, cùng origin) và chết theo tab — xem khối lý lẽ ở `intro-cinematic.tsx`.
    //
    // CHỈ khi đích là trang chủ. `?then=` hợp lệ có thể là `/oidc/interaction/<uid>` —
    // người dùng đang giữa một luồng đăng nhập của app khác, chen một đoạn phim toàn màn
    // vào đó là chặn đúng việc họ đang làm.
    try {
      if (target === "/home") sessionStorage.setItem(CO_INTRO, "1");
    } catch {
      // Chế độ riêng tư chặn sessionStorage: bỏ intro, không chặn đăng nhập.
    }
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
    // Khung tràn viền, panel CĂN GIỮA DỌC bên phải như thiết kế, nhưng mép phải 84px
    // thay vì 64px — chủ đầu tư 24/08/2026 chỉnh hai lượt: "dời qua trái" rồi "thêm 20px
    // so với cũ thôi chứ ko qua trái hẳn". 64+20=84, chỉ nhích, không đổi phía. Căn bằng
    // flexbox thay vì absolute để khi các bảng phụ (mã mời, mở khoá) bung ra làm panel
    // cao hơn màn, trang còn cuộn được.
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#04102A] p-4 md:h-screen md:justify-end md:p-0 md:pr-[84px]">
      {/* NỀN VIDEO — `.cin-bg` + `.cin-shade`, ở MỌI khổ màn. Dùng lại file đã tối ưu
          cho bản trình diễn; `aria-hidden` + `pointer-events-none`: trang trí thuần. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <video
          className="h-full w-full object-cover [filter:brightness(1.18)_saturate(1.08)]"
          poster="/trinh-dien/uploads/su-tu-poster.webp"
          preload="auto"
          loop
          muted
          playsInline
          autoPlay
        >
          <source src="/trinh-dien/uploads/su-tu-av1.mp4" type='video/mp4; codecs="av01.0.08M.08"' />
          <source src="/trinh-dien/uploads/su-tu-chay.mp4" type="video/mp4" />
        </video>
        {/* `.cin-shade` — NĂM lớp gradient chép nguyên: tối bốn góc, chừa sáng giữa. */}
        <div className="absolute inset-0 bg-[radial-gradient(620px_470px_at_104%_106%,rgba(4,13,32,.88),rgba(4,13,32,.45)_46%,transparent_74%),radial-gradient(640px_460px_at_-6%_-8%,rgba(4,13,32,.66),rgba(4,13,32,.32)_42%,transparent_78%),radial-gradient(700px_520px_at_-6%_108%,rgba(4,13,32,.64),rgba(4,13,32,.3)_42%,transparent_78%),linear-gradient(270deg,rgba(4,13,32,.88)_0%,rgba(4,13,32,.5)_9%,rgba(4,13,32,0)_20%),linear-gradient(292deg,rgba(4,13,32,.84)_0%,rgba(4,13,32,.68)_30%,rgba(4,13,32,.34)_52%,rgba(4,13,32,0)_68%)]" />
      </div>

      {/* DẤU THƯƠNG HIỆU — `.cin-brand`, góc trái trên. aria-hidden: tên đã có trong h1. */}
      <div aria-hidden className="absolute left-6 top-5 z-[8] flex items-center gap-3 md:left-10 md:top-[26px]">
        <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-white shadow-[0_10px_26px_rgba(2,10,30,.5)]">
          <img src="/logo.webp?v=ddafa976" alt="" className="h-9 w-9 rounded-[9px] object-cover" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[16px] font-black text-white">School Hub</span>
          <span className="text-[9px] font-extrabold tracking-[.22em] text-[#FFE3A6]">TRƯỜNG VIỆT ANH</span>
        </span>
      </div>

      {/* PANEL — `.cin-main` TRẠNG THÁI CUỐI. Ba lớp đúng kỹ thuật gốc:
            · lớp NGOÀI: nền gradient VÀNG = chính là viền 1,5px; cắt góc 26px; bệ đỡ
              lệch 13px/17px + bóng sâu + aura vàng; dập dềnh panelFloat 7s;
            · lớp TRONG (::before gốc): inset 1,5px, cắt góc 25px, hai radial sáng + LƯỚI
              CYAN 46px + gradient tối, blur 10px;
            · lớp SHEEN (::after gốc): vệt sáng 115deg quét panelSheen 5,4s.
          MainContent (id="noi-dung") bọc panel — KHÔNG truyền focus:outline-none vì
          page-shell đã tự thêm; truyền lại là class lặp đôi trong HTML (máy soát bắt được). */}
      <MainContent className="relative z-[8] w-full max-w-[392px]">
        <div className="relative flex w-full flex-col bg-[linear-gradient(160deg,rgba(255,198,41,.95),rgba(255,198,41,.4)_45%,rgba(255,198,41,.85))] [clip-path:polygon(0_0,calc(100%-26px)_0,100%_26px,100%_100%,26px_100%,0_calc(100%-26px))] [filter:drop-shadow(13px_17px_0_rgba(6,16,38,.5))_drop-shadow(0_26px_40px_rgba(2,8,22,.6))_drop-shadow(0_0_24px_rgba(255,198,41,.16))] motion-safe:animate-[panelFloat_7s_ease-in-out_infinite]">
          <div
            aria-hidden
            className="absolute inset-[1.5px] z-0 bg-[radial-gradient(120%_90%_at_12%_0%,rgba(94,150,230,.3),transparent_52%),radial-gradient(95%_75%_at_100%_100%,rgba(255,198,41,.15),transparent_56%),linear-gradient(rgba(53,224,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(53,224,255,.055)_1px,transparent_1px),linear-gradient(160deg,rgba(8,20,46,.94),rgba(4,12,30,.88))] bg-[length:auto,auto,100%_46px,46px_100%,auto] backdrop-blur-[10px] [clip-path:polygon(0_0,calc(100%-25px)_0,100%_25px,100%_100%,25px_100%,0_calc(100%-25px))]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[1.5px] z-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,.1)_46%,rgba(53,224,255,.12)_51%,transparent_67%)] bg-[length:260%_100%] [clip-path:polygon(0_0,calc(100%-25px)_0,100%_25px,100%_100%,25px_100%,0_calc(100%-25px))] motion-safe:animate-[panelSheen_5.4s_ease-in-out_infinite]"
          />

          {/* Cột nội dung — padding 32/28/24 và gap 13px của `.cin-main` cuối; căn TRÁI
              (bản nháp căn phải đã bị thiết kế bỏ). */}
          <div className="relative z-[1] flex flex-col gap-[13px] px-7 pb-6 pt-8 text-left">
            {/* `.cin-kicker` — chấm vàng thở theo glowPulse 2,2s (opacity + scale, chép
                keyframes gốc; animate-pulse của Tailwind thiếu nhịp scale). */}
            <div className="inline-flex items-center gap-[9px] font-mono text-[11px] font-extrabold tracking-[.24em] text-gold">
              <span aria-hidden className="h-2 w-2 rounded-full bg-gold shadow-[0_0_14px_#FFC629] motion-safe:animate-[glowPulse_2.2s_ease-in-out_infinite]" />
              VIET ANH EDUCATION · v0.1
            </div>

            {/* `.cin-h1` CUỐI: 33px (bản nháp 72px đã bị ghi đè hai lần), lh 1.1,
                ls -.02em, bóng 0 12px 40px; <em> vàng + quầng sáng 32px + nowrap. */}
            <h1 className="text-[33px] font-black leading-[1.1] tracking-[-.02em] text-white [text-shadow:0_12px_40px_rgba(0,0,0,.65)]">
              Viet Anh
              <br />
              <em className="whitespace-nowrap not-italic text-gold [text-shadow:0_0_32px_rgba(255,198,41,.55)]">School Hub</em>
            </h1>

            {error && (
              <div role="alert" className="flex items-start gap-[9px] rounded-lg border border-[#5A2126] bg-[#351216] p-[11px_13px] animate-popIn">
                {/* aria-hidden: tên icon là chữ thật trong DOM; role="alert" đã nói đủ. */}
                <span className="msr flex-none text-[19px] text-[#FF8A8F]" aria-hidden>
                  error
                </span>
                <span className="text-[12.5px] font-bold leading-[1.45] text-[#FF8A8F]">{error}</span>
              </div>
            )}

            {/* `.cin-cta` CUỐI: CỘT, stretch, gap 10px, margin-top 12px — Google TRÊN
                (56px, bo 10px, 100%), Zalo DƯỚI (52px, bo 10px, 100%). Bản nháp
                row-reverse đã bị thiết kế bỏ. */}
            <div className="mt-[12px] flex flex-col items-stretch gap-[10px]">
              {gate === "open" && (
                // `.sso` — ba lớp bóng trong MỘT box-shadow (bóng sâu · viền vàng 1,5px ·
                // quầng vàng 42px): viền vẽ bằng shadow để không cộng 3px vào kích thước.
                <button
                  type="button"
                  disabled={loading || !chon}
                  onClick={() => loginDev(chon)}
                  className="flex h-14 w-full items-center justify-center gap-[10px] whitespace-nowrap rounded-[10px] bg-white px-[26px] text-[15.5px] font-black text-[#1B1C3A] shadow-[0_20px_50px_rgba(2,8,22,.55),0_0_0_1.5px_rgba(255,198,41,.65),0_0_42px_rgba(255,198,41,.3)] transition-transform hover:-translate-y-[3px] disabled:opacity-50"
                >
                  <GoogleMark />
                  {loading ? "Đang vào…" : "Đăng nhập với Google"}
                  {/* Mũi tên hổ phách `.sso .arr` — #F5A300, 18px. */}
                  <span aria-hidden className="msr text-[18px] text-gold-dark">
                    arrow_forward
                  </span>
                </button>
              )}
              {gate === "unknown" && (
                <div aria-hidden className="h-14 w-full animate-pulse rounded-[10px] bg-white/15" />
              )}

              {/* `.zalo-ghost` cuối: 52px, bo 10px, 100%, nền kính 10% viền 35% — KHÔNG
                  backdrop-blur riêng: lớp trong của panel đã blur, chồng thêm là trả giá
                  hiệu năng cho một hiệu ứng không nhìn thấy. */}
              <button
                type="button"
                onClick={() => setGuardianOpen((v) => !v)}
                className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] border-[1.5px] border-white/35 bg-white/10 text-[14px] font-black text-white transition-transform hover:-translate-y-0.5 active:scale-[.985]"
              >
                {/* aria-hidden: nếu không, nút đọc thành "chat_bubble Phụ huynh · Zalo". */}
                <span className="msr text-[19px]" aria-hidden>
                  chat_bubble
                </span>
                Phụ huynh · Zalo
              </button>
            </div>

            {/* VÙNG DEV — khuôn tách dòng của `.devrow` cuối (kẻ trên rgba(199,216,240,.22),
                tiêu đề mono 9px giãn .2em), nhưng ruột là MỘT Ô CHỌN thay cho lưới chip:
                lệnh chủ đầu tư 24/08/2026 — *"thành 1 dropdown"*. Bản thiết kế vẽ 2 chip
                vào-nhanh; kho thật có 13 tài khoản, chip thành bức tường và chủ đầu tư đã
                thấy đúng bức tường đó. `optgroup` theo chiaNhom — có bộ test riêng.

                GHI RA ĐỂ KHÔNG AI TƯỞNG LÀ ĐÃ SẠCH (01/08/2026): HTML thật của /login vẫn
                chứa "Cô Lan (chủ nhiệm 6A1)" — nó đến từ `full_name` của bảng tài khoản
                thử (dev-provider.ts), không từ file này. Cố ý giữ: người đọc là nhân viên
                đang chọn tài khoản thử, hậu tố chức danh chính là thứ phân biệt bốn cô chủ
                nhiệm. Khối biến mất khi Google SSO thật bật. */}
            {gate === "open" && devAccounts.length > 0 && (
              <div className="mt-[2px] border-t border-[rgba(199,216,240,.22)] pt-[14px]">
                <label
                  htmlFor="tk-thu"
                  className="block font-mono text-[9px] font-extrabold tracking-[.2em] text-[rgba(199,216,240,.75)]"
                >
                  DEV · CHỌN TÀI KHOẢN THỬ (THAY GOOGLE SSO THẬT)
                </label>
                {/* Ô chọn + nút VÀO đứng CẠNH NHAU — chủ đầu tư 24/08/2026: "chọn tài
                    khoản mà không cho nút đăng nhập thì chọn xong vào kiểu gì". Nút đăng
                    nhập thật (Google) đứng TRÊN và mang tên khác, không ai tự nối "chọn ở
                    dưới" với "bấm nút trên". KHÔNG đăng nhập ngay khi đổi lựa chọn: người
                    dùng bàn phím duyệt option bằng mũi tên sẽ bị bắn vào app giữa chừng. */}
                <div className="mt-2 flex gap-2">
                  <select
                    id="tk-thu"
                    value={chon}
                    disabled={loading}
                    onChange={(e) => setChon(e.target.value)}
                    className="min-w-0 flex-1 rounded-[8px] border border-[rgba(127,208,255,.4)] bg-[rgba(13,38,80,.85)] px-3 py-[11px] text-[12.5px] font-extrabold text-ink focus:border-gold disabled:opacity-50"
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
                  <button
                    type="button"
                    disabled={loading || !chon}
                    onClick={() => loginDev(chon)}
                    className="flex flex-none items-center gap-1.5 rounded-[8px] bg-gradient-to-br from-gold to-gold-dark px-4 text-[12.5px] font-black text-navy transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {loading ? "Đang vào…" : "Vào Hub"}
                    <span aria-hidden className="msr text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            )}

            {/* Ba bảng chức năng thật — không có trong thiết kế, đứng dưới các hàng chuẩn,
                cùng khuôn tách dòng để không phá hình panel. */}
            {gate === "locked" && (
              <UnlockPanel secret={secret} setSecret={setSecret} loading={loading} onSubmit={unlockGate} />
            )}
            {gate === "misconfigured" && <GateClosedNotice />}
            {guardianOpen && <GuardianPanel code={code} setCode={setCode} loading={loading} onSubmit={redeemCode} />}

            {/* Đường hỗ trợ CÓ THẬT duy nhất khi chưa đăng nhập (link "Quyền riêng tư" rỗng
                đã gỡ 31/07/2026). Hàng chức năng thêm vào cuối panel, cùng khuôn kẻ trên. */}
            <p className="border-t border-[rgba(199,216,240,.22)] pt-3 text-[10.5px] font-bold leading-[1.5] text-[#93A9C8]">
              Tài khoản do Trường Việt Anh cấp · Cần hỗ trợ, nhắn giáo viên chủ nhiệm.
            </p>
          </div>
        </div>
      </MainContent>
    </div>
  );
}

/**
 * Nhóm cho ô chọn tài khoản. Hai luật, cả hai đều học từ lỗi đo được 02/08/2026:
 *
 *   1. KHỚP TRƯỚC ĂN TRƯỚC — mỗi tài khoản vào ĐÚNG một nhóm. Bản đầu để mỗi nhóm tự
 *      lọc cả danh sách, nên "Phụ huynh của Minh" (audience `student`, tên có chữ "phụ
 *      huynh") hiện HAI LẦN.
 *   2. CÓ NHÓM VÉT — tài khoản không khớp luật nào rơi vào "Vai khác". Không có nó thì
 *      thêm một vai mới mà quên sửa file này sẽ làm tài khoản đó BIẾN MẤT khỏi màn:
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

// ---------------------------------------------------------------------------
// Cửa bản thử (nợ #19). Các bảng dưới đây hiện DƯỚI các hàng chuẩn của panel tuỳ
// trạng thái cửa — chúng là phần chức năng thật, không có trong bản thiết kế, nên
// mang cùng khuôn kẻ-trên của vùng DEV để không phá hình.
//
// Ô NHẬP có nền và viền TƯỜNG MINH (#0B1B38 / #5B7BAB = 3,96:1, trên chuẩn 3:1 cho
// thành phần phi văn bản): máy soát 24/08 đo ra input trong suốt nằm trên lớp kính
// thì viền token `line` #1E3A6B chỉ đạt 1,25–1,67:1 tuỳ khung video phía sau — một ô
// nhập không nhìn thấy ranh giới.
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
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 border-t border-[rgba(199,216,240,.22)] pt-[14px] text-left">
      <p className="flex items-center gap-2 text-[11px] font-bold text-caption">
        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase text-caption">DEV</span>
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
        className="rounded-[10px] border border-[#5B7BAB] bg-[#0B1B38] px-4 py-3 text-[15px] font-bold text-ink focus:border-gold"
      />
      <button
        type="submit"
        disabled={loading || secret.length === 0}
        className="rounded-[10px] bg-gradient-to-br from-navy to-navy-light py-3.5 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.3)] disabled:opacity-50"
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
    <div
      role="status"
      className="w-full border-t border-[rgba(199,216,240,.22)] pt-[14px] text-left text-[12px] leading-[1.55] text-muted"
    >
      <b className="text-ink">Cửa đăng nhập thử đang đóng.</b> Máy chủ chưa được cấu hình mã mở khoá,
      nên không tài khoản thử nào dùng được — kể cả từ máy của người quản trị. Đây là trạng thái
      mặc định có chủ ý.
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
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-3 border-t border-[rgba(199,216,240,.22)] pt-[14px] text-left animate-popIn"
    >
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
          nghe "edit text" trống trơn. help-request-view.tsx đã làm đúng cách này rồi. */}
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
        className="rounded-[10px] border border-[#5B7BAB] bg-[#0B1B38] px-4 py-3 text-center text-[18px] font-black tracking-[0.3em] text-ink focus:border-gold"
      />
      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="rounded-[10px] bg-gradient-to-br from-navy to-navy-light py-3.5 text-[14px] font-black text-white shadow-[0_9px_22px_rgba(10,42,94,.3)] disabled:opacity-50"
      >
        Xác nhận mã mời
      </button>
      <p className="text-center text-[11px] text-caption">
        Thất lạc mã? <b className="text-cardtitle">Nhắn thầy cô chủ nhiệm</b>
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
