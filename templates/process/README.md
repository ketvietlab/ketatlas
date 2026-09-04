# My KetAtlas project

Run with Node.js 22 or newer:

```sh
npx ketatlas serve atlas.json
npx ketatlas audit atlas.json --strict
```

Edit `atlas.json` to change nodes, edges, and screen URLs. Screen URLs are relative to that file. Refresh the browser after editing. No wrapper HTML, package manifest, lockfile, node_modules, or build step is needed. Alternatively, install the CLI once with npm install --global ketatlas@0.1.1 and use ketatlas serve atlas.json.

This template models a process without HTML screens. Add a screen registry and screen nodes when needed.

Keep this directory in your own project repository. The schema provides editor completion. See https://github.com/ketvietlab/ketatlas for the full API, CLI, and configuration reference.
