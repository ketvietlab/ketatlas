# Integration and API

Use the CLI for a standalone map. Use the JavaScript API when a map belongs inside a documentation portal or another application.

The proprietary license permits running official builds. Redistributing the KetAtlas runtime, including publicly hosting a copied runtime for others, requires separate written permission. The integration instructions below describe the technical setup for authorized deployments.

## Plain HTML

Copy the package's prebuilt `dist/` directory into a public `vendor/ketatlas/` directory. Consumers do not need to build KetAtlas.

```html
<div id="map" style="height: 800px"></div>
<script type="module">
  import { loadAtlas } from "./vendor/ketatlas/dist/index.js";
  const atlas = await loadAtlas(document.querySelector("#map"), "./atlas.json");
</script>
```

Serve over HTTP. ES modules and JSON fetch do not support opening the page directly through `file://`. The viewer requires a container with an explicit height (minimum 480px).

## Bundled applications

Install the package and copy `dist/styles/` and `dist/assets/` to the same public directory. For example:

```sh
npm install ketatlas
mkdir -p public/ketatlas
cp -R node_modules/ketatlas/dist/styles node_modules/ketatlas/dist/assets public/ketatlas/
```

Install a published version from npm. When JavaScript is bundled, provide `assetBaseURL` because dynamic stylesheet URLs cannot be inferred by every bundler.

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

| Option              | Default                                    | Purpose                                                                          |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `baseURL`           | Page URL; JSON response URL in `loadAtlas` | Resolve screen and node URLs.                                                    |
| `screenBaseURL`     | `baseURL`                                  | Resolve registered screens and screen-node URL overrides on another origin.      |
| `assetBaseURL`      | Built `dist/` directory                    | Public directory containing `styles/` and `assets/`; must end in `/`.            |
| `initialFlow`       | First flow                                 | Initial flow ID.                                                                 |
| `theme`             | `light`                                    | `light` or `dark`.                                                               |
| `syncTheme`         | `false`                                    | Forward the viewer theme to compatible embedded screens.                         |
| `syncUrl`           | `false`                                    | Read/write `flow`/`screen` URL parameters. Enable for only one viewer per page.  |
| `preloadScreens`    | `true`                                     | Preload the selected flow and reuse cached previews.                             |
| `maxCachedPreviews` | `24`                                       | Maximum mounted viewer-owned frames, from 3 to 128, including dialogs.           |
| `maxPreviews`       | `24`                                       | Maximum visible canvas iframes, from 1 to 64; also bounded by the session cache. |
| `previewThreshold`  | `0.3`                                      | Below this zoom, canvas cards use placeholders.                                  |
| `sandbox`           | `allow-scripts allow-forms`                | Space-separated iframe sandbox permissions.                                      |
| `signal`            | None                                       | AbortSignal for the `loadAtlas` JSON request.                                    |

All UI is English. Labels in project data are rendered as text. Shadow DOM keeps viewer CSS and click handling isolated from the host document. Fonts are registered with one document stylesheet per asset URL; the stylesheet is retained for reuse after teardown.

## Instance methods

| Method                        | Behavior                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `goToFlow(id)`                | Select a flow and return to its start. Clears the search.                          |
| `focusNode(flowId, nodeId)`   | Select and focus a node.                                                           |
| `openNode(flowId, nodeId)`    | Open a screen's interactive preview; note nodes open their details.                |
| `fit()`                       | Fit the current flow.                                                              |
| `zoomTo(number)`              | Zoom, clamped to 0.18–2.2.                                                         |
| `setTheme("light" \| "dark")` | Update the viewer and any synchronized previews without reloading them.            |
| `setThemeSync(boolean)`       | Enable screen synchronization or restore each screen's original theme.             |
| `getState()`                  | Snapshot of flow ID, selected node ID, zoom, pan and counts.                       |
| `destroy()`                   | Remove the owned viewer, frames, observers and animation work. Safe to call twice. |

Unknown IDs passed to navigation methods throw `RangeError`. Methods after teardown throw, except `getState()` and `destroy()`.

## Events

Listen on the instance's `element` or its containing element. Events bubble and include a `detail` object.

- `ketatlas:themechange`: `{ theme: "light" | "dark", syncTheme: boolean }`.
- `ketatlas:flowchange`: `{ flowId }`.
- `ketatlas:select`: `{ flowId, nodeId }`.
- `ketatlas:previewopen`: `{ flowId, nodeId, screenId }`.
- `ketatlas:viewportchange`: `{ x, y, z }`, emitted during canvas painting.
- `ketatlas:previewerror`: `{ nodeId, url }`, when an iframe reports a load error. Browsers do not reliably report blocked framing or HTTP errors through this event.

These are viewer events. KetAtlas does not inspect or synchronize navigation inside the iframe. Its title remains the screen that was opened; use your own prototype's navigation to continue.

## Embedding behavior

### Flow preload and session cache

`serve --cache-size 24` sets the cache limit (default 24, range 3–128). It cannot be combined with `--no-preload` and does not modify atlas JSON. This flag is not supported by npm 0.5.0.

The viewer preloads only the selected flow, starting with the initial flow after workspace styles are ready. Selecting another flow queues its screen nodes and URL variants; unselected flows and unused registered screens are not loaded. Panning into another flow also selects it. Pending loads from the previous flow are cancelled. A single document loads at a time to reduce startup spikes. Interactive dialog frames are created only when opened and reused by URL and viewport size.

