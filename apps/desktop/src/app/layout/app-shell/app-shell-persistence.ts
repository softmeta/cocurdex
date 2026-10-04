import { useSetAtom, useStore } from "jotai";
import { useEffectEvent } from "react";
import { bootstrapQueuedInputsAtom } from "@/features/agent";
import { bootstrapSessionUsageAtom } from "@/features/composer";
import { bootstrapEditorViewsAtom } from "@/features/editor";
import {
  bootstrapAgentsAtom,
  bootstrapProviderModelsAtom,
  bootstrapSessionsAtom,
  selectSessionAtom,
} from "@/features/sessions";
import {
  bootstrapWorkspacesAtom,
  openWorkspaceByPathAtom,
} from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import { appBootstrappedAtom } from "./app-bootstrap-store";
import { startEditorContextSync } from "./editor-context-sync";

export function useAppPersistence() {
  const setAppBootstrapped = useSetAtom(appBootstrappedAtom);
  const bootstrapWorkspaces = useSetAtom(bootstrapWorkspacesAtom);
  const bootstrapSessions = useSetAtom(bootstrapSessionsAtom);
  const bootstrapAgents = useSetAtom(bootstrapAgentsAtom);
  const bootstrapProviderModels = useSetAtom(bootstrapProviderModelsAtom);
  const bootstrapSessionUsage = useSetAtom(bootstrapSessionUsageAtom);
  const bootstrapQueuedInputs = useSetAtom(bootstrapQueuedInputsAtom);
  const bootstrapEditorViews = useSetAtom(bootstrapEditorViewsAtom);
  const openWorkspaceByPath = useSetAtom(openWorkspaceByPathAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const store = useStore();

  // CLI open folder: select workspace everywhere that reads activeWorkspaceId
  // (WorkspacePicker trigger/check, sidebar workspaces list). Always clear the
  // active session so the center surface shows NewSessionCard — that is where
  // the workspace dropdown lives and must show the checkmark.
  const activateWorkspaceFromPath = useEffectEvent((rootPath: string) => {
    openWorkspaceByPath(rootPath);
    selectSession(null);
  });

  // One-time app bootstrap: pull the persisted snapshot from the main process
  // and hydrate every store. Pure mount-time external fetch (no fetching
  // library in this app), so it runs once via useMountEffect.
  useMountEffect(() => {
    let cancelled = false;

    // Agent detection spawns a child process per installed agent CLI, so it is
    // kept off the bootstrap payload and loaded alongside it. The sidebar and
    // transcript never wait on it; only the agent picker fills in late.
    void desktopApi
      .listAgents()
      .then((agents) => {
        if (!cancelled) {
          bootstrapAgents(agents);
        }
      })
      .catch((error) => {
        console.error("[AppPersistence] listAgents failed", error);
      });

    void desktopApi
      .bootstrapApp()
      .then(async (data) => {
        if (cancelled) {
          return;
        }

        bootstrapWorkspaces(data.workspaces);
        bootstrapSessions(data.sessions);
        bootstrapQueuedInputs({
          inputs: data.queuedAgentInputs,
          messages: data.queuedMessages,
        });
        bootstrapSessionUsage(data.sessionUsage);
        bootstrapEditorViews(data.editorViews);
        // Provider models live in a separate IPC table and are not part of
        // bootstrapApp's payload — load them in parallel so the context
        // window indicator has contextLimit data on first paint.
        void bootstrapProviderModels().catch((error) => {
          console.error(
            "[AppPersistence] bootstrapProviderModels failed",
            error,
          );
        });

        // Cold-start `cocurdex .`: apply after workspaces are hydrated so we
        // don't race bootstrapWorkspaces overwriting the selection.
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

        // Release the empty-state gate only once the restored selection is
        // settled, so `cocurdex .` never paints the previous workspace first.
        setAppBootstrapped(true);
      })
      .catch((error) => {
        // Bootstrap failure leaves the UI empty; surface for diagnostics. A
        // user-facing toast belongs here once the toast system lands.
        console.error("[AppPersistence] bootstrapApp failed", error);
        setAppBootstrapped(true);
      });

    return () => {
      cancelled = true;
    };
  });

  // Live `cocurdex .` while the app is already running (second-instance).
  useMountEffect(() =>
    desktopApi.onOpenWorkspaceFromCli(({ rootPath }) => {
      activateWorkspaceFromPath(rootPath);
    }),
  );

  useMountEffect(() => startEditorContextSync(store));
}
