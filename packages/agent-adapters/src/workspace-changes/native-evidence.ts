import type {
  AgentEvent,
  NativeWorkspaceChangeEvidence,
  TurnFileChange,
} from "@cocurdex/shared";
import {
  aggregateTurnFileChanges,
  createUnifiedDiff,
  inferReviewKind,
  parseUnifiedDiff,
} from "@cocurdex/shared";

export function emitNativeWorkspaceEvidence(
  onEvent: (event: AgentEvent) => void,
  sessionId: string,
  userMessageId: string | null | undefined,
  evidence: NativeWorkspaceChangeEvidence,
) {
  onEvent({
    type: "workspace.native-evidence",
    sessionId,
    userMessageId: userMessageId ?? null,
    evidence,
  });
}

export function claudeRewindToEvidence(
  result: {
    canRewind: boolean;
    filesChanged?: string[];
    insertions?: number;
    deletions?: number;
  },
  nativeCheckpointRef: string,
): NativeWorkspaceChangeEvidence {
  const files: TurnFileChange[] = (result.filesChanged ?? []).map(
    (filePath) => ({
      path: filePath,
      operation: "modify",
      reviewKind: inferReviewKind(filePath),
    }),
  );
  return {
    source: "claude-checkpoint",
    coverage: "provider-file-tools",
    files,
    additions: result.insertions ?? null,
    deletions: result.deletions ?? null,
    nativeCheckpointRef,
  };
}

export function unifiedDiffToEvidence(
  source: NativeWorkspaceChangeEvidence["source"],
  coverage: NativeWorkspaceChangeEvidence["coverage"],
  diff: string,
  extras?: {
    providerTurnId?: string | null;
    nativeCheckpointRef?: string | null;
  },
): NativeWorkspaceChangeEvidence {
  const files = parseUnifiedDiff(diff);
  return {
    source,
    coverage,
    files,
    additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
    providerTurnId: extras?.providerTurnId ?? null,
    nativeCheckpointRef: extras?.nativeCheckpointRef ?? null,
  };
}

export function openCodeDiffsToEvidence(
  diffs: Array<{
    file: string;
    patch?: string;
    before?: string;
    after?: string;
    additions?: number;
    deletions?: number;
    status?: string;
  }>,
): NativeWorkspaceChangeEvidence {
  const files = diffs.map((diff) => {
    const operation =
      diff.status === "added"
        ? "add"
        : diff.status === "deleted"
          ? "delete"
          : "modify";
    const fromContents =
      diff.before != null && diff.after != null
        ? createUnifiedDiff(diff.file, diff.before, diff.after)
        : null;
    return {
      path: diff.file,
      operation,
      reviewKind: inferReviewKind(diff.file),
      additions: diff.additions ?? fromContents?.additions ?? null,
      deletions: diff.deletions ?? fromContents?.deletions ?? null,
      patch: diff.patch ?? fromContents?.patch ?? null,
    } satisfies TurnFileChange;
  });
  return {
    source: "opencode-session-diff",
    coverage: "provider-file-tools",
    files: aggregateTurnFileChanges(files),
  };
}

export function extractPiEditSnapshot(result: unknown): {
  file: TurnFileChange;
  beforeText: string | null;
  afterText: string | null;
} | null {
  const file = extractPiEditEvidence(result);
  if (!file) {
    return null;
  }
  if (!result || typeof result !== "object") {
    return { file, beforeText: null, afterText: null };
  }
  const record = result as Record<string, unknown>;
  const details =
    record.details && typeof record.details === "object"
      ? (record.details as Record<string, unknown>)
      : record;
  const beforeText = firstString(details.oldText, details.before);
  const afterText = firstString(details.newText, details.after);
  return { file, beforeText, afterText };
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

export function extractPiEditEvidence(result: unknown): TurnFileChange | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as Record<string, unknown>;
  const details =
    record.details && typeof record.details === "object"
      ? (record.details as Record<string, unknown>)
      : record;
  const patch = typeof details.patch === "string" ? details.patch : null;
  if (!patch) {
    return null;
  }
  const parsed = parseUnifiedDiff(patch);
  if (parsed[0]) {
    return parsed[0];
  }
  const filePath =
    (typeof record.path === "string" && record.path) ||
    (typeof record.file === "string" && record.file) ||
    null;
  if (!filePath) {
    return null;
  }
  return {
    path: filePath,
    operation: "modify",
    reviewKind: inferReviewKind(filePath),
    patch,
  };
}

export function aggregateAcpToolDiffs(
  existing: Map<string, { oldText: string; newText: string }>,
  path: string,
  oldText: string | null | undefined,
  newText: string,
) {
  const current = existing.get(path);
  existing.set(path, {
    oldText: current?.oldText ?? oldText ?? "",
    newText,
  });
}

export function acpDiffMapToEvidence(
  diffs: Map<string, { oldText: string; newText: string }>,
): NativeWorkspaceChangeEvidence {
  const files: TurnFileChange[] = [];
  for (const [filePath, content] of diffs) {
    const created = createUnifiedDiff(
      filePath,
      content.oldText,
      content.newText,
    );
    const operation =
      content.oldText.length === 0
        ? "add"
        : content.newText.length === 0
          ? "delete"
          : "modify";
    files.push({
      path: filePath,
      operation,
      reviewKind: inferReviewKind(filePath),
      additions: created.additions,
      deletions: created.deletions,
      patch: created.patch,
    });
  }
  return {
    source: "acp-tool-diff",
    coverage: "tool-call",
    files: aggregateTurnFileChanges(files),
  };
}
