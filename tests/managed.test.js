import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { serveAtlas } from "../bin/viewer.js";

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Timed out waiting for managed viewer event.");
};

test("managed viewer authenticates, reports state, and idles after the last page closes", async () => {
  const events = [];
  const idle = [];
  const server = await serveAtlas("examples/atlas.json", {
    root: ".",
    port: 0,
    managed: {
      onEvent: (event) => events.push(event),
      onIdle: (reason) => idle.push(reason),
      idleMs: 60,
      startupMs: 1000,
    },
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const controllers = [new AbortController(), new AbortController(), new AbortController()];
  try {
    const html = await (await fetch(base)).text();
    const token = html.match(/connectManagedViewer\(window\.atlas,"([a-f0-9]+)"\)/)?.[1];
    assert(token);
    const presenceURL = `${base}/__ketatlas__/managed/presence`;
    const headers = { Origin: base, "X-KetAtlas-Viewer": token };
    assert.equal(
      (await fetch(presenceURL, { method: "POST", headers: { Origin: base } })).status,
      403,
    );
    assert.equal(
      (
        await fetch(presenceURL, {
          method: "POST",
          headers: { ...headers, Origin: "https://other.example" },
        })
      ).status,
      403,
    );
    const first = await fetch(presenceURL, {
      method: "POST",
      headers,
      signal: controllers[0].signal,
    });
    const second = await fetch(presenceURL, {
      method: "POST",
      headers,
      signal: controllers[1].signal,
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    await waitFor(() => events.some((event) => event.type === "viewer" && event.viewers === 2));
    const state = await fetch(`${base}/__ketatlas__/managed/state`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ flowId: "alpha", selectedNodeId: "node-1" }),
    });
    assert.equal(state.status, 204);
    assert(events.some((event) => event.type === "state" && event.flowId === "alpha"));
    controllers[0].abort();
    await waitFor(() => events.some((event) => event.type === "viewer" && event.viewers === 1));
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(idle, []);
    controllers[1].abort();
    await waitFor(() => events.some((event) => event.type === "viewer" && event.viewers === 0));
    const reopened = await fetch(presenceURL, {
      method: "POST",
      headers,
      signal: controllers[2].signal,
    });
    assert.equal(reopened.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(idle, []);
    controllers[2].abort();
    await waitFor(() => idle.includes("last-viewer-closed"));
  } finally {
    controllers.forEach((controller) => controller.abort());
    server.closeManaged();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("managed viewer stops if no browser page opens", async () => {
  const idle = [];
  const server = await serveAtlas("examples/atlas.json", {
    root: ".",
    port: 0,
    managed: { onIdle: (reason) => idle.push(reason), startupMs: 30 },
  });
  try {
    await waitFor(() => idle.includes("no-viewer-opened"));
  } finally {
    server.closeManaged();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("managed CLI accepts an owning process stop command", async () => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(
    process.execPath,
    [
      "bin/ketatlas.js",
      "serve",
      "examples/atlas.json",
      "--root",
      ".",
      "--managed",
      "--port",
      String(port),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "";
  let error = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    error += chunk;
  });
  try {
    await waitFor(() => output.includes('"type":"ready"'));
    const ready = JSON.parse(output.trim().split("\n")[0]);
    assert.equal(ready.protocol, 1);
    assert.equal(ready.url, `http://127.0.0.1:${port}`);
    child.stdin.write('{"type":"stop"}\n');
    const [exitCode] = await once(child, "exit");
    assert.equal(exitCode, 0, error);
    assert(output.includes('"type":"stopped","reason":"owner-request"'));
  } finally {
    child.kill();
  }
});
