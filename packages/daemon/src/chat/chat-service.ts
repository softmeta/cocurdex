import { generateChatTitle, type streamChat } from "@cocurdex/llm-chat";
import type {
  AgentRuntimeProviderConfig,
  ChatEvent,
  ChatEventPayload,
  ConversationMessageRecord,
  ConversationRecord,
  ConversationSnapshot,
  CreateConversationPayload,
  EditConversationMessagePayload,
  RetryConversationMessagePayload,
  SendConversationMessagePayload,
  UpdateConversationPayload,
} from "@cocurdex/shared";
import { type ChatDatabase, ChatStore } from "./chat-store";
import { runChatStream } from "./chat-stream";
import {
  type ActiveChatTurn,
  chatSystemPrompt,
  createActiveChatTurn,
} from "./chat-turn";
import { prepareChatTurn, type TurnRequest } from "./prepare-chat-turn";

interface ChatServiceOptions {
  getDatabase(): Promise<ChatDatabase>;
  broadcast(event: ChatEvent): void;
  stream?: typeof streamChat;
  generateTitle?: typeof generateChatTitle;
}

export class DaemonChatService {
  private readonly store: ChatStore;
  private readonly active = new Map<string, ActiveChatTurn>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly deleting = new Set<string>();
  private readonly revisions = new Map<string, number>();
  private readonly titles = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  private readonly runtimeId = crypto.randomUUID();
  private closed = false;

  constructor(private readonly options: ChatServiceOptions) {
    this.store = new ChatStore(options.getDatabase);
  }

  list() {
    return this.store.list();
  }

  async get(id: string): Promise<ConversationSnapshot | null> {
    return this.lock(id, async () => {
      const conversation = await this.store.get(id);
      if (!conversation) return null;
      const messages = await this.store.messages(id);
      const activeMessage = this.active.get(id)?.message;
      return {
        conversation,
        messages: messages.map((message) =>
          message.id === activeMessage?.id ? { ...activeMessage } : message,
        ),
        revision: this.revisions.get(id) ?? 0,
        runtimeId: this.runtimeId,
      };
    });
  }

  async create(payload: CreateConversationPayload) {
    if (this.closed) throw new Error("Chat service is shutting down");
    const now = new Date().toISOString();
    const conversation: ConversationRecord = {
      id: crypto.randomUUID(),
      title: payload.title?.trim() || "New chat",
      providerId: payload.providerId,
      modelId: payload.modelId,
      systemPrompt: payload.systemPrompt ?? null,
      presetId: payload.presetId ?? null,
      webSearchEnabled: payload.webSearchEnabled ?? false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
    };
    await this.store.save(conversation);
    this.emit({
      type: "conversation.upserted",
      conversationId: conversation.id,
      conversation,
    });
    return conversation;
  }

  update(payload: UpdateConversationPayload) {
    return this.lock(payload.conversationId, async () => {
      if (
        this.active.has(payload.conversationId) &&
        (payload.providerId !== undefined ||
          payload.modelId !== undefined ||
          payload.systemPrompt !== undefined ||
          payload.presetId !== undefined)
      )
        throw new Error(
          "Stop the current response before changing its configuration",
        );
      const current = await this.store.require(payload.conversationId);
      const { conversationId: _, ...patch } = payload;
      const defined = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      const conversation = await this.store.save({
        ...current,
        ...defined,
        updatedAt: new Date().toISOString(),
      });
      this.emit({
        type: "conversation.upserted",
        conversationId: current.id,
        conversation,
      });
      return conversation;
    });
  }

  send(
    payload: SendConversationMessagePayload,
    providerConfig: AgentRuntimeProviderConfig,
    titleProviderConfig?: AgentRuntimeProviderConfig | null,
  ) {
    return this.start(
      { kind: "send", payload },
      providerConfig,
      titleProviderConfig,
    );
  }

  async retry(
    payload: RetryConversationMessagePayload,
    providerConfig: AgentRuntimeProviderConfig,
  ) {
    await this.start({ kind: "retry", payload }, providerConfig);
    return null;
  }

  edit(
    payload: EditConversationMessagePayload,
    providerConfig: AgentRuntimeProviderConfig,
  ) {
    return this.start({ kind: "edit", payload }, providerConfig);
  }

  async stop(id: string) {
    const turn = this.active.get(id);
    if (!turn) return null;
    turn.controller.abort();
    await turn.done;
    return null;
  }

