/** Keep the local managed server alive while this viewer document is open. */
export function connectManagedViewer(atlas, token) {
  if (!atlas || typeof atlas.getState !== "function" || typeof token !== "string")
    throw new TypeError("A mounted atlas and a viewer token are required.");
  const headers = { "X-KetAtlas-Viewer": token };
  const controller = new AbortController();
  let closed = false;
  let retry;
  let statePending = false;

  const reportState = () => {
    if (closed || statePending) return;
    statePending = true;
    queueMicrotask(async () => {
      statePending = false;
      if (closed) return;
      const { flowId, selectedNodeId } = atlas.getState();
      try {
        await fetch("/__ketatlas__/managed/state", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ flowId, selectedNodeId }),
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        // A stopped server needs no further state updates.
      }
    });
  };
  const presence = async () => {
    if (closed) return;
    try {
      const response = await fetch("/__ketatlas__/managed/presence", {
        method: "POST",
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) return;
      reportState();
      const reader = response.body.getReader();
      while (!closed && !(await reader.read()).done) {
        // The response stays open until this page or the managed server closes.
      }
    } catch {
      // Reloads and transient connection loss may abort the response.
    }
    if (!closed) retry = setTimeout(presence, 1000);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(retry);
    controller.abort();
    atlas.element.removeEventListener("ketatlas:flowchange", reportState);
    atlas.element.removeEventListener("ketatlas:select", reportState);
    window.removeEventListener("pagehide", close);
  };
  atlas.element.addEventListener("ketatlas:flowchange", reportState);
  atlas.element.addEventListener("ketatlas:select", reportState);
  window.addEventListener("pagehide", close, { once: true });
  presence();
  return close;
}
