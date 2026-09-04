import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(process.env.KETJS_REPO || join(root, "../ketjs"));
const revision = "fab9de5d5814e96f2e04ced806b6bef487cf9662";
const hash = (data) => createHash("sha256").update(data).digest("hex"),
  sources = [];
function flatten(path) {
  const content = execFileSync("git", ["show", `${revision}:${path}`], {
    cwd: repo,
    encoding: "utf8",
  });
  sources.push({ path, sha256: hash(content) });
  return content.replace(/@import "(.+?)";/g, (_, relative) =>
    flatten(join(dirname(path), relative)),
  );
}
await mkdir(join(root, "assets"), { recursive: true });
const css = `/* GENERATED from @ketvietlab/design-system at ${revision}. Do not edit. */\n${flatten("packages/design-system/src/styles.css").trimEnd()}\n`;
await writeFile(join(root, "styles/design-system.document.css"), css);
await writeFile(
  join(root, "styles/design-system.css"),
  css.replace(/:root(\[data-theme="(?:light|dark)"\])/g, ":host($1)").replaceAll(":root", ":host"),
);
await writeFile(
  join(root, "assets/KETJS-LICENSE"),
  execFileSync("git", ["show", `${revision}:LICENSE`], { cwd: repo }),
);
for (const name of ["inter-latin-wght-normal.woff2", "inter-vietnamese-wght-normal.woff2"])
  await copyFile(
    join(root, "node_modules/@fontsource-variable/inter/files", name),
    join(root, "assets", name),
  );
await copyFile(
  join(root, "node_modules/@fontsource-variable/inter/LICENSE"),
  join(root, "assets/INTER-LICENSE"),
);
await copyFile(
  join(root, "node_modules/lucide-static/LICENSE"),
  join(root, "assets/LUCIDE-LICENSE"),
);
const names = [
    "circle",
    "circle-dot",
    "circle-check",
    "arrow-up-right",
    "layout-grid",
    "circle-help",
    "plus",
    "minus",
    "expand",
    "x",
    "file-text",
  ],
  icons = {};
for (const name of names)
  icons[name] = (
    await readFile(join(root, "node_modules/lucide-static/icons", name + ".svg"), "utf8")
  ).replace(
    /<svg[^>]*>/,
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
  );
await writeFile(
  join(root, "src/icons.js"),
  await format(
    `/* Generated from lucide-static 1.40.0; see assets/LUCIDE-LICENSE. */\nexport const icons=${JSON.stringify(icons)};\n`,
    { parser: "babel", printWidth: 100 },
  ),
);
const outputs = {};
for (const file of [
  "styles/design-system.css",
  "styles/design-system.document.css",
  "src/icons.js",
  "assets/KETJS-LICENSE",
  "assets/INTER-LICENSE",
  "assets/LUCIDE-LICENSE",
  "assets/inter-latin-wght-normal.woff2",
  "assets/inter-vietnamese-wght-normal.woff2",
])
  outputs[file] = hash(await readFile(join(root, file)));
await writeFile(
  join(root, "assets/design-system.lock.json"),
  JSON.stringify(
    {
      source: "@ketvietlab/design-system",
      repository: "https://github.com/ketvietlab/ketjs",
      revision,
      transform:
        "Flatten imports. Adapt :root to :host in the Shadow DOM bundle. Preserve all token values.",
      fontSource: "@fontsource-variable/inter@5.3.0",
      iconSource: "lucide-static@1.40.0",
      sources,
      outputs,
    },
    null,
    2,
  ) + "\n",
);
console.log("Prepared pinned design system, fonts and icons.");
