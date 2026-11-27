import { randomBytes } from "node:crypto";

const endpoint = "/__ketatlas__/managed/";
const maxStateBytes = 2048;

/** One browser page holds one response open for its entire viewer lifetime. */
export function createManagedViewer({
  onEvent = () => {},
  onIdle = () => {},
  idleMs = 3000,
  startupMs = 60000,
} = {}) {
  if (!Number.isInteger(idleMs) || idleMs < 0 || !Number.isInteger(startupMs) || startupMs < 1)
    throw new RangeError(
      "Managed viewer idle timeout must be non-negative; startup timeout must be positive.",
    );
  const token = randomBytes(32).toString("hex");
  const viewers = new Set();
  let origin;
  let idleTimer;
  let startupTimer;
  let closed = false;
  let everConnected = false;

  const cancelIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  };
  const scheduleIdle = (reason) => {
    cancelIdle();
    if (!closed && viewers.size === 0)
      idleTimer = setTimeout(() => {
        idleTimer = undefined;
        if (!closed && viewers.size === 0) onIdle(reason);
      }, idleMs);
  };
  const reject = (res, status) => {
    res.writeHead(status, {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end({ 403: "Forbidden", 404: "Not found", 413: "Request too large" }[status]);
  };
  const handle = async (req, res) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    if (!path.startsWith(endpoint)) return false;
    if (
      closed ||
      !origin ||
      req.headers.host !== new URL(origin).host ||
      req.headers.origin !== origin ||
      req.headers["x-ketatlas-viewer"] !== token
    ) {
      reject(res, 403);
      return true;
    }
    if (path === `${endpoint}presence` && req.method === "POST") {
      cancelIdle();
      clearTimeout(startupTimer);
      everConnected = true;
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.write(": connected\n\n");
      viewers.add(res);
      onEvent({ type: "viewer", state: "connected", viewers: viewers.size });
      res.on("close", () => {
        if (!viewers.delete(res) || closed) return;
        onEvent({ type: "viewer", state: "disconnected", viewers: viewers.size });
        scheduleIdle("last-viewer-closed");
      });
      return true;
    }
    if (path === `${endpoint}state` && req.method === "POST") {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxStateBytes) {
          reject(res, 413);
          return true;
        }
        chunks.push(chunk);
      }
      let state;
      try {
        state = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        res.writeHead(400, { "Cache-Control": "no-store" });
        res.end();
        return true;
      }
      if (
        !state ||
        typeof state.flowId !== "string" ||
        state.flowId.length > 128 ||
        (state.selectedNodeId !== null &&
          state.selectedNodeId !== undefined &&
          (typeof state.selectedNodeId !== "string" || state.selectedNodeId.length > 128))
      ) {
        res.writeHead(400, { "Cache-Control": "no-store" });
        res.end();
        return true;
      }
      onEvent({
        type: "state",
        flowId: state.flowId,
        selectedNodeId: state.selectedNodeId ?? null,
      });
      res.writeHead(204, { "Cache-Control": "no-store" });
      res.end();
      return true;
    }
    reject(res, 404);
    return true;
  };
  return {
    token,
    handle,
    start(value) {
      origin = value;
      startupTimer = setTimeout(() => {
        if (!closed && !everConnected) onIdle("no-viewer-opened");
      }, startupMs);
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(startupTimer);
      cancelIdle();
      for (const viewer of viewers) viewer.end();
      viewers.clear();
    },
  };
}
