import type { TFunction } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/components";
import { activeWorkspaceIdAtom } from "@/features/workspaces";
import { cn, useScrollIntoViewWhenActive } from "@/lib";
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
  return filePath.split("/").pop() ?? filePath;
}

interface EditorTabItemProps {
  filePath: string;
  isActive: boolean;
  isPreview: boolean;
  onSelect: (filePath: string) => void;
  onPin: (filePath: string) => void;
  onClose: (filePath: string) => void;
  t: TFunction<"editor">;
}

function EditorTabItem({
  filePath,
  isActive,
  isPreview,
  onSelect,
  onPin,
  onClose,
  t,
}: EditorTabItemProps) {
  // Keep the active tab visible when selected or opened while the row is
  // scrolled — the overflow container is the external system synced here.
  const ref = useScrollIntoViewWhenActive<HTMLDivElement>(isActive);

  return (
    <div
      ref={ref}
      className={cn(
        "app-no-drag group flex max-w-44 shrink-0 items-center gap-1.5 rounded-control px-2 py-0.5 text-meta transition-colors",
        isActive
          ? "bg-editor-tab-active-bg text-editor-fg"
          : "text-editor-fg-muted hover:bg-editor-tab-hover-bg hover:text-editor-fg-subtle",
      )}
    >
      {/*
        On hover the close button takes over the file-icon slot. Both share the
        same fixed-size box and toggle only opacity, so the swap never reflows
        the tab width.
      */}
      <span className="relative size-3.5 shrink-0">
        <FileTypeIcon
          path={filePath}
          className={cn(
            "size-3.5 transition-opacity group-hover:opacity-0",
            !isActive && "opacity-60",
          )}
        />
        <button
          type="button"
          aria-label={t("actions.closeFile", {
            fileName: getDisplayPath(filePath),
          })}
          onClick={(event) => {
            event.stopPropagation();
            onClose(filePath);
          }}
          className="absolute inset-0 flex items-center justify-center rounded-control text-editor-fg-muted opacity-0 transition-opacity hover:text-editor-fg group-hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      </span>
      <button
        type="button"
        onClick={() => onSelect(filePath)}
        onDoubleClick={() => onPin(filePath)}
        className={cn(
          "min-w-0 flex-1 truncate text-left",
          isPreview && "italic",
        )}
      >
        {getDisplayPath(filePath)}
      </button>
    </div>
  );
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
          <EditorTabItem
            key={filePath}
            filePath={filePath}
            isActive={filePath === activeFile}
            isPreview={filePath === previewFile}
            onSelect={setActiveFile}
            onPin={pinFile}
            onClose={closeFile}
            t={t}
          />
        ))}
      </div>
      {isMarkdownFile ? (
        <div className="app-no-drag flex shrink-0 items-center gap-1 pe-2">
          <button
            type="button"
            onClick={() => setIsPreviewMode(false)}
            className={cn(
              "rounded-control px-2 py-0.5 text-meta transition-colors",
              !isPreviewMode
                ? "bg-editor-tab-active-bg text-editor-fg"
                : "text-editor-fg-muted hover:text-editor-fg-subtle",
            )}
          >
            {t("actions.edit")}
          </button>
          <button
            type="button"
            onClick={() => setIsPreviewMode(true)}
            className={cn(
              "rounded-control px-2 py-0.5 text-meta transition-colors",
              isPreviewMode
                ? "bg-editor-tab-active-bg text-editor-fg"
                : "text-editor-fg-muted hover:text-editor-fg-subtle",
            )}
          >
            {t("actions.preview")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
