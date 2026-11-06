import type { SessionRecord } from "@cocurdex/shared";
import type { ApplicationPrincipal } from "./application-service";

type ApplicationSession = Pick<
  SessionRecord,
  "id" | "sessionKind" | "agentRoleId" | "parentSessionId"
>;

export interface ApplicationPrincipalDependencies {
  getSession(id: string): Promise<ApplicationSession | null>;
  persona(session: ApplicationSession): string | null;
  delegation(id: string): string | null;
  teamLead(id: string): Promise<string | null>;
}

export async function resolveApplicationPrincipal(
  sessionId: string,
  deps: ApplicationPrincipalDependencies,
): Promise<ApplicationPrincipal> {
  const visited = new Set<string>();
  let current: string | null = sessionId;
  while (current && visited.size < 32 && !visited.has(current)) {
    visited.add(current);
    const session = await deps.getSession(current);
    if (!session) break;
    if (current === sessionId) {
      const personaId = deps.persona(session);
      if (personaId) return { personaId, delegated: false };
    }
    const personaId = deps.delegation(current);
    if (personaId) return { personaId, delegated: true };
    const lead = await deps.teamLead(current);
    current = session.parentSessionId ?? (lead !== current ? lead : null);
  }
  return { personaId: null, delegated: true };
}
