---
name: ketatlas
description: Create or update interactive HTML mockups and workflow maps in KetAtlas format. Use when a user requests KetAtlas output, an atlas.json project, or draggable flows connecting real HTML screens; also use to scaffold, serve, or audit an existing atlas.
---

# KetAtlas

Deliver an editable project containing actual HTML screens and a version 1 `atlas.json` that `npx ketatlas serve` can open. KetAtlas supplies the draggable viewer; the agent authors the product mockups and their flow graph. A screenshot gallery or a Mermaid diagram alone is not this deliverable.

## Read the brief and choose the scope

Use the user's requirements, existing project files, and design references to determine:

- Product, audience, requested flows, and the goal of each flow.
- Platform and viewport: mobile, web, mixed screens, or a process without screens.
- Design system and product content language. KetAtlas's own viewer is English; authored content can use the requested language.
- Output directory, existing screens to reuse, and the intended depth of interaction.

A brief may be a chat message or a Markdown file; it is not another KetAtlas JSON format. If details are missing, use reasonable defaults and record assumptions. Ask only for information that materially blocks the requested result. Do not introduce unrelated flows or build a production backend to make a mockup work.

Use the supplied product design system when one exists. The starter uses KetJS styles, but KetAtlas can embed product HTML using any design system. For one shared iOS/Android prototype, create one HTML implementation with reusable styles and states unless separate variants were requested.

## Scaffold or extend

Node.js 22 or newer is required. For a new, empty destination:

```sh
npx --yes ketatlas scaffold ./tasks/mockups --template basic
```

Choose `basic` for mobile, `web` for desktop, or `process` for steps without UI. These are starting examples, not required product flows. Replace their sample content with the requested product.

For an existing atlas, read and edit its JSON and screen files directly. Preserve useful IDs and URLs; scaffold refuses a nonempty directory and has no `--force` option. Use the project's pinned KetAtlas version when present; otherwise note the version returned by `npx ketatlas --version` for reproducibility.

A self-contained project typically has:

```text
tasks/mockups/
  atlas.json
  ketatlas.schema.json
  screens/                 HTML pages and shared CSS/JavaScript
  styles/                  Starter design assets, when used
  README.md                Run commands, flow coverage, assumptions, verification
```

Keep images and other assets inside the served directory when practical. Do not create a wrapper viewer or a custom canvas: `serve atlas.json` provides it.

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
npx --yes ketatlas validate ./tasks/mockups/atlas.json
npx --yes ketatlas audit ./tasks/mockups/atlas.json --strict
npx --yes ketatlas serve ./tasks/mockups/atlas.json
```

Use `--root .` on both audit and serve if screens or assets intentionally live outside the atlas directory but inside the project. Use `--port 4180` or another free port when necessary. Refresh after file edits; there is no hot reload.

For local projects, fix structural errors, missing assets, and unreachable nodes until strict audit passes. Remote screen/assets URLs produce warnings and are not fetched by audit: when those are intentional, run the normal audit, report the warnings, and verify embedding separately rather than claiming a strict pass. With `audit --json --strict`, check the exit status and warnings as well as `valid`.

When browser automation is available, inspect the map and actual HTML at the declared viewport. Exercise each requested flow's primary route and relevant recovery route, and check for console errors and accidental clipping. Audit alone does not prove interaction, appearance, or complete coverage. If browser verification is unavailable, state that limit and still deliver the auditable files.

Update the project's README with flow-to-screen/state coverage, assumptions, demo inputs, and run commands. Return the output location, the serve command or live preview URL, audit results, and any remaining limitations. Do not claim that a mockup implements production APIs or native application behavior.
