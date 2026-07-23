import { Feed } from "feed";
import { getAllPosts } from "@/lib/posts";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const posts = getAllPosts();
  const generatedAt = posts[0]
    ? new Date(posts[0].updatedAt ?? posts[0].publishedAt)
    : new Date();
  const feed = new Feed({
    id: siteConfig.url,
    title: `${siteConfig.name} RSS`,
    description: siteConfig.description,
    link: siteConfig.url,
    language: "zh-CN",
    updated: generatedAt,
    copyright: `© ${generatedAt.getFullYear()} ${siteConfig.shortName}`,
    feedLinks: { rss2: `${siteConfig.url}/rss.xml` },
    author: { name: siteConfig.shortName, link: siteConfig.url },
  });

  for (const post of posts) {
    const link = `${siteConfig.url}/posts/${post.slug}`;

    feed.addItem({
      title: post.title,
      id: link,
      link,
      description: post.description,
      date: new Date(post.publishedAt),
      category: [...post.categories, ...post.tags].map((name) => ({ name })),
      author: [{ name: siteConfig.shortName, link: siteConfig.url }],
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
