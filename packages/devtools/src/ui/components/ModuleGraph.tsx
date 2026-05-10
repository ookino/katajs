import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import ModuleNode from './ModuleNode';
import { layoutGraph, type ModuleNodeData } from '../lib/layout';
import type { GraphData } from '../lib/types';

const nodeTypes = { module: ModuleNode };

type Props = {
  data: GraphData;
  selectedModule: string | null;
  onSelectModule: (name: string | null) => void;
};

export default function ModuleGraph({ data, selectedModule, onSelectModule }: Props) {
  const { nodes, edges } = useMemo(() => layoutGraph(data), [data]);

  const decoratedNodes = useMemo<Node<ModuleNodeData>[]>(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedModule,
      })),
    [nodes, selectedModule],
  );

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    onSelectModule(node.id === selectedModule ? null : node.id);
  };

  const handlePaneClick = () => {
    onSelectModule(null);
  };

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={decoratedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#1d2230" maskColor="rgba(15,17,21,0.7)" />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
