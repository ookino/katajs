import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    mysql: 'src/mysql.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // Peers + drivers stay external so each entry only pulls what it imports
  // (the main entry → postgres; the /mysql entry → mysql2).
  external: [
    'drizzle-orm',
    'drizzle-orm/*',
    'postgres',
    'mysql2',
    'mysql2/*',
    '@katajs/core',
    'hono',
  ],
});
