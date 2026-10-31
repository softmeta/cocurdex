import { Autocomplete } from "@base-ui/react/autocomplete";
import type { SearchDocumentResult } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from "@/components/ui";
import { openFilesAtom } from "@/features/editor";
import { sessionsAtom } from "@/features/sessions";
import {
  rankWorkspaceEntries,
  useWorkspaceFiles,
  workspacesAtom,
} from "@/features/workspaces";
import { cn, formatShortcutLabel, type WorkspaceFileEntry } from "@/lib";
import {
  cycleSearchCategory,
  rankSessions,
  SEARCH_CATEGORIES,
  type SearchCategory,
} from "./search-palette-model";
import {
  DocumentResultItem,
  FileResultItem,
  SessionResultItem,
} from "./search-result-items";
import { useDocumentSearch } from "./use-document-search";
import { useSearchPaletteActions } from "./use-search-palette-actions";

const ALL_CATEGORY_RESULT_COUNT = 5;
const CATEGORY_RESULT_COUNT = 50;

function resultLimit(category: SearchCategory) {
  return category === "all" ? ALL_CATEGORY_RESULT_COUNT : CATEGORY_RESULT_COUNT;
}

function shows(category: SearchCategory, section: SearchCategory) {
  return category === "all" || category === section;
}

function forwardCtrlNavigation(event: KeyboardEvent<HTMLInputElement>) {
  if (event.metaKey || event.altKey || event.shiftKey || !event.ctrlKey) {
    return;
  }
  const lowered = event.key.toLowerCase();
  if (lowered !== "n" && lowered !== "p") {
    return;
  }
  event.preventDefault();
  event.currentTarget.dispatchEvent(
    new globalThis.KeyboardEvent("keydown", {
      key: lowered === "n" ? "ArrowDown" : "ArrowUp",
      bubbles: true,
      cancelable: true,
    }),
  );
}

export function SearchPalette({
  activeWorkspaceRootPaths,
  onClose,
  onOpenFile,
  open,
}: {
  activeWorkspaceRootPaths: string[];
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
          activeWorkspaceRootPaths={activeWorkspaceRootPaths}
          onClose={onClose}
          onOpenFile={onOpenFile}
        />
      ) : null}
    </Dialog>
  );
}

function useFileResults(
  activeWorkspaceRootPaths: string[],
  query: string,
  limit: number,
) {
  const openFiles = useAtomValue(openFilesAtom);
  const { files, status } = useWorkspaceFiles(activeWorkspaceRootPaths);
  const fileEntries = useMemo(
    () => files.filter((file) => file.kind === "file"),
    [files],
  );
  const results = useMemo(() => {
    if (query) {
      return rankWorkspaceEntries(fileEntries, query).slice(0, limit);
    }
    const filesByPath = new Map(fileEntries.map((file) => [file.path, file]));
    return [...openFiles]
      .reverse()
      .map((filePath) => filesByPath.get(filePath))
      .filter((file): file is WorkspaceFileEntry => Boolean(file))
      .slice(0, limit);
  }, [fileEntries, limit, openFiles, query]);
  return { results, status };
}

