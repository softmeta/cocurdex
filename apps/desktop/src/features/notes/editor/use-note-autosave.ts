import type { Editor } from "@tiptap/react";
import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { notesIpc } from "../notes-ipc";
import {
  noteEditorDirtyAtom,
  noteSaveStatusAtom,
  patchActiveNoteRevisionAtom,
} from "../notes-store";

const AUTOSAVE_DEBOUNCE_MS = 600;

// Debounced autosave for the note body. Persists Markdown ~600ms after the
// last edit. The note id and revision are held in refs so an in-flight
// debounce always saves to the document it was started for.
export function useNoteAutosave(
  editor: Editor | null,
  noteId: string | null,
  revision: number | null,
) {
  const setSaveStatus = useSetAtom(noteSaveStatusAtom);
  const setDirty = useSetAtom(noteEditorDirtyAtom);
  const patchRevision = useSetAtom(patchActiveNoteRevisionAtom);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{
    noteId: string;
    markdown: string;
    expectedRevision: number;
  } | null>(null);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  const flush = useRef(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    pendingRef.current = null;
    try {
      setSaveStatus("saving");
      const updated = await notesIpc.update({
        id: pending.noteId,
        bodyMarkdown: pending.markdown,
        expectedRevision: pending.expectedRevision,
      });
      patchRevision(updated.revision);
      revisionRef.current = updated.revision;
      setDirty(false);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  });

  useEffect(() => {
    if (!editor || !noteId) {
      return;
    }

    const handleUpdate = () => {
      const expectedRevision = revisionRef.current;
      if (expectedRevision === null) {
        return;
      }
      setDirty(true);
      const markdown =
        typeof editor.getMarkdown === "function"
          ? editor.getMarkdown()
          : // Fallback if Markdown extension is unavailable in tests.
            JSON.stringify(editor.getJSON());
      pendingRef.current = {
        noteId,
        markdown,
        expectedRevision,
      };
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void flush.current();
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    const handleBeforeUnload = () => {
      void flush.current();
    };

    editor.on("update", handleUpdate);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      editor.off("update", handleUpdate);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void flush.current();
    };
  }, [editor, noteId, setDirty]);

  return { flush: flush.current };
}
