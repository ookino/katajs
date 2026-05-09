import type { RequestContainer } from '@katajs/core';
import type { ExampleEvent } from './example.consumer';

export type ExampleService = {
  process(event: ExampleEvent): Promise<void>;
};

export function makeExampleService(_c: RequestContainer): ExampleService {
  return {
    async process(event) {
      // TODO: implement message processing.
      // Reach `_c.db` for database access (the Drizzle client is shared with
      // apps/api via `packages/db`). Reach `_c.resolve('otherService')` for
      // services from other modules in this worker's `modules:` array.
      void event;
    },
  };
}
