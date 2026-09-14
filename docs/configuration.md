# Configuration reference

The [JSON Schema](../schema.json) defines version 1. A generated project contains `ketatlas.schema.json` and references it using `$schema`. The CLI rejects unknown fields so misspellings do not silently change the layout.

## Atlas

| Field         | Required | Default / meaning                                                  |
| ------------- | -------- | ------------------------------------------------------------------ |
| `version`     | Yes      | Must be `1`.                                                       |
| `title`       | Yes      | Project name in the viewer header.                                 |
| `description` | No       | Project description for tooling; not rendered as a separate panel. |
| `viewport`    | No       | `{ "width": 390, "height": 844 }`.                                 |
| `screens`     | No       | Reusable screen definitions; `[]` supports screenless processes.   |
| `flows`       | Yes      | A nonempty array of workflows.                                     |
| `$schema`     | No       | Schema URL/path for your editor.                                   |

All viewer UI is English. Project titles, descriptions and labels can use any language. Search ignores case and combining accents. Workflow format version 1 remains framework-neutral; native rendering is declared in a separate sidecar.

## Native renderer sidecar

`atlas.renderer.json` is optional and sits beside `atlas.json`. Its [schema](../renderer.schema.json) has these fields:

| Field            | Required | Default / meaning                                                   |
| ---------------- | -------- | ------------------------------------------------------------------- |
| `version`        | Yes      | Renderer contract version; must be `1`.                             |
| `framework`      | Yes      | Human/tooling label such as `react`, `vue`, or `ketjs`.             |
| `command`        | Yes      | Nonempty argv array executed directly, without a shell.             |
| `cwd`            | No       | Working directory relative to the bundle; defaults to `.`.          |
| `readyPath`      | No       | Origin-relative 2xx readiness route; defaults to `/`.               |
| `screenBasePath` | No       | Origin-relative screen route prefix ending in `/`; defaults to `/`. |
| `readyTimeoutMs` | No       | Startup timeout from 100–120000 milliseconds; defaults to 15000.    |
| `$schema`        | No       | Schema URL/path for editor completion.                              |

The command may interpolate `{host}`, `{port}`, and `{atlasDirectory}`. The corresponding environment values are `KETATLAS_HOST`, `KETATLAS_HTML_PORT`, and `KETATLAS_PROJECT_DIR`. The sidecar changes relative resolution for registered screens and screen-node URL overrides only; note/external references remain relative to `atlas.json`.

`audit` validates a discovered sidecar without running it. `serve --renderer` explicitly authorizes command execution and starts the framework on `--html-port`.

## Screen

| Field         | Required | Meaning                                                               |
| ------------- | -------- | --------------------------------------------------------------------- |
| `id`          | Yes      | Unique across the atlas.                                              |
| `title`       | Yes      | Human-readable screen name.                                           |
| `url`         | Yes      | Relative or HTTP(S) URL for the actual rendered page.                 |
| `viewport`    | No       | Overrides the atlas viewport. Both dimensions are integers, 160–4096. |
| `description` | No       | Context inherited by its nodes.                                       |
| `badge`       | No       | Small card footer label; defaults to `Preview`.                       |

The declared viewport determines the iframe's actual layout size. Canvas thumbnails preserve its aspect ratio. Opening a screen uses that same layout size and scales the full frame to the available width without side padding.

## Flow

`id` and `title` are required. `group` and `description` are optional. `nodes` must be nonempty. `edges` is required; use `[]` for a single step. `start` defaults to the first node. `ends` defaults to nodes without outgoing edges; set it explicitly when an outcome also has a return path.

Flow IDs are unique across the atlas. Node IDs are local to a flow. IDs use letters, digits, dots, underscores and hyphens, beginning with a letter or digit.

## Node

```json
{
  "id": "retry",
  "screen": "sign-in",
  "title": "Session expired",
  "url": "./screens/sign-in.html?state=expired",
  "column": 1,
  "row": 1
}
```

`id` is required. A node with `screen` references the registry and defaults to type `screen`. Its optional `title`, `description` and `url` override that screen for this occurrence only.

A node without `screen` defaults to `note` and requires a title. Use `type: "external"` to mark a handoff. These nodes show text rather than an iframe; an optional URL becomes an **Open reference** link in the selected-node panel.

`column` defaults to the node's index in the array and `row` to `0`. Both accept integers from 0 to 100. Two nodes cannot share a cell within one flow. Set columns explicitly on branch nodes; this is a deterministic grid, not automatic graph layout.

## Edge

```json
{ "from": "verify", "to": "retry", "label": "Code expired", "kind": "conditional" }
```

`from`, `to` and a nonempty `label` are required. Endpoints reference node IDs in the same flow. `kind` is `primary` (default), `conditional`, or `recovery`. Arrows are orthogonal and labels describe the action or condition.

Cross-flow edges are not part of version 1. Reuse the destination screen in another flow, or add an external/note handoff to explain the boundary. Start and outcome markers express authored intent; clicking them does not invoke a backend operation.

## Delivery progress

Delivery records use the optional sibling `<atlas-name>.progress.json`, with `progress.schema.json` and semantic validation, rather than extra properties in the version 1 workflow. See [Screen progress](progress.md).
