import { useEffect, useState } from 'react';
import type { ConnectionState, GraphData } from './types';

/**
 * Subscribes to /api/graph.sse and exposes the latest graph state. Falls back
 * to a one-shot fetch of /api/graph.json if EventSource is unavailable.
 */
export function useGraph(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ status: 'connecting' });

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      void (async () => {
        try {
          const res = await fetch('/api/graph.json');
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setState({ status: 'error', message: body.error ?? `HTTP ${res.status}` });
            return;
          }
          const data = (await res.json()) as GraphData;
          setState({ status: 'live', data });
        } catch (err) {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      })();
      return;
    }

    const es = new EventSource('/api/graph.sse');
    es.addEventListener('graph', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as GraphData;
        setState({ status: 'live', data });
      } catch (err) {
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    });
    es.addEventListener('error', (e) => {
      const data = (e as MessageEvent).data;
      if (typeof data === 'string' && data.length > 0) {
        try {
          const payload = JSON.parse(data) as { message?: string };
          setState({ status: 'error', message: payload.message ?? 'load error' });
          return;
        } catch {
          /* fall through */
        }
      }
      setState({ status: 'disconnected' });
    });
    return () => es.close();
  }, []);

  return state;
}
