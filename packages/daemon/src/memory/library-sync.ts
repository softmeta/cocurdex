import type { MemoryEntriesRepository, StoredMemoryEntry } from "@cocurdex/db";
import type { MemoryLibrarySyncSummary } from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import type { BuiltinMemoryProvider } from "./builtin-provider";
import type { MemoryProvider, MemoryTransferEntry } from "./provider";

export interface MemorySyncPlan {
  builtin: {
    add: MemoryTransferEntry[];
    /** Local id with the external entry whose newer text replaces it. */
    update: { id: string; entry: MemoryTransferEntry }[];
  };
  external: {
    add: StoredMemoryEntry[];
    update: StoredMemoryEntry[];
    /** External ids of memories deleted in the built-in store. */
    remove: string[];
  };
}

function sameTags(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const tags = new Set(left);
  return right.every((tag) => tags.has(tag));
}

function sameMemory(local: StoredMemoryEntry, external: MemoryTransferEntry) {
  return (
    local.title === external.title &&
    local.content === external.content &&
    local.importance === external.importance &&
    sameTags(local.tags, external.tags)
  );
}

/**
 * The built-in store holds the memories; an external library is kept in step
 * with it. A memory the external library lacks is written there again and
 * never removed here, so a reset or replaced library cannot empty the store.
 */
export function planMemorySync(
  local: readonly StoredMemoryEntry[],
  external: readonly MemoryTransferEntry[],
  remoteIds: ReadonlyMap<string, string>,
): MemorySyncPlan {
  const plan: MemorySyncPlan = {
    builtin: { add: [], update: [] },
    external: { add: [], update: [], remove: [] },
  };
  const linked = new Map<string, StoredMemoryEntry>();
  for (const entry of local) {
    const remoteId = remoteIds.get(entry.id);
    if (remoteId) linked.set(remoteId, entry);
  }
  const externalIds = new Set(external.map((entry) => entry.id));
  for (const entry of external) {
    const mine = linked.get(entry.id);
    if (!mine) {
      plan.builtin.add.push(entry);
      continue;
    }
    if (mine.deletedAt) {
      if ((entry.updatedAt ?? "") > mine.deletedAt) {
        plan.builtin.update.push({ id: mine.id, entry });
      } else {
        plan.external.remove.push(entry.id);
      }
      continue;
    }
    if (sameMemory(mine, entry)) continue;
    if (mine.updatedAt >= (entry.updatedAt ?? "")) {
      plan.external.update.push(mine);
    } else {
      plan.builtin.update.push({ id: mine.id, entry });
    }
  }
  for (const mine of local) {
    if (mine.deletedAt) continue;
    const remoteId = remoteIds.get(mine.id);
    if (remoteId && externalIds.has(remoteId)) continue;
    plan.external.add.push(mine);
  }
  return plan;
}

export function summarizeMemorySync(
  plan: MemorySyncPlan,
  failed = 0,
): MemoryLibrarySyncSummary {
  return {
    builtin: {
      added: plan.builtin.add.length,
      updated: plan.builtin.update.length,
    },
    external: {
      added: plan.external.add.length,
      updated: plan.external.update.length,
      removed: plan.external.remove.length,
    },
    failed,
  };
}

export function isEmptyMemorySync(plan: MemorySyncPlan) {
  return (
    plan.builtin.add.length +
      plan.builtin.update.length +
      plan.external.add.length +
      plan.external.update.length +
      plan.external.remove.length ===
    0
  );
}

function parentsFirst(entries: readonly StoredMemoryEntry[]) {
  const pending = new Map(entries.map((entry) => [entry.id, entry]));
  const ordered: StoredMemoryEntry[] = [];
  const visit = (entry: StoredMemoryEntry) => {
    if (!pending.delete(entry.id)) return;
    const parent = entry.parentId ? pending.get(entry.parentId) : undefined;
    if (parent) visit(parent);
    ordered.push(entry);
  };
  for (const entry of entries) visit(entry);
  return ordered;
}

/** What a sync needs from the external library it keeps in step. */
export type MemorySyncLibrary = Pick<
  MemoryProvider,
  "id" | "remember" | "update" | "forget"
