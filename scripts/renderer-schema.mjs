import { writeFile } from "node:fs/promises";

const text = { type: "string" };
const nonempty = { type: "string", pattern: "\\S" };
const originPath = { type: "string", pattern: "^/" };
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "KetAtlas native renderer configuration",
  type: "object",
  properties: {
    $schema: text,
    version: { const: 1 },
    framework: nonempty,
    command: { type: "array", minItems: 1, items: nonempty },
    cwd: nonempty,
    readyPath: originPath,
    screenBasePath: { type: "string", pattern: "^/.*/$|^/$" },
    readyTimeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
  },
  required: ["version", "framework", "command"],
  additionalProperties: false,
};
await writeFile(
  new URL("../renderer.schema.json", import.meta.url),
  JSON.stringify(schema, null, 2) + "\n",
);
