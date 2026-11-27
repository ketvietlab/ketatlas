import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { validateAtlas } from "../src/config.js";

export const atlasDirectorySuffix = ".ketatlas";
export const atlasManifestName = "atlas.json";

const excludedDirectories = new Set([
  ".git",
  ".cache",
  ".next",
  ".venv",
  "build",
  "dist",
  "node_modules",
  "vendor",
]);

export function isAtlasDirectory(path) {
  return basename(resolve(path)).toLowerCase().endsWith(atlasDirectorySuffix);
}

export function requireAtlasDirectory(path) {
  const destination = resolve(path);
  if (!isAtlasDirectory(destination))
    throw new Error(`Atlas directories must end in ${atlasDirectorySuffix}.`);
  return destination;
}

export async function resolveAtlasFile(target) {
  const absolute = resolve(target);
  const info = await stat(absolute);
  if (!info.isDirectory()) return absolute;
  if (!isAtlasDirectory(absolute))
    throw new Error(`Atlas directories must end in ${atlasDirectorySuffix}.`);
  return join(absolute, atlasManifestName);
}

async function describe(directory) {
  const path = join(directory, atlasManifestName);
  let config;
  try {
    config = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return { error: { path, message: error.message } };
  }
  const validation = validateAtlas(config);
  if (!validation.valid)
    return {
      error: {
        path,
        message: validation.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
      },
    };
  return {
    atlas: {
      path,
      directory,
      title: config.title,
      screens: (config.screens || []).map(({ id, title, url }) => ({ id, title, url })),
      flowCount: config.flows.length,
    },
  };
}

export async function discoverAtlases(root) {
  const workspace = await realpath(resolve(root));
  if (!(await stat(workspace)).isDirectory())
    throw new Error("Discovery root must be a directory.");
  const atlases = [],
    errors = [],
    directories = [workspace];
  while (directories.length) {
    const directory = directories.pop();
    if (isAtlasDirectory(directory)) {
      const result = await describe(directory);
      if (result.atlas) atlases.push(result.atlas);
      else errors.push(result.error);
      continue;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || excludedDirectories.has(entry.name))
        continue;
      directories.push(join(directory, entry.name));
    }
  }
  atlases.sort((a, b) => a.path.localeCompare(b.path));
  errors.sort((a, b) => a.path.localeCompare(b.path));
  return { version: 1, root: workspace, atlases, errors };
}
