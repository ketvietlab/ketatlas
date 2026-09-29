# CLI reference

Install once with `npm install --global ketatlas`, or prefix commands with `npx --yes ketatlas`. No dependency installation is required in the consumer directory. `node /path/to/ketatlas/bin/ketatlas.js` is also available to framework maintainers.

A consumer keeps its JSON/schema, documentation, and either static product assets or a native renderer sidecar. KetAtlas package files and browser test dependencies belong to the tool; framework package files remain in the product workspace. Normal `serve`, `validate`, and `audit` calls do not create files in the consumer; `audit --output` is an explicit exception.

## Scaffold

```sh
ketatlas scaffold ./journeys.ketatlas
ketatlas scaffold ./approvals.ketatlas --template web
ketatlas scaffold ./operations.ketatlas --template process
```

`basic` is the default: two interactive mobile pages and one flow. `web` contains desktop purchase approval pages. `process` contains notes and an external handoff, without HTML screens. Every template includes a local JSON Schema for editor completion and a README. Product HTML and its styles belong to the new project.

`init` is an alias for `scaffold`. The destination must end in `.ketatlas` and be missing or empty. Existing files are never overwritten; there is no `--force` flag.

## Discover bundles

```sh
ketatlas discover .
ketatlas discover . --json
```

Discovery walks the selected workspace for exact `*.ketatlas/atlas.json` bundles. It skips dependency, generated, cache, Git and vendor directories; it does not parse unrelated JSON. The JSON report contains `version`, `root`, `atlases`, and `errors`, including each atlas title, path, directory, screens and flow count. Invalid bundle manifests are reported and produce exit code 1.

Legacy manifest paths remain valid command arguments, but discovery intentionally ignores them. Migrate a self-contained legacy directory by renaming it to `<name>.ketatlas`; see the bundled skill for mixed-directory migration safeguards.

## Serve a JSON file

```sh
ketatlas serve ./tasks/onboarding.ketatlas
ketatlas serve ./tasks/onboarding.ketatlas --port 4180
ketatlas serve ./tasks/onboarding.ketatlas --no-preload
ketatlas serve ./tasks/onboarding.ketatlas --renderer --port 60550 --html-port 60551
ketatlas serve ./legacy/atlas.json --root .
```

The tool supplies the viewer page. It validates the JSON at startup, serves your files, and mounts the atlas at `/`. Passing a `.ketatlas` directory resolves its `atlas.json` and uses the bundle as the file root. Explicit legacy JSON paths still support `--root` when a relative URL points outside the manifest directory.

**Since 0.5.1:** `--preload` explicitly enables the default selected-flow preload and a bounded session cache (24 viewer-owned frames). Selecting another flow loads that flow; unvisited flows are not preloaded. Dialogs load when opened. Cached frames preserve state until evicted; evicted frames reload when needed. Product-owned nested iframes are outside the viewer's frame limit.

`serve --cache-size 24` sets the cache limit (default 24, range 3–128). It cannot be combined with `--no-preload` and does not modify atlas JSON. This flag is not supported by npm 0.5.0.

`--no-preload` loads only visible canvas screens and the interactive preview you open. It discards offscreen/closed frames, resetting their local form/navigation state. Both flags work with static and `--renderer` atlas modes; they are mutually exclusive and do not apply to plain static directories. The CLI prints the selected mode. Neither flag writes settings into the bundle.

