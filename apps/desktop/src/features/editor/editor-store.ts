import {
  type EditorViewRecord,
  isContextFileAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { bumpRightPanelRevealAtom } from "@/app/layout/right-panel-reveal";

export interface EditorPreviewLocation {
  filePath: string;
  startLine?: number | null;
  endLine?: number | null;
  title?: string | null;
}

export const openFilesAtom = atom<string[]>([]);
export const activeFileAtom = atom<string | null>(null);
// The single transient "preview" tab (Cursor-style): a single-click in the
// file tree opens a file here and reuses this one slot, so browsing files does
// not pile up tabs. A double-click (or any permanent open) promotes it.
export const previewFileAtom = atom<string | null>(null);
export const editorSelectionAttachmentAtom = atom<MessageAttachment | null>(
  null,
);
export const chatComposerAttachmentAtom = atom<MessageAttachment | null>(null);
export const previewLocationsByFileAtom = atom<
  Record<string, EditorPreviewLocation | null>
>({});
export const markdownPreviewModeAtom = atom(false);
// Monotonic counter bumped whenever a file is explicitly opened (preview or
// permanent). Layout components observe it to reveal the editor: open the right
// panel and switch it to the editor view. Session restore writes openFilesAtom
// directly and intentionally does NOT bump this, so switching sessions never
// pops the panel open on its own.
export const editorRevealNonceAtom = atom(0);
// Right panel open/closed preference. Survives app restarts (localStorage) and
// matches the shell width keys under cocurdex.shell.*.
export const EDITOR_PANEL_OPEN_STORAGE_KEY = "cocurdex.shell.rightPanelOpen";
export const editorPanelOpenAtom = atomWithStorage(
  EDITOR_PANEL_OPEN_STORAGE_KEY,
  false,
  undefined,
  { getOnInit: true },
);
// Whether the editor panel's file tree (explorer) is shown. Defaults open so
// landing on the explorer tab always has a place to pick files. Shared so
// opening a file from a chat path link can collapse it in the click handler —
// the link already pointed at the file, so the explorer would only steal space.
// Persists across the panel's collapse/remount, like the view-selection atoms.
export const fileTreeVisibleAtom = atom(true);
export const editorViewsBySessionAtom = atom<Record<string, EditorViewRecord>>(
  {},
);
// In-memory draft editor tabs keyed by workspace. Used while sessionId is null
// (new-session surface). Same-workspace drafts inherit tabs; cross-workspace
// switches restore the target workspace's draft (or empty) instead of leaking
// the previous project's open files. Not persisted — session views still are.
export interface EditorDraftView {
  openFiles: string[];
  activeFile: string | null;
  selections: EditorViewRecord["selections"];
}

export const editorDraftViewsByWorkspaceAtom = atom<
  Record<string, EditorDraftView>
>({});
// True while the user is actively dragging the right editor panel's outer
// divider (owned by the app shell). The git tab reads this so it only
// auto-switches between list and tree on a deliberate resize, not when the
// panel widens from maximize, fullscreen, or a window resize.
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

  // A permanent open promotes the file out of the transient preview slot.
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

// Single-click in the file tree: open the file in the transient preview slot,
// reusing (replacing) whatever file currently occupies it.
export const openPreviewFileAtom = atom(null, (get, set, filePath: string) => {
  const current = get(openFilesAtom);
  const prevPreview = get(previewFileAtom);

  // Already open as a permanent tab — just focus it, leave preview untouched.
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

export const setEditorSelectionAttachmentAtom = atom(
  null,
  (_get, set, attachment: MessageAttachment | null) => {
    set(editorSelectionAttachmentAtom, attachment);
  },
);

export const setChatComposerAttachmentAtom = atom(
  null,
  (_get, set, attachment: MessageAttachment | null) => {
    set(chatComposerAttachmentAtom, attachment);
  },
);

export const attachEditorSelectionToChatAtom = atom(null, (get, set) => {
  const selectionAttachment = get(editorSelectionAttachmentAtom);

  if (!selectionAttachment) {
    return;
  }

  set(chatComposerAttachmentAtom, selectionAttachment);
});

export const clearChatComposerAttachmentAtom = atom(null, (_get, set) => {
  set(chatComposerAttachmentAtom, null);
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
    // Draft (null session) restore is workspace-scoped and lives in
    // restoreEditorDraftForWorkspaceAtom — coordinated by app-shell so
    // same-workspace new chats still inherit tabs while cross-workspace
    // switches do not leak the previous project's open files.
    if (!sessionId) {
      return;
    }

    // Restored views always materialize as permanent tabs; drop any preview.
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

/** Snapshot the current open tabs into the draft bucket for a workspace. */
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

/**
 * Restore draft tabs for a workspace (or clear when workspaceId is null /
 * the workspace has no draft). Used when sessionId is null.
 */
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
