// src/app/rss.xml/route.ts
import { NextResponse } from "next/server";
import { Feed } from "feed";

export const runtime = "edge"; // 轻量返回

export async function GET() {
  const siteUrl = "https://z-blog-z.vercel.app";

  // 占位文章，后面接真实数据
  const posts = [
    {
      title: "Hello MVP",
      id: `${siteUrl}/posts/hello-mvp`,
      link: `${siteUrl}/posts/hello-mvp`,
      date: new Date(),
      description: "这是一个占位文章条目，用于测试 RSS。",
    },
  ];

  const feed = new Feed({
    id: siteUrl,
    title: "周之瑞 · 博客 RSS",
    description: "写作、项目与年度回顾的订阅源",
    link: siteUrl,
    language: "zh-CN",
    updated: new Date(),
    feedLinks: { rss2: `${siteUrl}/rss.xml` },
    author: { name: "周之瑞" },
  });

  posts.forEach((p) => {
    feed.addItem({
      title: p.title,
      id: p.id,
      link: p.link,
      date: p.date,
      description: p.description,
    });
  });

  return new NextResponse(feed.rss2(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}

