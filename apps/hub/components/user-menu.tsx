// apps/hub/components/user-menu.tsx — MỘT menu tài khoản, hai chỗ đứng.
//
// Vì sao gom lại (02/08/2026, chủ đầu tư: "đưa tất cả các trang hồ sơ bỏ khỏi menu, đưa
// về dưới avt khi người ta nhấn sẽ ra popup cài đặt về hồ sơ của mình, giống như các web
// app khác ngoài kia"):
//
// Trước hôm nay "Hồ sơ" đứng ở BA nơi cùng lúc cho cùng một người — mục trong menu trái,
// tab dưới cùng trên điện thoại, VÀ lớp nổi dưới avatar ở góc sidebar. Ba lối vào cho
// một trang không phải là tiện: nó ăn mất một ô trong thanh tab chỉ có 3–5 ô, và nó đặt
// việc "xem hồ sơ của tôi" ngang hàng với việc "mở buồng lái" — hai thứ khác hẳn nhau về
// tần suất. Mọi web app quen thuộc đều xếp việc-của-tài-khoản xuống dưới avatar; đây là
// chỗ người dùng ĐÃ BIẾT phải tìm.
//
// Hai biến thể, cùng một nội dung lớp nổi:
//   · `sidebar` — hàng dưới cùng menu trái máy tính: avatar + tên + email + mũi tên.
//   · `avatar`  — nút tròn cho đầu trang điện thoại, nơi trước đây là một vòng tròn CHỮ
//     CÁI KHÔNG BẤM ĐƯỢC. Trên điện thoại, sau khi bỏ tab "Hồ sơ", đây là đường DUY NHẤT
//     tới hồ sơ và tới nút đăng xuất — nên nó không được phép là đồ trang trí nữa.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Vì sao lớp nổi này KHÔNG có mục "Cài đặt" và "Trợ giúp" như ảnh mẫu (06/08/2026):
 *
 *  · **Cài đặt** — không có trang nào sau nó. Ba thứ ảnh mẫu xếp vào Cài đặt (ngôn ngữ,
 *    nhắc check-in buổi sáng, thiết bị đang đăng nhập) đều chưa có gì phía sau; lý do
 *    từng thứ ghi ở đầu `profile-view.tsx`. Một mục menu dẫn tới hư không tệ hơn không
 *    có mục (điều 20: không liên kết chết).
 *  · **Trợ giúp** — trang trợ giúp có thật là `/can-gap-thay-co`, nhưng nó CHỈ dành cho
 *    học sinh (page.tsx của nó đá vai khác về /home). Lớp nổi này dựng chung cho tám vai
 *    và không nhận `roles`, nên thêm mục ở đây là đưa bảy vai còn lại vào một cú bấm dội
 *    ngược. Đường tới nó đã có ĐÚNG chỗ cần: một hàng trong thẻ "Tài khoản" ở /ho-so của
 *    học sinh, và nút "Mình cần gặp thầy cô" ở /home và /checkin.
 *
 * Muốn thêm hai mục đó thì việc phải làm là dựng trang trước, không phải dựng mục trước.
 * Cổng canh: tests/unit/ho-so-khong-bia-so.test.ts.
 */

export interface UserMenuProps {
  fullName: string;
  email?: string | null;
  /** Nhãn vai (kèm lớp nếu có) — chỉ hiện trong lớp nổi của biến thể `avatar`. */
  roleTag?: string | null;
  variant: "sidebar" | "avatar";
  /**
   * Lớp nổi mở LÊN hay XUỐNG. Mặc định "duoi" (nút ở đầu trang). Thanh tab nằm sát đáy
   * màn hình nên phải là "tren" — mở xuống thì hộp nằm ngoài khung nhìn và người dùng
   * bấm vào chỉ thấy không có gì xảy ra.
   */
  placement?: "tren" | "duoi";
}

/**
 * Đóng lớp nổi khi bấm ra ngoài hoặc bấm Escape.
 *
 * Chuyển từ hub-sidebar.tsx sang đây 02/08/2026 khi lớp nổi có chỗ đứng thứ hai — chép
 * đôi một hook quản lý focus là cách chắc chắn nhất để hai bản lệch nhau, và bản lệch sẽ
 * là bản không ai kiểm.
 *
 * Nhận nhiều ref vì nút mở nằm NGOÀI hộp menu: bấm lại vào nút mà tính là "bấm ra ngoài"
 * thì hook đóng menu rồi onClick mở lại ngay — menu không bao giờ tắt bằng nút.
 */
export function useDismissable(
  open: boolean,
  refs: Array<RefObject<HTMLElement>>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onDismiss();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs/onDismiss dựng lại mỗi lần render; phụ thuộc thật chỉ là trạng thái mở
  }, [open]);
}

