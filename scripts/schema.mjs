import { writeFile } from "node:fs/promises";
const text = { type: "string" },
  id = { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9_.-]*$" },
  nonempty = { type: "string", pattern: "\\S" };
const object = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const viewport = object(
  {
    width: { type: "integer", minimum: 160, maximum: 4096 },
    height: { type: "integer", minimum: 160, maximum: 4096 },
  },
  ["width", "height"],
);
const coordinate = { type: "integer", minimum: 0, maximum: 100 };
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "KetAtlas configuration",
  ...object(
    {
      $schema: text,
      version: { const: 1 },
      title: nonempty,
      description: text,
      viewport,
      screens: {
        type: "array",
        items: object(
          { id, title: nonempty, url: nonempty, viewport, description: text, badge: text },
          ["id", "title", "url"],
        ),
      },
      flows: {
        type: "array",
        minItems: 1,
        items: object(
          {
            id,
            title: nonempty,
            group: text,
            description: text,
            start: id,
            ends: { type: "array", items: id },
            nodes: {
              type: "array",
              minItems: 1,
              items: object(
                {
                  id,
                  screen: id,
                  type: { enum: ["screen", "note", "external"] },
                  title: text,
                  description: text,
                  url: nonempty,
                  column: coordinate,
                  row: coordinate,
                },
                ["id"],
              ),
            },
            edges: {
              type: "array",
              items: object(
                {
                  from: id,
                  to: id,
                  label: nonempty,
                  kind: { enum: ["primary", "conditional", "recovery"] },
                },
                ["from", "to", "label"],
              ),
            },
          },
          ["id", "title", "nodes", "edges"],
        ),
      },
    },
    ["version", "title", "flows"],
  ),
};
await writeFile(new URL("../schema.json", import.meta.url), JSON.stringify(schema, null, 2) + "\n");
