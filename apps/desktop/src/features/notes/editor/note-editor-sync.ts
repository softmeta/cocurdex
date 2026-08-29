import { useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { noteSaveStatusAtom, renameNoteAtom } from "../notes-store";

const TITLE_DEBOUNCE_MS = 500;

// Debounced title rename for file notes (frontmatter only — path stays stable).
// Pending title is flushed on unmount so switching notes cannot lose the edit.
export function useDebouncedNoteRename({
  noteId,
  onRenamed,
}: {
  noteId: string;
  onRenamed?: (title: string) => void;
}) {
  const setSaveStatus = useSetAtom(noteSaveStatusAtom);
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
      .then((record) => {
        if (record) {
          noteIdRef.current = record.id;
          onRenamedRef.current?.(record.title);
        }
      })
      .catch(() => setSaveStatus("error"));
  });

  useEffect(() => {
    return () => flush.current();
  }, []);

  return useCallback((title: string) => {
    pendingRef.current = title;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => flush.current(), TITLE_DEBOUNCE_MS);
  }, []);
}

/**
 * Folder renames rewrite the directory path. Commit on blur/Enter only so
 * intermediate keystrokes do not thrash the filesystem (or descendant ids).
 */
export function useCommitFolderRename(noteId: string) {
  const setSaveStatus = useSetAtom(noteSaveStatusAtom);
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
        if (record) {
          noteIdRef.current = record.id;
          return record.title;
        }
        return committedTitle;
      } catch {
        setSaveStatus("error");
        return committedTitle;
      }
    },
    [renameNote, setSaveStatus],
  );
}
