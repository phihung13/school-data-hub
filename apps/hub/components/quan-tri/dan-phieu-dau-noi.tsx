// apps/hub/components/quan-tri/dan-phieu-dau-noi.tsx — DÁN MỘT PHÁT RA APP.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VIỆC NÀY LÀ GÌ
// ═══════════════════════════════════════════════════════════════════════════════
// Chủ đầu tư, 07/08/2026: *"lần nào cần cắm app khác thì tôi download đưa file đó cho họ
// sửa, sau đó họ trả về cái gì kiểu dạng json theo đúng template thì copy paste vào đó phát
// là ra app, khỏi cần điền từng tí 1"*.
//
// Nên màn này có đúng ba bước: tải bản yêu cầu → nhận JSON → dán. Không ô nào phải gõ tay.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CÓ MỘT BƯỚC XEM TRƯỚC, VÀ NÓ KHÔNG PHẢI THỦ TỤC
// ═══════════════════════════════════════════════════════════════════════════════
// Dán thẳng rồi tạo luôn là nhanh hơn một cú bấm. Nhưng thứ đang dán đến từ NGOÀI tổ chức,
// và hai trường trong đó quyết định app chạm được gì:
//   · `roDuLieu` — khai `xanh` cho một app thật ra có gắn tên từng em là đi vòng qua Hội
//     đồng dữ liệu, và không ai nhìn thấy điều đó trong một chuỗi JSON 20 dòng.
//   · `sso.scopes` — `hub_profile` cho ra vai, cơ sở, lớp của người đăng nhập.
// Bảng xem trước dựng lại phiếu thành TIẾNG VIỆT, chữ to, đúng hai dòng đó nổi lên. Người
// duyệt đọc một bảng, không đọc JSON.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LỖI PHẢI CHỈ ĐÍCH DANH — "JSON không hợp lệ" là một câu vô dụng
// ═══════════════════════════════════════════════════════════════════════════════
// Người dán không phải kỹ sư và không sửa được phiếu; họ phải gửi lại cho đội làm app một
// câu đủ rõ để đội đó biết sửa dòng nào. Nên mọi lỗi ở đây đều mang TÊN KHOÁ, và bốn khoá
// "nhà trường quyết" có câu riêng nói vì sao chúng bị từ chối (`KHOA_NHA_TRUONG_QUYET`).
"use client";

import { useState } from "react";
import {
  KHOA_NHA_TRUONG_QUYET,
  PhieuDauNoi,
  phieuThanhKhaiBao,
  type CreateMiniAppInput,
} from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { HopThoai } from "../ui/hop-thoai";

const NHAN_RO: Record<string, string> = {
  xanh: "Rổ Xanh — không gắn tên em nào",
  vang: "Rổ Vàng — có gắn tên từng em",
};

