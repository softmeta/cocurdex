import type { DaemonState } from "../state";
import type { SessionRuntimeMessage } from "./execution-types";

type FollowUpStore = Pick<
  DaemonState,
  | "getSession"
  | "listQueuedMessages"
  | "getMessageById"
  | "updateQueuedUserMessage"
  | "deleteQueuedUserMessage"
>;

interface QueuedFollowUp {
  payload: SessionRuntimeMessage & { messageId: string };
}

export class SessionFollowUpQueue {
  private readonly inputs = new Map<string, QueuedFollowUp[]>();

  constructor(private readonly state: FollowUpStore) {}

  get size() {
    let count = 0;
    for (const inputs of this.inputs.values()) count += inputs.length;
    return count;
  }

  has(sessionId: string) {
    return this.inputs.has(sessionId);
  }

  forget(sessionId: string) {
    this.inputs.delete(sessionId);
  }

  clear() {
    this.inputs.clear();
  }

  async load(sessionId: string) {
    return Boolean(await this.loadInputs(sessionId));
  }

  append(
    payload: QueuedFollowUp["payload"],
    {
      onlyIfLoaded,
      chronological,
    }: { onlyIfLoaded?: boolean; chronological?: boolean } = {},
  ) {
    const sessionId = payload.session.id;
    const loaded = this.inputs.get(sessionId);
    if (!loaded && onlyIfLoaded) return;
    const inputs = loaded ?? [];
    inputs.push({ payload: { ...payload, delivery: "start-new-run" } });
    if (chronological) {
      inputs.sort((left, right) =>
        (left.payload.createdAt ?? "").localeCompare(
          right.payload.createdAt ?? "",
        ),
      );
    }
    this.inputs.set(sessionId, inputs);
  }

  take(sessionId: string) {
    const inputs = this.inputs.get(sessionId);
    const next = inputs?.shift();
    if (!inputs?.length) this.forget(sessionId);
    return next;
  }

  async requireInput(sessionId: string, messageId: string) {
    const inputs = await this.loadInputs(sessionId);
    const item = inputs?.find((entry) => entry.payload.messageId === messageId);
    if (!item) throw new Error(`Queued message ${messageId} was not found`);
    const message = await this.state.getMessageById(messageId);
    if (
      !message ||
      message.sessionId !== sessionId ||
      message.role !== "user"
    ) {
      throw new Error(`Queued message ${messageId} was not found`);
    }
    return { item, message };
  }

  promote(sessionId: string, messageId: string) {
    const inputs = this.inputs.get(sessionId);
    const index =
      inputs?.findIndex((entry) => entry.payload.messageId === messageId) ?? -1;
    if (!inputs || index < 0)
      throw new Error(`Queued message ${messageId} was not found`);
    const [item] = inputs.splice(index, 1);
    inputs.unshift(item);
  }

  remove(sessionId: string, messageId: string) {
    const inputs = this.inputs.get(sessionId);
    const index =
      inputs?.findIndex((entry) => entry.payload.messageId === messageId) ?? -1;
    if (!inputs || index < 0) return;
    inputs.splice(index, 1);
    if (inputs.length === 0) this.forget(sessionId);
  }

  private async loadInputs(sessionId: string) {
    const loaded = this.inputs.get(sessionId);
    if (loaded) return loaded;

    const [session, inputs] = await Promise.all([
      this.state.getSession(sessionId),
      this.state.listQueuedMessages(sessionId),
    ]);
    if (!session || session.archivedAt || inputs.length === 0) return;

    const queued = inputs.map(
      ({ message, workspaceRootPath, thinkingLevel }): QueuedFollowUp => ({
        payload: {
          session,
          workspaceRootPath,
          messageId: message.id,
          createdAt: message.createdAt,
          content: message.content,
          attachments: message.attachments,
          thinkingLevel,
          delivery: "start-new-run",
        },
      }),
    );
    this.inputs.set(sessionId, queued);
    return queued;
  }

  async update(sessionId: string, messageId: string, content: string) {
    const trimmedContent = content.trim();
    const queued = await this.loadInputs(sessionId);
    const index = queued?.findIndex(
      (item) => item.payload.messageId === messageId,
    );
    if (!queued || index == null || index < 0) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    const message = await this.state.getMessageById(messageId);
    if (
      !message ||
      message.sessionId !== sessionId ||
      message.role !== "user"
    ) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    if (!trimmedContent && message.attachments.length === 0) {
      throw new Error("Queued message cannot be empty");
    }

    const updatedMessage = { ...message, content: trimmedContent };
    await this.state.updateQueuedUserMessage(updatedMessage);
    queued[index] = {
      ...queued[index],
      payload: { ...queued[index].payload, content: trimmedContent },
    };
    return updatedMessage;
  }

  async delete(sessionId: string, messageId: string) {
    const queued = await this.loadInputs(sessionId);
    if (!queued) {
      throw new Error(`Queued message ${messageId} was not found`);
    }
    const nextQueued = queued.filter(
      (item) => item.payload.messageId !== messageId,
    );
    if (nextQueued.length === queued.length) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    await this.state.deleteQueuedUserMessage(messageId);
    if (nextQueued.length === 0) {
      this.inputs.delete(sessionId);
    } else {
      this.inputs.set(sessionId, nextQueued);
    }
  }
}
