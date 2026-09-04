/** Validate project data without a DOM, build tool, or runtime dependency. */
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value) => typeof value === "string" && value.trim().length > 0;
export function safeURL(value, baseURL = "https://ketatlas.invalid/") {
  if (!string(value)) throw new TypeError("Expected a non-empty URL");
  const url = new URL(value, baseURL);
  if (!["http:", "https:"].includes(url.protocol))
    throw new TypeError("Use an HTTP(S) or relative URL");
  if (url.username || url.password) throw new TypeError("URLs must not contain credentials");
  return url.href;
}
export function validateAtlas(input) {
  const errors = [],
    warnings = [];
  const error = (path, message) => errors.push({ path, message });
  const keys = (value, allowed, path) => {
    for (const key of Object.keys(value))
      if (!allowed.includes(key)) error(path ? `${path}.${key}` : key, "Unknown property.");
  };
  const id = (value, path) => {
    if (!string(value) || !ID.test(value))
      error(
        path,
        "Use letters, numbers, dots, underscores or hyphens; start with a letter or number.",
      );
  };
  const text = (value, path, required = false) => {
    if ((required && !string(value)) || (value !== undefined && typeof value !== "string"))
      error(path, "Expected text.");
  };
  const url = (value, path) => {
    try {
      safeURL(value);
    } catch (e) {
      error(path, e.message);
    }
  };
  const viewport = (value, path) => {
    if (value === undefined) return;
    if (!object(value)) return error(path, "Expected { width, height }.");
    keys(value, ["width", "height"], path);
    for (const key of ["width", "height"])
      if (!Number.isInteger(value[key]) || value[key] < 160 || value[key] > 4096)
        error(`${path}.${key}`, "Expected an integer from 160 to 4096.");
  };
  if (!object(input))
    return {
      valid: false,
      errors: [{ path: "$", message: "Expected an atlas object." }],
      warnings,
    };
  keys(input, ["$schema", "version", "title", "description", "viewport", "screens", "flows"], "");
  if (input.version !== 1) error("version", "Expected version: 1.");
  text(input.title, "title", true);
  text(input.description, "description");
  text(input.$schema, "$schema");
  viewport(input.viewport, "viewport");
  const screens = new Set();
  if (input.screens !== undefined && !Array.isArray(input.screens))
    error("screens", "Expected an array.");
  for (const [i, s] of (Array.isArray(input.screens) ? input.screens : []).entries()) {
    const p = `screens[${i}]`;
    if (!object(s)) {
      error(p, "Expected a screen object.");
      continue;
    }
    keys(s, ["id", "title", "url", "viewport", "description", "badge"], p);
    id(s.id, `${p}.id`);
    text(s.title, `${p}.title`, true);
    url(s.url, `${p}.url`);
    viewport(s.viewport, `${p}.viewport`);
    text(s.description, `${p}.description`);
    text(s.badge, `${p}.badge`);
    if (screens.has(s.id)) error(`${p}.id`, `Duplicate screen "${s.id}".`);
    screens.add(s.id);
  }
  if (!Array.isArray(input.flows) || !input.flows.length) error("flows", "Add at least one flow.");
  const flowIds = new Set();
  for (const [i, f] of (Array.isArray(input.flows) ? input.flows : []).entries()) {
    const p = `flows[${i}]`;
    if (!object(f)) {
      error(p, "Expected a flow object.");
      continue;
    }
    keys(f, ["id", "title", "group", "description", "start", "ends", "nodes", "edges"], p);
    id(f.id, `${p}.id`);
    text(f.title, `${p}.title`, true);
    text(f.group, `${p}.group`);
    text(f.description, `${p}.description`);
    if (flowIds.has(f.id)) error(`${p}.id`, `Duplicate flow "${f.id}".`);
    flowIds.add(f.id);
    if (!Array.isArray(f.nodes) || !f.nodes.length) error(`${p}.nodes`, "Add at least one node.");
    const nodeIds = new Set(),
      cells = new Set();
    for (const [j, n] of (Array.isArray(f.nodes) ? f.nodes : []).entries()) {
      const q = `${p}.nodes[${j}]`;
      if (!object(n)) {
        error(q, "Expected a node object.");
        continue;
      }
      keys(n, ["id", "screen", "type", "title", "description", "url", "column", "row"], q);
      id(n.id, `${q}.id`);
      if (nodeIds.has(n.id)) error(`${q}.id`, `Duplicate node "${n.id}".`);
      nodeIds.add(n.id);
      if (n.screen !== undefined && !screens.has(n.screen))
        error(`${q}.screen`, `Unknown screen "${n.screen}".`);
      const type = n.type || (n.screen ? "screen" : "note");
      if (!["screen", "note", "external"].includes(type))
        error(`${q}.type`, "Use screen, note or external.");
      if (type === "screen" && !n.screen)
        error(`${q}.screen`, "A screen node needs a screen reference.");
      if (type !== "screen" && n.screen !== undefined)
        error(`${q}.screen`, "Only screen nodes may reference a screen.");
      text(n.title, `${q}.title`, type !== "screen");
      text(n.description, `${q}.description`);
      if (n.url !== undefined) url(n.url, `${q}.url`);
      for (const key of ["column", "row"])
        if (n[key] !== undefined && (!Number.isInteger(n[key]) || n[key] < 0 || n[key] > 100))
          error(`${q}.${key}`, "Expected an integer from 0 to 100.");
      const cell = `${n.column ?? j}:${n.row ?? 0}`;
      if (cells.has(cell)) error(q, `Two nodes occupy grid cell ${cell}.`);
      cells.add(cell);
    }
    const start = f.start ?? f.nodes?.[0]?.id;
    if (!nodeIds.has(start)) error(`${p}.start`, "Start must reference a node in this flow.");
    if (f.ends !== undefined && !Array.isArray(f.ends))
      error(`${p}.ends`, "Expected an array of node IDs.");
    for (const key of Array.isArray(f.ends) ? f.ends : [])
      if (!nodeIds.has(key)) error(`${p}.ends`, `Unknown node "${key}".`);
    if (!Array.isArray(f.edges))
      error(`${p}.edges`, "Expected an array (use [] for a single step).");
    for (const [j, edge] of (Array.isArray(f.edges) ? f.edges : []).entries()) {
      const q = `${p}.edges[${j}]`;
      if (!object(edge)) {
        error(q, "Expected an edge object.");
        continue;
      }
      keys(edge, ["from", "to", "label", "kind"], q);
      for (const key of ["from", "to"])
        if (!nodeIds.has(edge[key])) error(`${q}.${key}`, `Unknown node "${edge[key]}".`);
      text(edge.label, `${q}.label`, true);
      if (edge.kind !== undefined && !["primary", "conditional", "recovery"].includes(edge.kind))
        error(`${q}.kind`, "Use primary, conditional or recovery.");
    }
    const reached = new Set([start]);
    let size = -1;
    while (size !== reached.size) {
      size = reached.size;
      for (const edge of Array.isArray(f.edges) ? f.edges : [])
        if (object(edge) && reached.has(edge.from)) reached.add(edge.to);
    }
    for (const key of nodeIds)
      if (!reached.has(key))
        warnings.push({
          path: `${p}.nodes`,
          message: `Node "${key}" is not reachable from "${start}".`,
        });
  }
  return { valid: errors.length === 0, errors, warnings };
}
export class AtlasValidationError extends Error {
  constructor(result) {
    super(result.errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
    this.name = "AtlasValidationError";
    this.errors = result.errors;
  }
}
export function normalizeAtlas(input, baseURL) {
  const result = validateAtlas(input);
  if (!result.valid) throw new AtlasValidationError(result);
  const data = structuredClone(input);
  data.description ??= "";
  data.viewport ??= { width: 390, height: 844 };
  data.screens ??= [];
  for (const s of data.screens) {
    s.url = safeURL(s.url, baseURL);
    s.viewport ??= { ...data.viewport };
  }
  for (const f of data.flows) {
    f.group ??= "";
    f.description ??= "";
    f.start ??= f.nodes[0].id;
    f.ends ??= f.nodes.filter((n) => !f.edges.some((edge) => edge.from === n.id)).map((n) => n.id);
    f.nodes.forEach((n, i) => {
      n.column ??= i;
      n.row ??= 0;
      n.type ??= n.screen ? "screen" : "note";
      if (n.url) n.url = safeURL(n.url, baseURL);
    });
    f.edges.forEach((edge) => {
      edge.kind ??= "primary";
    });
  }
  return data;
}