function SearchPaletteContent({
  activeWorkspaceRootPaths,
  onClose,
  onOpenFile,
}: {
  activeWorkspaceRootPaths: string[];
  onClose(): void;
  onOpenFile(file: WorkspaceFileEntry): void;
}) {
  const { t } = useTranslation(["common", "search"]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");
  const sessions = useAtomValue(sessionsAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const documents = useDocumentSearch();
  const actions = useSearchPaletteActions(onClose);
  const categoryLabels: Record<SearchCategory, string> = {
    all: t("search:categories.all"),
    sessions: t("search:categories.sessions"),
    files: t("search:categories.files"),
    notes: t("search:categories.notes"),
    issues: t("search:categories.issues"),
  };
  const normalizedQuery = query.trim();
  const limit = resultLimit(category);
  const files = useFileResults(
    activeWorkspaceRootPaths,
    normalizedQuery,
    limit,
  );

  const workspaceNames = useMemo(
    () =>
      new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces],
  );
  const sessionResults = useMemo(
    () => rankSessions(sessions, normalizedQuery, limit),
    [sessions, normalizedQuery, limit],
  );
  const documentsOfKind = (kind: SearchDocumentResult["kind"]) =>
    documents.results
      .filter((document) => document.kind === kind)
      .slice(0, limit);
  const noteResults = documentsOfKind("note");
  const issueResults = documentsOfKind("issue");

  const sections: {
    key: SearchCategory;
    heading: string;
    items: ReactNode[];
  }[] = [
    {
      key: "sessions",
      heading: normalizedQuery
        ? categoryLabels.sessions
        : t("search:headings.recentSessions"),
      items: sessionResults.map((session) => (
        <SessionResultItem
          key={session.id}
          query={normalizedQuery}
          session={session}
          workspaceName={workspaceNames.get(session.workspaceId)}
          onSelect={() => actions.openSession(session)}
        />
      )),
    },
    {
      key: "files",
      heading: normalizedQuery
        ? categoryLabels.files
        : t("search:headings.recent"),
      items: files.results.map((file) => (
        <FileResultItem
          key={file.path}
          file={file}
          query={normalizedQuery}
          onSelect={() => onOpenFile(file)}
        />
      )),
    },
    {
      key: "notes",
      heading: categoryLabels.notes,
      items: noteResults.map((document) => (
        <DocumentResultItem
          key={document.id}
          document={document}
          query={normalizedQuery}
          onSelect={() => actions.openNote(document.id)}
        />
      )),
    },
    {
      key: "issues",
      heading: categoryLabels.issues,
      items: issueResults.map((document) => (
        <DocumentResultItem
          key={document.id}
          document={document}
          query={normalizedQuery}
          onSelect={() => actions.openIssue(document.id)}
        />
      )),
    },
  ];
  const visibleSections = sections.filter(
    (section) => shows(category, section.key) && section.items.length > 0,
  );

  const emptyState = (() => {
    const searchesDocuments = category === "notes" || category === "issues";
    if (!normalizedQuery && searchesDocuments) {
      return {
        title: t("search:empty.typeToSearch.title"),
        description: t("search:empty.typeToSearch.description"),
      };
    }
    if (category === "files" && activeWorkspaceRootPaths.length === 0) {
      return {
        title: t("search:empty.noWorkspace.title"),
        description: t("search:empty.noWorkspace.description"),
      };
    }
    if (category === "files" && files.status === "error") {
      return {
        title: t("search:empty.error.title"),
        description: t("search:empty.error.description"),
      };
    }
    if (searchesDocuments && documents.status === "error") {
      return {
        title: t("search:empty.documentsError.title"),
        description: t("search:empty.documentsError.description"),
      };
    }
    const filesLoading = shows(category, "files") && files.status === "loading";
    const documentsLoading =
      category !== "sessions" && documents.status === "loading";
    if (filesLoading || documentsLoading) {
      return {
        title: t("search:empty.loading.title"),
        description: t("search:empty.loading.description"),
      };
    }
    return {
      title: t("search:empty.noMatches.title"),
      description: t("search:empty.noMatches.description"),
    };
  })();

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const isMod = event.metaKey || event.ctrlKey;
    if (isMod && (event.key === "[" || event.key === "]")) {
      event.preventDefault();
      setCategory((current) =>
        cycleSearchCategory(current, event.key === "]" ? 1 : -1),
      );
      return;
    }
    forwardCtrlNavigation(event);
  };

  return (
    <DialogContent
      className="app-no-drag overflow-hidden border-chat-border bg-chat-surface-raised p-0 shadow-2xl"
      size="palette"
      showCloseButton={false}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{t("search:title")}</DialogTitle>
        <DialogDescription>{t("search:placeholder")}</DialogDescription>
      </DialogHeader>
      <Command
        className="rounded-none bg-transparent text-foreground"
        filter={() => 1}
      >
        <div className="flex h-10 items-center gap-2 border-b border-chat-border px-2.5">
          <Autocomplete.Input
            autoFocus
            data-slot="command-input"
            className="app-no-drag h-8 flex-1 border-0 bg-transparent text-body font-medium text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:outline-none focus:ring-0"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              documents.search(event.currentTarget.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("search:placeholder")}
            value={query}
          />
          <button
            aria-label={t("common:actions.closeSearch")}
            className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div
          className="flex items-center gap-1 px-2 pt-2"
          role="tablist"
          aria-label={t("search:categoriesLabel")}
        >
          {SEARCH_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={category === item}
              className={cn(
                "h-6 rounded-full px-2.5 text-body text-muted-foreground transition-colors hover:text-foreground",
                category === item && "bg-muted font-medium text-foreground",
              )}
              onClick={() => setCategory(item)}
              onMouseDown={(event) => event.preventDefault()}
            >
              {categoryLabels[item]}
            </button>
          ))}
        </div>

        <CommandList className="h-80 max-h-none px-2 py-1.5">
          {visibleSections.length === 0 ? (
            <CommandEmpty className="p-0">
              <EmptyState
                title={emptyState.title}
                description={emptyState.description}
              />
            </CommandEmpty>
          ) : (
            visibleSections.map((section) => (
              <CommandGroup
                key={section.key}
                className="p-0 text-muted-foreground"
                heading={section.heading}
              >
                {section.items}
              </CommandGroup>
            ))
          )}
        </CommandList>
        <div className="flex h-8 items-center gap-3 border-t border-chat-border px-3 text-meta text-muted-foreground">
          <span>{t("search:hints.select")}</span>
          <span>{t("search:hints.open")}</span>
          <span>
            {t("search:hints.changeCategory", {
              previous: formatShortcutLabel({ primary: true, key: "[" }),
              next: formatShortcutLabel({ primary: true, key: "]" }),
            })}
          </span>
        </div>
      </Command>
    </DialogContent>
  );
}
