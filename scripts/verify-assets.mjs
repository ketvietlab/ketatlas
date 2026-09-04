import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  manifest = JSON.parse(await readFile(new URL("assets/design-system.lock.json", root), "utf8"));
for (const [file, expected] of Object.entries(manifest.outputs))
  assert.equal(
    createHash("sha256")
      .update(await readFile(new URL(file, root)))
      .digest("hex"),
    expected,
    `Generated asset changed: ${file}`,
  );
const css = await readFile(new URL("styles/ketatlas.css", root), "utf8"),
  canonical = await readFile(new URL("styles/design-system.css", root), "utf8");
assert(!/--kv-[\w-]+\s*:/.test(css), "Do not fork canonical tokens");
const tokens = new Set([...canonical.matchAll(/(--kv-[\w-]+)\s*:/g)].map((m) => m[1]));
for (const [, token] of css.matchAll(/var\((--kv-[\w-]+)/g))
  assert(tokens.has(token), `Unknown token ${token}`);
console.log("Asset provenance verified.");
