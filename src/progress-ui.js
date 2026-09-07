import { escapeHTML as e } from "./template.js";
import {
  progressFor,
  progressStatuses,
  summarizeProgress,
  summarizeFlowProgress,
  requireProgress,
} from "./progress.js";
import { safeURL } from "./config.js";
const optionsHTML = (values, selected) =>
  Object.entries(values)
    .map(
      ([v, title]) =>
        `<option value="${e(v)}" ${v === selected ? "selected" : ""}>${e(title)}</option>`,
    )
    .join("");
export function mountProgress(root, config, initial, options, selectScreen) {
  let data = requireProgress(initial, config),
    revision = options.progressRevision,
    editing,
    draft,
    baseline,
    saving = false;
  const $ = (id) => root.getElementById(id);
  const container = document.createElement("div");
  container.innerHTML = `
    <dialog id="progress-screens" class="progress-workspace" aria-labelledby="progress-title">
      <header class="progress-header"><div><small>DELIVERY OVERVIEW</small><h2 id="progress-title">Screens</h2><p>One record per screen, across every workflow.</p></div><button data-close-screens data-ui="action" data-variant="secondary">Close</button></header>
      <div id="progress-summary" class="progress-summary"></div>
      <div class="progress-filters"><label>Search screens<input id="progress-search" type="search" placeholder="Name, ID, task or owner"></label><label>Status<select id="progress-filter"><option value="">All statuses</option>${optionsHTML(progressStatuses)}</select></label><label>Workflow<select id="progress-flow"><option value="">All workflows</option>${config.flows.map((f) => `<option value="${e(f.id)}">${e(f.title)}</option>`).join("")}</select></label><label class="progress-toggle"><input id="progress-blocked" type="checkbox">Blocked only</label><button id="progress-refresh" data-ui="action" data-variant="secondary">Refresh progress</button></div>
      <p id="progress-message" role="status"></p><div class="progress-table-wrap"><table class="progress-table"><thead><tr><th>Screen</th><th>Status</th><th>Checks</th><th>Owner</th><th>Last updated</th><th></th></tr></thead><tbody id="progress-rows"></tbody></table></div>
    </dialog>
    <dialog id="progress-editor" class="progress-editor" aria-labelledby="progress-editor-title">
      <header class="progress-header"><div><small id="progress-screen-id"></small><h2 id="progress-editor-title"></h2></div><button data-close-editor data-ui="action" data-variant="secondary">Close</button></header>
      <form id="progress-form"><div id="progress-fields"></div><p id="progress-error" role="alert"></p><button id="progress-reload-latest" type="button" data-ui="action" data-variant="secondary" hidden>Reload latest and discard draft</button><footer class="progress-actions"><span id="progress-save-hint"></span><button id="progress-save" type="submit" data-ui="action" data-variant="primary">Save progress</button></footer></form>
    </dialog>`;
  root.querySelector(".flow-page").append(...container.childNodes);
  const badge = (r) =>
    `<span class="progress-badge" data-status="${e(r.status)}">${e(progressStatuses[r.status])}</span>${r.blocker?.trim() ? '<span class="progress-blocked">Blocked</span>' : ""}`;
  const record = (id) => progressFor(data, id);
  function paintSidebar() {
    for (const el of root.querySelectorAll("[data-progress-flow], #sidebar-progress")) {
      const flow =
        el.id === "sidebar-progress"
          ? { nodes: config.screens.map((s) => ({ screen: s.id })) }
          : config.flows.find((f) => f.id === el.dataset.progressFlow);
      const summary = summarizeFlowProgress(data, flow);
      el.hidden = !summary.total;
      if (!summary.total) {
        el.textContent = "";
        el.removeAttribute("title");
        el.removeAttribute("aria-label");
        continue;
      }
      const statuses = Object.entries(progressStatuses)
        .filter(([key]) => summary.counts[key])
        .map(([key, label]) => `${summary.counts[key]} ${label.toLowerCase()}`)
        .join(" · ");
      const checks = summary.checks;
      const details = `${summary.verifiedPercent}% verified · ${summary.counts.verified}/${summary.total} screens. ${statuses}${summary.blocked ? ` · ${summary.blocked} blocked` : ""}. ${checks.total ? `Checks ${checks.percent}% · ${checks.done}/${checks.total}` : "No checks recorded"}${checks.unscoped ? ` · ${checks.unscoped} unscoped` : ""}.`;
      el.textContent = `${summary.verifiedPercent}%`;
      el.title = details;
      el.setAttribute("aria-label", details);
      el.dataset.tone = summary.blocked
        ? "blocked"
        : summary.verifiedPercent === 100
          ? "complete"
          : "pending";
    }
  }
  function paint() {
    paintSidebar();
    for (const el of root.querySelectorAll("[data-progress-screen]"))
      el.innerHTML = badge(record(el.dataset.progressScreen));
    const summary = summarizeProgress(data, config.screens);
    $("progress-summary").innerHTML =
      `<div><strong>${summary.total}</strong><span>Total screens</span></div>` +
      Object.entries(progressStatuses)
        .map(
          ([key, label]) =>
            `<div><strong>${summary.counts[key]}</strong><span>${label}</span></div>`,
        )
        .join("");
    const q = $("progress-search").value.toLocaleLowerCase(),
      state = $("progress-filter").value,
      flow = $("progress-flow").value;
    const rows = config.screens.filter((s) => {
      const r = record(s.id);
      return (
        (!q ||
          `${s.id} ${s.title} ${r.owner || ""} ${(r.tasks || []).join(" ")}`
            .toLocaleLowerCase()
            .includes(q)) &&
        (!state || r.status === state) &&
        (!$("progress-blocked").checked || r.blocker?.trim()) &&
        (!flow || config.flows.find((f) => f.id === flow).nodes.some((n) => n.screen === s.id))
      );
    });
    $("progress-rows").innerHTML =
      rows
        .map((s) => {
          const r = record(s.id),
            checks = r.checks || [];
          return `<tr><td><button class="progress-screen-link" data-progress-edit="${e(s.id)}"><strong>${e(s.title)}</strong><small>${e(s.id)}</small></button>${r.blocker ? `<p class="progress-blocker-note">${e(r.blocker)}</p>` : ""}</td><td>${badge(r)}</td><td>${checks.length ? `${checks.filter((c) => c.done).length} / ${checks.length}` : "Not scoped"}</td><td>${e(r.owner || "Unassigned")}</td><td>${r.updatedAt ? e(new Date(r.updatedAt).toLocaleDateString("en-GB")) : "Not assessed"}</td><td><button data-progress-map="${e(s.id)}" data-ui="action" data-variant="secondary">View in map</button></td></tr>`;
        })
        .join("") || '<tr><td colspan="6">No screens match these filters.</td></tr>';
  }
  const input = (label, key, value, multiline = false) =>
    `<label>${label}${multiline ? `<textarea data-record="${key}" rows="3">${e(value || "")}</textarea>` : `<input data-record="${key}" value="${e(value || "")}">`}</label>`;
  function renderEditor() {
    const r = draft,
      editable = typeof options.saveProgress === "function";
    $("progress-fields").innerHTML =
      `<fieldset ${editable ? "" : "disabled"}><div class="progress-form-grid"><label>Status<select data-record="status">${optionsHTML(progressStatuses, r.status)}</select></label>${input("Owner", "owner", r.owner)}${input("Task IDs (comma-separated)", "tasks", (r.tasks || []).join(", "))}</div>${input("Scope and remaining work", "summary", r.summary, true)}${input("Blocker and next action", "blocker", r.blocker, true)}
      <section class="progress-section"><div class="progress-section-head"><h3>Acceptance checks</h3><button type="button" data-add-check data-ui="action" data-variant="secondary">Add check</button></div><p>Completed checks need evidence. Verified screens need passed tests for every check.</p><div id="progress-checks">${(r.checks || []).map((c, i) => `<div class="progress-check" data-check="${i}"><label class="progress-toggle"><input type="checkbox" data-check-field="done" ${c.done ? "checked" : ""}>Done</label><label>Acceptance criterion<textarea data-check-field="title" rows="2" required>${e(c.title)}</textarea></label><details class="progress-check-evidence" ${!c.title ? "open" : ""}><summary>Evidence · ${c.evidenceIds?.length || 0} linked</summary>${(r.evidence || []).map((ev) => `<label class="progress-toggle"><input type="checkbox" data-check-evidence="${e(ev.id)}" ${c.evidenceIds?.includes(ev.id) ? "checked" : ""}>${e(ev.title || ev.id)}</label>`).join("") || "<small>Add evidence below first.</small>"}</details>${c.nodes?.length ? `<small>States: ${e(c.nodes.map((n) => `${n.flowId} / ${n.nodeId}`).join(", "))}</small>` : ""}<button type="button" data-remove-check="${i}" class="progress-remove">Remove check</button></div>`).join("") || '<p class="progress-empty">No acceptance criteria recorded yet.</p>'}</div></section>
      <section class="progress-section"><div class="progress-section-head"><h3>Evidence</h3><button type="button" data-add-evidence data-ui="action" data-variant="secondary">Add evidence</button></div><p>A merged PR proves code landed. A passed test records what was checked, where and at which revision.</p>${(r.evidence || []).map((ev, i) => `<details class="progress-evidence" data-evidence="${i}" ${!ev.title || !ev.url ? "open" : ""}><summary>${e(ev.title || "New evidence")} <small>${e(ev.state || ev.kind)}</small></summary><div class="progress-form-grid"><label>Kind<select data-evidence-field="kind">${optionsHTML({ pr: "Pull request", test: "Test", release: "Release / pin", reference: "Reference" }, ev.kind)}</select></label><label>Title<input data-evidence-field="title" value="${e(ev.title)}" required></label></div><label>Evidence URL<input data-evidence-field="url" value="${e(ev.url)}" required></label><div class="progress-form-grid"><label>Result / state<input data-evidence-field="state" value="${e(ev.state || "")}" placeholder="merged, passed, failed…"></label><label>Revision<input data-evidence-field="revision" value="${e(ev.revision || "")}"></label><label>Environment<input data-evidence-field="environment" value="${e(ev.environment || "")}" placeholder="CI, staging…"></label></div><button type="button" data-remove-evidence="${i}" class="progress-remove">Remove evidence</button></details>`).join("") || '<p class="progress-empty">No evidence recorded yet.</p>'}</section></fieldset>
      <div class="progress-evidence-links">${(r.evidence || [])
        .map((ev) => {
          let url;
          try {
            url = safeURL(ev.url, options.baseURL || document.baseURI);
          } catch {
            return "";
          }
          return `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(ev.title || ev.id)} ↗</a>`;
        })
        .join("")}</div>`;
    $("progress-save").hidden = !editable;
    $("progress-save-hint").textContent = editable
      ? "Saved to the project's progress file."
      : "Read-only. Use the local KetAtlas server to edit.";
  }
  function collect() {
    for (const el of $("progress-fields").querySelectorAll("[data-record]"))
      draft[el.dataset.record] =
        el.dataset.record === "tasks"
          ? el.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : el.value;
    for (const el of $("progress-fields").querySelectorAll("[data-check]")) {
      const c = draft.checks[Number(el.dataset.check)];
      c.title = el.querySelector('[data-check-field="title"]').value;
      c.done = el.querySelector('[data-check-field="done"]').checked;
      c.evidenceIds = [...el.querySelectorAll("[data-check-evidence]:checked")].map(
        (e) => e.dataset.checkEvidence,
      );
    }
    for (const el of $("progress-fields").querySelectorAll("[data-evidence]"))
      for (const field of el.querySelectorAll("[data-evidence-field]"))
        draft.evidence[Number(el.dataset.evidence)][field.dataset.evidenceField] = field.value;
  }
  function edit(id) {
    editing = id;
    draft = structuredClone(record(id));
    $("progress-screen-id").textContent = id;
    $("progress-editor-title").textContent = config.screens.find((s) => s.id === id).title;
    $("progress-error").textContent = "";
    $("progress-reload-latest").hidden = true;
    renderEditor();
    collect();
    baseline = JSON.stringify(draft);
    $("progress-editor").showModal();
  }
  const closeEditor = () => {
    if (saving) return;
    collect();
    if (
      options.saveProgress &&
      JSON.stringify(draft) !== baseline &&
      !window.confirm("Discard unsaved progress changes?")
    )
      return;
    $("progress-editor").close();
  };
  $("progress-editor").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEditor();
  });
  container.remove();
  root.querySelector("[data-close-editor]").onclick = closeEditor;
  root.querySelector("[data-close-screens]").onclick = () => $("progress-screens").close();
  for (const id of ["progress-search", "progress-filter", "progress-flow", "progress-blocked"])
    $(id).addEventListener("input", paint);
  $("progress-refresh").hidden = !options.reloadProgress;
  $("progress-refresh").onclick = async () => {
    try {
      const next = await options.reloadProgress();
      data = requireProgress(next.data, config);
      revision = next.revision;
      paint();
      $("progress-message").textContent = "Progress refreshed.";
    } catch (err) {
      $("progress-message").textContent = err.message;
    }
  };
  $("progress-rows").onclick = (event) => {
    const editButton = event.target.closest("[data-progress-edit]"),
      map = event.target.closest("[data-progress-map]");
    if (editButton) edit(editButton.dataset.progressEdit);
    if (map) {
      $("progress-screens").close();
      selectScreen(map.dataset.progressMap);
    }
  };
  $("progress-fields").onclick = (event) => {
    const button = event.target.closest("button");
    if (!button || !options.saveProgress) return;
    collect();
    if (button.hasAttribute("data-add-check"))
      (draft.checks ||= []).push({
        id: "check-" + crypto.randomUUID(),
        title: "",
        done: false,
        evidenceIds: [],
      });
    else if (button.hasAttribute("data-add-evidence"))
      (draft.evidence ||= []).push({
        id: "evidence-" + crypto.randomUUID(),
        kind: "pr",
        title: "",
        url: "",
      });
    else if (button.hasAttribute("data-remove-check"))
      draft.checks.splice(Number(button.dataset.removeCheck), 1);
    else if (button.hasAttribute("data-remove-evidence")) {
      const [removed] = draft.evidence.splice(Number(button.dataset.removeEvidence), 1);
      for (const c of draft.checks || [])
        c.evidenceIds = c.evidenceIds?.filter((id) => id !== removed.id);
    }
    renderEditor();
  };
  $("progress-reload-latest").onclick = async () => {
    if (
      saving ||
      !options.reloadProgress ||
      !window.confirm("Discard this draft and load the latest saved progress?")
    )
      return;
    try {
      const result = await options.reloadProgress();
      data = requireProgress(result.data, config);
      revision = result.revision;
      draft = structuredClone(record(editing));
      renderEditor();
      collect();
      baseline = JSON.stringify(draft);
      paint();
      $("progress-error").textContent = "";
      $("progress-reload-latest").hidden = true;
    } catch (err) {
      $("progress-error").textContent = err.message;
    }
  };
  $("progress-form").onsubmit = async (event) => {
    event.preventDefault();
    if (saving || !options.saveProgress) return;
    collect();
    saving = true;
    $("progress-save").disabled = true;
    try {
      const next = structuredClone(data);
      Object.defineProperty(next.screens, editing, { value: draft, enumerable: true });
      requireProgress(next, config);
      const result = await options.saveProgress(editing, draft, revision);
      data = requireProgress(result.data, config);
      revision = result.revision;
      paint();
      $("progress-editor").close();
    } catch (err) {
      $("progress-error").textContent = err.message;
      $("progress-reload-latest").hidden = !options.reloadProgress;
    } finally {
      saving = false;
      $("progress-save").disabled = false;
    }
  };
  paint();
  return {
    edit,
    paint,
    paintSidebar,
    open() {
      paint();
      $("progress-screens").showModal();
    },
  };
}
