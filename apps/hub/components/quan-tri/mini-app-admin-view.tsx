// apps/hub/components/quan-tri/mini-app-admin-view.tsx — sổ đăng ký Mini App.
//
// ═══════════════════════════════════════════════════════════════════════════════
// MÀN NÀY PHẢI TRẢ LỜI BỐN CÂU, KHÔNG PHẢI LIỆT KÊ BỐN CỘT
// ═══════════════════════════════════════════════════════════════════════════════
//   1. "App nào đang bật?" — trạng thái là thứ đọc trước tiên, nên nó đứng đầu mỗi thẻ
//      và cả danh sách xếp app đang bật lên trên.
//   2. "App này chạm được vào gì?" — rổ dữ liệu + vai được mở. Hai thứ này quyết định
//      app đọc/ghi được dữ liệu nào của em nào; giấu chúng sau một nút "chi tiết" là mời
//      người ta bật app mà không đọc.
//   3. "App này có chạy được không?" — có origin chưa, có secret chưa. Cột `daCapSecret`
//      tồn tại vì bảng chỉ giữ TÊN biến môi trường: quản trị khai tên rồi tưởng xong,
//      trong khi biến chưa từng được đặt và mọi webhook sẽ nhận 401.
//   4. "Đã tới lúc rà lại chưa?" — mục 5 của 08-embedded-apps.md đòi rà mỗi 6 tháng,
//      quá hạn thì thu hồi. Không có chỗ hiện ngày này thì luật ấy sống trên giấy.
//
// ═══════════════════════════════════════════════════════════════════════════════
// KHÔNG DÙNG <table>
// ═══════════════════════════════════════════════════════════════════════════════
// Sổ này có 12 trường mỗi app. Ở 360px một bảng 12 cột nghĩa là kéo ngang — đúng lỗi mà
// class-attendance-view.tsx đã phải sửa một lần (bảng min-w-[600px] khiến cô bấm trạng
// thái cho một em mà không nhìn thấy tên em đó). Mỗi app là một THẺ, xếp dọc, đọc được
// nguyên vẹn ở 360px và giãn thành lưới ở khổ máy tính.
"use client";

import { useState } from "react";
import type { HubRole, MiniAppRow, MiniAppScope } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { OperationsShell, Card } from "../dieu-hanh/operations-shell";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";
import { HopThoai } from "../ui/hop-thoai";
import { HuongDanTichHop, QuyTrinhDauNoi } from "./huong-dan-tich-hop";
import { DanPhieuDauNoi } from "./dan-phieu-dau-noi";

const NHAN_RO: Record<string, { chu: string; nen: string; mau: string }> = {
  xanh: { chu: "Rổ Xanh · không gắn tên em nào", nen: "bg-[#E3F8ED]", mau: "text-[#126B45]" },
  vang: { chu: "Rổ Vàng · có gắn tên từng em", nen: "bg-[#FFF7E0]", mau: "text-[#8A5A00]" },
};

const NHAN_VAI: Record<HubRole, string> = {
  student: "học sinh",
  guardian: "phụ huynh",
  teacher: "giáo viên bộ môn",
  homeroom: "chủ nhiệm",
  counselor: "tâm lý cụm",
  principal: "hiệu trưởng",
  board: "ban giám hiệu",
  admin: "quản trị",
};

export function MiniAppAdminView({
  roles,
  displayName,
  email,
}: {
  roles: HubRole[];
  displayName: string;
  email: string;
}) {
  const utils = trpc.useUtils();
  const query = trpc.admin.miniApp.list.useQuery();
  const [dangSua, setDangSua] = useState<string | null>(null);
  /** Mã app đang mở bản đấu nối. Một lúc một bản — nó là lớp nổi, không phải một cột. */
  const [dangXemDauNoi, setDangXemDauNoi] = useState<string | null>(null);
  const [moQuyTrinh, setMoQuyTrinh] = useState(false);

  const doiTrangThai = trpc.admin.miniApp.setEnabled.useMutation({
    onSuccess: () => void utils.admin.miniApp.list.invalidate(),
  });

  const appDangXem = query.data?.apps.find((a) => a.appId === dangXemDauNoi);

  return (
    <OperationsShell
      title="Mini App"
      subtitle={
        query.data
          ? `${query.data.apps.filter((a) => a.enabled).length} app đang bật trên tổng ${query.data.apps.length}`
          : "Sổ đăng ký app ngoài"
      }
      displayName={displayName}
      email={email}
      roles={roles}
      active="miniapp"
      toolbar={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMoQuyTrinh(true)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-line2 bg-white px-4 text-[13px] font-extrabold text-cardtitle2"
          >
            {/* `checklist`, không phải `route`: font đã cắt gọn không có `route`, và một tên
                ngoài danh sách vẽ ra một Ô TRỐNG chứ không báo lỗi
                (`tests/unit/a11y.test.ts` bắt đúng ca này lúc 07/08/2026). */}
            <span className="msr text-[18px]" aria-hidden>
              checklist
            </span>
            Quy trình đấu nối
          </button>
          {/* ĐƯỜNG CHÍNH để khai app mới từ 07/08/2026, đứng TRƯỚC "Khai app mới" — chủ đầu
              tư: *"copy paste vào đó phát là ra app, khỏi cần điền từng tí 1"*. Form khai tay
              ở lại làm đường phụ: nó vẫn cần cho app khai vội trong lúc chờ đội kia gửi phiếu,
              và cho việc sửa một dòng đã có. */}
          <DanPhieuDauNoi onXong={() => void utils.admin.miniApp.list.invalidate()} />
          <NutThemApp onXong={() => void utils.admin.miniApp.list.invalidate()} />
        </div>
      }
    >
      {query.isPending && <LoadingState label="Đang mở sổ đăng ký…" />}
      {query.error && (
        <ErrorState error={query.error} label="Sổ đăng ký Mini App" onRetry={() => void query.refetch()} />
      )}
      {query.data && query.data.apps.length === 0 && (
        <EmptyState
          icon="space_dashboard"  /* font đã cắt gọn không có `widgets` — tên ngoài danh sách vẽ ra ô trống */
          title="Chưa có app ngoài nào"
          // CẮT vế "App mới luôn ở trạng thái TẮT cho tới khi có người bật": chính form
          // khai app mới đã nói đúng điều đó, ở đúng lúc người ta sắp khai.
          hint="Bấm “Khai app mới” để thêm."
        />
      )}

      {query.data?.apps.map((app) => (
        <TheApp
          key={app.appId}
          app={app}
          dangMoSua={dangSua === app.appId}
          onMoSua={() => setDangSua(dangSua === app.appId ? null : app.appId)}
          onDoiTrangThai={() => doiTrangThai.mutate({ appId: app.appId, enabled: !app.enabled })}
          dangDoi={doiTrangThai.isPending && doiTrangThai.variables?.appId === app.appId}
          loiDoi={
            doiTrangThai.isError && doiTrangThai.variables?.appId === app.appId
              ? doiTrangThai.error.message
              : null
          }
          onXongSua={() => {
            setDangSua(null);
            void utils.admin.miniApp.list.invalidate();
          }}
          onXemDauNoi={() => setDangXemDauNoi(app.appId)}
        />
      ))}

      {moQuyTrinh && query.data && (
        <QuyTrinhDauNoi hubUrl={query.data.hubUrl} onDong={() => setMoQuyTrinh(false)} />
      )}
      {appDangXem && query.data && (
        <HuongDanTichHop app={appDangXem} hubUrl={query.data.hubUrl} onDong={() => setDangXemDauNoi(null)} />
      )}
    </OperationsShell>
  );
}

