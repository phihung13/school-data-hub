// apps/hub/components/cong-checkin.tsx — CỔNG CHECK-IN dạng popup khoá app (ADR-036).
//
// ═══════════════════════════════════════════════════════════════════════════
// VÌ SAO ĐỔI TỪ CHUYỂN TRANG SANG POPUP (21/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Bản đầu của ADR-036 chặn bằng cách ĐẨY em sang `/checkin`. Chủ đầu tư bác ngay khi
// nhìn thấy, và lý lẽ đúng: *"nếu lúc vào bắt checkin thì phải hiện ra popup checkin,
// xung quanh mờ, ko thoát được, thì nó mới là khóa app, chứ vô trang checkin làm gì"*.
//
// Chuyển trang không khoá gì cả — nó chỉ đổi trang. Em bấm Back, hoặc gõ thẳng
// `/tuan-nay`, là đi tiếp. Nó cũng nói SAI về bản chất việc đang xảy ra: một trang mới
// nghĩa là "em đang ở một chỗ khác", trong khi sự thật là "app đang chờ em một việc".
// Popup nói đúng chuyện đó: app vẫn ở đấy, mờ đi, và có một việc phải xong trước.
//
// ═══════════════════════════════════════════════════════════════════════════
// KHOÁ CẢ APP, KHÔNG RIÊNG TRANG CHỦ
// ═══════════════════════════════════════════════════════════════════════════
// Cổng dựng ở `app/layout.tsx` — layout GỐC, phủ mọi trang. Bản chuyển trang trước đây
// chỉ gác `/home`, nên gõ thẳng `/tuan-nay` là đi vòng được. Nay không còn đường vòng
// nào trong tầng giao diện.
//
// Nói cho hết: đây vẫn KHÔNG phải chốt chặn dữ liệu, và vẫn không cần là. Người mở
// devtools xoá lớp phủ thì xoá được — nhưng thứ họ giành được là quyền xem trang chủ
// của chính mình mà chưa khai tâm trạng. Chốt thật của dữ liệu nằm ở RLS (§4), chỗ khác.
//
// ═══════════════════════════════════════════════════════════════════════════
// BA TRẠNG THÁI, VÀ MỘT LỖI TÔI TỰ GÂY RỒI TỰ SỬA
// ═══════════════════════════════════════════════════════════════════════════
// Bản viết đầu tiên tính `dangKhoa = batBuoc && !daGhi`, rồi dựng nút "Vào Hub" trong
// nhánh `dangKhoa && daGhi` — một điều kiện KHÔNG BAO GIỜ đúng: ghi xong thì `dangKhoa`
// tắt, và popup đóng ngay trước khi em kịp đọc câu cảm ơn. Ba trạng thái dưới đây tách
// hẳn "đã ghi" khỏi "đã đóng", vì chúng là hai việc khác nhau:
//
//   · `batBuoc && !daDong && !daGhi` → mở, KHOÁ CỨNG (không ✕, không Escape).
//   · `batBuoc && !daDong && daGhi`  → vẫn mở để em đọc câu cảm ơn, nhưng CÓ đường ra.
//   · `moTay`                        → em tự mở để đổi tâm trạng; luôn có đường ra.
"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { HubRole } from "@hub/core/contracts";
import { HopThoai } from "./ui/hop-thoai";

/**
 * `CheckinView` TẢI RỜI (21/08/2026) — và đây là một lỗi tôi tự gây rồi tự sửa.
 *
 * Cổng này đứng ở `app/layout.tsx`, tức nó có mặt trên MỌI trang. Import thẳng
 * `CheckinView` vào đây là kéo một component ~950 dòng (kèm hàng đợi IndexedDB, bộ gửi
 * lại, bốn thể màn) vào gói JS của mọi trang — kể cả trang của giáo viên, của phụ huynh,
 * và của em đã khai xong. Gói nặng thì hydrate lâu, mà trang chủ chỉ chọn được bố cục
 * máy tính SAU khi hydrate (`useIsDesktop`, xem `lib/viewport.ts`) — nên cú nháy
 * "hiện bản điện thoại rồi mới đổi" dài ra đúng bằng phần tôi vừa thêm. Chủ đầu tư đo
 * bằng mắt: *"mới vào giao diện dạng mobile ở desktop hiện 1s"*.
 *
 * `ssr: true` (mặc định) nên popup KHOÁ vẫn có trong HTML máy chủ — thứ đã đo ở lượt rà
 * trước không mất. Chỉ khác: mảnh JS ấy chỉ tải khi popup thật sự mở.
 */
const CheckinView = dynamic(() => import("./checkin-view").then((m) => m.CheckinView));

