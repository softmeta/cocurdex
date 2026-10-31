import type { WorkspaceRecord } from "@cocurdex/shared";
import { Folder, FolderOpen, Folders } from "lucide-react";
import { FoldersOpen } from "./folders-open-icon";

export function workspaceIconFor(
  workspace: Pick<WorkspaceRecord, "rootPaths">,
  expanded = false,
) {
  if (workspace.rootPaths.length > 1) {
    return expanded ? FoldersOpen : Folders;
  }
  return expanded ? FolderOpen : Folder;
}
