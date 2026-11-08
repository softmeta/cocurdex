import {
  type EditorViewRecord,
  isContextFileAttachment,
  remapPathUnderRoot,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { bumpRightPanelRevealAtom } from "@/app/layout/right-panel-reveal";
import {
  chatComposerAttachmentAtom,
  editorSelectionAttachmentAtom,
} from "./editor-chat-context";

export {
  attachEditorSelectionToChatAtom,
  chatComposerAttachmentAtom,
  clearChatComposerAttachmentAtom,
  editorSelectionAttachmentAtom,
  setChatComposerAttachmentAtom,
  setEditorSelectionAttachmentAtom,
} from "./editor-chat-context";

export interface EditorPreviewLocation {
  filePath: string;
  startLine?: number | null;
  endLine?: number | null;
  title?: string | null;
}

export const openFilesAtom = atom<string[]>([]);
export const activeFileAtom = atom<string | null>(null);
export const previewFileAtom = atom<string | null>(null);
export const previewLocationsByFileAtom = atom<
  Record<string, EditorPreviewLocation | null>
>({});
export const markdownPreviewModeAtom = atom(false);
export const editorRevealNonceAtom = atom(0);
export const EDITOR_PANEL_OPEN_STORAGE_KEY = "cocurdex.shell.rightPanelOpen";
export const editorPanelOpenAtom = atomWithStorage(
  EDITOR_PANEL_OPEN_STORAGE_KEY,
  false,
  undefined,
  { getOnInit: true },
);
export const fileTreeVisibleAtom = atom(true);
export const editorViewsBySessionAtom = atom<Record<string, EditorViewRecord>>(
  {},
);
export interface EditorDraftView {
  openFiles: string[];
  activeFile: string | null;
  selections: EditorViewRecord["selections"];
}

export const editorDraftViewsByWorkspaceAtom = atom<
  Record<string, EditorDraftView>
>({});
export const rightPanelResizingAtom = atom(false);

function collectSelectionsFromPreviewLocations(
  previewLocations: Record<string, EditorPreviewLocation | null>,
): EditorViewRecord["selections"] {
  const selections: EditorViewRecord["selections"] = [];

  for (const preview of Object.values(previewLocations)) {
    if (
      preview === null ||
      typeof preview.startLine !== "number" ||
      typeof preview.endLine !== "number"
    ) {
      continue;
    }

    selections.push({
      filePath: preview.filePath,
      startLine: preview.startLine,
      endLine: preview.endLine,
    });
  }

  return selections;
}

function previewLocationsFromView(
  openFiles: string[],
  selections: EditorViewRecord["selections"],
): Record<string, EditorPreviewLocation | null> {
  const nextPreviewLocations: Record<string, EditorPreviewLocation | null> =
    Object.fromEntries(openFiles.map((filePath) => [filePath, null]));

  for (const selection of selections) {
    nextPreviewLocations[selection.filePath] = {
      filePath: selection.filePath,
      startLine: selection.startLine,
      endLine: selection.endLine,
    };
  }

  return nextPreviewLocations;
}

export const openFileAtom = atom(null, (get, set, filePath: string) => {
  const current = get(openFilesAtom);
  if (!current.includes(filePath)) {
    set(openFilesAtom, [...current, filePath]);
  }

  if (get(previewFileAtom) === filePath) {
    set(previewFileAtom, null);
  }

  set(previewLocationsByFileAtom, {
    ...get(previewLocationsByFileAtom),
    [filePath]: null,
  });
  set(markdownPreviewModeAtom, false);
  set(activeFileAtom, filePath);
  set(editorPanelOpenAtom, true);
  set(editorRevealNonceAtom, get(editorRevealNonceAtom) + 1);
  set(bumpRightPanelRevealAtom, "editor");
});

export const openPreviewFileAtom = atom(null, (get, set, filePath: string) => {
  const current = get(openFilesAtom);
  const prevPreview = get(previewFileAtom);

  if (current.includes(filePath) && filePath !== prevPreview) {
    set(markdownPreviewModeAtom, false);
    set(activeFileAtom, filePath);
    set(editorPanelOpenAtom, true);
    set(editorRevealNonceAtom, get(editorRevealNonceAtom) + 1);
    set(bumpRightPanelRevealAtom, "editor");
    return;
  }

  const next =
    prevPreview && current.includes(prevPreview)
      ? current.map((path) => (path === prevPreview ? filePath : path))
      : current.includes(filePath)
        ? current
        : [...current, filePath];

  set(openFilesAtom, next);
  set(previewLocationsByFileAtom, {
    ...get(previewLocationsByFileAtom),
    [filePath]: null,
  });
  set(previewFileAtom, filePath);
  set(markdownPreviewModeAtom, false);
  set(activeFileAtom, filePath);
  set(editorPanelOpenAtom, true);
  set(editorRevealNonceAtom, get(editorRevealNonceAtom) + 1);
  set(bumpRightPanelRevealAtom, "editor");
});

export const openFilePreviewAtom = atom(
  null,
  (get, set, preview: EditorPreviewLocation) => {
    const current = get(openFilesAtom);

    if (!current.includes(preview.filePath)) {
      set(openFilesAtom, [...current, preview.filePath]);
    }

    set(previewLocationsByFileAtom, {
      ...get(previewLocationsByFileAtom),
      [preview.filePath]: preview,
    });
    set(markdownPreviewModeAtom, false);
    set(activeFileAtom, preview.filePath);
    set(editorPanelOpenAtom, true);
    set(editorRevealNonceAtom, get(editorRevealNonceAtom) + 1);
    set(bumpRightPanelRevealAtom, "editor");
  },
);

export const setActiveFileAtom = atom(null, (_get, set, filePath: string) => {
  set(activeFileAtom, filePath);
});

export const bootstrapEditorViewsAtom = atom(
  null,
  (_get, set, views: EditorViewRecord[]) => {
    const nextViews: Record<string, EditorViewRecord> = {};

    for (const view of views) {
      nextViews[view.sessionId] = view;
    }

    set(editorViewsBySessionAtom, nextViews);
  },
);

export const restoreEditorViewForSessionAtom = atom(
  null,
  (get, set, sessionId: string | null) => {
    if (!sessionId) {
      return;
    }

    set(previewFileAtom, null);

    const view = get(editorViewsBySessionAtom)[sessionId];

    if (!view) {
      set(openFilesAtom, []);
      set(activeFileAtom, null);
      set(previewLocationsByFileAtom, {});
      return;
    }

    set(openFilesAtom, view.openFiles);
    set(activeFileAtom, view.activeFile);
    set(
      previewLocationsByFileAtom,
      previewLocationsFromView(view.openFiles, view.selections),
    );
  },
);

export const saveEditorDraftForWorkspaceAtom = atom(
  null,
  (get, set, workspaceId: string) => {
    set(editorDraftViewsByWorkspaceAtom, {
      ...get(editorDraftViewsByWorkspaceAtom),
      [workspaceId]: {
        openFiles: get(openFilesAtom),
        activeFile: get(activeFileAtom),
        selections: collectSelectionsFromPreviewLocations(
          get(previewLocationsByFileAtom),
        ),
      },
    });
  },
);

export const restoreEditorDraftForWorkspaceAtom = atom(
  null,
  (get, set, workspaceId: string | null) => {
    set(previewFileAtom, null);

    if (!workspaceId) {
      set(openFilesAtom, []);
      set(activeFileAtom, null);
      set(previewLocationsByFileAtom, {});
      return;
    }

    const view = get(editorDraftViewsByWorkspaceAtom)[workspaceId];

    if (!view) {
      set(openFilesAtom, []);
      set(activeFileAtom, null);
      set(previewLocationsByFileAtom, {});
      return;
    }

    set(openFilesAtom, view.openFiles);
    set(activeFileAtom, view.activeFile);
    set(
      previewLocationsByFileAtom,
      previewLocationsFromView(view.openFiles, view.selections),
    );
  },
);

export const remapEditorRootAtom = atom(
  null,
  (get, set, payload: { fromRoot: string; toRoot: string }) => {
    const fromRoot = payload.fromRoot.replace(/[\\/]+$/, "") || "/";
    const toRoot = payload.toRoot.replace(/[\\/]+$/, "") || "/";
    if (fromRoot === toRoot) {
      return;
    }

    const remap = (filePath: string) =>
      remapPathUnderRoot(filePath, fromRoot, toRoot);

    set(openFilesAtom, get(openFilesAtom).map(remap));
    const activeFile = get(activeFileAtom);
    if (activeFile) {
      set(activeFileAtom, remap(activeFile));
    }
    const previewFile = get(previewFileAtom);
    if (previewFile) {
      set(previewFileAtom, remap(previewFile));
    }

    const nextPreviewLocations: Record<string, EditorPreviewLocation | null> =
      {};
    for (const [filePath, preview] of Object.entries(
      get(previewLocationsByFileAtom),
    )) {
      const nextPath = remap(filePath);
      if (!preview) {
        nextPreviewLocations[nextPath] = null;
        continue;
      }
      nextPreviewLocations[nextPath] = {
        ...preview,
        filePath: remap(preview.filePath),
      };
    }
    set(previewLocationsByFileAtom, nextPreviewLocations);
  },
);

export const saveEditorViewSnapshotAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const openFiles = get(openFilesAtom);
    const activeFile = get(activeFileAtom);
    const selections = collectSelectionsFromPreviewLocations(
      get(previewLocationsByFileAtom),
    );

    set(editorViewsBySessionAtom, {
      ...get(editorViewsBySessionAtom),
      [sessionId]: {
        sessionId,
        openFiles,
        activeFile,
        selections,
      },
    });
  },
);

