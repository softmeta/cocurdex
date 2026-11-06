import {
  type MemoryPartition,
  type MemoryRememberInput,
  type MemoryRememberResult,
  memoryPartitionProject,
} from "@cocurdex/shared";
import type { MemoryProvider } from "./provider";

export const PARTITION_UNAVAILABLE =
  "Memory partition support is unavailable; unscoped access was refused.";

export async function requirePartitions(provider: MemoryProvider) {
  const capabilities = await provider.capabilities();
  if (!capabilities.partitions) throw new Error(PARTITION_UNAVAILABLE);
}

export async function readPartitionEntry(
  provider: MemoryProvider,
  id: string,
  partitions: MemoryPartition[],
  timeoutMs?: number,
) {
  await requirePartitions(provider);
  const result = await provider.show(id, timeoutMs);
  if (result.error) throw new Error(result.error);
  if (!result.entry) return null;
  const projects = new Set(partitions.map(memoryPartitionProject));
  if (!result.entry.project || !projects.has(result.entry.project)) {
    throw new Error("Memory is outside the permitted partition.");
  }
  return result.entry;
}

export async function validatePartitionRelations(
  provider: MemoryProvider,
  input: MemoryRememberInput,
  partition: MemoryPartition,
) {
  await requirePartitions(provider);
  const ids = new Set([
    ...(input.parentId ? [input.parentId] : []),
    ...(input.mergeIds ?? []),
    ...(input.supersedes ?? []),
    ...(input.seeAlso ?? []),
  ]);
  const canonical = new Map<string, string>();
  for (const id of ids) {
    const entry = await readPartitionEntry(provider, id, [partition]);
    if (!entry)
      throw new Error(
        "Memory relation target was not found in the permitted partition.",
      );
    canonical.set(id, entry.id);
  }
  const canonicalIds = (values: string[] | undefined) =>
    values?.map((id) => canonical.get(id) ?? id);
  return {
    ...input,
    parentId: input.parentId ? canonical.get(input.parentId) : input.parentId,
    mergeIds: canonicalIds(input.mergeIds),
    supersedes: canonicalIds(input.supersedes),
    seeAlso: canonicalIds(input.seeAlso),
  };
}

export async function scopeRememberCandidates(
  provider: MemoryProvider,
  result: MemoryRememberResult,
  partition: MemoryPartition,
): Promise<MemoryRememberResult> {
  if (result.action !== "candidates") return result;
  if (result.candidates.length === 0)
    return {
      ...result,
      message:
        "Nothing was saved. The memory provider requires a write decision but returned no readable candidate IDs.",
    };
  const candidates = [];
  const project = memoryPartitionProject(partition);
  for (const candidate of result.candidates) {
    const shown = await provider.show(candidate.id);
    if (shown.error) throw new Error(shown.error);
    if (shown.entry?.project === project) {
      candidates.push({
        ...candidate,
        id: shown.entry.id,
        title: shown.entry.title,
      });
    }
  }
  return {
    ...result,
    candidates,
    message:
      candidates.length > 0
        ? "Nothing was saved. Read these candidates and choose a merge or a causal parent within this partition."
        : "Nothing was saved. The memory provider reported a conflict outside this partition; automatic merging was refused.",
  };
}
