# KetAtlas

**Scaffold, serve, and audit interactive framework-native workflow maps.**

Turn a JSON file and screens from your existing HTML, React, Vue, KetJS, or other framework into a canvas you can drag, zoom, and explore. Connect screens with labelled arrows, model decisions and recovery paths, and open the real rendered page to try a step. The same tool supports mobile screens, web pages, and processes with no screens at all.

KetAtlas has an English UI and zero runtime npm dependencies. Node.js **22+** is needed for the CLI. Static projects need no build step. Framework-native projects reuse their product's own server and dependencies; KetAtlas supervises it on a separate localhost port.

## Demo

Open the live map at **[atlas.ketsuite.com](https://atlas.ketsuite.com)**: drag, zoom, follow the
labelled arrows, and open a real HTML prototype from any screen. Nothing to install.

The same map recorded as a video, for a quick look:

https://github.com/user-attachments/assets/13f24fc8-7b8e-4bda-9e02-364c120ee163

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
  "$schema": "https://unpkg.com/ketatlas@0.4.0/renderer.schema.json",
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
npx --yes ketatlas@0.4.0 serve ./tasks/orders.ketatlas --renderer --port 60550 --html-port 60551
```

The first port serves the map and progress API. The second is owned by the declared React/Vue/KetJS/etc. server and serves screen routes. `--renderer` is explicit because it executes the local command array. Static projects continue to use the one-port command without this flag. See [Native renderers](docs/authoring.md#framework-native-screens).

See [Agent mockups](docs/agent-mockups.md) for installation options, a ready-to-use request, and a reusable brief template. Agents without skill support can read the [single skill file](skills/ketatlas/SKILL.md) directly.

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

Open **Screens** to filter screen progress, review blockers and edit acceptance checks with PR/test evidence. Records live in a sibling `atlas.progress.json` tracked in Git; repeated nodes share one screen record. A merged PR is not a verified screen. Local saves detect concurrent edits; static hosting is read-only. See [Screen progress](docs/progress.md) for the contract, CLI and embedding API.

## Commands

| Command                    | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `scaffold <name.ketatlas>` | Create a bundle from `basic`, `web`, or `process`. Refuses existing content.     |
| `discover <directory>`     | Find valid `*.ketatlas/atlas.json` bundles and report invalid bundles.           |
| `serve <bundle\|json>`     | Start the viewer; optionally supervise a native renderer on a second port.       |
| `audit <bundle\|json>`     | Check configuration, reachability, local files, and literal HTML/CSS references. |
| `validate <bundle\|json>`  | Validate configuration only, without reading screen files.                       |

Use `--help` for options, `--root` when assets live above the JSON directory, and `audit --json` for CI reports. [Full CLI reference →](docs/cli.md)

## Embed it in an existing page

```js
import { loadAtlas } from "/vendor/ketatlas/src/index.js";

const atlas = await loadAtlas(document.querySelector("#map"), "./atlas.json");
atlas.goToFlow("onboarding");
// When the host page unmounts:
// atlas.destroy();
```

Give the container a height. Ship `src/`, `styles/`, and `assets/` together. Shadow DOM isolates viewer styles and events; multiple viewers can coexist. For React or bundled applications, see [Integration](docs/integration.md).

## Explore and contribute

To develop KetAtlas itself, clone this repository and install its development dependencies:

```sh
git clone git@github.com:ketvietlab/ketatlas.git
cd ketatlas
npm ci
npm run dev
```

The playground includes mobile sign-in, desktop approval, and a fulfilment process. These development dependencies are not required in consumer projects. To try an unpublished checkout, use `npx --yes --package ~/dev/ketatlas ketatlas serve /path/to/my-atlas.ketatlas`.

Stable version increases merged into `develop` are automatically published after CI verifies the package. See [Releasing](docs/releasing.md).

- [Authoring guide](docs/authoring.md): screens, processes, branching, reuse, and viewport sizes.
- [Configuration reference](docs/configuration.md): schema and defaults.
- [CLI and audit](docs/cli.md): commands, exit codes, and audit boundaries.
- [Integration and API](docs/integration.md): lifecycle, events, embedding, and styling.
- [Architecture](docs/architecture.md): package boundaries and design provenance.
- [Migration from the mobile map](docs/migration.md): explicit field mapping.
- [Contributing](CONTRIBUTING.md) and [releasing](docs/releasing.md).

```sh
npm run validate
npm test
npx playwright install chromium
npm run test:e2e
npm run test:package
```

Audit is static analysis. It does not execute product code or prove that native apps, external services, or embedded pages behave correctly. Arrows describe the authored workflow; the embedded HTML retains its own interactions.

## License

KetAtlas is a project of **KET VIET JSC, VN**, distributed under the [MIT License](LICENSE).

Copyright (c) 2026 KET VIET JSC, VN. See [third-party notices](NOTICE.md) for bundled dependencies.
