import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { serve } from "../bin/server.js";
import { serveAtlas } from "../bin/viewer.js";
import { auditAtlas } from "../bin/audit.js";
const cli = resolve("bin/ketatlas.js");
const command = (args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });
test("scaffold all templates; audit and serve JSON without a wrapper page", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ketatlas-tooling-"));
  try {
    for (const template of ["basic", "web", "process"]) {
      const target = join(temp, template);
      command(["scaffold", target, "--template", template]);
      const report = await auditAtlas(join(target, "atlas.json"));
      assert(report.valid, JSON.stringify(report));
      assert.deepEqual(report.warnings, []);
      const server = await serveAtlas(join(target, "atlas.json"), { port: 0 });
      try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const page = await fetch(base);
        assert((await page.text()).includes("/__ketatlas__/src/index.js"));
        const config = await (await fetch(base + "/atlas.json")).json();
        assert.equal(config.version, 1);
        assert.equal((await fetch(base + "/__ketatlas__/src/index.js")).status, 200);
        assert.equal((await fetch(base + "/__ketatlas__/bin/ketatlas.js")).status, 404);
      } finally {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      }
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("scaffold refuses existing content and audit --strict fails on disconnected nodes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ketatlas-guard-"));
  try {
    const existing = join(temp, "keep.txt");
    await writeFile(existing, "keep");
    assert.notEqual(spawnSync(process.execPath, [cli, "scaffold", temp]).status, 0);
    assert.equal(await readFile(existing, "utf8"), "keep");
    const config = {
      version: 1,
      title: "Disconnected",
      flows: [
        {
          id: "f",
          title: "Flow",
          nodes: [
            { id: "a", title: "A" },
            { id: "b", title: "B" },
          ],
          edges: [],
        },
      ],
    };
    const file = join(temp, "atlas.json");
    await writeFile(file, JSON.stringify(config));
    assert.equal(spawnSync(process.execPath, [cli, "audit", file]).status, 0);
    assert.equal(spawnSync(process.execPath, [cli, "audit", file, "--strict"]).status, 1);
    const report = JSON.parse(command(["audit", file, "--json"]));
    assert.equal(report.warnings.length, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("audit finds missing assets, root escapes and remote references without fetching them", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ketatlas-audit-"));
  try {
    await mkdir(join(temp, "project"));
    await writeFile(join(temp, "outside.html"), "<html></html>");
    const file = join(temp, "project/atlas.json");
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        title: "Audit",
        screens: [
          { id: "a", title: "A", url: "../outside.html" },
          { id: "b", title: "B", url: "missing.html" },
          { id: "c", title: "C", url: "https://example.test/remote.html" },
        ],
        flows: [{ id: "f", title: "F", nodes: [{ id: "a", screen: "a" }], edges: [] }],
      }),
    );
    const report = await auditAtlas(file);
    assert.equal(report.errors.length, 2);
    assert.equal(report.summary.remoteUrls, 1);
    assert.equal(report.warnings.length, 1);
    await writeFile(file, "null");
    assert.equal((await auditAtlas(file)).valid, false);
    await writeFile(file, "{bad");
    assert.equal((await auditAtlas(file)).valid, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("static server blocks symlink escapes and dotfiles; handles MIME, HEAD and methods", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ketatlas-server-"));
  await mkdir(join(temp, "root"));
  await writeFile(join(temp, "secret.txt"), "outside");
  await symlink(join(temp, "secret.txt"), join(temp, "root/link.txt"));
  await writeFile(join(temp, "root/.private"), "hidden");
  await writeFile(join(temp, "root/index.html"), "hello");
  const server = await serve(join(temp, "root"), { port: 0 });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of [
      "/link.txt",
      "/.private",
      "/%2eprivate",
      "/../secret.txt",
      "/%2e%2e%2fsecret.txt",
    ])
      assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base, { method: "POST" })).status, 405);
    const head = await fetch(base, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert(head.headers.get("content-type").startsWith("text/html"));
    assert.equal(await head.text(), "");
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(temp, { recursive: true, force: true });
  }
});
