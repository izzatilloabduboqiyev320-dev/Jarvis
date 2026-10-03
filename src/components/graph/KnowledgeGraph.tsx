"use client";

import { useEffect, useRef } from "react";
import Sigma from "sigma";
import { animateNodes } from "sigma/utils";
import type { EdgeDisplayData, NodeDisplayData, PartialButFor } from "sigma/types";
import type { Settings } from "sigma/settings";
import GlowNodeProgram from "@/components/graph/glow-node-program";
import { CATEGORIES } from "@/knowledge/categories";
import { computeLayout, describePath, findPath, pathEdges, type GraphEdgeAttrs, type GraphNodeAttrs } from "@/knowledge/graph";
import { registerGraphCommands } from "@/lib/graph-commands";
import { getGraph } from "@/lib/graph-instance";
import { useJarvis, type Focus } from "@/lib/store";

type BBox = { x: [number, number]; y: [number, number] };

// Sigma blends edges as premultiplied alpha, so RGB is pre-scaled by alpha here.
const DIM_NODE_ALPHA = "22";
const EDGE_DIM = "rgba(4, 7, 8, 0.035)";
const EDGE_HL = "rgba(69, 124, 132, 0.55)";
const EDGE_PATH = "rgba(133, 228, 242, 0.95)";

function bboxOf(pos: Record<string, { x: number; y: number }>): BBox {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of Object.values(pos)) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  const px = (x1 - x0) * 0.04 || 1;
  const py = (y1 - y0) * 0.04 || 1;
  return { x: [x0 - px, x1 + px], y: [y0 - py, y1 + py] };
}

function hashPhase(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000 * Math.PI * 2;
}

/** Dark glass hover card instead of sigma's default white box. */
function drawHover(
  ctx: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">,
  settings: Settings,
) {
  const label = data.label ?? "";
  const cat = (data as unknown as { category?: keyof typeof CATEGORIES }).category;
  const sub = cat ? CATEGORIES[cat]?.label.toUpperCase() : "";
  const size = settings.labelSize;
  ctx.font = `500 ${size + 1}px ${settings.labelFont}`;
  const w1 = ctx.measureText(label).width;
  ctx.font = `400 ${size - 2}px ${settings.labelFont}`;
  const w2 = ctx.measureText(sub).width;
  const w = Math.max(w1, w2) + 16;
  const h = sub ? size * 2 + 12 : size + 10;
  const x = data.x + data.size + 6;
  const y = data.y - h / 2;

  ctx.beginPath();
  ctx.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(120, 230, 245, 0.85)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "rgba(4, 14, 20, 0.92)";
  ctx.strokeStyle = "rgba(110, 220, 235, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = data.color;
  ctx.fillRect(x, y, 2, h);

  ctx.fillStyle = "#e6f6fa";
  ctx.font = `500 ${size + 1}px ${settings.labelFont}`;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 9, sub ? y + size / 2 + 5 : y + h / 2);
  if (sub) {
    ctx.fillStyle = "rgba(150, 190, 200, 0.75)";
    ctx.font = `400 ${size - 2}px ${settings.labelFont}`;
    ctx.fillText(sub, x + 9, y + size + 10);
  }
  ctx.textBaseline = "alphabetic";
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">,
  settings: Settings,
) {
  const highlighted = (data as unknown as { highlighted?: boolean }).highlighted;
  // Highlighted nodes get the hover card, which already carries the label.
  if (!data.label || highlighted) return;
  const size = settings.labelSize;
  ctx.font = `400 ${size}px ${settings.labelFont}`;
  ctx.fillStyle = "rgba(184, 204, 214, 0.82)";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 4;
  ctx.fillText(data.label, data.x + data.size + 4, data.y + size / 3);
  ctx.shadowBlur = 0;
}

