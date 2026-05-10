import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
});

const features: Array<{ title: string; body: string }> = [
  {
    title: 'Type-safe modules',
    body: 'Group related routes and services. Declare cross-module deps with `requires`. Boot validation fails fast if anything is wired wrong.',
  },
  {
    title: 'Request-scoped container',
    body: 'Lazy DI per request. No global singletons. `c.var.resolve(key)` is fully typed via the Registry.',
  },
  {
    title: 'Validation at the boundary',
    body: 'Zod schemas via `validate({ body, query, param })`. Clients keep Hono RPC inference end-to-end.',
  },
  {
    title: 'Domain errors → HTTP',
    body: '`throw new PostNotFoundError(id)` becomes a structured JSON response via errorMapper.',
  },
  {
    title: 'Transactions across modules',
    body: '`withTransaction(fn)` gives you a sub-container where every repository binds to the same transaction.',
  },
  {
    title: 'Cloudflare Queues, first-class',
    body: 'Modules declare consumers. createApp declares producers. Same Worker, or split across apps/api + apps/worker.',
  },
  {
    title: 'Live devtools',
    body: '`npx katajs-devtools` opens an interactive React UI: graph canvas, drawer, routes table, queue view, Cmd+K.',
  },
  {
    title: 'CLI scaffolders',
    body: 'create-katajs ships single-API and --monorepo shapes. `katajs add module|service|route|queue` mutates without hand-editing.',
  },
];

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-col items-center justify-center px-4 py-16 max-w-5xl mx-auto w-full">
        <img
          src="/logo.svg"
          alt="Kata logo"
          className="h-20 w-20 mb-6 dark:invert"
        />
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-center mb-3">
          Kata
        </h1>
        <p className="text-lg md:text-xl text-fd-muted-foreground text-center mb-2 max-w-2xl">
          The opinionated Hono framework for Cloudflare's full stack.
        </p>
        <p className="text-sm text-fd-muted-foreground text-center mb-8 max-w-2xl">
          Modules, a request-scoped DI container, transactions, queues, and a
          live devtools graph — without much weight on top of Hono.
        </p>
        <div className="flex items-center gap-3 mb-16">
          <Link
            to="/docs/$"
            params={{ _splat: '' }}
            className="px-4 py-2 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm"
          >
            Read the docs →
          </Link>
          <a
            href="https://github.com/ookino/katajs"
            className="px-4 py-2 rounded-lg border border-fd-border font-medium text-sm hover:bg-fd-muted"
          >
            GitHub
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-fd-border bg-fd-card p-4"
            >
              <h2 className="font-semibold text-sm mb-1.5">{f.title}</h2>
              <p className="text-xs text-fd-muted-foreground leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 w-full">
          <div className="text-xs uppercase tracking-wider text-fd-muted-foreground mb-3 text-center">
            Devtools — live module graph
          </div>
          <img
            src="/devtools.jpeg"
            alt="Kata devtools showing the showcase app's module graph with consumer + producer awareness"
            className="rounded-lg border border-fd-border w-full"
          />
        </div>

        <pre className="mt-16 rounded-lg border border-fd-border bg-fd-muted/50 px-4 py-3 text-sm font-mono">
          pnpm create katajs my-app
        </pre>
      </div>
    </HomeLayout>
  );
}
