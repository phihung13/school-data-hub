// apps/hub/components/quan-tri/huong-dan-tich-hop.tsx — BẢN ĐẤU NỐI SINH TỪ CHÍNH DÒNG DỮ LIỆU.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO KHÔNG PHẢI MỘT TRANG TÀI LIỆU
// ═══════════════════════════════════════════════════════════════════════════════
// Chủ đầu tư yêu cầu (07/08/2026): "trên đây nhớ ghi cho 1 cái quy trình chuẩn cho các app
// khác code lại phần sso, để ở đây điền 1 phát là app kia nhúng được vào".
//
// Cách hiển nhiên là viết một trang hướng dẫn. Không làm, vì một trang hướng dẫn viết tay
// sẽ nói `client_id: ten-app-cua-ban` và người đọc phải tự thay — rồi họ thay sai, hoặc
// quên mất Hub tự thêm `/embed/relay`, hoặc chép một `issuer` trỏ về `localhost:3000` vì
// người quản trị hôm đó mở màn bằng cửa đó. Mỗi chỗ tự thay là một chỗ hỏng câm.
//
// Ở đây mọi giá trị SINH RA từ đúng dòng trong sổ đăng ký + `hubUrl` do MÁY CHỦ khai. Chép
// một phát là đúng, và nếu quản trị đổi cấu hình thì bản hướng dẫn đổi theo cùng lúc — không
// có bản thứ hai để lạc hậu.
//
// ═══════════════════════════════════════════════════════════════════════════════
// BA THỨ BẢN NÀY CỐ Ý NÓI RA DÙ KHÔNG ĐẸP
// ═══════════════════════════════════════════════════════════════════════════════
//  1. Giá trị secret KHÔNG có ở đây, kể cả cho quản trị. Sổ chỉ giữ TÊN biến (0052, 0055).
//     Bản hướng dẫn nói rõ "hỏi người vận hành" thay vì để một ô trống trông như lỗi.
//  2. Loại sự kiện chưa có luật ánh xạ VẪN vào được kho — nhưng vào `ops.embedded_app_events`
//     dưới dạng JSON thô, không thành hàng nghiệp vụ. Không nói ra thì đội làm app tưởng
//     mình vừa đổ được điểm danh vào Hub.
//  3. App phải TỰ cho Hub nhúng (`frame-ancestors`). Hub allowlist phía mình rồi, nhưng nếu
//     app gửi `X-Frame-Options: DENY` thì khung vẫn trắng — và đó là ca người ta đi tìm lỗi
//     ở phía Hub suốt buổi chiều.
"use client";

import { useState, type ReactNode } from "react";
import type { MiniAppRow } from "@hub/core/contracts";
import { HopThoai } from "../ui/hop-thoai";

// ---------------------------------------------------------------------------
// Ô giá trị chép được
// ---------------------------------------------------------------------------

