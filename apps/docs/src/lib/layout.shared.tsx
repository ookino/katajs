import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          {/* Logo source ships black; `dark:invert` flips it to white when
              Fumadocs's theme switches to dark mode. */}
          <img
            src="/logo.svg"
            alt={`${appName} logo`}
            className="h-5 w-5 dark:invert"
          />
          {appName}
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
