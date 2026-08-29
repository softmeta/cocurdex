import { useAtomValue } from "jotai";
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/components";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { BreadcrumbDirTree } from "./editor-breadcrumb-dir-tree-lazy";
import { getBreadcrumbTreeTarget } from "./editor-breadcrumb-dir-tree-utils";
import { activeFileAtom } from "./editor-store";
import { getRelativePath } from "./monaco/monaco-utils";

// VSCode-style path bar shown between the tab strip and the editor canvas.
// Clicking a segment opens a popover file tree rooted at that directory.
export function EditorBreadcrumb() {
  const { t } = useTranslation("editor");
  const activeFile = useAtomValue(activeFileAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  // Key of the segment whose popover is open; only one opens at a time.
  const [openSegment, setOpenSegment] = useState<string | null>(null);

  if (!activeFile) {
    return null;
  }

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const rootPath = activeWorkspace?.rootPath;

  // Without a workspace root we cannot derive a clean relative path; hiding the
  // bar is better than dumping an absolute filesystem path.
  if (!rootPath) {
    return null;
  }

  const segments = getRelativePath(activeFile, rootPath)
    .split("/")
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={t("breadcrumb.navLabel")}
      className="app-drag flex h-7 shrink-0 items-center gap-1 overflow-hidden border-b border-editor-border px-2 text-body text-editor-fg-muted"
    >
      {segments.map((segment, index) => {
        // Use the accumulated path prefix as a stable, unique key so that
        // sibling directories with the same name (e.g. src/src/) are distinct.
        const pathKey = segments.slice(0, index + 1).join("/");
        const target = getBreadcrumbTreeTarget(segments, index);
        const isFileSegment = index === segments.length - 1;
        return (
          <Fragment key={pathKey}>
            <SegmentPopover
              dirPath={target.dirPath}
              isOpen={openSegment === pathKey}
              onOpenChange={(open) => setOpenSegment(open ? pathKey : null)}
              rootPath={rootPath}
              selectedPath={target.selectedPath}
            >
              {isFileSegment ? (
                <FileTypeIcon path={segment} className="size-3.5 shrink-0" />
              ) : null}
              <span className="truncate">{segment}</span>
            </SegmentPopover>
            {isFileSegment ? null : (
              <ChevronRight className="size-3.5 shrink-0 opacity-60 rtl:rotate-180" />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

interface SegmentPopoverProps {
  rootPath: string;
  dirPath: string;
  selectedPath: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

function SegmentPopover({
  rootPath,
  dirPath,
  selectedPath,
  isOpen,
  onOpenChange,
  children,
}: SegmentPopoverProps) {
  return (
    <Popover onOpenChange={onOpenChange} open={isOpen}>
      <PopoverTrigger asChild>
        <button
          className="app-no-drag flex min-w-0 shrink-0 items-center gap-1 rounded-control px-1 hover:bg-editor-hover hover:text-editor-fg"
          type="button"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1">
        {isOpen ? (
          <BreadcrumbDirTree
            dirPath={dirPath}
            onPicked={() => onOpenChange(false)}
            rootPath={rootPath}
            selectedPath={selectedPath}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
