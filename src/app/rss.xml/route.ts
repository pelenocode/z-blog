import { Feed } from "feed";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const generatedAt = new Date();
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

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
