import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

function runMigration(post, sourceRoot, shouldWrite) {
  const scriptPath = path.join(process.cwd(), "scripts", "migrate-hexo-post.mjs");
  const commandArgs = [
    scriptPath,
    "--source",
    path.join(sourceRoot, post.source),
    "--slug",
    post.slug,
    "--description",
    post.description,
    "--legacy-url",
    post.legacyUrl,
    ...(shouldWrite ? ["--write"] : []),
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `${post.slug}: migration failed\n${result.stderr || result.stdout}`,
    );
  }

  return JSON.parse(result.stdout);
}

const manifestArg = readArgument("--manifest");
const sourceRootArg = readArgument("--source-root");
const shouldWrite = args.includes("--write");

if (!manifestArg || !sourceRootArg) {
  throw new Error(
    "Usage: npm run migrate:batch -- --manifest <file> --source-root <hexo-root> [--write]",
  );
}

const manifestPath = path.resolve(manifestArg);
const sourceRoot = path.resolve(sourceRootArg);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (!Array.isArray(manifest) || manifest.length === 0) {
  throw new Error("Migration manifest must be a non-empty array");
}

const requiredFields = ["source", "slug", "description", "legacyUrl"];
const slugs = new Set();

for (const [index, post] of manifest.entries()) {
  for (const field of requiredFields) {
    if (typeof post[field] !== "string" || !post[field].trim()) {
      throw new Error(`Manifest item ${index + 1} is missing ${field}`);
    }
  }

  if (slugs.has(post.slug)) {
    throw new Error(`Duplicate manifest slug: ${post.slug}`);
  }
  slugs.add(post.slug);

  const sourcePath = path.join(sourceRoot, post.source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source post does not exist: ${sourcePath}`);
  }

  const destinationPath = path.join(
    process.cwd(),
    "content",
    "posts",
    `${post.slug}.md`,
  );
  if (fs.existsSync(destinationPath)) {
    throw new Error(`Destination already exists: ${destinationPath}`);
  }
}

const preflight = manifest.map((post) =>
  runMigration(post, sourceRoot, false),
);
const migrated = shouldWrite
  ? manifest.map((post) => runMigration(post, sourceRoot, true))
  : preflight;

console.log(
  JSON.stringify(
    {
      mode: shouldWrite ? "write" : "dry-run",
      manifest: manifestPath,
      sourceRoot,
      total: migrated.length,
      posts: migrated.map(({ title, slug, publishedAt, bodyCharacters }) => ({
        title,
        slug,
        publishedAt,
        bodyCharacters,
      })),
    },
    null,
    2,
  ),
);
