import { useMemo } from 'react';
import type { GraphData } from '../lib/types';

type Props = {
  data: GraphData;
  moduleName: string;
  onClose: () => void;
  onSelectModule: (name: string) => void;
};

export default function ModuleDrawer({ data, moduleName, onClose, onSelectModule }: Props) {
  const mod = data.modules.find((m) => m.name === moduleName);

  const ownerByService = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of data.modules) {
      for (const p of m.provides) map.set(p, m.name);
    }
    return map;
  }, [data.modules]);

  const ownRoutes = useMemo(
    () => data.routes.filter((r) => r.module === moduleName),
    [data.routes, moduleName],
  );

  if (!mod) {
    return (
      <aside className="w-[360px] shrink-0 border-l border-border bg-panel/60 p-4 text-muted text-sm">
        Module <code className="font-mono">{moduleName}</code> not found.
        <button onClick={onClose} className="ml-2 underline">
          close
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[360px] shrink-0 border-l border-border bg-panel/60 overflow-y-auto">
      <header className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted">Module</div>
          <h2 className="text-[15px] font-semibold truncate">{mod.name}</h2>
          {mod.hasRoutes && mod.prefix ? (
            <code className="font-mono text-[11px] text-muted">{mod.prefix}</code>
          ) : (
            <span className="text-[11px] italic text-muted">services-only</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-white text-lg leading-none px-1.5 rounded hover:bg-panel-2"
        >
          ×
        </button>
      </header>

      <Section title="Provides" empty="No services exported.">
        {mod.provides.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {mod.provides.map((p) => (
              <span
                key={p}
                className="inline-flex items-center font-mono text-[11px] px-1.5 py-0.5 rounded border border-accent-2/30 text-accent-2 bg-accent-2/5"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Requires" empty="No external dependencies.">
        {mod.requires.length > 0 && (
          <ul className="space-y-1">
            {mod.requires.map((r) => {
              const owner = ownerByService.get(r);
              return (
                <li
                  key={r}
                  className="flex items-center justify-between gap-2 text-[12px] py-0.5"
                >
                  <span className="font-mono text-accent">{r}</span>
                  {owner ? (
                    <button
                      type="button"
                      onClick={() => onSelectModule(owner)}
                      className="text-[11px] text-muted hover:text-white underline-offset-2 hover:underline"
                    >
                      ← {owner}
                    </button>
                  ) : (
                    <span className="text-[11px] italic text-muted">unresolved</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Routes (${ownRoutes.length})`} empty="No routes mounted.">
        {ownRoutes.length > 0 && (
          <ul className="space-y-1">
            {ownRoutes.map((r, i) => (
              <li key={`${r.method}-${r.path}-${i}`} className="flex items-center gap-2 text-[12px]">
                <MethodChip method={r.method} />
                <code className="font-mono text-[11px] truncate">{r.path}</code>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </aside>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="px-4 py-3 border-b border-border last:border-b-0">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-2">{title}</div>
      {children ?? <div className="text-[11px] italic text-muted">{empty}</div>}
    </section>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-get border-get/30',
  POST: 'text-post border-post/30',
  PUT: 'text-put border-put/30',
  PATCH: 'text-patch border-patch/30',
  DELETE: 'text-delete border-delete/30',
};

export function MethodChip({ method }: { method: string }) {
  const cls = METHOD_COLORS[method] ?? 'text-muted border-border';
  return (
    <span
      className={`inline-flex w-14 justify-center font-mono text-[10px] px-1.5 py-0.5 rounded border ${cls}`}
    >
      {method}
    </span>
  );
}
