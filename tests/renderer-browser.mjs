import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveAtlas } from "../bin/viewer.js";

const temp = await mkdtemp(join(tmpdir(), "ketatlas-renderer-browser-"));
const atlasDirectory = join(temp, "native.ketatlas");
let server;
let browser;
const preloadScreens = !process.argv.includes("--no-preload");
try {
  await mkdir(atlasDirectory);
  const themeBridge = (await readFile("starter/screens/welcome.html", "utf8")).match(
    /<script>([\s\S]*?)<\/script>/,
  )[1];
  await writeFile(
    join(atlasDirectory, "atlas.json"),
    JSON.stringify({
      version: 1,
      title: "Native renderer browser test",
      viewport: { width: 800, height: 600 },
      screens: [{ id: "shared", title: "Shared presenter", url: "./shared?state=mock" }],
      flows: [
        {
          id: "main",
          title: "Main",
          nodes: [{ id: "shared", screen: "shared" }],
          edges: [],
        },
      ],
    }),
  );
  await writeFile(
    join(temp, "renderer.mjs"),
    `import {createServer} from "node:http";
createServer((req,res)=>{res.setHeader("content-type","text/html");res.end(\`<!doctype html><meta name="viewport" content="width=device-width"><script>${themeBridge}</script><main data-framework="native"><h1>Shared presenter</h1><output>\${req.url}</output><script>document.body.dataset.executed="yes"</script></main>\`)}).listen(Number(process.env.KETATLAS_HTML_PORT),process.env.KETATLAS_HOST);`,
  );
  await writeFile(
    join(atlasDirectory, "atlas.renderer.json"),
    JSON.stringify({
      version: 1,
      framework: "native-test",
      command: [process.execPath, "{atlasDirectory}/../renderer.mjs"],
      screenBasePath: "/atlas/",
    }),
  );
  server = await serveAtlas(join(atlasDirectory, "atlas.json"), {
    port: 0,
    renderer: true,
    htmlPort: 0,
    rendererStdio: "ignore",
    preloadScreens,
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  let mockRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.url().includes("/atlas/shared")) mockRequests++;
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.atlas?.getState === "function");
  await page.evaluate(() => window.atlas.previewsReady);
  const frame = page.frameLocator('[data-node="main:shared"] iframe');
  await frame.getByRole("heading", { name: "Shared presenter" }).waitFor();
  assert.equal(
    mockRequests,
    1,
    "Lazy renderer mode loads the interactive preview only when opened",
  );
  assert.equal(await frame.locator("body").getAttribute("data-executed"), "yes");
  assert.equal(await frame.locator("output").textContent(), "/atlas/shared?state=mock");
  assert((await frame.locator("main").getAttribute("data-framework")) === "native");
  if (
    (await page
      .getByRole("button", { name: "Dark theme", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.getByRole("switch", { name: "Sync screen theme" }).check();
  await frame.locator('html[data-theme="dark"]').waitFor();
  await page.evaluate(() => window.atlas.openNode("main", "shared"));
  await page
    .frameLocator("#dialog-preview iframe:not([hidden])")
    .locator('html[data-theme="dark"]')
    .waitFor();
  await page.evaluate(() => window.atlas.setThemeSync(false));
  await frame.locator("html:not([data-theme])").waitFor();
  await page
    .frameLocator("#dialog-preview iframe:not([hidden])")
    .locator("html:not([data-theme])")
    .waitFor();
  assert.equal(mockRequests, 2, "Only the canvas and selected framework preview load");
  console.log("PASS framework renderer loads and executes on the separate HTML origin");
  console.log("PASS screen themes synchronize and restore across separate origins");
} finally {
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await server.closeRenderer();
  }
  await rm(temp, { recursive: true, force: true });
}
