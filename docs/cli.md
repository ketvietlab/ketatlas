# CLI reference

Install once with `npm install --global ketatlas@0.1.1`, or prefix commands with `npx --yes ketatlas@0.1.1`. No dependency installation is required in the consumer directory. `node /path/to/ketatlas/bin/ketatlas.js` is also available to framework maintainers.

A consumer keeps only its JSON/schema, product HTML/CSS/JavaScript, assets, and documentation. The package manifest, lockfile, development scripts, and browser test dependencies belong to the tool. Normal `serve`, `validate`, and `audit` calls do not create files in the consumer; `audit --output` is an explicit exception.

## Scaffold

```sh
ketatlas scaffold ./journeys
ketatlas scaffold ./approvals --template web
ketatlas scaffold ./operations --template process
```

`basic` is the default: two interactive mobile pages and one flow. `web` contains desktop purchase approval pages. `process` contains notes and an external handoff, without HTML screens. Every template includes a local JSON Schema for editor completion and a README. Product HTML and its styles belong to the new project.

`init` is an alias for `scaffold`. The destination must be missing or empty. Existing files are never overwritten; there is no `--force` flag.

## Serve a JSON file

```sh
ketatlas serve ./tasks/onboarding/atlas.json
ketatlas serve ./tasks/onboarding/atlas.json --port 4180
ketatlas serve ./tasks/onboarding/atlas.json --root .
```

The tool supplies the viewer page. It validates the JSON at startup, serves your files, and mounts the atlas at `/`. The default file root is the JSON file's directory. Choose `--root` when a relative URL points to a sibling directory outside that default root. The JSON must be inside the selected root.

Open the printed localhost URL. Changes appear after refreshing; there is no hot reload or authoring server state. Use `?flow=your-flow-id` or `?screen=your-screen-id` to open a specific part of the map. An unknown ID falls back to the first flow.

The `/__ketatlas__/` route is reserved for viewer assets. Dotfiles and paths resolving outside the file root, including symlink escapes, are not served. Only GET/HEAD are supported. The server binds to `127.0.0.1`; it is a local preview server, not a production application server.

`serve <directory>` also works as a plain static preview for an existing HTML integration. JSON mode is recommended for project planning.

## Audit

```sh
ketatlas audit ./atlas.json
ketatlas audit ./atlas.json --root .. --strict
ketatlas audit ./atlas.json --json
ketatlas audit ./atlas.json --json --output audit-report.json
```

Audit checks:

- Required fields, types, version, valid IDs and unknown properties.
- Duplicate IDs, missing screen references, invalid edge endpoints, start/end references, and grid collisions.
- Nodes unreachable from the chosen start, reported as warnings. Cycles and recovery paths are allowed.
- Local screen files and node URL overrides, using the same root boundary as the server.
- Literal resource references in HTML (`src`/`href`), links between HTML pages, and CSS imports/URLs.
- A viewport meta tag in HTML previews.

Remote URLs are reported but not fetched. Audit does not execute JavaScript, discover dynamic imports/URLs, validate remote CSP or `X-Frame-Options`, simulate user actions, or verify backend/native behavior. Use your project's browser tests for those checks.

Exit codes:

| Code | Meaning                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| `0`  | Passed; warnings are allowed unless `--strict` is present.                      |
| `1`  | Invalid input, missing resources, command failure, or warnings with `--strict`. |

`--json` writes a machine-readable report to stdout. `--output` additionally writes the report to a new file and refuses to overwrite an existing one. The report has `valid`, `summary`, `errors`, `warnings`, `file`, `root`, and `scope`. `valid` reflects errors; with `--strict`, also check the exit code or warnings array.

## Validate and version

```sh
ketatlas validate ./atlas.json
ketatlas --version
ketatlas --help
```

`validate` checks configuration and graph references only. It is also available as `validateAtlas(data)` in JavaScript. JSON Schema supports editor completion; graph-reference and URL safety checks belong to the runtime validator and audit.
