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
          textDark: "#8A5A00",
        },
        ink: "#0F172A",
        cardtitle: "#0A2A5E",
        muted: "#66707D",
        muted2: "#6B7789",
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
        caption2: "#66707D",
        line: "#E4E9F0",
        chip: "#F1F4F8",
        pagebg: "#F7F9FC",
        pagebgDesktop: "#F5F7FA",
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
        dust: {
          "0%": { transform: "translate3d(0,14px,0)", opacity: "0" },
          "18%": { opacity: ".75" },
          "70%": { opacity: ".5" },
          "100%": { transform: "translate3d(18px,-84px,0)", opacity: "0" },
        },
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