  async delete(id: string) {
    this.deleting.add(id);
    this.titles.get(id)?.controller.abort();
    try {
      await this.stop(id);
      await this.lock(id, () => this.store.delete(id));
      this.emit({ type: "conversation.deleted", conversationId: id });
      return null;
    } finally {
      this.deleting.delete(id);
    }
  }

  async archive(id: string) {
    this.deleting.add(id);
    try {
      await this.stop(id);
      return await this.lock(id, async () => {
        const current = await this.store.require(id);
        const now = new Date().toISOString();
        const conversation = await this.store.save({
          ...current,
          archivedAt: now,
          updatedAt: now,
        });
        this.emit({
          type: "conversation.upserted",
          conversationId: id,
          conversation,
        });
        return conversation;
      });
    } finally {
      this.deleting.delete(id);
    }
  }

  async shutdown() {
    this.closed = true;
    for (const title of this.titles.values()) title.controller.abort();
    for (const turn of this.active.values()) turn.controller.abort();
    await Promise.allSettled([
      ...[...this.active.values()].map((turn) => turn.done),
      ...[...this.titles.values()].map((title) => title.done),
      ...this.locks.values(),
    ]);
  }

  private async start(
    request: TurnRequest,
    providerConfig: AgentRuntimeProviderConfig,
    titleProviderConfig?: AgentRuntimeProviderConfig | null,
  ) {
    const id = request.payload.conversationId;
    if (this.closed || this.deleting.has(id))
      throw new Error("Conversation is unavailable");
    if (this.active.has(id))
      throw new Error("A response is already streaming for this conversation");
    const turn = createActiveChatTurn();
    this.active.set(id, turn);
    try {
      const prepared = await this.lock(id, () =>
        prepareChatTurn(
          this.store,
          (event) => this.emit(event),
          request,
          providerConfig,
          turn,
        ),
      );
      if (request.kind === "send") {
        this.generateTitle(
          prepared.conversation,
          prepared.user,
          titleProviderConfig ?? providerConfig,
        );
      }
      void runChatStream(
        turn,
        {
          providerConfig,
          messages: prepared.history,
          system: chatSystemPrompt(prepared.conversation.systemPrompt),
          abortSignal: turn.controller.signal,
        },
        (message, completed) =>
          this.lock(id, async () => {
            await this.store.saveMessage(message);
            this.emit({
              type: completed
                ? "conversation.message.completed"
                : "conversation.message.updated",
              conversationId: id,
              message,
            });
          }),
        this.options.stream,
      )
        .finally(() => this.release(id, turn))
        .catch((error: unknown) => {
          console.error("[Chat] Could not settle response", error);
        });
      return prepared.user;
    } catch (error) {
      this.release(id, turn);
      throw error;
    }
  }

  private generateTitle(
    conversation: ConversationRecord,
    user: ConversationMessageRecord,
    config: AgentRuntimeProviderConfig,
  ) {
    if (conversation.title !== "New chat" || this.titles.has(conversation.id))
      return;
    const text = user.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n");
    if (!text) return;
    const controller = new AbortController();
    const done = (async () => {
      const title = await (this.options.generateTitle ?? generateChatTitle)(
        config,
        text,
        controller.signal,
      );
      if (!title || controller.signal.aborted) return;
      await this.lock(conversation.id, async () => {
        const current = await this.store.get(conversation.id);
        if (
          !current ||
          current.title !== conversation.title ||
          current.archivedAt
        )
          return;
        const next = await this.store.save({
          ...current,
          title,
          updatedAt: new Date().toISOString(),
        });
        this.emit({
          type: "conversation.upserted",
          conversationId: current.id,
          conversation: next,
        });
      });
    })()
      .catch((error: unknown) => {
        console.error("[Chat] Title generation failed", error);
      })
      .finally(() => {
        this.titles.delete(conversation.id);
      });
    this.titles.set(conversation.id, { controller, done });
  }

  private release(id: string, turn: ActiveChatTurn) {
    if (this.active.get(id) === turn) this.active.delete(id);
    turn.release();
  }

  private emit(event: ChatEventPayload) {
    const revision = (this.revisions.get(event.conversationId) ?? 0) + 1;
    this.revisions.set(event.conversationId, revision);
    this.options.broadcast({ ...event, revision, runtimeId: this.runtimeId });
  }

  private lock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.locks.set(id, next);
    void next
      .finally(() => {
        if (this.locks.get(id) === next) this.locks.delete(id);
      })
      .catch(() => undefined);
    return next;
  }
}
