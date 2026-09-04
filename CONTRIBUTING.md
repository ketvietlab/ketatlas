# Contributing

Use Node.js 22+ and keep the package runtime dependency-free. UI, CLI messages, code comments and documentation are English. Project content can be in any language.

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:package
npm run format:check
```

The browser suite generates screenshots and results in `artifacts/`. Inspect that evidence when changing presentation. Add tests for behavior changes; use automated browser tests rather than manual browser control. Do not call production services in tests.

Use `npm run dev` for the playground. Keep public types and documentation aligned with API/CLI changes. The CLI's `serve <file.json>` experience must work from a packed installation outside this checkout.

## Regenerating assets and templates

```sh
KETJS_REPO=/path/to/ketjs npm run prepare:assets
npm run prepare:templates
npm run format
npm run check
```

Normal development and installation use the committed generated files; they do not require a KetJS checkout. Do not manually edit generated design-system bundles or vendor licenses. Changes to shared primitives and tokens belong upstream in KetJS.

Schema source is `scripts/schema.mjs`. `src/config.js` performs semantic graph validation in addition to schema-shaped checks. Keep both in sync. Templates are generated from `starter/`, `examples/` and the canonical assets by `prepare-templates`.

Commit messages should describe the resulting behavior. Avoid committing `.tgz` files, `node_modules`, test screenshots, credentials or production fixtures.
