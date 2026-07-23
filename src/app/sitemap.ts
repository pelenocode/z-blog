import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/posts";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const posts = getAllPosts().map((post) => ({
    url: `${siteConfig.url}/posts/${post.slug}`,
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: siteConfig.url,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteConfig.url}/posts`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/about`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...posts,
  ];
}
