# Authoring a useful atlas

Start with a user goal: sign in, approve a purchase, or deliver an order. Give each flow one clear start and a small number of outcomes. Screen files can come from an existing prototype; KetAtlas does not require a particular frontend framework.

## 1. Create a starting point

```sh
ketatlas scaffold ./customer-journeys.ketatlas --template basic
ketatlas serve ./customer-journeys.ketatlas
```

Open a card with a double-click. The preview is actual HTML; links and JavaScript inside it can work independently of the map. Edit those files before adding more nodes.

## 2. Register your screens

Add each reusable screen once in `screens`. Use paths relative to `atlas.json`, including query parameters for prototype states. A React/Vite prototype can expose its own embedded routes through an HTTP URL, provided it permits iframe embedding. Audit reports remote URLs for separate verification.

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
