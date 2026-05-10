// Plain Module-shaped objects — no framework imports — keeps fixtures
// resolution-independent.
export const modules = [
  {
    name: 'posts',
    prefix: '/posts',
    provides: {},
    requires: [],
    routes: { routes: [{ method: 'GET', path: '/' }] },
  },
];
