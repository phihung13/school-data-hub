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
        caption: "#8A94A6",
        caption2: "#9AA5B5",
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
      },
    },
  },
  plugins: [],
};

export default config;
