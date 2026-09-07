import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveAtlas } from "../bin/viewer.js";
import { serve } from "../bin/server.js";
const dir = await mkdtemp(join(tmpdir(), "ketatlas-progress-browser-"));
const file = join(dir, "atlas.json");
const atlas = {
  version: 1,
  title: "Release readiness",
  screens: [
    { id: "domain", title: "Domain settings", url: "./page.html", badge: "Mock" },
    { id: "menu", title: "Navigation menu", url: "./page.html" },
  ],
  flows: [
    { id: "site", title: "Site setup", nodes: [{ id: "domain", screen: "domain" }], edges: [] },
    {
      id: "publish",
      title: "Publish",
      nodes: [
        { id: "domain", screen: "domain" },
        { id: "menu", screen: "menu" },
      ],
      edges: [{ from: "domain", to: "menu", label: "Next" }],
    },
  ],
};
let server, readonly, staticServer, browser;
const errors = [];
try {
  await writeFile(file, JSON.stringify(atlas));
  await writeFile(
    join(dir, "page.html"),
    "<!doctype html><html><title>Settings</title><body><h1>Site settings</h1></body></html>",
  );
  server = await serveAtlas(file, { port: 0 });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1512, height: 1050 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.waitForFunction(() => window.atlas);
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  assert.equal(await page.locator("#progress-rows tr").count(), 2);
  await page.locator('[data-progress-edit="domain"]').click();
  await page.locator('[data-record="status"]').selectOption("in_progress");
  await page.locator('[data-record="owner"]').fill("Atlas team");
  await page
    .locator('[data-record="summary"]')
    .fill("Create and edit are merged; conflict recovery needs verification.");
  await page.getByRole("button", { name: "Add evidence", exact: true }).click();
  await page.locator('[data-evidence-field="title"]').fill("Domain editing PR");
  await page.locator('[data-evidence-field="url"]').fill("https://example.test/pull/12");
  await page.locator('[data-evidence-field="state"]').fill("merged");
  await page.getByRole("button", { name: "Add check", exact: true }).click();
  await page.locator('[data-check-field="title"]').fill("Create and edit domains");
  await page.locator("[data-check-evidence]").check();
  await page.locator('[data-check-field="done"]').check();
  await page.getByRole("button", { name: "Save progress", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector(".ketatlas").shadowRoot.getElementById("progress-editor").open,
  );
  assert.equal(
    JSON.parse(await readFile(join(dir, "atlas.progress.json"))).screens.domain.owner,
    "Atlas team",
  );
  assert.equal(
    await page.locator('[data-progress-screen="domain"] [data-status="in_progress"]').count(),
    2,
  );
  assert(
    (await page.locator('[data-progress-flow="site"]').getAttribute("title")).includes(
      "0% verified",
    ),
  );
  assert(
    (await page.locator('[data-progress-flow="site"]').getAttribute("title")).includes(
      "1 in progress",
    ),
  );
  assert(
    (await page.locator('[data-progress-flow="site"]').getAttribute("title")).includes(
      "Checks 100% · 1/1",
    ),
  );
  assert(
    (await page.locator('[data-progress-flow="publish"]').getAttribute("title")).includes(
      "1 unscoped",
    ),
  );
  const second = await browser.newPage();
  await second.goto(origin);
  await second.waitForFunction(() => window.atlas);
  await second.getByRole("button", { name: "Screens", exact: true }).click();
  await second.locator('[data-progress-edit="domain"]').click();
  await page.locator('[data-progress-edit="domain"]').click();
  await page
    .locator('[data-record="blocker"]')
    .fill("DNS verification requires a configured environment.");
  await page.getByRole("button", { name: "Save progress", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector(".ketatlas").shadowRoot.getElementById("progress-editor").open,
  );
  await second.locator('[data-record="owner"]').fill("Other editor");
  await second.getByRole("button", { name: "Save progress", exact: true }).click();
  await second.locator("#progress-error").filter({ hasText: "changed since" }).waitFor();
  assert.equal(await second.locator('[data-record="owner"]').inputValue(), "Other editor");
  second.on("dialog", (d) => d.accept());
  await second.getByRole("button", { name: "Reload latest and discard draft" }).click();
  await second.waitForFunction(
    () =>
      document.querySelector(".ketatlas").shadowRoot.querySelector('[data-record="owner"]')
        .value === "Atlas team",
  );
  await second.locator('[data-record="owner"]').fill("Reconciled editor");
  await second.getByRole("button", { name: "Save progress", exact: true }).click();
  await second.waitForFunction(
    () => !document.querySelector(".ketatlas").shadowRoot.getElementById("progress-editor").open,
  );
  await second.close();
  await page.getByRole("button", { name: "Refresh progress", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".ketatlas")
      .shadowRoot.getElementById("progress-rows")
      .textContent.includes("Reconciled editor"),
  );
  assert(
    (await page.locator('[data-progress-flow="site"]').getAttribute("title")).includes("1 blocked"),
  );
  await page.locator("#progress-blocked").check();
  assert.equal(await page.locator("#progress-rows tr").count(), 1);
  await page.locator("#progress-blocked").uncheck();
  await page.locator("#progress-filter").selectOption("unassessed");
  assert.equal(await page.locator("#progress-rows [data-progress-edit]").count(), 1);
  await page.locator("#progress-filter").selectOption("");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/progress-screens.png" });
  await page.locator('[data-progress-edit="domain"]').click();
  await page.locator('[data-record="status"]').selectOption("verified");
  await page.getByRole("button", { name: "Save progress", exact: true }).click();
  await page.locator("#progress-error").filter({ hasText: "Verified requires" }).waitFor();
  await page.screenshot({ path: "artifacts/progress-editor.png" });
  page.on("dialog", (d) => d.accept());
  await page.locator("[data-close-editor]").click();
  await page.locator('[data-progress-map="domain"]').click();
  assert.equal((await page.evaluate(() => window.atlas.getState())).selectedNodeId, "domain");
  await page.getByRole("button", { name: "Screen progress", exact: true }).click();
  await page.locator("[data-close-editor]").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await page.screenshot({ path: "artifacts/progress-mobile.png" });
  assert(
    await page
      .locator("#progress-screens")
      .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
  );
  await page.reload();
  await page.waitForFunction(() => window.atlas);
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  assert(
    await page
      .locator("#progress-rows")
      .innerText()
      .then((t) => t.includes("Reconciled editor")),
  );
  readonly = await serveAtlas(file, { port: 0, readOnly: true });
  await page.goto(`http://127.0.0.1:${readonly.address().port}`);
  await page.waitForFunction(() => window.atlas);
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await page.locator('[data-progress-edit="domain"]').click();
  assert.equal(await page.locator("#progress-save").isVisible(), false);
  assert.equal(await page.locator('[data-record="owner"]').isDisabled(), true);
  staticServer = await serve(dir, {
    port: 0,
    packageRoot: process.cwd(),
    viewer: `<!doctype html><div id="atlas" style="height:100vh"></div><script type="module">import {loadAtlas} from '/__ketatlas__/src/index.js'; window.atlas=await loadAtlas(document.querySelector('#atlas'),'/atlas.json',{progressURL:'./atlas.progress.json'});</script>`,
  });
  await page.goto(`http://127.0.0.1:${staticServer.address().port}`);
  await page.waitForFunction(() => window.atlas);
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  assert((await page.locator("#progress-rows").innerText()).includes("Reconciled editor"));
  await page.locator('[data-progress-edit="domain"]').click();
  assert.equal(await page.locator("#progress-save").isVisible(), false);
  atlas.flows[0].nodes.push({ id: "error", screen: "domain", url: "./page.html?error=1" });
  atlas.flows[0].edges.push({ from: "domain", to: "error", label: "Error state" });
  atlas.flows.push({
    id: "process",
    title: "Release process",
    nodes: [{ id: "handoff", type: "external", title: "Handoff" }],
    edges: [],
  });
  await writeFile(file, JSON.stringify(atlas));
  await writeFile(
    join(dir, "atlas.progress.json"),
    JSON.stringify({
      version: 1,
      screens: {
        domain: {
          status: "verified",
          checks: [
            { id: "recovery", title: "Recovery checked", done: true, evidenceIds: ["test"] },
          ],
          evidence: [
            {
              id: "test",
              kind: "test",
              title: "Evidence",
              url: "./page.html",
              state: "passed",
              revision: "abc123",
              environment: "CI",
            },
          ],
        },
        menu: { status: "planned" },
      },
    }),
  );
  await page.setViewportSize({ width: 1512, height: 1050 });
  await page.reload();
  await page.waitForFunction(() => window.atlas);
  assert((await page.locator("#sidebar-progress").getAttribute("title")).includes("50% verified"));
  assert(
    (await page.locator('[data-progress-flow="site"]').getAttribute("title")).includes(
      "100% verified",
    ),
  );
  assert(
    (await page.locator('[data-progress-flow="site"]').getAttribute("title")).includes(
      "1/1 screens",
    ),
  );
  assert(
    (await page.locator('[data-progress-flow="publish"]').getAttribute("title")).includes(
      "50% verified",
    ),
  );
  assert(await page.locator('[data-progress-flow="process"]').isHidden());
  assert.equal(await page.locator('[data-progress-flow="site"]').innerText(), "100%");
  assert.equal(await page.locator("#sidebar-progress").innerText(), "50%");
  await page.getByRole("searchbox", { name: "Search flows and screens" }).fill("publish");
  await page.locator('[data-flow="publish"]').click();
  assert(
    (await page.locator('[data-progress-flow="publish"]').getAttribute("title")).includes(
      "50% verified",
    ),
  );
  await page.getByRole("searchbox", { name: "Search flows and screens" }).fill("");
  await page.screenshot({ path: "artifacts/sidebar-progress.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Choose a flow", exact: true }).click();
  assert(await page.locator('[data-progress-flow="site"]').isVisible());
  assert.equal(await page.locator('[data-flow="site"] small .flow-progress').innerText(), "100%");
  const badgeBox = await page.locator('[data-progress-flow="site"]').boundingBox();
  assert(badgeBox.height <= 22 && badgeBox.width <= 44, "Numeric badge stays compact");
  await page.screenshot({ path: "artifacts/sidebar-progress-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS progress: unique screens, edit/evidence/checklist, save/reload, shared nodes, filters, stale writes, verification refusal, mobile and read-only",
  );
} finally {
  if (browser) await browser.close();
  for (const s of [server, readonly, staticServer])
    if (s) {
      s.closeAllConnections();
      await new Promise((r) => s.close(r));
    }
  await rm(dir, { recursive: true, force: true });
}
