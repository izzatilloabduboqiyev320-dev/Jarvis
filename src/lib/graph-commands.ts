"use client";

/**
 * Imperative bridge to the Sigma renderer. The graph component registers its
 * implementation on mount; toolbar, palette and Jarvis call these without
 * holding a reference to Sigma (and without re-rendering).
 */
export interface GraphCommands {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focusNodes: (ids: string[]) => void;
  centerOn: (id: string) => void;
  applyLayout: () => void;
}

const noop = () => {};
let impl: GraphCommands = {
  fit: noop,
  zoomIn: noop,
  zoomOut: noop,
  focusNodes: noop,
  centerOn: noop,
  applyLayout: noop,
};

export function registerGraphCommands(c: GraphCommands) {
  impl = c;
}

export const graphCommands: GraphCommands = {
  fit: () => impl.fit(),
  zoomIn: () => impl.zoomIn(),
  zoomOut: () => impl.zoomOut(),
  focusNodes: (ids) => impl.focusNodes(ids),
  centerOn: (id) => impl.centerOn(id),
  applyLayout: () => impl.applyLayout(),
};
