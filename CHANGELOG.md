# Changelog

## 0.2.1

- Show compact numeric progress badges beside the project heading and workflow step counts, with status counts, checklist completion and blockers in tooltips.
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
