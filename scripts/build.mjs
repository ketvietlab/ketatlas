import { build, transform } from "esbuild";
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./verify-assets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const common = {
  absWorkingDir: root,
  bundle: true,
  minify: true,
  sourcemap: false,
  legalComments: "eof",
  format: "esm",
  define: { __KETATLAS_BUILD__: "true" },
};
await build({
  ...common,
  entryPoints: ["src/index.js"],
  outfile: "dist/index.js",
  platform: "browser",
  target: "es2022",
});
await build({
  ...common,
  entryPoints: ["bin/ketatlas.js"],
  outfile: "dist/ketatlas.js",
  platform: "node",
  target: "node22",
});
await chmod(join(out, "ketatlas.js"), 0o755);
await cp(join(root, "src/index.d.ts"), join(out, "index.d.ts"));
await cp(join(root, "assets"), join(out, "assets"), { recursive: true });
await mkdir(join(out, "styles"));
for (const name of await readdir(join(root, "styles"))) {
  if (!name.endsWith(".css")) continue;
  const source = await readFile(join(root, "styles", name), "utf8");
  const result = await transform(source, { loader: "css", minify: true, legalComments: "eof" });
  await writeFile(join(out, "styles", name), result.code);
}
console.log("Built CLI, browser bundle, declarations, and assets without source maps.");
