import type { WorkspaceAction } from "@cocurdex/shared";
import { useStore } from "jotai";
import { useState } from "react";
import { toast } from "sonner";
import {
  findPane,
  sessionSplitLayoutAtom,
  sessionsAtom,
} from "@/features/sessions";
import { desktopApi } from "@/lib";

export function useSessionPaneActions(paneId: string) {
  const store = useStore();
  const [actions, setActions] = useState<WorkspaceAction[]>([]);

  const load = () => {
    const sessionId = findPane(
      store.get(sessionSplitLayoutAtom),
      paneId,
    )?.sessionId;
    const workspaceId = store
      .get(sessionsAtom)
      .find((session) => session.id === sessionId)?.workspaceId;
    if (!workspaceId) {
      setActions([]);
      return;
    }
    void desktopApi
      .getWorktreeEnvironment(workspaceId)
      .then((environment) => setActions(environment.actions))
      .catch(() => setActions([]));
  };

  const run = (action: WorkspaceAction) => {
    void desktopApi.chatWindow
      .dispatchIntent({
        surface: "shell",
        intent: { kind: "run-terminal-command", command: action.script },
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
      });
  };

  return { actions, load, run };
}
