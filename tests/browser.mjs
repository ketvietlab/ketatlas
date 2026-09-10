import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serveAtlas } from "../bin/viewer.js";
const server = await serveAtlas("examples/atlas.json", { port: 0, root: "." });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1512, height: 1050 } }),
  page = await context.newPage();
const errors = [],
  external = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
await context.route("**/*", (route) => {
  const url = route.request().url();
  if (!url.startsWith(origin) && !url.startsWith("data:")) {
    external.push(url);
    return route.abort();
  }
  return route.continue();
});
await mkdir("artifacts", { recursive: true });
const test = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
};
const state = () => page.evaluate(() => window.atlas.getState());
try {
  await page.goto(origin);
  await page.waitForFunction(() => typeof window.atlas?.getState === "function");
  await page.evaluate(() => document.fonts.ready);
  await test("JSON-only entry, English UI, real HTML and labelled edges", async () => {
    assert.equal(await page.locator(".flow-link").count(), 3);
    assert.equal(await page.locator(".flow-edge:has(> path)").count(), 12);
    assert(await page.getByRole("heading", { name: "Workflows", exact: true }).isVisible());
    await page
      .frameLocator('[data-node="sign-in:welcome"] iframe')
      .getByRole("heading", { name: "Good work starts here." })
      .waitFor();
    assert.equal(
      await page
        .frameLocator('[data-node="sign-in:welcome"] iframe')
        .locator("body")
        .evaluate(() => innerWidth),
      390,
    );
    assert.equal(await page.locator(".flow-node img").count(), 0);
    assert.equal(await page.locator(".ketatlas").getAttribute("lang"), "en");
  });
  await page.screenshot({ path: "artifacts/mobile-flow.png" });
  await test("Card drag pans without opening; zoom, keyboard and fit work", async () => {
    const head = await page.locator('[data-node="sign-in:welcome"] .node-head').boundingBox(),
      before = await state();
    await page.mouse.move(head.x + 30, head.y + 20);
    await page.mouse.down();
    await page.mouse.move(head.x + 160, head.y + 80, { steps: 8 });
    await page.mouse.up();
    assert((await state()).pan.x > before.pan.x + 150);
    assert.equal(await page.locator("#screen-dialog").evaluate((d) => d.open), false);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert(Math.abs((await state()).zoom / before.zoom - 1.3) < 0.01);
    const wheelBefore = await state(),
      viewport = await page.locator("#map-viewport").boundingBox();
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.wheel(40, 60);
    await page.waitForTimeout(50);
    const wheelAfter = await state();
    assert(wheelAfter.pan.x < wheelBefore.pan.x - 50);
    assert(wheelAfter.pan.y < wheelBefore.pan.y - 80);
    await page.locator("#map-viewport").focus();
    await page.keyboard.press("0");
    assert.equal((await state()).zoom, 0.8);
    await page.keyboard.press("f");
    assert((await state()).zoom < 0.8);
    await page.getByRole("button", { name: "Back to start", exact: true }).click();
  });
  await test("Selection follows an authored edge; inspector has no side padding", async () => {
    await page.locator('[data-node="sign-in:welcome"] .node-head').click();
    assert(await page.getByRole("heading", { name: "Next steps" }).isVisible());
    await page.locator('[data-focus="sign-in:verify"]').click();
    assert.equal((await state()).selectedNodeId, "verify");
    await page.evaluate(() => window.atlas.openNode("sign-in", "welcome"));
    const modal = await page.locator("#screen-dialog").boundingBox(),
      frame = await page.locator("#dialog-preview iframe").boundingBox();
    assert.equal(modal.width, 390);
    assert.equal(frame.width, 390);
    assert.equal(modal.x, frame.x);
    await page
      .frameLocator("#dialog-preview iframe")
      .getByRole("button", { name: "Continue with email" })
      .click();
    await page
      .frameLocator("#dialog-preview iframe")
      .getByRole("heading", { name: "Check your inbox." })
      .waitFor();
    await page.screenshot({ path: "artifacts/interactive-preview.png" });
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.locator("#dialog-preview iframe").waitFor({ state: "detached" });
  });
  await test("Desktop screen keeps 1280px layout and responds to a narrow preview window", async () => {
    await page.getByRole("searchbox").fill("purchase");
    await page.locator('[data-flow="purchase"]').click();
    await page
      .frameLocator('[data-node="purchase:inbox"] iframe')
      .getByRole("heading", { name: "Purchase requests" })
      .waitFor();
    await page.getByRole("button", { name: "Fit current flow" }).click();
    await page.screenshot({ path: "artifacts/web-flow.png" });
    await page.evaluate(() => window.atlas.openNode("purchase", "review"));
    assert.equal(
      await page
        .frameLocator("#dialog-preview iframe")
        .locator("body")
        .evaluate(() => innerWidth),
      1280,
    );
    await page
      .frameLocator("#dialog-preview iframe")
      .getByRole("button", { name: "Approve request" })
      .click();
    await page
      .frameLocator("#dialog-preview iframe")
      .getByRole("heading", { name: "Ready for purchasing." })
      .waitFor();
    await page.setViewportSize({ width: 430, height: 900 });
    await page.waitForFunction(
      () =>
        document.querySelector(".ketatlas").shadowRoot.querySelector("#dialog-preview")
          .clientWidth <= 430,
    );
    const modal = await page.locator("#screen-dialog").boundingBox(),
      frame = await page.locator("#dialog-preview iframe").boundingBox();
    assert(Math.abs(frame.width - modal.width) < 1);
    assert.equal(frame.x, modal.x);
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.setViewportSize({ width: 1512, height: 1050 });
  });
  await test("Screenless processes, search and URL entry", async () => {
    await page.evaluate(() => window.atlas.goToFlow("fulfilment"));
    await page.getByRole("button", { name: "Fit current flow" }).click();
    assert.equal(await page.locator('[data-flow-id="fulfilment"] iframe').count(), 0);
    assert.equal(await page.locator('[data-flow-id="fulfilment"]').count(), 5);
    await page.screenshot({ path: "artifacts/process-flow.png" });
    await page.goto(origin + "/?screen=request-review");
    await page.waitForFunction(() => window.atlas?.getState?.().flowId === "purchase");
    assert.equal((await state()).flowId, "purchase");
  });
  await test("Independent embedded instances, public API, escaping and teardown", async () => {
    await page.evaluate(async () => {
      const { createAtlas } = await import("/__ketatlas__/src/index.js");
      window.atlas.destroy();
      document.querySelector("#atlas").style.height = "600px";
      const data = {
        version: 1,
        title: "<img src=x onerror=alert(1)>",
        flows: [
          {
            id: "one",
            title: "Embedded flow",
            nodes: [
              { id: "first", title: "First step" },
              { id: "last", title: "Last step" },
            ],
            edges: [{ from: "first", to: "last", label: "Next" }],
          },
        ],
      };
      for (const id of ["left", "right"]) {
        const root = document.createElement("div");
        root.id = id;
        root.style.cssText = "display:inline-block;width:50%;height:600px";
        document.querySelector("#atlas").append(root);
        window[id] = createAtlas(root, data, { theme: id === "left" ? "light" : "dark" });
        await window[id].ready;
      }
    });
    assert.equal(await page.locator("img").count(), 0);
    const before = await page.evaluate(() => window.right.getState());
    await page.evaluate(() => window.left.focusNode("one", "last"));
    assert.equal(
      await page.evaluate(() => window.right.getState().selectedNodeId),
      before.selectedNodeId,
    );
    await page.evaluate(() => {
      window.left.destroy();
      window.left.destroy();
    });
    assert.equal(await page.locator("#left .ketatlas").count(), 0);
    assert.equal(await page.locator("#right .ketatlas").count(), 1);
    await page.evaluate(() => window.right.destroy());
  });
  await test("Touch pinch, narrow sidebar and bounded preview count", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.atlas?.getState === "function");
    await page.getByRole("button", { name: "Choose a flow" }).click();
    await page.getByRole("searchbox").fill("delivery");
    await page.locator('[data-flow="fulfilment"]').click();
    assert.equal(await page.locator("#map-menu").getAttribute("aria-expanded"), "false");
    const box = await page.locator("#map-viewport").boundingBox(),
      cdp = await context.newCDPSession(page),
      before = await state();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 90, y: box.y + 300, id: 1 },
        { x: 230, y: box.y + 300, id: 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: 60, y: box.y + 300, id: 1 },
        { x: 330, y: box.y + 300, id: 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert((await state()).zoom > before.zoom);
    await cdp.detach();
    await page.evaluate(() => window.atlas.zoomTo(0.18));
    await page.waitForTimeout(50);
    assert.equal(await page.locator(".node-preview iframe").count(), 0);
    await page.screenshot({ path: "artifacts/narrow-map.png" });
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify({ checks, errors, external }, null, 2),
  );
} catch (e) {
  await page.screenshot({ path: "artifacts/failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
