// Nền parallax cho trang đăng nhập — chuyển thể từ Login Parallax.dc.html
// (Tiếp tục trang đăng nhập.zip, 30/07/2026). Chỉ hiện ở ≥md — trên điện thoại
// rẻ tiền, việc chạy rAF + 6 lớp ảnh nặng mỗi khung hình đi ngược lại cam kết
// "check-in xong trong 20 giây trên Android rẻ nhất" của dự án, nên mobile vẫn
// dùng dải hero navy tĩnh như cũ (xem MobileHeroBand trong login-form.tsx).
//
// CẢNH BÁO ĐÃ SỬA (31/07/2026): trước đây login-form.tsx bọc component này trong
// <div className="hidden md:block">, tức nó VẪN nằm trong cây React trên điện thoại
// và chỉ bị display:none. Hai lớp khai priority nên Next phát <link rel="preload"
// as="image"> vào <head> KHÔNG phụ thuộc bề rộng màn hình → điện thoại tải
// 01-far-background (2,18 MB) và 03-learning-group (1,46 MB) cho một khối không bao
// giờ hiển thị. Nay component tự kiểm bề rộng và trả null trên mobile, đồng thời bỏ
// hẳn priority (xem PARALLAX_MEDIA_QUERY bên dưới). Sửa TRONG file này để không phải
// chạm login-form.tsx.
"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";

// Phải khớp breakpoint `md` của Tailwind mà login-form.tsx dùng để ẩn/hiện khối này.
const PARALLAX_MEDIA_QUERY = "(min-width: 768px)";

