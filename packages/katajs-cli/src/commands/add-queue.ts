import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { cyan, dim, green, yellow } from 'kolorist';
import { AnchorMissingError, insertBeforeAnchor } from '../codemod';
import { findKatajsProject } from '../utils/project';
import { normalizeName, type Casings } from '../utils/text';

export type AddQueueOptions = {
  /** Logical queue name (e.g. "orders"). */
  name: string;
  /** Target module (kebab name). */
  inModule: string;
  /** wrangler binding name; defaults to KEBAB→SCREAMING_SNAKE + _QUEUE. */
  binding?: string;
  /** wrangler binding name for a dead-letter queue (optional). */
  dlq?: string;
  /** Use `handleBatch` instead of `handle`. */
  batch?: boolean;
  /** Skip producer manifest entry in createApp (for consumer-only Workers like apps/worker). */
  noProducer?: boolean;
  cwd?: string;
};

export async function addQueue(opts: AddQueueOptions): Promise<void> {
  const project = findKatajsProject(opts.cwd);
  const moduleCasings = normalizeName(opts.inModule);
  const queueCasings = normalizeName(opts.name);
  const bindingName = opts.binding ?? deriveBindingName(queueCasings.kebab);
  const dlqBinding = opts.dlq;

  const moduleDir = join(project.srcDir, 'modules', moduleCasings.kebab);
  if (!existsSync(moduleDir)) {
    throw new Error(
      `Module "${moduleCasings.kebab}" not found at ${moduleDir}. Run \`katajs add module ${moduleCasings.kebab}\` first.`,
    );
  }

  const consumerPath = join(moduleDir, `${queueCasings.kebab}.consumer.ts`);
  if (existsSync(consumerPath)) {
    throw new Error(
      `Consumer file already exists: ${consumerPath}\nRefusing to overwrite.`,
    );
  }

  // 1. Generate the consumer file.
  writeConsumerFile({
    dst: consumerPath,
    queue: queueCasings,
    binding: bindingName,
    dlq: dlqBinding,
    batch: opts.batch ?? false,
  });

  // 2. Mutate the module's index.ts: import + consumer field.
  const indexPath = join(moduleDir, 'index.ts');
  const fallbacks: string[] = [];

  if (!existsSync(indexPath)) {
    fallbacks.push(
      yellow(`Module index not found: ${indexPath}\nWire up the consumer manually.`),
    );
  } else {
    let content = readFileSync(indexPath, 'utf8');
    let snippet = '';

    try {
      content = insertBeforeAnchor(
        content,
        'module-service-imports',
        `import { ${queueCasings.camel}Consumer } from './${queueCasings.kebab}.consumer';`,
      );
    } catch (err) {
      if (err instanceof AnchorMissingError) {
        snippet += `import { ${queueCasings.camel}Consumer } from './${queueCasings.kebab}.consumer';\n`;
      } else throw err;
    }

    try {
      content = insertBeforeAnchor(
        content,
        'module-consumer',
        `consumer: ${queueCasings.camel}Consumer,`,
      );
    } catch (err) {
      if (err instanceof AnchorMissingError) {
        snippet +=
          `// Add to defineModule call:\nconsumer: ${queueCasings.camel}Consumer,\n`;
      } else throw err;
    }

    writeFileSync(indexPath, content);

    if (snippet) {
      fallbacks.push(
        yellow(`Some anchors missing in ${indexPath}.\nPaste manually:\n`) + snippet,
      );
    }
  }

  // 3. Producer manifest: insert into createApp's `queues:` block (app.ts) and
  //    types.d.ts's `QueuesRegistry` augmentation. Skipped when --no-producer
  //    (consumer-only mode for apps/worker / strict separation).
  if (!opts.noProducer) {
    const appPath = join(project.srcDir, 'app.ts');
    if (existsSync(appPath)) {
      let appSrc = readFileSync(appPath, 'utf8');
      const importLine = `import { ${queueCasings.pascal}EventSchema } from './modules/${moduleCasings.kebab}/${queueCasings.kebab}.consumer';`;
      const queuesEntry = [
        `${queueCasings.camel}: {`,
        `  binding: '${bindingName}',`,
        `  schema: ${queueCasings.pascal}EventSchema,`,
        `},`,
      ];
      let appFallback = '';

      // Add the schema import (reuse the existing module-imports anchor).
      if (!appSrc.includes(importLine)) {
        try {
          appSrc = insertBeforeAnchor(appSrc, 'module-imports', importLine);
        } catch (err) {
          if (err instanceof AnchorMissingError) {
            appFallback += importLine + '\n';
          } else throw err;
        }
      }

      // Add the queues entry.
      try {
        appSrc = insertBeforeAnchor(appSrc, 'queues', queuesEntry);
      } catch (err) {
        if (err instanceof AnchorMissingError) {
          appFallback +=
            `// Add to createApp's queues:\n${queueCasings.camel}: { binding: '${bindingName}', schema: ${queueCasings.pascal}EventSchema },\n`;
        } else throw err;
      }

      writeFileSync(appPath, appSrc);

      if (appFallback) {
        fallbacks.push(
          yellow(`Some anchors missing in ${appPath}.\nPaste manually:\n`) + appFallback,
        );
      }
    }

    // types.d.ts QueuesRegistry augmentation
    const typesPath = join(project.srcDir, 'types.d.ts');
    if (existsSync(typesPath)) {
      let typesSrc = readFileSync(typesPath, 'utf8');
      let typesFallback = '';

      const typeImportLine = `import type { ${queueCasings.pascal}Event } from './modules/${moduleCasings.kebab}/${queueCasings.kebab}.consumer';`;
      const typedQueueImport = `import type { TypedQueue } from '@katajs/core';`;
      const registryEntry = `${queueCasings.camel}: TypedQueue<${queueCasings.pascal}Event>;`;

      // Add TypedQueue import once.
      if (!typesSrc.includes(typedQueueImport)) {
        // Insert at top — there's no anchor for type imports; use a regex.
        typesSrc = typesSrc.replace(
          /^import type \{ DrizzleClient \} from '@katajs\/drizzle';/m,
          `${typedQueueImport}\n$&`,
        );
      }

      // Add the event type import (reuse registry-imports anchor — close enough).
      if (!typesSrc.includes(typeImportLine)) {
        try {
          typesSrc = insertBeforeAnchor(typesSrc, 'registry-imports', typeImportLine);
        } catch (err) {
          if (err instanceof AnchorMissingError) {
            typesFallback += typeImportLine + '\n';
          } else throw err;
        }
      }

      // Add to QueuesRegistry.
      try {
        typesSrc = insertBeforeAnchor(typesSrc, 'queues-registry', registryEntry);
      } catch (err) {
        if (err instanceof AnchorMissingError) {
          typesFallback +=
            `// Add to QueuesRegistry interface:\n${registryEntry}\n`;
        } else throw err;
      }

      writeFileSync(typesPath, typesSrc);

      if (typesFallback) {
        fallbacks.push(
          yellow(`Some anchors missing in ${typesPath}.\nPaste manually:\n`) + typesFallback,
        );
      }
    }
  }

  // 4. Report success.
  p.outro(
    `${green('✓')} Added queue consumer ${cyan(queueCasings.camel + 'Consumer')} to module ${cyan(moduleCasings.kebab)}` +
      (opts.noProducer ? '' : `\n  Wired ${cyan(`c.var.queues.${queueCasings.camel}.send(...)`)} producer`),
  );
  // eslint-disable-next-line no-console
  console.log(dim('  File:'));
  // eslint-disable-next-line no-console
  console.log(
    dim(`    src/modules/${moduleCasings.kebab}/${queueCasings.kebab}.consumer.ts`),
  );

  if (fallbacks.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\n' + yellow('  Some snippets need manual paste:\n'));
    for (const f of fallbacks) {
      // eslint-disable-next-line no-console
      console.log(f + '\n');
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n' + cyan('  Next: add the wrangler bindings'));
  // eslint-disable-next-line no-console
  console.log(
    dim('  In wrangler.jsonc, add (or extend) the queues section:\n'),
  );
  // eslint-disable-next-line no-console
  console.log(buildWranglerSnippet(queueCasings.kebab, bindingName, dlqBinding));

  if (!opts.noProducer) {
    // eslint-disable-next-line no-console
    console.log(
      '\n' +
        dim(
          `  Producer wired automatically — call ${cyan(`c.var.queues.${queueCasings.camel}.send(...)`)} from any service or route.`,
        ),
    );
  }
}

function deriveBindingName(kebab: string): string {
  return kebab.replace(/-/g, '_').toUpperCase() + '_QUEUE';
}

type WriteConsumerArgs = {
  dst: string;
  queue: Casings;
  binding: string;
  dlq?: string;
  batch: boolean;
};

function writeConsumerFile(args: WriteConsumerArgs): void {
  const { queue, binding, dlq, batch } = args;
  const optionalDlq = dlq ? `\n  dlq: '${dlq}',\n  maxRetries: 5,` : '';

  const handlerBlock = batch
    ? `  async handleBatch(batch, c) {
    // TODO: implement batch processing.
    // The framework has already validated each message body against ${queue.pascal}EventSchema.
    for (const message of batch.messages) {
      const event = message.body;
      void event;
      void c;
      message.ack();
    }
  },`
    : `  async handle(message, c) {
    // TODO: implement ${queue.kebab} message processing.
    const event = message.body;
    void event;
    void c;
  },`;

  const tmpl = `import { z } from 'zod';
import { defineConsumer } from '@katajs/core';

/**
 * Message body schema for the ${queue.kebab} queue. Update this to match
 * the actual messages your producers send.
 */
export const ${queue.pascal}EventSchema = z.object({
  // TODO: define your message shape
  id: z.uuid(),
});
export type ${queue.pascal}Event = z.infer<typeof ${queue.pascal}EventSchema>;

export const ${queue.camel}Consumer = defineConsumer({
  queue: '${binding}',
  schema: ${queue.pascal}EventSchema,${optionalDlq}
${handlerBlock}
});
`;

  writeFileSync(args.dst, tmpl);
}

function buildWranglerSnippet(
  queueName: string,
  binding: string,
  dlq?: string,
): string {
  const producers = [`    { "binding": "${binding}", "queue": "${queueName}" }`];
  const dlqProducer = dlq
    ? `    ,\n    { "binding": "${dlq}", "queue": "${queueName}-dlq" }`
    : '';
  const consumerEntry = dlq
    ? `    {
      "queue": "${queueName}",
      "max_batch_size": 100,
      "max_batch_timeout": 30,
      "max_retries": 5,
      "dead_letter_queue": "${queueName}-dlq"
    }`
    : `    {
      "queue": "${queueName}",
      "max_batch_size": 100,
      "max_batch_timeout": 30,
      "max_retries": 3
    }`;

  return `  "queues": {
    "producers": [
${producers.join(',\n')}${dlqProducer}
    ],
    "consumers": [
${consumerEntry}
    ]
  }`;
}

