// In-page regression assertions; browser drivers only open this fixture and read its result.
const params = new URLSearchParams(location.search);
const packed = params.has("packed");
const { createAtlas } = await import(
  packed ? "/__ketatlas__/dist/index.js" : "/__ketatlas__/src/index.js"
);
const original = await (await fetch("/examples/atlas.json")).json();
const container = document.querySelector("#atlas");
const report = document.querySelector("#test-results");
const checks = [];
const failures = [];
const measurements = [];
const check = (name, condition) => {
  checks.push(name);
  if (!condition) failures.push(name);
};
const box = (el) => el.getBoundingClientRect();
const style = (el) => getComputedStyle(el);
const tick = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const rgba = (value) => {
  const values = value.match(/[\d.]+/g).map(Number);
  return [...values.slice(0, 3), values[3] ?? 1];
};
const background = (el) => {
  const layers = [];
  for (let parent = el; parent; parent = parent.parentElement || parent.getRootNode().host)
    layers.push(rgba(style(parent).backgroundColor));
  return layers
    .reverse()
    .reduce(
      (base, layer) => base.map((n, i) => n * (1 - layer[3]) + layer[i] * layer[3]),
      [255, 255, 255],
    );
};
const luminance = (color) =>
  (Array.isArray(color) ? color : rgba(color).slice(0, 3))
    .map((n) => n / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
let atlas;
const mount = async (config = original, options = {}) => {
  if (atlas) await atlas.previewsReady;
  atlas?.destroy();
  atlas = createAtlas(container, config, {
    baseURL: new URL("/examples/atlas.json", location.href).href,
    assetBaseURL: new URL(packed ? "/__ketatlas__/dist/" : "/__ketatlas__/", location.href).href,
    theme: params.get("theme") || "light",
    ...options,
  });
  window.atlas = atlas;
  await atlas.ready;
  await document.fonts.ready;
  // Wait for two settled rendering passes, including the shadow-root typography.
  let stablePasses = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    await tick();
    const root = atlas.element.shadowRoot;
    const stable =
      box(root.getElementById("map-viewport")).height >= innerHeight - 77 &&
      style(root.querySelector(".flow-link strong")).fontSize === "12px";
    stablePasses = stable ? stablePasses + 1 : 0;
    if (stablePasses === 2) break;
  }
  return atlas.element.shadowRoot;
};
const input = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
// Real keyboard events come from the browser driver, so native Tab and dialog behavior are tested.
const keyboard = (root) =>
  new Promise((resolve) => {
    const mobile = innerWidth < 768;
    const theme = atlas.getState().theme;
    const sync = atlas.getState().syncTheme;
    const step = (key, focus, state) => ({ key, focus, state });
    const flows = [
      step("Tab", '[data-flow="purchase"]'),
      step("Tab", '[data-flow="fulfilment"]'),
      step("Tab", "#theme-toggle"),
      step("Space", "#theme-toggle", () => atlas.getState().theme !== theme),
      step("Tab", "#theme-sync"),
      step("Space", "#theme-sync", () => atlas.getState().syncTheme !== sync),
      step("Shift+Tab", "#theme-toggle"),
      step("Space", "#theme-toggle", () => atlas.getState().theme === theme),
      step("Tab", "#theme-sync"),
      step("Space", "#theme-sync", () => atlas.getState().syncTheme === sync),
    ];
    const screens = [
      step("Enter", "[data-close-screens]", () => root.getElementById("progress-screens").open),
      step("Escape", "#open-progress", () => !root.getElementById("progress-screens").open),
    ];
    const steps = mobile
      ? [
          step(
            "Enter",
            "#flow-search",
            () => root.getElementById("map-menu").getAttribute("aria-expanded") === "true",
          ),
          step(
            "Escape",
            "#map-menu",
            () => root.getElementById("map-menu").getAttribute("aria-expanded") === "false",
          ),
          step("Tab", "#open-progress"),
          ...screens,
          step("Shift+Tab", "#map-menu"),
          step("Enter", "#flow-search"),
          step("Tab", '[data-flow="sign-in"]'),
          ...flows,
          step(
            "Escape",
            "#map-menu",
            () => root.getElementById("map-menu").getAttribute("aria-expanded") === "false",
          ),
        ]
      : [
          ...screens,
          step("Tab", "#map-help"),
          step("Enter", "#close-help", () => root.getElementById("help-dialog").open),
          step("Escape", "#map-help", () => !root.getElementById("help-dialog").open),
          step("Tab", "#flow-search"),
          step("Tab", '[data-flow="sign-in"]'),
          step("Enter", '[data-flow="sign-in"]'),
          ...flows,
        ];
    let index = 0;
    const ready = (last) => {
      report.dataset.keyboard = JSON.stringify({ index, key: steps[index]?.key, last });
      report.textContent = `Keyboard ready ${index}; ${steps[index]?.key || "complete"}`;
    };
    root.getElementById(mobile ? "map-menu" : "open-progress").focus();
    const onKey = async (event) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(event.key) || event.repeat) return;
      const expected = steps[index];
      const key =
        event.key === " "
          ? "Space"
          : event.shiftKey && event.key === "Tab"
            ? "Shift+Tab"
            : event.key;
      await tick();
      check(
        `keyboard ${index + 1}: native key and focus ${expected.focus}`,
        key === expected.key && root.activeElement?.matches(expected.focus),
      );
      if (expected.state) check(`keyboard ${index + 1}: state`, expected.state());
      const focused = root.activeElement;
      const ring = focused?.id === "theme-sync" ? focused.nextElementSibling : focused;
      check(
        `keyboard ${index + 1}: visible focus`,
        Boolean(
          ring && (ring.matches(":focus-visible") || parseFloat(style(ring).outlineWidth) >= 2),
        ),
      );
      const last = {
        key,
        focus: focused?.id || focused?.dataset.flow || focused?.tagName,
        expected: expected.focus,
        state: atlas.getState().theme,
        failures: failures.length,
      };
      index++;
      if (index === steps.length) {
        root.removeEventListener("keydown", onKey);
        resolve();
      } else ready(last);
    };
    root.addEventListener("keydown", onKey);
    ready();
  });
