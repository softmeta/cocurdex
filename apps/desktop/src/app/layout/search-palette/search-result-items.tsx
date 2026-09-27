import type { SearchDocumentResult, SessionRecord } from "@cocurdex/shared";
import { FileText, ListTodo, MessageSquare } from "lucide-react";
import { FileTypeIcon } from "@/components";
import { CommandItem } from "@/components/ui";
import { findMatchRange } from "@/features/workspaces";
import type { WorkspaceFileEntry } from "@/lib";

const commandItemClassName =
  "h-8 gap-2 rounded-control px-2 text-body text-muted-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground";

function HighlightedText({ text, query }: { text: string; query: string }) {
  const range = findMatchRange(text, query);
  if (!range) {
    return <>{text}</>;
  }
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-transparent text-primary">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

export function SessionResultItem({
  query,
  session,
  workspaceName,
  onSelect,
}: {
  query: string;
  session: SessionRecord;
  workspaceName: string | undefined;
  onSelect(): void;
}) {
  return (
    <CommandItem
      className={commandItemClassName}
      value={`session:${session.id}`}
      onSelect={onSelect}
    >
      <MessageSquare className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        <HighlightedText text={session.title} query={query} />
      </span>
      {workspaceName ? (
        <span className="max-w-40 shrink-0 truncate text-muted-foreground">
          {workspaceName}
        </span>
      ) : null}
    </CommandItem>
  );
}

export function FileResultItem({
  file,
  query,
  onSelect,
}: {
  file: WorkspaceFileEntry;
  query: string;
  onSelect(): void;
}) {
  return (
    <CommandItem
      className={commandItemClassName}
      value={`file:${file.path}`}
      onSelect={onSelect}
    >
      <FileTypeIcon className="size-3.5 shrink-0" path={file.path} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">
          <HighlightedText text={file.name} query={query} />
        </span>
        <span className="ms-1.5 text-muted-foreground">
          <HighlightedText text={file.relativePath} query={query} />
        </span>
      </span>
    </CommandItem>
  );
}

export function DocumentResultItem({
  document,
  query,
  onSelect,
}: {
  document: SearchDocumentResult;
  query: string;
  onSelect(): void;
}) {
  const Icon = document.kind === "issue" ? ListTodo : FileText;
  return (
    <CommandItem
      className={commandItemClassName}
      value={`${document.kind}:${document.id}`}
      onSelect={onSelect}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">
          <HighlightedText text={document.title} query={query} />
        </span>
        {document.excerpt ? (
          <span className="ms-1.5 text-muted-foreground">
            {document.excerpt}
          </span>
        ) : null}
      </span>
    </CommandItem>
  );
}
