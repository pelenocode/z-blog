const fallbackSiteUrl = "https://z-blog-z.vercel.app";

export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? fallbackSiteUrl
).replace(/\/$/, "");

export const siteConfig = {
  name: "周之瑞 · 博客",
  shortName: "周之瑞",
  description: "记录 Java 后端、交易一致性、工程实践与长期思考。",
  url: siteUrl,
} as const;