/** Ngày rà lại mặc định: hôm nay + 6 tháng (mục 5 của 08-embedded-apps.md). */
function ngayRaLaiMacDinh(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Chuỗi dán → phiếu, hoặc một danh sách câu lỗi TIẾNG VIỆT có tên khoá.
 *
 * Trả `loi: string[]` chứ không ném: người dán cần thấy HẾT chỗ sai một lượt để gửi lại cho
 * đội làm app trong một email, không phải sửa một lỗi rồi phát hiện lỗi tiếp theo.
 */
function docPhieu(thoChu: string): { phieu: PhieuDauNoi } | { loi: string[] } {
  const s = thoChu.trim();
  if (!s) return { loi: ["Chưa dán gì."] };

  let tho: unknown;
  try {
    tho = JSON.parse(s);
  } catch {
    // Ca hay gặp nhất trong thực tế: đội làm app (hoặc AI của họ) gửi kèm một câu dẫn, hoặc
    // bọc JSON trong ```json. Nói đúng bệnh thay vì "JSON không hợp lệ".
    const nghiNgo = /```/.test(s)
      ? 'Chuỗi dán còn dấu ``` bọc ngoài — dán phần bên trong thôi.'
      : !s.startsWith("{")
        ? "Chuỗi dán không bắt đầu bằng { — có chữ thừa ở đầu (lời chào, câu dẫn)."
        : "Không đọc được JSON — có thể thiếu dấu ngoặc, thừa dấu phẩy, hoặc dính chữ ở cuối.";
    return { loi: [nghiNgo, "Bản yêu cầu đòi đội làm app trả về ĐÚNG một khối JSON, không chữ nào khác."] };
  }

  const kq = PhieuDauNoi.safeParse(tho);
  if (kq.success) return { phieu: kq.data };

  const loi = kq.error.issues.map((i) => {
    const duong = i.path.join(".");
    if (i.code === "unrecognized_keys") {
      return i.keys
        .map((k) =>
          KHOA_NHA_TRUONG_QUYET[k]
            ? `Phiếu khai “${k}” — không được khai: ${KHOA_NHA_TRUONG_QUYET[k]}.`
            : `Khoá lạ “${k}”${duong ? ` trong ${duong}` : ""} — không có trong bản yêu cầu.`,
        )
        .join(" ");
    }
    return duong ? `${duong}: ${i.message}` : i.message;
  });
  return { loi: [...new Set(loi)] };
}

export function DanPhieuDauNoi({ onXong }: { onXong: () => void }) {
  const [mo, setMo] = useState(false);
  const [thoChu, setThoChu] = useState("");
  const [phieu, setPhieu] = useState<PhieuDauNoi | null>(null);
  const [loi, setLoi] = useState<string[]>([]);

  const them = trpc.admin.miniApp.create.useMutation({
    onSuccess: () => {
      setMo(false);
      setThoChu("");
      setPhieu(null);
      setLoi([]);
      onXong();
    },
  });

  const nut = (
    <button
      type="button"
      onClick={() => setMo(true)}
      className="flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-line2 bg-white px-4 text-[13px] font-extrabold text-cardtitle2"
    >
      {/* `assignment`, không phải `content_paste`: font đã cắt gọn không có tên kia, và một
          tên ngoài danh sách vẽ ra Ô TRỐNG chứ không báo lỗi (tests/unit/a11y.test.ts canh). */}
      <span className="msr text-[18px]" aria-hidden>
        assignment
      </span>
      Dán phiếu đấu nối
    </button>
  );

  if (!mo) return nut;

  const khaiBao: CreateMiniAppInput | null = phieu ? phieuThanhKhaiBao(phieu, ngayRaLaiMacDinh()) : null;

  return (
    <>
      {/* Nút ở lại dưới lớp phủ — cùng lý do đã ghi ở `NutThemApp`: bố cục trang không được
          đổi một pixel nào khi hộp mở, và tiêu điểm phải có chỗ trả về khi đóng. */}
      {nut}
      <HopThoai
        tieuDe="Dán phiếu đấu nối"
        moTa="Dán khối JSON đội làm app gửi về. Xem lại rồi mới khai."
        rong="max-w-[720px]"
        onDong={() => setMo(false)}
      >
        <div className="flex flex-col gap-3">
          <a
            href="/api/quan-tri/ban-yeu-cau-dau-noi"
            download
            className="flex min-h-[44px] items-center gap-1.5 self-start rounded-xl bg-chip px-4 text-[12.5px] font-extrabold text-navy"
          >
            <span className="msr text-[18px]" aria-hidden>
              download
            </span>
            Tải bản yêu cầu gửi đội làm app
          </a>

          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-black uppercase tracking-wide text-muted">Phiếu JSON</span>
            <textarea
              value={thoChu}
              onChange={(e) => {
                setThoChu(e.target.value);
                setPhieu(null);
                setLoi([]);
              }}
              rows={8}
              spellCheck={false}
              placeholder={'{\n  "phienBan": 1,\n  "maApp": "…",\n  …\n}'}
              className="w-full rounded-xl border border-line bg-white p-3 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-navy"
            />
          </label>

          {loi.length > 0 && (
            // role="alert": người dùng bàn phím bấm "Đọc phiếu" thì tiêu điểm còn ở nút, và
            // không có tín hiệu nào phân biệt "đọc xong" với "phiếu sai" nếu lỗi chỉ là chữ đỏ.
            <div role="alert" className="rounded-xl bg-surface-danger px-3 py-2.5">
              <div className="text-[11px] font-black uppercase tracking-wide text-dangerText">
                Phiếu chưa dùng được — gửi lại đội làm app
              </div>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-[12px] font-semibold text-ink">
                {loi.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {khaiBao && phieu && <XemTruoc phieu={phieu} khaiBao={khaiBao} />}

          {them.isError && (
            <p role="alert" className="rounded-xl bg-surface-danger px-3 py-2 text-[12px] font-bold text-dangerText">
              {them.error.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!phieu ? (
              <button
                type="button"
                onClick={() => {
                  const kq = docPhieu(thoChu);
                  if ("phieu" in kq) {
                    setPhieu(kq.phieu);
                    setLoi([]);
                  } else {
                    setPhieu(null);
                    setLoi(kq.loi);
                  }
                }}
                className="flex min-h-[44px] items-center rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 text-[13px] font-black text-white"
              >
                Đọc phiếu
              </button>
            ) : (
              <button
                type="button"
                disabled={them.isPending}
                onClick={() => them.mutate(khaiBao!)}
                className="flex min-h-[44px] items-center rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 text-[13px] font-black text-white disabled:opacity-50"
              >
                {them.isPending ? "Đang khai…" : "Khai app này"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMo(false)}
              className="flex min-h-[44px] items-center rounded-xl border border-line bg-white px-5 text-[13px] font-extrabold text-cardtitle2"
            >
              Huỷ
            </button>
          </div>
        </div>
      </HopThoai>
    </>
  );
}

// ---------------------------------------------------------------------------
// Xem trước — bảng tiếng Việt, không phải JSON tô màu
// ---------------------------------------------------------------------------

function Hang({ nhan, children, nhanManh }: { nhan: string; children: React.ReactNode; nhanManh?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-line py-1.5 last:border-b-0">
      <div className="w-full text-[10.5px] font-black uppercase tracking-wide text-muted sm:w-[150px] sm:flex-none">
        {nhan}
      </div>
      <div className={`min-w-0 flex-1 text-[12.5px] ${nhanManh ? "font-black text-navy" : "font-semibold text-ink"}`}>
        {children}
      </div>
    </div>
  );
}

function XemTruoc({ phieu, khaiBao }: { phieu: PhieuDauNoi; khaiBao: CreateMiniAppInput }) {
  const coScopeVai = phieu.sso?.scopes.includes("hub_profile") ?? false;

  return (
    <section className="rounded-2xl border border-line bg-surface-alt p-3">
      {/* <h3>: khối con của <h2> tiêu đề hộp thoại. */}
      <h3 className="text-[13px] font-black text-navy">Sẽ khai app này</h3>
      <div className="mt-1.5">
        <Hang nhan="Mã app" nhanManh>
          <span className="font-mono">{phieu.maApp}</span>
        </Hang>
        <Hang nhan="Tên hiện ra">{phieu.tenHienThi}</Hang>
        {/* Rổ dữ liệu in ĐẬM, không lẫn vào hàng khác — xem chú thích đầu file. */}
        <Hang nhan="Rổ dữ liệu" nhanManh>
          {NHAN_RO[phieu.roDuLieu] ?? phieu.roDuLieu}
        </Hang>
        <Hang nhan="Chịu trách nhiệm">{phieu.doiChiuTrachNhiem}</Hang>
        <Hang nhan="Nhúng">
          {phieu.nhung ? <span className="font-mono text-[11.5px]">{phieu.nhung.urlIframe}</span> : "Không"}
        </Hang>
        <Hang nhan="Gửi dữ liệu về">
          {phieu.webhook ? (
            <span className="font-mono text-[11.5px]">{phieu.webhook.cacLoaiSuKien.join(", ")}</span>
          ) : (
            "Không"
          )}
        </Hang>
        <Hang nhan="Đăng nhập Hub" nhanManh={coScopeVai}>
          {phieu.sso ? (
            <>
              <span className="font-mono text-[11.5px]">{phieu.sso.scopes.join(" ")}</span>
              {coScopeVai && (
                <span className="ml-1.5 rounded-full bg-surface-warnSoft px-2 py-0.5 text-[10.5px] font-black text-gold-textDark">
                  Đọc được vai · cơ sở · lớp
                </span>
              )}
            </>
          ) : (
            "Không"
          )}
        </Hang>
        <Hang nhan="Ngày rà lại">{khaiBao.reviewDueOn}</Hang>
        {/* Không còn hàng "biến cần đặt": từ `0058` mọi app dùng chuỗi chung của trường cho
            cả webhook lẫn đăng nhập, nên dán phiếu xong KHÔNG còn bước nào chạm máy chủ. */}
        <Hang nhan="Chuỗi bí mật">
          <span className="font-semibold text-successText">Chuỗi chung của trường — không phải đặt gì</span>
        </Hang>
      </div>

      {/* Hai điều KHÔNG có trong phiếu và người duyệt phải biết là mình vẫn còn hai bước nữa.
          Không phải chữ trấn an: đây là hai việc họ sẽ phải làm ngay sau khi bấm. */}
      <p className="mt-2 rounded-xl bg-surface-infoSoft px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-cardtitle2">
        Khai xong app <b>TẮT</b> và <b>chưa cấp cho vai nào</b>. Cấp vai và bật ở thẻ app; đặt biến bí mật trên máy
        chủ.
      </p>
    </section>
  );
}
