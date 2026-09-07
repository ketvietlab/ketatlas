import { writeFile } from "node:fs/promises";
import { progressStatuses } from "../src/progress.js";
const text = { type: "string" },
  id = { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9_.-]*$" },
  nonempty = { type: "string", pattern: "\\S" };
const object = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const strings = { type: "array", items: nonempty };
const record = object(
  {
    status: { enum: Object.keys(progressStatuses) },
    owner: text,
    summary: text,
    blocker: text,
    updatedAt: nonempty,
    tasks: strings,
    checks: {
      type: "array",
      items: object(
        {
          id,
          title: nonempty,
          done: { type: "boolean" },
          evidenceIds: strings,
          nodes: { type: "array", items: object({ flowId: id, nodeId: id }, ["flowId", "nodeId"]) },
        },
        ["id", "title", "done"],
      ),
    },
    evidence: {
      type: "array",
      items: object(
        {
          id,
          kind: { enum: ["pr", "test", "release", "reference"] },
          title: nonempty,
          url: nonempty,
          state: text,
          revision: text,
          environment: text,
          observedAt: nonempty,
        },
        ["id", "kind", "title", "url"],
      ),
    },
  },
  ["status"],
);
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "KetAtlas screen progress",
  description:
    "Semantic validation also checks screen/node IDs, evidence references and verification requirements.",
  ...object({ version: { const: 1 }, screens: { type: "object", additionalProperties: record } }, [
    "version",
    "screens",
  ]),
};
await writeFile(
  new URL("../progress.schema.json", import.meta.url),
  JSON.stringify(schema, null, 2) + "\n",
);
