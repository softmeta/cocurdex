import type {
  MemoryEntry,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import {
  mergeToldItems,
  messagesAfterCursor,
  parseLegacyToldLedgerBody,
  parseToldLedgerRefs,
  removeToldItem,
  serializeToldLedgerRefs,
  TOLD_LEDGER_KEY,
  TOLD_LEDGER_MAX_ITEMS,
  type ToldLedgerRef,
  type ToldLedgerRefs,
  toldLedgerBrief,
  toldLedgerTranscript,
} from "./told-ledger";

const IDLE_MS = 90_000;
const LEGACY_READ_TIMEOUT_MS = 2_500;

export interface ToldLedgerMemory {
  providerId(): string;
  isReadyForTurns(): boolean;
  show(id: string, timeoutMs?: number): Promise<MemoryEntry | null>;
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
  idleMs?: number;
}

// The ledger is the assistant's private anti-repetition list. It lives in
// the daemon's own settings, never in the memory store, so it is not shown
// or recalled as a memory.
export class ToldLedgerStore {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private stopped = false;

  constructor(private readonly deps: ToldLedgerStoreDeps) {}

  items(personaId: string): Promise<string[]> {
    return this.serialize(
      personaId,
      async () => (await this.ref(personaId))?.items ?? [],
    );
  }

  async brief(personaId: string): Promise<string | null> {
    if (!this.deps.memory.isReadyForTurns()) return null;
    try {
      return toldLedgerBrief(await this.items(personaId));
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
      if (!ref) throw new Error("Nothing is recorded yet.");
      const remaining = removeToldItem(ref.items, item);
      if (remaining.length === ref.items.length) {
        throw new Error("That item is not in the list.");
      }
      await this.save(personaId, { items: remaining, cursors: ref.cursors });
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
      if (ref.legacy) await this.forgetLegacyRecord(personaId, ref.legacy);
      const { [personaId]: _removed, ...rest } = refs;
      await this.saveRefs(rest);
    });
  }

  // Moves every ledger an older release kept in the memory store, so the
  // record leaves the memory list without waiting for that persona's turn.
  async migrateLegacy() {
    const refs = await this.refs();
    for (const [personaId, ref] of Object.entries(refs)) {
      if (ref.legacy) await this.items(personaId);
    }
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
    const curated = await this.deps.memory.summarizeTold(
      session,
      ref?.items ?? [],
      toldLedgerTranscript(fresh),
      TOLD_LEDGER_MAX_ITEMS,
    );
    if (!curated) return false;
    await this.save(personaId, {
      items: mergeToldItems([], curated),
      cursors: { ...(ref?.cursors ?? {}), [sessionId]: last.id },
    });
    return true;
  }

  // Reads the persona's ref, moving a ledger an older release kept as a
  // memory record into settings and deleting that record.
  private async ref(personaId: string): Promise<ToldLedgerRef | null> {
    const ref = (await this.refs())[personaId];
    if (!ref?.legacy) return ref ?? null;
    const legacy = ref.legacy;
    if (legacy.provider !== this.deps.memory.providerId()) {
      const moved = { items: ref.items, cursors: ref.cursors };
      await this.save(personaId, moved);
      return moved;
    }
    let entry: MemoryEntry | null;
    try {
      entry = await this.deps.memory.show(
        legacy.memoryId,
        LEGACY_READ_TIMEOUT_MS,
      );
    } catch (error) {
      logDaemonDiagnostic("info", "memory.toldLedgerMigrationDeferred", {
        personaId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { items: ref.items, cursors: ref.cursors };
    }
    const moved = {
      items: entry
        ? mergeToldItems(ref.items, parseLegacyToldLedgerBody(entry.content))
        : ref.items,
      cursors: ref.cursors,
    };
    await this.save(personaId, moved);
    if (entry) await this.forgetLegacyRecord(personaId, legacy);
    return moved;
  }

  private async forgetLegacyRecord(
    personaId: string,
    legacy: NonNullable<ToldLedgerRef["legacy"]>,
  ) {
    if (legacy.provider !== this.deps.memory.providerId()) return;
    await this.deps.memory.forget(legacy.memoryId).catch((error: unknown) =>
      logDaemonDiagnostic("info", "memory.toldLedgerForgetFailed", {
        personaId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  private async save(personaId: string, ref: ToldLedgerRef) {
    const refs = await this.refs();
    await this.saveRefs({ ...refs, [personaId]: ref });
  }

  private async refs() {
    return parseToldLedgerRefs(await this.deps.getAppSetting(TOLD_LEDGER_KEY));
  }

  private saveRefs(refs: ToldLedgerRefs) {
    return this.deps.setAppSetting(
      TOLD_LEDGER_KEY,
      serializeToldLedgerRefs(refs),
    );
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
