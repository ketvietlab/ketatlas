import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveAtlas } from "../bin/viewer.js";

const temp = await mkdtemp(join(tmpdir(), "ketatlas-flow-cache-"));
let server, browser;
try {
  const counts = [3, 3, 30];
  const flows = counts.map((count, f) => ({
    id: `flow-${f}`,
    title: `Flow ${f}`,
    nodes: Array.from({ length: count }, (_, n) => ({
      id: `node-${n}`,
      screen: `screen-${f}-${n}`,
      column: n,
    })),
    edges: [],
  }));
  const screens = counts.flatMap((count, f) =>
    Array.from({ length: count }, (_, n) => ({
      id: `screen-${f}-${n}`,
      title: `Screen ${f}-${n}`,
      url: `./screen.html?flow=${f}&node=${n}`,
    })),
  );
  await writeFile(
    join(temp, "atlas.json"),
    JSON.stringify({ version: 1, title: "Flow cache", screens, flows }),
  );
  await writeFile(
    join(temp, "screen.html"),
    '<!doctype html><title>Mock</title><h1>Mock screen</h1><input aria-label="Draft">',
  );
  server = await serveAtlas(join(temp, "atlas.json"), { port: 0 });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const requests = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    assert(route.request().url().startsWith(origin));
    if (route.request().isNavigationRequest() && route.request().url().includes("screen.html"))
      requests.push(route.request().url());
    return route.continue();
  });
  await page.goto(origin);
  await page.waitForFunction(() => typeof window.atlas?.getState === "function");
  await page.evaluate(() => window.atlas.previewsReady);
  assert.equal(requests.length, 3);
  assert(requests.every((url) => url.includes("flow=0")));
  assert.equal(await page.locator("#dialog-preview iframe").count(), 0);
  await page.evaluate(() => {
    const root = window.atlas.element.shadowRoot;
    window.peakFrames = root.querySelectorAll("iframe").length;
    window.frameObserver = new MutationObserver(() => {
      window.peakFrames = Math.max(window.peakFrames, root.querySelectorAll("iframe").length);
    });
    window.frameObserver.observe(root, { childList: true, subtree: true });
  });
  const first = page.frameLocator('[data-node="flow-0:node-0"] iframe');
  await first.locator("body").evaluate(() => {
    window.cacheMarker = "preserved";
  });
  await page.evaluate(() => window.atlas.goToFlow("flow-1"));
  await page.evaluate(() => window.atlas.previewsReady);
  assert.equal(requests.length, 6);
  await page.evaluate(() => window.atlas.goToFlow("flow-0"));
  await page.evaluate(() => window.atlas.previewsReady);
  assert.equal(requests.length, 6);
  assert.equal(await first.locator("body").evaluate(() => window.cacheMarker), "preserved");
  await page.evaluate(() => window.atlas.openNode("flow-0", "node-0"));
  const dialog = page.frameLocator("#dialog-preview iframe:not([hidden])");
  await dialog.getByRole("textbox", { name: "Draft" }).fill("Cached draft");
  await page.getByRole("button", { name: "Close preview" }).click();
  const beforeReopen = requests.length;
  await page.evaluate(() => window.atlas.openNode("flow-0", "node-0"));
  assert.equal(await dialog.getByRole("textbox", { name: "Draft" }).inputValue(), "Cached draft");
  assert.equal(requests.length, beforeReopen);
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.evaluate(() => window.atlas.goToFlow("flow-2"));
  await page.evaluate(() => window.atlas.previewsReady);
  assert.equal(new Set(requests.filter((url) => url.includes("flow=2"))).size, 30);
  assert((await page.locator("iframe").count()) <= 24);
  assert((await page.evaluate(() => window.peakFrames)) <= 24);
  assert.equal(await page.locator('[data-node="flow-0:node-0"] iframe').count(), 0);
  await page.evaluate(() => window.atlas.goToFlow("flow-0"));
  await page.evaluate(() => window.atlas.previewsReady);
  assert.equal(await first.locator("body").evaluate(() => window.cacheMarker), undefined);
  await page.evaluate(() => {
    window.atlas.goToFlow("flow-2");
    window.atlas.goToFlow("flow-1");
  });
  await page.evaluate(() => window.atlas.previewsReady);
  assert.equal(await page.evaluate(() => window.atlas.getState().preload.pending), 0);
  assert((await page.evaluate(() => window.peakFrames)) <= 24);
  assert.deepEqual(errors, []);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/flow-cache.png" });
  await writeFile(
    "artifacts/flow-cache-results.json",
    JSON.stringify({ peakFrames: await page.evaluate(() => window.peakFrames), errors }, null, 2),
  );
  console.log(
    "PASS selected-flow preload, cache reuse, eviction, rapid switching and 24-frame bound",
  );
} finally {
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  await rm(temp, { recursive: true, force: true });
}
