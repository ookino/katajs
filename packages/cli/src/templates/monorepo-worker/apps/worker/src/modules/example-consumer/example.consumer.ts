import { z } from 'zod';
import { defineConsumer } from '@katajs/core';

/**
 * Message body schema for the example queue. Replace this with the schema
 * your producer (in apps/api) actually sends. If you want the producer and
 * consumer to share the schema definition, extract it into a small shared
 * package (e.g. `packages/events/`) and import from there.
 */
export const ExampleEventSchema = z.object({
  id: z.string().uuid(),
  payload: z.unknown(),
});
export type ExampleEvent = z.infer<typeof ExampleEventSchema>;

export const exampleConsumer = defineConsumer({
  queue: 'EXAMPLE_QUEUE',
  schema: ExampleEventSchema,
  async handle(message, c) {
    const service = c.resolve('exampleService');
    await service.process(message.body);
  },
});
