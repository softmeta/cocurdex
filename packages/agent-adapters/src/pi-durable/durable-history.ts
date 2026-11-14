import { existsSync } from "node:fs";
import path from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Message } from "@earendil-works/pi-ai";
import { convertToLlm, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  AssistantEntry,
  type Conversation,
  ToolResultEntry,
  UserEntry,
} from "@earendil-works/pi-durable";

const IMPORT_BATCH = 200;

function entryKind(message: Message) {
  if (message.role === "assistant") return AssistantEntry.kind;
  if (message.role === "toolResult") return ToolResultEntry.kind;
  return UserEntry.kind;
}

/** The model context of a pi coding agent session file, as pi would send it next. */
export function readPiSessionContext(
  sessionFile: string,
  agentDir: string,
  cwd: string,
): Message[] {
  if (!existsSync(sessionFile)) return [];
  const manager = SessionManager.open(
    sessionFile,
    path.join(agentDir, "sessions"),
    cwd,
  );
  return convertToLlm(manager.buildSessionContext().messages);
}

/**
 * Carries a pi coding agent session's context into a new durable conversation, so a session that
 * ran on pi before continues with what its model saw. The transcript rows stay in Cocurdex's own
 * messages; these entries only feed the model.
 */
export async function importPiContext(
  conversation: Conversation,
  messages: readonly Message[],
) {
  for (let start = 0; start < messages.length; start += IMPORT_BATCH) {
    const batch = messages.slice(start, start + IMPORT_BATCH);
    await conversation.commit(async (tx) => {
      for (const message of batch) {
        const kind = entryKind(message);
        if (kind === ToolResultEntry.kind) {
          await tx.appendEntry(ToolResultEntry, conversation.id, {
            model: [message],
            data: { diagnostics: [] },
          });
        } else {
          await tx.appendEntry(conversation.id, {
            kind,
            model: [message],
          });
        }
      }
    }, BACKGROUND_CONTEXT);
  }
}
