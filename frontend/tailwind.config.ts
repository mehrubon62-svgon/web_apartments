import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#f5f5f4",
        accent: "#2563eb",
        ink: "#111111",
        muted: "#6b7280",
        faint: "#9ca3af",
        ok: "#16a34a",
        warn: "#d97706",
        danger: "#dc2626",
      },
      borderColor: {
        DEFAULT: "#e5e5e5",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "12px",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
