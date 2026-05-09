import type { RequestContainer } from "@katajs/core";
import type { AuditEntry } from "../../db/schema";

export type AuditService = {
  /**
   * Record an audited action. Always emits a corresponding `events` row first
   * (cross-module dep — exercises the framework's `requires` machinery).
   */
  log(args: {
    actorId: string;
    action: string;
    details: Record<string, unknown>;
  }): Promise<AuditEntry>;
};

export function makeAuditService(c: RequestContainer): AuditService {
  return {
    async log({ actorId, action, details }) {
      // Cross-module resolve: events lives in another module, declared in `requires`.
      const eventService = c.resolve("eventService");
      await eventService.record(`audit.${action}`, { actorId, ...details });

      const repo = c.resolve("auditRepository");
      return repo.insert({ actorId, action, details: JSON.stringify(details) });
    },
  };
}
