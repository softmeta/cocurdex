import { useSetAtom, useStore } from "jotai";
import { useCallback, useRef } from "react";
import { useMountEffect } from "@/lib";
import { renameNoteAtom } from "../notes-store";

const TITLE_DEBOUNCE_MS = 500;

export function useDebouncedNoteRename({
  noteId,
  onRenamed,
}: {
  noteId: string;
  onRenamed?: (title: string) => void;
}) {
  const store = useStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;
  const onRenamedRef = useRef(onRenamed);
  onRenamedRef.current = onRenamed;

  const flush = useRef(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const title = pendingRef.current;
    if (title === null) {
      return;
    }
    pendingRef.current = null;
    void store
      .set(renameNoteAtom, { id: noteIdRef.current, title })
      .then((record) => onRenamedRef.current?.(record.title))
      .catch(() => undefined);
  });

  useMountEffect(() => () => flush.current());

  return useCallback((title: string) => {
    pendingRef.current = title;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => flush.current(), TITLE_DEBOUNCE_MS);
  }, []);
}

export function useCommitFolderRename(noteId: string) {
  const renameNote = useSetAtom(renameNoteAtom);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  return useCallback(
    async (title: string, committedTitle: string) => {
      const trimmed = title.trim();
      const next = trimmed || committedTitle;
      if (next === committedTitle) {
        return committedTitle;
      }
      try {
        const record = await renameNote({
          id: noteIdRef.current,
          title: next,
        });
        return record.title;
      } catch {
        return committedTitle;
      }
    },
    [renameNote],
  );
}