interface CongCheckinCtx {
  /** Mở popup theo ý người dùng (nút tròn giữa thanh tab) — luôn có đường ra. */
  moCheckin: () => void;
  /** Vai này có check-in không — thanh tab hỏi để khỏi vẽ một nút chết. */
  coCheckin: boolean;
  /**
   * Cổng ĐANG KHOÁ — popup đang hỏi và em chưa trả lời.
   *
   * Trang chủ đọc cờ này để KHÔNG hỏi lần thứ ba. Đo được 21/08/2026 trong HTML thật:
   * cùng một lúc, popup hỏi "Hôm nay con thấy thế nào?" và thẻ trên trang chủ hỏi
   * "Check-in cảm xúc · Đang xem hôm nay con đã check-in chưa…". Chủ đầu tư gọi đúng
   * tên: *"checkin 2 lần"*.
   */
  dangKhoa: boolean;
}

const Ctx = createContext<CongCheckinCtx>({ moCheckin: () => {}, coCheckin: false, dangKhoa: false });

/**
 * Ba trạng thái của cổng, tách thành HÀM THUẦN để test được mà không cần dựng React.
 *
 * Tách ra vì đây đúng là chỗ tôi viết sai ở bản đầu: tôi tính `dangKhoa = batBuoc &&
 * !daGhi` rồi dựng nút "Vào Hub" trong nhánh `dangKhoa && daGhi` — một điều kiện KHÔNG
 * BAO GIỜ đúng, và popup đóng sập ngay trước khi em kịp đọc câu cảm ơn. Một logic đã
 * sai một lần thì đáng có bài kiểm riêng, không phải đáng được đọc kỹ hơn.
 *
 * `daGhi` và `daDong` là HAI việc khác nhau: ghi xong không có nghĩa là đóng, và đó
 * chính là khoảng thời gian em đọc "Đã ghi nhận, cảm ơn em!".
 */
export function trangThaiCong(x: {
  batBuoc: boolean;
  daGhi: boolean;
  daDong: boolean;
  moTay: boolean;
}): { dangMo: boolean; khoaCung: boolean } {
  const congDangCho = x.batBuoc && !x.daDong;
  return { dangMo: congDangCho || x.moTay, khoaCung: congDangCho && !x.daGhi };
}

/** Dùng ở thanh tab để mở lại popup — ví dụ em muốn ĐỔI tâm trạng lúc 3 giờ chiều. */
export function useCongCheckin(): CongCheckinCtx {
  return useContext(Ctx);
}