function TheApp({
  app,
  dangMoSua,
  onMoSua,
  onDoiTrangThai,
  dangDoi,
  loiDoi,
  onXongSua,
  onXemDauNoi,
}: {
  app: MiniAppRow;
  dangMoSua: boolean;
  onMoSua: () => void;
  onDoiTrangThai: () => void;
  dangDoi: boolean;
  loiDoi: string | null;
  onXongSua: () => void;
  onXemDauNoi: () => void;
}) {
  const ro = NHAN_RO[app.basket] ?? NHAN_RO.xanh!;
  const quaHan = app.overdueDays > 0;
  const sapHan = !quaHan && app.overdueDays >= -30;

  // Biến đã KHAI TÊN mà CHƯA CÓ GIÁ TRỊ trên máy chủ này. Khai tên nhưng chưa đặt là trạng
  // thái duy nhất màn hình bắt được mà người khai app không tự thấy — biến chưa khai tên thì
  // đã có dòng "Chưa khai biến môi trường" nói hộ, và biến đã đặt thì không có gì phải làm.
  const thieuBien = [
    app.webhookSecretEnv && !app.daCapSecret ? app.webhookSecretEnv : null,
    app.ssoEnabled && app.ssoClientSecretEnv && !app.daCapSsoSecret ? app.ssoClientSecretEnv : null,
  ].filter((b): b is string => !!b);

  return (
    // TRẠNG THÁI TẮT NÓI BẰNG NỀN, KHÔNG BẰNG ĐỘ MỜ (sửa 05/08/2026).
    //
    // `opacity-75` phủ lên CẢ thẻ, kể cả những dòng chữ mang thông tin nặng nhất của màn:
    // `text-muted` tụt còn 3,07:1 và `text-caption` còn 3,22:1. Mà thẻ app ĐANG TẮT chính
    // là thẻ người ta đọc kỹ nhất — đó là lúc quyết định có bật hay không, và câu phải đọc
    // được là "biến môi trường CHƯA được đặt", "quá hạn rà lại". Làm mờ đúng chỗ đó là làm
    // mờ cơ sở của quyết định.
    // Nền #FAFBFD + badge "ĐANG TẮT" đã có sẵn là hai tín hiệu đủ, và badge nói bằng CHỮ
    // nên nó qua được cả mắt mù màu lẫn tai (§11).
    <Card className={app.enabled ? "" : "bg-[#FAFBFD]"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* <h2>: mỗi app là một khối ngang cấp dưới <h1> "Mini App" của khung màn. */}
            <h2 className="text-[15px] font-black text-navy">{app.displayName}</h2>
            {/* Trạng thái nói bằng CHỮ, không chỉ bằng màu (§11: màu không phải tín hiệu
                duy nhất). Người mù màu và người đọc bằng tai vẫn phải biết app nào đang bật. */}
            <span
              className={
                app.enabled
                  ? "rounded-full bg-[#E3F8ED] px-2.5 py-0.5 text-[10.5px] font-black text-[#126B45]"
                  : "rounded-full bg-[#F1F4F8] px-2.5 py-0.5 text-[10.5px] font-black text-muted"
              }
            >
              {app.enabled ? "ĐANG BẬT" : "ĐANG TẮT"}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-caption">/embed/{app.appId}</div>
        </div>

        <button
          type="button"
          onClick={onDoiTrangThai}
          disabled={dangDoi}
          className={
            app.enabled
              ? "flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-[#F0C9CB] bg-white px-4 text-[12.5px] font-extrabold text-[#D2383E] disabled:opacity-50"
              : "flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-br from-navy to-navy-light px-4 text-[12.5px] font-black text-white disabled:opacity-50"
          }
        >
          <span className="msr text-[18px]" aria-hidden>
            {app.enabled ? "block" : "check_circle"}
          </span>
          {dangDoi ? "Đang lưu…" : app.enabled ? "Tắt app" : "Bật app"}
        </button>
      </div>

      {/* role="alert" — máy chủ từ chối thì phải NGHE được (sửa 05/08/2026).
          Ba câu lỗi sau cú bấm của màn này (tắt/bật app · lưu cấu hình · khai app mới) đều
          là `<p>` trần. Người dùng chuột nhìn thấy chữ đỏ hiện ra; người dùng bàn phím và
          trình đọc màn hình thì không nghe gì cả — họ bấm "Tắt app", tiêu điểm vẫn ở nút,
          nút hết mờ, và không có tín hiệu nào phân biệt "đã tắt" với "máy chủ từ chối".
          Màu: #D2383E trên nền hồng #FFF3F3 chỉ đạt 4,43:1. `dangerText` #C7333A = 4,89:1
          trên đúng nền đó. */}
      {loiDoi && (
        <p
          role="alert"
          className="mt-2 rounded-xl bg-[#FFF3F3] px-3 py-2 text-[12px] font-bold text-dangerText"
        >
          {loiDoi}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-black ${ro.nen} ${ro.mau}`}>{ro.chu}</span>
        {/* Mảng vai RỖNG là fail-closed, và nó phải NÓI RA điều đó. Một dòng trống ở chỗ
            này đọc thành "chưa kịp tải", trong khi nó có nghĩa là không ai mở được app. */}
        {app.allowedRoles.length === 0 ? (
          <span className="rounded-full bg-[#FFF7E0] px-2.5 py-1 text-[10.5px] font-black text-[#8A5A00]">
            Chưa cấp cho vai nào — không ai mở được
          </span>
        ) : (
          <span className="rounded-full bg-[#F1F4F8] px-2.5 py-1 text-[10.5px] font-bold text-cardtitle2">
            Mở cho: {app.allowedRoles.map((r) => NHAN_VAI[r] ?? r).join(", ")}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
        <Muc nhan="Nhúng iframe">
          {app.origin ? (
            <span className="font-mono text-[11.5px] text-ink">{app.origin}</span>
          ) : (
            <span className="text-caption">Không có UI nhúng — app chỉ đi đường webhook</span>
          )}
        </Muc>
        <Muc nhan="Secret webhook">
          {!app.webhookSecretEnv ? (
            <span className="text-caption">Chưa khai biến môi trường</span>
          ) : app.daCapSecret ? (
            <span className="font-bold text-[#126B45]">
              Đã cấp — <span className="font-mono text-[11.5px]">{app.webhookSecretEnv}</span>
            </span>
          ) : (
            // Đây là ca mà cả màn hình này sinh ra để bắt: tên biến có, giá trị không.
            // Không nói ra thì quản trị tin webhook đã sẵn sàng và app nhận 401 mãi mãi.
            // RÚT NGẮN 06/08/2026: bỏ khung "Khai X nhưng biến này…". Tên biến đứng
            // trước, hậu quả đứng sau — hai mảnh, không phải một câu kể.
            <span className="flex items-center gap-1 font-bold text-dangerText">
              <span className="msr text-[15px]" aria-hidden>
                error
              </span>
              <span className="font-mono text-[11.5px]">{app.webhookSecretEnv}</span> chưa đặt — webhook 401
            </span>
          )}
        </Muc>
        {/* SSO đứng NGANG HÀNG với webhook, không nằm sau một nút "chi tiết" (07/08/2026).
            Từ ADR-032, "app này có đăng nhập được bằng tài khoản Hub không" là một trong ba
            đường mà công tắc bật/tắt ở trên cắt cùng lúc. Giấu nó đi thì người bấm nút thu
            hồi không biết mình vừa cắt những gì. */}
        <Muc nhan="Đăng nhập (SSO)">
          {!app.ssoEnabled ? (
            <span className="text-caption">Không dùng — app không đăng nhập bằng tài khoản Hub</span>
          ) : !app.daCapSsoSecret ? (
            <span className="flex items-center gap-1 font-bold text-dangerText">
              <span className="msr text-[15px]" aria-hidden>
                error
              </span>
              <span className="font-mono text-[11.5px]">{app.ssoClientSecretEnv}</span> chưa đặt — invalid_client
            </span>
          ) : (
            <span className="font-bold text-successText">
              Bật — client_id <span className="font-mono text-[11.5px]">{app.appId}</span>
            </span>
          )}
        </Muc>
        <Muc nhan="Loại sự kiện nhận">
          {app.allowedEventTypes.includes("*") ? (
            <span className="font-bold text-ink">Mọi loại (*)</span>
          ) : app.allowedEventTypes.length ? (
            <span className="font-mono text-[11.5px] text-ink">{app.allowedEventTypes.join(", ")}</span>
          ) : (
            <span className="text-caption">Chưa khai loại nào — webhook từ chối mọi sự kiện</span>
          )}
        </Muc>
        <Muc nhan="Người chịu trách nhiệm">
          <span className="text-ink">{app.owner}</span>
        </Muc>
        <Muc nhan="Rà lại">
          <span
            className={
              quaHan ? "font-black text-[#D2383E]" : sapHan ? "font-bold text-[#8A5A00]" : "text-ink"
            }
          >
            {app.reviewDueOn}
            {quaHan
              ? ` — QUÁ HẠN ${app.overdueDays} ngày`
              : sapHan
                ? ` — còn ${-app.overdueDays} ngày`
                : ""}
          </span>
        </Muc>
        <Muc nhan="Sửa lần cuối">
          <span className="text-caption">{app.updatedAt.slice(0, 10)}</span>
        </Muc>
      </dl>

      {/* DỮ LIỆU ĐÃ VỀ CHƯA — câu chủ đầu tư hỏi 08/08/2026, và trước hôm nay chỉ trả lời
          được bằng một lời hứa. Bảng nhận không vai nào đọc được, không màn hình nào hiện.

          VẼ CHO MỌI APP, kể cả app chưa khai cửa gửi (đổi 08/08/2026). Bản trước chỉ vẽ khi
          app đã khai `webhookSecretEnv`, nên một app KHÔNG gửi gì về trông y hệt một app
          không có gì để hiện — im lặng, không ai để ý.
          Chủ đầu tư ra luật: *"tất cả mọi app phải đổ dữ liệu về"*. Luật đó chỉ sống được
          nếu app chưa đổ thì NHÌN THẤY, nên ba trạng thái đều nói ra bằng chữ. */}
      {(
        <div className="mt-3 rounded-2xl border border-line bg-surface-alt p-3">
          <div className="text-[10.5px] font-black uppercase tracking-wide text-muted">App đã gửi về</div>
          {!app.webhookSecretEnv ? (
            <p className="mt-1 flex items-start gap-1.5 text-[12.5px] font-bold text-gold-textDark">
              <span className="msr mt-px flex-none text-[16px]" aria-hidden>
                error
              </span>
              <span>
                Chưa khai đường gửi dữ liệu — bật ở <b>Sửa cấu hình</b>.
              </span>
            </p>
          ) : app.daNhan.length === 0 ? (
            // Thể RỖNG phải nói ra, không để trống. Một app vừa khai chưa gửi gì là bình
            // thường; một app đã bật ba tuần mà chưa gửi gì là chuyện cần biết — và hai ca
            // đó chỉ phân biệt được khi màn hình chịu nói cả hai.
            <p className="mt-1 text-[12.5px] font-semibold text-caption">
              Chưa nhận được sự kiện nào.
            </p>
          ) : (
            <dl className="mt-1.5 flex flex-col gap-1.5">
              {app.daNhan.map((d) => (
                <div key={d.eventType} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <dt className="font-mono text-[12px] font-bold text-ink">{d.eventType}</dt>
                  <dd className="text-[12px] font-semibold text-cardtitle2">
                    {d.soSuKien.toLocaleString("vi-VN")} sự kiện
                    {d.soEm > 0 && ` · ${d.soEm} em`}
                    <span className="text-caption"> · {d.lanCuoi.slice(0, 10)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {/* CÒN THIẾU GÌ ĐỂ APP NÀY CHẠY — gom, không thêm (08/08/2026).
          Ghi chú cho người sửa sau: khối trên cố ý bọc trong `{( … )}` chứ không phải một
          điều kiện — nó vẽ cho MỌI app. Đừng "dọn dẹp" cặp ngoặc đó thành `{app.x && …}`;
          đó chính là hình dạng vừa bị bỏ, và bỏ vì nó giấu mất app chưa đổ dữ liệu về. */}
      {/* (tiếp)
          Bản trước ở đây chỉ có khối đỏ về biến môi trường. Nó đúng nhưng chỉ là MỘT trong
          ba việc còn lại, và hai việc kia (cấp vai, bật app) nằm rải hai chỗ khác trên thẻ.
          Người vừa dán phiếu xong không có cách nào biết mình còn mấy việc.
          Đo thật 08/08: dán phiếu → cả ba đường đều chưa chạy. Khối này là câu trả lời duy
          nhất cho "app này chạy chưa", và nó biến mất khi không còn gì để làm. */}
      {app.conThieu.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-[#F0C9CB] bg-surface-danger p-3">
          <div className="text-[10.5px] font-black uppercase tracking-wide text-dangerText">
            Còn {app.conThieu.length} việc để app chạy
          </div>
          <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4 text-[12px] font-semibold text-ink">
            {app.conThieu.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          {thieuBien.length > 0 && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-white px-2.5 py-2 font-mono text-[11.5px] font-semibold text-ink">
              {thieuBien.map((b) => `${b}=<sinh ngẫu nhiên 32 byte>`).join("\n")}
            </pre>
          )}
        </div>
      ) : (
        // Thể "xong" cũng phải nói ra. Không có nó thì "đã sẵn sàng" và "màn hình chưa kịp
        // tính" trông giống hệt nhau — đúng cái mơ hồ mà khối này sinh ra để dẹp.
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-extrabold text-successText">
          <span className="msr text-[17px]" aria-hidden>
            check_circle
          </span>
          Sẵn sàng — không còn việc nào
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onMoSua}
          aria-expanded={dangMoSua}
          className="flex min-h-[44px] items-center gap-1.5 text-[12.5px] font-extrabold text-link underline underline-offset-2"
        >
          {dangMoSua ? "Đóng" : "Sửa cấu hình"}
        </button>
        <button
          type="button"
          onClick={onXemDauNoi}
          className="flex min-h-[44px] items-center gap-1.5 text-[12.5px] font-extrabold text-link underline underline-offset-2"
        >
          Đấu nối
        </button>
      </div>

      {dangMoSua && <FormSua app={app} onXong={onXongSua} />}
    </Card>
  );
}

function Muc({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-black uppercase tracking-wide text-muted">{nhan}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sửa cấu hình
// ---------------------------------------------------------------------------

const MOI_VAI: HubRole[] = [
  "student",
  "guardian",
  "teacher",
  "homeroom",
  "counselor",
  "principal",
  "board",
  "admin",
];

/**
 * Textarea nhiều dòng → mảng. Bỏ dòng trống và cắt khoảng trắng hai đầu.
 *
 * Cắt khoảng trắng KHÔNG phải là dọn dẹp cho gọn: `redirect_uri` so khớp tuyệt đối theo
 * OIDC, nên một dấu cách vô hình dán kèm từ Slack là RP không bao giờ đăng nhập được, với
 * một câu lỗi (`redirect_uri mismatch`) không hề nhắc tới khoảng trắng.
 */
function tachDong(s: string): string[] {
  return s
    .split("\n")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

/**
 * Tên biến môi trường theo đúng quy ước đang dùng cho Factory: TIỀN_TỐ + mã app viết HOA.
 *
 * Điền sẵn không phải để tiết kiệm gõ. Tên biến gõ sai một ký tự là một app khai xong, hiện
 * lên đẹp đẽ trên màn này, và nhận `invalid_client` / `401` mãi mãi — vì `process.env[tên
 * sai]` là `undefined`, đúng cùng giá trị với "chưa đặt". Không có cách nào phân biệt hai ca
 * đó từ trong hệ.
 */
function tenBien(tienTo: string, maApp: string): string {
  return `${tienTo}_${maApp.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

const MOI_SCOPE: { ma: MiniAppScope; nhan: string }[] = [
  { ma: "openid", nhan: "openid — bắt buộc" },
  { ma: "profile", nhan: "profile — tên hiển thị" },
  { ma: "hub_profile", nhan: "hub_profile — vai, cơ sở, lớp" },
  { ma: "offline_access", nhan: "offline_access — refresh token" },
];

/**
 * Khối WEBHOOK trong form sửa cấu hình — thêm 08/08/2026.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO NÓ CHƯA TỪNG CÓ, VÀ CÁI GIÁ CỦA VIỆC ĐÓ
 * ═══════════════════════════════════════════════════════════════════════════
 * Chủ đầu tư chỉ vào khối đỏ trên thẻ Factory — *"Thêm EMBED_WEBHOOK_SECRET_FACTORY vào
 * .env.local rồi khởi động lại"* — và hỏi: **có cần thiết không?**
 *
 * Đo ra: KHÔNG. Factory chạy từ 29/07, và tới 08/08 nó gửi về **0 bản ghi** (0 trong phòng
 * chờ, 0 trong kho, 0 alias đã cấp). Nó chỉ dùng đăng nhập và nhúng. Khối đỏ ấy cảnh báo
 * về một con đường không ai đi.
 *
 * Nhưng khối đỏ KHÔNG sai — nó chỉ đang trung thành báo cáo một dòng dữ liệu **khai thừa**:
 * hàng của Factory mang `webhook_secret_env` VÀ `allowed_event_types = {*}` (chép nguyên từ
 * `registry.ts` khi migration 0052 chuyển sổ sang database). Một app chưa từng gửi gì mà
 * giữ giấy phép "nhận MỌI loại sự kiện" là đúng cái mẫu "cấp quyền bằng cách quên không gỡ".
 *
 * Đường sửa đúng là **gỡ lời khai đó khỏi hàng của Factory**, không phải đi đặt secret cho
 * một con đường không ai dùng. Và lúc định làm thế thì lộ ra chuyện thứ hai: **form sửa cấu
 * hình không có ô nào cho hai trường đó** — hợp đồng nhận chúng, cơ sở dữ liệu lưu chúng,
 * màn hình hiện chúng, nhưng không ai sửa được từ màn hình. Đúng điều 17 hiến pháp UI (đủ
 * vòng đời: tạo được thì phải sửa được). Khối này lấp chỗ đó.
 */
function KhoiWebhook({
  appId,
  bat,
  setBat,
  loai,
  setLoai,
  bien,
  setBien,
}: {
  appId: string;
  bat: boolean;
  setBat: (v: boolean) => void;
  loai: string;
  setLoai: (v: string) => void;
  bien: string;
  setBien: (v: string) => void;
}) {
  const coSao = tachDong(loai).includes("*");
  return (
    <fieldset className="rounded-2xl border border-line bg-white p-3">
      <legend className="px-1 text-[10.5px] font-black uppercase tracking-wide text-muted">
        Gửi dữ liệu về Hub
      </legend>

      <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={bat}
          onChange={(e) => {
            const v = e.target.checked;
            setBat(v);
            if (v && !bien) setBien(tenBien("EMBED_WEBHOOK_SECRET", appId));
          }}
          className="h-4 w-4 accent-gold"
        />
        <span className="text-[12.5px] font-extrabold text-cardtitle2">App này gửi dữ liệu về Hub</span>
      </label>

      {bat && (
        <div className="mt-2 flex flex-col gap-3">
          <O nhan="Loại sự kiện được nhận — mỗi dòng một loại" goiY="Chữ thường và gạch dưới, ví dụ ket_qua_the_luc.">
            <textarea
              value={loai}
              onChange={(e) => setLoai(e.target.value)}
              rows={2}
              required
              placeholder="ket_qua_the_luc"
              className={`${O_INPUT} py-2 font-mono leading-relaxed`}
            />
          </O>
          {coSao && (
            // `*` hợp lệ với rổ Xanh (ràng buộc của bảng chỉ chặn rổ Vàng), nhưng hợp lệ
            // không có nghĩa là nên. Nói ra ở đây vì đây là chỗ duy nhất người ta gõ nó.
            <p className="rounded-xl bg-surface-warnSoft px-3 py-2 text-[11.5px] font-bold text-gold-textDark">
              Dấu <span className="font-mono">*</span> nhận MỌI loại sự kiện — kể cả loại app chưa từng gửi và chưa ai
              rà. Khai đúng tên từng loại thì Hub trả lại 403 cho thứ ngoài danh sách.
            </p>
          )}
          <O nhan="Tên biến môi trường chứa secret webhook" goiY="CHỈ tên biến, không phải giá trị.">
            <input
              value={bien}
              onChange={(e) => setBien(e.target.value.toUpperCase())}
              required
              placeholder="EMBED_WEBHOOK_SECRET_TENAPP"
              className={`${O_INPUT} font-mono`}
            />
          </O>
        </div>
      )}
    </fieldset>
  );
}

/**
 * Khối SSO trong form sửa cấu hình.
 *
 * Các ô CHỈ hiện khi công tắc bật — điều 15 của hiến pháp UI: hành động không dùng được thì
 * ẩn, không phải làm mờ. Một app trang tin không đăng nhập gì cả thì bốn ô OIDC nằm xám ở
 * đó chỉ tạo cảm giác form còn dở.
 */
function KhoiSso({
  appId,
  bat,
  setBat,
  uri,
  setUri,
  bcl,
  setBcl,
  scope,
  setScope,
  bien,
  setBien,
}: {
  appId: string;
  bat: boolean;
  setBat: (v: boolean) => void;
  uri: string;
  setUri: (v: string) => void;
  bcl: string;
  setBcl: (v: string) => void;
  scope: MiniAppScope[];
  setScope: (v: MiniAppScope[]) => void;
  bien: string;
  setBien: (v: string) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-line bg-white p-3">
      <legend className="px-1 text-[10.5px] font-black uppercase tracking-wide text-muted">
        Đăng nhập bằng tài khoản Hub
      </legend>

      <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={bat}
          onChange={(e) => {
            const v = e.target.checked;
            setBat(v);
            // Bật lần đầu mà chưa có tên biến thì điền sẵn — xem `tenBien()`.
            if (v && !bien) setBien(tenBien("OIDC_CLIENT_SECRET", appId));
          }}
          className="h-4 w-4 accent-gold"
        />
        <span className="text-[12.5px] font-extrabold text-cardtitle2">
          App này đăng nhập bằng tài khoản Hub (OIDC)
        </span>
      </label>

      {bat && (
        <div className="mt-2 flex flex-col gap-3">
          <O nhan="redirect_uri — mỗi dòng một cái" goiY="https://…  Hub tự thêm đường cầu nối cho khung nhúng.">
            <textarea
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              rows={2}
              required
              placeholder="https://app.vidu.vn/api/auth/oidc/callback"
              className={`${O_INPUT} py-2 font-mono leading-relaxed`}
            />
          </O>
          <O nhan="backchannel_logout_uri" goiY="Thoát Hub là Hub gọi vào đây để đóng phiên bên app.">
            <input
              value={bcl}
              onChange={(e) => setBcl(e.target.value)}
              placeholder="https://app.vidu.vn/api/auth/oidc/backchannel-logout"
              className={`${O_INPUT} font-mono`}
            />
          </O>
          <fieldset>
            <legend className="text-[10.5px] font-black uppercase tracking-wide text-muted">scope được xin</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MOI_SCOPE.map((s) => {
                const chon = scope.includes(s.ma);
                // `openid` không bỏ được: thiếu nó thì đây là OAuth2 trần, không có id_token,
                // và ràng buộc của bảng sẽ từ chối. Khoá ô ở đây để người dùng gặp sự thật
                // ngay lúc bấm chứ không phải sau khi gửi.
                const khoa = s.ma === "openid";
                return (
                  <label
                    key={s.ma}
                    className={
                      chon
                        ? "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-navy px-3 text-[12px] font-black text-white"
                        : "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] font-bold text-cardtitle2"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={chon}
                      disabled={khoa}
                      onChange={(e) => setScope(e.target.checked ? [...scope, s.ma] : scope.filter((x) => x !== s.ma))}
                      className="h-4 w-4 accent-gold"
                    />
                    {s.nhan}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <O nhan="Tên biến môi trường chứa client_secret" goiY="CHỈ tên biến, không phải giá trị.">
            <input
              value={bien}
              onChange={(e) => setBien(e.target.value.toUpperCase())}
              required
              placeholder="OIDC_CLIENT_SECRET_TENAPP"
              className={`${O_INPUT} font-mono`}
            />
          </O>
        </div>
      )}
    </fieldset>
  );
}

function FormSua({ app, onXong }: { app: MiniAppRow; onXong: () => void }) {
  const [ten, setTen] = useState(app.displayName);
  const [chuTri, setChuTri] = useState(app.owner);
  const [ngayRa, setNgayRa] = useState(app.reviewDueOn);
  const [vai, setVai] = useState<HubRole[]>(app.allowedRoles);
  const [gioiThieu, setGioiThieu] = useState(app.intro ?? "");
  // "App có gửi dữ liệu về không" suy từ việc nó đã KHAI tên biến secret — đó là dấu hiệu
  // duy nhất trong dữ liệu, và cũng chính là thứ làm khối cảnh báo đỏ nổi lên.
  const [webhook, setWebhook] = useState(!!app.webhookSecretEnv);
  const [loaiSuKien, setLoaiSuKien] = useState(app.allowedEventTypes.join("\n"));
  const [bienWebhook, setBienWebhook] = useState(app.webhookSecretEnv ?? "");
  const [sso, setSso] = useState(app.ssoEnabled);
  // Mỗi dòng một URI. Textarea chứ không phải một ô có dấu phẩy: URI đã dài sẵn, và một
  // danh sách ngăn bằng dấu phẩy thì không ai thấy được mình vừa dán thừa khoảng trắng vào
  // đâu — mà `redirect_uri` so khớp TUYỆT ĐỐI, thừa một ký tự là RP không đăng nhập được.
  const [uri, setUri] = useState(app.ssoRedirectUris.join("\n"));
  const [bcl, setBcl] = useState(app.ssoBackchannelLogoutUri ?? "");
  const [scope, setScope] = useState<MiniAppScope[]>(app.ssoScopes as MiniAppScope[]);
  const [bienSso, setBienSso] = useState(app.ssoClientSecretEnv ?? "");

  const sua = trpc.admin.miniApp.update.useMutation({ onSuccess: onXong });

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-[#F9FBFD] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        sua.mutate({
          appId: app.appId,
          displayName: ten,
          owner: chuTri,
          reviewDueOn: ngayRa,
          allowedRoles: vai,
          intro: gioiThieu.trim() || null,
          // Tắt webhook là DỌN CẢ HAI trường, không chỉ ẩn ô đi: để lại `allowedEventTypes`
          // của một app không còn cửa webhook là để lại một giấy phép không ai thấy.
          allowedEventTypes: webhook ? tachDong(loaiSuKien) : [],
          webhookSecretEnv: webhook ? bienWebhook.trim() || null : null,
          ssoEnabled: sso,
          ssoRedirectUris: tachDong(uri),
          ssoBackchannelLogoutUri: bcl.trim() || null,
          ssoScopes: scope,
          ssoClientSecretEnv: bienSso.trim() || null,
        });
      }}
    >
      {/* MÃ APP và RỔ DỮ LIỆU cố ý KHÔNG có ô nhập — xem khối chú thích đầu
          routers/admin.ts. Nói ra ở đây thay vì để một ô xám khoá lại: ô khoá đọc thành
          "chưa làm xong", còn dòng chữ này nói thẳng là không sửa được và vì sao. */}
      {/* `muted2` GIỮ NGUYÊN sau khi đo lại 05/08/2026: token vừa được nâng #6B7789 →
          #5F6B7D, và trên nền form #F9FBFD nó đạt 5,21:1 — trên chuẩn 4,5:1. Đây là đoạn
          giải thích VÌ SAO mã app và rổ dữ liệu không sửa được; nó phải đọc được. */}
      {/* GẤP LẠI, KHÔNG CẮT (06/08/2026). Đoạn này ba câu và nó là thứ đầu tiên đập vào
          mắt khi mở form sửa — trong khi 95% lượt mở form là để đổi tên hoặc gia hạn ngày
          rà. Nó vẫn PHẢI đọc được: nó trả lời "vì sao không có ô cho mã app và rổ dữ
          liệu", và không có nó thì thiếu ô đọc thành lỗi. `<details>` theo đúng mẫu
          `ScopeNotice` — một dòng trên mặt, phần còn lại chỉ khi có người hỏi. */}
      <details className="text-[11.5px] leading-relaxed text-muted2">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-bold">
          Mã app và rổ dữ liệu không sửa được
          <span className="ml-1 font-black text-link">— vì sao?</span>
        </summary>
        <p className="mt-1.5">
          Mã (<span className="font-mono">{app.appId}</span>) nằm trong URL, trong mọi webhook app đang gửi và
          trong alias đã sinh cho từng em; rổ dữ liệu là thứ Hội đồng dữ liệu duyệt. Muốn đổi thì tắt app này
          và khai app mới — chậm hơn, và chậm ở đây là cố ý.
        </p>
      </details>

      <O nhan="Tên hiện cho người dùng">
        <input value={ten} onChange={(e) => setTen(e.target.value)} maxLength={60} required className={O_INPUT} />
      </O>
      <O nhan="Người chịu trách nhiệm">
        <input value={chuTri} onChange={(e) => setChuTri(e.target.value)} maxLength={120} required className={O_INPUT} />
      </O>
      <O nhan="Ngày rà lại">
        <input type="date" value={ngayRa} onChange={(e) => setNgayRa(e.target.value)} required className={O_INPUT} />
      </O>
      <O nhan="Một câu nói app này làm gì (hiện lúc chờ app nạp)">
        <input
          value={gioiThieu}
          onChange={(e) => setGioiThieu(e.target.value)}
          maxLength={200}
          placeholder="Bỏ trống thì màn chờ chỉ hiện tên app"
          className={O_INPUT}
        />
      </O>

      <fieldset>
        <legend className="text-[10.5px] font-black uppercase tracking-wide text-muted">Vai được mở app</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MOI_VAI.map((r) => {
            const chon = vai.includes(r);
            return (
              <label
                key={r}
                className={
                  chon
                    ? "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-navy px-3 text-[12px] font-black text-white"
                    : "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] font-bold text-cardtitle2"
                }
              >
                <input
                  type="checkbox"
                  checked={chon}
                  onChange={(e) => setVai(e.target.checked ? [...vai, r] : vai.filter((x) => x !== r))}
                  className="h-4 w-4 accent-gold"
                />
                {NHAN_VAI[r]}
              </label>
            );
          })}
        </div>
        {vai.length === 0 && (
          // CẮT vế "Đó là trạng thái hợp lệ (và là mặc định của app mới), chỉ cần biết
          // là mình đang chọn nó" — trấn an dài cho một dòng đã nói đủ.
          <p className="mt-1.5 text-[11.5px] font-bold text-[#8A5A00]">
            Không chọn vai nào = không ai mở được app.
          </p>
        )}
      </fieldset>

      <KhoiWebhook
        appId={app.appId}
        bat={webhook}
        setBat={setWebhook}
        loai={loaiSuKien}
        setLoai={setLoaiSuKien}
        bien={bienWebhook}
        setBien={setBienWebhook}
      />

      <KhoiSso
        appId={app.appId}
        bat={sso}
        setBat={setSso}
        uri={uri}
        setUri={setUri}
        bcl={bcl}
        setBcl={setBcl}
        scope={scope}
        setScope={setScope}
        bien={bienSso}
        setBien={setBienSso}
      />

      {/* role="alert" + `dangerText` — cùng lý lẽ và cùng phép đo với khối lỗi ở TheApp. */}
      {sua.isError && (
        <p role="alert" className="rounded-xl bg-[#FFF3F3] px-3 py-2 text-[12px] font-bold text-dangerText">
          {sua.error.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={sua.isPending}
          className="flex min-h-[44px] items-center rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 text-[13px] font-black text-white disabled:opacity-50"
        >
          {sua.isPending ? "Đang lưu…" : "Lưu"}
        </button>
        <button
          type="button"
          onClick={onXong}
          className="flex min-h-[44px] items-center rounded-xl border border-line bg-white px-5 text-[13px] font-extrabold text-cardtitle2"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Khai app mới
// ---------------------------------------------------------------------------

const O_INPUT =
  "min-h-[44px] w-full rounded-xl border border-line bg-white px-3 text-[13px] font-semibold text-ink outline-none focus:border-navy";

function O({ nhan, children, goiY }: { nhan: string; children: React.ReactNode; goiY?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-black uppercase tracking-wide text-muted">{nhan}</span>
      {children}
      {goiY && <span className="text-[11px] text-caption">{goiY}</span>}
    </label>
  );
}

function NutThemApp({ onXong }: { onXong: () => void }) {
  const [mo, setMo] = useState(false);
  const [maApp, setMaApp] = useState("");
  const [ten, setTen] = useState("");
  const [ro, setRo] = useState<"xanh" | "vang">("xanh");
  const [chuTri, setChuTri] = useState("");
  const [ngayRa, setNgayRa] = useState("");
  const [origin, setOrigin] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [bienSecret, setBienSecret] = useState("");
  // MẶC ĐỊNH BẬT (08/08/2026). Luật của chủ đầu tư: *"tất cả mọi app phải đổ dữ liệu về"*.
  // Một luật mà mặc định của form đi ngược lại thì nó chỉ là một câu nói — người khai app
  // vội sẽ để nguyên mặc định, và mặc định phải là điều đúng. Tắt được, nhưng phải cố ý tắt.
  const [webhook, setWebhook] = useState(true);
  const [loaiSuKien, setLoaiSuKien] = useState("");
  const [sso, setSso] = useState(false);
  const [uri, setUri] = useState("");
  const [bcl, setBcl] = useState("");
  const [scope, setScope] = useState<MiniAppScope[]>(["openid", "profile"]);
  const [bienSso, setBienSso] = useState("");

  const them = trpc.admin.miniApp.create.useMutation({
    onSuccess: () => {
      setMo(false);
      setMaApp("");
      setTen("");
      setChuTri("");
      setNgayRa("");
      setOrigin("");
      setIframeUrl("");
      setBienSecret("");
      setWebhook(true); // về đúng mặc định, không về "tắt" — xem lý lẽ ở khai báo state
      setLoaiSuKien("");
      setSso(false);
      setUri("");
      setBcl("");
      setScope(["openid", "profile"]);
      setBienSso("");
      onXong();
    },
  });

  const nut = (
    <button
      type="button"
      onClick={() => setMo(true)}
      className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 text-[13px] font-black text-white"
    >
      <span className="msr text-[18px]" aria-hidden>
        add
      </span>
      Khai app mới
    </button>
  );

  if (!mo) return nut;

  return (
    <>
      {/* Nút Ở LẠI DƯỚI LỚP PHỦ, không biến mất khi hộp mở (07/08/2026).
          Bản cũ `return <form>` thay chỗ cái nút, nên ở khổ máy tính form mọc lên trong
          slot toolbar — cuối một hàng `md:justify-between` — và đẩy toàn bộ danh sách app
          xuống dưới màn hình. Đúng chỗ chủ đầu tư chỉ ra: "nó nằm ở bên phải, đè khối kia
          xuống". Giữ nút tại chỗ thì bố cục trang không đổi một pixel nào khi hộp mở/đóng,
          và tiêu điểm có chỗ để trả về lúc đóng. */}
      {nut}
      <HopThoai
        tieuDe="Khai một Mini App mới"
        moTa="Khai xong: app TẮT, chưa cấp cho vai nào."
        rong="max-w-[620px]"
        onDong={() => setMo(false)}
      >
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        them.mutate({
          appId: maApp.trim(),
          displayName: ten.trim(),
          basket: ro,
          owner: chuTri.trim(),
          reviewDueOn: ngayRa,
          allowedRoles: [],
          allowedEventTypes: webhook ? tachDong(loaiSuKien) : [],
          origin: origin.trim() || null,
          iframeUrl: iframeUrl.trim() || null,
          webhookSecretEnv: webhook ? bienSecret.trim() || null : null,
          ssoEnabled: sso,
          ssoRedirectUris: tachDong(uri),
          ssoBackchannelLogoutUri: bcl.trim() || null,
          ssoScopes: scope,
          ssoClientSecretEnv: bienSso.trim() || null,
        });
      }}
    >
      <O nhan="Mã app" goiY="Chữ thường, số, gạch ngang. Không đổi được về sau.">
        <input
          value={maApp}
          onChange={(e) => setMaApp(e.target.value)}
          pattern="[a-z][a-z0-9-]{1,38}[a-z0-9]"
          required
          className={`${O_INPUT} font-mono`}
        />
      </O>
      <O nhan="Tên hiện cho người dùng">
        <input value={ten} onChange={(e) => setTen(e.target.value)} maxLength={60} required className={O_INPUT} />
      </O>
      <O
        nhan="Rổ dữ liệu"
        goiY="Có gắn tên từng em ⇒ Vàng (kể cả Fitness, căn tin)."
      >
        <select value={ro} onChange={(e) => setRo(e.target.value as "xanh" | "vang")} className={O_INPUT}>
          <option value="xanh">Xanh — không gắn tên em nào</option>
          <option value="vang">Vàng — có gắn tên từng em</option>
        </select>
      </O>
      <O nhan="Người chịu trách nhiệm" goiY="Tên đội làm app + dev lõi bảo trợ.">
        <input value={chuTri} onChange={(e) => setChuTri(e.target.value)} maxLength={120} required className={O_INPUT} />
      </O>
      <O nhan="Ngày rà lại" goiY="Thường 6 tháng kể từ hôm nay.">
        <input type="date" value={ngayRa} onChange={(e) => setNgayRa(e.target.value)} required className={O_INPUT} />
      </O>
      <O nhan="Origin (bỏ trống nếu app không có UI nhúng)" goiY="Dạng https://ten-mien, không đường dẫn.">
        <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://app.vidu.vn" className={`${O_INPUT} font-mono`} />
      </O>
      <O nhan="URL nạp vào iframe" goiY="Phải nằm trong origin ở trên.">
        <input value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} placeholder="https://app.vidu.vn/embed" className={`${O_INPUT} font-mono`} />
      </O>
      {/* CÙNG khối với form sửa, không phải một ô secret trần như bản trước (08/08/2026).
          Bản cũ chỉ hỏi tên biến rồi gửi `allowedEventTypes: []` — tức là khai một app có
          cửa webhook mà cửa đó từ chối MỌI loại sự kiện. App im lặng không gửi được gì, và
          màn hình thì hiện một cảnh báo về secret, tức là chỉ sai chỗ. */}
      <KhoiWebhook
        appId={maApp.trim() || "tenapp"}
        bat={webhook}
        setBat={setWebhook}
        loai={loaiSuKien}
        setLoai={setLoaiSuKien}
        bien={bienSecret}
        setBien={setBienSecret}
      />

      <KhoiSso
        appId={maApp.trim() || "tenapp"}
        bat={sso}
        setBat={setSso}
        uri={uri}
        setUri={setUri}
        bcl={bcl}
        setBcl={setBcl}
        scope={scope}
        setScope={setScope}
        bien={bienSso}
        setBien={setBienSso}
      />

      {/* role="alert" + `dangerText` — cùng lý lẽ và cùng phép đo với hai khối lỗi trên. */}
      {them.isError && (
        <p role="alert" className="rounded-xl bg-[#FFF3F3] px-3 py-2 text-[12px] font-bold text-dangerText">
          {them.error.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={them.isPending}
          className="flex min-h-[44px] items-center rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 text-[13px] font-black text-white disabled:opacity-50"
        >
          {them.isPending ? "Đang khai…" : "Khai app"}
        </button>
        <button
          type="button"
          onClick={() => setMo(false)}
          className="flex min-h-[44px] items-center rounded-xl border border-line bg-white px-5 text-[13px] font-extrabold text-cardtitle2"
        >
          Huỷ
        </button>
      </div>
    </form>
      </HopThoai>
    </>
  );
}
