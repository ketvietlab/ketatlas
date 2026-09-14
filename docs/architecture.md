# Architecture

KetAtlas is a browser viewer plus a Node.js command-line orchestrator. There is no database, account service or runtime npm dependency. Static screens can still use the built-in file server. Framework-native screens run through the product's own server on a second loopback origin, preserving the component implementation as the single source of truth. The localhost CLI has a narrow, protected API to read and save the progress sidecar; static hosting remains read-only.

```text
<name>.ketatlas/atlas.json
        │
        ├── discover → workspace bundle catalog
        ├── validate / audit → diagnostics and CI exit code
        └── serve → viewer/control origin
                       ├── config validation + deterministic map
                       ├── progress API + Shadow DOM viewer
                       └── lazy iframes
                              ├── static files on the viewer origin, or
                              └── native framework renderer origin
                                      └── shared presenters + Atlas fixtures
```

## Consumer boundary

KetAtlas is installed globally or executed through npx. Consumers provide a `<name>.ketatlas/` bundle containing JSON, a schema, documentation, and either static mock screens or `atlas.renderer.json`. The suffix is the discovery boundary: tools inspect only its direct `atlas.json`, not arbitrary workspace JSON. Consumers do not need a KetAtlas package, lockfile, development dependencies, viewer implementation, or build/test scripts. A native renderer deliberately reuses the product's existing framework package and lockfile outside the bundle.

The package owns the CLI, viewer, validation, renderer supervision, and contract verification. The product owns screen markup, components, styles, fixtures, and framework tests. Static audit does not execute renderer commands or simulate product interactions. Agent browser checks can run through external tooling without adding a test harness to the delivered atlas folder.

## Native renderer boundary

`atlas.renderer.json` declares a framework label, an argv array, a working directory, readiness route, and screen base path. It is separate from `atlas.json`: workflow format version 1 remains framework-neutral. `serve --renderer` is required to execute the command, making local code execution explicit. KetAtlas substitutes host/port tokens, waits for a 2xx readiness response, and terminates the renderer with the viewer.

The viewer and renderer use different loopback origins. Relative screen and screen-node URLs resolve against `screenBasePath` on the renderer origin. Relative external/note references still resolve beside `atlas.json`. Renderer iframes receive `allow-same-origin` because the separate origin prevents access to the viewer while enabling native module loading, assets, storage, and same-origin requests.

Multiple atlases should share one framework renderer source. Shared design-system compositions, presenters, fixture factories, and styles live in one product module; each atlas selects namespaced routes through `screenBasePath` and owns only its flow/state declarations. The core does not define a component DSL or translate component trees.

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
| `bin/`            | Bundle discovery, scaffold, serving, validation and audit.    |
| `templates/`      | Self-contained starting projects included in the npm package. |
| `examples/`       | Maintainer playground with mobile, web and process flows.     |
| `scripts/`        | Reproducible assets, templates, schema and package checks.    |
| `tests/`          | Pure logic, CLI/server, browser and installation tests.       |

## Layout and performance

Flows are stacked on one canvas. A row and column grow to fit their largest node, so mobile and desktop aspect ratios can coexist. The layout respects authored grid positions. Arrows use orthogonal routes and a small lane offset; this is not an obstacle-avoiding graph-layout engine. Use nearby grid cells and concise labels for readable large diagrams.

Camera changes use an animation frame and a CSS transform. Drag, wheel, keyboard and pinch input use shared accelerated motion constants while zoom remains anchored under the pointer. Only the nearest visible screen cards receive iframes, up to the configured cap. Below the preview threshold, all cards show placeholders. This limits embedded-page cost; every node and edge still has a DOM element. There is no claim of unlimited graph size.

The inspector reuses the same screen URL at its declared viewport dimensions, with no extra side padding. Its iframe is removed when closed. Reopening a screen loads a fresh instance; editing a prototype is not persistent business state. Framework rendering and business simulation remain inside the renderer, never the viewer.

## Isolation and lifecycle

Each mount owns a Shadow DOM subtree, event handlers, a camera, an observer, and an iframe pool. IDs and SVG markers are scoped to that subtree. `destroy()` removes the subtree, disconnects the observer, cancels scheduled painting and closes dialogs. Host CSS and unrelated content are not rewritten.

URL synchronization is opt-in. The CLI enables it; an embedded map does not take ownership of the host URL by default.

## Design provenance

The default theme uses Inter and KetJS's canonical tokens and primitives. `prepare-assets` reads exact source files from a pinned KetJS revision, flattens imports, and emits two bundles: a regular document bundle and a Shadow DOM bundle. The only selector adaptation is `:root` → `:host`; values are unchanged.

`assets/design-system.lock.json` records upstream hashes and generated output hashes. `npm run prepack` verifies them and checks that viewer CSS consumes existing tokens without redefining `--kv-*` values. Upstream capability changes belong in KetJS before changing this pin.

## Version 1 boundaries

KetAtlas is a viewer and authoring toolkit, not a visual graph editor. Users edit JSON and product framework source in their normal tools. It does not record a graph by watching clicks, synthesize screens, translate React/Vue/KetJS components, calculate backend permissions, or execute the arrow graph as an automated test. Cross-flow edges, collaborative editing and browser-based project audits are outside the current contract.

## Delivery tracking

`src/progress.js` owns progress validation and unique-screen counts. `src/progress-ui.js` owns the screen register and progress editor. `bin/progress.js` shares a locked, revision-checked atomic writer between CLI and local HTTP updates. Progress does not alter graph layout or infer completion from PR state. See [Screen progress](progress.md).
