import { resolveSessionWorkingPath } from "@cocurdex/shared";
import { atom } from "jotai";
import { activeSessionIdAtom, sessionsAtom } from "../sessions/session-store";
import {
  activeWorkspaceIdAtom,
  draftWorktreePathAtom,
  workspacesAtom,
} from "./workspace-store";

export const activeWorkingPathAtom = atom((get) => {
  const workspaceId = get(activeWorkspaceIdAtom);
  const workspace = get(workspacesAtom).find(
    (candidate) => candidate.id === workspaceId,
  );
  if (!workspace) {
    return null;
  }

  const sessionId = get(activeSessionIdAtom);
  const session = sessionId
    ? get(sessionsAtom).find((candidate) => candidate.id === sessionId)
    : undefined;
  if (session) {
    return resolveSessionWorkingPath({
      workspaceRootPath: workspace.rootPath,
      worktreePath: session.worktreePath,
    });
  }

  return resolveSessionWorkingPath({
    workspaceRootPath: workspace.rootPath,
    worktreePath: get(draftWorktreePathAtom),
  });
});
