// apps/hub/components/quan-tri/xem-truoc-vai-view.tsx — trang chủ của MỌI VAI, cạnh nhau.
//
// ═══════════════════════════════════════════════════════════════════════════════
// MÀN NÀY TRẢ LỜI ĐÚNG MỘT CÂU CHỦ ĐẦU TƯ HỎI
// ═══════════════════════════════════════════════════════════════════════════════
// "Trang home của mỗi người bị phân mảnh, tôi khó kiểm soát hết được." (02/08/2026)
//
// Trước hôm nay, cách DUY NHẤT để biết một phụ huynh nhìn thấy gì là đăng nhập bằng tài
// khoản phụ huynh. Muốn biết cả sáu vai thì phải đăng nhập sáu lần, và không lần nào
// nhìn được hai vai cùng lúc để mà so. Với một hệ mà "ai thấy gì" LÀ hàng rào, đó không
// phải bất tiện — đó là mất khả năng kiểm.
//
// Nay: một trang, sáu cột, đọc từ CHÍNH bản khai mà sản phẩm thật đang chạy.
//
// ── ĐIỀU QUAN TRỌNG NHẤT: KHÔNG ĐƯỢC DỰNG LẠI PHÉP TÍNH ────────────────────────
// Cám dỗ là viết ở đây một bảng "vai này thấy gì" cho dễ đọc. Làm thế là dựng NGUỒN THỨ
// HAI, và nguồn thứ hai thì sẽ lệch — lúc đó màn xem trước sẽ nói dối đúng về cái nó
// sinh ra để canh, và nói dối một cách rất thuyết phục.
//
// Nên nó gọi `manChoLuoi/manChoMenu/manChoTab` — cùng ba hàm mà lưới, menu và thanh tab
// thật đang gọi. Nếu ba hàm đó sai thì màn này sai theo, và đó là hành vi ĐÚNG: nó phải
// phản chiếu sản phẩm, không phải mô tả sản phẩm.
"use client";

import { useState } from "react";
import type { HubRole, MiniAppRow } from "@hub/core/contracts";
import { trpc } from "@/lib/trpc-client";
import { manChoLuoi, manChoMenu, manChoTab, type MucDieuHuong } from "@/lib/man-hinh";
import { OperationsShell, Card } from "../dieu-hanh/operations-shell";
import { ErrorState, LoadingState } from "../ui/query-state";
import { canOpenEmbedAppRoles } from "@/lib/vai-app-ngoai";

/**
 * Sổ đăng ký app ngoài đã đọc tới đâu. Ba trạng thái, KHÔNG phải hai.
 *
 * Vì sao phải đi xuống tận từng cột (đo 05/08/2026): trước hôm nay màn này chỉ đọc
 * `apps.data?.apps` và không có nhánh nào cho `isPending`/`error`. Query hỏng thì
 * `data` mãi là `undefined`, `appNgoai` thành mảng rỗng, và sáu cột nói câu
 * "Không ô nào — người này mở Hub ra thấy lưới trống" — một câu KHẲNG ĐỊNH về phân
 * quyền, phát ra từ chỗ chưa hỏi được máy chủ.
 *
 * Đó đúng là kiểu nói dối màn này sinh ra để chặn: nó là công cụ KIỂM, nên một kết
 * luận sai ở đây thuyết phục hơn ở bất cứ màn nào khác.
 */
type TrangThaiApp = "dang-tai" | "loi" | "xong";

/**
 * Sáu vai, mỗi vai một cột. KHÔNG lấy động từ danh sách vai của hệ: thứ tự và cách gộp ở
 * đây là quyết định của người đọc màn này — họ muốn xem "một cô giáo bình thường" chứ
 * không muốn xem tám ô tích rời rạc. `admin+principal` có mặt vì đó là tổ hợp THẬT của
 * tài khoản quản trị duy nhất trong hệ, và tổ hợp mới là thứ hay lộ lỗi.
 */
const CAC_VAI: Array<{ ten: string; phu: string; vai: HubRole[] }> = [
  { ten: "Học sinh", phu: "em đang học", vai: ["student"] },
  { ten: "Phụ huynh", phu: "bố mẹ của em", vai: ["guardian"] },
  { ten: "Chủ nhiệm", phu: "cô giáo có lớp", vai: ["homeroom"] },
  { ten: "Giáo viên bộ môn", phu: "dạy nhưng không chủ nhiệm", vai: ["teacher"] },
  { ten: "Tâm lý cụm", phu: "cán bộ tư vấn", vai: ["counselor"] },
  { ten: "Hiệu trưởng · Quản trị", phu: "tổ hợp thật của tài khoản quản trị", vai: ["admin", "principal"] },
];