function subscribeIsDesktop(onChange: () => void) {
  const mql = window.matchMedia(PARALLAX_MEDIA_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getIsDesktop() {
  return window.matchMedia(PARALLAX_MEDIA_QUERY).matches;
}

// Server không biết bề rộng màn hình. Mặc định "không phải desktop" là lựa chọn an
// toàn: HTML gửi đi không chứa thẻ ảnh nào, nên máy yếu không tốn byte; máy desktop
// dựng nền ngay sau hydrate (nền là trang trí, dưới nó đã có màu #F4E9D8 sẵn).
function getIsDesktopOnServer() {
  return false;
}

// TRƯỜNG `quality` ĐÃ BỎ (05/08/2026) — cùng lượt với việc phục hồi độ nét, xem ghi chú ở
// thẻ <Image> cuối file. Tóm tắt: ảnh nay được phục vụ THẲNG từ public, không đi qua bộ tối
// ưu của Next nữa, nên một con số chất lượng đặt ở đây chỉ còn là lời hứa không ai thi hành.
interface Layer {
  src: string;
  alt: string;
  top: string;
  depth: readonly [number, number];
  wrapperTransform?: string;
  wrapperOrigin?: string;
  rotate?: boolean;
}

const LAYERS: Layer[] = [
  {
    src: "/images/login-parallax/01-far-background.webp",
    alt: "",
    top: "-2%",
    depth: [2, 1],
  },
  {
    src: "/images/login-parallax/02b-tv-shelf.webp",
    alt: "",
    top: "-7.9%",
    depth: [5, 3],
  },
  // ĐỔI THỨ TỰ + THU NHỎ + TÍNH LẠI ĐỘ TRÔI (05/08/2026, chủ đầu tư yêu cầu).
  //
  // Thứ tự trong mảng CHÍNH LÀ thứ tự vẽ: phần tử sau đè lên phần tử trước. Sư tử nay đứng
  // trước nhóm học sinh trong mảng, tức là ĐỨNG SAU trên màn hình.
  //
  // Vì sao phải tính lại `depth` chứ không chỉ đổi chỗ: `depth` là biên độ trôi theo chuột
  // (px cho mỗi đơn vị lệch), và trong một cảnh có chiều sâu thì vật CÀNG XA trôi CÀNG ÍT.
  // Bản cũ đã sai điều đó mà không ai để ý — sư tử vẽ ĐÈ LÊN nhóm học sinh (tức đứng gần
  // hơn) nhưng lại có depth 11/6 nhỏ hơn 16/9 của nhóm, nên nó trôi CHẬM HƠN thứ nằm sau
  // lưng nó. Mắt đọc ra chiều sâu qua tốc độ, nên cảnh đó "sai" theo cách khó gọi tên.
  // Nay hai lớp đã đúng chiều: sư tử ở sau và trôi ít hơn nhóm học sinh ở trước.
  //
  // Con số, và VÌ SAO MỐC LÀ 100% CHỨ KHÔNG PHẢI 80% (sửa lần hai, cùng ngày):
  //
  // Bản khai cũ ghi `scale(.8)` cho cả sáu lớp, nhưng KHÔNG lớp nào từng hiện ở 80% —
  // `veLop()` ghi đè `style.transform` ngay lượt vẽ đầu, xoá sạch scale, nên thứ chạy trên
  // máy thật suốt từ 30/07 là 100% cho cả sáu. Tức con số trong mã và cái mắt người nhìn đã
  // rời nhau từ lâu; ai đọc mã cũng tưởng nền đang ở 80%.
  //
  // Nên "thu nhỏ còn 80%" phải tính trên 100% (cái đang thấy), ra `scale(.8)` — chứ không
  // phải trên .8 trong mã (sẽ ra .64, nhỏ hơn yêu cầu một nấc). Hai lớp nền xa và kệ TV thì
  // KHÔNG được đụng tới: bản khai `scale(.8)` của chúng đã gỡ hẳn để chúng ở đúng 100% như
  // người dùng vẫn thấy — giữ lại con số đó thì vá lỗi ghi đè xong là chúng tự nhỏ đi, một
  // thay đổi không ai yêu cầu. (Bàn sách và chậu cây có lệnh riêng, xem khối dưới.)
  //
  // depth nhân 0,8 theo mức thu nhỏ (vật lùi xa thì trôi ít): sư tử 11/6 → 9/5, nhóm học
  // sinh 16/9 → 13/7. Kiểm cả dải từ sau ra trước: 2/1 · 5/3 · 9/5 · 13/7 · 24/13 · 32/17 —
  // tăng đều, không lớp nào vượt lớp đứng trước nó.
  //
  // `wrapperOrigin` giữ gốc ở ĐÁY (100%): thu nhỏ quanh đáy thì hai lớp vẫn đứng trên cùng
  // một đường nền, không bị nhấc lơ lửng giữa khung.
  //
  // `translateX(40px) translateY(-15px)` (05/08/2026, chủ đầu tư căn bằng mắt qua hai lượt:
  // +20px sang phải, rồi thêm 20px nữa và nâng 15px). Ba điều đáng nhớ:
  //
  //  1. Hai lệnh dịch đặt TRƯỚC `scale(.8)` nên 40px là 40px THẬT trên màn hình. Viết sau
  //     scale thì chúng bị co còn 32px và 12px — con số trong mã sẽ lệch với thứ mắt thấy,
  //     đúng cái bẫy đã làm hỏng cả nền hôm nay.
  //  2. Nâng bằng `translateY` chứ KHÔNG sửa `top`: `top` tính theo phần trăm chiều cao khung
  //     rồi còn bị nhân 0,8 khi thu nhỏ, nên "nâng 15px" viết bằng % sẽ ra một con số khác
  //     nhau trên mỗi khổ màn. translateY là pixel màn hình, giống nhau ở mọi khổ.
  //  3. An toàn với luật "mảnh cắt" của hai lớp tiền cảnh: tranh sư tử (x 55–369, y 245–745)
  //     và nhóm học sinh (x 300–970, y 285–847) đều có lề trong suốt ở cả bốn phía, không
  //     chạm mép khung gốc — nên dịch ngang/dọc không thể lộ đường cắt nào. Hai lớp tiền
  //     cảnh thì ngược lại, xem khối dưới.
  {
    src: "/images/login-parallax/04-mascot.webp",
    alt: "Linh vật sư tử Việt Anh",
    top: "-6.7%",
    depth: [9, 5],
    // 40 + 12 = 52px: lượt căn thứ ba, sư tử qua phải thêm 12px.
    wrapperTransform: "translateX(52px) translateY(-15px) scale(.8)",
    wrapperOrigin: "0% 100%",
  },
  {
    src: "/images/login-parallax/03-learning-group.webp",
    alt: "Nhóm học sinh Việt Anh cùng học",
    top: "2.08%",
    depth: [13, 7],
    // 40 + 8 = 48px: nhóm học sinh qua phải thêm 8px — ít hơn sư tử 4px, nên khoảng hở giữa
    // sư tử và nhóm hẹp lại đúng 4px thay vì cả hai dịch song song.
    wrapperTransform: "translateX(48px) translateY(-15px) scale(.8)",
    wrapperOrigin: "10% 100%",
  },
  // HAI LỚP TIỀN CẢNH ĐƯỢC VẼ CHO MỘT KHUNG KHÁC (sửa 05/08/2026, chủ đầu tư yêu cầu).
  //
  // Bàn sách và chậu cây nằm sát mép trái-dưới của khung gốc 1672×941 (đo bằng alpha: bàn
  // chiếm x 0–650 · y 613–941, cây chiếm x 0–305 · y 581–941 — cả hai CHẠM mép trái và mép
  // đáy). Bố cục đó đúng với nền cũ, nhưng đưa vào khung 1440×900 hiện nay thì `object-fit:
  // cover` + `left: -2%` đẩy phần chạm mép ra ngoài: đo được cây mất 29px bên trái và 18px
  // dưới đáy. Nhìn ra thì chậu cây bị xén dọc, còn bàn sách cụt một góc.
  //
  // LUẬT CỦA HAI LỚP NÀY, VIẾT RA VÌ TÔI ĐÃ LÀM SAI MỘT LẦN (sửa lần hai, cùng ngày):
  //
  //   Mảnh cắt của tranh phải nằm NGOÀI khung nhìn, cách mép ít nhất bằng biên độ trôi.
  //
  // Lần đầu tôi hiểu "bị cắt" thành "thò ra ngoài quá nhiều" nên đẩy cả hai lớp VÀO TRONG
  // (translateX +70/+45, top -4%) cho vừa khít màn hình. Sai, và sai theo hướng làm hỏng
  // thêm: chỗ tranh bị xén không phải do khung — nó nằm sẵn trong FILE ẢNH (cả hai tranh
  // vẽ chạm mép trái và mép đáy của khung 1672×941). Kéo chúng vào trong nghĩa là kéo
  // ĐƯỜNG CẮT vào giữa màn hình. Chủ đầu tư thấy ngay: rê chuột xuống góc trái dưới là
  // parallax đẩy lớp sang phải 32px và lộ nguyên lát cắt của chậu cây.
  //
  // Nên hướng đúng là NGƯỢC LẠI: cho mảnh cắt lùi ra ngoài, đủ xa để lượt trôi mạnh nhất
  // cũng không kéo nó vào. Biên độ trôi chính là `depth` (px), nên điều kiện là:
  //     mép trái tranh ≤ −depthX      ·      mép đáy tranh ≥ chiều cao khung + depthY
  // Đo ở 1440×900 với `scale(.8)`, gốc thu nhỏ ở đáy-trái:
  //     bàn sách  mép trái −35px (cần ≤ −24) · đáy 929px (cần ≥ 913)
  //     chậu cây  mép trái −43px (cần ≤ −32) · đáy 929px (cần ≥ 917)
  // Ở góc tệ nhất (chuột góc trái dưới) mảnh cắt vẫn còn cách mép 11px — đã dựng ảnh cả hai
  // đầu mút để nhìn, không suy luận suông.
  //
  // Cái giá phải trả, nói thẳng: thấy ít hơn phương án "vừa khít" khoảng 40px bên trái. Đổi
  // lại là KHÔNG BAO GIỜ lộ đường cắt — và một đường cắt thẳng giữa màn hình thì mắt bắt
  // được ngay, còn 40px tranh bị khuất ở mép thì không ai nhận ra.
  {
    src: "/images/login-parallax/05-foreground-desk-books.webp",
    alt: "",
    top: "0%",
    depth: [24, 13],
    wrapperTransform: "translateX(-12px) scale(.8)",
    wrapperOrigin: "0% 100%",
  },
  {
    src: "/images/login-parallax/06-foreground-leaves.webp",
    alt: "",
    top: "0%",
    depth: [32, 17],
    wrapperTransform: "translateX(-20px) scale(.8)",
    wrapperOrigin: "0% 100%",
    rotate: true,
  },
];

// TÁM ĐỐM SÁNG BAY ĐÃ BỎ HẲN (05/08/2026, chủ đầu tư yêu cầu).
//
// Chúng là tám <span> tròn 3–6px có blur, trôi lên theo keyframes `dust`. Bỏ cả ba phần cùng
// lúc — mảng toạ độ ở đây, khối render ở cuối file, và cặp keyframes/animation `dust` trong
// tailwind.config.ts — vì để lại bất kỳ phần nào cũng là mã chết: keyframes không ai gọi, hoặc
// class `animate-dust` không tồn tại.
//
// Ghi lại một chi tiết đáng nhớ: trước hôm nay chúng ĐÃ đứng im mà không ai biết. `tailwind.config.ts`
// khai keyframes `dust` nhưng thiếu mục tương ứng trong `theme.animation`, mà Tailwind chỉ sinh
// class `animate-*` từ `animation` — nên `animate-dust` là một class không tồn tại: không lỗi
// build, không cảnh báo, tám đốm chỉ là chấm tĩnh. Đợt rà 05/08 phát hiện và vừa nối lại được
// vài giờ thì có quyết định bỏ. Nay bỏ đúng cách, không để lại nửa cơ chế nào.

export function LoginParallaxBg() {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cur = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const raf = useRef<number>();
  const isDesktop = useSyncExternalStore(subscribeIsDesktop, getIsDesktop, getIsDesktopOnServer);

  useEffect(() => {
    if (!isDesktop) return; // khối chưa được dựng — không có gì để chạy parallax
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (reduced || !canHover) return; // chuột giả lập/màn cảm ứng — không chạy vòng lặp animation

    // ═══════════════════════════════════════════════════════════════════════════
    // VÒNG LẶP NGỦ KHI CHUỘT ĐỨNG YÊN (sửa 05/08/2026)
    // ═══════════════════════════════════════════════════════════════════════════
    // Bản cũ gọi `requestAnimationFrame` vô điều kiện ngay đầu `tick`, nên vòng lặp
    // chạy 60 lần/giây suốt thời gian trang mở — kể cả khi chuột đã đứng yên và
    // `cur` đã bằng `target`, tức là mỗi giây có 60 lượt ghi `style.transform` với
    // ĐÚNG giá trị cũ. Sáu lớp `will-change:transform` vì thế nằm mãi trong bộ nhớ
    // GPU dưới dạng lớp riêng, trên trang mà người ta để mở lâu nhất của app (màn
    // đăng nhập, mở rồi đi pha cà phê). Trên laptop đó là quạt kêu và pin tụt vì
    // một hiệu ứng không ai đang nhìn.
    //
    // Nay: chênh lệch dưới ngưỡng thì ghi LẦN CUỐI (để không dừng ở một khung dở
    // dang cách đích 0,001) rồi huỷ vòng và xoá ref. `onMove`/`onLeave` khởi động
    // lại — chuột nhúc nhích một cái là parallax chạy tiếp, mắt không thấy khác gì.
    const NGUONG_DUNG = 0.001;

    function batDauVong() {
      // Đã có vòng đang chạy thì thôi — hai vòng song song sẽ nhân đôi tốc độ nội suy.
      if (raf.current === undefined) raf.current = requestAnimationFrame(tick);
    }

    function onMove(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      target.current.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      target.current.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      batDauVong();
    }
    function onLeave() {
      target.current.x = 0;
      target.current.y = 0;
      batDauVong();
    }

    // VÒNG PARALLAX TỪNG XOÁ MẤT SCALE CỦA CHÍNH LỚP NÓ ĐANG KÉO (sửa 05/08/2026).
    //
    // `wrapperTransform` (scale .64/.8/.82, translateX 40px) được đặt bằng thuộc tính
    // `style` NGAY TRÊN div mà `layerRefs` giữ — cùng một phần tử. Dòng cũ ở đây gán
    // `el.style.transform = "translate3d(...)"`, tức là GHI ĐÈ nguyên chuỗi: ngay lượt
    // vẽ đầu tiên, cả sáu lớp mất scale và nhảy về kích thước gốc 100%. Không lỗi, không
    // cảnh báo — chỉ là bố cục nền đột nhiên khác bản thiết kế, và khác đúng vào lúc
    // người dùng vừa rê chuột nên rất dễ đọc thành "trang bị giật".
    //
    // Nay ghép chuỗi thay vì thay chuỗi. THỨ TỰ CÓ NGHĨA: `translate3d` đứng TRƯỚC
    // `scale` để độ trôi tính bằng pixel màn hình thật; đặt sau `scale(.64)` thì mỗi
    // pixel trôi bị co còn 0,64px và hai lớp vừa thu nhỏ sẽ trôi chậm hơn con số đã tính.
    function veLop() {
      layerRefs.current.forEach((el, i) => {
        const layer = LAYERS[i];
        if (!el || !layer) return;
        const [mx, my] = layer.depth;
        let t = `translate3d(${(-cur.current.x * mx).toFixed(2)}px,${(-cur.current.y * my).toFixed(2)}px,0)`;
        if (layer.rotate) t += ` rotate(${(-cur.current.x * 0.7).toFixed(3)}deg)`;
        if (layer.wrapperTransform) t += ` ${layer.wrapperTransform}`;
        el.style.transform = t;
      });
    }

    function tick() {
      cur.current.x += (target.current.x - cur.current.x) * 0.08;
      cur.current.y += (target.current.y - cur.current.y) * 0.08;
      veLop();

      const lech =
        Math.abs(target.current.x - cur.current.x) + Math.abs(target.current.y - cur.current.y);
      if (lech < NGUONG_DUNG) {
        // Chốt đúng đích rồi ngủ. Xoá ref là phần bắt buộc: `batDauVong` đọc nó để
        // biết có vòng nào đang chạy chưa.
        cur.current.x = target.current.x;
        cur.current.y = target.current.y;
        veLop();
        if (raf.current !== undefined) cancelAnimationFrame(raf.current);
        raf.current = undefined;
        return;
      }
      raf.current = requestAnimationFrame(tick);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    // Một lượt đầu để đặt sáu lớp về vị trí gốc; vòng tự ngủ ngay sau đó vì cur == target.
    batDauVong();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      if (raf.current !== undefined) {
        cancelAnimationFrame(raf.current);
        raf.current = undefined;
      }
    };
  }, [isDesktop]);

  // Trả null (chứ không phải display:none) là điểm mấu chốt: thẻ <Image> không tồn
  // tại thì Next không phát preload và trình duyệt không tải 6 lớp ảnh nặng.
  if (!isDesktop) return null;

  return (
    <div ref={containerRef} aria-hidden className="absolute inset-0 overflow-hidden bg-[#F4E9D8]">
      {LAYERS.map((layer, i) => (
        <div
          key={layer.src}
          ref={(el) => {
            layerRefs.current[i] = el;
          }}
          className="absolute inset-0 [transform:translate3d(0,0,0)]"
          style={layer.wrapperTransform ? { transform: layer.wrapperTransform, transformOrigin: layer.wrapperOrigin } : undefined}
        >
          {/* Div định kích thước 104% riêng — Image "fill" chỉ được lấp đầy đúng khung
              chứa nó, không cho override width/height qua style cùng lúc với fill. */}
          <div className="pointer-events-none absolute" style={{ top: layer.top, left: "-2%", width: "104%", height: "104%" }}>
            {/* ẢNH ĐI THẲNG, KHÔNG QUA BỘ TỐI ƯU (sửa 05/08/2026 — chủ đầu tư báo "ảnh
                chưa rõ nét, kiểu bị giảm chất lượng").
                Đo được ba tầng làm mờ chồng lên nhau:
                  1. Ảnh gốc là WebP nén ở chất lượng 82 (đợt chuyển từ PNG sáng cùng ngày).
                  2. `sizes="110vw"` khiến Next xin bản rộng 3840px — trong khi ảnh gốc chỉ
                     rộng 1672px, nên nó PHÓNG TO gấp 2,3 lần rồi mới phục vụ.
                  3. Bản phóng to đó lại bị nén lại lần nữa ở `quality` 78–92.
                Nén hai lần trên một bản đã phóng to thì không cách nào nét được. Nay ảnh gốc
                dựng lại từ PNG ở chất lượng 95 (594 KB cho cả sáu lớp, vẫn nhẹ hơn PNG mười
                lần) và phục vụ NGUYÊN BẢN từ /public: đúng 1672px cho một khung vẽ ~1500px,
                không phóng, không nén lại, và máy chủ khỏi tốn CPU tối ưu ảnh mỗi lần.
                `sizes`/`quality` bỏ theo vì `unoptimized` làm chúng vô nghĩa. */}
            <Image
              src={layer.src}
              alt={layer.alt}
              fill
              unoptimized
              style={{ objectFit: "cover", objectPosition: "left center" }}
              className="pointer-events-none [will-change:transform]"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