KetAtlas 0.5.0 does not recognize these flags and still preloads the entire atlas. Check `ketatlas serve --help`; its browser API already supports `preloadScreens: false`. See the [integration guide](integration.md#flow-preload-and-session-cache) for cache limits and readiness semantics.

Open the printed localhost URL. Changes appear after refreshing; there is no hot reload or authoring server state. Use `?flow=your-flow-id` or `?screen=your-screen-id` to open a specific part of the map. An unknown ID falls back to the first flow.

The `/__ketatlas__/` route is reserved for viewer assets. Dotfiles and paths resolving outside the file root, including symlink escapes, are not served. Only GET/HEAD are supported. The server binds to `127.0.0.1`; it is a local preview server, not a production application server.

### HTTP resource cache

The local static server sends a content-based SHA-256 `ETag` and `Cache-Control: private, no-cache` for files, including mock HTML, JSON, scripts, styles, images, fonts, and viewer runtime assets. Browsers may store those responses in their HTTP cache, but must revalidate before reuse. A matching `If-None-Match` on GET or HEAD returns `304 Not Modified` with no response body. Changed bytes produce a new ETag and a full `200` response, even if the filename, size, and modification time stay the same. No new CLI flags or bundle files are required.

The generated viewer page, progress API, and error responses use `no-store`. Separate framework servers started with `--renderer` control caching for their own screen origin; KetAtlas does not override their headers. HTTP revalidation requires KetAtlas 0.5.2 or newer.

This is separate from the 24-frame session cache. Retained iframes do not request their documents again until reloaded; refresh the atlas after editing mock content. The server reads and hashes each requested file, keeping its bytes only for the response, rather than keeping an asset cache in server RAM. Browser storage, eviction, and RAM-versus-disk placement remain browser-managed. This does not provide offline operation or preserve JavaScript/form state after iframe eviction.

### Native renderer mode

`--renderer` reads `atlas.renderer.json` beside the manifest and executes its command array without a shell. This is opt-in because the project controls the command. The renderer gets `KETATLAS_HOST`, `KETATLAS_HTML_PORT`, and `KETATLAS_PROJECT_DIR`; command arguments can also use `{host}`, `{port}`, and `{atlasDirectory}` placeholders.

`--port` selects the viewer/control origin. `--html-port` selects the separate framework renderer origin and defaults to the following port. The ports must differ. KetAtlas waits for the configured `readyPath`, resolves relative screen URLs beneath `screenBasePath`, prints both origins, and terminates the renderer when the viewer receives SIGINT or SIGTERM.

The second origin lets trusted React/Vue/KetJS routes load their own modules, styles, assets, and same-origin requests while remaining isolated from the viewer origin. A shared product renderer can serve namespaced routes for several atlas bundles so they reuse the same presenters and styles.

`serve <directory>` also works as a plain static preview for an existing HTML integration. JSON mode is recommended for project planning.

## Audit

```sh
ketatlas audit ./tasks/onboarding.ketatlas
ketatlas audit ./tasks/onboarding.ketatlas --strict
ketatlas audit ./tasks/onboarding.ketatlas --json
ketatlas audit ./tasks/onboarding.ketatlas --json --output audit-report.json
```

Audit checks:

- Required fields, types, version, valid IDs and unknown properties.
- Duplicate IDs, missing screen references, invalid edge endpoints, start/end references, and grid collisions.
- Nodes unreachable from the chosen start, reported as warnings. Cycles and recovery paths are allowed.
- Local screen files and node URL overrides, using the same root boundary as the server.
- Literal resource references in HTML (`src`/`href`), links between HTML pages, and CSS imports/URLs.
- A viewport meta tag in HTML previews.
- A colocated native renderer contract when present. Its screen paths are treated as framework routes rather than local files.

Remote URLs are reported but not fetched. Audit does not execute renderer commands or JavaScript, discover dynamic imports/URLs, validate remote CSP or `X-Frame-Options`, simulate user actions, or verify backend/native behavior. Use the two-port preview and your project's browser tests for those checks.

Exit codes:

| Code | Meaning                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| `0`  | Passed; warnings are allowed unless `--strict` is present.                      |
| `1`  | Invalid input, missing resources, command failure, or warnings with `--strict`. |

`--json` writes a machine-readable report to stdout. `--output` additionally writes the report to a new file and refuses to overwrite an existing one. The report has `valid`, `summary`, `errors`, `warnings`, `file`, `root`, and `scope`. `valid` reflects errors; with `--strict`, also check the exit code or warnings array.

## Validate and version

```sh
ketatlas validate ./tasks/onboarding.ketatlas
ketatlas --version
ketatlas --help
```

`validate` checks configuration and graph references only. It is also available as `validateAtlas(data)` in JavaScript. JSON Schema supports editor completion; graph-reference and URL safety checks belong to the runtime validator and audit.

## Screen progress

`progress <bundle|atlas.json> --json` reads the progress record, content revision and unique-screen summary. `--init` creates a missing sidecar. `--set <screen-id> --record <record.json> --expect <revision>` replaces one record with conflict detection. `serve <bundle|atlas.json> --read-only` disables local progress writes. See [Screen progress](progress.md) for examples and persistence rules.
