import { defineConsumer, defineModule } from '@katajs/core';
import { z } from 'zod';
import { makeAuditRepository, type AuditRepository } from './audit.repository';
import { makeAuditService, type AuditService } from './audit.service';
// katajs:module-service-imports

/**
 * Wire format for messages flowing through `AUDIT_QUEUE`. Producers (the
 * `auditEvents` queue declared in createApp) validate against this on send;
 * consumers (this module) validate again on receive.
 */
export const AuditEventSchema = z.object({
  actorId: z.string(),
  action: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const auditModule = defineModule({
  name: 'audit',
  provides: {
    auditRepository: (c): AuditRepository => makeAuditRepository(c.db),
    auditService: (c): AuditService => makeAuditService(c),
    // katajs:module-provides
  },
  // Cross-module dep: audit fans out into events. Boot validation will fail
  // if the events module isn't passed to createApp alongside this one.
  requires: ['eventService'] as const,
  // Queue consumer: also accept audit entries asynchronously over a queue.
  // Producers send via `c.var.queues.auditEvents.send(...)` (see app.ts).
  consumer: defineConsumer({
    queue: 'AUDIT_QUEUE',
    dlq: 'AUDIT_DLQ',
    schema: AuditEventSchema,
    handle: async (message, c) => {
      const audit = c.resolve('auditService');
      await audit.log(message.body);
    },
  }),
  // katajs:module-consumer
});

/** Services this module contributes to the container's `Registry`. */
export type AuditRegistry = {
  auditRepository: AuditRepository;
  auditService: AuditService;
  // katajs:module-registry
};

export type { AuditRepository, AuditService };
