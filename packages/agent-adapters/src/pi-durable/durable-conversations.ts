import { randomUUID } from "node:crypto";
import type { ForkProviderSessionPayload } from "@cocurdex/agent-core";
import type { AgentProviderSessionRecord } from "@cocurdex/shared";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
  type ConversationId,
  type EntryId,
  type EntryRecord,
  type Harness,
  UserEntry,
} from "@earendil-works/pi-durable";
import { serializeProviderSessionState } from "../shared";
import { CocurdexBindingDoc } from "./durable-docs";
import { getDurableHost } from "./durable-host";

export const PI_DURABLE_PROVIDER_VERSION = "pi-durable";
const ENTRY_PAGE = 200;

export interface DurableConversationRef {
  conversationId: ConversationId;
  key: string;
}

export function readDurableConversation(
  providerStateJson: string,
): DurableConversationRef | null {
  try {
    const state = JSON.parse(providerStateJson) as {
      adapter?: unknown;
      conversationId?: unknown;
      key?: unknown;
    };
    return state.adapter === "pi-durable" &&
      typeof state.conversationId === "number" &&
      typeof state.key === "string"
      ? {
          conversationId: state.conversationId as ConversationId,
          key: state.key,
        }
      : null;
  } catch {
    return null;
  }
}

export function providerSessionRecord(
  sessionId: string,
  ref: DurableConversationRef,
): AgentProviderSessionRecord {
  return {
    sessionId,
    providerSessionId: String(ref.conversationId),
    providerStateJson: serializeProviderSessionState({
      adapter: "pi-durable",
      conversationId: ref.conversationId,
      key: ref.key,
    }),
    providerVersion: PI_DURABLE_PROVIDER_VERSION,
    resumable: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function bindConversation(conversation: Conversation) {
  const key = randomUUID();
  await conversation.commit(async (tx) => {
    const binding = await tx.doc(CocurdexBindingDoc, conversation.id);
    binding.key = key;
  }, BACKGROUND_CONTEXT);
  return { conversationId: conversation.id, key };
}

async function boundKey(conversation: Conversation) {
  return conversation.commit(
    async (tx) => (await tx.doc(CocurdexBindingDoc, conversation.id)).key,
    BACKGROUND_CONTEXT,
  );
}

/** The conversation a provider state names, when it is still the one that state was bound to. */
export async function openBoundConversation(
  harness: Harness,
  ref: DurableConversationRef,
) {
  const conversation = await harness.conversation(
    ref.conversationId,
    BACKGROUND_CONTEXT,
  );
  if (!conversation) return undefined;
  return (await boundKey(conversation)) === ref.key ? conversation : undefined;
}

export async function readEntriesFrom(
  conversation: Conversation,
  minEntryId: EntryId,
  apply: (entries: readonly EntryRecord[]) => void,
) {
  let cursor: Parameters<Conversation["entries"]>[2];
  do {
    const page = await conversation.entries(
      { minEntryId, order: "ascending" },
      ENTRY_PAGE,
      cursor,
      BACKGROUND_CONTEXT,
    );
    apply(page.items);
    cursor = page.next;
  } while (cursor !== undefined);
}

export async function newestEntryId(conversation: Conversation) {
  const page = await conversation.entries({}, 1, undefined, BACKGROUND_CONTEXT);
  return page.items[0]?.id;
}

/** Forks a durable conversation before its Nth user input, or at its end. */
export async function forkDurableProviderSession(
  payload: ForkProviderSessionPayload,
  ref: DurableConversationRef,
): Promise<AgentProviderSessionRecord | null> {
  const host = getDurableHost(payload.userDataPath);
  const harness = await host.harness();
  const source = await openBoundConversation(harness, ref);
  if (!source) throw new Error("Durable conversation to fork was not found");
  if (payload.userTurnCount !== null && payload.userTurnCount <= 0) {
    return null;
  }
  const entries: EntryRecord[] = [];
  await readEntriesFrom(source, 0 as EntryId, (page) => entries.push(...page));
  let at = entries.at(-1);
  if (payload.userTurnCount !== null) {
    const users = entries.filter((entry) => UserEntry.is(entry));
    const next = users[payload.userTurnCount];
    if (next) at = entries[entries.indexOf(next) - 1];
  }
  if (!at) return null;
  const fork = await source.fork(
    at.id,
    { ownership: { kind: "ownerless" } },
    BACKGROUND_CONTEXT,
  );
  return providerSessionRecord(
    payload.targetSessionId,
    await bindConversation(fork),
  );
}