>;

export interface MemorySyncTargets {
  builtin: BuiltinMemoryProvider;
  entries: MemoryEntriesRepository;
  transaction<T>(run: () => T): T;
  external: MemorySyncLibrary;
  now(): Date;
}

function translator(ids: ReadonlyMap<string, string>) {
  return {
    one: (id: string | null) => (id ? (ids.get(id) ?? null) : null),
    known: (list: readonly string[]) =>
      list.flatMap((id) => {
        const mapped = ids.get(id);
        return mapped ? [mapped] : [];
      }),
  };
}

function applyToBuiltin(plan: MemorySyncPlan, targets: MemorySyncTargets) {
  const { builtin, entries, external } = targets;
  const change = { actor: external.id, at: targets.now().toISOString() };
  targets.transaction(() => {
    const localIds = new Map<string, string>();
    for (const [id, remoteId] of entries.remoteIds(external.id)) {
      localIds.set(remoteId, id);
    }
    for (const entry of plan.builtin.add) localIds.set(entry.id, entry.id);
    const local = translator(localIds);
    const relations = (entry: MemoryTransferEntry) => ({
      parentId: local.one(entry.parentId),
      supersedes: local.known(entry.supersedes),
      supersededBy: local.one(entry.supersededBy),
      seeAlso: local.known(entry.seeAlso),
    });
    for (const entry of plan.builtin.add) {
      builtin.adopt({ ...entry, ...relations(entry) }, external.id);
      entries.setRemoteId(external.id, entry.id, entry.id);
    }
    for (const { id, entry } of plan.builtin.update) {
      entries.restore(id, change);
      entries.update(
        id,
        {
          title: entry.title,
          content: entry.content,
          kind: entry.kind,
          importance: entry.importance,
          tags: entry.tags,
          project: entry.project,
          ...relations(entry),
          updatedAt: entry.updatedAt ?? change.at,
        },
        change,
      );
    }
  });
}

async function createExternal(
  targets: MemorySyncTargets,
  entry: StoredMemoryEntry,
  remote: ReturnType<typeof translator>,
) {
  const input = {
    content: entry.content,
    title: entry.title,
    importance: entry.importance,
    tags: entry.tags,
    project: entry.project,
    parentId: remote.one(entry.parentId),
    supersedes: remote.known(entry.supersedes),
    seeAlso: remote.known(entry.seeAlso),
    force: true,
  };
  const typed = await targets.external.remember({ ...input, type: entry.kind });
  // A library may refuse kind names it does not define.
  if (typed.id || !entry.kind) return typed.id;
  return (await targets.external.remember(input)).id;
}

/** Applies a plan; returns how many changes the external library refused. */
export async function applyMemorySync(
  plan: MemorySyncPlan,
  targets: MemorySyncTargets,
) {
  const { entries, external } = targets;
  applyToBuiltin(plan, targets);
  let failed = 0;
  const refused = (step: string, error: unknown) => {
    failed += 1;
    logDaemonDiagnostic("warn", "memory.syncStepFailed", {
      step,
      error: error instanceof Error ? error.message : String(error),
    });
  };
  const remoteIds = entries.remoteIds(external.id);
  for (const entry of plan.external.add) remoteIds.delete(entry.id);
  const remote = translator(remoteIds);
  for (const entry of parentsFirst(plan.external.add)) {
    try {
      const id = await createExternal(targets, entry, remote);
      if (!id) throw new Error("The library returned no id");
      entries.setRemoteId(external.id, entry.id, id);
      remoteIds.set(entry.id, id);
    } catch (error) {
      refused("add", error);
    }
  }
  for (const entry of plan.external.update) {
    const remoteId = remoteIds.get(entry.id);
    if (!remoteId) continue;
    try {
      await external.update({
        id: remoteId,
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        importance: entry.importance,
      });
    } catch (error) {
      refused("update", error);
    }
  }
  for (const id of plan.external.remove) {
    try {
      await external.forget(id);
    } catch (error) {
      refused("remove", error);
    }
  }
  return failed;
}
