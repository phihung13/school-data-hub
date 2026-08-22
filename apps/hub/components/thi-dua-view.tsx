// Bảng thi đua — ADR-037 (21/08/2026), hạng mục lấy từ sơ đồ AI OS của cấp trên.
//
// ═══════════════════════════════════════════════════════════════════════════
// BỐN QUYẾT ĐỊNH THIẾT KẾ, và mỗi cái là một cách màn này có thể làm tổn thương một đứa trẻ
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. **KHÔNG in hạng chót, không đếm ngược từ dưới lên.** Bảng chỉ hiện top-N và dòng
//    của chính em. Một danh sách 109 tên xếp từ cao xuống thấp thì em cuối cùng đọc
//    được đúng một thông tin về mình, và đó là thông tin em không xin.
//
// 2. **Dòng của chính em LUÔN có mặt**, kể cả khi em đứng ngoài top-N — hiện thành một
//    dải riêng ở dưới. Một bảng top-20 mà em thứ 87 không thấy mình ở đâu thì cảm giác
//    "mình không có trên bảng" nặng hơn hẳn con số 87.
//
// 3. **KHÔNG nói vì sao ai đó điểm thấp.** `chiTiet` thô (số ngày chuỗi, số lượt mở app)
//    ở lại tầng dữ liệu. Điểm sinh một phần từ chuyên cần, nên in chi tiết ra là mời cả
//    trường suy ngược "em này nghỉ mấy hôm".
//
// 4. **Nói ra ĐỘ TƯƠI, ngay tại chỗ có số.** Rev F.8: ô số nào phụ thuộc lượt quét thì
//    chính ô đó phải nói mình là số cũ. Bảng này đứng trọn trên một job đêm; job chết
//    một tuần thì bảng đứng im mà không ai biết — trừ khi nó tự nói.
//
// §8 — giọng: đây là màn học sinh đọc, nên không có chữ "quét", "ngưỡng", "cờ" nào.
"use client";

import { trpc } from "@/lib/trpc-client";
import type { HubRole } from "@hub/core/contracts";
import { HubSidebar } from "./hub-sidebar";
import { MainContent } from "./page-shell";
import { StudentTabBar } from "./tab-bar";
import { ErrorState, LoadingState } from "./ui/query-state";

/** Huy hiệu ba hạng đầu. Từ hạng 4 trở đi chỉ in số — không có "hạng bét" nào cả. */
const HUY_HIEU: Record<number, { icon: string; mau: string }> = {
  1: { icon: "emoji_events", mau: "text-gold-textDark" },
  2: { icon: "military_tech", mau: "text-[#6B7789]" },
  3: { icon: "military_tech", mau: "text-[#8A5A00]" },
};

/**
 * "2026-08-21T04:12:33.123Z" → "21/08 lúc 11:12".
 *
 * Tự cắt chuỗi thay vì `new Date().toLocaleString()`: `toLocaleString` mượn múi giờ và
 * ICU của MÁY NGƯỜI DÙNG, nên một em để máy sai múi giờ sẽ đọc một mốc lệch mà không ai
 * thấy. Máy chủ đã ghim `Asia/Ho_Chi_Minh` (client.ts) nên chuỗi tới đây đã đúng giờ VN.
 */
