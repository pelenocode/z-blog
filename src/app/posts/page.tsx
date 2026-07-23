import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "文章归档",
  description: "周之瑞的技术文章归档。",
  alternates: { canonical: "/posts" },
};

export default function PostsPage() {
  return (
    <section className="py-14 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--brand))]">
        Archive
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">文章归档</h1>
      <div className="mt-10 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface)/0.55)] p-8 sm:p-10">
        <h2 className="text-xl font-semibold">第一批技术文章正在整理</h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-[hsl(var(--muted))]">
          文章会在校对标题、代码块、分类和历史链接后逐步发布。你也可以通过 RSS
          获取后续更新。
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/rss.xml">订阅 RSS</Link>
          <Link href="/">返回首页</Link>
        </div>
      </div>
    </section>
  );
}
