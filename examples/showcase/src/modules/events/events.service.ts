import type { RequestContainer } from '@katajs/core';
import type { Event } from '../../db/schema';

export type EventService = {
  record(name: string, payload: Record<string, unknown>): Promise<Event>;
};

export function makeEventService(c: RequestContainer): EventService {
  return {
    async record(name, payload) {
      const repo = c.resolve('eventRepository');
      return repo.insert({ name, payload: JSON.stringify(payload) });
    },
  };
}
