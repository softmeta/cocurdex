import { FileTypeIcon } from "@/components";
import { getEntryName } from "@/features/workspaces";
import { cn, type WorkspaceFileEntry } from "@/lib";

export function MentionFileRow({
  file,
  pathClassName,
}: {
  file: WorkspaceFileEntry;
  pathClassName: string;
}) {
  const entryName = getEntryName(file);
  const slash = file.relativePath.lastIndexOf("/");
  const directory = slash >= 0 ? file.relativePath.slice(0, slash) : "";
  const label = file.kind === "directory" ? `${entryName}/` : entryName;

  return (
    <>
      <FileTypeIcon
        className="size-3.5 shrink-0 text-chat-fg-muted"
        isFolder={file.kind === "directory"}
        path={file.path}
      />
      <span className="min-w-0 flex-1 truncate text-body font-medium">
        {label}
      </span>
      {directory ? (
        <span
          className={cn(
            "ms-2 min-w-0 max-w-44 shrink truncate text-end text-meta",
            pathClassName,
          )}
          dir="ltr"
        >
          {directory}
        </span>
      ) : null}
    </>
  );
}
