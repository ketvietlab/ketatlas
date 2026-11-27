import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  checkRelease,
  compareVersions,
  planRelease,
  readRegistry,
  verifyRelease,
} from "../scripts/release.mjs";

const registry = { versions: { "0.1.0": {} }, "dist-tags": { latest: "0.1.0" } };

test("release decisions prevent duplicate publication, downgrades, and latest tag regression", () => {
  const decide = (version, previousVersion = "0.1.0", data = registry) =>
    planRelease({ version, previousVersion, registry: data });
  assert.equal(decide("0.1.1").publish, true);
  assert.equal(decide("0.1.0").publish, false);
  assert.equal(decide("0.1.0").verify, false);
  assert.equal(decide("0.1.1").verify, true);
  assert.equal(decide("0.1.0", null).publish, false);
  assert.equal(
    decide("0.1.1", "0.1.0", { versions: { "0.1.1": {} }, "dist-tags": { latest: "0.1.1" } })
      .publish,
    false,
  );
  assert.equal(
    decide("0.1.1", "0.1.0", { versions: {}, "dist-tags": { latest: "0.2.0" } }).publish,
    false,
  );
  assert.equal(decide("0.1.0", null, { versions: {}, "dist-tags": {} }).publish, true);
  assert.throws(() => decide("0.0.9"), /decreased/);
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
  for (const version of ["0.2.0-beta.1", "v0.2.0", "00.2.0", "1.0", "1.0.0\npublish=true"]) {
    assert.throws(() => decide(version), /stable/);
  }
});

test("only a registry 404 means absent; authentication, network, and malformed responses fail", async () => {
  const request = (status, body = {}) =>
    readRegistry("ketatlas", async () => new Response(JSON.stringify(body), { status }));
  assert.deepEqual(await request(404), { versions: {}, "dist-tags": {} });
  assert.deepEqual(await request(200, registry), registry);
  for (const status of [401, 403, 429, 500, 503]) await assert.rejects(request(status), /HTTP/);
  await assert.rejects(request(200), /missing/);
  await assert.rejects(
    readRegistry("ketatlas", async () => {
      throw new Error("Network unavailable");
    }),
    /Network/,
  );
});

test("release check compares the previous develop commit, handles first push, and requires lockfile agreement", async () => {
  const root = await mkdtemp(join(tmpdir(), "ketatlas-release-test-"));
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const writeVersion = async (version, lockVersion = version) => {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "ketatlas", version }));
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({ version: lockVersion, packages: { "": { version: lockVersion } } }),
    );
  };
  const fetchImpl = async () => new Response(JSON.stringify(registry));
  try {
    git(["init", "-b", "develop"]);
    await writeVersion("0.1.0");
    git(["add", "package.json", "package-lock.json"]);
    git([
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=test@example.test",
      "commit",
      "-m",
      "Initial release",
    ]);
    const beforeSha = git(["rev-parse", "HEAD"]);
    const noFetch = async () => {
      throw new Error("Unexpected registry call");
    };
    assert.equal((await checkRelease({ root, beforeSha, fetchImpl: noFetch })).publish, false);
    assert.equal(
      (await checkRelease({ root, beforeSha: "0".repeat(40), fetchImpl })).publish,
      false,
    );
    await writeVersion("0.1.1");
    assert.equal((await checkRelease({ root, beforeSha, fetchImpl })).publish, true);
    const orphan = git([
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=test@example.test",
      "commit-tree",
      "HEAD^{tree}",
      "-m",
      "Unrelated history",
    ]);
    await assert.rejects(checkRelease({ root, beforeSha: orphan, fetchImpl: noFetch }), /ancestor/);
    await writeVersion("0.1.1", "0.1.0");
    await assert.rejects(checkRelease({ root, beforeSha, fetchImpl }), /must match/);
    await writeVersion("0.0.9");
    await assert.rejects(checkRelease({ root, beforeSha, fetchImpl: noFetch }), /decreased/);
    await assert.rejects(checkRelease({ root, beforeSha: "invalid", fetchImpl }), /BEFORE_SHA/);
    await assert.rejects(checkRelease({ root, beforeSha: "a".repeat(40), fetchImpl }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retry verifies an existing release without publishing it again", async () => {
  const root = await mkdtemp(join(tmpdir(), "ketatlas-release-retry-"));
  try {
    const version = "1.0.0";
    const previousVersion = "0.6.1";
    const archive = join(root, "ketatlas-1.0.0.tgz");
    const testedBytes = "synthetic tested archive";
    await writeFile(archive, testedBytes);
    const integrity = `sha512-${createHash("sha512").update(testedBytes).digest("base64")}`;
    const provenance = { predicateType: "https://slsa.dev/provenance/v1" };
    const publicRegistry = { "dist-tags": { latest: previousVersion }, versions: {} };
    const fetchImpl = async () => Response.json(publicRegistry);
    let publishCount = 0;
    async function runRelease() {
      const plan = planRelease({ version, previousVersion, registry: publicRegistry });
      if (plan.publish) {
        publishCount++;
        publicRegistry.versions[version] = { dist: { integrity, attestations: { provenance } } };
      }
      assert.equal(plan.verify, true);
      await verifyRelease({ version, archive, fetchImpl });
    }

    // The registry accepts the first publish before the latest tag has propagated.
    await assert.rejects(runRelease(), /latest does not point/);
    assert.equal(publishCount, 1);
    await assert.rejects(runRelease(), /latest does not point/);

    publicRegistry["dist-tags"].latest = version;
    const dist = publicRegistry.versions[version].dist;
    dist.integrity = "sha512-other-archive";
    await assert.rejects(runRelease(), /integrity does not match/);

    dist.integrity = integrity;
    dist.attestations = undefined;
    await assert.rejects(runRelease(), /provenance metadata is missing/);

    dist.attestations = { provenance };
    await runRelease();
    assert.equal(publishCount, 1, "Retries must never publish an archive already on npm.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
