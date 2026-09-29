import type { ContextFolderAttachment } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import {
  Copy,
  FolderOpen,
  type LucideIcon,
  MessageSquarePlus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui";
import { desktopApi } from "@/lib";
import { buildContextFileAttachment } from "./context-file-attachment";
import { setChatComposerAttachmentAtom } from "./editor-store";
import {
  type FileTreeContextTarget,
  resolveFileTreeTargetPaths,
} from "./file-tree-context-target";

function FileTreeContextMenuItem({
  children,
  icon: Icon,
  onClick,
}: {
  children: string;
  icon: LucideIcon;
  onClick(): void;
}) {
  return (
    <ContextMenuItem onClick={onClick}>
      <Icon className="size-3.5" />
      {children}
    </ContextMenuItem>
  );
}

interface FileTreeContextMenuItemsProps {
  rootPath: string;
  target: FileTreeContextTarget;
}

export function FileTreeContextMenuItems({
  rootPath,
  target,
}: FileTreeContextMenuItemsProps) {
  const { t } = useTranslation("editor");
  const setChatComposerAttachment = useSetAtom(setChatComposerAttachmentAtom);

  const { relativePath, absolutePath } = resolveFileTreeTargetPaths(
    rootPath,
    target.relativePath,
  );

  const handleAddToChat = () => {
    if (target.isDirectory) {
      const attachment: ContextFolderAttachment = {
        folderPath: absolutePath,
        kind: "context-folder",
      };
      setChatComposerAttachment(attachment);
      return;
    }

    setChatComposerAttachment(buildContextFileAttachment(absolutePath));
  };

  const handleReveal = () => {
    void desktopApi.revealPathInFileManager(absolutePath);
  };

  const handleCopyPath = () => {
    void navigator.clipboard.writeText(absolutePath);
  };

  const handleCopyRelativePath = () => {
    void navigator.clipboard.writeText(relativePath);
  };

  return (
    <>
      <FileTreeContextMenuItem
        icon={MessageSquarePlus}
        onClick={handleAddToChat}
      >
        {t("actions.addToChat")}
      </FileTreeContextMenuItem>
      {desktopApi.capabilities.fileManager ? (
        <FileTreeContextMenuItem icon={FolderOpen} onClick={handleReveal}>
          {t("contextMenu.revealInFinder")}
        </FileTreeContextMenuItem>
      ) : null}
      <ContextMenuSeparator />
      <FileTreeContextMenuItem icon={Copy} onClick={handleCopyPath}>
        {t("contextMenu.copyPath")}
      </FileTreeContextMenuItem>
      {relativePath ? (
        <FileTreeContextMenuItem icon={Copy} onClick={handleCopyRelativePath}>
          {t("contextMenu.copyRelativePath")}
        </FileTreeContextMenuItem>
      ) : null}
    </>
  );
}