export function CongCheckinProvider({
  batBuoc,
  displayName,
  email,
  roles,
  classCode,
  children,
}: {
  /** Máy chủ tính: em là học sinh, nhà có phiếu đồng ý, và CHƯA khai hôm nay. */
  batBuoc: boolean;
  displayName: string;
  email: string;
  roles: HubRole[];
  classCode: string | null;
  children: ReactNode;
}) {
  const [daGhi, setDaGhi] = useState(false);
  const [daDong, setDaDong] = useState(false);
  const [moTay, setMoTay] = useState(false);
  /**
   * Câu báo cho TAI, không cho mắt.
   *
   * Popup nay đóng ngay khi em chạm một ô cảm xúc — không màn xác nhận nào. Với mắt thì
   * đủ: lớp phủ biến mất và thẻ trên trang chủ đổi thành "Đã check-in hôm nay, cảm ơn
   * em!". Với TAI thì không: người dùng trình đọc màn hình nghe IM LẶNG đúng lúc vừa
   * làm việc quan trọng nhất trong ngày — chính cái lỗi mà `checkin-view.tsx` đã phải
   * sửa một lần hồi 01/08/2026, chỉ khác chỗ đứng.
   *
   * Vùng `role="status"` dưới đây nằm NGOÀI hộp thoại nên nó sống sót khi hộp bị tháo,
   * và nó `sr-only` nên không thêm một chữ nào lên màn.
   */
  const [loiBao, setLoiBao] = useState("");

  const moCheckin = useCallback(() => setMoTay(true), []);
  const laHocSinh = roles.includes("student");

  const { dangMo, khoaCung } = trangThaiCong({ batBuoc, daGhi, daDong, moTay });

  const ctx = useMemo(
    () => ({ moCheckin, coCheckin: laHocSinh, dangKhoa: khoaCung }),
    [moCheckin, laHocSinh, khoaCung],
  );

  // NỀN PHẢI BỊ `inert` KHI POPUP MỞ.
  //
  // `HopThoai` bẫy phím Tab, nhưng bẫy Tab KHÔNG che được con trỏ ảo của trình đọc màn
  // hình: người dùng NVDA/VoiceOver vẫn đọc lướt được nguyên trang phía sau, kể cả khi
  // popup đang "khoá". Với cổng này, thứ họ đọc thấy là một lời mời check-in THỨ HAI —
  // đúng cái trùng lặp vừa sửa ở tầng nhìn, nhưng ở tầng nghe thì vẫn còn.
  //
  // `inert` làm cả ba việc cùng lúc: bỏ khỏi thứ tự Tab, bỏ khỏi cây trợ năng, chặn chuột.
  //
  // Đặt bằng SPREAD trong JSX chứ không bằng `useEffect`: bản đầu dùng effect và đo ra
  // thuộc tính KHÔNG có trong HTML máy chủ trả về — effect chỉ chạy sau khi hydrate, nên
  // có một khoảng trang phía sau vẫn đọc được. Ép kiểu vì React 18 chưa biết thuộc tính
  // này (React 19 mới nhận); nó vẫn tới DOM vì React truyền thẳng mọi thuộc tính lạ viết
  // thường, và React tự gỡ khi prop biến mất ở lượt vẽ sau.
  const nenInert = (dangMo ? { inert: "" } : {}) as Record<string, string>;

  function dong() {
    setMoTay(false);
    setDaDong(true);
  }

  /**
   * Máy chủ đã nhận lượt bấm của em.
   *
   * `setDaGhi(true)` chạy Ở CẢ HAI CA — đó là thứ mở khoá. Em đã làm phần của mình rồi;
   * nhốt tiếp là nhốt em vì một việc em không tự sửa được (phiếu đồng ý là của bố mẹ).
   *
   * Đóng thì CÓ ĐIỀU KIỆN — chỉ đóng khi MÁY CHỦ ĐÃ XÁC NHẬN và tâm trạng thật sự vào
   * kho. Hai ca còn lại (chưa có phiếu đồng ý · đang chờ mạng) để hộp ở lại, vì ở đó có
   * một chuyện em cần biết mà không chỗ nào khác nói. Lúc ấy hộp đã có nút ✕, vì
   * `khoaCung` vừa tắt theo `daGhi`.
   */
  function ghiXong({ moodSaved, choMang }: { moodSaved: boolean; choMang: boolean }) {
    setDaGhi(true);
    if (!moodSaved || choMang) return;
    setLoiBao("Đã ghi tâm trạng của con. Cảm ơn con!");
    dong();
  }

  return (
    <Ctx.Provider value={ctx}>
      <div {...nenInert}>{children}</div>
      {dangMo && (
      <HopThoai
        tieuDe="Hôm nay con thấy thế nào?"
        // Câu phụ CHỈ hiện lúc khoá, và nó phải nói THẬT lý do em không đóng được: im
        // lặng ở đây là để em tự đoán, và thứ em đoán ra sẽ là "app hỏng".
        moTa={khoaCung ? "Con chọn một ô rồi vào Hub nhé." : undefined}
        batBuoc={khoaCung}
        rong="max-w-[720px]"
        onDong={dong}
      >
        <CheckinView
          trongPopup
          // Chỉ ở nhánh cổng: khi em TỰ mở để đổi tâm trạng thì trạng thái hôm nay là
          // thứ chưa ai biết, và đoán bừa là nói dối.
          chuaKhaiHomNay={khoaCung}
          displayName={displayName}
          email={email}
          roles={roles}
          classCode={classCode}
          onGhiXong={ghiXong}
        />

        {/* NÚT "VÀO HUB" ĐÃ BỎ 21/08/2026. Nó là đường ra của một màn xác nhận, mà màn
            xác nhận thì không còn: chạm một ô cảm xúc là popup đóng luôn. Một nút để
            thoát khỏi thứ đã tự thoát là một cú bấm thừa.

            Popup vẫn ở lại ĐÚNG MỘT ca — nhà em chưa có phiếu đồng ý nên máy chủ không
            nhận mức tâm trạng (0047). Lúc đó `CheckinView` không báo "xong", nên hộp
            không đóng, và nó nói thẳng chuyện gì vừa xảy ra. Đường ra ca đó là nút ✕ của
            `HopThoai` — đã có, vì `khoaCung` tắt ngay khi lượt điểm danh được nhận. */}
        </HopThoai>
      )}
      {/* Nằm NGOÀI khối `dangMo` — nếu ở trong, nó bị tháo cùng hộp thoại và trình đọc
          màn hình không kịp đọc câu vừa được đặt vào. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loiBao}
      </p>
    </Ctx.Provider>
  );
}
