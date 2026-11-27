import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewQueue } from "../src/preview-queue.js";

test("preview loading is bounded, prioritizes selection, and counts failed attempts", async () => {
  const started = [],
    finishes = new Map(),
    changes = [];
  const queue = createPreviewQueue((state) => changes.push(state));
  const jobs = Array.from({ length: 7 }, (_, id) =>
    queue.add((done) => {
      started.push(id);
      finishes.set(id, done);
    }),
  );
  queue.seal();
  await Promise.resolve();
  assert.deepEqual(started, [0, 1, 2, 3]);
  jobs[6].prioritize();
  finishes.get(0)(true);
  await Promise.resolve();
  assert.deepEqual(started, [0, 1, 2, 3, 6]);
  finishes.get(1)(false);
  finishes.get(2)(true);
  await Promise.resolve();
  for (const id of [3, 4, 5, 6]) finishes.get(id)(true);
  finishes.get(6)(true);
  await queue.ready;
  assert.deepEqual(queue.state(), { total: 7, loaded: 6, failed: 1, pending: 0 });
  assert.deepEqual(changes.at(-1), queue.state());
  queue.destroy();
});

test("timeouts free a slot and teardown cancels work without starting queued previews", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const started = [],
    cancelled = [];
  const queue = createPreviewQueue(() => {}, { concurrency: 1, timeout: 30 });
  for (let id = 0; id < 3; id++)
    queue.add(() => {
      started.push(id);
      return (success) => {
        if (!success) cancelled.push(id);
      };
    });
  queue.seal();
  await Promise.resolve();
  t.mock.timers.tick(30);
  await Promise.resolve();
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(queue.state(), { total: 3, loaded: 0, failed: 1, pending: 2 });
  queue.destroy();
  await queue.ready;
  t.mock.timers.tick(100);
  await Promise.resolve();
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(cancelled, [0, 1]);
});

test("an atlas without previews becomes ready immediately", async () => {
  const queue = createPreviewQueue(() => {});
  queue.seal();
  await queue.ready;
  assert.equal(queue.state().total, 0);
});

test("later flows get a new readiness promise and cancellation releases queue slots", async () => {
  const starts = [],
    cleanups = [];
  const queue = createPreviewQueue(() => {}, { concurrency: 1 });
  queue.seal();
  const firstReady = queue.ready;
  await firstReady;
  const first = queue.add(() => {
    starts.push("first");
    return (result) => cleanups.push(result);
  });
  assert.notEqual(queue.ready, firstReady);
  const skipped = queue.add(() => starts.push("skipped"));
  await Promise.resolve();
  skipped.cancel();
  first.cancel();
  let finish;
  queue.add((done) => {
    starts.push("selected");
    finish = done;
  });
  await Promise.resolve();
  assert.deepEqual(starts, ["first", "selected"]);
  assert.deepEqual(cleanups, [undefined]);
  finish(true);
  await queue.ready;
  assert.deepEqual(queue.state(), { total: 1, loaded: 1, failed: 0, pending: 0 });
  queue.destroy();
});
