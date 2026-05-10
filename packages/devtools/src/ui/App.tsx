import { useState } from 'react';
import { useGraph } from './lib/useGraph';
import type { ConnectionState } from './lib/types';
import ModuleGraph from './components/ModuleGraph';
import ModuleSidebar from './components/ModuleSidebar';
import StatusPill from './components/StatusPill';

export default function App() {
  const state = useGraph();
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="font-semibold text-[15px] tracking-tight">katajs</h1>
          <span className="text-[11px] uppercase tracking-wider text-muted">devtools</span>
        </div>
        <StatusPill state={state} />
      </header>

      {state.status === 'live' ? (
        <div className="flex-1 flex min-h-0">
          <ModuleSidebar
            data={state.data}
            selectedModule={selectedModule}
            onSelectModule={setSelectedModule}
          />
          <div className="flex-1 min-w-0">
            <ModuleGraph
              data={state.data}
              selectedModule={selectedModule}
              onSelectModule={setSelectedModule}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <FallbackPanel state={state} />
        </div>
      )}
    </div>
  );
}

function FallbackPanel({
  state,
}: {
  state: Exclude<ConnectionState, { status: 'live' }>;
}) {
  if (state.status === 'connecting') {
    return <div className="text-muted text-sm">Connecting…</div>;
  }
  if (state.status === 'disconnected') {
    return (
      <div className="text-muted text-sm max-w-md text-center">
        Disconnected from the devtools server. Did <code className="font-mono">katajs-devtools</code>{' '}
        stop?
      </div>
    );
  }
  return (
    <div className="max-w-2xl rounded-lg border border-delete/30 bg-delete/5 p-4 font-mono text-[12px] text-delete whitespace-pre-wrap">
      {state.message}
    </div>
  );
}
