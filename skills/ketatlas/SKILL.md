---
name: ketatlas
description: Create or update interactive HTML mockups and workflow maps in KetAtlas format. Use when a user requests KetAtlas output, an atlas.json project, or draggable flows connecting real HTML screens; also use to scaffold, serve, or audit an existing atlas.
---

# KetAtlas

Deliver an editable `<name>.ketatlas/` bundle containing actual HTML screens and a version 1 `atlas.json` that `npx ketatlas serve` can open. KetAtlas supplies the draggable viewer; the agent authors the product mockups and their flow graph. A screenshot gallery or a Mermaid diagram alone is not this deliverable.

## Read the brief and choose the scope

Use the user's requirements, existing project files, and design references to determine:

- Product, audience, requested flows, and the goal of each flow.
- Platform and viewport: mobile, web, mixed screens, or a process without screens.
- Design system and product content language. KetAtlas's own viewer is English; authored content can use the requested language.
- Output directory, existing screens to reuse, and the intended depth of interaction.

A brief may be a chat message or a Markdown file; it is not another KetAtlas JSON format. If details are missing, use reasonable defaults and record assumptions. Ask only for information that materially blocks the requested result. Do not introduce unrelated flows or build a production backend to make a mockup work.

## Choose the design system

Before scaffolding or editing visual screens, ask the user to choose a design system unless the current request already makes the choice explicit. Present these options in one concise prompt:

