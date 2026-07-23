import Link from "next/link";
import { formatPostDate, getAllPosts } from "@/lib/posts";

const topics = [
  "Java 后端",
  "交易一致性",
  "Redis 与并发",
  "工程实践",
];

export default function Home() {
  const latestPost = getAllPosts()[0];

  return (
    <>
      <section className="py-16 sm:py-24">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-[hsl(var(--brand))]">
          Zhou Zhirui · Engineering Notes
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-6xl">
          把复杂系统，
          <span className="text-[hsl(var(--brand))]">讲清楚。</span>
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-[hsl(var(--muted))] sm:text-lg">
          这里记录后端工程、交易链路、可靠性设计，以及把真实项目沉淀成可复用知识的过程。
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/posts"
            className="rounded-full bg-[hsl(var(--text))] px-5 py-2.5 text-sm font-medium text-[hsl(var(--bg))] no-underline hover:bg-[hsl(var(--brand))] hover:text-white"
          >
            浏览文章
          </Link>
          <Link
            href="/about"
            className="rounded-full border border-[hsl(var(--border))] px-5 py-2.5 text-sm font-medium no-underline hover:border-[hsl(var(--brand))]"
          >
            了解作者
          </Link>
        </div>
      </section>

      <section className="grid gap-4 border-t border-[hsl(var(--border))] py-10 sm:grid-cols-[1.2fr_1fr] sm:gap-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--muted))]">
            Latest writing
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {latestPost?.title ?? "技术文章正在整理迁入"}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[hsl(var(--muted))]">
            {latestPost?.description ??
              "接下来会逐步迁移旧博客中的技术文章，并保留原始发布时间与历史链接信息。"}
          </p>
          {latestPost ? (
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
              <Link href={`/posts/${latestPost.slug}`}>阅读全文 →</Link>
              <time
                dateTime={latestPost.publishedAt}
                className="text-xs text-[hsl(var(--muted))]"
              >
                {formatPostDate(latestPost.publishedAt)}
              </time>
            </div>
          ) : null}
        </div>
        <ul className="grid grid-cols-2 gap-2 self-start" aria-label="关注主题">
          {topics.map((topic) => (
            <li
              key={topic}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface)/0.7)] px-3 py-3 text-sm"
            >
              {topic}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
