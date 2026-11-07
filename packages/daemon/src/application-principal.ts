import type { ApplicationPrincipal, SessionRecord } from "@cocurdex/shared";

type ApplicationSession = Pick<
  SessionRecord,
  "id" | "agentType" | "sessionKind" | "agentRoleId" | "parentSessionId"
>;

const WORK_SESSION_KINDS = new Set(["main", "subagent", "teammate"]);

function isPiWorkSession(session: ApplicationSession | null) {
  return (
    session?.agentType === "pi" &&
    WORK_SESSION_KINDS.has(session.sessionKind ?? "main")
  );
}

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
  const caller = await deps.getSession(sessionId);
  let current: string | null = sessionId;
  while (current && visited.size < 32 && !visited.has(current)) {
    visited.add(current);
    const session = await deps.getSession(current);
    if (!session) break;
    if (current === sessionId) {
      const personaId = deps.persona(session);
      if (personaId) return { personaId, delegated: false, workSession: false };
    }
    const personaId = deps.delegation(current);
    if (personaId) return { personaId, delegated: true, workSession: false };
    const lead = await deps.teamLead(current);
    current = session.parentSessionId ?? (lead !== current ? lead : null);
  }
  return {
    personaId: null,
    delegated: false,
    workSession: isPiWorkSession(caller),
  };
}
