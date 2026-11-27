import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, stat, utimes, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "../bin/server.js";
import { serveAtlas } from "../bin/viewer.js";

const close = async (server) => {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
};

test("static files revalidate by content, including weak tags, lists, HEAD and same-size edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "ketatlas-http-cache-"));
  const file = join(root, "asset.png");
  const original = Buffer.from([0, 255, 10, 128, 34, 65]);
  await writeFile(file, original);
  const initialStat = await stat(file);
  const server = await serve(root, { port: 0 });
  const url = `http://127.0.0.1:${server.address().port}/asset.png`;
  try {
    const first = await fetch(url);
    assert.equal(first.status, 200);
    const etag = first.headers.get("etag");
    assert.equal(etag, `"${createHash("sha256").update(original).digest("hex")}"`);
    assert.equal(first.headers.get("cache-control"), "private, no-cache");
    assert.equal(first.headers.get("content-type"), "image/png");
    assert.equal(first.headers.get("content-length"), String(original.length));
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), original);

    for (const method of ["GET", "HEAD"]) {
      for (const condition of [etag, `W/${etag}`, `"old,*,tag", W/${etag}`, "*"]) {
        const response = await fetch(url, { method, headers: { "If-None-Match": condition } });
        assert.equal(response.status, 304, `${method} ${condition}`);
        assert.equal(response.headers.get("etag"), etag);
        assert.equal(response.headers.get("cache-control"), "private, no-cache");
        assert.equal(response.headers.get("content-length"), null);
        assert.equal((await response.arrayBuffer()).byteLength, 0);
      }
    }
    for (const condition of ['"stale"', '"old,*,tag"', `"prefix${etag.slice(1)}`, `w/${etag}`]) {
      const response = await fetch(url, { headers: { "If-None-Match": condition } });
      assert.equal(response.status, 200, condition);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
    }
    const head = await fetch(url, { method: "HEAD", headers: { "If-None-Match": '"stale"' } });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("etag"), etag);
    assert.equal(head.headers.get("content-length"), String(original.length));
    assert.equal(await head.text(), "");

    await utimes(file, initialStat.atime, new Date(initialStat.mtimeMs + 10000));
    assert.equal((await fetch(url, { headers: { "If-None-Match": etag } })).status, 304);
    const changed = Buffer.from([0, 255, 10, 128, 34, 66]);
    await writeFile(file, changed);
    await utimes(file, initialStat.atime, initialStat.mtime);
    const updated = await fetch(url, { headers: { "If-None-Match": etag } });
    assert.equal(updated.status, 200);
    assert.notEqual(updated.headers.get("etag"), etag);
    assert.deepEqual(Buffer.from(await updated.arrayBuffer()), changed);
    await writeFile(file, original);
    assert.equal((await fetch(url, { headers: { "If-None-Match": etag } })).status, 304);

    await rm(file);
    const missing = await fetch(url, { headers: { "If-None-Match": "*" } });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");
    assert.equal(missing.headers.get("etag"), null);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("viewer bootstrap and progress remain fresh while JSON and runtime assets revalidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "ketatlas-viewer-cache-"));
  await writeFile(
    join(root, "atlas.json"),
    JSON.stringify({
      version: 1,
      title: "Cache fixture",
      screens: [],
      flows: [
        {
          id: "main",
          title: "Main",
          nodes: [{ id: "step", type: "note", title: "Step" }],
          edges: [],
        },
      ],
    }),
  );
  const server = await serveAtlas(join(root, "atlas.json"), { port: 0, readOnly: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ["/", "/__ketatlas__/progress"]) {
      const response = await fetch(base + path, { headers: { "If-None-Match": "*" } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("etag"), null);
      assert((await response.text()).length > 0);
    }
    for (const path of [
      "/atlas.json",
      "/__ketatlas__/src/index.js",
      "/__ketatlas__/styles/ketatlas.css",
    ]) {
      const first = await fetch(base + path);
      assert.equal(first.status, 200);
      const etag = first.headers.get("etag");
      assert(etag);
      await first.arrayBuffer();
      const cached = await fetch(base + path, { headers: { "If-None-Match": etag } });
      assert.equal(cached.status, 304, path);
      assert.equal(await cached.text(), "");
    }
    const rejected = await fetch(base + "/atlas.json", {
      method: "POST",
      headers: { "If-None-Match": "*" },
    });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get("etag"), null);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});
