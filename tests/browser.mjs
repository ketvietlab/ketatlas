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
const mockRequests = [];
page.on("request", (request) => {
  if (request.isNavigationRequest() && request.url().includes("/screens/"))
    mockRequests.push(request.url());
});
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
    assert(await page.getByRole("navigation", { name: "Workflows", exact: true }).isVisible());
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
  await test("Only selected flows preload; cached canvas and on-demand dialogs retain state", async () => {
    await page.evaluate(() => window.atlas.previewsReady);
    assert.deepEqual((await state()).preload, { total: 4, loaded: 4, failed: 0, pending: 0 });
    assert.equal(
      new Set(mockRequests).size,
      4,
      "Only the first flow and its variants load before selection",
    );
    assert.equal(await page.locator("#preload-status").textContent(), "Flow ready");
    const canvas = page.frameLocator('[data-node="sign-in:welcome"] iframe');
    await canvas.locator("body").evaluate(() => {
      window.preloadMarker = "retained";
    });
    await page.evaluate(() => window.atlas.goToFlow("purchase"));
    await page.evaluate(() => window.atlas.previewsReady);
    await page.evaluate(() => window.atlas.goToFlow("sign-in"));
    assert.equal(await canvas.locator("body").evaluate(() => window.preloadMarker), "retained");
    await page.evaluate(() => window.atlas.openNode("sign-in", "welcome"));
    const dialog = page.frameLocator("#dialog-preview iframe:not([hidden])");
    await dialog.getByRole("textbox", { name: "Work email" }).fill("preload@example.test");
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.evaluate(() => window.atlas.openNode("purchase", "review"));
    await page.evaluate(() => window.atlas.previewsReady);
    const requestsBefore = mockRequests.length;
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.evaluate(() => window.atlas.openNode("sign-in", "welcome"));
    assert.equal(
      await dialog.getByRole("textbox", { name: "Work email" }).inputValue(),
      "preload@example.test",
    );
    assert.equal(
      mockRequests.length,
      requestsBefore,
      "Opening cached mocks never navigates a new frame",
    );
    await page.screenshot({ path: "artifacts/preloaded-preview.png", animations: "disabled" });
    await page.getByRole("button", { name: "Close preview" }).click();
  });
  await test("Compact workspace, optional minimap and live screen theme synchronization", async () => {
    const header = await page.locator(".map-header").boundingBox();
    assert(header.height <= 52, "Desktop header leaves space for the canvas");
    assert(await page.locator("#map-minimap").isHidden());
    await page.getByRole("button", { name: "Toggle minimap" }).click();
    assert(await page.locator("#map-minimap").isVisible());
    assert.equal(await page.locator("#toggle-minimap").getAttribute("aria-expanded"), "true");
    await page.getByRole("button", { name: "Toggle minimap" }).click();
    const canvasTheme = () =>
      page
        .frameLocator('[data-node="sign-in:welcome"] iframe')
        .locator("html")
        .getAttribute("data-theme");
    const camera = await state();
    if (
      (await page
        .getByRole("button", { name: "Dark theme", exact: true })
        .getAttribute("aria-pressed")) !== "true"
    )
      await page.getByRole("button", { name: "Dark theme", exact: true }).click();
    assert.equal((await state()).theme, "dark");
    assert.equal((await state()).syncTheme, false);
    assert.equal(await canvasTheme(), "light", "Screens keep their own theme by default");
    await page.getByRole("switch", { name: "Sync screen theme" }).check();
    await page.waitForFunction(() => window.atlas.getState().syncTheme);
    await page
      .frameLocator('[data-node="sign-in:welcome"] iframe')
      .locator('html[data-theme="dark"]')
      .waitFor();
    assert.equal(
      await page.locator('[data-node="sign-in:welcome"] iframe').getAttribute("sandbox"),
      "allow-scripts allow-forms",
    );
    assert.deepEqual((await state()).pan, camera.pan);
    assert.equal((await state()).zoom, camera.zoom);
    await page.screenshot({ path: "artifacts/workspace-dark.png", animations: "disabled" });
    await page.evaluate(() => window.atlas.openNode("sign-in", "welcome"));
    const preview = page.frameLocator("#dialog-preview iframe:not([hidden])");
    await preview.locator('html[data-theme="dark"]').waitFor();
    await preview.getByRole("textbox", { name: "Work email" }).fill("theme@example.test");
    await preview.locator("body").evaluate(() => {
      window.themeTestMarker = "preserve-this-frame";
    });
    await page.evaluate(() => window.atlas.setTheme("light"));
    await preview.locator('html[data-theme="light"]').waitFor();
    assert.equal(
      await preview.getByRole("textbox", { name: "Work email" }).inputValue(),
      "theme@example.test",
    );
    assert.equal(
      await preview.locator("body").evaluate(() => window.themeTestMarker),
      "preserve-this-frame",
    );
    await page.evaluate(() => window.atlas.setTheme("dark"));
    await preview.locator('html[data-theme="dark"]').waitFor();
    await preview.getByRole("button", { name: "Continue with email" }).click();
    await preview.getByRole("heading", { name: "Check your inbox." }).waitFor();
    await preview.locator('html[data-theme="dark"]').waitFor();
    await page.evaluate(() => window.atlas.setThemeSync(false));
    await preview.locator('html[data-theme="light"]').waitFor();
    assert.equal((await state()).theme, "dark", "Turning off sync restores content only");
    await page.getByRole("button", { name: "Close preview" }).click();
    if (
      (await page
        .getByRole("button", { name: "Dark theme", exact: true })
        .getAttribute("aria-pressed")) !== "false"
    )
      await page.getByRole("button", { name: "Dark theme", exact: true }).click();
    assert.equal(await canvasTheme(), "light");
    await page.screenshot({ path: "artifacts/workspace-light.png", animations: "disabled" });
    const invalid = await page.evaluate(() => {
      const errors = [];
      for (const action of [
        () => window.atlas.setTheme("system"),
        () => window.atlas.setThemeSync("yes"),
      ]) {
        try {
          action();
        } catch (error) {
          errors.push(error.name);
        }
      }
      return errors;
    });
    assert.deepEqual(invalid, ["TypeError", "TypeError"]);
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.atlas?.getState === "function");
  });
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
      frame = await page.locator("#dialog-preview iframe:not([hidden])").boundingBox();
    assert.equal(modal.width, 390);
    assert.equal(frame.width, 390);
    assert.equal(modal.x, frame.x);
    await page
      .frameLocator("#dialog-preview iframe:not([hidden])")
      .getByRole("button", { name: "Continue with email" })
      .click();
    await page
      .frameLocator("#dialog-preview iframe:not([hidden])")
      .getByRole("heading", { name: "Check your inbox." })
      .waitFor();
    await page.screenshot({ path: "artifacts/interactive-preview.png" });
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.locator("#dialog-preview iframe:not([hidden])").waitFor({ state: "detached" });
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
        .frameLocator("#dialog-preview iframe:not([hidden])")
        .locator("body")
        .evaluate(() => innerWidth),
      1280,
    );
    await page
      .frameLocator("#dialog-preview iframe:not([hidden])")
      .getByRole("button", { name: "Approve request" })
      .click();
    await page
      .frameLocator("#dialog-preview iframe:not([hidden])")
      .getByRole("heading", { name: "Ready for purchasing." })
      .waitFor();
    await page.setViewportSize({ width: 430, height: 900 });
    await page.waitForFunction(
      () =>
        document.querySelector(".ketatlas").shadowRoot.querySelector("#dialog-preview")
          .clientWidth <= 430,
    );
    const modal = await page.locator("#screen-dialog").boundingBox(),
      frame = await page.locator("#dialog-preview iframe:not([hidden])").boundingBox();
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
  await test("Flow preload skips unused screens, deduplicates opened dialogs, and supports opting out", async () => {
    await page.evaluate(async () => {
      const { createAtlas } = await import("/__ketatlas__/src/index.js");
      const container = document.querySelector("#atlas");
      window.preloadConfig = {
        version: 1,
        title: "Preload fixtures",
        screens: [
          { id: "shared", title: "Shared", url: "/examples/screens/mobile.html?screen=sign-in" },
          { id: "unused", title: "Unused", url: "/examples/screens/mobile.html?screen=home" },
        ],
        flows: [
          {
            id: "main",
            title: "Main",
            nodes: [
              { id: "one", screen: "shared" },
              { id: "two", screen: "shared" },
            ],
            edges: [{ from: "one", to: "two", label: "Next" }],
          },
        ],
      };
      window.atlas = createAtlas(container, window.preloadConfig);
      await window.atlas.ready;
      await window.atlas.previewsReady;
    });
    assert.deepEqual((await state()).preload, { total: 2, loaded: 2, failed: 0, pending: 0 });
    assert.equal(await page.locator("#dialog-preview iframe").count(), 0);
    await page.evaluate(() => window.atlas.openNode("main", "one"));
    await page.evaluate(() => window.atlas.previewsReady);
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.evaluate(() => window.atlas.openNode("main", "two"));
    await page.evaluate(() => window.atlas.previewsReady);
    assert.equal(await page.locator("#dialog-preview iframe").count(), 1);
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.evaluate(async () => {
      const { createAtlas } = await import("/__ketatlas__/src/index.js");
      window.atlas.destroy();
      window.atlas = createAtlas(document.querySelector("#atlas"), window.preloadConfig, {
        preloadScreens: false,
      });
      await window.atlas.ready;
    });
    assert.equal((await state()).preload.total, 0);
    assert.equal(await page.locator("#dialog-preview iframe").count(), 0);
    await page.evaluate(() => window.atlas.openNode("main", "one"));
    await page
      .frameLocator("#dialog-preview iframe")
      .getByRole("textbox", { name: "Work email" })
      .waitFor();
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.locator("#dialog-preview iframe").waitFor({ state: "detached" });
    await page.evaluate(async () => {
      const { createAtlas } = await import("/__ketatlas__/src/index.js");
      window.atlas.destroy();
      window.atlas = createAtlas(document.querySelector("#atlas"), window.preloadConfig);
      window.atlas.destroy();
      await window.atlas.previewsReady;
    });
    assert.equal(await page.locator("iframe").count(), 0);
  });
  await test("Touch pinch, narrow sidebar and bounded preview count", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.atlas?.getState === "function");
    await page.getByRole("button", { name: "Choose a flow" }).click();
    if (
      (await page
        .getByRole("button", { name: "Dark theme", exact: true })
        .getAttribute("aria-pressed")) !== "true"
    )
      await page.getByRole("button", { name: "Dark theme", exact: true }).click();
    await page.getByRole("switch", { name: "Sync screen theme" }).check();
    await page
      .frameLocator('[data-node="sign-in:welcome"] iframe')
      .locator('html[data-theme="dark"]')
      .waitFor();
    await page.screenshot({ path: "artifacts/workspace-mobile-dark.png", animations: "disabled" });
    if (
      (await page
        .getByRole("button", { name: "Dark theme", exact: true })
        .getAttribute("aria-pressed")) !== "false"
    )
      await page.getByRole("button", { name: "Dark theme", exact: true }).click();
    await page.getByRole("switch", { name: "Sync screen theme" }).uncheck();
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
    assert.equal(await page.locator(".node-preview iframe:not([hidden])").count(), 0);
    await page.screenshot({ path: "artifacts/narrow-map.png" });
  });
  await test("Compact editor geometry and recovery across widths, themes and display scales", async () => {
    const results = [];
    for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
      for (const theme of ["light", "dark"]) {
        for (const deviceScaleFactor of [1, 2]) {
          const compactContext = await browser.newContext({
            viewport: { width, height: width < 768 ? 844 : 900 },
            colorScheme: theme,
            deviceScaleFactor,
            reducedMotion: "reduce",
          });
          try {
            await compactContext.route("**/*", (route) =>
              route.request().url().startsWith(origin) || route.request().url().startsWith("data:")
                ? route.continue()
                : route.abort(),
            );
            const compact = await compactContext.newPage();
            await compact.goto(`${origin}/tests/fixtures/compact-workspace.html?theme=${theme}`);
            await compact.waitForFunction(() => window.compactWorkspaceResult);
            const result = await compact.evaluate(() => window.compactWorkspaceResult);
            results.push(result);
            assert.deepEqual(result.failures, [], JSON.stringify(result));
            if (deviceScaleFactor === 1 && [390, 1440].includes(width))
              await compact.screenshot({
                path: `artifacts/compact-${width}-${theme}.png`,
                animations: "disabled",
              });
          } finally {
            await compactContext.close();
          }
        }
      }
    }
    await writeFile("artifacts/compact-workspace-results.json", JSON.stringify(results, null, 2));
  });
  await test("Native keyboard path through sidebar search, workflow navigation, theme and Sync", async () => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/tests/fixtures/compact-workspace.html?keyboard=1`);
      await page.waitForFunction(() => document.querySelector("#test-results").dataset.keyboard);
      while (!(await page.evaluate(() => Boolean(window.compactWorkspaceResult)))) {
        const { index, key } = await page
          .locator("#test-results")
          .evaluate((el) => JSON.parse(el.dataset.keyboard));
        await page.keyboard.press(key);
        await page.waitForFunction(
          (previous) =>
            window.compactWorkspaceResult ||
            JSON.parse(document.querySelector("#test-results").dataset.keyboard).index > previous,
          index,
        );
      }
      const result = await page.evaluate(() => window.compactWorkspaceResult);
      assert.deepEqual(result.failures, [], JSON.stringify(result));
    }
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
