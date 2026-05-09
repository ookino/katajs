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

  // 3. Report success + emit wrangler.jsonc + Bindings type snippets for
  //    manual paste (JSONC mutation is fragile and the Bindings type lives
  //    in user-customizable territory).
  p.outro(
    `${green('✓')} Added queue consumer ${cyan(queueCasings.camel + 'Consumer')} to module ${cyan(moduleCasings.kebab)}`,
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
  console.log('\n' + cyan('  Next: wire the wrangler bindings + Bindings type'));
  // eslint-disable-next-line no-console
  console.log(
    dim('  In wrangler.jsonc, add (or extend) the queues section:\n'),
  );
  // eslint-disable-next-line no-console
  console.log(buildWranglerSnippet(queueCasings.kebab, bindingName, dlqBinding));
  // eslint-disable-next-line no-console
  console.log(
    '\n' + dim('  In src/app.ts (or wherever Bindings is declared), add:\n'),
  );
  // eslint-disable-next-line no-console
  console.log(buildBindingsSnippet(queueCasings, bindingName, dlqBinding));
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
  id: z.string().uuid(),
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

function buildBindingsSnippet(
  queue: Casings,
  binding: string,
  dlq?: string,
): string {
  const dlqLine = dlq
    ? `\n    ${dlq}: Queue;  // raw — DLQ envelope, not ${queue.pascal}Event`
    : '';
  return `  import type { ${queue.pascal}Event } from './modules/<module>/${queue.kebab}.consumer';

  export type Bindings = {
    HYPERDRIVE: Hyperdrive;
    ${binding}: Queue<${queue.pascal}Event>;${dlqLine}
  };`;
}
