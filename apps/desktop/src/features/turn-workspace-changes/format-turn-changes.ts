import type { TurnChangeSet, TurnFileChange } from "@cocurdex/shared";

export function hasMeaningfulLineStats(changeSet: TurnChangeSet) {
  if ((changeSet.additions ?? 0) > 0 || (changeSet.deletions ?? 0) > 0) {
    return true;
  }
  return changeSet.files.some(
    (file) =>
      file.reviewKind === "text" &&
      ((file.additions ?? 0) > 0 || (file.deletions ?? 0) > 0),
  );
}

export function fileOperationLabelKey(
  operation: TurnFileChange["operation"],
): "added" | "modified" | "deleted" | "renamed" {
  switch (operation) {
    case "add":
      return "added";
    case "delete":
      return "deleted";
    case "rename":
      return "renamed";
    default:
      return "modified";
  }
}

/** Git 风格单字母，和 Git tab 的增删改配色一致。 */
export function fileOperationMarker(operation: TurnFileChange["operation"]) {
  if (operation === "add") {
    return { className: "text-editor-git-added", letter: "A" };
  }
  if (operation === "delete") {
    return { className: "text-editor-git-deleted", letter: "D" };
  }
  if (operation === "rename") {
    return { className: "text-editor-git-modified", letter: "R" };
  }
  return { className: "text-editor-git-modified", letter: "M" };
}

export function splitWorkspaceRelativePath(path: string) {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash < 0) {
    return { dir: "", name: path };
  }
  return {
    dir: path.slice(0, lastSlash + 1),
    name: path.slice(lastSlash + 1),
  };
}

export function compactFilePreview(files: TurnFileChange[], limit = 4) {
  return files.slice(0, limit);
}

export function isTurnChangeSetUndoable(changeSet: TurnChangeSet) {
  if (typeof changeSet.undoable === "boolean") {
    return changeSet.undoable;
  }
  return (
    (changeSet.status === "ready" || changeSet.status === "partial") &&
    changeSet.files.length > 0 &&
    Boolean(changeSet.hostBeforeCheckpointRef) &&
    changeSet.files.every((file) => file.restorable !== false)
  );
}