/** Chữ cái đầu cho avatar. Tên rỗng ra "?" chứ không ra một vòng tròn trống. */
export function chuCaiDau(fullName: string): string {
  return fullName.trim().slice(0, 1).toUpperCase() || "?";
}

export function UserMenu({ fullName, email, roleTag, variant, placement = "duoi" }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Đóng lớp nổi thì TRẢ FOCUS về nút đã mở nó. Bấm Escape khi con trỏ bàn phím đang đứng
  // trên "Đăng xuất" thì phần tử đang giữ focus bị gỡ khỏi DOM, trình duyệt trả focus về
  // <body>, và người dùng bàn phím mất chỗ đứng — trong khi lớp nổi này chứa đường thoát
  // phiên duy nhất.
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  useDismissable(open, [boxRef, buttonRef], close);

  const initial = chuCaiDau(fullName);

  return (
    <div className={variant === "sidebar" ? "relative" : "relative flex-none"}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        // aria-haspopup="true" chứ không phải "menu": giá trị "menu" là một LỜI HỨA rằng
        // thứ mở ra tuân theo hợp đồng ARIA của role=menu (mũi tên lên/xuống, Home/End,
        // giam focus). Lớp nổi dưới đây không làm việc đó và cố ý không làm. Hứa sai còn
        // tệ hơn không hứa: trình đọc màn hình đã đọc "menu" thì người dùng sẽ bấm mũi
        // tên, và không có gì xảy ra.
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={variant === "avatar" ? `Tài khoản của ${fullName}` : undefined}
        className={
          variant === "sidebar"
            ? "flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2.5 py-[9px] hover:bg-[#F5F8FC]"
            : // 44×44 đúng ngưỡng vùng bấm §11. Vòng tròn hiển thị 42px, vùng bấm phủ đủ.
              "flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        }
      >
        <span
          className={
            variant === "sidebar"
              ? "flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-[13px] font-black text-navy"
              : "flex h-[42px] w-[42px] items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark text-[15px] font-black text-navy"
          }
        >
          {initial}
        </span>
        {variant === "sidebar" && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[12.5px] font-extrabold text-ink">{fullName}</div>
              <div className="truncate text-[10px] text-muted">{email}</div>
            </div>
            <span className="msr text-[18px] text-caption" aria-hidden>
              unfold_more
            </span>
          </>
        )}
      </button>

      {open && (
        // KHÔNG khai role="menu"/role="menuitem" — xem lý lẽ ở aria-haspopup bên trên.
        // Tab đã đi theo thứ tự DOM, Enter/Space đã hoạt động, Escape đã đóng và trả focus.
        <div
          ref={boxRef}
          aria-label="Tài khoản"
          className={
            variant === "sidebar"
              ? "absolute bottom-[62px] left-0 right-0 z-30 flex flex-col gap-px rounded-2xl border border-line bg-white p-[7px] shadow-[0_16px_36px_rgba(10,42,94,.2)]"
              : // Neo mép PHẢI: nút nằm sát mép phải, neo trái sẽ đẩy hộp ra ngoài màn
                // hình 360px. min-w vừa đủ đọc email, max-w chặn tràn.
                `absolute right-0 z-30 flex w-[248px] max-w-[calc(100vw-32px)] flex-col gap-px rounded-2xl border border-line bg-white p-[7px] shadow-[0_16px_36px_rgba(10,42,94,.2)] ${
                  placement === "tren" ? "bottom-[54px]" : "top-[52px]"
                }`
          }
        >
          {variant === "avatar" && (
            // Biến thể sidebar đã in tên/email ngay trên nút nên không lặp lại. Biến thể
            // avatar thì nút chỉ có một chữ cái — không có khối này thì người dùng mở ra
            // và không biết mình đang đăng nhập bằng tài khoản nào, đúng câu hỏi mà mọi
            // menu avatar sinh ra để trả lời.
            <>
              {/* Tên rỗng thì BỎ HẲN khối này chứ không vẽ một dòng trống: màn hình
                  thông báo dùng chung (desktop-only-notice) dựng thanh tab mà không có
                  danh tính trong tay. Một hộp có ô trống trông như dữ liệu bị mất. */}
              <div className={fullName.trim() ? "px-2.5 pb-2 pt-1.5" : "hidden"}>
                <div className="truncate text-[13px] font-extrabold text-ink">{fullName}</div>
                {email ? <div className="truncate text-[11px] text-muted">{email}</div> : null}
                {roleTag ? (
                  <div className="mt-1 inline-flex rounded-full bg-chip px-2 py-0.5 text-[9.5px] font-black tracking-wide text-muted">
                    {roleTag}
                  </div>
                ) : null}
              </div>
              <div className="mx-0.5 mb-1 h-px bg-chip" />
            </>
          )}
          <MenuLink href="/ho-so" icon="person" onNavigate={() => setOpen(false)}>
            Hồ sơ của tôi
          </MenuLink>
          {/* Điều khoản là trang CÓ THẬT (/dieu-khoan) và là nơi duy nhất người dùng đọc
              lại thứ mình đã đồng ý. Trước đây nó chỉ hiện đúng một lần lúc đăng nhập lần
              đầu rồi biến mất khỏi mọi lối đi — tức là không rút lại được, không đọc lại
              được. Không thêm mục "Cài đặt" hay "Trợ giúp": chưa có trang nào sau chúng,
              và một mục dẫn tới hư không thì tệ hơn không có mục. */}
          {/* `shield_person` chứ không phải `policy`: font đã cắt gọn chỉ chứa 213 tên
              (public/fonts/icon-names.txt), và tên ngoài danh sách vẽ ra một Ô TRỐNG chứ
              không báo lỗi. Đổi icon rẻ hơn dựng lại font cho một mục menu. */}
          <MenuLink href="/dieu-khoan" icon="shield_person" onNavigate={() => setOpen(false)}>
            Điều khoản &amp; quyền riêng tư
          </MenuLink>
          <div className="mx-0.5 my-1 h-px bg-chip" />
          <LogoutMenuItem />
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onNavigate,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-[44px] items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-[12.5px] font-bold text-[#1F2A3A] hover:bg-pagebg"
    >
      <span className="msr text-[18px] text-caption" aria-hidden>
        {icon}
      </span>
      {children}
    </Link>
  );
}

/**
 * Đăng xuất — hành động KHÔNG LÙI ĐƯỢC, nên hỏi lại (điều 15 hiến pháp UI).
 *
 * Chỗ này nguy hơn nút trong /ho-so: mục "Đăng xuất" nằm ngay dưới "Hồ sơ của tôi" và
 * "Điều khoản" trong một lớp nổi cao chưa tới 160px, và trên điện thoại lớp nổi đó mở ra
 * từ một nút 44px ở sát mép. Trượt tay một hàng là mất phiên.
 *
 * Hỏi lại NGAY TRONG lớp nổi chứ không mở thêm một hộp thoại thứ hai: chồng hai lớp nổi
 * lên nhau thì `useDismissable` của lớp ngoài sẽ đóng cả hai khi bấm vào lớp trong. Khối
 * hỏi lại thay chỗ chính mục vừa bấm, và con trỏ bàn phím được đặt vào nút xác nhận nên
 * trình đọc màn hình đọc ra câu hỏi ngay khi nó hiện. Escape = "Ở lại" (phím thoát phải
 * trả về trạng thái an toàn) — và vì `useDismissable` cũng bắt Escape, `stopPropagation`
 * giữ cho một lần bấm Escape chỉ lùi một bước, không đóng luôn cả lớp nổi.
 */
function LogoutMenuItem() {
  const [hoiLai, setHoiLai] = useState(false);
  const nutXacNhan = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (hoiLai) nutXacNhan.current?.focus();
  }, [hoiLai]);

  if (!hoiLai) {
    return (
      <button
        type="button"
        onClick={() => setHoiLai(true)}
        className="flex min-h-[44px] items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left text-[12.5px] font-extrabold text-dangerText hover:bg-[#FFF3F3]"
      >
        <span className="msr text-[18px] text-dangerText" aria-hidden>
          logout
        </span>
        Đăng xuất
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Xác nhận đăng xuất"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        setHoiLai(false);
      }}
      className="flex flex-col gap-1.5 rounded-[10px] bg-surface-danger p-2"
    >
      <p className="px-1 text-[11.5px] font-black text-dangerText">Đăng xuất khỏi tài khoản này?</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          ref={nutXacNhan}
          onClick={() => {
            fetch("/api/auth/logout", { method: "POST" }).finally(() => {
              window.location.href = "/login";
            });
          }}
          // Trắng trên #C7333A (token dangerText) = 6,03:1.
          className="min-h-[44px] flex-1 rounded-[9px] bg-dangerText px-3 text-[12px] font-black text-white"
        >
          Đăng xuất
        </button>
        <button
          type="button"
          onClick={() => setHoiLai(false)}
          // Viền `subtle` (#5B6B80 = 5,09:1 trên nền hồng) chứ không phải `line` (1,22:1):
          // nút trắng trên nền hồng #FFF5F5 cách nhau 1,03:1, nên viền là thứ DUY NHẤT vẽ
          // ra ranh giới của nó. Đường lùi phải nhìn thấy rõ ít nhất bằng đường đi tiếp.
          className="min-h-[44px] flex-1 rounded-[9px] border border-subtle bg-white px-3 text-[12px] font-extrabold text-cardtitle2"
        >
          Ở lại
        </button>
      </div>
    </div>
  );
}
