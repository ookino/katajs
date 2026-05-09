/**
 * Public surface of @{{PROJECT_NAME}}/db.
 *
 * Workspace consumers import schema tables and types from here:
 *
 *   import * as schema from '@{{PROJECT_NAME}}/db';
 *   import { posts, type Post, type NewPost } from '@{{PROJECT_NAME}}/db';
 *
 * Or pull just the schema namespace:
 *
 *   import * as schema from '@{{PROJECT_NAME}}/db/schema';
 */
export * from './schema';
