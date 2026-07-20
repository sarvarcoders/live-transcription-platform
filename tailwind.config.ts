import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#f8fafc",
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af"
        }
      },
      fontFamily: {
        sans: [
          "Aptos",
          "Segoe UI Variable",
          "SF Pro Text",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        display: [
          "var(--font-montserrat)",
          "Montserrat",
          "Aptos",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        mono: [
          "Cascadia Code",
          "SFMono-Regular",
          "Consolas",
          "Liberation Mono",
          "monospace"
        ]
      },
      boxShadow: {
        soft: "0 24px 80px rgba(15, 23, 42, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
