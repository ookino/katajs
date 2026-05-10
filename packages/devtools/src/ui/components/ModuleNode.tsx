import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ModuleNodeData } from '../lib/layout';

type Props = NodeProps & { data: ModuleNodeData; selected?: boolean };

export default function ModuleNode({ data, selected }: Props) {
  return (
    <div
      className={[
        'rounded-lg border bg-panel px-3 py-2 shadow-sm transition-colors',
        selected
          ? 'border-accent ring-2 ring-accent/40'
          : 'border-border hover:border-accent/60',
      ].join(' ')}
      style={{ width: 220, height: 92 }}
    >
      <Handle type="target" position={Position.Left} className="!bg-accent !border-0 !w-2 !h-2" />
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-[13px] truncate">{data.name}</div>
        {data.hasRoutes && data.prefix ? (
          <code className="font-mono text-[10px] text-muted bg-panel-2 rounded px-1.5 py-0.5 truncate">
            {data.prefix}
          </code>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted">
        <span className="text-accent-2">{data.provides.length} provides</span>
        <span className="text-accent">{data.requires.length} requires</span>
        {data.hasRoutes ? <span>{data.routeCount} routes</span> : null}
      </div>
      {data.consumer ? (
        <div className="mt-1.5 flex items-center gap-1 text-[10px]">
          <span className="text-put">⇆</span>
          <span className="text-put">consumes</span>
          <code className="font-mono text-put bg-put/10 rounded px-1 py-0.5 truncate">
            {data.consumer.queue}
          </code>
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} className="!bg-accent !border-0 !w-2 !h-2" />
    </div>
  );
}
