// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import ThemeToggle from "@/components/ThemeToggle";


export const metadata: Metadata = {
  title: "周之瑞 · 博客",
  description: "写作、项目与年度回顾的发布地",
  metadataBase: new URL("https://z-blog-z.vercel.app"),
  openGraph: {
    title: "周之瑞 · 博客",
    description: "写作、项目与年度回顾的发布地",
    url: "https://z-blog-z.vercel.app",
    siteName: "周之瑞 · 博客",
    type: "website",
    images: ["/og.png"]
  },
  twitter: {
    card: "summary_large_image",
    title: "周之瑞 · 博客",
    description: "写作、项目与年度回顾的发布地",
    images: ["/og.png"],
  },
  alternates: {
    types: { "application/rss+xml": "/rss.xml" },
  },
  icons: {icon: "/favicon.svg"}
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="bg-white text-gray-900 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <header className="mb-8 flex items-center justify-between">
            <h1 className="text-2xl font-semibold">周之瑞 · 博客</h1>
            <div className="flex items-center gap-3">
              <nav className="mt-3 text-sm opacity-80">
                <a href="/" className="hover:underline mr-4">首页</a>
                <a href="/posts" className="hover:underline mr-4">归档</a>
                <a href="/about" className="hover:underline">关于</a>
              </nav>
            <ThemeToggle />
            </div>
          </header>
          <main>{children}</main>
          <footer className="mt-16 text-xs opacity-70">
            © {new Date().getFullYear()} 周之瑞 · 保留部分权利
          </footer>
        </div>
      </body>
    </html>
  );
}

