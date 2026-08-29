import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useEffectEvent, useRef } from "react";
import { bootstrapQueuedInputsAtom } from "@/features/agent";
import { activeConversationIdAtom } from "@/features/chat";
import { bootstrapSessionUsageAtom } from "@/features/composer";
import {
  activeFileAtom,
  bootstrapEditorViewsAtom,
  openFilesAtom,
  restoreEditorDraftForWorkspaceAtom,
  restoreEditorViewForSessionAtom,
  saveEditorDraftForWorkspaceAtom,
  saveEditorViewSnapshotAtom,
} from "@/features/editor";
import {
  activeSessionIdAtom,
  bootstrapAgentsAtom,
  bootstrapProviderModelsAtom,
  bootstrapSessionsAtom,
  selectSessionAtom,
} from "@/features/sessions";
import {
  activeWorkspaceIdAtom,
  bootstrapWorkspacesAtom,
  openWorkspaceByPathAtom,
} from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import { freezeRightPanelViewAtom } from "../right-editor-panel-store";
import { appBootstrappedAtom } from "./app-bootstrap-store";

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
  const setActiveConversationId = useSetAtom(activeConversationIdAtom);
  const restoreEditorViewForSession = useSetAtom(
    restoreEditorViewForSessionAtom,
  );
  const restoreEditorDraftForWorkspace = useSetAtom(
    restoreEditorDraftForWorkspaceAtom,
  );
  const saveEditorDraftForWorkspace = useSetAtom(
    saveEditorDraftForWorkspaceAtom,
  );
  const freezeRightPanelView = useSetAtom(freezeRightPanelViewAtom);
  const saveEditorViewSnapshot = useSetAtom(saveEditorViewSnapshotAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const openFiles = useAtomValue(openFilesAtom);
  const activeFile = useAtomValue(activeFileAtom);

  // Workspace that the current openFiles "belong" to while on a draft. Prevents
  // the continuous draft-save effect from writing the previous project's tabs
  // into the next workspace's bucket during a cross-workspace switch.
  const draftOwnerWorkspaceIdRef = useRef<string | null>(null);

  // CLI open folder: select project everywhere that reads activeWorkspaceId
  // (WorkspacePicker trigger/check, sidebar projects list). Always clear the
  // active session so the center surface shows NewSessionCard — that is where
  // the workspace dropdown lives and must show the checkmark.
  const activateWorkspaceFromPath = useEffectEvent((rootPath: string) => {
    openWorkspaceByPath(rootPath);
    selectSession(null);
    setActiveConversationId(null);
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
          messages: data.messages ?? [],
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
        // settled, so `cocurdex .` never paints the previous project first.
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
  // External Electron IPC subscription — not derived state.
  useEffect(() => {
    return desktopApi.onOpenWorkspaceFromCli(({ rootPath }) => {
      activateWorkspaceFromPath(rootPath);
    });
  }, []);

  // Cross-feature sync: editor tabs follow the active session, and draft tabs
  // (null session) are scoped per workspace. Coordination stays in app-shell
  // so sessions/editor/workspaces do not form a barrel cycle.
  useEffect(() => {
    if (activeSessionId) {
      restoreEditorViewForSession(activeSessionId);
      // Session tabs are for the session's workspace; treat that as the owner
      // so a later session→draft handoff on the same workspace keeps tabs.
      draftOwnerWorkspaceIdRef.current = activeWorkspaceId;
    } else {
      const owner = draftOwnerWorkspaceIdRef.current;

      if (owner != null && owner !== activeWorkspaceId) {
        // Cross-workspace while openFiles still belong to `owner`: snapshot
        // them into that workspace's draft, then load the target draft.
        saveEditorDraftForWorkspace(owner);
        restoreEditorDraftForWorkspace(activeWorkspaceId);
        draftOwnerWorkspaceIdRef.current = activeWorkspaceId;
      } else if (owner !== activeWorkspaceId) {
        // First draft entry for this workspace (or leaving pure-chat null).
        restoreEditorDraftForWorkspace(activeWorkspaceId);
        draftOwnerWorkspaceIdRef.current = activeWorkspaceId;
      } else if (activeWorkspaceId) {
        // Same-workspace session→draft (or draft stay): keep current tabs so
        // a new chat inherits what the user was viewing, and refresh the draft
        // bucket from those tabs.
        saveEditorDraftForWorkspace(activeWorkspaceId);
        draftOwnerWorkspaceIdRef.current = activeWorkspaceId;
      } else {
        restoreEditorDraftForWorkspace(null);
        draftOwnerWorkspaceIdRef.current = null;
      }
    }

    // Restore sets openFiles for the new context; freeze the view switcher
    // right after so it stops re-deriving the default from openFiles and the
    // active tab no longer flips (editor -> git) across session switches.
    freezeRightPanelView();
  }, [
    activeSessionId,
    activeWorkspaceId,
    restoreEditorViewForSession,
    restoreEditorDraftForWorkspace,
    saveEditorDraftForWorkspace,
    freezeRightPanelView,
  ]);

  // Persist the active session's editor view (open tabs / active file) whenever
  // it changes. Same cross-feature constraint as above: it reads editor state
  // and the sessions-owned activeSessionId, so it stays in the app-shell layer.
  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    saveEditorViewSnapshot(activeSessionId);
    void desktopApi
      .saveEditorView({
        sessionId: activeSessionId,
        openFiles,
        activeFile,
        selections: [],
      })
      .catch((error) => {
        console.error("[AppPersistence] saveEditorView failed", error);
      });
  }, [activeFile, activeSessionId, openFiles, saveEditorViewSnapshot]);

  // Keep the workspace draft bucket in sync while the user opens/closes files
  // on the new-session surface. Only re-run on tab changes — not on
  // session/workspace identity changes — so a cross-workspace switch cannot
  // write the previous project's still-mounted openFiles into the new bucket
  // before restore replaces them.
  const activeSessionIdRef = useRef(activeSessionId);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeSessionIdRef.current = activeSessionId;
  activeWorkspaceIdRef.current = activeWorkspaceId;

  useEffect(() => {
    const sessionId = activeSessionIdRef.current;
    const workspaceId = activeWorkspaceIdRef.current;
    if (sessionId || !workspaceId) {
      return;
    }
    if (draftOwnerWorkspaceIdRef.current !== workspaceId) {
      return;
    }

    // Tab identity is the trigger; the write atom reads latest openFiles/activeFile.
    void openFiles;
    void activeFile;
    saveEditorDraftForWorkspace(workspaceId);
  }, [activeFile, openFiles, saveEditorDraftForWorkspace]);
}
