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
import type { HubRole, MiniAppRow } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { OperationsShell, Card } from "../dieu-hanh/operations-shell";
import { EmptyState, ErrorState, LoadingState } from "../ui/query-state";

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

  const doiTrangThai = trpc.admin.miniApp.setEnabled.useMutation({
    onSuccess: () => void utils.admin.miniApp.list.invalidate(),
  });

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
      toolbar={<NutThemApp onXong={() => void utils.admin.miniApp.list.invalidate()} />}
    >
      {query.isPending && <LoadingState label="Đang mở sổ đăng ký…" />}
      {query.error && (
        <ErrorState error={query.error} label="Sổ đăng ký Mini App" onRetry={() => void query.refetch()} />
      )}
      {query.data && query.data.apps.length === 0 && (
        <EmptyState
          icon="space_dashboard"  /* font đã cắt gọn không có `widgets` — tên ngoài danh sách vẽ ra ô trống */
          title="Chưa có app ngoài nào"
          hint="Bấm “Khai app mới” để thêm. App mới luôn ở trạng thái TẮT cho tới khi có người bật."
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
        />
      ))}
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
}: {
  app: MiniAppRow;
  dangMoSua: boolean;
  onMoSua: () => void;
  onDoiTrangThai: () => void;
  dangDoi: boolean;
  loiDoi: string | null;
  onXongSua: () => void;
}) {
  const ro = NHAN_RO[app.basket] ?? NHAN_RO.xanh!;
  const quaHan = app.overdueDays > 0;
  const sapHan = !quaHan && app.overdueDays >= -30;

  return (
    <Card className={app.enabled ? "" : "opacity-75"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-black text-navy">{app.displayName}</span>
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

      {loiDoi && (
        <p className="mt-2 rounded-xl bg-[#FFF3F3] px-3 py-2 text-[12px] font-bold text-[#D2383E]">{loiDoi}</p>
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
          <span className="rounded-full bg-[#F1F4F8] px-2.5 py-1 text-[10.5px] font-bold text-[#33507C]">
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
            <span className="font-bold text-[#D2383E]">
              Khai <span className="font-mono text-[11.5px]">{app.webhookSecretEnv}</span> nhưng biến này CHƯA
              được đặt trên máy chủ — webhook sẽ trả 401
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

      <button
        type="button"
        onClick={onMoSua}
        aria-expanded={dangMoSua}
        className="mt-3 flex min-h-[44px] items-center gap-1.5 text-[12.5px] font-extrabold text-[#1D4E8F] underline underline-offset-2"
      >
        {dangMoSua ? "Đóng" : "Sửa cấu hình"}
      </button>

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

function FormSua({ app, onXong }: { app: MiniAppRow; onXong: () => void }) {
  const [ten, setTen] = useState(app.displayName);
  const [chuTri, setChuTri] = useState(app.owner);
  const [ngayRa, setNgayRa] = useState(app.reviewDueOn);
  const [vai, setVai] = useState<HubRole[]>(app.allowedRoles);
  const [gioiThieu, setGioiThieu] = useState(app.intro ?? "");

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
        });
      }}
    >
      {/* MÃ APP và RỔ DỮ LIỆU cố ý KHÔNG có ô nhập — xem khối chú thích đầu
          routers/admin.ts. Nói ra ở đây thay vì để một ô xám khoá lại: ô khoá đọc thành
          "chưa làm xong", còn dòng chữ này nói thẳng là không sửa được và vì sao. */}
      <p className="text-[11.5px] leading-relaxed text-muted2">
        Mã app (<span className="font-mono">{app.appId}</span>) và rổ dữ liệu không sửa được: mã nằm trong URL,
        trong mọi webhook app đang gửi và trong alias đã sinh cho từng em; rổ dữ liệu là thứ Hội đồng dữ liệu
        duyệt. Muốn đổi thì tắt app này và khai app mới — chậm hơn, và chậm ở đây là cố ý.
      </p>

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
                    : "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] font-bold text-[#33507C]"
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
          <p className="mt-1.5 text-[11.5px] font-bold text-[#8A5A00]">
            Không chọn vai nào = không ai mở được app. Đó là trạng thái hợp lệ (và là mặc định của app mới),
            chỉ cần biết là mình đang chọn nó.
          </p>
        )}
      </fieldset>

      {sua.isError && (
        <p className="rounded-xl bg-[#FFF3F3] px-3 py-2 text-[12px] font-bold text-[#D2383E]">{sua.error.message}</p>
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
          className="flex min-h-[44px] items-center rounded-xl border border-line bg-white px-5 text-[13px] font-extrabold text-[#33507C]"
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
      onXong();
    },
  });

  if (!mo) {
    return (
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
  }

  return (
    <form
      className="flex w-full max-w-[520px] flex-col gap-3 rounded-2xl border border-line bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        them.mutate({
          appId: maApp.trim(),
          displayName: ten.trim(),
          basket: ro,
          owner: chuTri.trim(),
          reviewDueOn: ngayRa,
          allowedRoles: [],
          allowedEventTypes: [],
          origin: origin.trim() || null,
          iframeUrl: iframeUrl.trim() || null,
          webhookSecretEnv: bienSecret.trim() || null,
        });
      }}
    >
      <div className="text-[14px] font-black text-navy">Khai một Mini App mới</div>
      {/* Nói TRƯỚC, không nói sau khi bấm: app mới luôn tắt và chưa cấp cho vai nào. Người
          khai cần biết mình vừa tạo ra một dòng chưa hoạt động, chứ không đi tìm xem vì
          sao app không hiện trên trang chủ. */}
      <p className="rounded-xl bg-[#F1F4F8] px-3 py-2 text-[11.5px] leading-relaxed text-[#33507C]">
        App khai xong sẽ ở trạng thái <b>TẮT</b> và <b>chưa cấp cho vai nào</b>. Bật và cấp vai là hai bước
        riêng — cố ý, để "app này tồn tại" không bị bấm chung một nhịp với "app này được chạm vào dữ liệu học sinh".
      </p>

      <O nhan="Mã app" goiY="Chữ thường, số và gạch ngang. Sẽ thành đường /embed/<mã app> — không đổi được về sau.">
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
        goiY="Fitness và căn tin NGHE như rổ Xanh nhưng là rổ VÀNG — chúng ghi chỉ số cơ thể và dị ứng của từng em. Chỉ app hiển thị nội dung chung cho cả trường mới là Xanh."
      >
        <select value={ro} onChange={(e) => setRo(e.target.value as "xanh" | "vang")} className={O_INPUT}>
          <option value="xanh">Xanh — không gắn tên em nào</option>
          <option value="vang">Vàng — có gắn tên từng em</option>
        </select>
      </O>
      <O nhan="Người chịu trách nhiệm" goiY="Tên đội làm app + dev lõi bảo trợ.">
        <input value={chuTri} onChange={(e) => setChuTri(e.target.value)} maxLength={120} required className={O_INPUT} />
      </O>
      <O nhan="Ngày rà lại" goiY="Thường là 6 tháng kể từ hôm nay. Quá hạn thì màn này bật đèn đỏ.">
        <input type="date" value={ngayRa} onChange={(e) => setNgayRa(e.target.value)} required className={O_INPUT} />
      </O>
      <O nhan="Origin (bỏ trống nếu app không có UI nhúng)" goiY="Dạng https://ten-mien — không kèm đường dẫn, không dấu / cuối.">
        <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://app.vidu.vn" className={`${O_INPUT} font-mono`} />
      </O>
      <O nhan="URL nạp vào iframe" goiY="Phải nằm trong origin ở trên. Thường là một trang riêng cho ngữ cảnh nhúng, không phải trang chủ của app.">
        <input value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} placeholder="https://app.vidu.vn/embed" className={`${O_INPUT} font-mono`} />
      </O>
      <O
        nhan="Tên biến môi trường chứa secret webhook"
        goiY="CHỈ tên biến, không phải giá trị. Giá trị đặt trên máy chủ và không bao giờ vào cơ sở dữ liệu."
      >
        <input
          value={bienSecret}
          onChange={(e) => setBienSecret(e.target.value.toUpperCase())}
          placeholder="EMBED_WEBHOOK_SECRET_TENAPP"
          className={`${O_INPUT} font-mono`}
        />
      </O>

      {them.isError && (
        <p className="rounded-xl bg-[#FFF3F3] px-3 py-2 text-[12px] font-bold text-[#D2383E]">{them.error.message}</p>
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
          className="flex min-h-[44px] items-center rounded-xl border border-line bg-white px-5 text-[13px] font-extrabold text-[#33507C]"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}
