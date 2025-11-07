import type { Config } from "tailwindcss";

export default {
  darkMode: ["class", '[data-theme="dark"]'], // 支持 class 和 data-attr
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "hsl(var(--brand))", // 主色
          fg: "hsl(var(--brand-fg))",   // 主色上的文字/图标
        },
        bg: "hsl(var(--bg))",
        text: "hsl(var(--text))",
        muted: "hsl(var(--muted))",
        border: "hsl(var(--border))",
      },
    },
  },
  plugins: [],
} satisfies Config;

