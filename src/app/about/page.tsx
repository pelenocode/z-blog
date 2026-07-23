import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "关于",
  description: "关于周之瑞和这个技术博客。",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <section className="py-14 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--brand))]">
        About
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">关于我</h1>
      <div className="mt-8 max-w-2xl space-y-5 text-base leading-8 text-[hsl(var(--muted))]">
        <p>
          我是周之瑞，一名关注 Java
          后端、交易系统与可靠性设计的工程师。这个博客用来记录项目实践，也记录那些值得反复推敲的工程选择。
        </p>
        <p>
          我希望这里的文章不只给出结论，也把约束、取舍、失败路径和验证过程讲清楚。
        </p>
      </div>
      <div className="mt-8 flex gap-4 text-sm">
        <Link href="/posts">浏览文章</Link>
        <Link href="/rss.xml">订阅 RSS</Link>
      </div>
    </section>
  );
}
