import type { Metadata } from "next";
import Link from "next/link";
import { formatPostDate, getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "文章归档",
  description: "周之瑞的技术文章归档。",
  alternates: { canonical: "/posts" },
};

export default function PostsPage() {
  const posts = getAllPosts();

  return (
    <section className="py-14 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--brand))]">
        Archive
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">文章归档</h1>
      <p className="mt-4 text-sm leading-7 text-[hsl(var(--muted))]">
        共 {posts.length} 篇。保留原始发布时间，并持续校对迁入旧博客的技术手记。
      </p>

      <ol className="mt-10 divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
        {posts.map((post) => (
          <li key={post.slug}>
            <article className="py-7">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--muted))]">
                <time dateTime={post.publishedAt}>
                  {formatPostDate(post.publishedAt)}
                </time>
                <span aria-hidden="true">·</span>
                <span>{post.readingMinutes} 分钟阅读</span>
                {post.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-[hsl(var(--surface))] px-2.5 py-1"
                  >
                    {category}
                  </span>
                ))}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                <Link
                  href={`/posts/${post.slug}`}
                  className="decoration-transparent"
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[hsl(var(--muted))]">
                {post.description}
              </p>
            </article>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/rss.xml">订阅 RSS</Link>
        <Link href="/">返回首页</Link>
      </div>
    </section>
  );
}
