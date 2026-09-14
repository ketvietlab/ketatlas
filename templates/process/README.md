# My KetAtlas project

This directory must keep its `.ketatlas` suffix. Run with Node.js 22 or newer:

```sh
npx --yes ketatlas@0.4.0 serve .
npx --yes ketatlas@0.4.0 audit . --strict
```

This starter is intentionally static. Edit `atlas.json` to change nodes, edges, and screen URLs. Screen URLs are relative to that file. Refresh the browser after editing. No wrapper HTML, package manifest, lockfile, node_modules, or build step is needed. For React, Vue, KetJS, or another framework, use atlas.renderer.json and shared framework presenters instead of copying this static implementation.

This template models a process without HTML screens. Add a screen registry and screen nodes when needed.

Open **Screens** in the viewer to review or edit delivery progress. Saving writes atlas.progress.json beside the workflow; use --read-only to disable editing. You can initialize records with npx --yes ketatlas@0.4.0 progress . --init. Keep this directory in your own project repository. The schema provides editor completion. See https://github.com/ketvietlab/ketatlas for the full API, CLI, and configuration reference.
