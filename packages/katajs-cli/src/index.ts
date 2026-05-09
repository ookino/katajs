import cac from 'cac';
import * as p from '@clack/prompts';
import { red } from 'kolorist';
import { addModule } from './commands/add-module';
import { addService } from './commands/add-service';
import { addRoute } from './commands/add-route';
import { addQueue } from './commands/add-queue';

const cli = cac('katajs');

cli
  .command('add <kind> <name> [path]', 'Add something to your katajs project')
  .option('--in <module>', 'Target module (for `add service`, `add route`, `add queue`)')
  .option('--binding <BINDING>', 'wrangler binding name (for `add queue`; defaults to <NAME>_QUEUE)')
  .option('--dlq <DLQ_BINDING>', 'wrangler binding name for the dead-letter queue (for `add queue`)')
  .option('--batch', 'Generate `handleBatch` instead of `handle` (for `add queue`)')
  .example('  katajs add module comments')
  .example('  katajs add service featured --in posts')
  .example('  katajs add route post /comments --in posts')
  .example('  katajs add queue orders --in orders')
  .example('  katajs add queue orders --in orders --dlq ORDERS_DLQ --batch')
  .action(
    async (
      kind: string,
      name: string,
      path: string | undefined,
      opts: { in?: string; binding?: string; dlq?: string; batch?: boolean },
    ) => {
      try {
        switch (kind) {
          case 'module':
          case 'm':
            p.intro('katajs add module');
            await addModule({ name });
            return;
          case 'service':
          case 's':
            if (!opts.in)
              throw new Error('Missing --in <module>. Example: katajs add service featured --in posts');
            p.intro('katajs add service');
            await addService({ name, inModule: opts.in });
            return;
          case 'route':
          case 'r': {
            if (!path)
              throw new Error('Missing path. Example: katajs add route post /comments --in posts');
            if (!opts.in)
              throw new Error('Missing --in <module>. Example: katajs add route post /comments --in posts');
            p.intro('katajs add route');
            await addRoute({ method: name, path, inModule: opts.in });
            return;
          }
          case 'queue':
          case 'q':
            if (!opts.in)
              throw new Error('Missing --in <module>. Example: katajs add queue orders --in orders');
            p.intro('katajs add queue');
            await addQueue({
              name,
              inModule: opts.in,
              binding: opts.binding,
              dlq: opts.dlq,
              batch: opts.batch ?? false,
            });
            return;
          default:
            // eslint-disable-next-line no-console
            console.error(red(`Unknown target: '${kind}'.`));
            // eslint-disable-next-line no-console
            console.error('Supported: module, service, route, queue');
            process.exit(1);
        }
      } catch (err) {
        p.cancel(red((err as Error).message));
        process.exit(1);
      }
    },
  );

cli.help();
cli.version('0.1.0');

cli.parse();
