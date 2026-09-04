# KetAtlas

**Scaffold, serve, and audit interactive HTML workflow maps.**

Turn a JSON file and your existing HTML screens into a canvas you can drag, zoom, and explore. Connect screens with labelled arrows, model decisions and recovery paths, and open the real HTML to try a step. The same tool supports mobile screens, web pages, and processes with no screens at all.

KetAtlas has an English UI, zero runtime npm dependencies, and no build step. Node.js **22+** is needed for the CLI. Viewers use native ES modules and run on an HTTP server.

## Demo

See a mobile workflow map in action: explore connected screens and try the HTML prototype.

https://github.com/user-attachments/assets/13f24fc8-7b8e-4bda-9e02-364c120ee163

## Start from this repository

```sh
git clone git@github.com:ketvietlab/ketatlas.git
cd ketatlas
npm ci
npm run dev
```

Open **http://127.0.0.1:4178**. The playground includes mobile sign-in, a desktop approval flow, and a fulfilment process.

Create your own project:

```sh
node bin/ketatlas.js scaffold ../my-atlas
node bin/ketatlas.js serve ../my-atlas/atlas.json
node bin/ketatlas.js audit ../my-atlas/atlas.json --strict
```

No wrapper HTML is needed. Edit `atlas.json` and the files under `screens/`, then refresh the browser.

## Run through npx

[KetAtlas is available on npm](https://www.npmjs.com/package/ketatlas). Create and run a project without cloning this repository:

```sh
npx ketatlas scaffold my-atlas --template web
npx ketatlas serve my-atlas/atlas.json
npx ketatlas audit my-atlas/atlas.json --strict
```

Pin a version, such as `npx ketatlas@0.1.0`, for reproducible team workflows.

To try changes from a local checkout before publishing:

```sh
npx --yes --package ~/dev/ketatlas ketatlas scaffold my-atlas
```

Replace `~/dev/ketatlas` with your checkout path. Stable version increases merged into `develop` are automatically published after CI verifies the package. See [Releasing](docs/releasing.md) for setup and release steps.

## Create mockups with an agent

Install the KetAtlas skill in your product project:

```sh
npx skills add ketvietlab/ketatlas --skill ketatlas
```

Ask your agent to use the skill with a product brief: requested flows, target platforms, design references, and output directory. The agent creates actual HTML screens, a version 1 `atlas.json`, and run instructions, then audits the result.

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

## Commands

| Command                 | Purpose                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `scaffold <directory>`  | Create a project from `basic`, `web`, or `process`. Refuses to overwrite existing content. |
| `serve <atlas.json>`    | Start the viewer and serve local screens. Defaults to port 4178 on localhost.              |
| `audit <atlas.json>`    | Check configuration, reachability, local files, and literal HTML/CSS references.           |
| `validate <atlas.json>` | Validate configuration only, without reading screen files.                                 |

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

MIT · [Third-party notices](NOTICE.md).
