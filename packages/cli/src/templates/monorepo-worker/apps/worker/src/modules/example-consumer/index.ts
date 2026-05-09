import { defineModule } from '@katajs/core';
import { makeExampleService, type ExampleService } from './example.service';
// katajs:module-service-imports
import { exampleConsumer } from './example.consumer';

export const exampleConsumerModule = defineModule({
  name: 'example-consumer',
  provides: {
    exampleService: (c): ExampleService => makeExampleService(c),
    // katajs:module-provides
  },
  requires: [] as const,
  consumer: exampleConsumer,
  // katajs:module-consumer
});

/** Services this module contributes to the container's `Registry`. */
export type ExampleConsumerRegistry = {
  exampleService: ExampleService;
  // katajs:module-registry
};

export type { ExampleService };
export { ExampleEventSchema, type ExampleEvent } from './example.consumer';
