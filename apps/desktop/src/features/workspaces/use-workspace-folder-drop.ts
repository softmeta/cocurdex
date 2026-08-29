import type { DragEvent as ReactDragEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { desktopApi } from "@/lib";

function dataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }
  return Array.from(dataTransfer.types).includes("Files");
}

export interface WorkspaceFolderDropHandlers {
  onDragEnter(event: ReactDragEvent): void;
  onDragLeave(event: ReactDragEvent): void;
  onDragOver(event: ReactDragEvent): void;
  onDrop(event: ReactDragEvent): void;
}

/**
 * Window-level OS folder drag-and-drop. Dropping a directory (or a file from
 * inside one) opens that path as a project workspace — same outcome as the
 * "Open Folder" picker and CLI `cocurdex .`.
 */
export function useWorkspaceFolderDrop(
  onOpenPath: (rootPath: string) => void,
): {
  isDraggingFolder: boolean;
  dropHandlers: WorkspaceFolderDropHandlers;
} {
  const [isDraggingFolder, setIsDraggingFolder] = useState(false);
  // Nested dragenter/leave fire for every child; depth tracks whether the
  // pointer is still inside the drop surface.
  const dragDepthRef = useRef(0);
  const onOpenPathRef = useRef(onOpenPath);
  onOpenPathRef.current = onOpenPath;

  const onDragEnter = useCallback((event: ReactDragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFolder(true);
  }, []);

  const onDragLeave = useCallback((event: ReactDragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFolder(false);
    }
  }, []);

  const onDragOver = useCallback((event: ReactDragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback((event: ReactDragEvent) => {
    dragDepthRef.current = 0;
    setIsDraggingFolder(false);

    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    // Always claim the drop when files are present so Chromium does not
    // navigate the window to a file:// URL. Image drops that nested surfaces
    // already handled via stopPropagation never reach here.
    event.preventDefault();

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) {
      return;
    }

    void (async () => {
      for (const file of files) {
        const filePath = desktopApi.getPathForFile(file);
        if (!filePath) {
          continue;
        }
        try {
          const resolved = await desktopApi.resolveWorkspaceOpenPath(filePath);
          if (resolved?.rootPath) {
            onOpenPathRef.current(resolved.rootPath);
            return;
          }
        } catch (error) {
          console.error("[workspaces] resolveWorkspaceOpenPath failed", error);
        }
      }
    })();
  }, []);

  return {
    isDraggingFolder,
    dropHandlers: {
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    },
  };
}
