import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const args = process.argv.slice(2);

function readArgument(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function hasFlag(name) {
  return args.includes(name);
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normalizeDate(rawSource, field, parsedDate) {
  const rawDate = rawSource
    .match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1]
    ?.trim();

  if (rawDate && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate)) {
    return `${rawDate.replace(" ", "T")}+08:00`;
  }

  const date = parsedDate instanceof Date ? parsedDate : new Date(parsedDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid post date: ${String(parsedDate)}`);
  }

  return date.toISOString();
}

function quote(value) {
  return JSON.stringify(String(value));
}

function renderList(name, values) {
  if (values.length === 0) return `${name}: []`;
  return `${name}:\n${values.map((value) => `  - ${quote(value)}`).join("\n")}`;
}

function validateBody(body) {
  if (!body.trim()) {
    throw new Error("Post body is empty");
  }

  const fenceCount = (body.match(/^[ \t]*```/gm) ?? []).length;
  if (fenceCount % 2 !== 0) {
    throw new Error("Post contains an unclosed code fence");
  }
}

function normalizeBody(content) {
  const languageAliases = new Map([
    ["c#", "text"],
    ["java", "java"],
    ["sql", "sql"],
  ]);

  return content
    .replace(/<!--\s*more\s*-->/gi, "")
    .replace(
      /^([ \t]*```)([^\s`]*)[ \t]*$/gm,
      (line, fence, language) => {
        if (!language) return fence;
        return `${fence}${languageAliases.get(language.toLowerCase()) ?? language.toLowerCase()}`;
      },
    )
    .trim();
}

const sourceArg = readArgument("--source");
const slug = readArgument("--slug");
const description = readArgument("--description");
const shouldWrite = hasFlag("--write");
const shouldForce = hasFlag("--force");

if (!sourceArg || !slug) {
  throw new Error(
    "Usage: npm run migrate:post -- --source <file> --slug <slug> [--description <text>] [--write]",
  );
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  throw new Error(`Slug must be lowercase kebab-case: ${slug}`);
}

const sourcePath = path.resolve(sourceArg);
const rawSource = fs.readFileSync(sourcePath, "utf8");
const parsed = matter(rawSource);
const title = String(parsed.data.title ?? "").trim();
const categories = normalizeList(
  parsed.data.categories ?? parsed.data.category,
);
const tags = normalizeList(parsed.data.tags);
const publishedAt = normalizeDate(rawSource, "date", parsed.data.date);
const updatedAt =
  parsed.data.updated === undefined
    ? publishedAt
    : normalizeDate(rawSource, "updated", parsed.data.updated);
const body = normalizeBody(parsed.content);

if (!title) {
  throw new Error("Post title is missing");
}

validateBody(body);

const resolvedDescription =
  description ??
  body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/^#+\s*/, "").trim())
    .find((paragraph) => paragraph && !paragraph.startsWith("|"));

if (!resolvedDescription) {
  throw new Error("Post description could not be derived");
}

const frontmatter = [
  "---",
  `title: ${quote(title)}`,
  `slug: ${quote(slug)}`,
  `date: ${quote(publishedAt)}`,
  `updated: ${quote(updatedAt)}`,
  `description: ${quote(resolvedDescription)}`,
  renderList("categories", categories),
  renderList("tags", tags),
  "draft: false",
  "---",
  "",
].join("\n");

const destinationPath = path.join(
  process.cwd(),
  "content",
  "posts",
  `${slug}.md`,
);

const summary = {
  source: sourcePath,
  destination: destinationPath,
  title,
  slug,
  publishedAt,
  updatedAt,
  categories,
  tags,
  bodyCharacters: body.length,
  mode: shouldWrite ? "write" : "dry-run",
};

if (!shouldWrite) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

if (fs.existsSync(destinationPath) && !shouldForce) {
  throw new Error(
    `Destination already exists: ${destinationPath}. Use --force to replace it.`,
  );
}

fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
fs.writeFileSync(destinationPath, `${frontmatter}${body}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
