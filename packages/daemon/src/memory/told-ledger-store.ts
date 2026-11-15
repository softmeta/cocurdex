import type {
  MemoryEntry,
  MemoryPartition,
  MemoryRememberInput,
  MemoryRememberResult,
  MemoryUpdateInput,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import {
  mergeToldItems,
  messagesAfterCursor,
  parseToldLedgerBody,
  parseToldLedgerRefs,
  removeToldItem,
  renderToldLedgerBody,
  TOLD_LEDGER_KEY,
  TOLD_LEDGER_MAX_ITEMS,
  type ToldLedgerRef,
  type ToldLedgerRefs,
  toldLedgerBrief,
  toldLedgerTitle,
  toldLedgerTranscript,
} from "./told-ledger";

const IDLE_MS = 90_000;
const BRIEF_TIMEOUT_MS = 2_500;

export interface ToldLedgerMemory {
  providerId(): string;
  isReadyForTurns(): boolean;
  show(id: string, timeoutMs?: number): Promise<MemoryEntry | null>;
  rememberIn(
    input: MemoryRememberInput,
    partition: MemoryPartition,
  ): Promise<MemoryRememberResult>;
  update(input: MemoryUpdateInput): Promise<MemoryEntry | null>;
  forget(id: string): Promise<void>;
  summarizeTold(
    session: SessionRecord,
    items: readonly string[],
    transcript: string,
    maxItems: number,
  ): Promise<string[] | null>;
}

export interface ToldLedgerStoreDeps {
  memory: ToldLedgerMemory;
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, value: string): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listMessages(sessionId: string): Promise<MessageRecord[]>;
  personaName(personaId: string): Promise<string | null>;
  announceChanged(personaId: string): void;
  idleMs?: number;
}

function personaPartition(personaId: string): MemoryPartition {
  return { kind: "agent", agentId: personaId };
}

export class ToldLedgerStore {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private stopped = false;

  constructor(private readonly deps: ToldLedgerStoreDeps) {}

  async items(personaId: string, timeoutMs?: number): Promise<string[]> {
    const ref = await this.ref(personaId);
    const entry = await this.entry(ref, timeoutMs);
    return entry ? parseToldLedgerBody(entry.content) : [];
  }

  async brief(personaId: string): Promise<string | null> {
    if (!this.deps.memory.isReadyForTurns()) return null;
    try {
      return toldLedgerBrief(await this.items(personaId, BRIEF_TIMEOUT_MS));
    } catch (error) {
      logDaemonDiagnostic("info", "memory.toldLedgerUnavailable", {
        personaId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // Called when an assistant turn settles. The ledger is folded once the
  // thread has been quiet for a while, not on every turn.
  scheduleCuration(personaId: string, sessionId: string) {
    if (this.stopped) return;
    const key = `${personaId}\u0000${sessionId}`;
    const previous = this.timers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.curate(personaId, sessionId).catch((error: unknown) =>
        logDaemonDiagnostic("warn", "memory.toldLedgerCurationFailed", {
          personaId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }, this.deps.idleMs ?? IDLE_MS);
    timer.unref?.();
    this.timers.set(key, timer);
  }

  curate(personaId: string, sessionId: string): Promise<boolean> {
    return this.serialize(personaId, () =>
      this.curateNow(personaId, sessionId),
    );
  }

  forgetItem(personaId: string, item: string): Promise<string[]> {
    return this.serialize(personaId, async () => {
      const ref = await this.ref(personaId);
      const entry = await this.entry(ref);
      if (!ref || !entry) throw new Error("Nothing is recorded yet.");
      const items = parseToldLedgerBody(entry.content);
      const remaining = removeToldItem(items, item);
      if (remaining.length === items.length) {
        throw new Error("That item is not in the list.");
      }
      await this.write(personaId, ref, remaining, ref.cursors);
      return remaining;
    });
  }

  clear(personaId: string): Promise<void> {
    for (const [key, timer] of this.timers) {
      if (!key.startsWith(`${personaId}\u0000`)) continue;
      clearTimeout(timer);
      this.timers.delete(key);
    }
    return this.serialize(personaId, async () => {
      const refs = await this.refs();
      const ref = refs[personaId];
      if (!ref) return;
      if (ref.memoryId && ref.provider === this.deps.memory.providerId()) {
        await this.deps.memory.forget(ref.memoryId).catch((error: unknown) =>
          logDaemonDiagnostic("info", "memory.toldLedgerForgetFailed", {
            personaId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      const { [personaId]: _removed, ...rest } = refs;
      await this.saveRefs(rest);
    });
  }

  stop() {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async curateNow(personaId: string, sessionId: string) {
    if (!this.deps.memory.isReadyForTurns()) return false;
    const session = await this.deps.getSession(sessionId);
    if (!session) return false;
    const ref = await this.ref(personaId);
    const messages = await this.deps.listMessages(sessionId);
    const fresh = messagesAfterCursor(messages, ref?.cursors[sessionId]);
    const last = fresh.at(-1);
    if (!last || !fresh.some((message) => message.role === "assistant")) {
      return false;
    }
    const entry = await this.entry(ref);
    const items = entry ? parseToldLedgerBody(entry.content) : [];
    const curated = await this.deps.memory.summarizeTold(
      session,
      items,
      toldLedgerTranscript(fresh),
      TOLD_LEDGER_MAX_ITEMS,
    );
    if (!curated) return false;
    const next = mergeToldItems([], curated);
    const cursors = { ...(ref?.cursors ?? {}), [sessionId]: last.id };
    await this.write(personaId, entry ? ref : null, next, cursors);
    return true;
  }

  private async write(
    personaId: string,
    ref: ToldLedgerRef | null,
    items: readonly string[],
    cursors: Record<string, string>,
  ) {
    const name = (await this.deps.personaName(personaId)) ?? "The assistant";
    const title = toldLedgerTitle(name);
    const content = renderToldLedgerBody(items);
    let memoryId = ref?.memoryId ?? null;
    if (memoryId) {
      await this.deps.memory.update({ id: memoryId, title, content });
    } else {
      const result = await this.deps.memory.rememberIn(
        { title, content, importance: "important", force: true },
        personaPartition(personaId),
      );
      if (!result.id) {
        throw new Error(result.message ?? `Memory write ${result.action}`);
      }
      memoryId = result.id;
    }
    const refs = await this.refs();
    await this.saveRefs({
      ...refs,
      [personaId]: {
        provider: this.deps.memory.providerId(),
        memoryId,
        cursors,
      },
    });
    this.deps.announceChanged(personaId);
  }

  private async entry(ref: ToldLedgerRef | null, timeoutMs?: number) {
    if (!ref?.memoryId || ref.provider !== this.deps.memory.providerId()) {
      return null;
    }
    return this.deps.memory.show(ref.memoryId, timeoutMs);
  }

  private async ref(personaId: string) {
    return (await this.refs())[personaId] ?? null;
  }

  private async refs() {
    return parseToldLedgerRefs(await this.deps.getAppSetting(TOLD_LEDGER_KEY));
  }

  private saveRefs(refs: ToldLedgerRefs) {
    return this.deps.setAppSetting(TOLD_LEDGER_KEY, JSON.stringify(refs));
  }

  private serialize<T>(personaId: string, work: () => Promise<T>) {
    const previous = this.queues.get(personaId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    const settled: Promise<void> = next.then(
      () => this.release(personaId, settled),
      () => this.release(personaId, settled),
    );
    this.queues.set(personaId, settled);
    return next;
  }

  private release(personaId: string, settled: Promise<void>) {
    if (this.queues.get(personaId) === settled) this.queues.delete(personaId);
  }
}
