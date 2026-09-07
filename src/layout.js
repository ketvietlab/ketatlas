/** Deterministic grid layout. Each row/column fits its largest card. */
export function layoutAtlas(config) {
  const screens = new Map(config.screens.map((s) => [s.id, s]));
  const nodes = [],
    nodeByKey = new Map(),
    flowById = new Map();
  let height = 0,
    width = 0;
  const flows = config.flows.map((flow, index) => {
    const f = { ...flow, index, y: height };
    f.nodes = flow.nodes.map((n) => {
      const screen = screens.get(n.screen),
        v = screen?.viewport;
      const cardWidth = v ? (v.width > 600 ? 460 : 232) : 270;
      const previewWidth = cardWidth - 2;
      const previewHeight = v ? (previewWidth * v.height) / v.width : 0;
      return {
        ...n,
        key: n.id,
        col: n.column,
        kind: n.type,
        screenId: n.screen,
        screen,
        flowId: f.id,
        uid: `${f.id}:${n.id}`,
        title: n.title || screen?.title,
        url: n.url || screen?.url,
        description: n.description || screen?.description || "",
        width: cardWidth,
        previewWidth,
        previewHeight,
        height: v ? Math.ceil(previewHeight) + 120 : 230,
      };
    });
    const cols = [],
      rows = [];
    for (const n of f.nodes) {
      cols[n.col] = Math.max(cols[n.col] || 0, n.width);
      rows[n.row] = Math.max(rows[n.row] || 0, n.height);
    }
    const offset = (sizes, i, gap, fallback) =>
      Array.from({ length: i }, (_, k) => (sizes[k] || fallback) + gap).reduce((a, b) => a + b, 0);
    for (const n of f.nodes) {
      n.x = 80 + offset(cols, n.col, 170, 232);
      n.y = height + 240 + offset(rows, n.row, 210, 230);
      nodes.push(n);
      nodeByKey.set(n.uid, n);
    }
    f.width = Math.max(...f.nodes.map((n) => n.x + n.width)) + 80;
    f.height = Math.max(...f.nodes.map((n) => n.y + n.height)) - f.y + 60;
    height += f.height + 120;
    width = Math.max(width, f.width);
    flowById.set(f.id, f);
    return f;
  });
  return { flows, nodes, nodeByKey, flowById, width, height };
}
const ports = (n, side) =>
  ({
    left: [n.x, n.y + n.height / 2],
    right: [n.x + n.width, n.y + n.height / 2],
    top: [n.x + n.width / 2, n.y],
    bottom: [n.x + n.width / 2, n.y + n.height],
  })[side];
export function edgePath(a, b, index = 0) {
  const lane = index % 3;
  let start, end, points, label;
  if (a.uid === b.uid) {
    start = ports(a, "right");
    end = ports(b, "top");
    const x = a.x + a.width + 70,
      y = a.y - 70;
    points = [start, [x, start[1]], [x, y], [end[0], y], end];
    label = [x, y];
  } else if (a.row === b.row && b.col === a.col + 1) {
    start = ports(a, "right");
    end = ports(b, "left");
    const mid = (start[0] + end[0]) / 2;
    points = [start, [mid, start[1]], [mid, end[1]], end];
    label = [mid, (start[1] + end[1]) / 2];
  } else if (a.row === b.row) {
    start = ports(a, "top");
    end = ports(b, "top");
    const y = Math.min(a.y, b.y) - 88 - lane * 28;
    points = [start, [start[0], y], [end[0], y], end];
    label = [(start[0] + end[0]) / 2, y];
  } else if (b.row === a.row + 1) {
    start = ports(a, "bottom");
    end = ports(b, "top");
    const y = Math.min(b.y - 45, a.y + a.height + 65 + lane * 24);
    points = [start, [start[0], y], [end[0], y], end];
    label = [(start[0] + end[0]) / 2, y];
  } else {
    const left = b.col < a.col;
    start = ports(a, left ? "left" : "right");
    end = ports(b, "top");
    const x = left ? a.x - 85 : a.x + a.width + 85,
      y = b.y - 88 - lane * 28;
    points = [start, [x, start[1]], [x, y], [end[0], y], end];
    label = [x, (start[1] + y) / 2];
  }
  return { d: points.map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" "), label };
}
