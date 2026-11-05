import { pathBaseName } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { AppPanelTab, FileTypeIcon } from "@/components";
import { activeWorkspaceIdAtom } from "@/features/workspaces";
import { cn } from "@/lib";
import {
  activeFileAtom,
  closeFileAtom,
  markdownPreviewModeAtom,
  openFileAtom,
  openFilesAtom,
  previewFileAtom,
  setActiveFileAtom,
} from "./editor-store";

function getDisplayPath(filePath: string) {
  return pathBaseName(filePath);
}

export function EditorTabs() {
  const { t } = useTranslation("editor");
  const openFiles = useAtomValue(openFilesAtom);
  const activeFile = useAtomValue(activeFileAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const previewFile = useAtomValue(previewFileAtom);
  const setActiveFile = useSetAtom(setActiveFileAtom);
  const pinFile = useSetAtom(openFileAtom);
  const closeFile = useSetAtom(closeFileAtom);
  const isPreviewMode = useAtomValue(markdownPreviewModeAtom);
  const setIsPreviewMode = useSetAtom(markdownPreviewModeAtom);
  const isMarkdownFile = activeFile?.endsWith(".md") ?? false;

  if (openFiles.length === 0) {
    return (
      <div className="app-drag flex h-7 items-center px-2">
        <span className="text-meta text-editor-fg-muted">
          {activeWorkspaceId
            ? t("states.noFileSelected")
            : t("states.noWorkspaceTitle")}
        </span>
      </div>
    );
  }

  return (
    <div
      className="app-drag flex h-7 items-center justify-between gap-2"
      data-testid="editor-tabs-bar"
    >
      <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-px overflow-x-auto">
        {openFiles.map((filePath) => (
          <AppPanelTab
            key={filePath}
            active={filePath === activeFile}
            label={getDisplayPath(filePath)}
            closeLabel={t("actions.closeFile", {
              fileName: getDisplayPath(filePath),
            })}
            icon={
              <FileTypeIcon
                path={filePath}
                className={cn(
                  "size-3.5 shrink-0",
                  filePath !== activeFile && "opacity-60",
                )}
              />
            }
            italic={filePath === previewFile}
            onSelect={() => setActiveFile(filePath)}
            onDoubleClick={() => pinFile(filePath)}
            onClose={() => closeFile(filePath)}
          />
        ))}
      </div>
      {isMarkdownFile ? (
        <button
          type="button"
          aria-pressed={!isPreviewMode}
          onClick={() => setIsPreviewMode(!isPreviewMode)}
          className="app-no-drag me-2 shrink-0 rounded-control px-2 py-0.5 text-meta text-editor-fg-muted transition-colors hover:text-editor-fg-subtle"
        >
          {isPreviewMode ? t("actions.source") : t("actions.preview")}
        </button>
      ) : null}
    </div>
  );
}
