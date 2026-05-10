import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import type { GraphData } from './types';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 78;

export type ModuleNodeData = {
  name: string;
  provides: string[];
  requires: string[];
  prefix?: string;
  hasRoutes: boolean;
  routeCount: number;
};

export type DependencyEdgeData = {
  via: string;
};

export function layoutGraph(graph: GraphData): {
  nodes: Node<ModuleNodeData>[];
  edges: Edge<DependencyEdgeData>[];
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: 60,
    ranksep: 90,
    marginx: 40,
    marginy: 40,
  });

  const routeCountByModule = new Map<string, number>();
  for (const r of graph.routes) {
    routeCountByModule.set(r.module, (routeCountByModule.get(r.module) ?? 0) + 1);
  }

  for (const m of graph.modules) {
    g.setNode(m.name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of graph.edges) {
    g.setEdge(e.from, e.to);
  }
  dagre.layout(g);

  const nodes: Node<ModuleNodeData>[] = graph.modules.map((m) => {
    const pos = g.node(m.name);
    return {
      id: m.name,
      type: 'module',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: {
        name: m.name,
        provides: m.provides,
        requires: m.requires,
        prefix: m.prefix,
        hasRoutes: m.hasRoutes,
        routeCount: routeCountByModule.get(m.name) ?? 0,
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const edges: Edge<DependencyEdgeData>[] = graph.edges.map((e, i) => ({
    id: `${e.from}->${e.to}#${i}`,
    source: e.from,
    target: e.to,
    label: e.via,
    type: 'smoothstep',
    animated: false,
    data: { via: e.via },
  }));

  return { nodes, edges };
}
