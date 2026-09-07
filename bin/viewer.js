import { randomBytes } from "node:crypto";
import { progressHandler } from "./progress.js";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { validateAtlas, AtlasValidationError } from "../src/config.js";
import { serve } from "./server.js";
import { fileURLToPath } from "node:url";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function serveAtlas(file, options = {}) {
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
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KetAtlas</title><style>html,body{margin:0;height:100%}#atlas{height:100dvh}#error{font:16px system-ui;padding:24px;white-space:pre-wrap}</style></head><body><main id="atlas"></main><pre id="error" hidden></pre><script type="module">import {loadAtlas} from '/__ketatlas__/src/index.js';try{window.atlas=await loadAtlas(document.querySelector('#atlas'),${JSON.stringify(configURL).replaceAll("<", "\\u003c")},{syncUrl:true,progressEndpoint:"/__ketatlas__/progress",progressToken:${JSON.stringify(token)}});document.title=${JSON.stringify(config.title).replaceAll("<", "\\u003c")}+' · KetAtlas';}catch(error){const el=document.querySelector('#error');el.hidden=false;el.textContent=error.message;}</script></body></html>`;
  return serve(root, {
    ...options,
    viewer: html,
    packageRoot,
    handler: progressHandler(absolute, absolute, token, !options.readOnly),
  });
}
