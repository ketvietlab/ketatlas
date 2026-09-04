import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
await mkdir("artifacts", { recursive: true });
execFileSync(process.execPath, ["scripts/verify-assets.mjs"], { stdio: "inherit" });
const packed = execFileSync(
  "npm",
  ["pack", "--ignore-scripts", "--json", "--pack-destination", "artifacts"],
  { encoding: "utf8" },
);
const [info] = JSON.parse(packed),
  archive = resolve("artifacts", info.filename);
const files = new Set(info.files.map((f) => f.path));
for (const path of [
  "bin/ketatlas.js",
  "bin/viewer.js",
  "bin/audit.js",
  "src/index.js",
  "styles/ketatlas.css",
  "styles/design-system.css",
  "styles/fonts.css",
  "assets/inter-latin-wght-normal.woff2",
  "templates/basic/atlas.json",
  "templates/web/screens/portal.html",
  "templates/process/atlas.json",
  "src/index.d.ts",
  "schema.json",
  "skills/ketatlas/SKILL.md",
  "docs/agent-mockups.md",
])
  assert(files.has(path), `Missing packed file: ${path}`);
for (const path of files)
  assert(!path.startsWith("node_modules/") && !path.startsWith("artifacts/"));
const temp = await mkdtemp(join(tmpdir(), "ketatlas-package-")),
  project = join(temp, "my-atlas");
const npmArgs = ["exec", "--offline", "--yes", `--package=${archive}`, "--", "ketatlas"];
let child, browser;
try {
  const run = (args) => execFileSync("npm", [...npmArgs, ...args], { cwd: temp, encoding: "utf8" });
  assert.equal(run(["--version"]).trim(), info.version);
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
    const destination = template === "web" ? project : join(temp, template);
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
  child = spawn(executable, ["serve", "atlas.json", "--port", String(port)], {
    cwd: project,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
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
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => typeof window.atlas?.getState === "function");
  assert.equal(await page.locator(".flow-link").count(), 1);
  await page
    .frameLocator('[data-node="purchase:inbox"] iframe')
    .getByRole("heading", { name: "Purchase requests" })
    .waitFor();
  await page.screenshot({ path: "artifacts/packed-install.png" });
  assert.deepEqual(errors, []);
  // Serve from the consumer through npx too, without leaving package files behind.
  let npxServer;
  try {
    const npxPort = await freePort();
    npxServer = spawn("npm", [...npmArgs, "serve", "atlas.json", "--port", String(npxPort)], {
      cwd: project,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
    await page.goto(`http://127.0.0.1:${npxPort}`);
    await page.waitForFunction(() => typeof window.atlas?.getState === "function");
    assert.equal(await page.locator(".flow-link").count(), 1);
  } finally {
    if (npxServer) {
      try {
        process.kill(-npxServer.pid, "SIGTERM");
      } catch {}
    }
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
          "isolated global installation",
          "all three templates need no consumer package manifest or dependencies",
          "scaffold, audit, validate, and serve preserve consumer files",
          "scaffold outside checkout",
          "strict audit",
          "JSON-only serve",
          "packaged viewer and iframe render",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS packed installation: ${files.size} files, ${info.size} bytes; scaffold → audit → serve → browser`,
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