export default function KnowledgeGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const error = useJarvis((s) => s.graphError);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const graph = getGraph();
    const store = useJarvis;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const large = graph.order > 1500;

    // ── Mutable render state (no React) ────────────────────────────────
    let hovered: string | null = null;
    let hoverSet: Set<string> | null = null;
    let focusSet: Set<string> | null = null;
    let focusEdges: Set<string> | null = null;
    let anchors = new Set<string>();
    let selected: string | null = null;
    let hidden = new Set<string>(store.getState().hidden);
    let dragged: string | null = null;
    let dragMoved = false;
    let floatAmp = 0;
    let t = 0;

    const computeFocus = (f: Focus) => {
      focusEdges = null;
      anchors = new Set();
      if (f.kind === "none") focusSet = null;
      else if (f.kind === "select") {
        focusSet = graph.hasNode(f.node) ? new Set([f.node, ...graph.neighbors(f.node)]) : null;
        focusEdges = graph.hasNode(f.node) ? new Set(graph.edges(f.node)) : null;
        anchors = new Set([f.node]);
      } else if (f.kind === "path") {
        focusSet = new Set(f.nodes);
        focusEdges = new Set(pathEdges(graph, f.nodes));
        anchors = new Set(f.nodes);
      } else {
        focusSet = new Set(f.nodes);
        anchors = new Set(f.anchors);
      }
    };
    computeFocus(store.getState().focus);
    selected = store.getState().selected;

    const fontVar = getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim();
    const labelFont = `${fontVar ? fontVar + "," : ""} ui-monospace, SFMono-Regular, Menlo, monospace`;

    let sigma: Sigma;
    try {
      sigma = new Sigma(graph, container, {
        defaultNodeType: "glow",
        nodeProgramClasses: { glow: GlowNodeProgram },
        defaultEdgeType: "line",
        labelFont,
        labelSize: 11,
        labelWeight: "400",
        labelColor: { color: "#b8ccd6" },
        labelDensity: 0.45,
        labelGridCellSize: 140,
        labelRenderedSizeThreshold: 9,
        defaultDrawNodeHover: drawHover,
        defaultDrawNodeLabel: drawLabel,
        minCameraRatio: 0.04,
        maxCameraRatio: 5,
        zIndex: true,
        stagePadding: 40,
        hideEdgesOnMove: large,
        hideLabelsOnMove: large,
        minEdgeThickness: 0.6,
        doubleClickZoomingRatio: 1,
        nodeReducer: (node, raw) => {
          const data = raw as unknown as GraphNodeAttrs;
          const res: Partial<NodeDisplayData> & { category?: string } = { ...data };
          if (hidden.has(data.category)) {
            res.hidden = true;
            return res;
          }
          if (floatAmp && node !== dragged) {
            const ph = hashPhase(node);
            res.x = data.x + Math.sin(t * 0.00042 + ph) * floatAmp;
            res.y = data.y + Math.cos(t * 0.00035 + ph * 1.7) * floatAmp;
          }
          const active = hoverSet ?? focusSet;
          if (active) {
            if (active.has(node)) {
              res.zIndex = 2;
              const isAnchor = hoverSet ? node === hovered : anchors.has(node);
              res.forceLabel = isAnchor || active.size <= 30;
              res.highlighted = isAnchor;
            } else {
              res.color = data.color + DIM_NODE_ALPHA;
              res.label = "";
              res.zIndex = 0;
            }
          }
          if (node === selected) {
            res.size = data.size * (1.12 + Math.sin(t * 0.004) * 0.08);
            res.forceLabel = true;
            res.zIndex = 3;
          }
          return res;
        },
        edgeReducer: (edge, raw) => {
          const data = raw as unknown as GraphEdgeAttrs;
          const res: Partial<EdgeDisplayData> = { ...data };
          if (hoverSet && hovered) {
            const incident = graph.source(edge) === hovered || graph.target(edge) === hovered;
            res.color = incident ? EDGE_HL : EDGE_DIM;
            res.zIndex = incident ? 1 : 0;
            if (incident) res.size = (data.size ?? 1) * 1.6;
            return res;
          }
          if (focusEdges) {
            const on = focusEdges.has(edge);
            const isPath = store.getState().focus.kind === "path";
            res.color = on ? (isPath ? EDGE_PATH : EDGE_HL) : EDGE_DIM;
            res.zIndex = on ? 1 : 0;
            if (on) res.size = (data.size ?? 1) * (isPath ? 3 : 1.6);
            return res;
          }
          if (focusSet) {
            const on = focusSet.has(graph.source(edge)) && focusSet.has(graph.target(edge));
            res.color = on ? EDGE_HL : EDGE_DIM;
            res.zIndex = on ? 1 : 0;
          }
          return res;
        },
      });
    } catch (err) {
      store.getState().setGraphError(
        `The graph renderer could not start (${(err as Error).message}). JARVIS needs WebGL — enable hardware acceleration in your browser settings.`,
      );
      store.getState().log("error", "Graph renderer failed to start (WebGL unavailable)");
      return;
    }

    const camera = sigma.getCamera();
    // Debug handle for automated UI checks: `/graph?debug`
    if (process.env.NODE_ENV !== "production" || window.location.search.includes("debug")) {
      (window as unknown as Record<string, unknown>).__jarvis = { sigma, graph };
    }

    // ── Layout ────────────────────────────────────────────────────────
    let cancelAnim: (() => void) | null = null;
    const runLayout = (intro = false) => {
      cancelAnim?.();
      const st = store.getState();
      const target = computeLayout(graph, st.layout, st.selected);
      const box = bboxOf(target);
      floatAmp = reducedMotion || large ? 0 : Math.max(box.x[1] - box.x[0], box.y[1] - box.y[0]) * 0.0035;
      sigma.setCustomBBox(box);
      if (intro) {
        const cx = (box.x[0] + box.x[1]) / 2;
        const cy = (box.y[0] + box.y[1]) / 2;
        graph.forEachNode((id) => {
          const p = target[id];
          graph.mergeNodeAttributes(id, { x: cx + (p.x - cx) * 0.08, y: cy + (p.y - cy) * 0.08 });
        });
      }
      camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
      if (large) {
        graph.forEachNode((id) => graph.mergeNodeAttributes(id, target[id]));
        return;
      }
      cancelAnim = animateNodes(graph, target, { duration: intro ? 1600 : 900, easing: "cubicInOut" });
    };
    runLayout(true);

    // ── Commands for toolbar / palette / Jarvis ──────────────────────
    const centerOn = (id: string) => {
      if (!graph.hasNode(id)) return;
      const d = sigma.getNodeDisplayData(id);
      if (!d) return;
      camera.animate({ x: d.x, y: d.y, ratio: Math.min(camera.ratio, 0.55) }, { duration: 600, easing: "cubicInOut" });
    };
    // Fit a set of nodes, but never zoom in so far that context disappears.
    const fitNodes = (ids: string[]) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const id of ids) {
        const d = sigma.getNodeDisplayData(id);
        if (!d) continue;
        x0 = Math.min(x0, d.x); x1 = Math.max(x1, d.x);
        y0 = Math.min(y0, d.y); y1 = Math.max(y1, d.y);
      }
      if (!Number.isFinite(x0)) return;
      // Display coordinates are normalised to ~[0,1]; ratio 1 shows everything.
      const ratio = Math.min(1.1, Math.max(0.3, Math.max(x1 - x0, y1 - y0) * 1.35));
      camera.animate({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, ratio }, { duration: 650, easing: "cubicInOut" });
    };
    registerGraphCommands({
      fit: () => camera.animatedReset({ duration: 500 }),
      zoomIn: () => camera.animatedZoom({ duration: 300 }),
      zoomOut: () => camera.animatedUnzoom({ duration: 300 }),
      centerOn,
      focusNodes: (ids) => {
        const visible = ids.filter((id) => graph.hasNode(id));
        if (visible.length === 0) return;
        if (visible.length === 1) return centerOn(visible[0]);
        fitNodes(visible);
      },
      applyLayout: () => runLayout(false),
    });

    // ── Interaction ───────────────────────────────────────────────────
    const setHover = (node: string | null) => {
      hovered = node;
      hoverSet = node ? new Set([node, ...graph.neighbors(node)]) : null;
      container.style.cursor = node ? "pointer" : "default";
      sigma.refresh({ skipIndexation: true });
    };
    sigma.on("enterNode", ({ node }) => {
      if (!dragged) setHover(node);
    });
    sigma.on("leaveNode", () => {
      if (!dragged) setHover(null);
    });

    sigma.on("clickNode", ({ node, event }) => {
      if (dragMoved) return;
      const st = store.getState();
      if (event.original.shiftKey && st.selected && st.selected !== node) {
        const path = findPath(graph, st.selected, node);
        if (path) {
          st.setFocus({ kind: "path", nodes: path });
          st.log("search", `Traced path: ${describePath(graph, path)}`);
          fitNodes(path);
        } else {
          st.log("result", `No path between ${graph.getNodeAttribute(st.selected, "label")} and ${graph.getNodeAttribute(node, "label")}`);
        }
        return;
      }
      st.select(node);
      centerOn(node);
    });
    sigma.on("doubleClickNode", ({ node, event }) => {
      event.preventSigmaDefault();
      store.getState().openViewer(node);
    });
    sigma.on("clickStage", () => {
      if (dragMoved) return;
      store.getState().clearFocus();
    });
    sigma.on("doubleClickStage", ({ event }) => event.preventSigmaDefault());

    // Drag nodes
    sigma.on("downNode", ({ node }) => {
      dragged = node;
      dragMoved = false;
    });
    sigma.on("moveBody", ({ event }) => {
      if (!dragged) return;
      const pos = sigma.viewportToGraph(event);
      graph.mergeNodeAttributes(dragged, { x: pos.x, y: pos.y });
      dragMoved = true;
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });
    const endDrag = () => {
      dragged = null;
      // let the click handler see dragMoved, then reset
      setTimeout(() => (dragMoved = false), 0);
    };
    sigma.on("upNode", endDrag);
    sigma.on("upStage", endDrag);

    // ── Store → renderer (no React re-render) ─────────────────────────
    const unsub = store.subscribe((s, prev) => {
      let changed = false;
      if (s.focus !== prev.focus) {
        computeFocus(s.focus);
        changed = true;
      }
      if (s.selected !== prev.selected) {
        selected = s.selected;
        changed = true;
      }
      if (s.hidden !== prev.hidden) {
        hidden = new Set(s.hidden);
        changed = true;
      }
      if (s.layout !== prev.layout) runLayout(false);
      if (changed) sigma.refresh();
    });

    // ── Ambient animation: slow float + selected pulse ─────────────────
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (now - last < 33) return; // ~30fps is plenty for ambient motion
      last = now;
      if (!floatAmp && !selected) return;
      t = now;
      sigma.refresh({ skipIndexation: !floatAmp });
    };
    if (!reducedMotion) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnim?.();
      unsub();
      sigma.kill();
    };
  }, []);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-10 text-center text-sm text-rose-300/90">
        {error}
      </div>
    );
  }
  return <div ref={containerRef} className="absolute inset-0" data-testid="knowledge-graph" />;
}
