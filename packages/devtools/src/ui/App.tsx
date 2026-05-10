import { useState } from "react";
import { useGraph } from "./lib/useGraph";
import type { ConnectionState, GraphData } from "./lib/types";
import ModuleGraph from "./components/ModuleGraph";
import ModuleSidebar from "./components/ModuleSidebar";
import ModuleDrawer from "./components/ModuleDrawer";
import ProducerDrawer from "./components/ProducerDrawer";
import RoutesTable from "./components/RoutesTable";
import StatusPill from "./components/StatusPill";
import CommandPalette from "./components/CommandPalette";

type View = "graph" | "routes";

type Selection =
  | { kind: "none" }
  | { kind: "module"; name: string }
  | { kind: "producer"; name: string };

export default function App() {
  const state = useGraph();
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [view, setView] = useState<View>("graph");

  const selectModule = (name: string | null) =>
    setSelection(name ? { kind: "module", name } : { kind: "none" });
  const selectProducer = (name: string | null) =>
    setSelection(name ? { kind: "producer", name } : { kind: "none" });

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo source ships black; `invert` flips it to white for the
              always-dark devtools chrome. */}
          <img
            src="/logo.svg"
            alt="Kata"
            className="block h-5 w-5 invert shrink-0"
          />
          {/* items-baseline so 'Kata' and 'devtools' sit on the same text
              baseline regardless of their different font sizes. The outer
              flex (items-center) handles logo↔text vertical alignment. */}
          <div className="flex gap-2 items-center">
            <span className="m-0 font-semibold text-[15px] tracking-tight leading-none">
              Kata
            </span>
            <span className="text-[11px] uppercase tracking-wider text-muted leading-none">
              devtools
            </span>
          </div>
          {state.status === "live" ? (
            <ViewTabs view={view} onChange={setView} />
          ) : null}
        </div>
        <StatusPill state={state} />
      </header>

      {state.status === "live" ? (
        <>
          <LiveView
            data={state.data}
            view={view}
            selection={selection}
            onSelectModule={selectModule}
            onSelectProducer={selectProducer}
          />
          <CommandPalette
            data={state.data}
            onSelectModule={(n) => selectModule(n)}
            onSelectProducer={(n) => selectProducer(n)}
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
  selection,
  onSelectModule,
  onSelectProducer,
}: {
  data: GraphData;
  view: View;
  selection: Selection;
  onSelectModule: (name: string | null) => void;
  onSelectProducer: (name: string | null) => void;
}) {
  const selectedModule = selection.kind === "module" ? selection.name : null;
  const selectedProducer =
    selection.kind === "producer" ? selection.name : null;
  return (
    <div className="flex-1 flex min-h-0">
      <ModuleSidebar
        data={data}
        selectedModule={selectedModule}
        selectedProducer={selectedProducer}
        onSelectModule={onSelectModule}
        onSelectProducer={onSelectProducer}
      />
      <div className="flex-1 min-w-0">
        {view === "graph" ? (
          <ModuleGraph
            data={data}
            selectedModule={selectedModule}
            onSelectModule={onSelectModule}
          />
        ) : (
          <RoutesTable
            data={data}
            onSelectModule={(name) => onSelectModule(name)}
          />
        )}
      </div>
      {selection.kind === "module" ? (
        <ModuleDrawer
          data={data}
          moduleName={selection.name}
          onClose={() => onSelectModule(null)}
          onSelectModule={(name) => onSelectModule(name)}
        />
      ) : null}
      {selection.kind === "producer" ? (
        <ProducerDrawer
          data={data}
          producerName={selection.name}
          onClose={() => onSelectProducer(null)}
          onSelectModule={(name) => onSelectModule(name)}
        />
      ) : null}
    </div>
  );
}

function ViewTabs({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <div className="ml-4 flex items-center gap-0.5 bg-panel-2 rounded-md p-0.5 border border-border">
      <TabButton active={view === "graph"} onClick={() => onChange("graph")}>
        Graph
      </TabButton>
      <TabButton active={view === "routes"} onClick={() => onChange("routes")}>
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
        "px-3 py-1 rounded text-[12px] transition-colors",
        active ? "bg-accent/15 text-white" : "text-muted hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function FallbackPanel({
  state,
}: {
  state: Exclude<ConnectionState, { status: "live" }>;
}) {
  if (state.status === "connecting") {
    return <div className="text-muted text-sm">Connecting…</div>;
  }
  if (state.status === "disconnected") {
    return (
      <div className="text-muted text-sm max-w-md text-center">
        Disconnected from the devtools server. Did{" "}
        <code className="font-mono">katajs-devtools</code> stop?
      </div>
    );
  }
  return (
    <div className="max-w-2xl rounded-lg border border-delete/30 bg-delete/5 p-4 font-mono text-[12px] text-delete whitespace-pre-wrap">
      {state.message}
    </div>
  );
}
