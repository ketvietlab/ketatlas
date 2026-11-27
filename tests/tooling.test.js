import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { serve } from "../bin/server.js";
import { serveAtlas } from "../bin/viewer.js";
import { validateRendererConfig } from "../bin/renderer.js";
import { auditAtlas } from "../bin/audit.js";
import { discoverAtlases } from "../bin/discovery.js";
const cli = resolve("bin/ketatlas.js");
const command = (args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });
test("serve validates preview cache limits before starting a server", async () => {
  for (const value of ["0", "2", "129", "1.5", "nope"]) {
    const result = spawnSync(
      process.execPath,
      [cli, "serve", "examples/atlas.json", "--cache-size", value],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cache size must be/);
  }
  const result = spawnSync(
    process.execPath,
    [cli, "serve", "examples/atlas.json", "--cache-size", "24", "--no-preload"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires flow preloading/);
  await assert.rejects(
    serveAtlas("examples/atlas.json", { maxCachedPreviews: 2 }),
    /maxCachedPreviews/,
  );
});

test("serve rejects conflicting or inapplicable preload flags", async () => {
  for (const flags of [
    ["--preload", "--no-preload"],
    ["--no-preload", "--preload"],
  ]) {
    const result = spawnSync(process.execPath, [cli, "serve", "examples/atlas.json", ...flags], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Choose either --preload or --no-preload/);
  }
  const plain = spawnSync(process.execPath, [cli, "serve", "examples", "--no-preload"], {
    encoding: "utf8",
  });
  assert.equal(plain.status, 1);
  assert.match(plain.stderr, /Preload options require/);
  await assert.rejects(
    serveAtlas("examples/atlas.json", { preloadScreens: "false" }),
    /preloadScreens must be a boolean/,
  );
});
test("scaffold all templates; audit and serve JSON without a wrapper page", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ketatlas-tooling-"));
  try {
    for (const template of ["basic", "web", "process"]) {
      const target = join(temp, `${template}.ketatlas`);
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
test("discovery indexes only valid .ketatlas bundles and directory commands resolve atlas.json", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ketatlas-discovery-"));
  try {
    const target = join(temp, "checkout.ketatlas");
    command(["scaffold", target]);
    await mkdir(join(temp, "legacy"));
    await writeFile(join(temp, "legacy/atlas.json"), await readFile(join(target, "atlas.json")));

    const result = await discoverAtlases(temp);
    assert.equal(result.version, 1);
    assert.equal(result.atlases.length, 1);
    assert.equal(result.atlases[0].directory, await realpath(target));
    assert(result.atlases[0].screens.length > 0);
    assert.equal(result.errors.length, 0);
    assert.equal(JSON.parse(command(["discover", temp, "--json"])).atlases.length, 1);
    assert.equal(JSON.parse(command(["audit", target, "--json", "--strict"])).valid, true);
    assert.match(command(["validate", target]), /Valid atlas/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("scaffold refuses existing content and audit --strict fails on disconnected nodes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ketatlas-guard-"));
  try {
    const target = join(temp, "existing.ketatlas");
    await mkdir(target);
    const existing = join(target, "keep.txt");
    await writeFile(existing, "keep");
    assert.notEqual(spawnSync(process.execPath, [cli, "scaffold", target]).status, 0);
    assert.equal(await readFile(existing, "utf8"), "keep");
    assert.notEqual(
      spawnSync(process.execPath, [cli, "scaffold", join(temp, "missing-suffix")]).status,
      0,
    );
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

test("framework renderer uses a second origin and rewrites only screen routes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "ketatlas-renderer-"));
  const target = join(temp, "shared-ui.ketatlas");
  await mkdir(target);
  await writeFile(
    join(target, "atlas.json"),
    JSON.stringify({
      version: 1,
      title: "Shared UI",
      screens: [{ id: "home", title: "Home", url: "./home?state=ready" }],
      flows: [
        {
          id: "main",
          title: "Main",
          nodes: [{ id: "home", screen: "home" }],
          edges: [],
        },
      ],
    }),
  );
  await writeFile(
    join(temp, "renderer.mjs"),
    `import {createServer} from "node:http";
const port=Number(process.env.KETATLAS_HTML_PORT);
createServer((req,res)=>{res.setHeader("content-type","text/html");res.end("<!doctype html><meta name=viewport content='width=device-width'><h1>Native "+req.url+"</h1>")}).listen(port,"127.0.0.1");`,
  );
  await writeFile(
    join(target, "atlas.renderer.json"),
    JSON.stringify({
      version: 1,
      framework: "test-server",
      command: [process.execPath, "{atlasDirectory}/../renderer.mjs"],
      readyPath: "/health",
      screenBasePath: "/shared/",
    }),
  );
  const report = await auditAtlas(join(target, "atlas.json"));
  assert.equal(report.valid, true, JSON.stringify(report));
  assert.equal(report.summary.localFiles, 0);
  assert.match(report.scope, /test-server renderer contract/);
  const server = await serveAtlas(join(target, "atlas.json"), {
    port: 0,
    renderer: true,
    htmlPort: 0,
    rendererStdio: "ignore",
  });
  try {
    assert(server.htmlOrigin);
    assert.notEqual(server.address().port, Number(new URL(server.htmlOrigin).port));
    const viewer = await (await fetch(`http://127.0.0.1:${server.address().port}`)).text();
    assert(viewer.includes(`${server.htmlOrigin}/shared/`));
    assert(viewer.includes("allow-same-origin"));
    const page = await (await fetch(`${server.htmlOrigin}/shared/home?state=ready`)).text();
    assert.match(page, /Native \/shared\/home\?state=ready/);
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await server.closeRenderer();
    await rm(temp, { recursive: true, force: true });
  }
});

test("renderer contract rejects shell strings and malformed paths", () => {
  assert.equal(
    validateRendererConfig({ version: 1, framework: "react", command: ["npm", "run", "dev"] })
      .valid,
    true,
  );
  const result = validateRendererConfig({
    version: 1,
    framework: "vue",
    command: "npm run dev",
    screenBasePath: "/missing-trailing-slash",
  });
  assert.equal(result.valid, false);
  assert(result.errors.some((issue) => issue.path === "command"));
  assert(result.errors.some((issue) => issue.path === "screenBasePath"));
});

test("bundled skill requires native and shared framework implementations", async () => {
  const skill = await readFile("skills/ket-atlas/SKILL.md", "utf8");
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  for (const requirement of [
    "React components render through the product's React runtime",
    "Vue components render through the product's Vue runtime",
    "KetJS server components render on a KetJS server",
    "Never copy shared component or style files from one atlas to another",
    `npx --yes ketatlas@${version} serve`,
  ])
    assert(skill.includes(requirement), requirement);
});
