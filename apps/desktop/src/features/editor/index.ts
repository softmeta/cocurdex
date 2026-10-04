export { buildContextFileAttachment } from "./context-file-attachment";
export { EditorBreadcrumb } from "./editor-breadcrumb";
export {
  activeFileAtom,
  attachEditorSelectionToChatAtom,
  bootstrapEditorViewsAtom,
  chatComposerAttachmentAtom,
  clearChatComposerAttachmentAtom,
  closeFileAtom,
  editorDraftViewsByWorkspaceAtom,
  editorPanelOpenAtom,
  editorRevealNonceAtom,
  fileTreeVisibleAtom,
  openFileAtom,
  openFilePreviewAtom,
  openFilesAtom,
  previewLocationsByFileAtom,
  remapEditorRootAtom,
  restoreEditorDraftForWorkspaceAtom,
  restoreEditorViewForSessionAtom,
  rightPanelResizingAtom,
  saveEditorDraftForWorkspaceAtom,
  saveEditorViewSnapshotAtom,
  setChatComposerAttachmentAtom,
  setEditorSelectionAttachmentAtom,
} from "./editor-store";
export { EditorTabs } from "./editor-tabs";
// Lazy wrapper, not the tree itself — see git-changes-lazy for the same reason.
export { FileTree } from "./file-tree-lazy";
// Lazy wrapper, not the view itself: the diff renderer is a large dependency
// and nothing outside the git tab needs it.
export { GitChanges } from "./git-changes-lazy";
export { reviewGitTurnAtom } from "./git-changes-store";
export { getEditorLanguage, getRelativePath } from "./monaco/monaco-utils";
export { SearchPanel, SearchResultsPane } from "./search";
