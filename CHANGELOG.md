# Changelog

## 0.3.0

- Standardize discoverable projects as `<name>.ketatlas/atlas.json` bundles, add `discover`, accept bundle directories in Atlas commands, and teach the bundled skill to backfill legacy projects safely.
- Accelerate drag, wheel, keyboard and pinch camera controls while preserving pointer-anchored zoom.
- Require agents to confirm a design system before visual mockup work, with Auto defaulting to Két Design System and explicit Carbon, Primer, Fluent 2, no-system, and custom-source options.

## 0.2.5

- Show separate Checks and Implemented percentage badges per workflow. Implemented includes Verified screens; project verification remains separate on the top bar. Display a dash for Checks when no checklist is recorded.

## 0.2.4

- Anchor the progress detail header directly inside the modal top border and scroll only the form beneath it.

## 0.2.3

- Keep preview headers and progress footers outside the scrolling content so the footer remains fixed to the frame bottom.

## 0.2.2

- Show screen status, blockers, linked PR states and scoped state checks in preview footers, with direct access to progress details.
- Keep the footer visible when scrolling, refresh it after edits, and support read-only previews.

## 0.2.1

- Show compact numeric progress badges after workflow step counts, with status counts, checklist completion and blockers in tooltips.
- Place project-wide verified/checklist percentages and blockers next to Screens in the top bar.
- Deduplicate reused screens and variants, exclude process-only steps, and update the sidebar after saves, refreshes and flow navigation.

## 0.2.0

- Track delivery per screen in a separate progress JSON, with acceptance checks, blockers, ownership, task references and PR/test/release evidence.
- Review all screens with filters and shared map badges; edit progress using the local viewer or revision-checked CLI.
- Refuse stale writes and unsupported verification claims; keep static hosting read-only and existing version 1 workflows compatible.
- Audit progress references, provide a public schema/API, and test browser editing, concurrency and packaged installation.

## 0.1.1 — 2026-09-04

- Publish the tested archive through an absolute file path; support guarded retries after a CI workflow fix.

- Clarify the consumer contract: JSON, product screens, assets, and docs only; verify global and npx usage without project manifests or dependencies.

- Portable KetAtlas agent skill and a product-brief workflow for generating compatible interactive HTML mockups.
- Automatically publish verified stable version increases from `develop`, with duplicate-release protection and npm provenance.

## 0.1.0 — 2026-09-04

- Standalone `ketatlas scaffold`, `serve <atlas.json>`, `audit`, and `validate` commands.
- Basic, web and screenless process templates with a local configuration schema.
- English HTML viewer with pan, zoom, touch pinch, search, minimap, labelled arrows and interactive previews.
- Mobile and desktop viewport sizes, repeated screen states and process/external nodes.
- Isolated JavaScript embedding API, lifecycle methods, events and TypeScript declarations.
- Canonical KetJS design system with pinned provenance and offline assets.
- Static audits, CLI/server tests, browser evidence and packed-install verification.

Published to [npm](https://www.npmjs.com/package/ketatlas/v/0.1.0).
