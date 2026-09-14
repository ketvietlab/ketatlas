// Assembles the static live demo published at https://atlas.ketsuite.com.
// Everything the viewer needs is already static, so the build is a copy plus
// one entry page. No bundler, no npm dependency, no build step for the viewer.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.env.KETATLAS_DEMO_OUT || join(root, "dist"));
const site = process.env.KETATLAS_DEMO_URL || "https://atlas.ketsuite.com";
const copied = ["src", "styles", "assets", "examples"];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const entry of copied) {
  await cp(join(root, entry), join(out, entry), { recursive: true });
}

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KetAtlas — live demo</title>
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%234f46e5'/%3E%3Ctext x='16' y='23' font-family='system-ui,sans-serif' font-size='19' font-weight='700' fill='white' text-anchor='middle'%3EK%3C/text%3E%3C/svg%3E"
    />
    <meta
      name="description"
      content="A workflow map you can drag, zoom, and open real HTML prototypes from."
    />
    <link rel="canonical" href="${site}/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="KetAtlas — live demo" />
    <meta
      property="og:description"
      content="A workflow map you can drag, zoom, and open real HTML prototypes from."
    />
    <meta property="og:url" content="${site}/" />
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
      }
      #atlas {
        height: 100dvh;
      }
      #error {
        font: 16px system-ui;
        white-space: pre-wrap;
        padding: 24px;
      }
    </style>
  </head>
  <body>
    <main id="atlas"></main>
    <pre id="error" hidden></pre>
    <script type="module">
      import { loadAtlas } from "./src/index.js";
      try {
        window.atlas = await loadAtlas(document.querySelector("#atlas"), "./examples/atlas.json", {
          syncUrl: true,
        });
      } catch (error) {
        document.querySelector("#error").hidden = false;
        document.querySelector("#error").textContent = error.message;
      }
    </script>
  </body>
</html>
`;

const headers = `/assets/*
  Cache-Control: public, max-age=31536000, immutable

/src/*
  Cache-Control: public, max-age=600

/styles/*
  Cache-Control: public, max-age=600

/*
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
`;

await writeFile(join(out, "index.html"), page);
await writeFile(join(out, "404.html"), page);
await writeFile(join(out, "_headers"), headers);
await writeFile(join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
await writeFile(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site}/</loc></url></urlset>\n`,
);

console.log(`Demo built into ${out} (${copied.join(", ")}) for ${site}`);
