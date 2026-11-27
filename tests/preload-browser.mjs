import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveAtlas } from "../bin/viewer.js";

const temp = await mkdtemp(join(tmpdir(), "ketatlas-large-preview-"));
let server, browser;
try {
  const count = 183;
  const screens = Array.from({ length: count }, (_, i) => ({
    id: `screen-${i}`,
    title: `Screen ${i + 1}`,
    url: `./screen.html?screen=${i}`,
  }));
  await writeFile(
    join(temp, "atlas.json"),
    JSON.stringify({
      version: 1,
      title: "Large atlas loading regression",
      viewport: { width: 800, height: 600 },
      screens,
      flows: [
        {
          id: "main",
          title: "Desktop workflow",
          nodes: screens.map((screen, i) => ({
            id: screen.id,
            screen: screen.id,
            column: i % 10,
            row: Math.floor(i / 10),
          })),
          edges: screens
            .slice(1)
            .map((screen, i) => ({ from: screens[i].id, to: screen.id, label: "Next" })),
        },
      ],
    }),
  );
  const bridge = (await readFile("starter/screens/welcome.html", "utf8")).match(
    /<script>([\s\S]*?)<\/script>/,
  )[1];
  await writeFile(
    join(temp, "screen.html"),
    `<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width"><script>${bridge}</script><style>body{font:16px system-ui;padding:32px;background:white;color:#18202a}html[data-theme=dark] body{background:#18202a;color:white}input{font:inherit;padding:12px;background:inherit;color:inherit;border:1px solid #87909a}</style></head><body><h1>Desktop mock</h1><p>Synthetic fixture for loading and appearance checks.</p><label>Draft <input aria-label="Draft"></label></body></html>`,
  );
  server = await serveAtlas(join(temp, "atlas.json"), { port: 0, preloadScreens: false });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    assert(route.request().url().startsWith(origin), "Fixtures must stay on the test origin");
    if (route.request().isNavigationRequest() && route.request().url().includes("screen.html"))
      requests.push(route.request().url());
    return route.continue();
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.atlas?.getState?.().nodeCount === 183);
  await page.evaluate(() => window.atlas.previewsReady);
  const canvas = page.frameLocator('[data-node="main:screen-0"] iframe');
  await canvas.getByRole("heading", { name: "Desktop mock" }).waitFor();
  assert.equal(await page.evaluate(() => window.atlas.getState().preload.total), 0);
  const startupFrames = await page.locator("iframe").count();
  assert(startupFrames > 0 && startupFrames <= 24);
  assert(requests.length <= 24, "Starting the large atlas must not preload all 366 frames");
  assert.equal(await page.locator("#dialog-preview iframe").count(), 0);

  if (
    (await page
      .getByRole("button", { name: "Dark theme", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.getByRole("switch", { name: "Sync screen theme" }).check();
  await canvas.locator('html[data-theme="dark"]').waitFor();
  await page.evaluate(() => window.atlas.openNode("main", "screen-182"));
  const preview = page.frameLocator("#dialog-preview iframe");
  await preview.locator('html[data-theme="dark"]').waitFor();
  await preview.getByRole("textbox", { name: "Draft" }).fill("Preserved while switching themes");
  assert((await page.locator("iframe").count()) <= 25);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/large-atlas-lazy-dark.png", animations: "disabled" });
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.locator("#dialog-preview iframe").waitFor({ state: "detached" });
  if (
    (await page
      .getByRole("button", { name: "Dark theme", exact: true })
      .getAttribute("aria-pressed")) !== "false"
  )
    await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await canvas.locator('html[data-theme="light"]').waitFor();
  await page.evaluate(() => window.atlas.openNode("main", "screen-182"));
  await preview.locator('html[data-theme="light"]').waitFor();
  assert.equal(
    await preview.getByRole("textbox", { name: "Draft" }).inputValue(),
    "",
    "Closed previews are discarded in lazy mode",
  );
  await preview.getByRole("textbox", { name: "Draft" }).fill("Preserved while switching themes");
  await page.evaluate(() => window.atlas.setTheme("dark"));
  await preview.locator('html[data-theme="dark"]').waitFor();
  await page.evaluate(() => window.atlas.setTheme("light"));
  await preview.locator('html[data-theme="light"]').waitFor();
  assert.equal(
    await preview.getByRole("textbox", { name: "Draft" }).inputValue(),
    "Preserved while switching themes",
  );
  await page.screenshot({ path: "artifacts/large-atlas-lazy-light.png", animations: "disabled" });
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.locator("#dialog-preview iframe").waitFor({ state: "detached" });
  await page.evaluate(() => window.atlas.focusNode("main", "screen-182"));
  await page
    .frameLocator('[data-node="main:screen-182"] iframe')
    .locator('html[data-theme="light"]')
    .waitFor();
  assert((await page.locator("iframe").count()) <= 24);
  await page.evaluate(() => window.atlas.zoomTo(0.18));
  await page.waitForFunction(
    () => document.querySelector(".ketatlas").shadowRoot.querySelectorAll("iframe").length === 0,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/large-atlas-results.json",
    JSON.stringify({ screens: count, eagerFrameCount: count * 2, startupFrames, errors }, null, 2),
  );
  console.log(
    `PASS large atlas: ${count} screens, ${startupFrames} startup frames; bounded lazy previews and light/dark sync`,
  );
} finally {
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  await rm(temp, { recursive: true, force: true });
}
