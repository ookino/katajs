import { useState } from 'react';
import { useGraph } from './lib/useGraph';
import type { ConnectionState, GraphData } from './lib/types';
import ModuleGraph from './components/ModuleGraph';
import ModuleSidebar from './components/ModuleSidebar';
import ModuleDrawer from './components/ModuleDrawer';
import RoutesTable from './components/RoutesTable';
import StatusPill from './components/StatusPill';
import CommandPalette from './components/CommandPalette';

type View = 'graph' | 'routes';

export default function App() {
  const state = useGraph();
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [view, setView] = useState<View>('graph');

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="font-semibold text-[15px] tracking-tight">katajs</h1>
          <span className="text-[11px] uppercase tracking-wider text-muted">devtools</span>
          {state.status === 'live' ? <ViewTabs view={view} onChange={setView} /> : null}
        </div>
        <StatusPill state={state} />
      </header>

      {state.status === 'live' ? (
        <>
          <LiveView
            data={state.data}
            view={view}
            selectedModule={selectedModule}
            onSelectModule={setSelectedModule}
          />
          <CommandPalette
            data={state.data}
            onSelectModule={setSelectedModule}
            onSwitchView={setView}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <FallbackPanel state={state} />
        </div>
      )}
    </div>
  );
}

function LiveView({
  data,
  view,
  selectedModule,
  onSelectModule,
}: {
  data: GraphData;
  view: View;
  selectedModule: string | null;
  onSelectModule: (name: string | null) => void;
}) {
  return (
    <div className="flex-1 flex min-h-0">
      <ModuleSidebar
        data={data}
        selectedModule={selectedModule}
        onSelectModule={onSelectModule}
      />
      <div className="flex-1 min-w-0">
        {view === 'graph' ? (
          <ModuleGraph
            data={data}
            selectedModule={selectedModule}
            onSelectModule={onSelectModule}
          />
        ) : (
          <RoutesTable data={data} onSelectModule={(name) => onSelectModule(name)} />
        )}
      </div>
      {selectedModule ? (
        <ModuleDrawer
          data={data}
          moduleName={selectedModule}
          onClose={() => onSelectModule(null)}
          onSelectModule={(name) => onSelectModule(name)}
        />
      ) : null}
    </div>
  );
}

function ViewTabs({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="ml-4 flex items-center gap-0.5 bg-panel-2 rounded-md p-0.5 border border-border">
      <TabButton active={view === 'graph'} onClick={() => onChange('graph')}>
        Graph
      </TabButton>
      <TabButton active={view === 'routes'} onClick={() => onChange('routes')}>
        Routes
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-1 rounded text-[12px] transition-colors',
        active ? 'bg-accent/15 text-white' : 'text-muted hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
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
