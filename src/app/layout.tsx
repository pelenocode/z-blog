// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { siteConfig } from "@/lib/site";

const themeInitializer = `
  try {
    const savedTheme = localStorage.getItem("z-theme");
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    document.documentElement.dataset.theme =
      savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : preferredTheme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.shortName}`,
  },
  description: siteConfig.description,
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": "/rss.xml" },
  },
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body>
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-7 sm:px-8 sm:py-10">
          <header className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-6">
            <Link
              href="/"
              className="no-underline decoration-transparent"
              aria-label="返回首页"
            >
              <span className="block text-lg font-semibold tracking-tight">
                {siteConfig.shortName}
              </span>
              <span className="block text-xs text-[hsl(var(--muted))]">
                工程、系统与长期思考
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <nav
                className="flex items-center gap-4 text-sm text-[hsl(var(--muted))]"
                aria-label="主导航"
              >
                <Link href="/">首页</Link>
                <Link href="/posts">归档</Link>
                <Link href="/about">关于</Link>
              </nav>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mt-16 flex flex-col gap-2 border-t border-[hsl(var(--border))] pt-6 text-xs text-[hsl(var(--muted))] sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} 周之瑞 · 保留部分权利</span>
            <Link href="/rss.xml">RSS 订阅</Link>
          </footer>
        </div>
      </body>
    </html>
  );
}
