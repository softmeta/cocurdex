import {
  type AgentToolCallerContext,
  PERSONAL_AGENT_USER_ADDRESS_MAX_LENGTH,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export interface AssistantToolDependencies {
  personaOf(sessionId: string): Promise<string | null>;
  setUserAddress(
    personaId: string,
    userAddress: string | null,
  ): Promise<string | null>;
}

const isPersonal = (caller: AgentToolCallerContext) =>
  caller.sessionKind === "personal";

export function registerAssistantTools(
  registry: AgentToolRegistry,
  deps: AssistantToolDependencies,
) {
  registry.register({
    descriptor: {
      group: "assistant",
      name: "set_user_address",
      deferred: true,
      description:
        "Save how you address the user, exactly as they asked to be called (a name, nickname, or form of address). It applies to every later turn, including routine runs and reports, and only to you; other assistants keep their own. Pass an empty string to forget it.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: `What to call the user, at most ${PERSONAL_AGENT_USER_ADDRESS_MAX_LENGTH} characters`,
          },
        },
        required: ["address"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) => {
      const personaId = await deps.personaOf(caller.sessionId);
      if (!personaId) {
        throw new Error("This session does not belong to an assistant.");
      }
      const userAddress = await deps.setUserAddress(
        personaId,
        String(input.address),
      );
      return { userAddress };
    },
  });
}
