import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
await mkdir("artifacts", { recursive: true });
execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
const packed = execFileSync(
  "npm",
  ["pack", "--ignore-scripts", "--json", "--pack-destination", "artifacts"],
  { encoding: "utf8" },
);
const [info] = JSON.parse(packed),
  archive = resolve("artifacts", info.filename);
const files = new Set(info.files.map((f) => f.path));
for (const path of [
  "LICENSE",
  "NOTICE.md",
  "dist/assets/KETJS-LICENSE",
  "dist/assets/INTER-LICENSE",
  "dist/assets/LUCIDE-LICENSE",
  "dist/index.js",
  "dist/ketatlas.js",
  "dist/styles/ketatlas.css",
  "dist/styles/design-system.css",
  "dist/styles/fonts.css",
  "dist/assets/inter-latin-wght-normal.woff2",
  "templates/basic/atlas.json",
  "templates/web/screens/portal.html",
  "templates/process/atlas.json",
  "dist/index.d.ts",
  "schema.json",
  "progress.schema.json",
  "renderer.schema.json",
  "skills/ket-atlas/SKILL.md",
  "docs/agent-mockups.md",
])
  assert(files.has(path), `Missing packed file: ${path}`);
for (const path of files)
  assert(
    !/^(src|bin|scripts|tests|styles|assets|node_modules|artifacts)\//.test(path) &&
      !path.endsWith(".map"),
    `Private file in archive: ${path}`,
  );
const temp = await mkdtemp(join(tmpdir(), "ketatlas-package-")),
  project = join(temp, "my-atlas.ketatlas");
