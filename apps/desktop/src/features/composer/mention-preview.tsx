import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/components";
import type { WorkspaceFileEntry } from "@/lib";

interface MentionPreviewProps {
  file: WorkspaceFileEntry;
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
export function MentionPreview({ file }: MentionPreviewProps) {
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

  return (
    <div className="pointer-events-none w-54 shrink-0">
      <ul className="flex min-w-0 flex-col gap-1 px-1.5 py-1">
        {nodes.map((node, index) => (
          <li
            key={node.hintPath}
            className="flex min-w-0 items-center gap-1.5"
            style={{ paddingInlineStart: `${index * 12}px` }}
          >
            {index > 0 ? (
              <span
                className="h-3 w-px border-s border-border"
                aria-hidden="true"
              />
            ) : null}
            <FileTypeIcon
              className="size-3.5 shrink-0 text-muted-foreground"
              isFolder={node.isFolder}
              path={node.hintPath}
            />
            <span className="min-w-0 truncate text-sm">{node.name}</span>
          </li>
        ))}
      </ul>
      <div className="mx-1.5 mt-1 border-t border-border py-1 text-meta text-muted-foreground">
        {t("composer.treeOutline")}
      </div>
    </div>
  );
}
