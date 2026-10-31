import { FileTypeIcon } from "@/components";
import { getEntryName } from "@/features/workspaces";
import type { WorkspaceFileEntry } from "@/lib";

export function MentionFileRow({ file }: { file: WorkspaceFileEntry }) {
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
      <span className="min-w-0 flex-1 truncate text-body">{label}</span>
      {directory ? (
        <span
          className="ms-2 min-w-0 max-w-44 shrink truncate text-end text-meta text-muted-foreground"
          dir="ltr"
        >
          {directory}
        </span>
      ) : null}
    </>
  );
}
