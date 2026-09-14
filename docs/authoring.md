# Authoring a useful atlas

Start with a user goal: sign in, approve a purchase, or deliver an order. Give each flow one clear start and a small number of outcomes. Screen routes come from the product's actual framework; static HTML remains supported for products that are truly static.

## 1. Create a starting point

```sh
ketatlas scaffold ./customer-journeys.ketatlas --template basic
ketatlas serve ./customer-journeys.ketatlas
```

Open a card with a double-click. The preview is actual HTML; links and JavaScript inside it can work independently of the map. Edit those files before adding more nodes.

## 2. Register your screens

Add each reusable screen once in `screens`. Use relative paths, including query parameters for prototype states. Static paths resolve beside `atlas.json`; framework paths resolve beneath the native renderer's `screenBasePath`.

For a desktop page:

```json
{
  "id": "dashboard",
  "title": "Team dashboard",
  "url": "./screens/dashboard.html",
  "viewport": { "width": 1440, "height": 900 }
}
```

HTML should include a viewport meta tag. Avoid adding a second device frame, reviewer sidebar or fixed outer margin inside the page being embedded; point to its clean preview route instead.

## Framework-native screens

Use the same implementation framework as the product and design system. React screens stay React, Vue screens stay Vue, and KetJS server components render through KetJS. Do not reproduce component output with copied HTML, string templates, DOM post-processing, or a parallel Atlas component format.

Keep one presentation path:

```text
business loader ─┐
                 ├─ shared screen presenter ─ design-system components/styles
Atlas fixture ───┘
```

The business loader supplies real data, permissions, and actions. The Atlas route supplies a deterministic fixture selected by its route/query state. Both call the same presenter. If several atlases need the same shell, field, table, or layout, move that composition and its styles into one shared product module rather than copying it between bundles.

Place this sidecar beside `atlas.json`:

```json
{
  "$schema": "https://unpkg.com/ketatlas@0.4.0/renderer.schema.json",
  "version": 1,
  "framework": "ketjs",
  "command": ["npm", "run", "atlas:serve", "--", "--host", "{host}", "--port", "{port}"],
  "cwd": "../..",
  "readyPath": "/__atlas/ready",
  "screenBasePath": "/__atlas/customer-care/"
}
```

Commands are argv arrays and do not run through a shell. `cwd` is relative to the bundle. The command may use `{host}`, `{port}`, and `{atlasDirectory}`; the same values are also available through `KETATLAS_HOST`, `KETATLAS_HTML_PORT`, and `KETATLAS_PROJECT_DIR`. `readyPath` must return 2xx. `screenBasePath` must start and end with `/`.

Run the two origins explicitly:

```sh
npx --yes ketatlas@0.4.0 serve ./customer-journeys.ketatlas --renderer --port 60550 --html-port 60551
```

The first origin owns only the map and progress API. The second origin owns HTML, framework modules, styles, assets, and screen-side requests. Audit validates the renderer contract and graph without executing the command; browser verification must exercise the combined result.

## 3. Connect actions and decisions

Use short labels such as **Submit request**, **Permission missing**, and **Try again**. Put the main journey on row 0, with explicit columns. Place recovery states on row 1 and give their arrows `kind: "recovery"`.

A repeated screen gets a different node ID but the same `screen` reference. Add a node URL override when it represents a different state. Use process notes for actions outside a UI, so a step does not need a fake screenshot.

## 4. Review from start to outcome

Click a node to highlight incoming/outgoing arrows and follow a next-step button. Drag the canvas, use the minimap, or press F to fit the flow. Press 0 to return to its start. Opening the actual HTML tests the prototype's own behavior; the arrow graph is not an automated user-action script.

## 5. Audit before sharing

```sh
ketatlas audit ./customer-journeys.ketatlas --strict
```

Keep the JSON and screens in your project's repository. Review changes in pull requests. Share the directory or run the same serve command in the recipient's checkout. No hosted account or service state is required.

The built-in audit finds structural and local-file issues. Add browser E2E tests for your interactive screens, especially forms, navigation, and errors. A design reference is not evidence of an implemented production flow.
