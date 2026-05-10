import { useMemo, useState } from 'react';
import type { GraphData } from '../lib/types';
import { MethodChip } from './ModuleDrawer';

type Props = {
  data: GraphData;
  onSelectModule: (name: string) => void;
};

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export default function RoutesTable({ data, onSelectModule }: Props) {
  const [filter, setFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return data.routes.filter((r) => {
      if (methodFilter && r.method !== methodFilter) return false;
      if (q.length === 0) return true;
      return (
        r.path.toLowerCase().includes(q) ||
        r.module.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q)
      );
    });
  }, [data.routes, filter, methodFilter]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border px-6 py-3 flex items-center gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by path, method, or module…"
          className="flex-1 max-w-md bg-panel border border-border rounded-md px-3 py-1.5 text-[13px] placeholder:text-muted/70 focus:outline-none focus:border-accent"
        />
        <div className="flex items-center gap-1">
          <FilterChip
            active={methodFilter === null}
            onClick={() => setMethodFilter(null)}
            label="all"
          />
          {METHODS.map((m) => (
            <FilterChip
              key={m}
              active={methodFilter === m}
              onClick={() => setMethodFilter(methodFilter === m ? null : m)}
              label={m}
            />
          ))}
        </div>
        <span className="text-[11px] text-muted ml-auto">
          {visible.length} of {data.routes.length}
        </span>
      </div>

      <div className="px-6 py-4">
        {visible.length === 0 ? (
          <div className="text-muted text-sm italic py-8 text-center">No routes match.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted">
                <th className="text-left font-medium pb-2 w-20">Method</th>
                <th className="text-left font-medium pb-2">Path</th>
                <th className="text-left font-medium pb-2 w-48">Module</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr
                  key={`${r.method}-${r.path}-${i}`}
                  className="border-t border-border hover:bg-panel/50"
                >
                  <td className="py-2">
                    <MethodChip method={r.method} />
                  </td>
                  <td className="py-2 font-mono text-[12px]">{r.path}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => onSelectModule(r.module)}
                      className="text-[12px] hover:underline underline-offset-2"
                    >
                      {r.module}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'font-mono text-[10px] px-2 py-1 rounded border transition-colors',
        active
          ? 'bg-accent/15 border-accent/40 text-white'
          : 'border-border text-muted hover:border-accent/40 hover:text-white',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
