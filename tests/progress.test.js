import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { validateProgress, progressFor, summarizeProgress } from "../src/progress.js";
import { readProgress, saveProgress, progressPath } from "../bin/progress.js";
import { serveAtlas } from "../bin/viewer.js";
import { auditAtlas } from "../bin/audit.js";
import Ajv from "ajv";
const atlas = {
  version: 1,
  title: "Progress fixture",
  screens: [
    { id: "page", title: "Page", url: "./page.html" },
    { id: "constructor", title: "Other", url: "./page.html" },
  ],
  flows: [
    {
      id: "flow",
      title: "Flow",
      nodes: [
        { id: "one", screen: "page" },
        { id: "variant", screen: "page", url: "./page.html?error=1" },
      ],
      edges: [{ from: "one", to: "variant", label: "Error" }],
    },
  ],
};
const pending = { version: 1, screens: { page: { status: "in_progress" } } };
test("progress counts unique screens, does not inherit prototype properties or infer completion from PRs", () => {
  assert.deepEqual(summarizeProgress(pending, atlas.screens), {
    total: 2,
    counts: {
      unassessed: 1,
      planned: 0,
      in_progress: 1,
      in_review: 0,
      implemented: 0,
      verified: 0,
    },
    blocked: 0,
  });
  assert.equal(progressFor(pending, "constructor").status, "unassessed");
  assert.equal(
    validateProgress(
      {
        version: 1,
        screens: {
          page: {
            status: "verified",
            evidence: [
              {
                id: "pr",
                kind: "pr",
                title: "Merged",
                url: "https://example.test/pr",
                state: "merged",
              },
            ],
          },
        },
      },
      atlas,
    ).valid,
    false,
  );
});
test("verification needs evidence at a revision and environment for every acceptance criterion", async () => {
  const data = {
    version: 1,
    screens: {
      page: {
        status: "verified",
        checks: [
          {
            id: "c",
            title: "Error recovery",
            done: true,
            evidenceIds: ["test"],
            nodes: [{ flowId: "flow", nodeId: "variant" }],
          },
        ],
        evidence: [
          {
            id: "test",
            kind: "test",
            title: "Browser report",
            url: "./report.html",
            state: "passed",
            revision: "abc123",
            environment: "CI",
          },
        ],
      },
    },
  };
  assert.equal(validateProgress(data, atlas).valid, true);
  const schema = JSON.parse(await readFile("progress.schema.json", "utf8"));
  assert(new Ajv().compile(schema)(data));
  for (const mutate of [
    (d) => (d.screens.page.blocker = "DNS"),
    (d) => (d.screens.page.evidence[0].revision = ""),
    (d) => (d.screens.page.checks[0].done = false),
    (d) => (d.screens.page.checks[0].nodes[0].nodeId = "missing"),
    (d) => (d.screens.page.checks[0].evidenceIds = ["missing"]),
    (d) => (d.screens.page.evidence[0].url = "javascript:alert(1)"),
  ]) {
    const d = structuredClone(data);
    mutate(d);
    assert.equal(validateProgress(d, atlas).valid, false);
  }
  for (const bad of [
    null,
    [],
    { version: 1, screens: [] },
    { version: 1, screens: { missing: { status: "planned" } } },
    { version: 1, screens: { page: { status: "verified", checks: [null] } } },
    {
      version: 1,
      screens: {
        page: {
          status: "verified",
          checks: [{ id: "c", title: "Check", done: true, evidenceIds: "test" }],
        },
      },
    },
  ])
    assert.equal(validateProgress(bad, atlas).valid, false);
});
test("local writes are explicit, conflict-safe, validated and shared with CLI; static assets stay read-only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ketatlas-progress-")),
    file = join(dir, "atlas.json"),
    side = progressPath(file);
  let server;
  try {
    await writeFile(file, JSON.stringify(atlas));
    await writeFile(join(dir, "page.html"), "<!doctype html><title>Fixture</title>");
    server = await serveAtlas(file, { port: 0 });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const html = await (await fetch(origin)).text();
    const token = html.match(/progressToken:"([a-f0-9]+)"/)[1];
    const url = origin + "/__ketatlas__/progress";
    assert.equal((await (await fetch(url)).json()).revision, "missing");
    const put = (record, revision, extra = {}) =>
      fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": revision,
          "X-KetAtlas-Token": token,
          Origin: origin,
          ...extra,
        },
        body: JSON.stringify({ screenId: "page", record }),
      });
    assert.equal((await put({ status: "planned" }, "missing", { Origin: "null" })).status, 403);
    assert.equal(
      (await put({ status: "planned" }, "missing", { "X-KetAtlas-Token": "wrong" })).status,
      403,
    );
    assert.equal((await put({ status: "verified" }, "missing")).status, 400);
    const saved = await (await put({ status: "in_progress", owner: "Editor" }, "missing")).json();
    assert.equal(saved.data.screens.page.owner, "Editor");
    assert.equal((await put({ status: "planned" }, "missing")).status, 409);
    assert.equal((await fetch(origin + "/page.html", { method: "PUT" })).status, 405);
    const cli = JSON.parse(
      execFileSync(process.execPath, ["bin/ketatlas.js", "progress", file, "--json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(cli.revision, saved.revision);
    await writeFile(
      join(dir, "record.json"),
      JSON.stringify({ status: "implemented", summary: "Merged, not verified" }),
    );
    execFileSync(process.execPath, [
      "bin/ketatlas.js",
      "progress",
      file,
      "--set",
      "page",
      "--record",
      join(dir, "record.json"),
      "--expect",
      saved.revision,
    ]);
    assert.equal((await readProgress(side, atlas)).data.screens.page.status, "implemented");
    assert.notEqual(
      spawnSync(process.execPath, [
        "bin/ketatlas.js",
        "progress",
        file,
        "--set",
        "page",
        "--record",
        join(dir, "record.json"),
        "--expect",
        saved.revision,
      ]).status,
      0,
    );
    const current = await readProgress(side, atlas);
    const writes = await Promise.allSettled([
      saveProgress(side, file, current.revision, (d) => {
        d.screens.page.owner = "A";
        return d;
      }),
      saveProgress(side, file, current.revision, (d) => {
        d.screens.page.owner = "B";
        return d;
      }),
    ]);
    assert.equal(writes.filter((w) => w.status === "fulfilled").length, 1);
    await writeFile(
      side,
      JSON.stringify({ version: 1, screens: { deleted: { status: "planned" } } }),
    );
    assert.equal((await auditAtlas(file)).valid, false);
    await rm(side);
    await symlink(file, side);
    await assert.rejects(readProgress(side, atlas), /symlink/);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    await rm(dir, { recursive: true, force: true });
  }
});
test("read-only server does not expose a write capability", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ketatlas-readonly-")),
    file = join(dir, "atlas.json");
  let server;
  try {
    await writeFile(file, JSON.stringify(atlas));
    server = await serveAtlas(file, { port: 0, readOnly: true });
    const url = `http://127.0.0.1:${server.address().port}/__ketatlas__/progress`;
    assert.equal((await (await fetch(url)).json()).editable, false);
    assert.equal((await fetch(url, { method: "PUT" })).status, 403);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("flow percentages deduplicate variants, exclude process nodes and never round unfinished work to 100%", async () => {
  const { summarizeFlowProgress } = await import("../src/progress.js");
  const data = {
    version: 1,
    screens: {
      page: { status: "verified", checks: [{ done: true }] },
      constructor: { status: "in_progress", blocker: "Review", checks: [{ done: false }] },
    },
  };
  const flow = {
    nodes: [
      { screen: "page" },
      { screen: "page" },
      { screen: "constructor" },
      { type: "note" },
      { type: "external" },
    ],
  };
  const s = summarizeFlowProgress(data, flow);
  assert.equal(s.total, 2);
  assert.equal(s.verifiedPercent, 50);
  assert.equal(s.blocked, 1);
  assert.deepEqual(s.checks, { done: 1, total: 2, unscoped: 0, percent: 50 });
  assert.equal(summarizeFlowProgress(data, { nodes: [{ screen: "missing" }] }).checks.unscoped, 1);
  assert.equal(summarizeFlowProgress(data, { nodes: [{ type: "note" }] }).verifiedPercent, null);
  assert.equal(summarizeFlowProgress(data, { nodes: [] }).checks.percent, null);
  const many = {
    version: 1,
    screens: Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [
        String(i),
        { status: i < 200 ? "verified" : "planned" },
      ]),
    ),
  };
  assert.equal(
    summarizeFlowProgress(many, { nodes: Object.keys(many.screens).map((screen) => ({ screen })) })
      .verifiedPercent,
    99,
  );
});
