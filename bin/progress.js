import { readFile, writeFile, rename, unlink, open, lstat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { emptyProgress, requireProgress } from "../src/progress.js";
export const progressPath = (file) => file.replace(/\.json$/i, "") + ".progress.json";
const hash = (text) => createHash("sha256").update(text).digest("hex");
export async function readProgress(file, atlas) {
  try {
    if ((await lstat(file)).isSymbolicLink())
      throw new Error("Progress file must not be a symlink.");
    const text = await readFile(file, "utf8");
    return { data: requireProgress(JSON.parse(text), atlas), revision: hash(text) };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    return { data: emptyProgress(), revision: "missing" };
  }
}
/** Shared by the CLI and local editor. One lock and content revision prevent stale writes. */
export async function saveProgress(file, atlasFile, expected, change) {
  file = resolve(file);
  let lock;
  try {
    lock = await open(file + ".lock", "wx");
  } catch (e) {
    if (e.code === "EEXIST")
      throw Object.assign(new Error("Another writer is saving. Reload and retry."), {
        status: 409,
      });
    throw e;
  }
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    const atlas = JSON.parse(await readFile(atlasFile, "utf8"));
    const current = await readProgress(file, atlas);
    if (!expected || expected !== current.revision)
      throw Object.assign(
        new Error(
          "Progress changed since it was loaded. Reload before saving; your draft is still visible.",
        ),
        { status: 409 },
      );
    const data = requireProgress(change(structuredClone(current.data)), atlas);
    const text = JSON.stringify(data, null, 2) + "\n";
    await writeFile(temp, text, { flag: "wx" });
    if ((await readProgress(file, atlas)).revision !== current.revision)
      throw Object.assign(new Error("Progress changed during saving. Reload and retry."), {
        status: 409,
      });
    await rename(temp, file);
    return { data, revision: hash(text) };
  } finally {
    await unlink(temp).catch(() => {});
    await lock.close();
    await unlink(file + ".lock");
  }
}
export function progressHandler(file, atlasFile, token, editable) {
  const path = progressPath(file);
  return async (req, res) => {
    if (new URL(req.url, "http://localhost").pathname !== "/__ketatlas__/progress") return false;
    const reply = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "GET") {
        reply(200, {
          ...(await readProgress(path, JSON.parse(await readFile(atlasFile, "utf8")))),
          editable,
        });
        return true;
      }
      if (req.method !== "PUT") {
        reply(405, { error: "Method not allowed" });
        return true;
      }
      const origin = `http://${req.headers.host}`;
      if (
        !editable ||
        req.headers.origin !== origin ||
        req.headers["x-ketatlas-token"] !== token ||
        !req.headers["content-type"]?.startsWith("application/json")
      ) {
        reply(403, { error: "Progress writes require the local editor." });
        return true;
      }
      let text = "",
        size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          reply(413, { error: "Progress update is too large." });
          return true;
        }
        text += chunk;
      }
      const body = JSON.parse(text);
      if (
        typeof body.screenId !== "string" ||
        !body.record ||
        typeof body.record !== "object" ||
        Array.isArray(body.record)
      )
        throw new Error("Expected a screen ID and record.");
      const result = await saveProgress(path, atlasFile, req.headers["if-match"], (data) => {
        Object.defineProperty(data.screens, body.screenId, {
          value: { ...body.record, updatedAt: new Date().toISOString() },
          enumerable: true,
          writable: true,
          configurable: true,
        });
        return data;
      });
      reply(200, { ...result, editable });
    } catch (e) {
      reply(e.status || 400, { error: e.message });
    }
    return true;
  };
}