export const closeFileAtom = atom(null, (get, set, filePath: string) => {
  const current = get(openFilesAtom);
  const nextOpenFiles = current.filter((path) => path !== filePath);
  const activeFile = get(activeFileAtom);
  const nextPreviewLocations = { ...get(previewLocationsByFileAtom) };
  const selectionAttachment = get(editorSelectionAttachmentAtom);
  const chatAttachment = get(chatComposerAttachmentAtom);

  delete nextPreviewLocations[filePath];

  set(openFilesAtom, nextOpenFiles);
  set(previewLocationsByFileAtom, nextPreviewLocations);

  if (get(previewFileAtom) === filePath) {
    set(previewFileAtom, null);
  }

  if (
    selectionAttachment &&
    isContextFileAttachment(selectionAttachment) &&
    selectionAttachment.filePath === filePath
  ) {
    set(editorSelectionAttachmentAtom, null);
  }

  if (
    chatAttachment &&
    isContextFileAttachment(chatAttachment) &&
    chatAttachment.filePath === filePath
  ) {
    set(chatComposerAttachmentAtom, null);
  }

  if (activeFile !== filePath) {
    return;
  }

  const closedIndex = current.indexOf(filePath);
  const nextActiveFile =
    nextOpenFiles[closedIndex] ??
    nextOpenFiles[closedIndex - 1] ??
    nextOpenFiles[0] ??
    null;

  set(activeFileAtom, nextActiveFile);
});