// Keep offline installation and publish previews independent of cached registry metadata.
process.env.npm_config_cache = join(temp, "npm-cache");
const npmArgs = ["exec", "--offline", "--yes", `--package=${archive}`, "--", "ketatlas"];
const cliOnly = process.argv.includes("--cli-only");
let child, browser;
try {
  const run = (args) => execFileSync("npm", [...npmArgs, ...args], { cwd: temp, encoding: "utf8" });
  assert.equal(run(["--version"]).trim(), info.version);
  const publishPreview = JSON.parse(
    execFileSync(
      "npm",
      [
        "publish",
        archive,
        "--dry-run",
        "--json",
        "--offline",
        "--ignore-scripts",
        "--access",
        "public",
      ],
      { cwd: temp, encoding: "utf8" },
    ),
  );
  assert.equal(publishPreview.name, "ketatlas");
  assert.equal(publishPreview.version, info.version);
  // Both execution modes keep package machinery outside the consumer project.
  const prefix = join(temp, "global-cli");
  execFileSync(
    "npm",
    [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--offline",
      "--ignore-scripts",
      "--no-fund",
      archive,
    ],
    { cwd: temp, stdio: "pipe" },
  );
  const installed = join(
    prefix,
    process.platform === "win32" ? "" : "lib",
    "node_modules",
    "ketatlas",
  );
  const installedPackage = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
  assert.equal(installedPackage.license, "MIT");
  assert.deepEqual(installedPackage.dependencies ?? {}, {});
  assert.match(await readFile(join(installed, "LICENSE"), "utf8"), /^MIT License\n/);
  const executable = join(prefix, process.platform === "win32" ? "ketatlas.cmd" : "bin/ketatlas");
  const globalRun = (args, cwd = temp) => execFileSync(executable, args, { cwd, encoding: "utf8" });
  assert.equal(globalRun(["--version"]).trim(), info.version);
  async function snapshot(directory) {
    const result = {};
    async function visit(folder, relative = "") {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const name = join(relative, entry.name);
        assert(
          ![
            "package.json",
            "package-lock.json",
            "npm-shrinkwrap.json",
            "pnpm-lock.yaml",
            "yarn.lock",
            "node_modules",
          ].includes(entry.name),
          `Consumer must not require package tooling: ${name}`,
        );
        if (entry.isDirectory()) await visit(join(folder, entry.name), name);
        else
          result[name] = createHash("sha256")
            .update(await readFile(join(folder, entry.name)))
            .digest("hex");
      }
    }
    await visit(directory);
    return result;
  }
  const snapshots = new Map();
  for (const template of ["basic", "web", "process"]) {
    const destination = template === "web" ? project : join(temp, `${template}.ketatlas`);
    (template === "web" ? run : globalRun)(["scaffold", destination, "--template", template]);
    const before = await snapshot(destination);
    const file = join(destination, "atlas.json");
    for (const invoke of [run, (args) => globalRun(args, destination)]) {
      const report = JSON.parse(invoke(["audit", file, "--json", "--strict"]));
      assert(report.valid);
      assert.deepEqual(report.warnings, []);
      invoke(["validate", file]);
    }
    assert.deepEqual(
      await snapshot(destination),
      before,
      `${template}: audit/validate changed consumer files`,
    );
    snapshots.set(destination, before);
  }
  const freePort = () =>
    new Promise((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const p = probe.address().port;
        probe.close(() => resolve(p));
      });
    });
  const port = await freePort();
  child = spawn(
    executable,
    ["serve", ".", "--port", String(port), "--preload", "--cache-size", "24"],
    {
      cwd: project,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (x) => (output += x));
  child.stderr.on("data", (x) => (output += x));
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(url)).ok;
      if (ready) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, output);
  assert.match(await (await fetch(url)).text(), /"preloadScreens":true/);
  assert.match(await (await fetch(url)).text(), /"maxCachedPreviews":24/);
  const bootstrap = await fetch(url, { headers: { "If-None-Match": "*" } });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.headers.get("cache-control"), "no-store");
  assert.equal(bootstrap.headers.get("etag"), null);
  await bootstrap.text();
  for (const asset of [
    "dist/index.js",
    "dist/styles/ketatlas.css",
    "dist/styles/design-system.css",
    "dist/styles/fonts.css",
    "dist/assets/inter-latin-wght-normal.woff2",
  ]) {
    const first = await fetch(`${url}/__ketatlas__/${asset}`);
    assert.equal(first.status, 200, asset);
    const etag = first.headers.get("etag");
    assert(etag, asset);
    await first.arrayBuffer();
    const cached = await fetch(`${url}/__ketatlas__/${asset}`, {
      headers: { "If-None-Match": etag },
    });
    assert.equal(cached.status, 304, asset);
    assert.equal(cached.headers.get("cache-control"), "private, no-cache");
    assert.equal(await cached.text(), "");
  }
  for (const file of [
    "src/index.js",
    "bin/ketatlas.js",
    "dist/ketatlas.js",
    "dist/index.js.map",
    "package.json",
  ]) {
    assert.equal((await fetch(`${url}/__ketatlas__/${file}`)).status, 404, file);
  }
  const errors = [];
  let page;
  if (!cliOnly) {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => typeof window.atlas?.getState === "function");
    await page.evaluate(() => window.atlas.previewsReady);
    const preloaded = await page.evaluate(() => window.atlas.getState().preload);
    assert(preloaded.total > 0);
    assert.equal(preloaded.loaded, preloaded.total);
    assert.equal(preloaded.failed, 0);
    await page.getByRole("button", { name: "Screens", exact: true }).click();
    await page.locator("[data-progress-edit]").first().click();
    await page.locator('[data-record="owner"]').fill("Package test");
    await page.getByRole("button", { name: "Save progress", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".ketatlas").shadowRoot.getElementById("progress-editor").open,
    );
    const savedProgress = JSON.parse(await readFile(join(project, "atlas.progress.json"), "utf8"));
    assert(Object.values(savedProgress.screens).some((r) => r.owner === "Package test"));
    await page.locator("[data-close-screens]").click();
    await rm(join(project, "atlas.progress.json"));
    assert.equal(await page.locator(".flow-link").count(), 1);
    await page
      .frameLocator('[data-node="purchase:inbox"] iframe')
      .getByRole("heading", { name: "Purchase requests" })
      .waitFor();
    await page.screenshot({ path: "artifacts/packed-install.png" });
    if (
      (await page
        .getByRole("button", { name: "Dark theme", exact: true })
        .getAttribute("aria-pressed")) !== "true"
    )
      await page.getByRole("button", { name: "Dark theme", exact: true }).click();
    await page.getByRole("switch", { name: "Sync screen theme" }).check();
    await page
      .frameLocator('[data-node="purchase:inbox"] iframe')
      .locator('html[data-theme="dark"]')
      .waitFor();
    await page.screenshot({ path: "artifacts/packed-install-dark.png", animations: "disabled" });
    assert.deepEqual(errors, []);
  }
  // Serve from the consumer through npx too, without leaving package files behind.
  let npxServer;
  try {
    const npxPort = await freePort();
    npxServer = spawn(
      "npm",
      [...npmArgs, "serve", ".", "--port", String(npxPort), "--no-preload"],
      {
        cwd: project,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let npxOutput = "";
    npxServer.stdout.on("data", (x) => (npxOutput += x));
    npxServer.stderr.on("data", (x) => (npxOutput += x));
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${npxPort}`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(ready, npxOutput);
    assert.match(
      await (await fetch(`http://127.0.0.1:${npxPort}`)).text(),
      /"preloadScreens":false/,
    );
    if (!cliOnly) {
      await page.goto(`http://127.0.0.1:${npxPort}`);
      await page.waitForFunction(() => typeof window.atlas?.getState === "function");
      assert.equal(await page.evaluate(() => window.atlas.getState().preload.total), 0);
      assert.equal(await page.locator("#dialog-preview iframe").count(), 0);
      await page.evaluate(() => window.atlas.openNode("purchase", "inbox"));
      await page
        .frameLocator("#dialog-preview iframe")
        .getByRole("heading", { name: "Purchase requests" })
        .waitFor();
      await page.getByRole("button", { name: "Close preview" }).click();
      await page.locator("#dialog-preview iframe").waitFor({ state: "detached" });
      await page.getByRole("button", { name: "Screens", exact: true }).click();
      await page.locator("[data-progress-edit]").first().click();
      await page.locator('[data-record="owner"]').fill("Package test");
      await page.getByRole("button", { name: "Save progress", exact: true }).click();
      await page.waitForFunction(
        () =>
          !document.querySelector(".ketatlas").shadowRoot.getElementById("progress-editor").open,
      );
      const savedProgress = JSON.parse(
        await readFile(join(project, "atlas.progress.json"), "utf8"),
      );
      assert(Object.values(savedProgress.screens).some((r) => r.owner === "Package test"));
      await page.locator("[data-close-screens]").click();
      await rm(join(project, "atlas.progress.json"));
      assert.equal(await page.locator(".flow-link").count(), 1);
    }
  } finally {
    if (npxServer) {
      try {
        process.kill(-npxServer.pid, "SIGTERM");
      } catch {}
    }
  }
  // The published executable must expose the owner protocol, not just the source CLI.
  let managedChild;
  try {
    const managedPort = await freePort();
    managedChild = spawn(executable, ["serve", ".", "--managed", "--port", String(managedPort)], {
      cwd: project,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let managedOutput = "";
    let managedError = "";
    managedChild.stdout.on("data", (chunk) => {
      managedOutput += chunk;
    });
    managedChild.stderr.on("data", (chunk) => {
      managedError += chunk;
    });
    for (let i = 0; i < 100 && !managedOutput.includes('"type":"ready"'); i++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert(managedOutput.includes('"type":"ready"'), managedError);
    const managedPage = await (await fetch(`http://127.0.0.1:${managedPort}`)).text();
    assert.match(managedPage, /connectManagedViewer/);
    const exited = once(managedChild, "exit");
    managedChild.stdin.end('{"type":"stop"}\n');
    const [code] = await exited;
    assert.equal(code, 0, managedError);
    assert.match(managedOutput, /"type":"stopped","reason":"owner-request"/);
  } finally {
    managedChild?.kill();
  }
  for (const [directory, before] of snapshots)
    assert.deepEqual(await snapshot(directory), before, "Commands changed consumer files");
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/package-results.json",
    JSON.stringify(
      {
        archive: info.filename,
        packedFiles: files.size,
        size: info.size,
        unpackedSize: info.unpackedSize,
        checks: [
          "offline npm exec",
          "publish dry run uses an absolute archive path",
          "isolated global installation",
          "all three templates need no consumer package manifest or dependencies",
          "scaffold, audit, validate, and serve preserve consumer files",
          "scaffold outside checkout",
          "strict audit",
          "JSON-only serve",
          "compiled viewer assets served; implementation source and CLI are not web-accessible",
          "packed managed owner protocol and stop command",
          ...(cliOnly ? [] : ["packaged viewer and iframe render"]),
        ],
        browserChecks: cliOnly ? "not run" : "passed",
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS packed installation: ${files.size} files, ${info.size} bytes; scaffold → audit → serve${cliOnly ? " (browser checks not run)" : " → browser"}`,
  );
} finally {
  if (browser) await browser.close();
  if (child) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await rm(temp, { recursive: true, force: true });
}
