import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { MarkdownFilePathHandlers } from "@/components";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { desktopApi, toAbsolutePath } from "@/lib";

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
