import { type StreamChatParams, streamChat } from "@cocurdex/llm-chat";
import type { ConversationMessageRecord } from "@cocurdex/shared";
import type { ActiveChatTurn } from "./chat-turn";

export async function runChatStream(
  turn: ActiveChatTurn,
  params: Omit<StreamChatParams, "onDelta">,
  persist: (
    message: ConversationMessageRecord,
    completed: boolean,
  ) => Promise<void>,
  stream: typeof streamChat = streamChat,
) {
  const started = Date.now();
  let text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let persistence = Promise.resolve();
  let persistenceError: unknown;
  const flush = () => {
    if (!turn.message) return;
    const message = { ...turn.message };
    persistence = persistence.then(() => persist(message, false));
    void persistence.catch((error: unknown) => {
      persistenceError = error;
      turn.controller.abort();
    });
  };
  try {
    turn.controller.signal.throwIfAborted();
    const result = await stream({
      ...params,
      onDelta: (delta) => {
        text += delta;
        if (turn.message)
          turn.message = {
            ...turn.message,
            content: [{ type: "text", text }],
            updatedAt: new Date().toISOString(),
          };
        if (!timer)
          timer = setTimeout(() => {
            timer = undefined;
            flush();
          }, 80);
      },
    });
    if (turn.message)
      turn.message = {
        ...turn.message,
        content: [{ type: "text", text: result.text || text }],
        status: turn.controller.signal.aborted ? "cancelled" : result.status,
        error: result.error,
        usage: { ...result.usage, durationMs: Date.now() - started },
        updatedAt: new Date().toISOString(),
      };
  } catch (error) {
    const cancelled = turn.controller.signal.aborted;
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (turn.message)
      turn.message = {
        ...turn.message,
        content: [{ type: "text", text }],
        status: cancelled ? "cancelled" : "errored",
        error: cancelled ? null : errorMessage,
        usage: { durationMs: Date.now() - started },
        updatedAt: new Date().toISOString(),
      };
  } finally {
    clearTimeout(timer);
    await persistence.catch(() => undefined);
    if (turn.message && persistenceError) {
      const error = persistenceError;
      turn.message = {
        ...turn.message,
        status: "errored",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (turn.message) await persist(turn.message, true);
  }
}
