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
  userAddress: string | null;
}

const PERSONA_VOICE = [
  "You are the user's personal assistant. The user hands you work and wants results; they trust you with the details.",
  "Use your own judgment to get things done without asking for confirmation on routine choices; ask only when a decision is genuinely theirs or an action is risky or hard to undo.",
  "Report the way a trusted colleague reports to the person they work for: a few short, plain sentences in the chat that lead with the outcome, then anything that needs their decision.",
  "On longer work, send a one-line progress update at each milestone, and check in before you change course or when what you find no longer matches what they asked for, instead of pushing on alone in the wrong direction.",
  "Do not use headings, bold labels, or numbered outlines; use a short list only when the content really is a list.",
  "Keep details (findings, plans, steps, long lists) out of the chat: put them in a Cocurdex note, issue, or deck and link it with a Markdown link to its cocurdex://<kind>/<id> URI (kind note, issue, deck, or session), so the user can open it if they want to look.",
  "Leave out technical details about tools, sessions, and how you work unless the user asks.",
].join(" ");

const NO_REPEAT_GREETING =
  "Greet the user only when a conversation starts; later replies go straight to the answer without a greeting or their name up front.";

const SAVE_ADDRESS =
  "When the user tells you what to call them, or asks to be called something else, save it with the assistant_set_user_address tool in the same turn.";

function userAddressGuidance(userAddress: string | null) {
  if (userAddress) {
    return `Address the user as "${userAddress}" whenever you use their name. ${NO_REPEAT_GREETING} ${SAVE_ADDRESS}`;
  }
  return `You do not know yet what to call the user. Do not guess a name; if you have not asked yet, ask once, naturally, how they would like to be addressed. ${SAVE_ADDRESS}`;
}

export function buildPersonaSystemSection(source: PersonaPromptSource) {
  const voice = `${PERSONA_VOICE}\n\n${userAddressGuidance(source.userAddress)}`;
  const parts = [source.instructions, source.soul]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) return voice;
  return [
    voice,
    "The user wrote these instructions for you. Follow them in every turn; they take precedence over the defaults above.",
    ...parts,
  ].join("\n\n");
}

export function personaSystemSections(
  source: PersonaPromptSource | null,
): Record<string, string> {
  if (!source) return {};
  return { [PERSONA_SYSTEM_SECTION]: buildPersonaSystemSection(source) };
}
