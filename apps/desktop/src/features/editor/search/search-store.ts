import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { desktopApi } from "@/lib/ipc";
import type {
  WorkspaceSearchMatch,
  WorkspaceSearchStartPayload,
} from "@/lib/types";

const SEARCH_DEBOUNCE_MS = 250;
const DEFAULT_MAX_RESULTS = 5000;

export type SearchStatus = "idle" | "running" | "done" | "error";

export const searchQueryAtom = atom("");
export const searchCaseSensitiveAtom = atom(false);
export const searchWholeWordAtom = atom(false);
export const searchUseRegexAtom = atom(false);
export const searchIncludeAtom = atom("");
export const searchExcludeAtom = atom("");
export const searchStatusAtom = atom<SearchStatus>("idle");
export const searchErrorAtom = atom<string | null>(null);
export const activeSearchIdAtom = atom<string | null>(null);
export const searchResultsAtom = atom<Map<string, WorkspaceSearchMatch[]>>(
  new Map(),
);
// File paths whose result groups are collapsed. Expansion lives here (not in
// each group's local state) so the toolbar can expand/collapse every group at
// once. A path absent from the set means its group is expanded.
export const collapsedSearchPathsAtom = atom<Set<string>>(new Set<string>());

export const searchResultCountAtom = atom((get) => {
  let count = 0;
  for (const matches of get(searchResultsAtom).values()) {
    count += matches.length;
  }
  return count;
});

export const searchResultFileCountAtom = atom(
  (get) => get(searchResultsAtom).size,
);

function createSearchId() {
  return `search-${crypto.randomUUID()}`;
}

function appendSearchResults(
  current: Map<string, WorkspaceSearchMatch[]>,
  batch: WorkspaceSearchMatch[],
) {
  const next = new Map(current);
  for (const match of batch) {
    const matches = next.get(match.filePath) ?? [];
    next.set(match.filePath, [...matches, match]);
  }
  return next;
}

export function useWorkspaceSearch(rootPath: string | null) {
  const [query, setQuery] = useAtom(searchQueryAtom);
  const caseSensitive = useAtomValue(searchCaseSensitiveAtom);
  const wholeWord = useAtomValue(searchWholeWordAtom);
  const useRegex = useAtomValue(searchUseRegexAtom);
  const include = useAtomValue(searchIncludeAtom);
  const exclude = useAtomValue(searchExcludeAtom);
  const setResults = useSetAtom(searchResultsAtom);
  const setCollapsedPaths = useSetAtom(collapsedSearchPathsAtom);
  const setStatus = useSetAtom(searchStatusAtom);
  const setError = useSetAtom(searchErrorAtom);
  const setActiveSearchId = useSetAtom(activeSearchIdAtom);

  useEffect(() => {
    let currentSearchId: string | null = null;
    let cancelled = false;
    // When a search starts with results already on screen (a re-search, e.g.
    // toggling case/word/regex) we keep those stale results fully visible and
    // accumulate the new ones in `pendingResults`, swapping atomically on done.
    // Replacing the full set with each partial batch made the result count dip
    // (204 → first-batch → 204) for a frame, which read as a flicker.
    let hadPreviousResults = false;
    let pendingResults = new Map<string, WorkspaceSearchMatch[]>();
    // For a fresh search (nothing on screen) we instead stream batches in as
    // they arrive — counting up from zero is expected, not a flash.
    let receivedFirstBatch = false;

    const unsubscribeResult = desktopApi.onWorkspaceSearchResult((event) => {
      if (event.searchId !== currentSearchId) {
        return;
      }

      if (hadPreviousResults) {
        pendingResults = appendSearchResults(pendingResults, event.batch);
        return;
      }

      if (receivedFirstBatch) {
        setResults((current) => appendSearchResults(current, event.batch));
        return;
      }

      receivedFirstBatch = true;
      setResults(appendSearchResults(new Map(), event.batch));
    });
    const unsubscribeDone = desktopApi.onWorkspaceSearchDone((event) => {
      if (event.searchId !== currentSearchId) {
        return;
      }

      // Re-search: swap the held stale results for the freshly accumulated set
      // in one shot (empty map when the new search found nothing).
      if (hadPreviousResults) {
        setResults(pendingResults);
      } else if (!receivedFirstBatch) {
        // Fresh search that streamed nothing → zero matches; clear.
        setResults(new Map());
      }
      setStatus("done");
      setActiveSearchId(null);
    });
    const unsubscribeError = desktopApi.onWorkspaceSearchError((event) => {
      if (event.searchId !== currentSearchId) {
        return;
      }

      setError(event.message);
      setStatus("error");
      setActiveSearchId(null);
    });

    const cancelCurrentSearch = () => {
      if (currentSearchId) {
        void desktopApi.cancelWorkspaceSearch(currentSearchId);
        currentSearchId = null;
      }
      setActiveSearchId(null);
    };

    const timer = window.setTimeout(() => {
      const trimmedQuery = query.trim();
      cancelCurrentSearch();

      setCollapsedPaths(new Set());

      if (!rootPath || !trimmedQuery) {
        setResults(new Map());
        setError(null);
        setStatus("idle");
        return;
      }

      const searchId = createSearchId();
      const payload: WorkspaceSearchStartPayload = {
        caseSensitive,
        exclude,
        include,
        maxResults: DEFAULT_MAX_RESULTS,
        query: trimmedQuery,
        rootPath,
        searchId,
        useRegex,
        wholeWord,
      };

      currentSearchId = searchId;
      receivedFirstBatch = false;
      pendingResults = new Map();
      // Peek at the current results without triggering a render (identity
      // update) to decide whether to hold-and-swap or stream from empty.
      setResults((current) => {
        hadPreviousResults = current.size > 0;
        return current;
      });
      setActiveSearchId(searchId);
      setError(null);
      setStatus("running");

      void desktopApi.startWorkspaceSearch(payload).catch((error: unknown) => {
        if (cancelled || currentSearchId !== searchId) {
          return;
        }

        setError(error instanceof Error ? error.message : String(error));
        setStatus("error");
        setActiveSearchId(null);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelCurrentSearch();
      unsubscribeResult();
      unsubscribeDone();
      unsubscribeError();
    };
  }, [
    caseSensitive,
    exclude,
    include,
    query,
    rootPath,
    setActiveSearchId,
    setCollapsedPaths,
    setError,
    setResults,
    setStatus,
    useRegex,
    wholeWord,
  ]);

  return { query, setQuery };
}
