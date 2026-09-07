import { readProgress, progressPath } from "./progress.js";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, dirname, relative, sep, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateAtlas } from "../src/config.js";
const within = (root, path) => {
  const r = relative(root, path);
  return r === "" || (!r.startsWith(".." + sep) && r !== ".." && !r.startsWith(sep));
};
export async function auditAtlas(file, { root: rootOption } = {}) {
  const absolute = await realpath(resolve(file));
  const root = await realpath(resolve(rootOption || dirname(absolute)));
  let config;
  try {
    config = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    return {
      valid: false,
      file: absolute,
      root,
      summary: { flows: 0, screens: 0, nodes: 0, edges: 0, localFiles: 0, remoteUrls: 0 },
      errors: [{ path: "$", message: error.message }],
      warnings: [],
      scope: "Invalid JSON; no resources inspected.",
    };
  }
  const result = validateAtlas(config);
  const errors = [...result.errors],
    warnings = [...result.warnings],
    checked = new Set(),
    remote = new Set();
  if (!within(root, absolute))
    errors.push({ path: "file", message: "The atlas JSON must be inside the serve root." });
  async function inspect(value, from, label) {
    if (
      !value ||
      value.startsWith("#") ||
      value.startsWith("data:") ||
      value.startsWith("mailto:") ||
      value.startsWith("tel:")
    )
      return;
    if (/^(https?:)?\/\//i.test(value)) {
      remote.add(value);
      return;
    }
    let target;
    try {
      const url = value.startsWith("/")
        ? new URL("." + value, pathToFileURL(root + sep))
        : new URL(value, pathToFileURL(from));
      if (url.protocol !== "file:") return;
      target = await realpath(fileURLToPath(url));
      if (!within(root, target))
        throw new Error("Asset is outside the serve root; move it or use --root.");
      const rel = relative(root, target);
      if (rel.split(sep).some((part) => part.startsWith(".")))
        throw new Error("Dotfiles are not served.");
      if (!(await stat(target)).isFile()) throw new Error("Expected a file.");
    } catch (e) {
      errors.push({
        path: label,
        message: `Cannot serve ${value}: ${e.code === "ENOENT" ? "file not found" : e.message}`,
      });
      return;
    }
    if (checked.has(target)) return;
    checked.add(target);
    const extension = extname(target).toLowerCase();
    if (![".html", ".css"].includes(extension)) return;
    const content = await readFile(target, "utf8");
    if (extension === ".html") {
      if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(content))
        warnings.push({
          path: relative(root, target),
          message: "No viewport meta tag; narrow previews may use a desktop layout.",
        });
      // Literal HTML resource URLs only. JS-generated URLs need browser verification.
      for (const match of content.matchAll(
        /<(?:script|link|img|iframe|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
      ))
        await inspect(match[1], target, relative(root, target));
      for (const match of content.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi))
        await inspect(match[1], target, relative(root, target));
    } else {
      for (const match of content.matchAll(
        /(?:url\(\s*["']?([^\s"')]+)["']?\s*\)|@import\s+["']([^"']+)["'])/gi,
      ))
        await inspect(match[1] || match[2], target, relative(root, target));
    }
  }
  if (result.valid) {
    for (const s of config.screens || []) await inspect(s.url, absolute, `screen:${s.id}`);
    for (const f of config.flows)
      for (const n of f.nodes) if (n.url) await inspect(n.url, absolute, `node:${f.id}/${n.id}`);
  }
  if (result.valid) {
    try {
      await readProgress(progressPath(absolute), config);
    } catch (e) {
      errors.push({ path: "progress", message: e.message });
    }
  }
  for (const url of remote)
    warnings.push({ path: "remote", message: `Remote URL not fetched: ${url}` });
  const flows = Array.isArray(config?.flows) ? config.flows : [];
  return {
    valid: errors.length === 0,
    file: absolute,
    root,
    summary: {
      flows: flows.length,
      screens: Array.isArray(config?.screens) ? config.screens.length : 0,
      nodes: flows.reduce((n, f) => n + (Array.isArray(f?.nodes) ? f.nodes.length : 0), 0),
      edges: flows.reduce((n, f) => n + (Array.isArray(f?.edges) ? f.edges.length : 0), 0),
      localFiles: checked.size,
      remoteUrls: remote.size,
    },
    errors,
    warnings,
    scope:
      "Static configuration and literal local HTML/CSS references. JavaScript behavior and remote embedding policies are not executed.",
  };
}
