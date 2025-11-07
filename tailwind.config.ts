import type { Config } from "tailwindcss";

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "hsl(var(--brand))", fg: "hsl(var(--brand-fg))" },
        bg: "hsl(var(--bg))",
        text: "hsl(var(--text))",
        muted: "hsl(var(--muted))",
        border: "hsl(var(--border))",
      },
    },
  },
  plugins: [],
} satisfies Config;
