# My KetAtlas project

Run with Node.js 22 or newer:

```sh
npx ketatlas serve atlas.json
npx ketatlas audit atlas.json --strict
```

Edit `atlas.json` to change nodes, edges, and screen URLs. Screen URLs are relative to that file. Refresh the browser after editing. No wrapper HTML, package manifest, lockfile, node_modules, or build step is needed. Alternatively, install the CLI once with npm install --global ketatlas@0.2.0 and use ketatlas serve atlas.json.

This template models a process without HTML screens. Add a screen registry and screen nodes when needed.

Open **Screens** in the viewer to review or edit delivery progress. Saving writes atlas.progress.json beside the workflow; use --read-only to disable editing. You can initialize records with ketatlas progress atlas.json --init. Keep this directory in your own project repository. The schema provides editor completion. See https://github.com/ketvietlab/ketatlas for the full API, CLI, and configuration reference.
