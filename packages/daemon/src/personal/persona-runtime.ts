import type {
  AgentProviderSnapshot,
  AgentRoleRecord,
  SaveAgentRolePayload,
} from "@cocurdex/shared";

type RuntimeFields = Pick<
  AgentRoleRecord,
  | "providerId"
  | "modelId"
  | "modelName"
  | "reasoningEffort"
  | "thinkingLevel"
  | "serviceTier"
  | "fastMode"
>;

function runtimeOf(snapshot: AgentProviderSnapshot): RuntimeFields {
  return {
    providerId: snapshot.providerId,
    modelId: snapshot.modelId,
    modelName: snapshot.modelName,
    reasoningEffort: snapshot.reasoningEffort ?? null,
    thinkingLevel: snapshot.thinkingLevel ?? null,
    serviceTier: snapshot.serviceTier ?? null,
    fastMode: snapshot.fastMode ?? null,
  };
}

export function personaRoleFromHomeThread(
  role: AgentRoleRecord,
  snapshot: AgentProviderSnapshot | null | undefined,
): SaveAgentRolePayload | null {
  if (!snapshot) return null;
  const runtime = runtimeOf(snapshot);
  const changed = (Object.keys(runtime) as (keyof RuntimeFields)[]).some(
    (key) => role[key] !== runtime[key],
  );
  if (!changed) return null;
  const { createdAt: _created, updatedAt: _updated, ...rest } = role;
  return { ...rest, ...runtime };
}
