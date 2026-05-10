import type { ConnectionState } from '../lib/types';

type Props = { state: ConnectionState };

const META: Record<ConnectionState['status'], { label: string; dot: string }> = {
  connecting: { label: 'connecting…', dot: 'bg-muted' },
  live: { label: 'live', dot: 'bg-accent-2 ring-4 ring-accent-2/20' },
  error: { label: 'load error', dot: 'bg-delete' },
  disconnected: { label: 'disconnected', dot: 'bg-delete/70' },
};

export default function StatusPill({ state }: Props) {
  const meta = META[state.status];
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted">
      <span className={`block w-2 h-2 rounded-full ${meta.dot}`} />
      <span>{meta.label}</span>
      {state.status === 'live' ? (
        <span className="text-muted">
          · {state.data.modules.length} modules · {state.data.edges.length} edges ·{' '}
          {state.data.routes.length} routes
        </span>
      ) : null}
    </div>
  );
}
