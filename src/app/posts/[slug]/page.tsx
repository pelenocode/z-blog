import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { formatPostDate, getAllPosts, getPostBySlug } from "@/lib/posts";

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return { title: "文章未找到" };
  }

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/posts/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `/posts/${post.slug}`,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      tags: post.tags,
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <article className="py-14 sm:py-20">
      <Link
        href="/posts"
        className="text-sm text-[hsl(var(--muted))] decoration-transparent"
      >
        ← 返回文章归档
      </Link>

      <header className="mt-9 border-b border-[hsl(var(--border))] pb-9">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[hsl(var(--muted))]">
          {post.categories.map((category) => (
            <span
              key={category}
              className="rounded-full bg-[hsl(var(--surface))] px-2.5 py-1"
            >
              {category}
            </span>
          ))}
          <time dateTime={post.publishedAt}>
            {formatPostDate(post.publishedAt)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{post.readingMinutes} 分钟阅读</span>
        </div>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
          {post.title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-[hsl(var(--muted))]">
          {post.description}
        </p>
      </header>

      <div className="post-content mt-10">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            rehypeSlug,
            [rehypeAutolinkHeadings, { behavior: "wrap" }],
          ]}
        >
          {post.content}
        </ReactMarkdown>
      </div>

      <footer className="mt-12 border-t border-[hsl(var(--border))] pt-7">
        <div className="flex flex-wrap gap-2" aria-label="文章标签">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[hsl(var(--border))] px-3 py-1 text-xs text-[hsl(var(--muted))]"
            >
              #{tag}
            </span>
          ))}
        </div>
        {post.legacyUrl ? (
          <p className="mt-6 text-xs leading-6 text-[hsl(var(--muted))]">
            本文从旧博客迁入，原始链接：
            <a
              href={post.legacyUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1"
            >
              查看历史页面
            </a>
          </p>
        ) : null}
      </footer>
    </article>
  );
}
