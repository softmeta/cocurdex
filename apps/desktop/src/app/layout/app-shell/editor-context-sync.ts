import { atom, type getDefaultStore } from "jotai";
import {
  activeFileAtom,
  openFilesAtom,
  restoreEditorDraftForWorkspaceAtom,
  restoreEditorViewForSessionAtom,
  saveEditorDraftForWorkspaceAtom,
  saveEditorViewSnapshotAtom,
} from "@/features/editor";
import { activeSessionIdAtom } from "@/features/sessions";
import { activeWorkspaceIdAtom } from "@/features/workspaces";
import { desktopApi } from "@/lib";
import { freezeRightPanelViewAtom } from "../right-editor-panel-store";

type Store = ReturnType<typeof getDefaultStore>;

const activeContextAtom = atom((get) => ({
  sessionId: get(activeSessionIdAtom),
  workspaceId: get(activeWorkspaceIdAtom),
}));

const editorTabsAtom = atom((get) => ({
  openFiles: get(openFilesAtom),
  activeFile: get(activeFileAtom),
}));

// Editor tabs follow the active session, and draft tabs (no session) are
// scoped per workspace. Coordination lives in app-shell so the sessions,
// editor, and workspaces features do not import each other.
export function startEditorContextSync(store: Store) {
  let draftOwnerWorkspaceId: string | null = null;

  const syncContext = () => {
    const { sessionId, workspaceId } = store.get(activeContextAtom);
    if (sessionId) {
      draftOwnerWorkspaceId = workspaceId;
      store.set(restoreEditorViewForSessionAtom, sessionId);
    } else if (draftOwnerWorkspaceId === workspaceId && workspaceId) {
      store.set(saveEditorDraftForWorkspaceAtom, workspaceId);
    } else if (draftOwnerWorkspaceId === workspaceId) {
      store.set(restoreEditorDraftForWorkspaceAtom, null);
    } else {
      if (draftOwnerWorkspaceId != null) {
        store.set(saveEditorDraftForWorkspaceAtom, draftOwnerWorkspaceId);
      }
      draftOwnerWorkspaceId = workspaceId;
      store.set(restoreEditorDraftForWorkspaceAtom, workspaceId);
    }
    store.set(freezeRightPanelViewAtom);
  };

  const persistTabs = () => {
    const { sessionId, workspaceId } = store.get(activeContextAtom);
    if (sessionId) {
      const { openFiles, activeFile } = store.get(editorTabsAtom);
      store.set(saveEditorViewSnapshotAtom, sessionId);
      void desktopApi
        .saveEditorView({ sessionId, openFiles, activeFile, selections: [] })
        .catch((error) => {
          console.error("[AppPersistence] saveEditorView failed", error);
        });
    } else if (workspaceId && draftOwnerWorkspaceId === workspaceId) {
      store.set(saveEditorDraftForWorkspaceAtom, workspaceId);
    }
  };

  syncContext();
  const unsubscribeContext = store.sub(activeContextAtom, syncContext);
  const unsubscribeTabs = store.sub(editorTabsAtom, persistTabs);
  return () => {
    unsubscribeContext();
    unsubscribeTabs();
  };
}
