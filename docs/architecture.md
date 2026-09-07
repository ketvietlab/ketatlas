# Architecture

KetAtlas is a static browser viewer plus a Node.js command-line toolkit. There is no database, account service or runtime npm dependency. The localhost CLI has a narrow, protected API to read and save the progress sidecar; static hosting remains read-only.

```text
atlas.json + screen HTML
        │
        ├── validate / audit → diagnostics and CI exit code
        │
        └── serve → built-in viewer page
                       │
                       ├── config validation + URL resolution
                       ├── deterministic grid layout
                       ├── Shadow DOM shell + SVG edges
                       └── lazy HTML iframes + interactive inspector
```

## Consumer boundary

KetAtlas is installed globally or executed through npx. Consumers provide JSON, a schema, HTML/CSS/JavaScript mock screens, assets, and documentation. They do not need a Node package, lockfile, development dependencies, viewer implementation, or build/test scripts to scaffold, serve, or audit a map.

The package owns the CLI, viewer, validation, and framework verification. A product may have its own application tests elsewhere; those are independent of the map format. Static audit does not simulate product interactions. Agent browser checks can run through external tooling without adding a test harness to the delivered atlas folder.

## Ownership

| Directory         | Responsibility                                                |
| ----------------- | ------------------------------------------------------------- |
| `src/config.js`   | DOM-free validation and normalization.                        |
| `src/layout.js`   | Pure grid sizing and edge routes.                             |
| `src/index.js`    | Mounting, camera, input, iframe lifecycle and public API.     |
| `src/template.js` | English viewer shell.                                         |
| `src/index.d.ts`  | Public TypeScript declarations.                               |
| `styles/`         | Viewer layout and generated canonical design-system bundles.  |
| `assets/`         | Local fonts, licenses and provenance manifest.                |
| `bin/`            | Scaffold, JSON serving, validation and static audit.          |
| `templates/`      | Self-contained starting projects included in the npm package. |
| `examples/`       | Maintainer playground with mobile, web and process flows.     |
| `scripts/`        | Reproducible assets, templates, schema and package checks.    |
| `tests/`          | Pure logic, CLI/server, browser and installation tests.       |

## Layout and performance

Flows are stacked on one canvas. A row and column grow to fit their largest node, so mobile and desktop aspect ratios can coexist. The layout respects authored grid positions. Arrows use orthogonal routes and a small lane offset; this is not an obstacle-avoiding graph-layout engine. Use nearby grid cells and concise labels for readable large diagrams.

Camera changes use an animation frame and a CSS transform. Only the nearest visible screen cards receive iframes, up to the configured cap. Below the preview threshold, all cards show placeholders. This limits embedded-page cost; every node and edge still has a DOM element. There is no claim of unlimited graph size.

The inspector reuses the same screen URL at its declared viewport dimensions, with no extra side padding. Its iframe is removed when closed. Reopening a screen loads a fresh instance; editing a prototype is not persistent business state.

## Isolation and lifecycle

Each mount owns a Shadow DOM subtree, event handlers, a camera, an observer, and an iframe pool. IDs and SVG markers are scoped to that subtree. `destroy()` removes the subtree, disconnects the observer, cancels scheduled painting and closes dialogs. Host CSS and unrelated content are not rewritten.

URL synchronization is opt-in. The CLI enables it; an embedded map does not take ownership of the host URL by default.

## Design provenance

The default theme uses Inter and KetJS's canonical tokens and primitives. `prepare-assets` reads exact source files from a pinned KetJS revision, flattens imports, and emits two bundles: a regular document bundle and a Shadow DOM bundle. The only selector adaptation is `:root` → `:host`; values are unchanged.

`assets/design-system.lock.json` records upstream hashes and generated output hashes. `npm run prepack` verifies them and checks that viewer CSS consumes existing tokens without redefining `--kv-*` values. Upstream capability changes belong in KetJS before changing this pin.

## Version 1 boundaries

KetAtlas is a viewer and authoring toolkit, not a visual graph editor. Users edit JSON and HTML in their normal tools. It does not record a graph by watching clicks, synthesize screens, calculate backend permissions, or execute the arrow graph as an automated test. Cross-flow edges, collaborative editing and browser-based project audits are outside the current contract.

## Delivery tracking

`src/progress.js` owns progress validation and unique-screen counts. `src/progress-ui.js` owns the screen register and progress editor. `bin/progress.js` shares a locked, revision-checked atomic writer between CLI and local HTTP updates. Progress does not alter graph layout or infer completion from PR state. See [Screen progress](progress.md).
