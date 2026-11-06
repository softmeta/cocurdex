import type { MemoryPartition } from "@cocurdex/shared";

export interface PersonaMemoryScope {
  own: MemoryPartition;
  read: MemoryPartition[];
}

export type PersonaMemoryTarget = "assistant" | "user";

const ABOUT_ME: MemoryPartition = { kind: "me" };

export function personaMemoryScope(personaId: string): PersonaMemoryScope {
  const own: MemoryPartition = { kind: "agent", agentId: personaId };
  return { own, read: [own, ABOUT_ME] };
}

export function personaWritePartition(
  scope: PersonaMemoryScope,
  target: PersonaMemoryTarget,
): MemoryPartition {
  return target === "user" ? ABOUT_ME : scope.own;
}

export const PERSONA_SYSTEM_SECTION = "assistant_persona";

export interface PersonaPromptSource {
  instructions: string | null;
  soul: string | null;
}

export function buildPersonaSystemSection(source: PersonaPromptSource) {
  const parts = [source.instructions, source.soul]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return [
    "The user wrote these instructions for you as their personal assistant. Follow them in every turn.",
    ...parts,
  ].join("\n\n");
}

export function personaSystemSections(
  source: PersonaPromptSource | null,
): Record<string, string> {
  const section = source ? buildPersonaSystemSection(source) : null;
  return section ? { [PERSONA_SYSTEM_SECTION]: section } : {};
}
