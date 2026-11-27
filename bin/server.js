import { createServer } from "node:http";
import { realpath, stat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative, extname, sep } from "node:path";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
};
const within = (root, path) => {
  const r = relative(root, path);
  return r === "" || (!r.startsWith(".." + sep) && r !== ".." && !r.startsWith(sep));
};
function matchesETag(value, etag) {
  if (!value) return false;
  if (value.trim() === "*") return true;
  // GET/HEAD use weak comparison; quoted opaque tags can contain commas.
  const tags = value.match(/(?:W\/)?"[^"]*"|[^,\s]+/g) || [];
  return tags.some((tag) => tag === etag || tag === `W/${etag}`);
}
/** Local static preview only. Resolves symlinks before checking the root boundary. */
export async function serve(
  directory,
  { port = 4178, host = "127.0.0.1", viewer, packageRoot, handler } = {},
) {
  const root = await realpath(resolve(directory));
  if (!(await stat(root)).isDirectory()) throw new Error("Serve root must be a directory.");
  const server = createServer(async (req, res) => {
    const fail = (status, message) => {
      res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(message);
    };
    if (handler && (await handler(req, res))) return;
    if (!["GET", "HEAD"].includes(req.method)) return fail(405, "Method not allowed");
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (
        pathname.includes("\0") ||
        pathname.includes("\\") ||
        pathname.split("/").some((part) => part.startsWith("."))
      )
        return fail(404, "Not found");
      if (viewer && pathname === "/") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(req.method === "HEAD" ? undefined : viewer);
        return;
      }
      let requestRoot = root,
        requestPath = pathname;
      if (viewer && pathname.startsWith("/__ketatlas__/")) {
        requestPath = pathname.slice("/__ketatlas__".length);
        const builtAsset =
          requestPath === "/dist/index.js" ||
          requestPath.startsWith("/dist/styles/") ||
          requestPath.startsWith("/dist/assets/");
        const developmentAsset =
          typeof __KETATLAS_BUILD__ === "undefined" &&
          ["src", "styles", "assets"].includes(requestPath.split("/")[1]);
        if (!builtAsset && !developmentAsset) return fail(404, "Not found");
        requestRoot = packageRoot;
      }
      let path = resolve(requestRoot, "." + requestPath);
      if (!within(requestRoot, path)) return fail(404, "Not found");
      path = await realpath(path);
      if (!within(requestRoot, path)) return fail(404, "Not found");
      let info = await stat(path);
      if (info.isDirectory()) {
        if (!pathname.endsWith("/")) {
          res.writeHead(301, { Location: encodeURI(pathname) + "/" });
          res.end();
          return;
        }
        path = await realpath(resolve(path, "index.html"));
        if (!within(requestRoot, path)) return fail(404, "Not found");
        info = await stat(path);
      }
      if (!info.isFile()) return fail(404, "Not found");
      // Hash and send the same bytes, including when a file is edited during a request.
      // Do not retain file contents between requests or rely on mtime/size for freshness.
      const body = await readFile(path);
      const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
      const headers = {
        "Content-Type": types[extname(path)] || "application/octet-stream",
        "Cache-Control": "private, no-cache",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
      };
      if (matchesETag(req.headers["if-none-match"], etag)) {
        res.writeHead(304, headers);
        return res.end();
      }
      res.writeHead(200, { ...headers, "Content-Length": body.length });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      fail(404, "Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}
