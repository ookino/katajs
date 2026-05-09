import cac from 'cac';
import * as p from '@clack/prompts';
import { red } from 'kolorist';
import { addModule } from './commands/add-module';
import { addService } from './commands/add-service';
import { addRoute } from './commands/add-route';

const cli = cac('katajs');

cli
  .command('add <kind> <name> [path]', 'Add something to your katajs project')
  .option('--in <module>', 'Target module (for `add service` and `add route`)')
  .example('  katajs add module comments')
  .example('  katajs add service featured --in posts')
  .example('  katajs add route post /comments --in posts')
  .action(async (kind: string, name: string, path: string | undefined, opts: { in?: string }) => {
    try {
      switch (kind) {
        case 'module':
        case 'm':
          p.intro('katajs add module');
          await addModule({ name });
          return;
        case 'service':
        case 's':
          if (!opts.in) throw new Error('Missing --in <module>. Example: katajs add service featured --in posts');
          p.intro('katajs add service');
          await addService({ name, inModule: opts.in });
          return;
        case 'route':
        case 'r': {
          // For routes the positional args are <method> <path>.
          // cac's <name> here is the method, [path] is the path.
          if (!path) throw new Error('Missing path. Example: katajs add route post /comments --in posts');
          if (!opts.in) throw new Error('Missing --in <module>. Example: katajs add route post /comments --in posts');
          p.intro('katajs add route');
          await addRoute({ method: name, path, inModule: opts.in });
          return;
        }
        default:
          // eslint-disable-next-line no-console
          console.error(red(`Unknown target: '${kind}'.`));
          // eslint-disable-next-line no-console
          console.error('Supported: module, service, route');
          process.exit(1);
      }
    } catch (err) {
      p.cancel(red((err as Error).message));
      process.exit(1);
    }
  });

cli.help();
cli.version('0.1.0');

cli.parse();
