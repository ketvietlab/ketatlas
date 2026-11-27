# Working on KetAtlas

- Keep UI, CLI output, documentation, and code comments in English. User-authored atlas content may use any language.
- Preserve the zero-runtime-dependency CLI and browser viewer. Keep JSON files as the source of truth.
- Consumer atlas folders contain JSON/schema, product screen assets, and docs only. Do not require local package manifests, dependencies, or copied framework/build/test tooling for CLI use.
- Keep the schema, runtime validator, TypeScript declarations, templates, documentation, and `skills/ket-atlas/SKILL.md` aligned when changing the public contract.
- Use the pinned KetJS design system for viewer tokens and primitives. Regenerate vendor assets; do not manually fork their values.
- Test changed behavior with the relevant unit, CLI, or automated browser checks. Inspect browser screenshots in `artifacts/` for UI changes. Do not use manual browser control as test evidence.
- Verify the packed installation when changing distribution, CLI commands, paths, templates, or runtime assets.
- Keep example data synthetic. Do not fetch production services during tests or store credentials in the repository.
- After cutover, a stable version increase merged into protected public `develop` can publish through the approved npm environment. Preserve CI verification and release checks; confirm the release on npm.

- Before the authorized cutover, keep all source work in `ketvietlab/ketatlas-private`; the public repository is documentation-only. After cutover, maintain open-source development in `ketvietlab/ketatlas`. Keep legacy private history and Git refs private. The approved source snapshot is imported as a new public commit, as described in `docs/releasing.md`.
- npm and the public demo ship compiled, minified runtime assets without source maps. Preserve the package source-exclusion checks and zero runtime dependencies.
