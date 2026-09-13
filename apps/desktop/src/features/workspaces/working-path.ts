import {
  primaryWorkspaceRootPath,
  resolveSessionWorkingPath,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { activeSessionIdAtom, sessionsAtom } from "../sessions/session-store";
import {
  activeWorkspaceIdAtom,
  draftWorktreePathAtom,
  workspacesAtom,
} from "./workspace-store";

export const activeWorkingPathAtom = atom((get) => {
  const sessionId = get(activeSessionIdAtom);
  const session = sessionId
    ? get(sessionsAtom).find((candidate) => candidate.id === sessionId)
    : undefined;
  if (session) {
    const sessionWorkspace = get(workspacesAtom).find(
      (candidate) => candidate.id === session.workspaceId,
    );
    if (sessionWorkspace) {
      return resolveSessionWorkingPath({
        workspaceRootPath: primaryWorkspaceRootPath(sessionWorkspace),
        worktreePath: session.worktreePath,
      });
    }
  }

  const workspaceId = get(activeWorkspaceIdAtom);
  const workspace = get(workspacesAtom).find(
    (candidate) => candidate.id === workspaceId,
  );
  if (!workspace) {
    return null;
  }

  return resolveSessionWorkingPath({
    workspaceRootPath: primaryWorkspaceRootPath(workspace),
    worktreePath: get(draftWorktreePathAtom),
  });
});
