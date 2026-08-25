// Token màu lấy nguyên từ DESIGN-GUIDELINES.md — KHÔNG tự chế thêm màu ở component.
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Be Vietnam Pro'", "system-ui", "sans-serif"],
      },
      colors: {
        navy: {
          DEFAULT: "#0A2A5E",
          light: "#1E5FB8",
        },
        gold: {
          DEFAULT: "#FFC629",
          dark: "#F5A300",
          text: "#6B4A00",
          textDark: "#FFD98A",
        },
        ink: "#1D3B6E",
        cardtitle: "#0A2A5E",
        muted: "#5B6B80",
        // muted2 #6B7789 → #5F6B7D (05/08/2026, đợt rà impeccable).
        //
        // Mã cũ là mã mà chính chú thích ngay dưới đây đã gọi tên là "đạt chuẩn do may mắn":
        // 4,54:1 trên trắng nhưng 4,12:1 trên chip #F1F4F8. Nó sống thêm được một đợt vì
        // tests/unit/a11y.test.ts hạ sàn riêng cho nó xuống 4,0 — một ngoại lệ có tên, tức
        // là một cái nợ được ghi sổ chứ không phải một chỗ đạt.
        //
        // Đợt đo 05/08/2026 tìm ra nó đang chở chữ THẬT dưới chuẩn ở đúng bản mà phụ huynh
        // mở từ link Zalo lúc tối: chi tiết Glow trong growth-report-view trên ba nền thẻ
        // #F6FAFF / #FFFBF2 / #F6FEF9 chỉ đạt 4,33 · 4,40 · 4,42:1. Đổi một dòng ở đây sửa
        // luôn ~50 chỗ dùng, và sàn ngoại lệ trong bài test đã bị gỡ cùng lượt — từ nay
        // MỌI token chữ xám đo cùng một thước 4,5:1 trên mặt nền tệ nhất.
        muted2: "#5F6B7D",
        // NÂNG TOKEN 01/08/2026 (gói "tuong-phan-man-hoc-sinh"), không vá từng chỗ.
        //
        // Đo thật trên DOM ở 360px, phiên học sinh Minh: caption cũ #8A94A6 = 3,06:1 và
        // caption2 cũ #9AA5B5 = 2,49:1 trên nền trắng — chuẩn WCAG 1.4.3 là 4,5:1. Hai
        // token này KHÔNG chỉ chở chữ trang trí: chúng đang chở địa chỉ email của em
        // (profile-view), câu "Offline vẫn lưu — tự gửi sau." ở /home, và ĐÚNG những câu
        // trạng thái rỗng — "Chưa có lịch sử điểm danh nào.", "Chưa có check-in nào tuần
        // này." Chữ nói ra sự thật về dữ liệu mà lại là chữ mờ nhất màn hình.
        //
        // Vì sao sửa ở ĐÂY chứ không ở ~50 chỗ dùng: chú thích tab-bar.tsx đã chỉ đúng
        // đường ("Ba mục kia của app vẫn dùng caption2 và vẫn sai; việc nâng chính TOKEN
        // nằm ở gói khác"). Một dòng ở đây là 50 chỗ khỏi phải sửa, và không có chỗ nào
        // bị bỏ sót vì người sửa không mở file đó ra.
        //
        // Vì sao là hai mã này chứ không phải "đậm hơn cho chắc": tương phản phải đạt trên
        // MẶT NỀN TỆ NHẤT mà app thật sự có, không phải chỉ trên nền trắng.
        //   caption  #5F6B7D → 5,40:1 (#FFFFFF) · 5,12:1 (#F7F9FC) · 4,90:1 (#F1F4F8)
        //   caption2 #66707D → 5,03:1 (#FFFFFF) · 4,76:1 (#F7F9FC) · 4,56:1 (#F1F4F8)
        // Mã #6B7789 (đạt 4,54:1 trên trắng) đã bị loại: trên nền chip #F1F4F8 nó tụt còn
        // 4,12:1 — "đạt chuẩn do may mắn ở chỗ ai đó vô tình dán nó vào".
        // caption2 nay TRÙNG giá trị với `muted` là chủ ý, không phải lỡ tay: tab-bar.tsx
        // đã đổi tay caption2 → muted từ 31/07 và đó là đích đúng; giữ hai tên để ~50 chỗ
        // gọi caption2 không phải sửa, nhưng chúng đang trỏ về cùng một màu.
        // tests/unit/a11y.test.ts đo lại hai token này từ chính file này, không chép số.
        caption: "#5F6B7D",
        caption2: "#5F6B7D", // 25/08: #66707D đo 4,41:1 trên chip #E8F1FC — về trùng caption, đúng đích ghi ở khối trên
        line: "#E3EEFA",
        chip: "#E8F1FC",
        // SÁU TOKEN THÊM 05/08/2026 (đợt rà impeccable) — không phải màu mới, chỉ là những
        // mã ĐÃ CHẠY khắp nơi bằng cách viết tay. Ba đợt đo đếm được ~290 mã hex viết thẳng
        // trong component, và cái giá của chúng đã hiện ra thật: lần sửa #E8940D hôm 01/08
        // chỉ chạm được 1 trong 7 chỗ, vì sáu chỗ kia người sửa không mở file ra.
        //   subtle     #5B6B80 — chữ phụ đậm hơn caption (5,73:1 trên trắng)
        //   cardtitle2 #33507C — tiêu đề thẻ cấp hai ở màn người lớn (8,17:1)
        //   link       #1D4E8F — chữ liên kết trong thân trang (7,66:1)
        //   successText#00693F — chữ trên nền xanh nhạt (6,12:1 trên trắng)
        //   dangerText #C7333A — chữ đỏ trên nền hồng #FFF5F5 (4,94:1; mã cũ #D2383E chỉ 4,49)
        //   line2      #C9D2DE — viền/chevron nhạt, KHÔNG dùng cho chữ
        subtle: "#5B6B80",
        cardtitle2: "#33507C",
        link: "#1D4E8F",
        successText: "#00693F",
        dangerText: "#C7333A",
        line2: "#C9D2DE",
        // NỀN TRẠNG THÁI — cùng đợt, cùng lý do, khác vai trò: đây là các MẶT NỀN mà chữ
        // ở trên phải đo tương phản với. Chúng đã chạy sẵn ở 100+ chỗ dưới dạng mã hex viết
        // tay, nên mỗi lần ai đó hỏi "chữ này có đọc được không" thì phải đi tìm nền bằng mắt.
        // Giá trị GIỮ NGUYÊN từng mã một — đợt này chỉ đặt tên, không đổi một pixel màu nào.
        surface: {
          success: "#EDFBF4", // nền xanh: đã xong, đã tới nơi
          warn: "#FFF6DF", // nền vàng đậm: đang chờ xử lý
          warnSoft: "#FFF8E6", // nền vàng nhạt: nhắc nhẹ, số liệu
          gold: "#FFFBEE", // nền nút phụ viền vàng
          danger: "#FFF5F5", // nền hồng: lỗi, đăng xuất
          danger2: "#FFECEE", // nền hồng đậm hơn một nấc (pill khẩn)
          info: "#EAF3FF", // nền lam: thông tin trung tính
          infoSoft: "#F3F8FF", // nền lam nhạt: thẻ giải thích
          alt: "#EEF3FA", // nền xen kẽ trong danh sách
          shell: "#E9F1FB", // nền ngoài khung thẻ
          muted: "#E1EAF5", // nền ô app chưa mở, thanh tiến trình
        },
        /**
         * Nền và viền THẺ — thêm 24/08/2026 khi đổi sang giao diện tối Major OS.
         *
         * Vì sao là token mới chứ không ghi đè `white`: `bg-white` (133 chỗ) là NỀN, còn
         * `text-white` (70 chỗ) là CHỮ. Ghi đè `white` thì cả hai cùng tối và chữ biến
         * mất. Hai vai trò khác nhau thì phải là hai token khác nhau.
         */
        card: "#FFFFFF",
        cardline: "#B7D2F0",
        pagebg: "#F4F9FF",
        pagebgDesktop: "#FFFFFF",
        mood: {
          happy: "#00D97A",
          happyDark: "#00A85E",
          normal: "#4E9BFF",
          normalDark: "#2C7BF2",
          tired: "#FFC833",
          tiredDark: "#F5A300",
          sad: "#FF7A7F",
          sadDark: "#F0474D",
        },
        domain: {
          attendance: "#2C7BF2",
          attendanceDark: "#0A4FBF",
          activity: "#FFB01F",
          activityDark: "#F58F00",
          study: "#00D97A",
          studyDark: "#00A05F",
          health: "#FF6B70",
          healthDark: "#E23A41",
          report: "#9D6BFF",
          reportDark: "#7434E8",
          cockpit: "#2A5DA8",
          cockpitDark: "#0A2A5E",
          counselor: "#6A34E0",
          counselorDark: "#8B5CF6",
        },
      },
      keyframes: {
        // Thanh chạy của màn chờ mini app (embed-intro.tsx). Cố ý KHÔNG phải vòng xoay
        // và cố ý không có phần trăm: không ai đo được app ngoài còn bao lâu, nên một
        // thanh đầy dần theo phần trăm bịa là nói dối bằng hình.
        embedSlide: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        pulseDot: {
          "0%": { boxShadow: "0 0 0 0 rgba(255,198,41,.6)" },
          "70%": { boxShadow: "0 0 0 12px rgba(255,198,41,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255,198,41,0)" },
        },
        popIn: {
          "0%": { transform: "scale(.72)", opacity: "0" },
          "62%": { transform: "scale(1.07)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // Keyframes `dust` (8 đốm sáng bay ở nền đăng nhập) đã XOÁ 05/08/2026 cùng lượt với
        // khối render trong login-parallax-bg.tsx — chủ đầu tư bỏ hiệu ứng. Xoá cả hai đầu
        // cùng lúc là có chủ ý: giữ keyframes mà không ai gọi, hoặc giữ class mà không có
        // keyframes, đều là mã chết — và vế thứ hai chính là thứ đã im lặng suốt (class
        // `animate-dust` chưa từng tồn tại vì thiếu mục trong `animation`, nên 8 đốm đứng
        // im mà không ai biết).
      },
      animation: {
        floaty: "floaty 4s ease-in-out infinite",
        pulseDot: "pulseDot 2.6s ease-out infinite",
        popIn: "popIn 320ms cubic-bezier(.34,1.56,.64,1)",
        embedSlide: "embedSlide 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
