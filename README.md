# KetAtlas

**Scaffold, serve, and audit interactive framework-native workflow maps.**

Turn a JSON file and screens from your existing HTML, React, Vue, KetJS, or other framework into a canvas you can drag, zoom, and explore. Connect screens with labelled arrows, model decisions and recovery paths, and open the real rendered page to try a step. The same tool supports mobile screens, web pages, and processes with no screens at all.

KetAtlas has an English UI and zero runtime npm dependencies. Node.js **22+** is needed for the CLI. Static projects need no build step. Framework-native projects reuse their product's own server and dependencies; KetAtlas supervises it on a separate localhost port.

## Demo

Open the live map at **[atlas.ketsuite.com](https://atlas.ketsuite.com)**: drag, zoom, follow the
labelled arrows, and open a real HTML prototype from any screen. Nothing to install.

## Run without a project install

[KetAtlas is available on npm](https://www.npmjs.com/package/ketatlas). Use Node.js 22+ and run it from any directory:

```sh
npx --yes ketatlas scaffold my-atlas.ketatlas --template web
npx --yes ketatlas discover . --json
npx --yes ketatlas serve my-atlas.ketatlas
npx --yes ketatlas audit my-atlas.ketatlas --strict
```

Or install the CLI once for your user account:

```sh
npm install --global ketatlas
ketatlas scaffold my-atlas.ketatlas
ketatlas serve my-atlas.ketatlas
ketatlas audit my-atlas.ketatlas --strict
```

The consumer bundle is named `<name>.ketatlas/` and contains `atlas.json`, its schema, documentation, and either static screen assets or an `atlas.renderer.json` sidecar. The stable directory suffix lets desktop tools discover atlases without parsing unrelated JSON. A bundle needs no KetAtlas package manifest, lockfile, `node_modules`, build step, or copy of the viewer. Framework dependencies and reusable UI stay in the product workspace, where multiple atlases can share one set of presenters, components, fixtures, and styles. The CLI supplies discovery, serving, validation, and audit. `audit` leaves project files unchanged unless an output file is explicitly requested. Viewing with `serve` does not write; explicit **Save progress** writes the sibling progress file. Use `--read-only` to disable editing.

Pin the version in run commands or the global installation for reproducible team workflows. Product scripts implement mock screen interactions; they are authored content, not a local installation of KetAtlas. A native renderer reuses the product's framework tooling and shared UI source rather than copying markup into each atlas.

Edit the JSON and product screen source, then refresh the browser. The default viewer address is **http://127.0.0.1:4178**.

KetAtlas 0.5.1 preloads only the selected flow and keeps a bounded session cache. `serve --no-preload` disables preloading; `--preload` enables the default flow mode. These CLI flags and the flow cache require 0.5.1 or newer. Version 0.5.0 only supports the opt-out through the embedded API. See the [CLI guide](https://github.com/ketvietlab/ketatlas/blob/develop/docs/cli.md#serve-a-json-file).

## Create mockups with an agent

Install the KetAtlas skill in your product project:

```sh
npx skills add ketvietlab/ketatlas --skill ketatlas
```

Ask your agent to use the skill with a product brief: requested flows, target platforms, design references, and output directory. The agent creates native framework routes (or static HTML for a static product), a version 1 `atlas.json`, and run instructions, then audits the result.

## Render with the product framework

KetAtlas 0.4.0 keeps the viewer and product renderer separate. Put `atlas.renderer.json` beside `atlas.json` when screens come from a framework:

```json
{
  "$schema": "https://unpkg.com/ketatlas@0.5.1/renderer.schema.json",
  "version": 1,
  "framework": "vue",
  "command": ["npm", "run", "atlas:serve", "--", "--host", "{host}", "--port", "{port}"],
  "cwd": "../..",
  "readyPath": "/__atlas/ready",
  "screenBasePath": "/__atlas/orders/"
}
```

Then run:

```sh
npx --yes ketatlas@0.5.1 serve ./tasks/orders.ketatlas --renderer --port 60550 --html-port 60551
```

The first port serves the map and progress API. The second is owned by the declared React/Vue/KetJS/etc. server and serves screen routes. `--renderer` is explicit because it executes the local command array. Static projects continue to use the one-port command without this flag. See [Native renderers](https://github.com/ketvietlab/ketatlas/blob/develop/docs/authoring.md#framework-native-screens).

See [Agent mockups](https://github.com/ketvietlab/ketatlas/blob/develop/docs/agent-mockups.md) for installation options, a ready-to-use request, and a reusable brief template. Agents without skill support can read the [single skill file](https://github.com/ketvietlab/ketatlas/blob/develop/skills/ketatlas/SKILL.md) directly.

## One file describes the journey

```json
{
  "version": 1,
  "title": "Customer onboarding",
  "screens": [
    { "id": "welcome", "title": "Welcome", "url": "./screens/welcome.html" },
    { "id": "home", "title": "Workspace", "url": "./screens/home.html" }
  ],
  "flows": [
    {
      "id": "onboarding",
      "title": "Join a workspace",
      "nodes": [
        { "id": "start", "screen": "welcome" },
        { "id": "finish", "screen": "home" }
      ],
      "edges": [{ "from": "start", "to": "finish", "label": "Continue" }]
    }
  ]
}
```

URLs resolve relative to the JSON file. Nodes default to a left-to-right row. Set `column` and `row` for branches; set each screen's `viewport` for mobile or desktop dimensions. Reuse a screen in many flows without duplicating its HTML.

## Track delivery

Open **Screens** to filter screen progress, review blockers and edit acceptance checks with PR/test evidence. Records live in a sibling `atlas.progress.json` tracked in Git; repeated nodes share one screen record. A merged PR is not a verified screen. Local saves detect concurrent edits; static hosting is read-only. See [Screen progress](https://github.com/ketvietlab/ketatlas/blob/develop/docs/progress.md) for the contract, CLI and embedding API.

## Commands

| Command                    | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `scaffold <name.ketatlas>` | Create a bundle from `basic`, `web`, or `process`. Refuses existing content.     |
| `discover <directory>`     | Find valid `*.ketatlas/atlas.json` bundles and report invalid bundles.           |
| `serve <bundle\|json>`     | Start the viewer; optionally supervise a native renderer on a second port.       |
| `audit <bundle\|json>`     | Check configuration, reachability, local files, and literal HTML/CSS references. |
| `validate <bundle\|json>`  | Validate configuration only, without reading screen files.                       |

Use `--help` for options, `--root` when assets live above the JSON directory, and `audit --json` for CI reports. [Full CLI reference →](https://github.com/ketvietlab/ketatlas/blob/develop/docs/cli.md)

## Embed it in an existing page

```js
import { loadAtlas } from "/vendor/ketatlas/dist/index.js";

const atlas = await loadAtlas(document.querySelector("#map"), "./atlas.json");
atlas.goToFlow("onboarding");
// When the host page unmounts:
// atlas.destroy();
```

Give the container a height. Copy the package’s `dist/` directory with its bundled styles and assets. Shadow DOM isolates viewer styles and events; multiple viewers can coexist. For React or bundled applications, see [Integration](https://github.com/ketvietlab/ketatlas/blob/develop/docs/integration.md).

## Documentation

Implementation source and development history are maintained in a private repository. This public repository contains user documentation, JSON schemas, and the agent skill. The npm package ships a compiled, minified CLI and browser viewer without implementation source files or source maps. JavaScript bundles remain inspectable; minification is not encryption.

- [Authoring guide](https://github.com/ketvietlab/ketatlas/blob/develop/docs/authoring.md): screens, processes, branching, reuse, and viewport sizes.
- [Configuration reference](https://github.com/ketvietlab/ketatlas/blob/develop/docs/configuration.md): schema and defaults.
- [CLI and audit](https://github.com/ketvietlab/ketatlas/blob/develop/docs/cli.md): commands, exit codes, and audit boundaries.
- [Integration and API](https://github.com/ketvietlab/ketatlas/blob/develop/docs/integration.md): lifecycle, events, embedding, and styling.
- [Migration](https://github.com/ketvietlab/ketatlas/blob/develop/docs/migration.md): compatibility notes and package paths.
- [Report an issue](https://github.com/ketvietlab/ketatlas/issues).

Audit is static analysis. It does not execute product code or prove that native apps, external services, or embedded pages behave correctly. Arrows describe the authored workflow; the embedded HTML retains its own interactions.

## License

KetAtlas is a project of **KET VIET JSC, VN**, distributed under the [KetAtlas Proprietary License](https://github.com/ketvietlab/ketatlas/blob/develop/LICENSE) starting with 0.4.1. You may use the official build; modification and redistribution of the runtime require written permission. Templates, schemas, declarations, documentation, and the agent skill may be used and adapted for your own projects. Earlier releases retain their original licenses.

Copyright (c) 2026 KET VIET JSC, VN. See [third-party notices](https://github.com/ketvietlab/ketatlas/blob/develop/NOTICE.md) for bundled dependencies.
