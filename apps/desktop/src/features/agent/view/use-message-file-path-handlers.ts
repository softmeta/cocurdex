import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { MarkdownFilePathHandlers } from "@/components";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { desktopApi } from "@/lib";

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

function toAbsolutePath(path: string, rootPath: string | null): string | null {
  // Absolute paths (POSIX or Windows drive) are used as-is; everything else is
  // resolved against the active workspace root. (macOS/Linux first per platform
  // priority.)
  if (path.startsWith("/") || WINDOWS_ABSOLUTE_PATH.test(path)) {
    return path;
  }
  if (!rootPath) {
    return null;
  }
  return `${rootPath}/${path}`;
}

// Build the handlers that turn file-path-looking inline code in assistant
// messages into clickable links. Opening is dispatched as a shell-surface
// intent so it lands in the window hosting the editor — the same window while
// chat is attached, the primary window once chat is detached. Memoized so the
// markdown renderer's component map stays stable across re-renders.
export function useMessageFilePathHandlers(): MarkdownFilePathHandlers {
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const { t } = useTranslation("agent");

  const rootPath =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId)
      ?.rootPaths[0] ?? null;

  return useMemo<MarkdownFilePathHandlers>(
    () => ({
      resolve(candidate) {
        const absolutePath = toAbsolutePath(candidate.path, rootPath);
        if (!absolutePath) {
          return null;
        }
        return {
          absolutePath,
          startLine: candidate.startLine,
          endLine: candidate.endLine,
        };
      },
      checkExists: (absolutePath) => desktopApi.fileExists(absolutePath),
      open: ({ absolutePath, startLine, endLine }) => {
        void desktopApi.chatWindow
          .dispatchIntent({
            surface: "shell",
            intent: {
              kind: "open-file",
              filePath: absolutePath,
              startLine: startLine ?? null,
              endLine: endLine ?? null,
            },
          })
          .catch((error: unknown) => {
            toast.error(error instanceof Error ? error.message : String(error));
          });
      },
      openLabel: t("openFile"),
    }),
    [rootPath, t],
  );
}
