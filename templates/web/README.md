# My KetAtlas project

Run with Node.js 22 or newer:

```sh
npx ketatlas serve atlas.json
npx ketatlas audit atlas.json --strict
```

Edit `atlas.json` to change nodes, edges, and screen URLs. Screen URLs are relative to that file. Refresh the browser after editing. No wrapper HTML or build step is needed.

Edit the HTML files in screens/ to replace the sample product. styles/design-system.css is generated from the pinned KetJS design system; do not manually fork its tokens.

Keep this directory in your own project repository. The schema provides editor completion. See https://github.com/ketvietlab/ketatlas for the full API, CLI, and configuration reference.
