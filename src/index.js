import { mountProgress } from "./progress-ui.js";
import { emptyProgress, requireProgress } from "./progress.js";
export {
  validateProgress,
  summarizeProgress,
  summarizeFlowProgress,
  progressStatuses,
} from "./progress.js";
import { normalizeAtlas, safeURL } from "./config.js";
import { layoutAtlas, edgePath } from "./layout.js";
import { template, escapeHTML as e } from "./template.js";
import { icons } from "./icons.js";
export { validateAtlas, AtlasValidationError } from "./config.js";

/** Mount an isolated viewer. Await atlas.ready before measuring or focusing it. */
export function createAtlas(container, input, options = {}) {
  if (!(container instanceof HTMLElement))
    throw new TypeError("createAtlas requires an HTML element.");
  const config = normalizeAtlas(input, options.baseURL || document.baseURI);
  const progressData = requireProgress(options.progress || emptyProgress(), config);
  const maxPreviews = options.maxPreviews ?? 24,
    previewThreshold = options.previewThreshold ?? 0.3;
  if (!Number.isInteger(maxPreviews) || maxPreviews < 1 || maxPreviews > 64)
    throw new RangeError("maxPreviews must be 1–64.");
  if (!Number.isFinite(previewThreshold) || previewThreshold < 0 || previewThreshold > 2.2)
    throw new RangeError("previewThreshold must be 0–2.2.");
  if (options.theme !== undefined && !["light", "dark"].includes(options.theme))
    throw new TypeError("theme must be light or dark.");
  const sandbox = options.sandbox ?? "allow-scripts allow-forms";
  if (
    typeof sandbox !== "string" ||
    sandbox
      .split(/\s+/)
      .filter(Boolean)
      .some(
        (t) =>
          ![
            "allow-scripts",
            "allow-forms",
            "allow-same-origin",
            "allow-modals",
            "allow-downloads",
            "allow-popups",
            "allow-popups-to-escape-sandbox",
          ].includes(t),
      )
  )
    throw new TypeError("Unsupported sandbox permission.");
  const assetBaseURL = options.assetBaseURL
    ? safeURL(options.assetBaseURL, document.baseURI)
    : new URL("../", import.meta.url).href;
  if (!assetBaseURL.endsWith("/")) {
    throw new TypeError("assetBaseURL must end with a slash.");
  }
  const host = document.createElement("div");
  host.className = "ketatlas";
  host.dataset.theme = options.theme || "light";
  host.lang = "en";
  const root = host.attachShadow({ mode: "open" });
  host.style.visibility = "hidden";
  container.append(host);
  const stylesheet = (file, target) =>
    new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = new URL(file, assetBaseURL).href;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`Cannot load KetAtlas stylesheet: ${link.href}`));
      target.append(link);
    });
  const stylesReady = Promise.all([
    stylesheet("styles/design-system.css", root),
    stylesheet("styles/ketatlas.css", root),
  ]);
  const fontURL = new URL("styles/fonts.css", assetBaseURL).href;
  if (![...document.querySelectorAll('link[rel="stylesheet"]')].some((el) => el.href === fontURL)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fontURL;
    document.head.append(link);
  }
  const content = document.createElement("div");
  content.innerHTML = template(config);
  root.append(...content.childNodes);
  const $ = (id) => root.getElementById(id),
    shell = root.querySelector(".flow-page"),
    icon = (name) => icons[name] || icons.circle;
  const normalize = (t) =>
    String(t)
      .toLocaleLowerCase("en")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll("đ", "d");
  const { flows, nodes, nodeByKey, flowById, width: maxWidth, height } = layoutAtlas(config);
  const screens = new Map(config.screens.map((s) => [s.id, s]));
  const viewport = $("map-viewport"),
    world = $("map-world"),
    pointers = new Map();
  let current = flows[0],
    selected = null,
    view = { x: 0, y: 0, z: 0.8 },
    frameRequest = 0,
    drag = null,
    suppressClick = false,
    minimapGeometry = null,
    pinch = null,
    destroyed = false;
  const tone = (kind) => ({ primary: "main", conditional: "branch", recovery: "recovery" })[kind];
  const emit = (type, detail) =>
    host.dispatchEvent(
      new CustomEvent(`ketatlas:${type}`, { detail, bubbles: true, composed: true }),
    );
  const createFrame = (n) => {
    const el = document.createElement("iframe");
    el.setAttribute("sandbox", sandbox);
    el.referrerPolicy = "no-referrer";
    el.src = n.url;
    el.addEventListener("error", () => emit("previewerror", { nodeId: n.id, url: n.url }));
    return el;
  };
  world.style.width = maxWidth + "px";
  world.style.height = height + "px";
  $("map-total").textContent = `${flows.length} flows · ${screens.size} screens`;
  const groups = [...new Set(flows.map((f) => f.group))];
  let progressUI;
  function sidebar() {
    const q = normalize($("flow-search").value);
    $("flow-list").innerHTML =
      groups
        .map((group) => {
          const matches = flows.filter(
            (f) =>
              f.group === group &&
              normalize(
                `${f.title} ${f.group} ${f.nodes.map((n) => `${n.title} ${n.screenId || ""}`).join(" ")}`,
              ).includes(q),
          );
          return matches.length
            ? `<section><h2 class="flow-group-title">${e(group)}</h2>${matches.map((f) => `<button class="flow-link ${f === current ? "active" : ""}" data-flow="${f.id}" ${f === current ? 'aria-current="true"' : ""}><span class="flow-number">${String(f.index + 1).padStart(2, "0")}</span><span class="flow-link-copy"><strong>${e(f.title)}</strong><small>${f.nodes.length} steps <span class="flow-progress" data-progress-flow="${f.id}"></span></small></span></button>`).join("")}</section>`
            : "";
        })
        .join("") || '<p class="mock-filter-empty">No matching workflows.</p>';
    progressUI?.paintSidebar();
  }
  const defs = `<defs>${[
    ["main", "--kv-accent"],
    ["branch", "--kv-text-muted"],
    ["recovery", "--kv-warning"],
  ]
    .map(
      ([tone, color]) =>
        `<marker id="arrow-${tone}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" style="fill:var(${color});stroke:none"></path></marker>`,
    )
    .join("")}</defs>`;
  $("map-edges").setAttribute("viewBox", `0 0 ${maxWidth} ${height}`);
  $("map-edges").innerHTML =
    defs +
    flows
      .map((f) =>
        f.edges
          .map((a, i) => {
            const from = nodeByKey.get(`${f.id}:${a.from}`),
              to = nodeByKey.get(`${f.id}:${a.to}`),
              path = edgePath(from, to, i);
            return `<g class="flow-edge ${tone(a.kind)}" data-from="${from.uid}" data-to="${to.uid}"><path d="${path.d}" marker-end="url(#arrow-${tone(a.kind)})"></path><foreignObject x="${path.label[0] - 80}" y="${path.label[1] - 25}" width="160" height="50"><div xmlns="http://www.w3.org/1999/xhtml" class="edge-label-wrap"><span class="edge-label">${e(a.label)}</span></div></foreignObject></g>`;
          })
          .join(""),
      )
      .join("");
  const labels = document.createElementNS("http://www.w3.org/2000/svg", "g");
  labels.classList.add("edge-label-layer");
  for (const el of $("map-edges").querySelectorAll(".flow-edge")) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "g");
    label.setAttribute("class", el.getAttribute("class"));
    label.dataset.from = el.dataset.from;
    label.dataset.to = el.dataset.to;
    label.append(el.querySelector("foreignObject"));
    labels.append(label);
  }
  $("map-edges").append(labels);
  $("map-lanes").innerHTML = flows
    .map(
      (f) =>
        `<section class="flow-lane" data-lane="${f.id}" style="left:80px;top:${f.y}px;width:${f.width - 160}px"><div class="flow-lane-head"><span class="lane-number">${String(f.index + 1).padStart(2, "0")}</span><h2>${e(f.title)}</h2></div><p>${e(f.description)}</p></section>`,
    )
    .join("");
  $("map-nodes").innerHTML = nodes
    .map((n) => {
      const f = flowById.get(n.flowId),
        badge =
          n.key === f.start
            ? `<span class="node-badge">${icon("circle-dot")}Start here</span>`
            : f.ends.includes(n.key)
              ? `<span class="node-badge destination">${icon("circle-check")}Outcome</span>`
              : "";
      return `<article class="flow-node ${n.kind !== "screen" ? "external" : ""}" data-node="${n.uid}" data-screen-id="${n.screenId || ""}" data-flow-id="${f.id}" style="left:${n.x}px;top:${n.y}px;height:${n.height}px;--node-width:${n.width}px;--preview-width:${n.previewWidth}px;--preview-height:${n.previewHeight}px;--screen-width:${n.screen?.viewport.width || 0}px;--screen-height:${n.screen?.viewport.height || 0}px;--preview-scale:${n.screen ? n.previewWidth / n.screen.viewport.width : 1}" tabindex="0" aria-label="${e(n.title)}${n.screenId ? " · " + n.screenId : ""}">${badge}${n.kind !== "screen" ? `<span class="external-icon">${icon(n.kind === "external" ? "arrow-up-right" : "file-text")}</span><small>${n.kind === "external" ? "EXTERNAL STEP" : "PROCESS STEP"}</small><h3>${e(n.title)}</h3><p>${e(n.description)}</p>` : `<header class="node-head"><small>${n.screenId}${n.url !== n.screen?.url ? " · Variant" : ""}</small><h3>${e(n.title)}</h3></header><div class="node-preview"><div class="node-placeholder"><span></span><span></span><span></span><p>Zoom in to see<br>the live screen</p></div></div><footer class="node-foot"><span data-progress-screen="${n.screenId}"></span><span>HTML · ${e(n.screen.badge || "Preview")}</span><button data-open="${n.uid}" aria-label="Open ${e(n.title)}">Open screen ${icon("arrow-up-right")}</button></footer>`}</article>`;
    })
    .join("");
  for (const n of nodes) n.element = viewport.querySelector(`[data-node="${n.uid}"]`);
  function setCurrent(f, updateUrl = true) {
    if (!f) return;
    current = f;
    $("current-flow-title").textContent = f.title;
    $("current-flow-description").textContent = f.description;
    $("flow-position").textContent =
      `FLOW ${String(f.index + 1).padStart(2, "0")} / ${flows.length} · ${f.group.toLocaleUpperCase("en")}`;
    sidebar();
    emit("flowchange", { flowId: f.id });
    if (updateUrl && options.syncUrl) {
      const url = new URL(location.href);
      url.searchParams.set("flow", f.id);
      url.searchParams.delete("screen");
      history.replaceState(history.state, "", url);
    }
  }
  function visibleFrames() {
    const width = viewport.clientWidth,
      height = viewport.clientHeight;
    const candidates = nodes
      .filter((n) => n.screenId)
      .map((n) => ({ n, left: n.x * view.z + view.x, top: n.y * view.z + view.y }))
      .filter(
        ({ n, left, top }) =>
          view.z >= previewThreshold &&
          left + n.width * view.z > -150 &&
          left < width + 150 &&
          top + n.height * view.z > -150 &&
          top < height + 150,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.left - width / 2, a.top - height / 2) -
          Math.hypot(b.left - width / 2, b.top - height / 2),
      )
      .slice(0, maxPreviews);
    const wanted = new Set(candidates.map(({ n }) => n.uid));
    for (const n of nodes) {
      const preview = n.element.querySelector(".node-preview");
      if (!preview) continue;
      const frame = preview.querySelector("iframe");
      if (wanted.has(n.uid) && !frame) {
        const el = createFrame(n);
        el.title = `HTML ${n.screenId} · ${n.title}`;
        el.tabIndex = -1;
        el.setAttribute("aria-hidden", "true");
        preview.append(el);
      } else if (!wanted.has(n.uid) && frame) frame.remove();
    }
  }
  function minimap() {
    const f = current,
      scale = Math.min(152 / f.width, 92 / f.height),
      ox = (168 - f.width * scale) / 2,
      oy = (114 - f.height * scale) / 2;
    minimapGeometry = { scale, ox, oy };
    const x = (-view.x / view.z) * scale + ox,
      y = (-view.y / view.z - f.y) * scale + oy,
      w = (viewport.clientWidth / view.z) * scale,
      h = (viewport.clientHeight / view.z) * scale;
    $("minimap").innerHTML =
      `<defs><clipPath id="mini-clip"><rect x="${ox}" y="${oy}" width="${f.width * scale}" height="${f.height * scale}"></rect></clipPath></defs>${f.nodes.map((n) => `<rect class="minimap-node ${n.key === f.start ? "start" : ""}" x="${n.x * scale + ox}" y="${(n.y - f.y) * scale + oy}" width="${n.width * scale}" height="${n.height * scale}" rx="1"></rect>`).join("")}<rect class="minimap-window" x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#mini-clip)"></rect>`;
  }
  function paint() {
    frameRequest = 0;
    if (destroyed) return;
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
    viewport.style.backgroundSize = `${Math.max(20, 24 * view.z)}px ${Math.max(20, 24 * view.z)}px`;
    viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
    $("zoom-reset").textContent = Math.round(view.z * 100) + "%";
    viewport.dataset.zoom = String(view.z);
    viewport.dataset.panX = String(view.x);
    viewport.dataset.panY = String(view.y);
    visibleFrames();
    minimap();
    emit("viewportchange", { ...view });
  }
  function schedule() {
    if (!destroyed && !frameRequest) frameRequest = requestAnimationFrame(paint);
  }
  function zoomTo(z, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
    z = Math.max(0.18, Math.min(2.2, z));
    const wx = (cx - view.x) / view.z,
      wy = (cy - view.y) / view.z;
    view = { x: cx - wx * z, y: cy - wy * z, z };
    schedule();
  }
  function focusNode(n, resetZoom = false) {
    if (resetZoom) view.z = viewport.clientWidth < 700 ? 0.68 : 0.8;
    view.x = Math.min(64, viewport.clientWidth * 0.08) - n.x * view.z;
    view.y = (viewport.clientWidth < 700 ? 166 : 218) - n.y * view.z;
    schedule();
  }
  function fitFlow() {
    const f = current,
      top = viewport.clientWidth < 700 ? 146 : 185,
      bottom = 80,
      availableW = viewport.clientWidth - 64,
      availableH = viewport.clientHeight - top - bottom,
      z = Math.max(0.18, Math.min(1.1, availableW / f.width, availableH / f.height));
    view = {
      z,
      x: (viewport.clientWidth - f.width * z) / 2,
      y: top + (availableH - f.height * z) / 2 - f.y * z,
    };
    schedule();
  }
  function chooseFlow(id) {
    const f = flowById.get(id);
    if (!f) return;
    clearSelection();
    setCurrent(f);
    const query = normalize($("flow-search").value),
      match = query
        ? f.nodes.find((n) => normalize(`${n.screenId || ""} ${n.title}`).includes(query))
        : null;
    focusNode(match || nodeByKey.get(`${f.id}:${f.start}`), true);
    shell.classList.remove("sidebar-open");
    $("map-menu").setAttribute("aria-expanded", "false");
  }
  function clearSelection() {
    selected = null;
    world.classList.remove("has-selection");
    root
      .querySelectorAll(".flow-node.selected,.flow-node.related-node")
      .forEach((el) => el.classList.remove("selected", "related-node"));
    root.querySelectorAll(".flow-edge.related").forEach((el) => el.classList.remove("related"));
    $("node-details").hidden = true;
  }
  function selectNode(n) {
    clearSelection();
    selected = n;
    setCurrent(flowById.get(n.flowId));
    n.element.classList.add("selected");
    world.classList.add("has-selection");
    const f = current,
      edges = f.edges.filter((a) => a.from === n.key),
      connected = new Set();
    for (const el of root.querySelectorAll(".flow-edge"))
      if (el.dataset.from === n.uid || el.dataset.to === n.uid) {
        el.classList.add("related");
        connected.add(el.dataset.from);
        connected.add(el.dataset.to);
      }
    for (const key of connected) nodeByKey.get(key)?.element.classList.add("related-node");
    $("node-details").innerHTML =
      `<div class="detail-head"><div class="grow"><small>${e(n.screenId || "Process step")}</small><h3>${e(n.title)}</h3></div><button class="icon-button" data-clear-selection aria-label="Clear selection">${icon("x")}</button></div><div data-progress-screen="${e(n.screenId || "")}"></div>${n.screenId ? `<button data-edit-progress="${e(n.screenId)}" data-ui="action" data-variant="secondary">Screen progress</button>` : ""}<h4>Next steps</h4>${
        edges.length
          ? edges
              .map((a) => {
                const to = nodeByKey.get(`${f.id}:${a.to}`);
                return `<button class="detail-edge" data-focus="${to.uid}"><strong>${e(a.label)} →</strong><span>${e(to.title)}${to.screenId ? " · " + to.screenId : ""}</span></button>`;
              })
              .join("")
          : "<p>This is the end of this flow.</p>"
      }${n.screenId ? `<button data-open="${n.uid}" data-ui="action" data-variant="primary">Try this screen</button>` : `<p>${e(n.description)}</p>${n.url ? `<a data-ui="action" data-variant="secondary" href="${e(n.url)}" target="_blank" rel="noopener noreferrer">Open reference ${icon("arrow-up-right")}</a>` : ""}`}`;
    if (!n.screenId) $("node-details").querySelector("[data-progress-screen]").remove();
    progressUI.paint();
    $("node-details").hidden = false;
    emit("select", { flowId: n.flowId, nodeId: n.id });
    minimap();
  }
  let previewNode = null;
  function resizePreview() {
    if (!previewNode || !$("screen-dialog").open) return;
    const v = previewNode.screen.viewport,
      dialog = $("screen-dialog"),
      frame = $("dialog-preview").querySelector("iframe");
    const scale = Math.min(1, dialog.clientWidth / v.width);
    $("dialog-preview").style.width = v.width * scale + "px";
    $("dialog-preview").style.height = v.height * scale + "px";
    frame.style.width = v.width + "px";
    frame.style.height = v.height + "px";
    frame.style.transform = `scale(${scale})`;
    frame.style.transformOrigin = "top left";
  }
  function openScreen(n) {
    if (!n.screenId) {
      selectNode(n);
      return;
    }
    previewNode = n;
    $("dialog-screen-id").textContent = n.screenId;
    $("dialog-title").textContent = n.title;
    $("dialog-open").href = n.url;
    const frame = createFrame(n);
    frame.title = `Try ${n.title}`;
    $("dialog-preview").replaceChildren(frame);
    const dialog = $("screen-dialog");
    dialog.style.setProperty("--dialog-width", n.screen.viewport.width + "px");
    dialog.showModal();
    resizePreview();
    emit("previewopen", { flowId: n.flowId, nodeId: n.id, screenId: n.screenId });
  }
  function point(event) {
    const r = viewport.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }
  function syncCurrentFromPan() {
    const worldY = (viewport.clientHeight / 2 - view.y) / view.z,
      closest = flows.reduce((a, b) =>
        Math.abs(a.y + a.height / 2 - worldY) < Math.abs(b.y + b.height / 2 - worldY) ? a : b,
      );
    if (closest !== current && !selected) setCurrent(closest);
  }
  viewport.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      event.target.closest("button,a,.map-context,.node-details,.map-minimap,.map-bottom")
    )
      return;
    event.preventDefault();
    viewport.focus({ preventScroll: true });
    (event.target.closest("[data-node]") || viewport).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        z: view.z,
        worldX: ((a.x + b.x) / 2 - view.x) / view.z,
        worldY: ((a.y + b.y) / 2 - view.y) / view.z,
      };
      drag = null;
    } else drag = { id: event.pointerId, start: point(event), x: view.x, y: view.y, moved: false };
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()],
        z = Math.max(
          0.18,
          Math.min(2.2, (pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch.distance)),
        );
      view = { z, x: (a.x + b.x) / 2 - pinch.worldX * z, y: (a.y + b.y) / 2 - pinch.worldY * z };
      suppressClick = true;
      schedule();
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    const p = point(event),
      dx = p.x - drag.start.x,
      dy = p.y - drag.start.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) {
      viewport.classList.add("dragging");
      view.x = drag.x + dx;
      view.y = drag.y + dy;
      schedule();
    }
  });
  function pointerEnd(event) {
    if (drag?.moved) suppressClick = true;
    pointers.delete(event.pointerId);
    pinch = null;
    drag = null;
    if (pointers.size === 1) {
      const [id, position] = [...pointers.entries()][0];
      drag = { id, start: position, x: view.x, y: view.y, moved: false };
    }
    viewport.classList.remove("dragging");
    if (event.target.hasPointerCapture?.(event.pointerId))
      event.target.releasePointerCapture(event.pointerId);
    syncCurrentFromPan();
    schedule();
    setTimeout(() => {
      suppressClick = false;
    }, 0);
  }
  viewport.addEventListener("pointerup", pointerEnd);
  viewport.addEventListener("pointercancel", pointerEnd);
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (event.target.closest(".node-details,.map-minimap,.map-zoom")) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const p = point(event);
        zoomTo(view.z * Math.exp(-event.deltaY * 0.002), p.x, p.y);
      } else {
        view.x -= event.deltaX;
        view.y -= event.deltaY;
        syncCurrentFromPan();
        schedule();
      }
    },
    { passive: false },
  );
  viewport.addEventListener("keydown", (event) => {
    if (event.target.closest("button,a,input") || $("screen-dialog").open) return;
    const step = event.shiftKey ? 180 : 80;
    if (event.key === "ArrowLeft") view.x += step;
    else if (event.key === "ArrowRight") view.x -= step;
    else if (event.key === "ArrowUp") view.y += step;
    else if (event.key === "ArrowDown") view.y -= step;
    else if (["+", "="].includes(event.key)) {
      zoomTo(view.z * 1.2);
      event.preventDefault();
      return;
    } else if (event.key === "-") {
      zoomTo(view.z / 1.2);
      event.preventDefault();
      return;
    } else if (event.key.toLowerCase() === "f") {
      fitFlow();
      event.preventDefault();
      return;
    } else if (event.key === "0") {
      focusNode(nodeByKey.get(`${current.id}:${current.start}`), true);
      event.preventDefault();
      return;
    } else if (event.key === "Escape") {
      clearSelection();
      return;
    } else if (event.key === "Enter" && event.target.dataset.node) {
      openScreen(nodeByKey.get(event.target.dataset.node));
      return;
    } else return;
    event.preventDefault();
    syncCurrentFromPan();
    schedule();
  });
  root.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (b?.dataset.flow) {
      chooseFlow(b.dataset.flow);
      return;
    }
    if (b?.dataset.open) {
      openScreen(nodeByKey.get(b.dataset.open));
      return;
    }
    if (b?.dataset.focus) {
      const n = nodeByKey.get(b.dataset.focus);
      focusNode(n);
      selectNode(n);
      return;
    }
    if (b?.hasAttribute("data-clear-selection")) {
      clearSelection();
      return;
    }
    const n = event.target.closest("[data-node]");
    if (n && !suppressClick) {
      selectNode(nodeByKey.get(n.dataset.node));
      return;
    }
    if (event.target === viewport || event.target === world) clearSelection();
  });
  viewport.addEventListener("dblclick", (event) => {
    const n = event.target.closest("[data-node]");
    if (n && !event.target.closest("button")) openScreen(nodeByKey.get(n.dataset.node));
  });
  progressUI = mountProgress(root, config, progressData, options, (id) => {
    const n = nodes.find((n) => n.screenId === id);
    if (n) {
      setCurrent(flowById.get(n.flowId));
      focusNode(n, true);
      selectNode(n);
    }
  });
  $("open-progress").onclick = () => progressUI.open();
  $("node-details").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-progress]");
    if (button) progressUI.edit(button.dataset.editProgress);
  });
  $("flow-search").addEventListener("input", sidebar);
  $("zoom-in").onclick = () => zoomTo(view.z * 1.2);
  $("zoom-out").onclick = () => zoomTo(view.z / 1.2);
  $("zoom-reset").onclick = () => zoomTo(1);
  $("zoom-fit").onclick = fitFlow;
  $("minimap-fit").onclick = fitFlow;
  $("flow-start").onclick = () => {
    clearSelection();
    focusNode(nodeByKey.get(`${current.id}:${current.start}`), true);
  };
  $("minimap").addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    const rect = $("minimap").getBoundingClientRect(),
      x = ((event.clientX - rect.left) * 168) / rect.width,
      y = ((event.clientY - rect.top) * 114) / rect.height;
    view.x = viewport.clientWidth / 2 - ((x - minimapGeometry.ox) / minimapGeometry.scale) * view.z;
    view.y =
      viewport.clientHeight / 2 -
      ((y - minimapGeometry.oy) / minimapGeometry.scale + current.y) * view.z;
    schedule();
  });
  $("map-menu").onclick = () => {
    const open = shell.classList.toggle("sidebar-open");
    $("map-menu").setAttribute("aria-expanded", String(open));
  };
  $("map-help").onclick = () => $("help-dialog").showModal();
  $("close-help").onclick = () => $("help-dialog").close();
  $("close-screen").onclick = () => $("screen-dialog").close();
  $("screen-dialog").addEventListener("close", () => {
    previewNode = null;
    $("dialog-preview").replaceChildren();
  });
  for (const [id, name] of [
    ["map-menu", "layout-grid"],
    ["map-help", "circle-help"],
    ["zoom-in", "plus"],
    ["zoom-out", "minus"],
    ["zoom-fit", "expand"],
    ["close-screen", "x"],
  ])
    $(id).innerHTML = icon(name);
  const observer = new ResizeObserver(() => {
    schedule();
    resizePreview();
  });
  observer.observe(viewport);
  observer.observe($("screen-dialog"));
  const query = new URLSearchParams(options.syncUrl ? location.search : ""),
    requested = query.get("screen"),
    initialNode = requested ? nodes.find((n) => n.screenId === requested) : null;
  current = initialNode
    ? flowById.get(initialNode.flowId)
    : flowById.get(options.initialFlow || query.get("flow")) || flows[0];
  setCurrent(current);
  focusNode(initialNode || nodeByKey.get(`${current.id}:${current.start}`), true);
  paint();
  const ready = stylesReady.then(() => {
    if (destroyed) return;
    host.style.visibility = "";
    focusNode(initialNode || nodeByKey.get(`${current.id}:${current.start}`), true);
    paint();
  });
  const requireNode = (flowId, nodeId) => {
    const n = nodeByKey.get(`${flowId}:${nodeId}`);
    if (!n) throw new RangeError(`Unknown node: ${flowId}/${nodeId}`);
    return n;
  };
  const active = () => {
    if (destroyed) throw new Error("This atlas has been destroyed.");
  };
  return {
    element: host,
    ready,
    goToFlow(id) {
      active();
      if (!flowById.has(id)) throw new RangeError(`Unknown flow: ${id}`);
      $("flow-search").value = "";
      chooseFlow(id);
    },
    focusNode(flowId, nodeId) {
      active();
      const n = requireNode(flowId, nodeId);
      setCurrent(flowById.get(flowId));
      focusNode(n, true);
      selectNode(n);
    },
    openNode(flowId, nodeId) {
      active();
      openScreen(requireNode(flowId, nodeId));
    },
    fit() {
      active();
      fitFlow();
    },
    zoomTo(value) {
      active();
      if (!Number.isFinite(value)) throw new TypeError("Zoom must be a finite number.");
      zoomTo(value);
    },
    getState() {
      return {
        flowId: current.id,
        selectedNodeId: selected?.id ?? null,
        zoom: view.z,
        pan: { x: view.x, y: view.y },
        flowCount: flows.length,
        nodeCount: nodes.length,
        screenCount: screens.size,
        destroyed,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      cancelAnimationFrame(frameRequest);
      for (const dialog of root.querySelectorAll("dialog[open]")) dialog.close();
      host.remove();
    },
  };
}
/** Load relative screen URLs against the JSON file, not the embedding page. */
export async function loadAtlas(container, url, options = {}) {
  const absolute = safeURL(String(url), document.baseURI);
  const response = await fetch(absolute, { signal: options.signal });
  if (!response.ok) throw new Error(`Cannot load atlas: HTTP ${response.status} (${absolute})`);
  const config = await response.json();
  let progressOptions = {};
  if (options.progressEndpoint) {
    const endpoint = safeURL(options.progressEndpoint, absolute);
    const reloadProgress = async () => {
      const r = await fetch(endpoint, { signal: options.signal, cache: "no-store" });
      if (!r.ok) throw new Error(`Cannot load progress: HTTP ${r.status}`);
      return r.json();
    };
    const result = await reloadProgress();
    progressOptions = { progress: result.data, progressRevision: result.revision, reloadProgress };
    if (result.editable && options.progressToken)
      progressOptions.saveProgress = async (screenId, record, revision) => {
        const r = await fetch(endpoint, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Match": revision,
            "X-KetAtlas-Token": options.progressToken,
          },
          body: JSON.stringify({ screenId, record }),
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || `Cannot save: HTTP ${r.status}`);
        return result;
      };
  } else if (!options.progress) {
    const progressURL = new URL(safeURL(options.progressURL || absolute, absolute));
    if (!options.progressURL)
      progressURL.pathname = progressURL.pathname.replace(/\.json$/i, "") + ".progress.json";
    const r = await fetch(progressURL, { signal: options.signal });
    if (r.ok) progressOptions.progress = await r.json();
    else if (r.status !== 404) throw new Error(`Cannot load progress: HTTP ${r.status}`);
  }
  const atlas = createAtlas(container, config, {
    ...options,
    ...progressOptions,
    baseURL: options.baseURL || response.url || absolute,
  });
  try {
    await atlas.ready;
    return atlas;
  } catch (error) {
    atlas.destroy();
    throw error;
  }
}
