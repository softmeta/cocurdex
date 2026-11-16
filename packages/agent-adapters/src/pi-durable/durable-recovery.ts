import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId } from "@earendil-works/pi-durable";
import { getDurableHost } from "./durable-host";
import { hasDurableStorage } from "./durable-store";

export interface DurableInFlightInput {
  /** The Cocurdex message ID the input was submitted under. */
  requestId: string;
  conversationId: ConversationId;
}

/**
 * Inputs the durable harness still has queued or in a run: turns a stopped daemon left behind,
 * whether it crashed or shut down.
 */
export async function listDurableInFlightInputs(
  userDataPath: string,
): Promise<DurableInFlightInput[]> {
  if (!hasDurableStorage(userDataPath)) {
    return [];
  }
  const harness = await getDurableHost(userDataPath).harness();
  const inspection = await harness.inspect(BACKGROUND_CONTEXT);
  return inspection.submissions.flatMap((submission) =>
    submission.type === "input" &&
    (submission.status === "queued" || submission.status === "placed") &&
    submission.requestId !== undefined
      ? [
          {
            requestId: submission.requestId,
            conversationId: submission.conversationId,
          },
        ]
      : [],
  );
}

/** Stops the work of conversations whose turns no one resumes, before the harness runs it again. */
export async function abortDurableConversations(
  userDataPath: string,
  conversationIds: readonly ConversationId[],
) {
  const harness = await getDurableHost(userDataPath).harness();
  for (const id of new Set(conversationIds)) {
    const conversation = await harness.conversation(id, BACKGROUND_CONTEXT);
    await conversation?.abort(BACKGROUND_CONTEXT);
  }
}
