import { defineModule } from '@katajs/core';
import { makeAuditRepository, type AuditRepository } from './audit.repository';
import { makeAuditService, type AuditService } from './audit.service';

export const auditModule = defineModule({
  name: 'audit',
  provides: {
    auditRepository: (c): AuditRepository => makeAuditRepository(c.db),
    auditService: (c): AuditService => makeAuditService(c),
  },
  // Cross-module dep: audit fans out into events. Boot validation will fail
  // if the events module isn't passed to createApp alongside this one.
  requires: ['eventService'] as const,
});

/** Services this module contributes to the container's `Registry`. */
export type AuditRegistry = {
  auditRepository: AuditRepository;
  auditService: AuditService;
};

export type { AuditRepository, AuditService };
