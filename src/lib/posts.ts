import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const postsDirectory = path.join(process.cwd(), "content", "posts");

type PostFrontmatter = {
  title?: unknown;
  slug?: unknown;
  date?: unknown;
  updated?: unknown;
  description?: unknown;
  categories?: unknown;
  tags?: unknown;
  draft?: unknown;
};

export type PostSummary = {
  title: string;
  slug: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  categories: string[];
  tags: string[];
  readingMinutes: number;
};

export type Post = PostSummary & {
  content: string;
};

type LoadedPost = {
  post: Post;
  draft: boolean;
};

function expectString(value: unknown, field: string, fileName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fileName}: frontmatter "${field}" must be a string`);
  }

  return value.trim();
}

function normalizeStringList(value: unknown, field: string, fileName: string) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${fileName}: frontmatter "${field}" must be a string array`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

function normalizeDate(value: unknown, field: string, fileName: string) {
  const rawValue = expectString(value, field, fileName);
  const date = new Date(rawValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fileName}: frontmatter "${field}" is not a valid date`);
  }

  return rawValue;
}

function estimateReadingMinutes(content: string) {
  const plainText = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_[\]|()-]/g, " ");
  const characterCount = plainText.replace(/\s/g, "").length;

  return Math.max(1, Math.ceil(characterCount / 500));
}

function readPost(fileName: string): LoadedPost {
  const filePath = path.join(postsDirectory, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  const parsed = matter(source);
  const data = parsed.data as PostFrontmatter;
  const slug = expectString(data.slug, "slug", fileName);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`${fileName}: frontmatter "slug" must be lowercase kebab-case`);
  }

  if (data.draft !== undefined && typeof data.draft !== "boolean") {
    throw new Error(`${fileName}: frontmatter "draft" must be a boolean`);
  }

  return {
    draft: data.draft === true,
    post: {
      title: expectString(data.title, "title", fileName),
      slug,
      description: expectString(data.description, "description", fileName),
      publishedAt: normalizeDate(data.date, "date", fileName),
      updatedAt:
        data.updated === undefined
          ? undefined
          : normalizeDate(data.updated, "updated", fileName),
      categories: normalizeStringList(data.categories, "categories", fileName),
      tags: normalizeStringList(data.tags, "tags", fileName),
      readingMinutes: estimateReadingMinutes(parsed.content),
      content: parsed.content.trim(),
    },
  };
}

export function getAllPosts(): Post[] {
  if (!fs.existsSync(postsDirectory)) return [];

  const posts = fs
    .readdirSync(postsDirectory)
    .filter((fileName) => fileName.endsWith(".md"))
    .map(readPost)
    .filter(({ draft }) => !draft)
    .map(({ post }) => post)
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );

  const slugs = new Set<string>();
  for (const post of posts) {
    if (slugs.has(post.slug)) {
      throw new Error(`Duplicate post slug: ${post.slug}`);
    }
    slugs.add(post.slug);
  }

  return posts;
}

export function getPostBySlug(slug: string) {
  return getAllPosts().find((post) => post.slug === slug);
}

export function formatPostDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
