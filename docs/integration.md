# Integration and API

Use the CLI for a standalone map. Use the JavaScript API when a map belongs inside a documentation portal or another application.

## Plain HTML

Copy the package's `src/`, `styles/`, and `assets/` directories together into a public `vendor/ketatlas/` directory. No build output is required.

```html
<div id="map" style="height: 800px"></div>
<script type="module">
  import { loadAtlas } from "./vendor/ketatlas/src/index.js";
  const atlas = await loadAtlas(document.querySelector("#map"), "./atlas.json");
</script>
```

Serve over HTTP. ES modules and JSON fetch do not support opening the page directly through `file://`. The viewer requires a container with an explicit height (minimum 480px).

## Bundled applications

Install the package and copy `styles/` and `assets/` to the same public directory. For example:

```sh
npm install ketatlas
mkdir -p public/ketatlas
cp -R node_modules/ketatlas/styles node_modules/ketatlas/assets public/ketatlas/
```

Before an npm release, install from the repository or an archive produced by `npm pack`. When JavaScript is bundled, provide `assetBaseURL` because dynamic stylesheet URLs cannot be inferred by every bundler.

React lifecycle example:

```jsx
import { useEffect, useRef } from "react";
import { createAtlas } from "ketatlas";

export function WorkflowMap({ config }) {
  const container = useRef(null);
  useEffect(() => {
    const atlas = createAtlas(container.current, config, {
      baseURL: new URL("/planning/atlas.json", location.href).href,
      assetBaseURL: "/ketatlas/",
    });
    atlas.ready.catch(console.error);
    return () => atlas.destroy();
  }, [config]);
  return <div ref={container} style={{ height: 800 }} />;
}
```

The browser implementation has no React dependency. Instantiate it after mount; do not call `createAtlas` during server-side rendering. Replace a config by destroying and recreating the instance. Input data is cloned before layout and is never mutated.

## Functions

- `createAtlas(container, config, options?)` returns an instance immediately. `await instance.ready` before measuring or navigating it.
- `loadAtlas(container, url, options?)` fetches JSON and resolves to a ready instance. Relative screen URLs resolve against the JSON response URL, including redirects.
- `validateAtlas(unknown)` returns `{ valid, errors, warnings }` without requiring a DOM.
- Invalid configuration throws `AtlasValidationError` during mounting, with an `errors` array containing `{ path, message }` entries.

## Options

| Option             | Default                                    | Purpose                                                                         |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `baseURL`          | Page URL; JSON response URL in `loadAtlas` | Resolve screen and node URLs.                                                   |
| `assetBaseURL`     | Package directory                          | Public directory containing `styles/` and `assets/`; must end in `/`.           |
| `initialFlow`      | First flow                                 | Initial flow ID.                                                                |
| `theme`            | `light`                                    | `light` or `dark`.                                                              |
| `syncUrl`          | `false`                                    | Read/write `flow`/`screen` URL parameters. Enable for only one viewer per page. |
| `maxPreviews`      | `24`                                       | Maximum mounted canvas iframes, from 1 to 64. The open inspector may add one.   |
| `previewThreshold` | `0.3`                                      | Below this zoom, canvas cards use placeholders.                                 |
| `sandbox`          | `allow-scripts allow-forms`                | Space-separated iframe sandbox permissions.                                     |
| `signal`           | None                                       | AbortSignal for the `loadAtlas` JSON request.                                   |

All UI is English. Labels in project data are rendered as text. Shadow DOM keeps viewer CSS and click handling isolated from the host document. Fonts are registered with one document stylesheet per asset URL; the stylesheet is retained for reuse after teardown.

## Instance methods

| Method                      | Behavior                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `goToFlow(id)`              | Select a flow and return to its start. Clears the search.                          |
| `focusNode(flowId, nodeId)` | Select and focus a node.                                                           |
| `openNode(flowId, nodeId)`  | Open a screen's interactive preview; note nodes open their details.                |
| `fit()`                     | Fit the current flow.                                                              |
| `zoomTo(number)`            | Zoom, clamped to 0.18–2.2.                                                         |
| `getState()`                | Snapshot of flow ID, selected node ID, zoom, pan and counts.                       |
| `destroy()`                 | Remove the owned viewer, frames, observers and animation work. Safe to call twice. |

Unknown IDs passed to navigation methods throw `RangeError`. Methods after teardown throw, except `getState()` and `destroy()`.

## Events

Listen on the instance's `element` or its containing element. Events bubble and include a `detail` object.

- `ketatlas:flowchange`: `{ flowId }`.
- `ketatlas:select`: `{ flowId, nodeId }`.
- `ketatlas:previewopen`: `{ flowId, nodeId, screenId }`.
- `ketatlas:viewportchange`: `{ x, y, z }`, emitted during canvas painting.
- `ketatlas:previewerror`: `{ nodeId, url }`, when an iframe reports a load error. Browsers do not reliably report blocked framing or HTTP errors through this event.

These are viewer events. KetAtlas does not inspect or synchronize navigation inside the iframe. Its title remains the screen that was opened; use your own prototype's navigation to continue.

## Embedding behavior

Iframe previews are sandboxed. Scripts and forms work by default, but the page has an opaque origin: authenticated fetch, storage, some module imports, and other same-origin features can require additional permissions. Only add `allow-same-origin` for trusted prototypes. Combining it with scripts on a same-origin page weakens sandbox isolation.

Remote pages can reject framing using CSP or `X-Frame-Options`. KetAtlas cannot override that. Use a permitted embedded route or the **Open in new tab** action. Test links/forms with the default sandbox before sharing a project.

The viewer uses native dialog, Shadow DOM, ResizeObserver, container queries and modern CSS. Chromium is covered by the browser suite. Other modern engines should be qualified against your host application before promising support.

## Progress adapters

`createAtlas` accepts `options.progress`. `loadAtlas` discovers a sibling progress JSON or accepts `progressURL`. Both support `progressRevision`, `saveProgress(screenId, record, revision)` and `reloadProgress()`; adapters return `{data, revision}`. No save adapter means read-only. See [Screen progress](progress.md).
