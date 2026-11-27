import { safeURL } from "./config.js";
export const progressStatuses = {
  unassessed: "Unassessed",
  planned: "Planned",
  in_progress: "In progress",
  in_review: "In review",
  implemented: "Implemented",
  verified: "Verified",
};
export const emptyProgress = () => ({ version: 1, screens: {} });
export const progressFor = (data, id) =>
  Object.hasOwn(data.screens, id) ? data.screens[id] : { status: "unassessed" };
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
/** Progress is an evidence record, separate from the version 1 workflow contract. */
export function validateProgress(data, atlas) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  const keys = (v, allowed, path) => {
    for (const k of Object.keys(v))
      if (!allowed.includes(k)) fail(`${path}.${k}`, "Unknown property.");
  };
  const text = (v, path, required = false) => {
    if (
      (required && (typeof v !== "string" || !v.trim())) ||
      (v !== undefined && typeof v !== "string")
    )
      fail(path, "Expected text.");
  };
  if (!object(data))
    return { valid: false, errors: [{ path: "$", message: "Expected a progress object." }] };
  keys(data, ["version", "screens"], "$");
  if (data.version !== 1) fail("version", "Expected version: 1.");
  if (!object(data.screens)) {
    fail("screens", "Expected a screen ID map.");
    return { valid: false, errors };
  }
  const known = new Set((atlas.screens || []).map((s) => s.id));
  for (const [id, r] of Object.entries(data.screens)) {
    const p = `screens.${id}`;
    if (!known.has(id)) fail(p, "Unknown screen.");
    if (!object(r)) {
      fail(p, "Expected a progress record.");
      continue;
    }
    keys(
      r,
      ["status", "owner", "summary", "blocker", "updatedAt", "tasks", "checks", "evidence"],
      p,
    );
    if (!Object.hasOwn(progressStatuses, r.status)) fail(`${p}.status`, "Unknown progress status.");
    for (const k of ["owner", "summary", "blocker"]) text(r[k], `${p}.${k}`);
    if (
      r.updatedAt !== undefined &&
      (typeof r.updatedAt !== "string" ||
        !/^\d{4}-\d\d-\d\dT/.test(r.updatedAt) ||
        !Number.isFinite(Date.parse(r.updatedAt)))
    )
      fail(`${p}.updatedAt`, "Expected an ISO timestamp.");
    if (
      r.tasks !== undefined &&
      (!Array.isArray(r.tasks) || r.tasks.some((t) => typeof t !== "string" || !t.trim()))
    )
      fail(`${p}.tasks`, "Expected task identifiers.");
    for (const k of ["checks", "evidence"])
      if (r[k] !== undefined && !Array.isArray(r[k])) fail(`${p}.${k}`, "Expected an array.");
    const evidence = Array.isArray(r.evidence) ? r.evidence : [],
      checks = Array.isArray(r.checks) ? r.checks : [];
    const ids = new Set();
    for (const [i, ev] of evidence.entries()) {
      const q = `${p}.evidence[${i}]`;
      if (!object(ev)) {
        fail(q, "Expected evidence.");
        continue;
      }
      keys(ev, ["id", "kind", "title", "url", "state", "revision", "environment", "observedAt"], q);
      if (typeof ev.id !== "string" || !idPattern.test(ev.id) || ids.has(ev.id))
        fail(`${q}.id`, "Expected a unique evidence ID.");
      ids.add(ev.id);
      if (!["pr", "test", "release", "reference"].includes(ev.kind))
        fail(`${q}.kind`, "Use pr, test, release or reference.");
      text(ev.title, `${q}.title`, true);
      try {
        safeURL(ev.url);
      } catch {
        fail(`${q}.url`, "Expected an HTTP(S) or relative evidence URL.");
      }
      for (const k of ["state", "revision", "environment"]) text(ev[k], `${q}.${k}`);
      if (
        ev.observedAt !== undefined &&
        (typeof ev.observedAt !== "string" || !Number.isFinite(Date.parse(ev.observedAt)))
      )
        fail(`${q}.observedAt`, "Expected a timestamp.");
    }
    const checkIds = new Set();
    for (const [i, c] of checks.entries()) {
      const q = `${p}.checks[${i}]`;
      if (!object(c)) {
        fail(q, "Expected a check.");
        continue;
      }
      keys(c, ["id", "title", "done", "evidenceIds", "nodes"], q);
      if (typeof c.id !== "string" || !idPattern.test(c.id) || checkIds.has(c.id))
        fail(`${q}.id`, "Expected a unique check ID.");
      checkIds.add(c.id);
      text(c.title, `${q}.title`, true);
      if (typeof c.done !== "boolean") fail(`${q}.done`, "Expected a boolean.");
      if (
        c.evidenceIds !== undefined &&
        (!Array.isArray(c.evidenceIds) || c.evidenceIds.some((e) => !ids.has(e)))
      )
        fail(`${q}.evidenceIds`, "Unknown evidence reference.");
      if (c.done && !c.evidenceIds?.length)
        fail(`${q}.evidenceIds`, "A completed check needs evidence.");
      if (c.nodes !== undefined) {
        if (!Array.isArray(c.nodes)) fail(`${q}.nodes`, "Expected flow/node references.");
        else
          for (const n of c.nodes) {
            if (!object(n)) {
              fail(`${q}.nodes`, "Expected flow/node reference.");
              continue;
            }
            keys(n, ["flowId", "nodeId"], `${q}.nodes`);
            if (
              !atlas.flows.some(
                (f) =>
                  f.id === n.flowId &&
                  f.nodes.some((node) => node.id === n.nodeId && node.screen === id),
              )
            )
              fail(`${q}.nodes`, "Node must reference this screen.");
          }
      }
    }
    if (
      r.status === "verified" &&
      (r.blocker?.trim() ||
        !checks.length ||
        checks.some(
          (c) =>
            !c?.done ||
            !Array.isArray(c.evidenceIds) ||
            !c.evidenceIds.some((id) =>
              evidence.some(
                (ev) =>
                  ev?.id === id &&
                  ev.kind === "test" &&
                  ev.state === "passed" &&
                  ev.revision?.trim() &&
                  ev.environment?.trim(),
              ),
            ),
        ))
    )
      fail(
        p,
        "Verified requires every check to have passed test evidence with revision and environment, and no blocker.",
      );
  }
  return { valid: errors.length === 0, errors };
}
export function requireProgress(data, atlas) {
  const result = validateProgress(data, atlas);
  if (!result.valid)
    throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  return data;
}
export function summarizeProgress(data, screens) {
  const counts = Object.fromEntries(Object.keys(progressStatuses).map((s) => [s, 0]));
  let blocked = 0;
  for (const s of screens) {
    const r = progressFor(data, s.id);
    counts[r.status]++;
    if (r.blocker?.trim()) blocked++;
  }
  return { total: screens.length, counts, blocked };
}

/** Delivery counts deduplicate reusable screens, including repeated error variants. */
export function summarizeFlowProgress(data, flow) {
  const ids = [...new Set(flow.nodes.filter((n) => n.screen).map((n) => n.screen))];
  const summary = summarizeProgress(
    data,
    ids.map((id) => ({ id })),
  );
  let done = 0,
    total = 0,
    unscoped = 0;
  for (const id of ids) {
    const checks = progressFor(data, id).checks || [];
    if (!checks.length) unscoped++;
    total += checks.length;
    done += checks.filter((check) => check.done).length;
  }
  return {
    ...summary,
    // Round down so unfinished work can never display as 100%.
    verifiedPercent: ids.length ? Math.floor((summary.counts.verified * 100) / ids.length) : null,
    checks: { done, total, unscoped, percent: total ? Math.floor((done * 100) / total) : null },
  };
}
