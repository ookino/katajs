import { desc, eq } from 'drizzle-orm';
import type { DrizzleClientOrTx } from '@katajs/drizzle';
import { users, type NewUser, type User } from '../../db/schema';
import * as schema from '../../db/schema';

type Schema = typeof schema;

export function makeUserRepository(dbOrTx: DrizzleClientOrTx<Schema>) {
  return {
    async findById(id: string): Promise<User | undefined> {
      const rows = await dbOrTx.select().from(users).where(eq(users.id, id)).limit(1);
      return rows[0];
    },
    async findByEmail(email: string): Promise<User | undefined> {
      const rows = await dbOrTx.select().from(users).where(eq(users.email, email)).limit(1);
      return rows[0];
    },
    async insert(input: NewUser): Promise<User> {
      const [row] = await dbOrTx.insert(users).values(input).returning();
      if (!row) throw new Error('users insert returned no row');
      return row;
    },
    async list(opts: { offset: number; limit: number }): Promise<User[]> {
      return dbOrTx
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(opts.limit)
        .offset(opts.offset);
    },
  };
}

export type UserRepository = ReturnType<typeof makeUserRepository>;
