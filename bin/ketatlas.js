#!/usr/bin/env node
import { progressPath, readProgress, saveProgress } from "./progress.js";
import { summarizeProgress } from "../src/progress.js";
import { readFile, readdir, mkdir, cp, writeFile, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAtlas } from "../src/config.js";
import { serve } from "./server.js";
import { serveAtlas } from "./viewer.js";
import { auditAtlas } from "./audit.js";
import {
  discoverAtlases,
  isAtlasDirectory,
  requireAtlasDirectory,
  resolveAtlasFile,
} from "./discovery.js";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const help = `KetAtlas — scaffold, serve, and audit framework-native workflow maps

  ketatlas scaffold <name.ketatlas> [--template basic|web|process]
  ketatlas discover <directory> [--json]
  ketatlas serve <name.ketatlas|atlas.json> [--port 4178] [--root directory] [--renderer] [--html-port 4179] [--preload|--no-preload] [--cache-size 24]
  ketatlas serve <name.ketatlas|atlas.json> --managed [--renderer] [--port 4178]
  ketatlas audit <name.ketatlas|atlas.json> [--root directory] [--json] [--strict]
  ketatlas validate <name.ketatlas|atlas.json>
  ketatlas progress <name.ketatlas|atlas.json> [--json] [--init]
  ketatlas progress <name.ketatlas|atlas.json> --set <screen-id> --record <record.json> --expect <revision>
  ketatlas --version

Examples:
  npx ketatlas scaffold my-atlas.ketatlas
  npx ketatlas discover . --json
  npx ketatlas serve my-atlas.ketatlas
  npx ketatlas audit my-atlas.ketatlas --strict

Serve binds to 127.0.0.1. Static screens need no build; --renderer starts the project's declared framework server.
Selected-flow preloading is on by default. Use --no-preload for large atlases to load only visible screens and the open preview.
Use --cache-size 3–128 to limit retained viewer frames when flow preloading is enabled (default 24).
Use --managed for an owning desktop app: JSON Lines on stdout, a stop command on stdin, and automatic shutdown after the last browser viewer closes.
`;
function parse(args, allowed) {
  const options = {},
    positionals = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (!(key in allowed)) throw new Error(`Unknown option: ${arg}`);
      if (allowed[key] === "boolean") options[key] = true;
      else {
        const value = args[++i];
        if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
        options[key] = value;
      }
    } else positionals.push(arg);
  }
  if (positionals.length !== 1)
    throw new Error("Expected one file or directory. Run ketatlas --help.");
  return { target: positionals[0], options };
}
async function main(args) {
  const [command, ...rest] = args;
  if (!command || ["--help", "-h", "help"].includes(command) || rest.includes("--help")) {
    console.log(help);
    return;
  }
  if (command === "--version") {
    console.log(JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")).version);
    return;
  }
  if (command === "scaffold" || command === "init") {
    const { target, options } = parse(rest, { template: "string" }),
      template = options.template || "basic";
    if (!["basic", "web", "process"].includes(template))
      throw new Error("Templates: basic, web, process.");
    const destination = requireAtlasDirectory(target);
    let existing;
    try {
      existing = await readdir(destination);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (existing?.length)
      throw new Error("Destination is not empty. Choose an empty or new directory.");
    await mkdir(destination, { recursive: true });
    const source = join(packageRoot, "templates", template);
    for (const name of await readdir(source))
      await cp(join(source, name), join(destination, name), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
    console.log(
      `Created ${destination}\n\nNext: npx ketatlas serve "${destination}"\nEdit atlas.json to make it yours.`,
    );
    return;
  }
  if (command === "discover") {
    const { target, options } = parse(rest, { json: "boolean" }),
      result = await discoverAtlases(target);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const atlas of result.atlases)
        console.log(`${atlas.title}\t${atlas.path}\t${atlas.screens.length} screens`);
      for (const error of result.errors) console.error(`ERROR ${error.path}: ${error.message}`);
      console.log(
        `${result.atlases.length} atlas${result.atlases.length === 1 ? "" : "es"} in ${result.root}`,
      );
    }
    if (result.errors.length) process.exitCode = 1;
    return;
  }
  if (command === "audit") {
    const { target, options } = parse(rest, {
      root: "string",
      json: "boolean",
      strict: "boolean",
      output: "string",
    });
    const report = await auditAtlas(await resolveAtlasFile(target), options),
      pass = report.valid && (!options.strict || report.warnings.length === 0);
    if (options.output)
      await writeFile(resolve(options.output), JSON.stringify(report, null, 2) + "\n", {
        flag: "wx",
      });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      for (const issue of report.errors) console.error(`ERROR ${issue.path}: ${issue.message}`);
      for (const issue of report.warnings) console.warn(`WARN ${issue.path}: ${issue.message}`);
      console.log(
        `${pass ? "PASS" : "FAIL"} · ${report.summary.flows} flows · ${report.summary.screens} screens · ${report.summary.localFiles} local files\n${report.scope}`,
      );
    }
    if (!pass) process.exitCode = 1;
    return;
  }
  if (command === "validate") {
    const { target } = parse(rest, {}),
      config = JSON.parse(await readFile(await resolveAtlasFile(target), "utf8")),
      result = validateAtlas(config);
    for (const issue of result.errors) console.error(`ERROR ${issue.path}: ${issue.message}`);
    for (const issue of result.warnings) console.warn(`WARN ${issue.path}: ${issue.message}`);
    if (!result.valid) {
      process.exitCode = 1;
      return;
    }
    console.log(
      `Valid atlas: ${config.flows.length} flows, ${config.screens?.length || 0} screens.`,
    );
    return;
  }
  if (command === "progress") {
    const { target, options } = parse(rest, {
      json: "boolean",
      init: "boolean",
      set: "string",
      record: "string",
      expect: "string",
    });
    const file = await resolveAtlasFile(target),
      atlas = JSON.parse(await readFile(file, "utf8"));
    const valid = validateAtlas(atlas);
    if (!valid.valid) throw new Error(valid.errors.map((e) => e.message).join("; "));
    const path = progressPath(file);
    let result = await readProgress(path, atlas);
    if (options.init) {
      if (options.set || options.record || options.expect)
        throw new Error("Use --init separately from an update.");
      if (result.revision !== "missing") throw new Error("Progress already exists.");
      result = await saveProgress(path, file, "missing", (data) => {
        for (const s of atlas.screens || [])
          Object.defineProperty(data.screens, s.id, {
            value: { status: "unassessed" },
            enumerable: true,
          });
        return data;
      });
    } else if (options.set || options.record || options.expect) {
      if (!options.set || !options.record || !options.expect)
        throw new Error("Updates need --set, --record and --expect from progress --json.");
      const record = JSON.parse(await readFile(resolve(options.record), "utf8"));
      result = await saveProgress(path, file, options.expect, (data) => {
        Object.defineProperty(data.screens, options.set, {
          value: { ...record, updatedAt: new Date().toISOString() },
          enumerable: true,
        });
        return data;
      });
    }
    const summary = summarizeProgress(result.data, atlas.screens || []);
    console.log(
      options.json
        ? JSON.stringify({ ...result, summary }, null, 2)
        : `${summary.total} screens · ${summary.counts.verified} verified · ${summary.blocked} blocked\nRevision: ${result.revision}\n${path}`,
    );
    return;
  }
  if (command === "serve") {
    const { target, options } = parse(rest, {
        port: "string",
        root: "string",
        "read-only": "boolean",
        renderer: "boolean",
        "html-port": "string",
        preload: "boolean",
        "no-preload": "boolean",
        "cache-size": "string",
        managed: "boolean",
      }),
      port = Number(options.port || 4178),
      htmlPort = Number(options["html-port"] || (port < 65535 ? port + 1 : 0));
    if (options.preload && options["no-preload"])
      throw new Error("Choose either --preload or --no-preload, not both.");
    const cacheSize = Number(options["cache-size"] ?? 24);
    if (!Number.isInteger(cacheSize) || cacheSize < 3 || cacheSize > 128)
      throw new Error("Cache size must be 3–128.");
    if (options["no-preload"] && options["cache-size"] !== undefined)
      throw new Error(
        "--cache-size requires flow preloading; do not combine it with --no-preload.",
      );
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Port must be 1–65535.");
    if (options.renderer && (!Number.isInteger(htmlPort) || htmlPort < 1 || htmlPort > 65535))
      throw new Error("HTML port must be 1–65535.");
    if (options.renderer && htmlPort === port)
      throw new Error("Viewer and HTML ports must be different.");
    const directory = (await stat(resolve(target))).isDirectory();
    const atlasMode = !directory || isAtlasDirectory(target);
    if (options.managed && !atlasMode)
      throw new Error("--managed requires a .ketatlas bundle or an atlas JSON file.");
    if (
      !atlasMode &&
      (options.preload || options["no-preload"] || options["cache-size"] !== undefined)
    )
      throw new Error("Preload options require a .ketatlas bundle or an atlas JSON file.");
    if (directory && options.root)
      throw new Error("--root is only needed when serving an atlas JSON file.");
    let stop;
    const managed = options.managed
      ? {
          onEvent(event) {
            console.log(JSON.stringify(event));
          },
          onIdle(reason) {
            void stop?.(reason);
          },
        }
      : null;
    const server = !atlasMode
      ? await serve(target, { port })
      : await serveAtlas(await resolveAtlasFile(target), {
          port,
          root: options.root,
          readOnly: options["read-only"],
          renderer: options.renderer,
          htmlPort,
          preloadScreens: !options["no-preload"],
          maxCachedPreviews: cacheSize,
          managed,
        });
    const url = `http://127.0.0.1:${server.address().port}`;
    if (options.managed)
      console.log(
        JSON.stringify({ type: "ready", protocol: 1, url, htmlOrigin: server.htmlOrigin ?? null }),
      );
    else
      console.log(
        `KetAtlas: ${url}${server.htmlOrigin ? `\nHTML: ${server.htmlOrigin}` : ""}\nServing ${resolve(target)}${atlasMode ? `\nPreload: ${options["no-preload"] ? "off (visible screens and open preview only)" : "on (selected flow, bounded session cache)"}` : ""}\nPress Ctrl+C to stop.`,
      );
    let stopping = false;
    let stdinBuffer = "";
    const onInput = (chunk) => {
      stdinBuffer += chunk.toString("utf8");
      if (stdinBuffer.length > 4096) {
        void stop("invalid-control");
        return;
      }
      let newline;
      while ((newline = stdinBuffer.indexOf("\n")) !== -1) {
        const line = stdinBuffer.slice(0, newline);
        stdinBuffer = stdinBuffer.slice(newline + 1);
        try {
          if (JSON.parse(line).type === "stop") void stop("owner-request");
        } catch {
          void stop("invalid-control");
        }
      }
    };
    stop = async (reason) => {
      if (stopping) return;
      stopping = true;
      process.stdin.off("data", onInput);
      if (options.managed) process.stdin.destroy();
      server.closeManaged?.();
      server.closeAllConnections();
      await new Promise((resolveClose) => server.close(resolveClose));
      await server.closeRenderer?.();
      if (options.managed) console.log(JSON.stringify({ type: "stopped", reason }));
    };
    if (options.managed) {
      process.stdin.on("data", onInput);
      process.stdin.once("end", () => void stop("owner-closed"));
      process.stdin.resume();
    }
    const close = () => void stop("signal");
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    return;
  }
  throw new Error(`Unknown command: ${command}. Run ketatlas --help.`);
}
main(process.argv.slice(2)).catch((error) => {
  console.error(`KetAtlas: ${error.message}`);
  process.exitCode = 1;
});
