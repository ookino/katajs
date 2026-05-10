import type { GraphData } from '../lib/types';

type Props = {
  data: GraphData;
  selectedModule: string | null;
  onSelectModule: (name: string | null) => void;
};

export default function ModuleSidebar({ data, selectedModule, onSelectModule }: Props) {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-panel/40 overflow-y-auto">
      <div className="px-4 py-3 text-[11px] uppercase tracking-wider text-muted border-b border-border">
        Modules ({data.modules.length})
      </div>
      <ul className="py-1">
        {data.modules.map((m) => {
          const selected = m.name === selectedModule;
          return (
            <li key={m.name}>
              <button
                type="button"
                onClick={() => onSelectModule(selected ? null : m.name)}
                className={[
                  'w-full text-left px-4 py-2 text-[13px] flex items-center justify-between gap-2 transition-colors',
                  selected
                    ? 'bg-accent/10 text-white'
                    : 'text-[#e8ebf2] hover:bg-panel-2',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-[10px] text-muted truncate">
                    {m.hasRoutes && m.prefix ? (
                      <code className="font-mono">{m.prefix}</code>
                    ) : (
                      <span className="italic">services-only</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-[10px] shrink-0">
                  <span className="text-accent-2">{m.provides.length}p</span>
                  <span className="text-accent">{m.requires.length}r</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
