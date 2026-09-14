import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;

export const rendererFileName = "atlas.renderer.json";

export function validateRendererConfig(input) {
  const errors = [];
  const error = (path, message) => errors.push({ path, message });
  if (!object(input))
    return {
      valid: false,
      errors: [{ path: "$", message: "Expected a renderer object." }],
    };
  for (const key of Object.keys(input))
    if (
      ![
        "$schema",
        "version",
        "framework",
        "command",
        "cwd",
        "readyPath",
        "screenBasePath",
        "readyTimeoutMs",
      ].includes(key)
    )
      error(key, "Unknown property.");
  if (input.version !== 1) error("version", "Expected version: 1.");
  if (!text(input.framework)) error("framework", "Expected a non-empty framework name.");
  if (!Array.isArray(input.command) || input.command.length === 0)
    error("command", "Expected a non-empty command array.");
  else
    for (const [index, value] of input.command.entries())
      if (!text(value)) error(`command[${index}]`, "Expected a non-empty argument.");
  if (input.$schema !== undefined && typeof input.$schema !== "string")
    error("$schema", "Expected text.");
  if (input.cwd !== undefined && !text(input.cwd)) error("cwd", "Expected a directory path.");
  for (const key of ["readyPath", "screenBasePath"])
    if (input[key] !== undefined && (!text(input[key]) || !input[key].startsWith("/")))
      error(key, "Expected an origin-relative path beginning with /.");
  if (input.screenBasePath !== undefined && !input.screenBasePath.endsWith("/"))
    error("screenBasePath", "Expected a path ending with /.");
  if (
    input.readyTimeoutMs !== undefined &&
    (!Number.isInteger(input.readyTimeoutMs) ||
      input.readyTimeoutMs < 100 ||
      input.readyTimeoutMs > 120000)
  )
    error("readyTimeoutMs", "Expected an integer from 100 to 120000.");
  return { valid: errors.length === 0, errors };
}

export class RendererValidationError extends Error {
  constructor(result) {
    super(result.errors.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "RendererValidationError";
    this.errors = result.errors;
  }
}

export async function readRendererConfig(file) {
  const absolute = await realpath(resolve(file));
  if (!(await stat(absolute)).isFile()) throw new Error("Expected a renderer JSON file.");
  const data = JSON.parse(await readFile(absolute, "utf8"));
  const result = validateRendererConfig(data);
  if (!result.valid) throw new RendererValidationError(result);
  const directory = dirname(absolute);
  const cwd = await realpath(resolve(directory, data.cwd || "."));
  if (!(await stat(cwd)).isDirectory()) throw new Error("Renderer cwd must be a directory.");
  return {
    file: absolute,
    directory,
    cwd,
    data: {
      ...data,
      cwd: data.cwd || ".",
      readyPath: data.readyPath || "/",
      screenBasePath: data.screenBasePath || "/",
      readyTimeoutMs: data.readyTimeoutMs || 15000,
    },
  };
}

const reservePort = (host) =>
  new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const port = probe.address().port;
      probe.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });

function originPath(origin, value, name) {
  const url = new URL(value, origin);
  if (url.origin !== origin) throw new Error(`${name} must stay on the renderer origin.`);
  return url.href;
}

function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {}
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  terminate(child);
  await Promise.race([
    new Promise((done) => child.once("exit", done)),
    new Promise((done) => setTimeout(done, 2000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {}
  }
}

export async function startRenderer(file, options = {}) {
  const config = await readRendererConfig(file);
  const host = options.host || "127.0.0.1";
  const port = options.port || (await reservePort(host));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("HTML port must be 1–65535.");
  const values = {
    host,
    port: String(port),
    atlasDirectory: config.directory,
  };
  const replace = (value) =>
    value.replace(/\{(host|port|atlasDirectory)\}/g, (_, key) => values[key]);
  const command = config.data.command.map(replace);
  const origin = `http://${host}:${port}`;
  const readyURL = originPath(origin, config.data.readyPath, "readyPath");
  const screenBaseURL = originPath(origin, config.data.screenBasePath, "screenBasePath");
  const child = spawn(command[0], command.slice(1), {
    cwd: config.cwd,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      KETATLAS_HOST: host,
      KETATLAS_HTML_PORT: String(port),
      KETATLAS_PROJECT_DIR: config.directory,
    },
    stdio: options.stdio || "inherit",
  });
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  const started = Date.now();
  while (Date.now() - started < config.data.readyTimeoutMs) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Renderer exited before ${readyURL} became ready.`);
    try {
      const response = await fetch(readyURL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        let closed = false;
        return {
          child,
          config,
          origin,
          readyURL,
          screenBaseURL,
          async close() {
            if (closed) return;
            closed = true;
            await stop(child);
          },
        };
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  await stop(child);
  throw new Error(
    `Renderer did not become ready at ${readyURL} within ${config.data.readyTimeoutMs}ms.`,
  );
}
