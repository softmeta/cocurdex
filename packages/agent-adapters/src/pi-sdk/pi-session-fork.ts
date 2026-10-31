import path from "node:path";
import type { ForkProviderSessionPayload } from "@cocurdex/agent-core";
import type { AgentProviderSessionRecord } from "@cocurdex/shared";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { serializeProviderSessionState } from "../shared";
import { findPiUserMessageEntry } from "./pi-chat-session";
import { getPiAgentDir } from "./pi-paths";

interface PiBranchEntry {
  id: string;
  type: string;
  message?: { role?: string };
}

export function readPiSessionFile(providerStateJson: string) {
  try {
    const state = JSON.parse(providerStateJson) as { sessionFile?: unknown };
    return typeof state.sessionFile === "string" ? state.sessionFile : null;
  } catch {
    return null;
  }
}

export function findPiForkLeaf(
  branch: readonly PiBranchEntry[],
  userTurnCount: number | null,
) {
  if (userTurnCount === null) return branch.at(-1) ?? null;
  if (userTurnCount <= 0) return null;
  const nextTurn = findPiUserMessageEntry(branch, userTurnCount);
  if (!nextTurn) return branch.at(-1) ?? null;
  return branch[branch.indexOf(nextTurn) - 1] ?? null;
}

export function forkPiProviderSession(
  payload: ForkProviderSessionPayload,
  sessionManager: Pick<typeof SessionManager, "open">,
  providerVersion: string,
): AgentProviderSessionRecord | null {
  const { source } = payload;
  const sourceFile = readPiSessionFile(source.providerStateJson);
  if (!sourceFile || !source.resumable) {
    throw new Error("Pi session has no session file to fork");
  }
  const manager = sessionManager.open(
    sourceFile,
    path.join(getPiAgentDir(payload.userDataPath), "sessions"),
    payload.workspaceRootPath,
  );
  const leaf = findPiForkLeaf(manager.getBranch(), payload.userTurnCount);
  if (!leaf) return null;
  const sessionFile = manager.createBranchedSession(leaf.id);
  if (!sessionFile) return null;
  return {
    sessionId: payload.targetSessionId,
    providerSessionId: manager.getSessionId(),
    providerStateJson: serializeProviderSessionState({
      adapter: "pi",
      sessionFile,
    }),
    providerVersion,
    resumable: true,
    updatedAt: new Date().toISOString(),
  };
}