export function XemTruocVaiView({
  roles,
  displayName,
  email,
}: {
  roles: HubRole[];
  displayName: string;
  email: string;
}) {
  const apps = trpc.admin.miniApp.list.useQuery();
  const [hep, setHep] = useState(false);

  const trangThaiApp: TrangThaiApp = apps.isPending ? "dang-tai" : apps.error ? "loi" : "xong";

  return (
    <OperationsShell
      title="Trang chủ theo vai"
      subtitle="Mỗi cột = một vai nhìn thấy gì khi mở Hub"
      displayName={displayName}
      email={email}
      roles={roles}
      active="xem-truoc"
      toolbar={
        <button
          type="button"
          onClick={() => setHep((v) => !v)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line bg-card px-4 text-[12.5px] font-extrabold text-cardtitle2"
        >
          <span className="msr text-[18px]" aria-hidden>
            {/* `space_dashboard` / `view_list` — font đã cắt gọn không có `view_column`
                lẫn `view_agenda`, và tên ngoài danh sách vẽ ra một Ô TRỐNG chứ không báo
                lỗi. Cổng `a11y.test.ts` bắt được ngay lượt chạy đầu. */}
            {hep ? "space_dashboard" : "view_list"}
          </span>
          {hep ? "Xếp cạnh nhau" : "Xếp dọc từng vai"}
        </button>
      }
    >
      {/* GẤP LẠI 06/08/2026. Ba câu này chiếm nguyên một thẻ trắng đứng trên sáu cột —
          tức là thứ đầu tiên đọc được, trong khi màn sinh ra để SO SÁNH sáu cột.
          KHÔNG bỏ: đây là chỗ duy nhất nói ra mức tin cậy của cả màn ("nếu bảng này sai
          thì sản phẩm cũng đang sai"), và người mở màn này là người đi kiểm. */}
      <details className="text-[12.5px] leading-relaxed text-cardtitle2">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-bold">
          Bảng này phản chiếu sản phẩm, không mô tả nó
          <span className="ml-1 font-black text-link">— vì sao?</span>
        </summary>
        <p className="mt-1.5">
          Nó gọi đúng ba hàm mà lưới, menu và thanh tab thật đang gọi. Sửa một dòng trong{" "}
          <span className="font-mono text-[11.5px]">apps/hub/lib/man-hinh.ts</span> là thấy đổi ở đây ngay.
          Nếu bảng này sai thì sản phẩm cũng đang sai y như vậy.
        </p>
      </details>

      {/* Trạng thái của SỔ ĐĂNG KÝ APP NGOÀI, nói ở đầu màn. Sáu cột bên dưới vẫn dựng
          được mà không cần sổ này — phần màn của chính Hub đọc từ bản khai trong mã, luôn
          có sẵn — nên không chặn cả màn; nhưng người xem phải biết ngay là mình đang đọc
          một bức tranh còn thiếu một mảng. */}
      {apps.isPending && <LoadingState label="Đang đọc danh sách app ngoài…" />}
      {apps.error && (
        <ErrorState
          error={apps.error}
          label="danh sách app ngoài"
          onRetry={() => void apps.refetch()}
        />
      )}

      {/* Sáu cột trên máy tính; ở khổ hẹp hoặc khi người dùng chọn, xếp dọc từng vai một.
          Lưới `auto-fit minmax` chứ không phải số cột cố định: sáu cột cứng ở 1280px cho ra
          mỗi cột ~200px, đủ chật để tên mục bị cắt — mà tên mục CHÍNH LÀ thứ cần đọc. */}
      <div
        className={
          hep
            ? "flex flex-col gap-4"
            : "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]"
        }
      >
        {CAC_VAI.map((v) => (
          <CotVai
            key={v.ten}
            ten={v.ten}
            phu={v.phu}
            vai={v.vai}
            apps={apps.data?.apps}
            trangThaiApp={trangThaiApp}
          />
        ))}
      </div>
    </OperationsShell>
  );
}

function CotVai({
  ten,
  phu,
  vai,
  apps,
  trangThaiApp,
}: {
  ten: string;
  phu: string;
  vai: HubRole[];
  apps: MiniAppRow[] | undefined;
  trangThaiApp: TrangThaiApp;
}) {
  const luoi = manChoLuoi(vai);
  const menu = manChoMenu(vai);
  const tab = manChoTab(vai);

  // App ngoài đang BẬT và cấp cho vai này. Dùng lại đúng phép so vai của
  // `canOpenEmbedApp` — xem lý lẽ ở lib/vai-app-ngoai.ts.
  const appNgoai = (apps ?? []).filter((a) => a.enabled && canOpenEmbedAppRoles(a.allowedRoles, vai));

  return (
    <Card className="flex flex-col gap-3">
      <div>
        {/* <h2> chứ không phải <div>: sáu cột này là sáu khối ngang cấp dưới <h1> của
            khung màn. Người đọc bằng tai nhảy giữa các vai bằng phím tiêu đề; một cột
            không có tiêu đề thì không nhảy tới được, và cả trang đọc thành một dòng
            danh sách dài không có mốc nào. Giữ nguyên class, chỉ đổi thẻ. */}
        <h2 className="text-[15px] font-black text-cardtitle">{ten}</h2>
        <div className="mt-0.5 text-[11.5px] text-caption">{phu}</div>
      </div>

      <Khoi
        nhan="Lưới trang chủ"
        trong={
          trangThaiApp === "xong"
            ? "Không ô nào — người này mở Hub ra thấy lưới trống"
            : "Chưa kết luận được — app ngoài chưa đọc được"
        }
      >
        {[
          ...luoi.map((m) => <Muc key={m.key} m={m} />),
          ...appNgoai.map((a) => (
            <li
              key={a.appId}
              className="flex items-center gap-2 rounded-lg bg-[#12244A] px-2.5 py-1.5 text-[12px]"
            >
              <span className="msr text-[16px] text-caption" aria-hidden>
                auto_awesome
              </span>
              <span className="min-w-0 flex-1 truncate font-bold text-ink">{a.displayName}</span>
              {/* Nói rõ ô này đến từ SỔ ĐĂNG KÝ chứ không từ bản khai — hai nguồn, hai
                  cách sửa: một cái sửa bằng mã, một cái sửa bằng nút trên màn quản trị. */}
              <span className="flex-none rounded-full bg-card px-2 py-0.5 text-[9.5px] font-black text-muted">
                app ngoài
              </span>
            </li>
          )),
          // Dòng NÓI RA chỗ còn thiếu, đứng ngay trong khối lưới. Đặt ở đây chứ không chỉ
          // ở băng lỗi đầu màn: người xem đang so sáu cột với nhau, mắt họ ở trong cột —
          // một lời đính chính ở đầu trang không đi cùng được với con số họ đang đọc.
          ...(trangThaiApp === "xong"
            ? []
            : [
                <li
                  key="__trang-thai-app-ngoai"
                  className="flex items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[12px] font-bold text-caption"
                >
                  <span className="msr text-[16px]" aria-hidden>
                    {trangThaiApp === "loi" ? "wifi_off" : "hourglass_empty"}
                  </span>
                  <span className="flex-1">
                    {trangThaiApp === "loi"
                      ? "Chưa đọc được app ngoài — cột này còn thiếu"
                      : "Đang đọc danh sách app ngoài…"}
                  </span>
                </li>,
              ]),
        ]}
      </Khoi>

      <Khoi nhan="Menu trái (máy tính)" trong="Không mục nào">
        {menu.map((m) => (
          <Muc key={m.key} m={m} />
        ))}
      </Khoi>

      <Khoi nhan="Thanh tab (điện thoại)" trong="Không ô nào">
        {tab.map((m) => (
          <Muc key={m.key} m={m} />
        ))}
        {/* Ô avatar KHÔNG đi qua bản khai — nó do chính thanh tab dựng, ở MỌI vai. Ghi ra
            đây vì nếu thiếu nó thì cột này đọc thành "vai này không có đường đăng xuất",
            mà đó lại đúng là thứ người xem đang đi tìm. */}
        <li className="flex items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[12px] text-caption">
          <span className="msr text-[16px]" aria-hidden>
            person
          </span>
          <span className="flex-1">Avatar · Hồ sơ, Điều khoản, Đăng xuất</span>
          <span className="flex-none text-[9.5px] font-black">mọi vai</span>
        </li>
      </Khoi>
    </Card>
  );
}

function Khoi({
  nhan,
  trong,
  children,
}: {
  nhan: string;
  /** Câu nói khi khối RỖNG. Bắt buộc — một khối rỗng không chú thích đọc thành "chưa tải xong". */
  trong: string;
  children: React.ReactNode;
}) {
  const co = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : !!children;
  return (
    <div>
      {/* <h3>: ba khối bề mặt (lưới · menu · thanh tab) nằm dưới tiêu đề vai (<h2>). */}
      <h3 className="text-[10.5px] font-black uppercase tracking-wide text-muted">{nhan}</h3>
      {co ? (
        <ul className="mt-1.5 flex flex-col gap-1">{children}</ul>
      ) : (
        <p className="mt-1.5 text-[11.5px] italic text-caption">{trong}</p>
      )}
    </div>
  );
}

function Muc({ m }: { m: MucDieuHuong }) {
  return (
    // MỜ Ở ICON, KHÔNG MỜ Ở CHỮ — cùng luật và cùng phép đo với hub-sidebar.tsx.
    // `opacity-60` cũ kéo `text-caption` xuống 2,40:1 và badge xuống 2,32:1 trên nền
    // #FAFBFD. Nay nền nhạt + badge chữ đã đủ tách mục mờ khỏi mục thật, nên chữ được trả
    // về đúng ngưỡng: caption #93A9C8 = 5,32:1 trên #FAFBFD.
    <li
      className={
        m.sapCo
          ? "flex items-center gap-2 rounded-lg bg-[#FAFBFD] px-2.5 py-1.5 text-[12px]"
          : "flex items-center gap-2 rounded-lg bg-[#12244A] px-2.5 py-1.5 text-[12px]"
      }
    >
      <span className={`msr text-[16px] text-caption ${m.sapCo ? "opacity-60" : ""}`} aria-hidden>
        {m.icon}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold text-ink">{m.nhan}</span>
      {m.sapCo ? (
        <span className="flex-none rounded-full bg-card px-2 py-0.5 text-[9.5px] font-black text-muted">
          {m.sapCo}
        </span>
      ) : (
        <span className="flex-none truncate font-mono text-[10px] text-caption">{m.href}</span>
      )}
    </li>
  );
}
