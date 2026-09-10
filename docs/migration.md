# Migrating the KétSuite mobile map

## Bundle layout backfill

Current projects use `<name>.ketatlas/atlas.json`. For a legacy self-contained Atlas directory, rename the whole directory so relative screen, style and asset URLs remain unchanged. When `atlas.json` shares a directory with unrelated application code, create a sibling `<name>.ketatlas` bundle, move only Atlas-owned files, and update relative URLs for resources that intentionally remain outside it. Keep one canonical manifest, then run `ketatlas discover <workspace> --json`, `ketatlas validate <name>.ketatlas`, and `ketatlas audit <name>.ketatlas --strict`.

The CLI continues to accept a direct legacy JSON path so migration can be audited before and after the move. Discovery intentionally reports only the standard bundle pattern.

The original mobile map remains in its project. KetAtlas does not copy its business data or change the mobile repository. The extraction generalizes the viewer; project migration is a separate configuration change.

## Field mapping

| Original mobile reference                  | KetAtlas                                         |
| ------------------------------------------ | ------------------------------------------------ |
| `window.MOBILE_SCREENS`                    | `screens` array in `atlas.json`.                 |
| `screen.label`                             | `screen.title`.                                  |
| `index.html?screen=ID&state=STATE&embed=1` | Explicit `screen.url` or node `url` override.    |
| `screen.sourceStatus`                      | Optional `screen.badge`, e.g. `DOC` or `TARGET`. |
| `window.MOBILE_FLOWS`                      | `flows` array.                                   |
| `node.key`                                 | `node.id` (string).                              |
| `node.screenId`                            | `node.screen`.                                   |
| `node.col` / `node.row`                    | `node.column` / `node.row`.                      |
| `node.caption`                             | `node.title`.                                    |
| `node.kind: "external"`                    | `node.type: "external"`.                         |
| `flow.end`                                 | `flow.ends`.                                     |
| `edge.tone: "main"`                        | `edge.kind: "primary"`.                          |
| `edge.tone: "branch"`                      | `edge.kind: "conditional"`.                      |
| `edge.tone: "recovery"`                    | `edge.kind: "recovery"`.                         |

Keep the existing screen IDs. Give repeated states unique node IDs, but reuse the screen reference. Materialize the old `state` field into the preview URL rather than teaching the framework about mobile-specific states.

## Migration sequence

1. Export the screen and flow registries into the version 1 JSON contract above.
2. Keep existing HTML screens in the mobile project. Set relative URLs against the new JSON location and use the clean `embed=1` route.
3. Set the default viewport to 390 × 844. Keep DOC/TARGET source labels if useful to reviewers.
4. Run `ketatlas audit atlas.json --root <project-root>` and resolve diagnostics.
5. Run `ketatlas serve atlas.json --root <project-root>` and compare the existing 22 journeys, 108 screen IDs, and 162 edges against the exported graph.
6. Recheck product interactions with external browser tooling under the default iframe sandbox; use portable HTML rather than weakening the sandbox.
7. Remove the old viewer tooling, package manifest, lockfile, and local build/test dependencies from the atlas folder. Keep screen HTML/CSS/JavaScript and its assets. Use global or version-pinned npx commands for serving and auditing. Record any earlier browser reports as historical evidence rather than requiring the old harness to run the map.

KetAtlas UI is English. Vietnamese business labels inside the project's configuration and HTML can remain Vietnamese.
