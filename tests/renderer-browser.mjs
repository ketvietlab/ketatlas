import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveAtlas } from "../bin/viewer.js";

const temp = await mkdtemp(join(tmpdir(), "ketatlas-renderer-browser-"));
const atlasDirectory = join(temp, "native.ketatlas");
let server;
let browser;
try {
  await mkdir(atlasDirectory);
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
createServer((req,res)=>{res.setHeader("content-type","text/html");res.end(\`<!doctype html><meta name="viewport" content="width=device-width"><main data-framework="native"><h1>Shared presenter</h1><output>\${req.url}</output><script>document.body.dataset.executed="yes"</script></main>\`)}).listen(Number(process.env.KETATLAS_HTML_PORT),process.env.KETATLAS_HOST);`,
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
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.atlas?.getState === "function");
  const frame = page.frameLocator('[data-node="main:shared"] iframe');
  await frame.getByRole("heading", { name: "Shared presenter" }).waitFor();
  assert.equal(await frame.locator("body").getAttribute("data-executed"), "yes");
  assert.equal(await frame.locator("output").textContent(), "/atlas/shared?state=mock");
  assert((await frame.locator("main").getAttribute("data-framework")) === "native");
  console.log("PASS framework renderer loads and executes on the separate HTML origin");
} finally {
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await server.closeRenderer();
  }
  await rm(temp, { recursive: true, force: true });
}
