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

export function useWorkspaceFolderDrop(
  onOpenPath: (rootPath: string) => void,
): {
  isDraggingFolder: boolean;
  dropHandlers: WorkspaceFolderDropHandlers;
} {
  const [isDraggingFolder, setIsDraggingFolder] = useState(false);
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
