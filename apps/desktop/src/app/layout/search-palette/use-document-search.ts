import type { SearchDocumentResult } from "@cocurdex/shared";
import { useRef, useState } from "react";
import { desktopApi } from "@/lib";

const SEARCH_DEBOUNCE_MS = 150;
const DOCUMENT_RESULT_LIMIT = 30;

export type DocumentSearchStatus = "idle" | "loading" | "error";

interface DocumentSearchState {
  results: SearchDocumentResult[];
  status: DocumentSearchStatus;
}

const EMPTY_STATE: DocumentSearchState = { results: [], status: "idle" };

export function useDocumentSearch() {
  const [state, setState] = useState(EMPTY_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  const search = (query: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const trimmed = query.trim();
    if (!trimmed) {
      setState(EMPTY_STATE);
      return;
    }

    setState((previous) => ({ ...previous, status: "loading" }));
    timerRef.current = setTimeout(async () => {
      try {
        const results = await desktopApi.searchDocuments({
          query: trimmed,
          limit: DOCUMENT_RESULT_LIMIT,
        });
        if (requestRef.current === requestId) {
          setState({ results, status: "idle" });
        }
      } catch {
        if (requestRef.current === requestId) {
          setState({ results: [], status: "error" });
        }
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  return { ...state, search };
}
