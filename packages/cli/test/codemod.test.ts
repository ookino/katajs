import { describe, expect, it } from 'vitest';
import {
  AnchorMissingError,
  appendRouteToChain,
  hasAnchor,
  insertBeforeAnchor,
} from '../src/codemod';

describe('insertBeforeAnchor', () => {
  it('inserts a single line before the anchor with matching indent', () => {
    const before = `import a from 'a';
// katajs:imports`;
    const after = insertBeforeAnchor(before, 'imports', "import b from 'b';");
    expect(after).toBe(`import a from 'a';
import b from 'b';
// katajs:imports`);
  });

  it('matches the anchor line indentation', () => {
    const before = `interface R extends
  A
  // katajs:registry
{}`;
    const after = insertBeforeAnchor(before, 'registry', ', B');
    expect(after).toBe(`interface R extends
  A
  , B
  // katajs:registry
{}`);
  });

  it('inserts multiple lines preserving order', () => {
    const before = `// katajs:foo`;
    const after = insertBeforeAnchor(before, 'foo', ['a', 'b', 'c']);
    expect(after).toBe(`a
b
c
// katajs:foo`);
  });

  it('is idempotent — does nothing if line already present', () => {
    const before = `existing line
// katajs:x`;
    const after = insertBeforeAnchor(before, 'x', 'existing line');
    expect(after).toBe(before);
  });

  it('throws AnchorMissingError when anchor is absent', () => {
    expect(() => insertBeforeAnchor('no anchor here', 'foo', 'bar')).toThrow(
      AnchorMissingError,
    );
  });
});

describe('hasAnchor', () => {
  it('detects anchor presence', () => {
    expect(hasAnchor('// katajs:routes', 'routes')).toBe(true);
    expect(hasAnchor('  // katajs:routes  ', 'routes')).toBe(true);
    expect(hasAnchor('something else', 'routes')).toBe(false);
  });
});

describe('appendRouteToChain', () => {
  const baseApp = `const { app } = createApp({
  modules: [postsModule],
  routes: (base) =>
    base
      .route(postsModule.prefix, postsModule.routes),
  // katajs:routes
});`;

  it('appends a new .route call, moving the trailing comma', () => {
    const after = appendRouteToChain(baseApp, 'authModule');
    expect(after).toBe(`const { app } = createApp({
  modules: [postsModule],
  routes: (base) =>
    base
      .route(postsModule.prefix, postsModule.routes)
      .route(authModule.prefix, authModule.routes),
  // katajs:routes
});`);
  });

  it('is idempotent — does nothing if the route is already in the chain', () => {
    const once = appendRouteToChain(baseApp, 'authModule');
    const twice = appendRouteToChain(once, 'authModule');
    expect(twice).toBe(once);
  });

  it('handles a chain with multiple existing .route() steps', () => {
    const multi = `  routes: (base) =>
    base
      .route(a.prefix, a.routes)
      .route(b.prefix, b.routes),
  // katajs:routes
});`;
    const after = appendRouteToChain(multi, 'c');
    expect(after).toContain('.route(b.prefix, b.routes)\n');
    expect(after).toContain('      .route(c.prefix, c.routes),');
  });

  it('throws AnchorMissingError when // katajs:routes is absent', () => {
    expect(() => appendRouteToChain('routes: (b) => b', 'x')).toThrow(
      AnchorMissingError,
    );
  });

  it('throws when no .route(<X>.prefix, <X>.routes) line precedes the anchor', () => {
    const noChain = `routes: (base) => base.get('/', () => {}),
  // katajs:routes
});`;
    expect(() => appendRouteToChain(noChain, 'x')).toThrow();
  });
});
