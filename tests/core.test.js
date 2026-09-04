import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateAtlas, normalizeAtlas, AtlasValidationError, safeURL } from "../src/config.js";
import { layoutAtlas, edgePath } from "../src/layout.js";
import Ajv from "ajv";
const fixture = () => ({
  version: 1,
  title: "Test project",
  screens: [{ id: "screen", title: "Screen", url: "./page.html" }],
  flows: [
    {
      id: "flow",
      title: "Flow",
      nodes: [
        { id: "a", screen: "screen" },
        { id: "b", title: "Manual step" },
      ],
      edges: [{ from: "a", to: "b", label: "Continue" }],
    },
  ],
});
test("normalization preserves caller data, resolves URLs and applies defaults", () => {
  const input = fixture(),
    before = structuredClone(input),
    result = normalizeAtlas(input, "https://example.test/project/atlas.json");
  assert.deepEqual(input, before);
  assert.equal(result.screens[0].url, "https://example.test/project/page.html");
  assert.deepEqual(result.flows[0].ends, ["b"]);
  assert.deepEqual(result.screens[0].viewport, { width: 390, height: 844 });
});
test("unknown IDs, duplicate nodes and grid collisions are actionable errors", () => {
  const data = fixture();
  data.flows[0].nodes.push({ id: "a", screen: "missing", column: 0 });
  data.flows[0].edges.push({ from: "a", to: "missing", label: "Broken" });
  const result = validateAtlas(data);
  assert(!result.valid);
  for (const text of ["Duplicate node", "Unknown screen", "grid cell", "Unknown node"])
    assert(result.errors.some((e) => e.message.includes(text)));
  assert.throws(() => normalizeAtlas(data), AtlasValidationError);
});
test("reject unsupported URL schemes, credentials, dimensions, typos and unsafe IDs", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
    "https://name:password@example.test",
  ])
    assert.throws(() => safeURL(url));
  const data = fixture();
  data.flows[0].nodes[0].id = 'bad\"id';
  data.viewport = { width: 0, height: NaN };
  data.screenz = [];
  assert(!validateAtlas(data).valid);
});
test("invalid shapes return validation reports rather than throwing", () => {
  for (const data of [
    null,
    [],
    {},
    "x",
    { version: 1, title: "Bad", flows: [null] },
    {
      version: 1,
      title: "Bad",
      screens: {},
      flows: [{ id: "x", title: "X", nodes: "bad", edges: null }],
    },
  ])
    assert.equal(validateAtlas(data).valid, false);
});
test("cycles are allowed; disconnected nodes produce warnings", () => {
  const data = fixture();
  data.flows[0].edges.push({ from: "b", to: "a", label: "Retry", kind: "recovery" });
  assert(validateAtlas(data).valid);
  data.flows[0].nodes.push({ id: "c", title: "Detached" });
  assert.equal(validateAtlas(data).warnings.length, 1);
});
test("mixed screen dimensions produce non-overlapping cards and finite routes", () => {
  const data = fixture();
  data.screens.push({
    id: "web",
    title: "Web",
    url: "./web.html",
    viewport: { width: 1280, height: 800 },
  });
  data.flows[0].nodes.push({ id: "web", screen: "web", column: 0, row: 1 });
  const { nodes } = layoutAtlas(normalizeAtlas(data));
  for (const a of nodes)
    for (const b of nodes) {
      if (a !== b)
        assert(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        );
      assert(!/NaN|Infinity/.test(edgePath(a, b).d));
    }
  assert.equal(nodes.find((n) => n.id === "web").width, 460);
});
test("JSON Schema validates every shipped config and rejects misspelled fields", async () => {
  const schema = JSON.parse(await readFile("schema.json", "utf8"));
  const validate = new Ajv({ strict: true }).compile(schema);
  for (const path of [
    "examples/atlas.json",
    "templates/basic/atlas.json",
    "templates/web/atlas.json",
    "templates/process/atlas.json",
  ]) {
    const data = JSON.parse(await readFile(path, "utf8"));
    assert(validate(data), JSON.stringify(validate.errors));
    assert(validateAtlas(data).valid);
  }
  const wrong = fixture();
  wrong.flows[0].nodes[0].col = 1;
  assert(!validate(wrong));
  assert(!validateAtlas(wrong).valid);
});
