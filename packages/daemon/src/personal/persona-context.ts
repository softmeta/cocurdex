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

export function buildPersonaSoulBlock(soul: string | null) {
  const text = soul?.trim();
  if (!text) return null;
  return [
    "<assistant-persona>",
    "The user wrote this persona for you. Follow it throughout this conversation.",
    text,
    "</assistant-persona>",
  ].join("\n");
}