function docMoc(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]} lúc ${m[4]}:${m[5]}`;
}

export function ThiDuaView({
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
  const bang = trpc.thiDua.getBangXepHang.useQuery({ gioiHan: 20 });
  const d = bang.data;

  // Em đứng ngoài top-N: hiện dòng của em thành một dải riêng. Trong top-N rồi thì
  // không lặp lại — dòng của em đã được tô đậm sẵn ở trên.
  // Nhan ra "em da co mat trong top-N chua" bang co `laToi` -- khong so id, vi id cua
  // mot dua tre co y KHONG di ra khoi may chu nua (migration 0064).
  const toiNgoaiBang = d?.toiDangODau && !d.caNhan.some((r) => r.laToi) ? d.toiDangODau : null;

  return (
    <div className="flex min-h-screen w-full flex-col md:h-screen md:min-h-0 md:flex-row md:overflow-hidden">
      <div className="hidden md:flex md:w-[240px] md:flex-none">
        <HubSidebar roles={roles} active="thi-dua" fullName={displayName} email={email} classCode={classCode} />
      </div>

      <MainContent className="flex min-w-0 flex-1 flex-col bg-pagebgDesktop md:overflow-hidden">
        <div className="flex flex-none items-center gap-3.5 border-b border-[#E9ECF2] bg-white px-4 py-3 md:px-7 md:py-3.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-black text-ink">Bảng thi đua</h1>
            {/* ĐỘ TƯƠI đứng ngay dưới tiêu đề, không giấu trong một góc. Ca "chưa tính
                lần nào" nay KHÔNG in gì (chủ đầu tư 22/08/2026 bỏ câu cảnh báo) — dòng
                này biến mất thay vì nói một câu khác. */}
            {bang.data?.tinhLuc && (
              <div className="text-[11.5px] text-caption">
                {`Điểm tính tới ${docMoc(bang.data.tinhLuc)} · 30 ngày gần đây`}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 px-4 py-4 md:overflow-y-auto md:px-7 md:py-6">
          {bang.isPending && <LoadingState label="Đang xem bảng thi đua…" />}
          {bang.error && <ErrorState error={bang.error} onRetry={() => void bang.refetch()} />}

          {d && (
            <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
              {/* ── Xếp hạng cá nhân ───────────────────────────────────────── */}
              <section className="rounded-[18px] border border-[#E4E9F0] bg-white p-4">
                <h2 className="text-[14px] font-black text-navy">Cá nhân</h2>
                {d.caNhan.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-muted2">
                    Chưa có điểm nào trong 30 ngày gần đây.
                  </p>
                ) : (
                  <ol className="mt-2 flex flex-col">
                    {d.caNhan.map((r, i) => (
                      // Khoa theo vi tri: danh sach nay chi DOC, khong sap lai, khong
                      // them bot tung dong -- nen vi tri la khoa on dinh, va no khong
                      // doi mot id ma may chu co y khong gui ra.
                      <DongCaNhan key={i} r={r} />
                    ))}
                  </ol>
                )}

                {toiNgoaiBang && (
                  <>
                    {/* Dấu ngắt: nói rõ đây không phải hạng kế tiếp của danh sách trên. */}
                    <div className="my-1.5 flex items-center gap-2 px-1 text-[11px] text-caption">
                      <span className="h-px flex-1 bg-[#E9ECF2]" />
                      <span>vị trí của con</span>
                      <span className="h-px flex-1 bg-[#E9ECF2]" />
                    </div>
                    <ol className="flex flex-col">
                      <DongCaNhan r={toiNgoaiBang} />
                    </ol>
                  </>
                )}
              </section>

              {/* ── Lớp và khối ─────────────────────────────────────────────
                  Xếp theo ĐIỂM TRUNG BÌNH mỗi em: xếp bằng tổng thì lớp đông luôn
                  thắng, và bảng đo sĩ số chứ không đo thi đua. */}
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-[18px] border border-[#E4E9F0] bg-white p-4">
                  <h2 className="text-[14px] font-black text-navy">Lớp</h2>
                  <p className="mt-0.5 text-[11px] text-caption">Điểm trung bình mỗi bạn</p>
                  <ol className="mt-2 flex flex-col">
                    {d.lop.map((r) => (
                      <li
                        key={r.lop}
                        className={`flex min-h-[44px] items-center gap-3 rounded-xl px-2.5 ${
                          r.laLopToi ? "bg-[#EAF3FF]" : ""
                        }`}
                      >
                        <ThuHang hang={r.thuHang} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                          {r.lop}
                          {r.laLopToi && <span className="ml-1.5 text-[11px] font-black text-link">lớp con</span>}
                        </span>
                        <span className="text-[13px] font-black text-navy">{r.diemTrungBinh}</span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="rounded-[18px] border border-[#E4E9F0] bg-white p-4">
                  <h2 className="text-[14px] font-black text-navy">Khối</h2>
                  <p className="mt-0.5 text-[11px] text-caption">Điểm trung bình mỗi bạn</p>
                  <ol className="mt-2 flex flex-col">
                    {d.khoi.map((r) => (
                      <li key={r.khoi} className="flex min-h-[44px] items-center gap-3 rounded-xl px-2.5">
                        <ThuHang hang={r.thuHang} />
                        <span className="min-w-0 flex-1 text-[13px] font-bold text-ink">Khối {r.khoi}</span>
                        <span className="text-[13px] font-black text-navy">{r.diemTrungBinh}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </div>
          )}
        </div>
      </MainContent>

      {roles.includes("student") && (
        <div className="md:hidden">
          <StudentTabBar fullName={displayName} email={email} />
        </div>
      )}
    </div>
  );
}

/**
 * Ô thứ hạng. Ba hạng đầu có huy hiệu; từ hạng 4 chỉ có số.
 *
 * Màu KHÔNG bao giờ là tín hiệu duy nhất (§11): con số hạng luôn có mặt dưới dạng chữ
 * cho trình đọc màn hình, kể cả ở ba hạng có icon.
 */
function ThuHang({ hang }: { hang: number }) {
  const hh = HUY_HIEU[hang];
  return (
    <span className="flex w-[34px] flex-none items-center justify-center">
      {hh ? (
        <>
          <span aria-hidden className={`msr text-[21px] ${hh.mau}`}>{hh.icon}</span>
          <span className="sr-only">Hạng {hang}</span>
        </>
      ) : (
        <span className="text-[13px] font-black text-caption">{hang}</span>
      )}
    </span>
  );
}

function DongCaNhan({ r }: { r: { hoTen: string; lop: string; tongDiem: number; thuHang: number; laToi: boolean } }) {
  return (
    <li
      className={`flex min-h-[44px] items-center gap-3 rounded-xl px-2.5 ${r.laToi ? "bg-[#EAF3FF]" : ""}`}
    >
      <ThuHang hang={r.thuHang} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
        {r.hoTen}
        {r.laToi && <span className="ml-1.5 text-[11px] font-black text-link">con</span>}
      </span>
      <span className="text-[11.5px] text-caption">{r.lop}</span>
      <span className="w-[46px] text-right text-[13px] font-black text-navy">{r.tongDiem}</span>
    </li>
  );
}
