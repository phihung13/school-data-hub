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
import type { HubRole } from "@hub/core/contracts";
import { CheckinView } from "./checkin-view";
import { HopThoai } from "./ui/hop-thoai";

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

  const moCheckin = useCallback(() => setMoTay(true), []);
  const laHocSinh = roles.includes("student");

  const { dangMo, khoaCung } = trangThaiCong({ batBuoc, daGhi, daDong, moTay });
  const congDangCho = batBuoc && !daDong;

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
          onGhiXong={() => setDaGhi(true)}
        />

        {/* ĐƯỜNG RA MỌC ĐÚNG LÚC VIỆC XONG.
            Chỉ ở nhánh cổng-đang-chờ: khi em TỰ mở để đổi tâm trạng thì nút ✕ của
            HopThoai đã là đường ra quen thuộc, thêm một nút nữa là thừa. */}
        {congDangCho && daGhi && (
          <button
            type="button"
            onClick={dong}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br from-navy to-navy-light text-[14px] font-black text-white"
          >
            <span aria-hidden className="msr text-[19px]">home</span>
            Vào Hub
          </button>
        )}
        </HopThoai>
      )}
    </Ctx.Provider>
  );
}
