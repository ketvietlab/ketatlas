# Screen progress

Open **Screens** to review delivery across the project. Counts use unique screen IDs, not repeated workflow nodes. Filter by status, workflow, blocker, or search names, IDs, tasks and owners. **View in map** focuses a screen; **Screen progress** opens its record from the node inspector. Mockup badges remain separate from implementation status.

Screen and state preview footers show the shared screen status, blockers and linked PRs with their recorded states. **Progress details** opens the same screen record. State-specific acceptance counts appear only when checks explicitly reference the previewed workflow/node; the shared screen status is not a separate claim that a state has been verified. Missing evidence displays **No linked PRs**. The footer stays visible while scrolling and updates after a save.

## Sidebar and project completion

Project-wide verified/checklist percentages and blocker counts appear in the top bar beside **Screens**. The sidebar shows one compact numeric badge after each workflow’s step count (`2 steps [30%]`). **Verified %** is the number of Verified screens divided by the total unique screens in that scope. Repeated nodes and error variants count once; note/external nodes do not count. Screenless flows have no badge. Percentages round down so unfinished work cannot appear as 100%.

The badge tooltip and accessible label include status counts, blockers and **Checks %**, which counts completed recorded acceptance checks over all recorded checks, with an explicit unscoped-screen count when checklists are missing. This is not an estimate of effort, and 100% of a partial checklist does not make a screen Verified. Saving or refreshing progress updates the sidebar; changing or searching workflows preserves the current progress.

## Status and scope

| Status      | Meaning                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| Unassessed  | Implementation has not been compared with the intended screen scope.                          |
| Planned     | Scope is known; implementation has not started.                                               |
| In progress | Some work exists, but required implementation is incomplete.                                  |
| In review   | Required changes are in review.                                                               |
| Implemented | Required code is merged; full acceptance verification is outstanding.                         |
| Verified    | Every recorded acceptance check has passed test evidence at a named revision and environment. |

A blocker is independent of status: record the reason and next action. A merged PR does not automatically change the screen's status. A release or pin is separate evidence; neither proves that an environment was deployed or a user journey passed. Counts do not invent a completion percentage.

Acceptance checks have stable IDs, a title, a done flag and evidence references. Completed checks require evidence. Verified additionally requires **each** check to reference a `test` with `state: "passed"`, a nonempty `revision` and `environment`, and no blocker. This is a validation rule for authored claims, not an independent test execution service. Scope the checklist honestly; omitted requirements cannot be verified by the viewer.

A check may identify particular states using `nodes: [{ "flowId": "sign-in", "nodeId": "invalid" }]`. Every referenced node must belong to that screen. The editor displays these state references and preserves them; authors and agents manage the references in JSON. Screens reused across flows share one record.

## Files and persistence

For `atlas.json`, progress lives in **atlas.progress.json** next to it. For `journey.json`, use `journey.progress.json`. Format version 1 of the workflow remains unchanged. Existing viewers still open the workflow JSON. Missing progress means Unassessed and does not create a file merely by viewing the project.

`progress.schema.json` ships with the package and templates. `validateProgress` adds semantic checks for references, safe evidence URLs, timestamps and verification requirements. `audit` validates a present sidecar without fetching evidence URLs or executing tests. Git records history; keep progress alongside the atlas in the same project repository.

```json
{
  "version": 1,
  "screens": {
    "sign-in": {
      "status": "in_progress",
      "owner": "Frontend team",
      "tasks": ["AUTH-12"],
      "summary": "Sign-in is implemented; expired-link recovery still needs work.",
      "checks": [
        {
          "id": "submit",
          "title": "Sign in with valid credentials",
          "done": true,
          "evidenceIds": ["pr-12"]
        },
        { "id": "recovery", "title": "Recover from an expired link", "done": false }
      ],
      "evidence": [
        {
          "id": "pr-12",
          "kind": "pr",
          "title": "Sign-in implementation",
          "url": "https://example.test/pull/12",
          "state": "merged",
          "revision": "abc123"
        }
      ]
    }
  }
}
```

Evidence kinds are `pr`, `test`, `release`, `reference`. Required fields: `id`, `kind`, `title`, `url`. Optional fields: `state`, `revision`, `environment`, `observedAt`. Screen records also support `updatedAt`, `blocker`, `owner`, `summary`, `tasks`, `checks`, `evidence`; only `status` is required.

## Editing locally and from agents

```sh
npx --yes ketatlas@0.2.4 serve atlas.json
npx --yes ketatlas@0.2.4 serve atlas.json --read-only
npx --yes ketatlas@0.2.4 progress atlas.json --init
npx --yes ketatlas@0.2.4 progress atlas.json --json
npx --yes ketatlas@0.2.4 progress atlas.json --set sign-in --record record.json --expect REVISION_FROM_READ
```

`--init` explicitly creates Unassessed records and refuses an existing progress file. `--set` replaces one complete screen record; preserve existing checklist IDs, evidence and state references. Read the revision with `--json` first. Do not retry a stale revision by blindly substituting a new one: reload and reconcile changes. `updatedAt` is stamped on successful record writes.

The UI and CLI use the same validated, atomic file writer and exclusive lock. Two writers cannot silently overwrite each other. A stale browser save keeps its draft visible; reload the latest record before reconciling. If a process is forcibly killed while holding the lock, inspect that no writer is running before removing the sibling `.lock` file. Direct file edits are supported, but agents should prefer the CLI for coordinated writes.

Only the local CLI editor offers save controls. It uses a per-server write token, same-origin JSON requests, bounded request bodies, and a fixed sidecar path. Screen iframes retain their sandbox and cannot use the write capability. `--read-only` refuses writes. Viewing or auditing alone never writes. Static hosting discovers the sidecar and displays it read-only; no database or runtime dependency is needed.

## Embedding

`createAtlas(container, config, { progress })` accepts in-memory progress. `loadAtlas` discovers the sibling sidecar unless `progress` or `progressURL` is supplied. Missing (404) is optional; invalid JSON, failed requests and malformed records surface errors rather than masquerading as unassessed data.

Hosts may provide `progressRevision`, `saveProgress(screenId, record, revision)` and `reloadProgress()` adapters. Both return `{ data, revision }`. The local CLI supplies these through its protected endpoint. Public helpers `validateProgress`, `summarizeProgress` and `progressStatuses` have no DOM dependency.
