import { desc } from 'drizzle-orm';
import type { DrizzleClientOrTx } from '@katajs/drizzle';
import { events, type Event, type NewEvent } from '../../db/schema';
import * as schema from '../../db/schema';

type Schema = typeof schema;

export function makeEventRepository(dbOrTx: DrizzleClientOrTx<Schema>) {
  return {
    async insert(input: NewEvent): Promise<Event> {
      const [row] = await dbOrTx.insert(events).values(input).returning();
      if (!row) throw new Error('events insert returned no row');
      return row;
    },
    async listRecent(limit = 50): Promise<Event[]> {
      return dbOrTx.select().from(events).orderBy(desc(events.occurredAt)).limit(limit);
    },
  };
}

export type EventRepository = ReturnType<typeof makeEventRepository>;
