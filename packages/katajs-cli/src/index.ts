import cac from 'cac';
import * as p from '@clack/prompts';
import { red, yellow } from 'kolorist';
import { addModule } from './commands/add-module';

const cli = cac('katajs');

cli
  .command('add <kind> <name>', 'Add something to your katajs project')
  .example('  katajs add module comments')
  .action(async (kind: string, name: string) => {
    switch (kind) {
      case 'module':
      case 'm':
        p.intro('katajs add module');
        try {
          await addModule({ name });
        } catch (err) {
          p.cancel(red((err as Error).message));
          process.exit(1);
        }
        return;
      case 'service':
      case 'route':
        // eslint-disable-next-line no-console
        console.error(yellow(`'${kind}' is not yet implemented (coming in v0.2).`));
        process.exit(1);
      default:
        // eslint-disable-next-line no-console
        console.error(red(`Unknown target: '${kind}'.`));
        // eslint-disable-next-line no-console
        console.error('Supported: module');
        process.exit(1);
    }
  });

cli.help();
cli.version('0.1.0');

cli.parse();
