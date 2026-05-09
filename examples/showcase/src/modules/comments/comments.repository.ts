import { desc, eq } from 'drizzle-orm';
import type { DrizzleClientOrTx } from '@katajs/drizzle';
import { comments, type Comment, type NewComment } from '../../db/schema';
import * as schema from '../../db/schema';

type Schema = typeof schema;

export function makeCommentRepository(dbOrTx: DrizzleClientOrTx<Schema>) {
  return {
    async findById(id: string): Promise<Comment | undefined> {
      const rows = await dbOrTx.select().from(comments).where(eq(comments.id, id)).limit(1);
      return rows[0];
    },
    async insert(input: NewComment): Promise<Comment> {
      const [row] = await dbOrTx.insert(comments).values(input).returning();
      if (!row) throw new Error('comments insert returned no row');
      return row;
    },
    async listByPost(
      postId: string,
      opts: { offset: number; limit: number },
    ): Promise<Comment[]> {
      return dbOrTx
        .select()
        .from(comments)
        .where(eq(comments.postId, postId))
        .orderBy(desc(comments.createdAt))
        .limit(opts.limit)
        .offset(opts.offset);
    },
    async deleteById(id: string): Promise<number> {
      const rows = await dbOrTx
        .delete(comments)
        .where(eq(comments.id, id))
        .returning({ id: comments.id });
      return rows.length;
    },
  };
}

export type CommentRepository = ReturnType<typeof makeCommentRepository>;
