# Working on KetAtlas

- Keep UI, CLI output, documentation, and code comments in English. User-authored atlas content may use any language.
- Preserve the zero-runtime-dependency CLI and browser viewer. Keep JSON files as the source of truth.
- Keep the schema, runtime validator, TypeScript declarations, templates, and documentation aligned when changing the public contract.
- Use the pinned KetJS design system for viewer tokens and primitives. Regenerate vendor assets; do not manually fork their values.
- Test changed behavior with the relevant unit, CLI, or automated browser checks. Inspect browser screenshots in `artifacts/` for UI changes. Do not use manual browser control as test evidence.
- Verify the packed installation when changing distribution, CLI commands, paths, templates, or runtime assets.
- Keep example data synthetic. Do not fetch production services during tests or store credentials in the repository.
- Publishing to npm is a separate maintainer action; do not imply a release exists just because the source version changed.
