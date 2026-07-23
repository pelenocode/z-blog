"use client";

export default function ThemeToggle() {
  const key = "z-theme";

  function toggle() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    localStorage.setItem(key, nextTheme);
  }

  return (
    <button
      onClick={toggle}
      className="rounded-full border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs text-[hsl(var(--muted))] transition hover:border-[hsl(var(--brand))] hover:text-[hsl(var(--text))]"
      aria-label="切换明暗模式"
      title="切换明暗模式"
    >
      <span className="theme-label-light" aria-hidden="true">☀ 明</span>
      <span className="theme-label-dark" aria-hidden="true">☾ 暗</span>
    </button>
  );
}
