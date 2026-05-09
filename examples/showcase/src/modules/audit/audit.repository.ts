import { desc, eq } from 'drizzle-orm';
import type { DrizzleClientOrTx } from '@katajs/drizzle';
import { auditLog, type AuditEntry, type NewAuditEntry } from '../../db/schema';
import * as schema from '../../db/schema';

type Schema = typeof schema;

export function makeAuditRepository(dbOrTx: DrizzleClientOrTx<Schema>) {
  return {
    async insert(input: NewAuditEntry): Promise<AuditEntry> {
      const [row] = await dbOrTx.insert(auditLog).values(input).returning();
      if (!row) throw new Error('audit insert returned no row');
      return row;
    },
    async listForActor(actorId: string): Promise<AuditEntry[]> {
      return dbOrTx
        .select()
        .from(auditLog)
        .where(eq(auditLog.actorId, actorId))
        .orderBy(desc(auditLog.loggedAt));
    },
  };
}

export type AuditRepository = ReturnType<typeof makeAuditRepository>;
