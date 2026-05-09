import { defineModule } from '@katajs/core';
import { makeEventRepository, type EventRepository } from './events.repository';
import { makeEventService, type EventService } from './events.service';
// katajs:module-service-imports

export const eventsModule = defineModule({
  name: 'events',
  provides: {
    eventRepository: (c): EventRepository => makeEventRepository(c.db),
    eventService: (c): EventService => makeEventService(c),
    // katajs:module-provides
  },
  requires: [] as const,
  // No routes — this module is internal to other modules.
});

/** Services this module contributes to the container's `Registry`. */
export type EventsRegistry = {
  eventRepository: EventRepository;
  eventService: EventService;
  // katajs:module-registry
};

export type { EventRepository, EventService };
