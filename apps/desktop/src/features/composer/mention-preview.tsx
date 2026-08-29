import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/components";
import type { WorkspaceFileEntry } from "@/lib";
import { cn } from "@/lib";

interface MentionPreviewProps {
  file: WorkspaceFileEntry;
  tone?: "chat" | "welcome";
}

interface TreeNode {
  // Absolute path on disk for the partial segment. Used as the icon hint so
  // FileTypeIcon can resolve the right glyph (folders fall back to the
  // generic folder icon, file segments use their basename extension).
  hintPath: string;
  isFolder: boolean;
  name: string;
}

// Tree-outline preview that mirrors Cursor's mention-suggestion side panel:
// renders the highlighted entry's path as a vertically nested chain so the
// user can see exactly where in the workspace the candidate lives without
// having to read a long inline path. Purely presentational — no I/O.
export function MentionPreview({ file, tone = "chat" }: MentionPreviewProps) {
  const { t } = useTranslation("sessions");
  const segments = file.relativePath.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  // Reconstruct the absolute path prefix for each level so FileTypeIcon
  // receives a usable hint for the leaf node.
  const rootPrefix = file.path.slice(
    0,
    file.path.length - file.relativePath.length,
  );

  const nodes: TreeNode[] = segments.map((name, index) => {
    const partialRelative = segments.slice(0, index + 1).join("/");
    const isLast = index === segments.length - 1;
    return {
      hintPath: `${rootPrefix}${partialRelative}`,
      isFolder: !isLast || file.kind === "directory",
      name,
    };
  });

  // Match the mention menu's surface so the two popups read as one system
  // (the menu uses welcome-surface / chat-surface-raised).
  const panelClassName =
    tone === "welcome"
      ? "border-welcome-border/60 bg-welcome-surface/95 text-welcome-fg-secondary backdrop-blur-md"
      : "border-chat-border-soft bg-chat-surface-raised/95 text-chat-fg backdrop-blur-md";
  const footerClassName =
    tone === "welcome"
      ? "border-welcome-border/40 text-welcome-fg-muted"
      : "border-chat-border-soft/60 text-chat-fg-muted";
  const connectorClassName =
    tone === "welcome" ? "border-welcome-border/60" : "border-chat-border-soft";

  return (
    <div
      className={cn(
        "pointer-events-none w-56 shrink-0 rounded-card border p-2 shadow-chat-soft",
        panelClassName,
      )}
    >
      <ul className="flex min-w-0 flex-col gap-1">
        {nodes.map((node, index) => (
          <li
            key={node.hintPath}
            className="flex min-w-0 items-center gap-1.5"
            style={{ paddingInlineStart: `${index * 12}px` }}
          >
            {index > 0 ? (
              <span
                className={cn("h-3 w-px border-s", connectorClassName)}
                aria-hidden="true"
              />
            ) : null}
            <FileTypeIcon
              className="size-3.5 shrink-0 text-chat-fg-muted"
              isFolder={node.isFolder}
              path={node.hintPath}
            />
            <span className="min-w-0 truncate text-body">{node.name}</span>
          </li>
        ))}
      </ul>
      <div className={cn("mt-2 border-t pt-1.5 text-meta", footerClassName)}>
        {t("composer.treeOutline")}
      </div>
    </div>
  );
}
