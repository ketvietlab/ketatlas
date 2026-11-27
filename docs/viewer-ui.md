# Viewer workspace UI

KetAtlas is a spatial review workspace for authors, implementers and reviewers.
The canvas and authored screen viewports have priority over editor chrome. Workflow
navigation uses the roomier 0.5.2 sidebar. This does not change the JSON contract.

The viewer deliberately owns a smaller editor control recipe than the pinned
design system's general application controls. Generated vendor assets remain
unchanged. Colors, Inter, Lucide and semantic states still come from those assets;
`styles/ketatlas.css` owns the editor's geometry.

| Element                   | Desktop, at least 768px          | Below 768px                                   |
| ------------------------- | -------------------------------- | --------------------------------------------- |
| Project header            | 40px                             | 52px, one row                                 |
| Workflow search           | Below heading, 34px              | Drawer input, 40px                            |
| Workflow rail             | 256px                            | 256px drawer, limited to 85% of the workspace |
| Workflow context          | Removed                          | Removed                                       |
| Action                    | 28px, 12px label                 | 32px                                          |
| Icon control              | 28px, 16px icon                  | 44px target                                   |
| Workflow row              | 56px minimum, grows for metadata | 56px minimum                                  |
| Canvas toolbar            | 34px                             | 50px                                          |
| Status strip              | 24px                             | 24px                                          |
| Workflow title / metadata | 12px / 11px                      | Same; search input is 16px                    |

Dimensions are expressed through the pinned spacing tokens, except the documented
256px workflow rail. Theme changes never alter geometry. Long workflow and screen
titles use ellipsis with full-value tooltips; the workflow description remains
available as the canvas region description for assistive technology. Metadata can wrap.

Workflow navigation restores the 0.5.2 heading, count, ordinal numbers, search,
and roomier rows. The compact theme toggle and Sync switch from 0.6.0 remain in
the one-row footer. The start command remains in the canvas toolbar with the 0 shortcut.

Selection has an accent border and `aria-current`. Filtered-empty workflows
provide **Clear search**, which restores results and focuses the search field.
The sidebar starts with a Workflows heading and count, followed by search and
workflow groups. The topbar has
no search input or search icon. Opening the mobile workflow drawer focuses search;
Escape returns focus to the drawer opener. Choosing a result focuses
the canvas on mobile and the selected workflow on desktop. Clicking outside or
crossing the desktop boundary also closes the drawer. Progress dialogs retain drafts on errors, existing read-only
behavior, server validation and optimistic concurrency.

## Verification

`tests/fixtures/compact-workspace.html` runs assertions in the actual viewer and
reports structured results in `window.compactWorkspaceResult` and an accessible
status. Open it through `npm run dev`; append `?theme=dark`, `&zoom=1` for 200% CSS
zoom, `&large=1` for 10,000 synthetic process steps, or `&packed=1` for the built
browser bundle. The fixture does not write progress or contact production services.
With `&keyboard=1`, it waits for native browser key presses and checks Tab order,
dialog focus return, mobile search, workflow selection, the theme options and Sync.

The automated browser suite runs the fixture at 360, 390, 768, 1024, 1280, 1440
and 1920px, in both themes at 1x and 2x. It checks measured geometry, alignment,
overflow, readable type, composited text contrast, title recovery, search recovery,
drawer focus, theme state, minimap, help, screen overview, read-only editing,
saving and synthetic error/offline recovery. Results and selected screenshots go
to `artifacts/` when using the repository browser runner.

The existing unit, CLI and browser suites remain responsible for graph layout,
preview caching, authored interactions, progress persistence and renderer isolation.
The UI refactor adds no identity roles, server authorization, schema fields or
deployment. An atlas with no flows is invalid; process-only atlases may have no
screens. Viewer chrome is English and left-to-right, as before. Native screen-reader
output and browser-level zoom require separate platform checks; CSS zoom and
accessible DOM checks do not prove those checks.
