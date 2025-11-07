"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const key = "z-theme";

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(key);
    if (saved === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else if (saved === "light") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      // 跟随系统
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.dataset.theme = "dark";
      }
    }
  }, []);

  if (!mounted) return null;

  const isDark = document.documentElement.dataset.theme === "dark";

  function toggle() {
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem(key, "light");
    } else {
      document.documentElement.dataset.theme = "dark";
      localStorage.setItem(key, "dark");
    }
  }

  return (
    <button
      onClick={toggle}
      className="text-sm border border-[hsl(var(--border))] px-2 py-1 rounded hover:bg-[hsl(var(--border))]/20"
      aria-label="切换明暗模式"
    >
      {isDark ? "☾ 暗" : "☀ 明"}
    </button>
  );
}