const fits = (el) => box(el).right <= innerWidth + 1 && box(el).left >= -1;
const geometry = (root, scenario) => {
  const get = (selector) => root.querySelector(selector);
  const mobile = box(container).width < 768;
  const header = box(get(".map-header"));
  const canvas = box(get("#map-viewport"));
  const status = box(get(".map-statusbar"));
  const toolbar = box(get(".map-zoom"));
  const action = box(get("#open-progress"));
  check(`${scenario}: compact header`, header.height === (mobile ? 52 : 40));
  check(`${scenario}: context strip removed`, !get(".map-context"));
  check(`${scenario}: workflow ordinal restored`, Boolean(get(".flow-number")));
  check(
    `${scenario}: sidebar heading and count restored`,
    get(".map-sidebar-heading h1").textContent === "Workflows" &&
      Number(get("#flow-count").textContent) === 3,
  );
  check(
    `${scenario}: search follows sidebar heading`,
    get(".map-sidebar-heading").nextElementSibling.contains(get("#flow-search")) &&
      !get(".map-header").querySelector("input[type='search'], #open-flow-search"),
  );
  check(`${scenario}: status strip`, status.height === 24);
  check(`${scenario}: compact action`, action.height === (mobile ? 32 : 28));
  check(
    `${scenario}: toolbar fits canvas`,
    toolbar.width <= canvas.width && toolbar.bottom <= canvas.bottom,
  );
  check(
    `${scenario}: aligned workspace boundaries`,
    canvas.y === header.bottom && status.y === canvas.bottom,
  );
  check(`${scenario}: canvas retains useful height`, canvas.height >= innerHeight - 77);
  check(
    `${scenario}: no document overflow`,
    document.documentElement.scrollWidth === innerWidth &&
      document.documentElement.scrollHeight === innerHeight,
  );
  check(`${scenario}: header controls fit`, fits(get("#open-progress")) && fits(get("#map-help")));
  check(`${scenario}: title has full-value tooltip`, Boolean(get(".flow-link.active").title));
  check(`${scenario}: default minimap hidden`, get("#map-minimap").hidden);
  check(
    `${scenario}: start command belongs to canvas toolbar`,
    get(".map-zoom").contains(get("#flow-start")),
  );
  if (!mobile) {
    const search = box(get("#flow-search"));
    check(
      `${scenario}: search fits sidebar without overlapping workflows`,
      search.y >= header.bottom &&
        search.bottom <= box(get("#flow-list")).y &&
        search.right <= box(get(".map-sidebar")).right,
    );
    check(
      `${scenario}: topbar controls align to whole vertical pixels`,
      [get("#flow-search"), get("#open-progress"), get("#map-help")].every((element) =>
        Number.isInteger(box(element).y),
      ),
    );
    check(
      `${scenario}: search fits restored row`,
      box(get("#flow-search")).height === 34 && fits(get("#flow-search")),
    );
    const footer = box(get(".map-sidebar-footer"));
    const theme = box(get("#theme-toggle"));
    const sync = box(get(".theme-sync"));
    check(
      `${scenario}: current theme footer stays one row`,
      footer.height === 45 && Math.abs(theme.y + theme.height / 2 - sync.y - sync.height / 2) < 1,
    );
  }
  if (!mobile) {
    check(`${scenario}: restored sidebar width`, box(get(".map-sidebar")).width === 256);
    check(`${scenario}: restored workflow row`, box(get(".flow-link")).height >= 56);
    check(
      `${scenario}: readable workflow type`,
      style(get(".flow-link strong")).fontSize === "12px",
    );
  }
  for (const selector of [
    ".map-brand strong",
    ".flow-group-title",
    ".flow-link.active strong",
    ".theme-sync",
    "#zoom-reset",
    "#preload-status",
  ]) {
    const el = get(selector);
    check(
      `${scenario}: AA text contrast ${selector}`,
      contrast(style(el).color, background(el)) >= 4.5,
    );
  }
  measurements.push({
    scenario,
    viewport: [innerWidth, innerHeight],
    header: header.height,
    context: "removed",
    sidebar: mobile ? "drawer" : 256,
    canvas: canvas.height,
    toolbar: toolbar.height,
    action: action.height,
  });
};
try {
  let root = await mount();
  geometry(root, "default");
  await atlas.previewsReady;
  check(
    "previews: selected flow is ready",
    atlas.getState().preload.loaded === 4 && atlas.getState().preload.failed === 0,
  );
  const get = (id) => root.getElementById(id);
  const mobile = innerWidth < 768;
  if (mobile) {
    get("map-menu").click();
    check(
      "drawer: visible and announced",
      get("map-menu").getAttribute("aria-expanded") === "true" &&
        style(get("map-sidebar")).display === "flex",
    );
    check("drawer: search receives focus", root.activeElement === get("flow-search"));
    check(
      "drawer: current theme footer fits one touch row",
      box(root.querySelector(".map-sidebar-footer")).height === 61,
    );
    check(
      "drawer: touch targets",
      box(get("theme-toggle")).height >= 44 && box(get("map-menu")).width >= 44,
    );
    root.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    check(
      "drawer: Escape and focus return",
      get("map-menu").getAttribute("aria-expanded") === "false" &&
        root.activeElement === get("map-menu"),
    );
  }
  if (mobile) {
    get("map-menu").click();
    check(
      "search: mobile drawer exposes field and results",
      get("map-menu").getAttribute("aria-expanded") === "true" &&
        root.activeElement === get("flow-search"),
    );
    check(
      "search: mobile field fits drawer",
      fits(get("flow-search")) &&
        box(get("flow-search")).bottom <= box(get("flow-list")).y &&
        box(get("flow-search")).height === 40 &&
        style(get("flow-search")).fontSize === "16px" &&
        box(root.querySelector(".map-header")).height === 52,
    );
  }
  input(get("flow-search"), "no-matching-synthetic-workflow");
  check(
    "search: filtered empty state",
    root.querySelector(".mock-filter-empty")?.textContent.includes("No matching workflows"),
  );
  root.querySelector("[data-clear-flow-search]").click();
  check(
    "search: recovery restores results and focus",
    root.querySelectorAll(".flow-link").length === 3 && root.activeElement === get("flow-search"),
  );
  check("search: focus indicator", parseFloat(style(get("flow-search")).outlineWidth) >= 2);
  if (mobile) {
    check(
      "search: clearing keeps mobile results visible",
      get("map-menu").getAttribute("aria-expanded") === "true",
    );
    get("flow-search").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    check(
      "search: Escape closes drawer and restores opener focus",
      get("map-menu").getAttribute("aria-expanded") === "false" &&
        root.activeElement === get("map-menu"),
    );
    get("map-menu").click();
  }
  input(get("flow-search"), "delivery");
  check("search: screen content finds workflow", root.querySelectorAll(".flow-link").length === 1);
  root.querySelector(".flow-link").click();
  check(
    "search: choosing result retains selection and keyboard focus",
    atlas.getState().flowId === "fulfilment" &&
      root.activeElement ===
        (mobile ? get("map-viewport") : root.querySelector(".flow-link.active")) &&
      get("map-menu").getAttribute("aria-expanded") === "false",
  );
  input(get("flow-search"), "");
  atlas.goToFlow("purchase");
  check(
    "selection: current workflow is exposed",
    root.querySelector('[data-flow="purchase"]').getAttribute("aria-current") === "true",
  );
  const camera = atlas.getState();
  get("theme-toggle").click();
  check(
    "theme toggle: changes theme and announces state",
    atlas.getState().theme !== camera.theme &&
      get("theme-toggle").getAttribute("aria-pressed") ===
        String(atlas.getState().theme === "dark"),
  );
  get("theme-toggle").click();
  check("theme toggle: restores theme", atlas.getState().theme === camera.theme);
  const sync = atlas.getState().syncTheme;
  get("theme-sync").click();
  check("sync switch: changes state", atlas.getState().syncTheme !== sync);
  get("theme-sync").click();
  check("sync switch: restores state", atlas.getState().syncTheme === sync);
  const startCamera = atlas.getState();
  get("zoom-in").click();
  get("flow-start").click();
  check(
    "start: relocated control restores camera",
    atlas.getState().zoom === startCamera.zoom &&
      JSON.stringify(atlas.getState().pan) === JSON.stringify(startCamera.pan),
  );

  atlas.setTheme(camera.theme === "dark" ? "light" : "dark");
  check(
    "theme: preserves camera",
    JSON.stringify(atlas.getState().pan) === JSON.stringify(camera.pan) &&
      atlas.getState().zoom === camera.zoom,
  );
  atlas.setTheme(camera.theme);
  get("toggle-minimap").click();
  check(
    "minimap: expanded state",
    !get("map-minimap").hidden && get("toggle-minimap").getAttribute("aria-expanded") === "true",
  );
  get("toggle-minimap").click();
  get("map-help").click();
  check("help: compact dialog fits", get("help-dialog").open && fits(get("help-dialog")));
  get("close-help").click();
  get("open-progress").click();
  check("screens: dialog fits", get("progress-screens").open && fits(get("progress-screens")));
  check(
    "screens: summary does not overflow",
    get("progress-summary").scrollWidth <= get("progress-summary").clientWidth + 1,
  );
  if (!mobile) {
    const centers = [
      get("progress-search"),
      get("progress-filter"),
      get("progress-flow"),
      root.querySelector(".progress-filters .progress-toggle"),
    ].map((el) => box(el).y + box(el).height / 2);
    check(
      "screens: filter control centers align",
      Math.max(...centers) - Math.min(...centers) <= 1,
    );
  }
  input(get("progress-search"), "missing-synthetic-screen");
  check(
    "screens: filtered empty state",
    get("progress-rows").textContent.includes("No screens match"),
  );
  input(get("progress-search"), "");
  root.querySelector("[data-progress-edit]").click();
  check(
    "read-only: compact editor fits",
    get("progress-editor").open && fits(get("progress-editor")),
  );
  check("read-only: fields are disabled", root.querySelector("#progress-fields fieldset").disabled);
  check(
    "read-only: saving unavailable",
    get("progress-save").disabled || get("progress-save").hidden,
  );
  root.querySelector("[data-close-editor]").click();
  root.querySelector("[data-close-screens]").click();
  const long = structuredClone(original);
  long.title = "A very long workspace title ".repeat(6);
  long.flows[0].title = "A very long workflow with multilingual information ".repeat(6);
  long.flows[0].description = "Long explanatory text ".repeat(30);
  long.screens[0].title = "A very long screen title ".repeat(6);
  root = await mount(long);
  geometry(root, "long content");
  check(
    "long content: workflow tooltip retains full title",
    root.querySelector(".flow-link").title === long.flows[0].title,
  );
  check(
    "long content: screen tooltip retains full title",
    root.querySelector(".node-head h3").title === long.screens[0].title,
  );
  root = await mount(original, {
    saveProgress: async () => {
      throw new Error("Synthetic save failure. Retry with the draft intact.");
    },
    reloadProgress: async () => {
      throw new Error("Synthetic offline failure. Reconnect and retry.");
    },
  });
  root.getElementById("open-progress").click();
  const headerActions = [
    root.getElementById("progress-refresh"),
    root.querySelector("[data-close-screens]"),
  ];
  const headerCenters = headerActions.map((el) => box(el).y + box(el).height / 2);
  check(
    "refresh: header actions align",
    Math.max(...headerCenters) - Math.min(...headerCenters) <= 1,
  );
  root.querySelector("[data-progress-edit]").click();
  input(root.querySelector('[data-record="owner"]'), "Synthetic reviewer");
  root
    .getElementById("progress-form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  check("saving: disabled submit", root.getElementById("progress-save").disabled);
  await tick();
  check(
    "error: save retains draft and recovery",
    root.getElementById("progress-error").textContent.includes("Synthetic save failure") &&
      root.querySelector('[data-record="owner"]').value === "Synthetic reviewer" &&
      !root.getElementById("progress-reload-latest").hidden,
  );
  // Restore the draft before closing so the fixture never asks for discard confirmation.
  input(root.querySelector('[data-record="owner"]'), "");
  root.querySelector("[data-close-editor]").click();
  root.getElementById("progress-refresh").click();
  await tick();
  check(
    "offline: refresh error is actionable",
    root.getElementById("progress-message").textContent.includes("Synthetic offline failure"),
  );
  root.querySelector("[data-close-screens]").click();
  if (params.has("large")) {
    const config = {
      version: 1,
      title: "Synthetic large process",
      screens: [],
      flows: [
        {
          id: "large",
          title: "10,000 process steps",
          nodes: Array.from({ length: 10000 }, (_, i) => ({
            id: `step-${i}`,
            type: "note",
            title: `Step ${i + 1}`,
            column: i % 100,
            row: Math.floor(i / 100),
          })),
          edges: [],
        },
      ],
    };
    root = await mount(config, { preloadScreens: false });
    check(
      "large data: renders all authored steps",
      root.querySelectorAll(".flow-node").length === 10000,
    );
    check(
      "large data: bounded canvas",
      root.getElementById("map-viewport").clientWidth <= innerWidth,
    );
  }
  root = await mount(original);
  if (params.has("keyboard")) await keyboard(root);
  if (params.has("zoom")) {
    container.style.cssText = "zoom:2;width:50vw;height:50dvh";
    await tick();
    check(
      "200% CSS zoom: no document overflow",
      document.documentElement.scrollWidth === innerWidth &&
        document.documentElement.scrollHeight === innerHeight,
    );
    check(
      "200% CSS zoom: toolbar remains inside canvas",
      box(root.querySelector(".map-zoom")).width <= box(root.getElementById("map-viewport")).width,
    );
  }
} catch (error) {
  failures.push(error.stack);
}
const result = {
  viewport: [innerWidth, innerHeight],
  scale: devicePixelRatio,
  theme: params.get("theme") || "light",
  passed: checks.length - failures.length,
  total: checks.length,
  failures,
  measurements,
};
window.compactWorkspaceResult = result;
report.dataset.result = JSON.stringify(result);
report.textContent = `${failures.length ? "FAIL" : "PASS"}: ${result.passed}/${result.total} compact workspace checks; ${result.viewport.join("×")}; ${result.theme}; ${result.scale}x${failures.length ? `; ${failures.join(" | ")}` : ""}`;
