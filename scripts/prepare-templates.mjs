import { readFile, writeFile, cp, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const file = (p) => new URL(p, root);
await mkdir(file("templates/basic"), { recursive: true });
await cp(file("starter/screens"), file("templates/basic/screens"), { recursive: true });
const basic = JSON.parse(await readFile(file("starter/atlas.json"), "utf8"));
basic.$schema = "./ketatlas.schema.json";
await writeFile(file("templates/basic/atlas.json"), JSON.stringify(basic, null, 2) + "\n");
let css = await readFile(file("templates/basic/screens/screen.css"), "utf8");
css = css.replace("../../styles/design-system.document.css", "../styles/design-system.css");
await writeFile(file("templates/basic/screens/screen.css"), css);
const example = JSON.parse(await readFile(file("examples/atlas.json"), "utf8"));
for (const [name, id, title] of [
  ["web", "purchase", "Purchase approval"],
  ["process", "fulfilment", "Order fulfilment"],
]) {
  await mkdir(file(`templates/${name}`), { recursive: true });
  const flow = example.flows.find((f) => f.id === id),
    ids = new Set(flow.nodes.map((n) => n.screen));
  const screens = example.screens.filter((s) => ids.has(s.id));
  const data = { $schema: "./ketatlas.schema.json", version: 1, title, screens, flows: [flow] };
  await writeFile(file(`templates/${name}/atlas.json`), JSON.stringify(data, null, 2) + "\n");
  if (name === "web") {
    await mkdir(file("templates/web/screens"), { recursive: true });
    await cp(file("examples/screens/portal.html"), file("templates/web/screens/portal.html"));
    css = (await readFile(file("examples/screens/demo.css"), "utf8")).replace(
      "../../styles/design-system.document.css",
      "../styles/design-system.css",
    );
    await writeFile(file("templates/web/screens/demo.css"), css);
  }
}
for (const name of ["basic", "web", "process"]) {
  await cp(file("schema.json"), file(`templates/${name}/ketatlas.schema.json`));
  await cp(file("progress.schema.json"), file(`templates/${name}/progress.schema.json`));
  if (name !== "process") {
    await mkdir(file(`templates/${name}/styles`), { recursive: true });
    await cp(
      file("styles/design-system.document.css"),
      file(`templates/${name}/styles/design-system.css`),
    );
    await cp(file("assets/KETJS-LICENSE"), file(`templates/${name}/styles/LICENSE`));
  }
  await writeFile(
    file(`templates/${name}/README.md`),
    `# My KetAtlas project\n\nRun with Node.js 22 or newer:\n\n\x60\x60\x60sh\nnpx ketatlas serve atlas.json\nnpx ketatlas audit atlas.json --strict\n\x60\x60\x60\n\nEdit \x60atlas.json\x60 to change nodes, edges, and screen URLs. Screen URLs are relative to that file. Refresh the browser after editing. No wrapper HTML, package manifest, lockfile, node_modules, or build step is needed. Alternatively, install the CLI once with npm install --global ketatlas@0.2.0 and use ketatlas serve atlas.json.\n\n${name === "process" ? "This template models a process without HTML screens. Add a screen registry and screen nodes when needed." : "Edit the HTML files in screens/ to replace the sample product. styles/design-system.css is generated from the pinned KetJS design system; do not manually fork its tokens."}\n\nOpen **Screens** in the viewer to review or edit delivery progress. Saving writes atlas.progress.json beside the workflow; use --read-only to disable editing. You can initialize records with ketatlas progress atlas.json --init. Keep this directory in your own project repository. The schema provides editor completion. See https://github.com/ketvietlab/ketatlas for the full API, CLI, and configuration reference.\n`,
  );
}
console.log("Prepared basic, web, and process templates.");
