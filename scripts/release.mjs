import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function versionParts(version) {
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(
      `Expected a stable major.minor.patch version, received ${JSON.stringify(version)}.`,
    );
  }
  return version.split(".").map(BigInt);
}

export function compareVersions(left, right) {
  const a = versionParts(left),
    b = versionParts(right);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export function planRelease({ version, previousVersion, registry }) {
  versionParts(version);
  if (previousVersion !== null) {
    const change = compareVersions(version, previousVersion);
    if (change < 0) throw new Error(`Version decreased from ${previousVersion} to ${version}.`);
    if (change === 0) return { publish: false, version, reason: "Version did not change." };
  }
  if (Object.hasOwn(registry.versions, version)) {
    return { publish: false, version, reason: `${version} is already published.` };
  }
  const latest = registry["dist-tags"].latest;
  if (latest && compareVersions(version, latest) <= 0) {
    return {
      publish: false,
      version,
      reason: `npm latest is already ${latest}; do not move it backwards.`,
    };
  }
  return { publish: true, version, reason: `${version} is a new stable release.` };
}

export async function readRegistry(name, fetchImpl = fetch) {
  const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) return { versions: {}, "dist-tags": {} };
  if (!response.ok) throw new Error(`npm registry check failed: HTTP ${response.status}.`);
  const registry = await response.json();
  for (const field of ["versions", "dist-tags"]) {
    if (!registry[field] || typeof registry[field] !== "object" || Array.isArray(registry[field])) {
      throw new Error(`npm registry response is missing ${field}.`);
    }
  }
  return registry;
}

export async function checkRelease({ root = process.cwd(), beforeSha, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{40}$/.test(beforeSha ?? ""))
    throw new Error("BEFORE_SHA must be the push event's previous commit SHA.");
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
  if (pkg.name !== "ketatlas" || pkg.private)
    throw new Error("This workflow only publishes the public ketatlas package.");
  if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
    throw new Error("package.json and package-lock.json versions must match.");
  }
  let previousVersion = null;
  if (!/^0+$/.test(beforeSha)) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", beforeSha, "HEAD"], {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new Error("BEFORE_SHA must be an ancestor of the release commit.");
    }
    const before = JSON.parse(
      execFileSync("git", ["show", `${beforeSha}:package.json`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    if (before.name !== pkg.name) throw new Error("The package name changed across this push.");
    previousVersion = before.version;
  }
  // Do not contact npm for pushes that cannot publish.
  const unchanged = previousVersion !== null && compareVersions(pkg.version, previousVersion) <= 0;
  const registry = unchanged
    ? { versions: {}, "dist-tags": {} }
    : await readRegistry(pkg.name, fetchImpl);
  return planRelease({ version: pkg.version, previousVersion, registry });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const plan = await checkRelease({ beforeSha: process.env.BEFORE_SHA });
    console.log(plan.reason);
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `publish=${plan.publish}\nversion=${plan.version}\n`,
      );
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### npm release\n\n${plan.reason}\n`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
