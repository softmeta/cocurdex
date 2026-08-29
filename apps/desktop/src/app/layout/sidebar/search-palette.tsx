import { Autocomplete } from "@base-ui/react/autocomplete";
import { useAtomValue } from "jotai";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/components";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from "@/components/ui";
import { openFilesAtom } from "@/features/editor";
import {
  findMatchRange,
  rankWorkspaceEntries,
  useWorkspaceFiles,
} from "@/features/workspaces";
import type { WorkspaceFileEntry } from "@/lib";

const DEFAULT_FILE_RESULT_COUNT = 12;
const SEARCH_FILE_RESULT_COUNT = 50;
const commandClassName = "rounded-none bg-transparent text-foreground";
const commandItemClassName =
  "h-8 gap-2 rounded-control px-2 text-body text-muted-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground";

function HighlightedText({
  text,
  query,
  matchedClassName,
}: {
  text: string;
  query: string;
  matchedClassName?: string;
}) {
  const range = findMatchRange(text, query);
  if (!range) {
    return <>{text}</>;
  }
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className={matchedClassName}>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export function SearchPalette({
  activeWorkspaceRootPath,
  onClose,
  onOpenFile,
  open,
}: {
  activeWorkspaceRootPath: string | null;
  onClose(): void;
  onOpenFile(file: WorkspaceFileEntry): void;
  open: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      {open ? (
        <SearchPaletteContent
          activeWorkspaceRootPath={activeWorkspaceRootPath}
          onClose={onClose}
          onOpenFile={onOpenFile}
        />
      ) : null}
    </Dialog>
  );
}

function SearchPaletteContent({
  activeWorkspaceRootPath,
  onClose,
  onOpenFile,
}: {
  activeWorkspaceRootPath: string | null;
  onClose(): void;
  onOpenFile(file: WorkspaceFileEntry): void;
}) {
  const { t } = useTranslation(["common", "search"]);
  const openFiles = useAtomValue(openFilesAtom);
  const [query, setQuery] = useState("");
  const { files, status } = useWorkspaceFiles(activeWorkspaceRootPath);
  const fileEntries = useMemo(
    () => files.filter((file) => file.kind === "file"),
    [files],
  );

  const normalizedQuery = query.trim();
  const filteredFiles = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }
    return rankWorkspaceEntries(fileEntries, normalizedQuery).slice(
      0,
      SEARCH_FILE_RESULT_COUNT,
    );
  }, [fileEntries, normalizedQuery]);
  const defaultFiles = useMemo(() => {
    if (normalizedQuery) {
      return [];
    }

    const filesByPath = new Map(fileEntries.map((file) => [file.path, file]));
    const recentFiles = [...openFiles]
      .reverse()
      .map((filePath) => filesByPath.get(filePath))
      .filter((file): file is WorkspaceFileEntry => Boolean(file));

    if (recentFiles.length > 0) {
      return recentFiles.slice(0, DEFAULT_FILE_RESULT_COUNT);
    }

    return [...fileEntries]
      .sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      )
      .slice(0, DEFAULT_FILE_RESULT_COUNT);
  }, [fileEntries, normalizedQuery, openFiles]);
  const visibleFiles = normalizedQuery ? filteredFiles : defaultFiles;
  const hasRecentFiles = !normalizedQuery && openFiles.length > 0;

  const emptyState = (() => {
    if (!activeWorkspaceRootPath) {
      return {
        title: t("search:empty.noWorkspace.title"),
        description: t("search:empty.noWorkspace.description"),
      };
    }

    if (status === "loading") {
      return {
        title: t("search:empty.loading.title"),
        description: t("search:empty.loading.description"),
      };
    }

    if (status === "error") {
      return {
        title: t("search:empty.error.title"),
        description: t("search:empty.error.description"),
      };
    }

    if (fileEntries.length === 0) {
      return {
        title: t("search:empty.noFiles.title"),
        description: t("search:empty.noFiles.description"),
      };
    }

    if (visibleFiles.length === 0) {
      return {
        title: t("search:empty.noMatches.title"),
        description: t("search:empty.noMatches.description"),
      };
    }

    return null;
  })();

  // Distinct headings make the popup self-explanatory: in the empty-query
  // state the list is recent files or an alphabetical fallback; once the user
  // types, it becomes a ranked result set.
  const heading = (() => {
    if (!normalizedQuery) {
      return hasRecentFiles
        ? t("search:headings.recent")
        : t("search:headings.all");
    }
    return t("search:headings.results");
  })();

  return (
    <DialogContent
      className="app-no-drag overflow-hidden border-chat-border bg-chat-surface-raised p-0 shadow-2xl"
      size="palette"
      showCloseButton={false}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{t("search:files")}</DialogTitle>
        <DialogDescription>{t("search:placeholder")}</DialogDescription>
      </DialogHeader>
      <Command className={commandClassName} filter={() => 1}>
        <div className="flex h-10 items-center gap-2 border-b border-chat-border px-2.5">
          <div className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 text-body font-medium text-muted-foreground">
            <span>{t("search:files")}</span>
            <button
              aria-label={t("common:actions.closeSearch")}
              className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={onClose}
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
          <Autocomplete.Input
            autoFocus
            data-slot="command-input"
            className="app-no-drag h-8 flex-1 border-0 bg-transparent text-body font-medium text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:outline-none focus:ring-0"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
              }
              // Emacs-style Ctrl+N / Ctrl+P navigation, mirroring the
              // @-mention popup. Base UI Autocomplete only listens to the
              // arrow keys, so synthesize a native ArrowDown/ArrowUp event
              // and dispatch it back to the input — React picks it up on
              // bubble and routes it to Autocomplete's handler.
              if (
                event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                !event.shiftKey
              ) {
                const lowered = event.key.toLowerCase();
                if (lowered === "n" || lowered === "p") {
                  event.preventDefault();
                  const target = event.currentTarget;
                  const synthetic = new KeyboardEvent("keydown", {
                    key: lowered === "n" ? "ArrowDown" : "ArrowUp",
                    bubbles: true,
                    cancelable: true,
                  });
                  target.dispatchEvent(synthetic);
                }
              }
            }}
            placeholder={t("search:placeholder")}
            value={query}
          />
        </div>

        <CommandList className="h-56 max-h-none px-2 py-1.5">
          {emptyState ? (
            <CommandEmpty className="p-0">
              <EmptyState
                title={emptyState.title}
                description={emptyState.description}
              />
            </CommandEmpty>
          ) : (
            <CommandGroup
              className="p-0 text-muted-foreground"
              heading={heading}
            >
              {visibleFiles.map((file) => (
                <CommandItem
                  className={commandItemClassName}
                  key={file.path}
                  value={file.path}
                  onSelect={() => onOpenFile(file)}
                >
                  <FileTypeIcon
                    className="size-3.5 shrink-0"
                    path={file.path}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-foreground">
                      <HighlightedText
                        text={file.name}
                        query={normalizedQuery}
                        matchedClassName="bg-transparent text-primary"
                      />
                    </span>
                    <span className="ml-1.5 text-muted-foreground">
                      <HighlightedText
                        text={file.relativePath}
                        query={normalizedQuery}
                        matchedClassName="bg-transparent text-primary"
                      />
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </DialogContent>
  );
}
