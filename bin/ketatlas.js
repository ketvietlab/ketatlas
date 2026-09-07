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
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const help = `KetAtlas — scaffold, serve, and audit HTML workflow maps

  ketatlas scaffold <directory> [--template basic|web|process]
  ketatlas serve <atlas.json> [--port 4178] [--root directory]
  ketatlas audit <atlas.json> [--root directory] [--json] [--strict]
  ketatlas validate <atlas.json>
  ketatlas progress <atlas.json> [--json] [--init]
  ketatlas progress <atlas.json> --set <screen-id> --record <record.json> --expect <revision>
  ketatlas --version

Examples:
  npx ketatlas scaffold my-atlas
  npx ketatlas serve my-atlas/atlas.json
  npx ketatlas audit my-atlas/atlas.json --strict

Serve binds to 127.0.0.1. No HTML wrapper, build, account, or backend required.
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
    const destination = resolve(target);
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
      `Created ${destination}\n\nNext: npx ketatlas serve "${join(destination, "atlas.json")}"\nEdit atlas.json to make it yours.`,
    );
    return;
  }
  if (command === "audit") {
    const { target, options } = parse(rest, {
      root: "string",
      json: "boolean",
      strict: "boolean",
      output: "string",
    });
    const report = await auditAtlas(target, options),
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
      config = JSON.parse(await readFile(resolve(target), "utf8")),
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
    const file = resolve(target),
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
      }),
      port = Number(options.port || 4178);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Port must be 1–65535.");
    const directory = (await stat(resolve(target))).isDirectory();
    if (directory && options.root)
      throw new Error("--root is only needed when serving an atlas JSON file.");
    const server = directory
      ? await serve(target, { port })
      : await serveAtlas(target, { port, root: options.root, readOnly: options["read-only"] });
    console.log(
      `KetAtlas: http://127.0.0.1:${server.address().port}\nServing ${resolve(target)}\nPress Ctrl+C to stop.`,
    );
    const close = () => {
      server.close();
      server.closeAllConnections();
    };
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
