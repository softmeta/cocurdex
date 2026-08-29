import type { TurnFileChange, UndoFileResult } from "@cocurdex/shared";

export function preflightTurnUndo(
  files: TurnFileChange[],
  currentHashes: Map<string, string | null>,
): UndoFileResult[] {
  return files.map((file) => {
    if (file.restorable === false) {
      return {
        path: file.path,
        status: "failed",
        reason: "Checkpoint bytes are unavailable",
      };
    }
    const currentHash = currentHashes.get(file.path) ?? null;
    const expectedAfterHash = file.afterHash ?? null;
    if (file.operation === "delete") {
      if (currentHash != null) {
        return {
          path: file.path,
          status: "conflict",
          reason: "File exists after a turn that deleted it",
        };
      }
      return { path: file.path, status: "restored" };
    }

    if (currentHash !== expectedAfterHash) {
      return {
        path: file.path,
        status: "conflict",
        reason: "File changed after this turn",
      };
    }
    return { path: file.path, status: "restored" };
  });
}

export function undoHasConflicts(results: UndoFileResult[]) {
  return results.some((result) => result.status === "conflict");
}

export function undoHasBlockingFailures(results: UndoFileResult[]) {
  return results.some(
    (result) => result.status === "conflict" || result.status === "failed",
  );
}
