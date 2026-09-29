# Create mockups with an agent

Give an agent the KetAtlas skill and a product brief. The agent produces native framework screen routes (or static HTML for a static product) plus `atlas.json`; KetAtlas opens them as an interactive workflow map. The brief describes the product, while the schemas and CLI audit check the output contracts.

## Install the skill once

From the project in which you want to create mockups:

```sh
npx skills add ketvietlab/ketatlas --skill ketatlas
```

Choose your agent when prompted, or target it directly:

```sh
npx skills add ketvietlab/ketatlas --skill ketatlas --agent codex
npx skills add ketvietlab/ketatlas --skill ketatlas --agent claude-code
```

These commands use the separate [open agent skills CLI](https://github.com/vercel-labs/skills). Installation is project-scoped by default. The skill is a single portable [SKILL.md](../skills/ketatlas/SKILL.md), not a new KetAtlas command or a hosted generation service.

If the agent does not support skill installation, attach that file or ask it to read [the skill on GitHub](https://github.com/ketvietlab/ketatlas/blob/develop/skills/ketatlas/SKILL.md) before working. Installing a skill does not require changing the product repository's runtime dependencies.

## Ask for a mockup

For a short request, invoke the skill and include the product, target, design reference, and flows:

```text
Use $ketatlas to create one shared React mobile prototype for Northstar Tasks
in ./tasks/mobile. Use 390 × 844 screens, English product copy, and the design
system in ./design-system. Include sign-in, password recovery, task list,
task details, and task completion. Map entry points, actions, outcomes, and
relevant error/recovery states. Implement the main interactions, then audit
and preview the result. Return the serve command and verification results.
```

`$ketatlas` is the explicit skill invocation in Codex. In other agents, use that agent's skill selector or explicitly ask it to use the installed KetAtlas skill. Keep the same product brief.

The deliverable is a `<name>.ketatlas/` bundle containing JSON/schema, documentation, and either static screen assets or `atlas.renderer.json`. Do not add a package manifest, lockfile, node_modules, or copied viewer/test tooling inside the bundle. Native React/Vue/KetJS/etc. routes reuse the product's existing framework package and shared UI source outside the atlas folder. Use `ketatlas@0.4.0` for this contract. Browser checks can use the agent's existing tooling outside the atlas folder.

The agent should infer routine details and record assumptions. Provide an exact list when “all screens” means a defined inventory, so missing coverage can be checked against a source.

Before it creates or edits visual screens, the skill asks for one design-system choice: Auto (Két Design System), Két Design System, Carbon, GitHub Primer, Microsoft Fluent 2, no design system, or a repository URL/local path. A design system already named in the request counts as the answer. Auto uses [Két Design System](https://github.com/ketvietlab/ketjs/tree/develop/packages/design-system). The agent inspects its actual tokens, components, assets, patterns, and framework, then renders with that framework instead of duplicating markup. An incorrect canonical component is fixed at its source before Atlas work continues.

For several atlases in one workspace, the agent creates or reuses one shared framework module for screen presenters, design-system composition, fixture factories, route helpers, and styles. Individual bundles keep flow/state declarations and namespaced screen paths; they do not copy UI code from one another. Production routes and Atlas fixture routes call the same presenter so the mock and built product do not become two visual sources of truth.

## Use a saved brief for larger projects

Save this template as `mockup-brief.md`, fill in the relevant fields, and ask: **“Use the KetAtlas skill to implement mockup-brief.md.”** The brief stays Markdown; do not add its planning fields to `atlas.json`.

```markdown
# Mockup brief

- Product and audience:
- User goal:
- Output directory:
- Target platforms and viewport sizes:
- Product content language:
- Design system choice (Auto/Két/Carbon/Primer/Fluent 2/none/custom source):
- Existing application/framework and reference files/URLs:
- Requested flows and screen inventory:
- Relevant loading, empty, validation, error, and recovery states:
- Interactions to demonstrate and synthetic demo inputs:
- Scope exclusions and any intentional remote dependencies:

## Expected delivery

Create native framework routes, or static HTML only for a static product,
and one KetAtlas version 1 atlas.json. Reuse shared presenters and styles
across flows and atlases. Set explicit flow starts, outcomes, and labelled
transitions. Each named screen state must open directly.

Use the generated ketatlas.schema.json. Run KetAtlas audit, test the
important interactions in the viewer when browser automation is available,
and report results or limitations. Include a README with run commands,
flow coverage, demo inputs, and assumptions. Keep the atlas bundle free of
package manifests, lockfiles, local dependencies, duplicated component/style
implementations, and copied viewer/test tooling.
```

For an existing prototype, ask the agent to reuse its HTML and add or update the atlas instead of rebuilding it. For later changes, name the flow or screen IDs to preserve, for example: **“Add an expired-code recovery branch to sign-in; keep existing screen IDs and audit the updated project.”**

## Review the result

```sh
npx --yes ketatlas@0.4.0 discover . --json
npx --yes ketatlas@0.4.0 serve ./tasks/mobile.ketatlas --renderer --port 60550 --html-port 60551
npx --yes ketatlas@0.4.0 audit ./tasks/mobile.ketatlas --strict
```

For a genuinely static project, omit `atlas.renderer.json`, `--renderer`, and `--html-port`.

Check the delivered flow coverage against the brief. Open **Try this screen** to test the actual HTML. A successful audit confirms structural and local-file checks, not visual quality, full product coverage, or working production integrations. Intentional remote URLs require separate verification and produce strict-audit warnings.

The skill lives in this repository so teams can review and evolve it alongside the schema and CLI. It also backfills legacy atlas directories into the discoverable bundle pattern before extending them.
