#!/usr/bin/env node
import { createCatalogSourceManifestEntry, summarizeCatalogSources } from "../lib/catalog-source-ingestion.ts";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const [key, value] = process.argv[index].split("=", 2);
  if (key.startsWith("--")) args.set(key, value ?? process.argv[index + 1] ?? "");
}
const root = path.resolve(args.get("--root") || "材料型录");
const output = path.resolve(args.get("--output") || "work/catalog-source-manifest.json");
const rootLabel = path.basename(root);
const files = [];
const errors = [];
async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    try {
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const metadata = await stat(full);
        const relativePath = path.relative(root, full);
        files.push(createCatalogSourceManifestEntry({
          root: rootLabel, relativePath, sizeBytes: metadata.size, modifiedAt: metadata.mtime.toISOString(),
        }));
      }
    } catch (error) {
      errors.push({ path: path.relative(root, full), message: error instanceof Error ? error.message : String(error) });
    }
  }
}
await walk(root);
files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
const manifest = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), root: rootLabel, rootPath: root,
  sourcePolicy: "metadata-only; product records require parser output and human review",
  summary: summarizeCatalogSources(files), errors, entries: files,
};
await writeFile(output, JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify({ output, root, ...manifest.summary, errors: errors.length }, null, 2));
