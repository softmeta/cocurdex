import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MarkdownFilePathHandlers } from "@/components";
import { fileTreeVisibleAtom, openFilePreviewAtom } from "@/features/editor";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { desktopApi } from "@/lib";

function toAbsolutePath(path: string, rootPath: string | null): string | null {
  // POSIX absolute paths are used as-is; everything else is resolved against the
  // active workspace root. (macOS/Linux first per platform priority.)
  if (path.startsWith("/")) {
    return path;
  }
  if (!rootPath) {
    return null;
  }
  return `${rootPath}/${path}`;
}

// Build the handlers that turn file-path-looking inline code in assistant
// messages into clickable links opening the editor panel. Memoized so the
// markdown renderer's component map stays stable across re-renders.
export function useMessageFilePathHandlers(): MarkdownFilePathHandlers {
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const openFilePreview = useSetAtom(openFilePreviewAtom);
  const setFileTreeVisible = useSetAtom(fileTreeVisibleAtom);
  const { t } = useTranslation("agent");

  const rootPath =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId)
      ?.rootPath ?? null;

  return useMemo<MarkdownFilePathHandlers>(
    () => ({
      resolve(candidate) {
        const absolutePath = toAbsolutePath(candidate.path, rootPath);
        if (!absolutePath) {
          return null;
        }
        return { absolutePath, startLine: candidate.startLine };
      },
      checkExists: (absolutePath) => desktopApi.fileExists(absolutePath),
      open: ({ absolutePath, startLine }) => {
        // The chat link already pointed at the file, so collapse the explorer
        // instead of letting it steal space alongside the opened file.
        setFileTreeVisible(false);
        openFilePreview({
          filePath: absolutePath,
          startLine: startLine ?? null,
        });
      },
      openLabel: t("openFile"),
    }),
    [rootPath, openFilePreview, setFileTreeVisible, t],
  );
}
