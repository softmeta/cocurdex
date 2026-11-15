import type { MessageRecord } from "@cocurdex/shared";

export const TOLD_LEDGER_KEY = "memory.toldLedgers";
export const TOLD_LEDGER_MAX_ITEMS = 30;
export const TOLD_ITEM_MAX_LENGTH = 280;
const TRANSCRIPT_MAX_CHARS = 12_000;
const TRANSCRIPT_MESSAGE_MAX_CHARS = 2_000;

const ITEM_PREFIX = "- ";

export interface ToldLedgerRef {
  provider: string;
  memoryId: string | null;
  // Last message folded into the ledger, per assistant thread.
  cursors: Record<string, string>;
}

export type ToldLedgerRefs = Record<string, ToldLedgerRef>;

function normalizeItem(item: string) {
  const text = item.replace(/\s+/g, " ").trim();
  return [...text].length > TOLD_ITEM_MAX_LENGTH
    ? `${[...text].slice(0, TOLD_ITEM_MAX_LENGTH - 1).join("")}…`
    : text;
}

function itemKey(item: string) {
  return item.toLocaleLowerCase();
}

export function mergeToldItems(
  existing: readonly string[],
  added: readonly string[],
  max = TOLD_LEDGER_MAX_ITEMS,
) {
  const fresh = added.map(normalizeItem).filter((item) => item !== "");
  const freshKeys = new Set(fresh.map(itemKey));
  const kept = existing.filter((item) => !freshKeys.has(itemKey(item)));
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const item of [...kept, ...fresh]) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(-max);
}

export function removeToldItem(existing: readonly string[], item: string) {
  const key = itemKey(normalizeItem(item));
  return existing.filter((entry) => itemKey(entry) !== key);
}

export function toldLedgerTitle(personaName: string) {
  return `What ${personaName} already told the user`;
}

export function renderToldLedgerBody(items: readonly string[]) {
  return [
    "Conclusions, facts and answers this assistant already gave the user, oldest first. Cocurdex maintains this list; edit it from the assistant overview.",
    ...items.map((item) => `${ITEM_PREFIX}${item}`),
  ].join("\n");
}

export function parseToldLedgerBody(body: string) {
  return body
    .split(/\r?\n/)
    .filter((line) => line.startsWith(ITEM_PREFIX))
    .map((line) => normalizeItem(line.slice(ITEM_PREFIX.length)))
    .filter((item) => item !== "");
}

export function toldLedgerBrief(items: readonly string[]) {
  if (items.length === 0) return null;
  return [
    "<told-to-user>",
    "You already told the user these things in earlier turns. Do not repeat them unless the user asks again or something changed; build on them instead.",
    ...items.map((item) => `${ITEM_PREFIX}${item}`),
    "</told-to-user>",
  ].join("\n");
}

function parseCursors(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function messagesAfterCursor(
  messages: readonly MessageRecord[],
  cursor: string | undefined,
) {
  const index = cursor
    ? messages.findIndex((message) => message.id === cursor)
    : -1;
  return messages.slice(index + 1);
}

function clip(text: string, max: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

export function toldLedgerTranscript(messages: readonly MessageRecord[]) {
  const lines: string[] = [];
  let size = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = clip(message.content, TRANSCRIPT_MESSAGE_MAX_CHARS);
    if (!text) continue;
    const line = `${message.role === "user" ? "User" : "Assistant"}: ${text}`;
    if (size + line.length > TRANSCRIPT_MAX_CHARS && lines.length > 0) break;
    lines.unshift(line);
    size += line.length + 1;
  }
  return lines.join("\n");
}

export function parseToldLedgerRefs(raw: string | null): ToldLedgerRefs {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const refs: ToldLedgerRefs = {};
  for (const [personaId, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object") continue;
    const { provider, memoryId, cursors } = value as Partial<ToldLedgerRef>;
    if (typeof provider !== "string") continue;
    refs[personaId] = {
      provider,
      memoryId: typeof memoryId === "string" ? memoryId : null,
      cursors: parseCursors(cursors),
    };
  }
  return refs;
}