function NutChep({ giaTri, nhan }: { giaTri: string; nhan: string }) {
  const [xong, setXong] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Chép ${nhan}`}
      onClick={() => {
        void navigator.clipboard?.writeText(giaTri).then(() => {
          setXong(true);
          setTimeout(() => setXong(false), 1600);
        });
      }}
      // `min-h-[44px]`, KHÔNG `h-9`. Đo trên bản đang chạy ở 375px hôm 07/08/2026: bản đầu
      // dùng `h-9` = 36px, và bản đấu nối của Factory có 19 nút chép — tức 19 lần vi phạm
      // §11 trên một màn hình. Đây đúng là nút người ta bấm bằng ngón cái trên điện thoại
      // trong lúc đọc cho đội làm app nghe.
      className="flex min-h-[44px] flex-none items-center gap-1 rounded-lg bg-chip px-2.5 text-[11px] font-black text-navy"
    >
      <span className="msr text-[15px]" aria-hidden>
        {xong ? "check" : "content_copy"}
      </span>
      {/* Chữ "Đã chép" là PHẢN HỒI cho một thao tác, không phải chữ giải thích: điều 22 của
          hiến pháp UI đòi mọi hành động có phản hồi, và một cái icon đổi hình thì người dùng
          trình đọc màn hình không nghe thấy. `aria-live` để nó được đọc lên. */}
      <span aria-live="polite">{xong ? "Đã chép" : "Chép"}</span>
    </button>
  );
}

function Dong({ nhan, giaTri, ghiChu }: { nhan: string; giaTri: string; ghiChu?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-b-0">
      <div className="w-full text-[10.5px] font-black uppercase tracking-wide text-muted sm:w-[168px] sm:flex-none">
        {nhan}
      </div>
      <code className="min-w-0 flex-1 break-all font-mono text-[12px] font-semibold text-ink">{giaTri}</code>
      <NutChep giaTri={giaTri} nhan={nhan} />
      {ghiChu && <div className="w-full text-[11.5px] font-semibold text-muted2 sm:pl-[176px]">{ghiChu}</div>}
    </div>
  );
}

function Khoi({ tieuDe, children }: { tieuDe: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      {/* <h3>: mỗi khối là một mục con của <h2> tiêu đề hộp thoại. */}
      <h3 className="text-[13px] font-black text-navy">{tieuDe}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function ChuaXong({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 rounded-xl bg-surface-warnSoft px-3 py-2 text-[12px] font-bold text-gold-textDark">
      <span className="msr mt-px flex-none text-[16px]" aria-hidden>
        error
      </span>
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Bản đấu nối của MỘT app
// ---------------------------------------------------------------------------

export function HuongDanTichHop({ app, hubUrl, onDong }: { app: MiniAppRow; hubUrl: string; onDong: () => void }) {
  const uriCauNoi = `${hubUrl}/embed/relay`;

  // Hai biến app này cần, kèm TRẠNG THÁI THẬT trên máy chủ đang phục vụ. `daCapSecret` và
  // `daCapSsoSecret` do máy chủ tính — màn hình không đọc được `process.env`, nên nếu dựng
  // lại phép kiểm này ở client thì nó chỉ là phỏng đoán.
  const bienMoiTruong = [
    app.webhookSecretEnv
      ? { ten: app.webhookSecretEnv, viec: "Gửi dữ liệu về", daCo: app.daCapSecret }
      : null,
    app.ssoEnabled && app.ssoClientSecretEnv
      ? { ten: app.ssoClientSecretEnv, viec: "Đăng nhập Hub", daCo: app.daCapSsoSecret }
      : null,
  ].filter((b): b is { ten: string; viec: string; daCo: boolean } => b !== null);

  return (
    <HopThoai
      tieuDe={`Đấu nối — ${app.displayName}`}
      moTa="Mọi giá trị sinh từ dòng trong sổ. Chép thẳng cho đội làm app."
      rong="max-w-[760px]"
      onDong={onDong}
    >
      {/* ── Nhúng ─────────────────────────────────────────────────────────── */}
      <Khoi tieuDe="Nhúng vào Hub">
        {app.origin && app.iframeUrl ? (
          <>
            <Dong nhan="Người dùng mở" giaTri={`${hubUrl}/embed/${app.appId}`} />
            <Dong nhan="Hub nạp iframe từ" giaTri={app.iframeUrl} />
            <Dong
              nhan="App phải gửi header"
              giaTri={`Content-Security-Policy: frame-ancestors ${hubUrl}`}
              ghiChu="Và KHÔNG gửi X-Frame-Options: DENY — Hub đã allowlist phía mình, nhưng app tự chặn thì khung vẫn trắng."
            />
          </>
        ) : (
          <p className="py-2 text-[12px] font-semibold text-caption">
            App không khai origin — chỉ đi đường webhook, không có UI nhúng.
          </p>
        )}
      </Khoi>

      {/* ── SSO ───────────────────────────────────────────────────────────── */}
      <Khoi tieuDe="Đăng nhập bằng tài khoản Hub (OIDC)">
        {app.ssoEnabled ? (
          <>
            <Dong nhan="issuer" giaTri={hubUrl} />
            <Dong nhan="Bản khai (discovery)" giaTri={`${hubUrl}/.well-known/openid-configuration`} />
            <Dong nhan="client_id" giaTri={app.appId} />
            <Dong
              nhan="client_secret"
              giaTri={app.ssoClientSecretEnv ?? "(chưa khai tên biến)"}
              ghiChu="Đây là TÊN biến trên máy chủ Hub, không phải giá trị. Xin giá trị từ người vận hành — sổ đăng ký không giữ nó."
            />
            <Dong
              nhan="Cách gửi secret"
              giaTri="client_secret_basic"
              ghiChu="Hub chỉ quảng cáo đúng một cách. Gửi kiểu client_secret_post sẽ chạy được ở bản thư viện nào đó rồi gãy im lặng vào ngày xoay khoá."
            />
            <Dong nhan="PKCE" giaTri="S256 — bắt buộc" />
            <Dong
              nhan="scope"
              giaTri={app.ssoScopes.join(" ")}
              ghiChu="Xin ngoài danh sách này sẽ nhận invalid_scope. Cần thêm thì tích ở form Sửa cấu hình — không cần deploy."
            />
            <Dong nhan="redirect_uri" giaTri={app.ssoRedirectUris.join("\n") || "(chưa khai)"} />
            {app.origin && (
              <Dong
                nhan="redirect_uri (Hub tự thêm)"
                giaTri={uriCauNoi}
                ghiChu="Cầu nối cho khung nhúng — thuộc về Hub, app không phải khai và không phải đón."
              />
            )}
            {app.ssoBackchannelLogoutUri && (
              <Dong
                nhan="backchannel_logout_uri"
                giaTri={app.ssoBackchannelLogoutUri}
                ghiChu="Hub POST logout_token tới đây khi người dùng thoát Hub. App phải kiểm chữ ký bằng JWKS ở bản khai trên."
              />
            )}
            {!app.daCapSsoSecret && app.ssoClientSecretEnv && (
              <ChuaXong>
                <span className="font-mono">{app.ssoClientSecretEnv}</span> chưa đặt trên máy chủ — mọi lượt đăng nhập
                nhận <span className="font-mono">invalid_client</span>.
              </ChuaXong>
            )}
            {!app.enabled && <ChuaXong>App đang TẮT — đăng nhập bị cắt cùng với nhúng và webhook.</ChuaXong>}
          </>
        ) : (
          <p className="py-2 text-[12px] font-semibold text-caption">
            Chưa bật SSO. Bật ở form <b>Sửa cấu hình</b> — cần redirect_uri và tên biến secret.
          </p>
        )}
      </Khoi>

      {/* ── Webhook ───────────────────────────────────────────────────────── */}
      <Khoi tieuDe="Gửi dữ liệu về Hub">
        <Dong nhan="POST" giaTri={`${hubUrl}/api/embed/webhook`} />
        <Dong nhan="Header" giaTri={`x-embed-app: ${app.appId}`} />
        <Dong
          nhan="Header"
          giaTri={`x-embed-secret: <giá trị ${app.webhookSecretEnv ?? "(chưa khai tên biến)"}>`}
          ghiChu="Cũng là tên biến trên máy chủ Hub, không phải giá trị."
        />
        <Dong
          nhan="Thân JSON"
          giaTri={'{ "external_id": "…", "event_type": "…", "actor_user_id": "…", "payload": { } }'}
          ghiChu="external_id là mã của app — gửi lại cùng mã thì Hub giữ nguyên bản đầu, không sinh bản thứ hai."
        />
        <Dong
          nhan="Loại sự kiện được nhận"
          giaTri={
            app.allowedEventTypes.includes("*")
              ? "* (mọi loại)"
              : app.allowedEventTypes.join(", ") || "(chưa khai loại nào — webhook từ chối mọi sự kiện)"
          }
        />
        {/* Điểm 2 của khối chú thích đầu file. Đây là câu dễ hiểu nhầm nhất trong cả bản. */}
        <p className="mt-2 rounded-xl bg-surface-infoSoft px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-cardtitle2">
          Mọi loại sự kiện đều vào kho, nhưng chỉ <span className="font-mono">dear_log</span> có luật ánh xạ thành dữ
          liệu nghiệp vụ. Loại khác nằm ở <span className="font-mono">ops.embedded_app_events</span> dưới dạng JSON thô
          — đọc được, thống kê được, nhưng không tự thành khoá học hay buổi điểm danh. Thêm luật ánh xạ là một
          migration, không phải một ô trên màn này.
        </p>
      </Khoi>

      {/* ── Biến môi trường ───────────────────────────────────────────────── */}
      {/* NÓI RÕ CÁI NÀO ĐÃ ĐẶT, CÁI NÀO CHƯA (sửa 08/08/2026).

          Bản trước in cả hai dòng `<TÊN BIẾN>=<sinh ngẫu nhiên 32 byte>` VÔ ĐIỀU KIỆN — kể
          cả khi biến đã đặt xong từ lâu. Chủ đầu tư đọc bản đấu nối của Factory rồi hỏi
          thẳng: *"thế giờ cài không?"* — trong khi cả hai biến của Factory đã có, và thẻ app
          ngay bên cạnh đang hiện "Sẵn sàng — không còn việc nào".

          Một màn hình bảo người ta đi làm việc đã làm rồi thì tệ hơn một màn hình im lặng:
          nó dạy người dùng rằng hướng dẫn ở đây không đáng tin, và lần sau họ sẽ bỏ qua cả
          những dòng thật sự cần làm. `daCapSecret`/`daCapSsoSecret` là câu trả lời do MÁY
          CHỦ tính (nó là bên duy nhất đọc được `process.env`) — sẵn có, chỉ là chưa dùng. */}
      <Khoi tieuDe="Biến môi trường trên máy chủ Hub">
        {bienMoiTruong.length === 0 ? (
          <p className="py-2 text-[12px] font-semibold text-caption">
            App chưa khai biến nào — không có gì phải đặt.
          </p>
        ) : (
          <>
            {bienMoiTruong.map((b) => (
              <Dong
                key={b.ten}
                nhan={b.viec}
                giaTri={b.daCo ? b.ten : `${b.ten}=<sinh ngẫu nhiên 32 byte>`}
                ghiChu={
                  b.daCo ? (
                    <span className="flex items-center gap-1 font-bold text-successText">
                      <span className="msr text-[15px]" aria-hidden>
                        check_circle
                      </span>
                      Đã đặt trên máy chủ này — không phải làm gì
                    </span>
                  ) : (
                    <span className="font-bold text-dangerText">
                      CHƯA đặt — thêm vào apps/hub/.env.local rồi khởi động lại Hub
                    </span>
                  )
                }
              />
            ))}
            {bienMoiTruong.every((b) => b.daCo) && (
              <p className="mt-2 rounded-xl bg-surface-success px-3 py-2 text-[12px] font-bold text-successText">
                Không còn bước nào chạm vào máy chủ. Việc còn lại là đội làm app viết mã theo
                bản này.
              </p>
            )}
          </>
        )}
      </Khoi>
    </HopThoai>
  );
}

// ---------------------------------------------------------------------------
// Quy trình chuẩn — bản chung, không gắn app nào
// ---------------------------------------------------------------------------

const BUOC: { ten: string; noi: string; chi: ReactNode }[] = [
  {
    ten: "Khai app trong sổ",
    noi: "Quản trị · màn này",
    chi: (
      <>
        Mã app, rổ dữ liệu, người chịu trách nhiệm, ngày rà lại. Khai xong app <b>TẮT</b> và{" "}
        <b>chưa cấp cho vai nào</b>.
      </>
    ),
  },
  {
    ten: "Đặt hai biến secret",
    noi: "Người vận hành · máy chủ Hub",
    chi: (
      <>
        Sinh ngẫu nhiên, đặt vào <span className="font-mono">apps/hub/.env.local</span> đúng tên đã khai, khởi động lại.
        Giá trị không bao giờ vào cơ sở dữ liệu.
      </>
    ),
  },
  {
    ten: "App đấu OIDC",
    noi: "Đội làm app",
    chi: (
      <>
        Thư viện chuẩn (openid-client v6 hoặc tương đương), issuer là địa chỉ Hub, PKCE S256,{" "}
        <span className="font-mono">client_secret_basic</span>. Không tự viết tay luồng OAuth.
      </>
    ),
  },
  {
    ten: "App gửi dữ liệu về",
    noi: "Đội làm app",
    chi: (
      <>
        Một endpoint duy nhất, ký bằng secret webhook. Không có đường ghi thứ hai — app không bao giờ nối thẳng vào cơ
        sở dữ liệu của Hub.
      </>
    ),
  },
  {
    ten: "Cấp vai rồi bật",
    noi: "Quản trị · màn này",
    chi: <>Hai bước riêng: vai nào mở được app, và app có chạy hay không.</>,
  },
  {
    ten: "Rà lại sau 6 tháng",
    noi: "Quản trị · màn này",
    chi: <>Quá hạn thì thẻ app bật đèn. Không rà thì thu hồi.</>,
  },
];

export function QuyTrinhDauNoi({ hubUrl, onDong }: { hubUrl: string; onDong: () => void }) {
  return (
    <HopThoai
      tieuDe="Quy trình đấu nối một app mới"
      moTa="Sáu bước, ba người. Bước 2 là bước duy nhất chạm vào máy chủ."
      rong="max-w-[700px]"
      onDong={onDong}
    >
      <ol className="flex flex-col gap-2.5">
        {BUOC.map((b, i) => (
          <li key={b.ten} className="flex gap-3 rounded-2xl border border-line bg-surface-alt p-3">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-navy text-[13px] font-black text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13.5px] font-black text-navy">{b.ten}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{b.noi}</span>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold leading-relaxed text-cardtitle2">{b.chi}</p>
            </div>
          </li>
        ))}
      </ol>

      <a
        href="/api/quan-tri/ban-yeu-cau-dau-noi"
        download
        className="mt-3 flex w-fit min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 text-[13px] font-black text-white"
      >
        <span className="msr text-[18px]" aria-hidden>
          download
        </span>
        Tải bản yêu cầu gửi đội làm app
      </a>
      <p className="mt-2 rounded-xl bg-surface-infoSoft px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-cardtitle2">
        Đội làm app trả về một khối JSON — dán ở <b>Dán phiếu đấu nối</b>, không phải gõ từng ô. Sau khi app đã khai:
        mở <b>Đấu nối</b> trên thẻ app để lấy giá trị cụ thể chép cho họ.
      </p>
      <p className="mt-2 text-[11.5px] font-semibold leading-relaxed text-muted2">
        Địa chỉ Hub dùng trong mọi bản đấu nối: <span className="font-mono">{hubUrl}</span>
      </p>
    </HopThoai>
  );
}
