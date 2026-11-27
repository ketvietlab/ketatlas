import { icons } from "./icons.js";
import { atlasMark } from "./brand.js";

export const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function template(config) {
  return `<div class="flow-page" data-kv-design-system>
    <header class="map-header">
      <div class="map-header-start"><button id="map-menu" class="icon-button" aria-label="Choose a flow" aria-expanded="false" aria-controls="map-sidebar"></button>
      <div class="map-brand"><span class="brand-mark" title="KétAtlas">${atlasMark}</span><span class="brand-copy"><small>KétAtlas</small><strong title="${escapeHTML(config.title)}">${escapeHTML(config.title)}</strong></span></div>
      <span id="map-total" class="map-total"></span></div>
      <div class="map-header-actions"><div id="project-progress" class="project-progress" role="group" aria-label="Project progress"></div><button id="open-progress" aria-label="Screens" title="Screen delivery progress" data-ui="action" data-size="compact" data-variant="secondary">${icons["layout-grid"]}<span>Screens</span></button><button id="map-help" class="icon-button" aria-label="Help"></button></div>
    </header>
    <div class="map-layout">
      <aside id="map-sidebar" class="map-sidebar">
        <div class="map-sidebar-heading"><h1>Workflows</h1><span id="flow-count" class="sidebar-count"></span></div>
        <div class="sidebar-search">${icons.search}<input id="flow-search" type="search" aria-label="Search flows and screens" title="Search flows and screens" placeholder="Find a flow or screen…"></div>
        <nav id="flow-list" aria-label="Workflows"></nav>
        <div class="map-sidebar-footer">
          <button id="theme-toggle" class="icon-button" aria-label="Dark theme" aria-pressed="false" title="Switch to dark theme">${icons.sun}</button>
          <label class="theme-sync" title="Compatible screens follow the workspace theme. Turn off to restore their own theme."><span>Sync</span><input id="theme-sync" type="checkbox" role="switch" aria-label="Sync screen theme"><span class="switch-track" aria-hidden="true"></span></label>
        </div>
      </aside>
      <div class="map-workspace">

      <main id="map-viewport" class="map-viewport" tabindex="0" role="region" aria-label="Interactive workflow map" aria-describedby="map-instructions">
        <div id="map-world" class="map-world"><svg id="map-edges" class="map-edges" aria-hidden="true"></svg><div id="map-lanes"></div><div id="map-nodes"></div></div>
        <div id="node-details" class="node-details" hidden></div>
        <div class="map-bottom"><div class="map-zoom" role="group" aria-label="Canvas controls">
          <button id="zoom-out" class="icon-button" aria-label="Zoom out"></button><button id="zoom-reset" aria-label="Reset zoom to 100%" title="Reset to 100%">100%</button><button id="zoom-in" class="icon-button" aria-label="Zoom in"></button><span class="map-control-divider"></span><button id="zoom-fit" class="icon-button" aria-label="Fit current flow" title="Fit flow · F"></button>
          <button id="flow-start" class="icon-button" aria-label="Back to start" title="Back to start · 0">${icons["corner-up-left"]}</button><span class="map-control-divider"></span><button id="toggle-minimap" class="icon-button" aria-label="Toggle minimap" title="Toggle minimap" aria-expanded="false" aria-controls="map-minimap">${icons.map}</button>
        </div></div>
        <div id="map-minimap" class="map-minimap" hidden><span>Overview</span><svg id="minimap" viewBox="0 0 168 114" role="img" aria-label="Current viewport position"></svg><button id="minimap-fit">Fit entire flow</button></div>
      </main>
      <footer class="map-statusbar"><div class="map-legend"><span><i class="main"></i>Primary</span><span><i class="branch"></i>Conditional</span><span><i class="recovery"></i>Recovery</span></div><p id="map-instructions">Drag to pan <span>·</span> ⌘ / Ctrl + scroll to zoom</p><span class="canvas-status"><i class="map-live-dot"></i><span id="preload-status" role="status">Loading mocks</span></span></footer>
      </div>
    </div>
    <dialog id="screen-dialog" class="screen-dialog" aria-labelledby="dialog-title"><header><div><small id="dialog-screen-id"></small><h2 id="dialog-title"></h2></div><button id="close-screen" class="icon-button" aria-label="Close preview"></button></header><div class="preview-scroll"><div id="dialog-preview"></div></div><footer><div id="dialog-progress" class="preview-progress"></div><div class="preview-actions"><button id="dialog-progress-details" data-ui="action" data-size="compact" data-variant="secondary">Progress details</button><a id="dialog-open" data-ui="action" data-size="compact" data-variant="secondary" target="_blank" rel="noopener noreferrer">Open in new tab</a></div></footer></dialog>
    <dialog id="help-dialog" class="help-dialog" aria-labelledby="help-title"><h2 id="help-title">Explore the whole journey</h2><ul>
      <li>Drag the canvas or a screen card to move around.</li><li>Use + / −, Ctrl/⌘ + scroll, or pinch to zoom.</li><li>Choose a workflow in the sidebar. Fit the flow to see every branch.</li><li>Click a node to follow its outgoing steps. Double-click a screen to interact.</li><li>Use arrow keys to pan, F to fit, 0 to return to the start, and Escape to close.</li>
    </ul><p>Arrows describe the authored flow. Embedded screens keep their own behavior.</p><button id="close-help" data-ui="action" data-size="compact" data-variant="primary">Got it</button></dialog>
  </div>`;
}
