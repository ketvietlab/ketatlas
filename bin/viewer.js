import { randomBytes } from "node:crypto";
import { progressHandler } from "./progress.js";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { validateAtlas, AtlasValidationError } from "../src/config.js";
import { serve } from "./server.js";
import { fileURLToPath } from "node:url";
import { rendererFileName, startRenderer } from "./renderer.js";
import { createManagedViewer } from "./managed.js";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viewerEntry = typeof __KETATLAS_BUILD__ !== "undefined" ? "dist/index.js" : "src/index.js";
export async function serveAtlas(file, options = {}) {
  if (
    options.maxCachedPreviews !== undefined &&
    (!Number.isInteger(options.maxCachedPreviews) ||
      options.maxCachedPreviews < 3 ||
      options.maxCachedPreviews > 128)
  )
    throw new RangeError("maxCachedPreviews must be 3–128.");
  if (options.preloadScreens !== undefined && typeof options.preloadScreens !== "boolean")
    throw new TypeError("preloadScreens must be a boolean.");
  const absolute = await realpath(resolve(file));
  if (!(await stat(absolute)).isFile()) throw new Error("Expected an atlas JSON file.");
  const config = JSON.parse(await readFile(absolute, "utf8"));
  const result = validateAtlas(config);
  if (!result.valid) throw new AtlasValidationError(result);
  const root = await realpath(resolve(options.root || dirname(absolute))),
    rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(".." + sep) || rel.startsWith(sep))
    throw new Error("The JSON file must be inside --root.");
  const configURL = "/" + rel.split(sep).map(encodeURIComponent).join("/");
  const token = randomBytes(24).toString("hex");
  const managed = options.managed ? createManagedViewer(options.managed) : null;
  let renderer;
  if (options.renderer) {
    const rendererFile = resolve(options.rendererFile || dirname(absolute), rendererFileName);
    const htmlPort =
      options.htmlPort ?? (options.port && options.port < 65535 ? options.port + 1 : 0);
    renderer = await startRenderer(rendererFile, {
      host: options.host,
      port: htmlPort,
      stdio: options.rendererStdio,
    });
  }
  const loadOptions = {
    syncUrl: true,
    preloadScreens: options.preloadScreens ?? true,
    ...(options.maxCachedPreviews === undefined
      ? {}
      : { maxCachedPreviews: options.maxCachedPreviews }),
    progressEndpoint: "/__ketatlas__/progress",
    progressToken: token,
    ...(renderer
      ? {
          screenBaseURL: renderer.screenBaseURL,
          sandbox: "allow-scripts allow-forms allow-same-origin",
        }
      : {}),
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KetAtlas</title><style>html,body{margin:0;height:100%}#atlas{height:100dvh}#error{font:16px system-ui;padding:24px;white-space:pre-wrap}</style></head><body><main id="atlas"></main><pre id="error" hidden></pre><script type="module">import {loadAtlas${managed ? ",connectManagedViewer" : ""}} from '/__ketatlas__/${viewerEntry}';try{window.atlas=await loadAtlas(document.querySelector('#atlas'),${JSON.stringify(configURL).replaceAll("<", "\\u003c")},${JSON.stringify(loadOptions).replaceAll("<", "\\u003c")});${managed ? `connectManagedViewer(window.atlas,${JSON.stringify(managed.token)});` : ""}document.title=${JSON.stringify(config.title).replaceAll("<", "\\u003c")}+' · KetAtlas';}catch(error){const el=document.querySelector('#error');el.hidden=false;el.textContent=error.message;}</script></body></html>`;
  const progress = progressHandler(absolute, absolute, token, !options.readOnly);
  try {
    const server = await serve(root, {
      ...options,
      viewer: html,
      packageRoot,
      handler: async (req, res) =>
        (managed && (await managed.handle(req, res))) || progress(req, res),
    });
    server.renderer = renderer;
    server.htmlOrigin = renderer?.origin;
    server.closeRenderer = () => renderer?.close();
    server.closeManaged = () => managed?.close();
    managed?.start(`http://127.0.0.1:${server.address().port}`);
    return server;
  } catch (error) {
    managed?.close();
    await renderer?.close();
    throw error;
  }
}
