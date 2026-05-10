import type { GraphData } from '../lib/types';

type Props = {
  data: GraphData;
  producerName: string;
  onClose: () => void;
  onSelectModule: (name: string) => void;
};

export default function ProducerDrawer({ data, producerName, onClose, onSelectModule }: Props) {
  const producer = data.producers.find((p) => p.name === producerName);
  if (!producer) {
    return (
      <aside className="w-[360px] shrink-0 border-l border-border bg-panel/60 p-4 text-muted text-sm">
        Producer <code className="font-mono">{producerName}</code> not found.
        <button onClick={onClose} className="ml-2 underline">
          close
        </button>
      </aside>
    );
  }

  const consumers = data.modules.filter((m) => m.consumer?.queue === producer.binding);

  return (
    <aside className="w-[360px] shrink-0 border-l border-border bg-panel/60 overflow-y-auto">
      <header className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted">Producer</div>
          <h2 className="text-[15px] font-semibold truncate flex items-center gap-1.5">
            <span className="text-post text-xs">→</span>
            {producer.name}
          </h2>
          <code className="font-mono text-[11px] text-muted">{producer.binding}</code>
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

      <section className="px-4 py-3 border-b border-border">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Send via</div>
        <pre className="font-mono text-[11px] bg-panel-2 rounded p-2 overflow-x-auto">
          <code>{`c.var.queues.${producer.name}.send(body)`}</code>
        </pre>
      </section>

      <section className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-2">
          Consumers ({consumers.length})
        </div>
        {consumers.length === 0 ? (
          <div className="text-[11px] italic text-muted">
            No module declares <code className="font-mono not-italic">consumer:</code> on this binding.
          </div>
        ) : (
          <ul className="space-y-1">
            {consumers.map((c) => (
              <li key={c.name} className="flex items-center justify-between text-[12px]">
                <button
                  type="button"
                  onClick={() => onSelectModule(c.name)}
                  className="flex items-center gap-1.5 hover:underline underline-offset-2"
                >
                  <span className="text-put text-[10px]">⇆</span>
                  {c.name}
                </button>
                {c.consumer?.dlq ? (
                  <code className="font-mono text-[10px] text-delete">DLQ: {c.consumer.dlq}</code>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
