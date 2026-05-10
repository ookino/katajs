import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import type { GraphData } from '../lib/types';
import { MethodChip } from './ModuleDrawer';

type Props = {
  data: GraphData;
  onSelectModule: (name: string) => void;
  onSwitchView: (view: 'graph' | 'routes') => void;
};

export default function CommandPalette({ data, onSelectModule, onSwitchView }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);
  const pickModule = (name: string) => {
    onSelectModule(name);
    onSwitchView('graph');
    close();
  };
  const pickRoute = (module: string) => {
    onSelectModule(module);
    onSwitchView('routes');
    close();
  };
  const pickView = (v: 'graph' | 'routes') => {
    onSwitchView(v);
    close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-border bg-panel shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Devtools command palette">
          <Command.Input
            placeholder="Search modules, routes…"
            autoFocus
            className="w-full bg-transparent border-0 border-b border-border px-4 py-3 text-[14px] text-white placeholder:text-muted focus:outline-none"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-muted text-[13px]">
              No matches.
            </Command.Empty>

            <Command.Group
              heading="Views"
              className="text-[10px] uppercase tracking-wider text-muted px-2 pt-2 pb-1"
            >
              <Command.Item
                onSelect={() => pickView('graph')}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[13px] cursor-pointer aria-selected:bg-accent/15 aria-selected:text-white"
              >
                <span className="text-muted">→</span>
                Open graph view
              </Command.Item>
              <Command.Item
                onSelect={() => pickView('routes')}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[13px] cursor-pointer aria-selected:bg-accent/15 aria-selected:text-white"
              >
                <span className="text-muted">→</span>
                Open routes view
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading={`Modules (${data.modules.length})`}
              className="text-[10px] uppercase tracking-wider text-muted px-2 pt-3 pb-1"
            >
              {data.modules.map((m) => (
                <Command.Item
                  key={`module:${m.name}`}
                  value={`module ${m.name} ${m.prefix ?? ''} ${m.provides.join(' ')}`}
                  onSelect={() => pickModule(m.name)}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px] cursor-pointer aria-selected:bg-accent/15 aria-selected:text-white"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted">▢</span>
                    <span className="truncate">{m.name}</span>
                  </div>
                  {m.prefix ? (
                    <code className="font-mono text-[10px] text-muted">{m.prefix}</code>
                  ) : null}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group
              heading={`Routes (${data.routes.length})`}
              className="text-[10px] uppercase tracking-wider text-muted px-2 pt-3 pb-1"
            >
              {data.routes.map((r, i) => (
                <Command.Item
                  key={`route:${r.method}:${r.path}:${i}`}
                  value={`route ${r.method} ${r.path} ${r.module}`}
                  onSelect={() => pickRoute(r.module)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-[13px] cursor-pointer aria-selected:bg-accent/15 aria-selected:text-white"
                >
                  <MethodChip method={r.method} />
                  <code className="font-mono text-[12px] truncate flex-1">{r.path}</code>
                  <span className="text-[11px] text-muted">{r.module}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
          <div className="border-t border-border px-3 py-2 text-[11px] text-muted flex items-center gap-3">
            <span>↵ select</span>
            <span>↑↓ navigate</span>
            <span>esc close</span>
            <span className="ml-auto">⌘K toggle</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