`maxCachedPreviews` defaults to 24 mounted viewer-owned iframes, including dialogs. Hidden frames are evicted in least-recently-used order when the cache fills. Visible canvas frames and the open dialog are protected; at most `min(maxPreviews, maxCachedPreviews - 2)` canvas frames are visible, reserving capacity for background loading and a dialog. Large flows still load sequentially, but their older hidden frames may be evicted before the flow finishes. Returning to an evicted frame reloads it and resets its local form/navigation state. Reopening a retained frame preserves state. Nested iframes created by product mocks are outside this limit, and frame count is not a byte-level memory budget.

`preloadScreens: false` disables flow preloading and the retained cache: only visible canvas frames (up to `maxPreviews`, default 24) and one open dialog are mounted; offscreen and closed frames are discarded. The CLI forwards `--no-preload` to this option; `--preload` explicitly enables the default flow mode. Neither flag preloads the entire atlas. These flags and the flow cache require 0.5.1 or newer; npm 0.5.0 still preloads the entire atlas and only offers the opt-out through the browser API.

`instance.ready` means workspace layout is ready. Read and await `instance.previewsReady` after each flow selection to wait for the currently queued load attempts. `getState().preload` and `ketatlas:preloadprogress` expose cumulative `{ total, loaded, failed, pending }` attempt counts, not current cache occupancy; cancelled pending attempts are removed from the totals. A load error or 30-second timeout advances the queue. Failed dialog previews retry when opened. Destroying a viewer cancels its queue and settles readiness. A frame's load event does not guarantee successful HTTP status or completion of later framework data requests.

This is an in-memory session cache, not an offline download. Browser HTTP caching may reuse resources after eviction, but JavaScript executes again. Refresh to pick up edited content and reset retained screen state. Theme synchronization applies when each new frame loads and to retained frames. These are viewer options, not new atlas JSON fields.

The local server also has [HTTP revalidation support since 0.5.2](cli.md#http-resource-cache): file responses include a content-hash ETag, and unchanged GET/HEAD requests can return a bodyless 304. This reduces repeat transfers when an evicted frame is recreated, but does not restore its JavaScript state or refresh a still-mounted frame. The generated viewer and progress API use `no-store`; separate framework renderer origins own their cache policy. There is no offline cache or persistent iframe snapshot.

### Workspace and screen themes

Availability: workspace theme controls and screen synchronization require KetAtlas 0.5.0 or newer. Version 0.4.2 does not include these controls or APIs. Upgrade the viewer before using `syncTheme`, `setTheme`, or `setThemeSync`.

The sidebar's **Appearance** controls switch between Light and Dark. **Sync screen theme** is off by default, preserving the product's own appearance. `getState()` includes `theme` and `syncTheme`. Theme preferences belong to each viewer instance and reset to its options on remount; they are not written into atlas JSON or global storage.

When synchronization is on, KetAtlas applies `data-theme` and CSS `color-scheme` to accessible same-origin iframe documents. It also sends `{ type: "ketatlas:theme", theme: "light" | "dark" | null }` to every preview, including the interactive dialog, on load and on changes. `null` restores the screen's original appearance when synchronization is turned off. Frames are not reloaded, and their URL, form values and navigation state are preserved.

Sandboxed screens (the default) and separate renderer origins need an opt-in bridge. The static templates and examples include this bridge. Add the following once in a custom screen's HTML head, or adapt its theme assignment to your React/Vue/KetJS theme provider:

```js
const root = document.documentElement;
const original = {
  theme: root.getAttribute("data-theme"),
  scheme: root.style.colorScheme,
};
window.addEventListener("message", (event) => {
  const message = event.data;
  if (event.source !== window.parent || message?.type !== "ketatlas:theme") return;
  if (!["light", "dark", null].includes(message.theme)) return;
  const theme = message.theme ?? original.theme;
  if (theme === null) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  root.style.colorScheme = message.theme ?? original.scheme;
});
if (window.parent !== window) window.parent.postMessage({ type: "ketatlas:theme-ready" }, "*");
```

The ready message also supports framework presenters that mount after iframe load. The viewer only responds to its own iframe windows. Messages contain appearance preferences only; `"*"` supports opaque sandbox origins. Do not send credentials through this channel or relax sandbox permissions to make themes work. Content must provide its own light/dark CSS; KetAtlas does not invert colors, override product styles, or force unsupported third-party pages into dark mode.

### Sandbox and runtime

Iframe previews are sandboxed. Scripts and forms work by default, but a static page has an opaque origin: authenticated fetch, storage, some module imports, and other same-origin features can require additional permissions. Only add `allow-same-origin` for trusted prototypes. Combining it with scripts on a same-origin page weakens sandbox isolation.

The CLI's native renderer mode uses `screenBaseURL` and adds `allow-same-origin` automatically. Its HTML server is a separate loopback origin from the viewer, so framework routes can use native modules and same-origin resources without gaining same-origin access to the viewer/control page.

Remote pages can reject framing using CSP or `X-Frame-Options`. KetAtlas cannot override that. Use a permitted embedded route or the **Open in new tab** action. Test links/forms with the default sandbox before sharing a project.

The viewer uses native dialog, Shadow DOM, ResizeObserver, container queries and modern CSS. Chromium is covered by the browser suite. Other modern engines should be qualified against your host application before promising support.

## Progress adapters

`createAtlas` accepts `options.progress`. `loadAtlas` discovers a sibling progress JSON or accepts `progressURL`. Both support `progressRevision`, `saveProgress(screenId, record, revision)` and `reloadProgress()`; adapters return `{data, revision}`. No save adapter means read-only. See [Screen progress](progress.md).
