import { eq } from 'drizzle-orm';
import type { DrizzleClientOrTx } from '@katajs/drizzle';
import { posts, type NewPost, type Post } from '@{{PROJECT_NAME}}/db';
import * as schema from '@{{PROJECT_NAME}}/db';

type Schema = typeof schema;

export function makePostRepository(dbOrTx: DrizzleClientOrTx<Schema>) {
  return {
    async findById(id: string): Promise<Post | undefined> {
      const rows = await dbOrTx.select().from(posts).where(eq(posts.id, id)).limit(1);
      return rows[0];
    },
    async insert(input: NewPost): Promise<Post> {
      const [row] = await dbOrTx.insert(posts).values(input).returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },
  };
}

export type PostRepository = ReturnType<typeof makePostRepository>;
