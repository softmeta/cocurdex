import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillFileChange } from "@cocurdex/shared";
import { formatPatch, structuredPatch } from "diff";
import {
  classifySkillFile,
  isExecutableMode,
  listSkillFiles,
  type SkillFileRecord,
} from "./skill-files";

const MAX_PATCH_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_PATCH_BYTES = 1024 * 1024;

function isBinary(content: Buffer) {
  return content.subarray(0, 8000).includes(0);
}

async function readOptional(dir: string | null, relativePath: string) {
  if (!dir) {
    return null;
  }
  return readFile(path.join(dir, ...relativePath.split("/"))).catch(() => null);
}

function textPatch(
  relativePath: string,
  before: Buffer | null,
  after: Buffer | null,
) {
  const structured = structuredPatch(
    before ? `a/${relativePath}` : "/dev/null",
    after ? `b/${relativePath}` : "/dev/null",
    before?.toString("utf8") ?? "",
    after?.toString("utf8") ?? "",
  );
  let additions = 0;
  let deletions = 0;
  for (const hunk of structured.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        additions += 1;
      } else if (line.startsWith("-")) {
        deletions += 1;
      }
    }
  }
  return { additions, deletions, patch: formatPatch(structured) };
}

function changeStatus(before: Buffer | null, after: Buffer | null) {
  if (!before) {
    return "added" as const;
  }
  return after ? ("modified" as const) : ("removed" as const);
}

export async function diffSkillDirectories(
  currentDir: string | null,
  nextDir: string,
  platform: NodeJS.Platform = process.platform,
): Promise<SkillFileChange[]> {
  const current = currentDir ? await listSkillFiles(currentDir) : [];
  const next = await listSkillFiles(nextDir);
  const records = new Map<string, SkillFileRecord>();
  for (const record of [...current, ...next]) {
    records.set(record.path, record);
  }
  const changes: SkillFileChange[] = [];
  let patchBudget = MAX_TOTAL_PATCH_BYTES;
  for (const relativePath of [...records.keys()].sort()) {
    const before = await readOptional(currentDir, relativePath);
    const after = await readOptional(nextDir, relativePath);
    if (before && after && before.equals(after)) {
      continue;
    }
    const record = records.get(relativePath) as SkillFileRecord;
    const kind = classifySkillFile(
      relativePath,
      platform !== "win32" && isExecutableMode(record.mode),
    );
    const status = changeStatus(before, after);
    const tooLarge =
      (before?.length ?? 0) > MAX_PATCH_FILE_BYTES ||
      (after?.length ?? 0) > MAX_PATCH_FILE_BYTES;
    const binary = (before && isBinary(before)) || (after && isBinary(after));
    if (tooLarge || binary || patchBudget <= 0) {
      changes.push({
        path: relativePath,
        status,
        kind,
        additions: 0,
        deletions: 0,
        patch: null,
      });
      continue;
    }
    const diff = textPatch(relativePath, before, after);
    patchBudget -= diff.patch.length;
    changes.push({ path: relativePath, status, kind, ...diff });
  }
  return changes;
}