1. **Auto (recommended)** — use [Két Design System](https://github.com/ketvietlab/ketjs/tree/develop/packages/design-system).
2. **Két Design System** — use the same canonical Két source explicitly.
3. **Carbon Design System**.
4. **GitHub Primer**.
5. **Microsoft Fluent 2**.
6. **No design system** — create product-specific shared CSS without claiming conformance to a named system.
7. **Custom source** — ask for a repository URL or local design-system path if it was not included with the selection.

Do not start visual screen implementation until the user answers. If the user explicitly delegates the choice to the agent, treat that as **Auto**. This selection prompt is still required for an existing atlas; its documented/current system may be offered as the likely choice. A request that already names a system or supplies a design-system source counts as an answer and must not be asked again.

Inspect the selected source, its usage documentation, tokens, components, icons, and relevant product patterns before mocking. Reuse its actual public assets and composition patterns when available; do not merely imitate its color palette. Replace incompatible starter styling rather than layering multiple design systems. For one shared iOS/Android prototype, create one HTML implementation with reusable styles and states unless separate variants were requested.

Prefer a local adapter descriptor with `schemaVersion: "ketatlas.design-system-adapter.v1"` when the selected design system provides one. Discover it from the user-supplied path, a repository `design-system.atlas.json`, or the package's documented `./atlas/profile.json` export. Read the descriptor before using its assets or commands; do not assume capabilities it does not declare. If there is no adapter, use the design system through its documented HTML/CSS interface and record that no reproducible adapter lock is available.

For Két Design System, prefer the descriptor exported at `@ketvietlab/design-system/atlas/profile.json` and its declared `ket-design-system-atlas` materializer. Read that descriptor for asset names, root attributes, slots, hooks, and state ownership instead of hard-coding them.

Keep the atlas self-contained and dependency-free. Do not add a consumer package installation or custom bundler just to use a design system. Materialize or copy permitted static assets only when the selected source supports it, preserve required notices, and do not rely on remote runtime assets when the requested mockup must work offline. Record the selected system, source URL/path, pinned version or commit when known, adapter/asset strategy, and any license or fidelity limitation in the bundle README.

## Scaffold or extend

Node.js 22 or newer is required. For a new, empty destination:

```sh
npx --yes ketatlas scaffold ./tasks/mockups.ketatlas --template basic
```

Choose `basic` for mobile, `web` for desktop, or `process` for steps without UI. These are starting examples, not required product flows. Replace their sample content with the requested product.

For an existing atlas, read and edit its JSON and screen files directly. Preserve useful IDs and URLs; scaffold refuses a nonempty directory and has no `--force` option. Pin the CLI version in the README commands or use a global installation. A consumer atlas does not need a local package installation.

### Backfill legacy projects

Before changing an existing atlas, run `ketatlas discover <workspace> --json`. If its manifest is not located at `<name>.ketatlas/atlas.json`, migrate it as part of the task:

1. Inventory the manifest, sibling progress file, schema, README, screens, styles and assets. Record every relative `$schema`, screen URL and node URL before moving anything.
2. If the containing directory is a self-contained Atlas project, rename that directory to a concise `<name>.ketatlas`; moving the whole directory preserves relative URLs.
3. If the manifest shares a directory with unrelated application code, create a sibling `<name>.ketatlas` bundle. Move only Atlas-owned files, preserve Git history when possible, and rewrite relative paths for resources that intentionally remain outside the bundle.
4. Keep one canonical manifest. Do not leave a copied legacy `atlas.json` behind or delete files whose ownership is unclear.
5. Run `ketatlas discover <workspace> --json`, `ketatlas validate <name>.ketatlas`, and `ketatlas audit <name>.ketatlas --strict` after migration. Fix discovery errors and broken paths before editing product flows.

Legacy JSON paths remain accepted by the CLI for migration, but new and updated deliverables must use the bundle pattern so desktop tools can discover them without scanning arbitrary JSON.

A self-contained project typically has:

```text
tasks/mockups.ketatlas/
  atlas.json
  ketatlas.schema.json
  screens/                 HTML pages and shared CSS/JavaScript
  styles/                  Starter design assets, when used
  README.md                Run commands, flow coverage, assumptions, verification
```

Keep product assets inside the served directory when practical. Deliver JSON/schema, screen HTML/CSS/JavaScript, assets, and documentation. Do not scaffold a `package.json`, lockfile, `node_modules`, asset build scripts, or a copied viewer/test harness in the atlas folder just to use KetAtlas. The installed CLI supplies scaffold, serve, validate, and audit. Browser verification can use the agent's external tooling. Preserve unrelated application tooling when extending an existing repository.

Do not create a wrapper viewer or a custom canvas: `serve ./tasks/mockups.ketatlas` provides it.

## Model the journey

Sketch the requested flow inventory before implementing screens: start, user action, condition, destination, and outcome. Include the relevant success, validation, empty, loading, error, and recovery states supported by the brief; do not multiply every screen into states that have no meaning for that product.

Use the generated `ketatlas.schema.json` as the field reference. `version: 1` is the atlas format version, not the npm package version. Unknown properties are rejected. Store requirements, coverage notes, and backlog items in Markdown rather than inventing JSON fields.

Core rules:

- Register each reusable screen once in `screens` with `id`, `title`, and `url`. Paths resolve relative to `atlas.json`.
- Give each flow an `id`, `title`, nonempty `nodes`, and `edges`. Set `start` and `ends` explicitly when authoring a journey so entry and outcomes are unambiguous.
- A screen node references a screen ID. A repeated occurrence gets a new node ID and may override `url`, for example `./screens/sign-in.html?state=invalid`.
- For a decision or off-screen operation, use a node with `type: "note"`, `title`, and optionally `description`. Use `type: "external"` for a handoff. There is no `decision` node type.
- Edges require `from`, `to`, and a nonempty `label` describing the action or condition. `kind` is `primary`, `conditional`, or `recovery`.
- Edge endpoints, `start`, and `ends` reference node IDs within the same flow. Cross-flow edges are unsupported; reuse the destination screen or explain the handoff with a note.
- IDs start with a letter or digit and contain only letters, digits, dots, underscores, or hyphens. Screen and flow IDs are unique across the atlas; node IDs are unique within their flow.
- Set `column` and `row` explicitly for branches. Both are integers from 0 to 100; no two nodes in a flow share a cell. This is a grid, not an automatic graph layout engine.
- Set the atlas `viewport` or a screen override to the intended layout size. The mobile default is 390 × 844; choose desktop dimensions from the brief. Width and height are integers from 160 to 4096.

Example structure, to adapt to the actual product and HTML files:

```json
{
  "$schema": "./ketatlas.schema.json",
  "version": 1,
  "title": "Account access",
  "viewport": { "width": 390, "height": 844 },
  "screens": [
    { "id": "sign-in", "title": "Sign in", "url": "./screens/sign-in.html" },
    { "id": "home", "title": "Home", "url": "./screens/home.html" }
  ],
  "flows": [
    {
      "id": "sign-in",
      "title": "Sign in",
      "start": "entry",
      "ends": ["success"],
      "nodes": [
        { "id": "entry", "screen": "sign-in", "column": 0, "row": 0 },
        {
          "id": "invalid",
          "screen": "sign-in",
          "title": "Invalid credentials",
          "url": "./screens/sign-in.html?state=invalid",
          "column": 1,
          "row": 1
        },
        { "id": "success", "screen": "home", "column": 2, "row": 0 }
      ],
      "edges": [
        { "from": "entry", "to": "success", "label": "Credentials accepted" },
        {
          "from": "entry",
          "to": "invalid",
          "label": "Credentials rejected",
          "kind": "conditional"
        },
        { "from": "invalid", "to": "entry", "label": "Try again", "kind": "recovery" }
      ]
    }
  ]
}
```

## Build the actual screens

Make each screen a complete HTML document with a viewport meta tag and `body { margin: 0; }`. Keep product content padding, but do not wrap the page in a second phone bezel, presentation frame, reviewer sidebar, or outer mockup margin. The iframe is the screen boundary.

Use shared CSS/components and deterministic mock data. States referenced by node URLs must render directly when opened or refreshed, without requiring a previous login or click. Implement the relevant buttons, forms, validation feedback, and navigation in HTML/JavaScript: graph arrows do not wire screen interactions automatically.

The default iframe sandbox allows scripts and forms but gives the page an opaque origin. Prefer ordinary links, classic scripts, inline mock data, URL parameters, and in-memory state for portable prototypes. Storage, authenticated fetch, and some module imports can fail in this sandbox. Test in **Try this screen**, not just a standalone tab; do not solve a prototype issue by weakening the viewer's sandbox.

## Validate and hand off

Run from the user's project with the same root for audit and serve:

```sh
npx --yes ketatlas discover . --json
npx --yes ketatlas validate ./tasks/mockups.ketatlas
npx --yes ketatlas audit ./tasks/mockups.ketatlas --strict
npx --yes ketatlas serve ./tasks/mockups.ketatlas
```

Use `--root .` on both audit and serve if screens or assets intentionally live outside the atlas directory but inside the project. Use `--port 4180` or another free port when necessary. Refresh after file edits; there is no hot reload.

For local projects, fix structural errors, missing assets, and unreachable nodes until strict audit passes. Remote screen/assets URLs produce warnings and are not fetched by audit: when those are intentional, run the normal audit, report the warnings, and verify embedding separately rather than claiming a strict pass. With `audit --json --strict`, check the exit status and warnings as well as `valid`.

When browser automation is available, inspect the map and actual HTML at the declared viewport. Exercise each requested flow's primary route and relevant recovery route, and check for console errors and accidental clipping. Audit alone does not prove interaction, appearance, or complete coverage. If browser verification is unavailable, state that limit and still deliver the auditable files.

Update the project's README with flow-to-screen/state coverage, assumptions, demo inputs, and run commands. Return the output location, the serve command or live preview URL, audit results, and any remaining limitations. Do not claim that a mockup implements production APIs or native application behavior.

## Maintain screen delivery progress

When implementing or reviewing screens, track progress in `atlas.progress.json` beside the bundle manifest. Keep version 1 workflow JSON unchanged. Read `ketatlas progress <name>.ketatlas --json`, preserve existing evidence/check IDs and state references, then update one record with `--set <screen-id> --record <record.json> --expect <revision>`. Re-read and reconcile conflicts instead of overwriting another writer. Run `audit` after updates.

Map task scope to screen IDs before assigning progress. Start unknown coverage at `unassessed`; a mockup is not implementation evidence. Use `planned`, `in_progress`, `in_review`, `implemented`, `verified` with a separate blocker reason/next action. Link PRs and exact merge commits, pin/release evidence, and test evidence at the revision/environment actually checked. Do not infer deployment, full screen coverage or verification from a PR merge or green aggregate CI. Completed acceptance checks need evidence; `verified` requires passed test evidence with revision and environment for every recorded check and no blocker. Track error/recovery states using check `nodes` references. Leave unrelated or unreviewed product surfaces unassessed and say why. See `docs/progress.md` in the package for the complete contract.

Sidebar badges show Checks (completed recorded checks / all recorded checks) and Implemented (Implemented + Verified screens / all unique screens). No recorded checks shows — for Checks. Verified-screen completion stays separate on the project top bar. Do not assign arbitrary weights to intermediate statuses or remove unknown/unscoped screens to inflate completion. Workflow counts deduplicate screen IDs, including variants; process-only flows have no screen percentage.
