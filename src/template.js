export const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function template(config) {
  return `<div class="flow-page" data-kv-design-system>
    <header class="map-header">
      <button id="map-menu" class="icon-button" aria-label="Choose a flow" aria-expanded="false" aria-controls="map-sidebar"></button>
      <div class="map-brand"><span class="brand-mark">K</span><span><strong>${escapeHTML(config.title)}</strong><small>KetAtlas · Workflow atlas</small></span></div>
      <span id="map-total" class="map-total"></span>
      <div class="map-header-actions"><div id="project-progress" class="project-progress" role="group" aria-label="Project progress"></div><button id="open-progress" data-ui="action" data-variant="secondary">Screens</button><button id="map-help" class="icon-button" aria-label="Help"></button></div>
    </header>
    <div class="map-layout">
      <aside id="map-sidebar" class="map-sidebar">
        <div class="map-sidebar-heading"><h1>Workflows</h1><p>Choose a flow. Follow the journey.</p></div>
        <div class="review-search"><input id="flow-search" type="search" aria-label="Search flows and screens" placeholder="Search flows, screens, IDs…"></div>
        <nav id="flow-list" aria-label="Workflows"></nav>
        <div class="map-sidebar-footer"><span class="map-live-dot"></span><p>Real HTML, connected.<br>Double-click a screen to try it.</p></div>
      </aside>
      <main id="map-viewport" class="map-viewport" tabindex="0" role="region" aria-label="Interactive workflow map" aria-describedby="map-instructions">
        <div id="map-world" class="map-world"><svg id="map-edges" class="map-edges" aria-hidden="true"></svg><div id="map-lanes"></div><div id="map-nodes"></div></div>
        <div class="map-context"><div class="map-context-text"><span id="flow-position"></span><h2 id="current-flow-title"></h2><p id="current-flow-description"></p></div><button id="flow-start" data-ui="action" data-variant="secondary">Back to start</button></div>
        <div class="map-legend"><span><i class="main"></i>Primary</span><span><i class="branch"></i>Conditional</span><span><i class="recovery"></i>Recovery</span></div>
        <div id="node-details" class="node-details" hidden></div>
        <div class="map-bottom"><p id="map-instructions">Drag to explore · Scroll to pan · Ctrl/⌘ + scroll to zoom</p><div class="map-zoom">
          <button id="zoom-out" class="icon-button" aria-label="Zoom out"></button><button id="zoom-reset" title="Reset to 100%">100%</button><button id="zoom-in" class="icon-button" aria-label="Zoom in"></button><span class="map-control-divider"></span><button id="zoom-fit" class="icon-button" aria-label="Fit current flow" title="Fit flow · F"></button>
        </div></div>
        <div class="map-minimap"><span>Current flow</span><svg id="minimap" viewBox="0 0 168 114" role="img" aria-label="Current viewport position"></svg><button id="minimap-fit">Fit entire flow</button></div>
      </main>
    </div>
    <dialog id="screen-dialog" class="screen-dialog" aria-labelledby="dialog-title"><header><div><small id="dialog-screen-id"></small><h2 id="dialog-title"></h2></div><button id="close-screen" class="icon-button" aria-label="Close preview"></button></header><div id="dialog-preview"></div><footer><div id="dialog-progress" class="preview-progress"></div><div class="preview-actions"><button id="dialog-progress-details" data-ui="action" data-variant="secondary">Progress details</button><a id="dialog-open" data-ui="action" data-variant="secondary" target="_blank" rel="noopener noreferrer">Open in new tab</a></div></footer></dialog>
    <dialog id="help-dialog" class="help-dialog" aria-labelledby="help-title"><h2 id="help-title">Explore the whole journey</h2><ul>
      <li>Drag the canvas or a screen card to move around.</li><li>Use + / −, Ctrl/⌘ + scroll, or pinch to zoom.</li><li>Choose a workflow in the sidebar. Fit the flow to see every branch.</li><li>Click a node to follow its outgoing steps. Double-click a screen to interact.</li><li>Use arrow keys to pan, F to fit, 0 to return to the start, and Escape to close.</li>
    </ul><p>Arrows describe the authored flow. Embedded screens keep their own behavior.</p><button id="close-help" data-ui="action" data-variant="primary">Got it</button></dialog>
  </div>`;
}
