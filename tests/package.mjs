import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import assert from "node:assert/strict";
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
  run(["scaffold", project, "--template", "web"]);
  const report = JSON.parse(run(["audit", join(project, "atlas.json"), "--json", "--strict"]));
  assert(report.valid);
  assert.deepEqual(report.warnings, []);
  const port = await new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const p = probe.address().port;
      probe.close(() => resolve(p));
    });
  });
  child = spawn("npm", [...npmArgs, "serve", join(project, "atlas.json"), "--port", String(port)], {
    cwd: temp,
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
