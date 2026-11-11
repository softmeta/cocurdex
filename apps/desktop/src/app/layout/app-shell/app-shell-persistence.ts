import { useSetAtom, useStore } from "jotai";
import { useEffectEvent } from "react";
import { bootstrapQueuedInputsAtom } from "@/features/agent";
import { bootstrapSessionUsageAtom } from "@/features/composer";
import { bootstrapEditorViewsAtom } from "@/features/editor";
import {
  bootstrapProviderModelsAtom,
  bootstrapSessionsAtom,
  detectAgentsAtom,
  redetectStaleAgentsAtom,
  selectSessionAtom,
} from "@/features/sessions";
import {
  bootstrapWorkspacesAtom,
  openWorkspaceByPathAtom,
} from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import { adoptAgentSyncCursor } from "./agent-event-bridge";
import { appBootstrappedAtom } from "./app-bootstrap-store";
import { startEditorContextSync } from "./editor-context-sync";

export function useAppPersistence() {
  const setAppBootstrapped = useSetAtom(appBootstrappedAtom);
  const bootstrapWorkspaces = useSetAtom(bootstrapWorkspacesAtom);
  const bootstrapSessions = useSetAtom(bootstrapSessionsAtom);
  const detectAgents = useSetAtom(detectAgentsAtom);
  const bootstrapProviderModels = useSetAtom(bootstrapProviderModelsAtom);
  const bootstrapSessionUsage = useSetAtom(bootstrapSessionUsageAtom);
  const bootstrapQueuedInputs = useSetAtom(bootstrapQueuedInputsAtom);
  const bootstrapEditorViews = useSetAtom(bootstrapEditorViewsAtom);
  const openWorkspaceByPath = useSetAtom(openWorkspaceByPathAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const store = useStore();

  const activateWorkspaceFromPath = useEffectEvent((rootPath: string) => {
    openWorkspaceByPath(rootPath);
    selectSession(null);
  });

  const showRequestedRemoteSession = useEffectEvent(async () => {
    const sessionId = await desktopApi.consumeRemoteHostSession();
    if (sessionId) selectSession(sessionId);
  });

  useMountEffect(() => {
    let cancelled = false;

    detectAgents().catch((error) => {
      console.error("[AppPersistence] listAgents failed", error);
    });

    void desktopApi
      .bootstrapApp()
      .then(async (data) => {
        if (cancelled) {
          return;
        }

        adoptAgentSyncCursor(data.syncCursor);
        bootstrapWorkspaces(data.workspaces);
        bootstrapSessions(data.sessions);
        bootstrapQueuedInputs({
          inputs: data.queuedAgentInputs,
          messages: data.queuedMessages,
          pausedSessionIds: data.pausedQueueSessionIds,
        });
        bootstrapSessionUsage(data.sessionUsage);
        bootstrapEditorViews(data.editorViews);
        void bootstrapProviderModels().catch((error) => {
          console.error(
            "[AppPersistence] bootstrapProviderModels failed",
            error,
          );
        });

        try {
          const pending = await desktopApi.consumePendingOpenFolder();
          if (!cancelled && pending?.rootPath) {
            activateWorkspaceFromPath(pending.rootPath);
          }
        } catch (error) {
          console.error(
            "[AppPersistence] consumePendingOpenFolder failed",
            error,
          );
        }

        await showRequestedRemoteSession().catch((error) => {
          console.error(
            "[AppPersistence] consumeRemoteHostSession failed",
            error,
          );
        });

        setAppBootstrapped(true);
      })
      .catch((error) => {
        console.error("[AppPersistence] bootstrapApp failed", error);
        setAppBootstrapped(true);
      });

    return () => {
      cancelled = true;
    };
  });

  useMountEffect(() =>
    desktopApi.onOpenWorkspaceFromCli(({ rootPath }) => {
      activateWorkspaceFromPath(rootPath);
    }),
  );

  useMountEffect(() =>
    desktopApi.onRemoteHostSession(() => {
      void showRequestedRemoteSession();
    }),
  );

  useMountEffect(() => startEditorContextSync(store));

  useMountEffect(() => {
    const redetect = () => store.set(redetectStaleAgentsAtom);
    window.addEventListener("focus", redetect);
    return () => window.removeEventListener("focus", redetect);
  });
}
