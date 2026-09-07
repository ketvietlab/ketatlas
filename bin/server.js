import { createServer } from "node:http";
import { realpath, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
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
/** Local static preview only. Resolves symlinks before checking the root boundary. */
export async function serve(
  directory,
  { port = 4178, host = "127.0.0.1", viewer, packageRoot, handler } = {},
) {
  const root = await realpath(resolve(directory));
  if (!(await stat(root)).isDirectory()) throw new Error("Serve root must be a directory.");
  const server = createServer(async (req, res) => {
    const fail = (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
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
          "Cache-Control": "no-cache",
        });
        res.end(req.method === "HEAD" ? undefined : viewer);
        return;
      }
      let requestRoot = root,
        requestPath = pathname;
      if (viewer && pathname.startsWith("/__ketatlas__/")) {
        requestPath = pathname.slice("/__ketatlas__".length);
        if (!["src", "styles", "assets"].includes(requestPath.split("/")[1]))
          return fail(404, "Not found");
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
      res.writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      if (req.method === "HEAD") return res.end();
      const stream = createReadStream(path);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
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
