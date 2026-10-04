import type { Editor } from "@tiptap/react";
import { useStore } from "jotai";
import { useEffect, useRef } from "react";
import { saveNoteChangeAtom } from "../note-save-store";
import { noteEditorDirtyAtom } from "../notes-store";

const AUTOSAVE_DEBOUNCE_MS = 600;

// Debounced autosave for the note body. The save queue reads the latest known
// revision when it sends, so edits made while a save is in flight never carry
// a stale revision.
export function useNoteAutosave(editor: Editor | null, noteId: string | null) {
  const store = useStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ noteId: string; markdown: string } | null>(null);

  const flush = useRef(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    pendingRef.current = null;
    void store.set(saveNoteChangeAtom, {
      noteId: pending.noteId,
      change: { bodyMarkdown: pending.markdown },
    });
  });

  useEffect(() => {
    if (!editor || !noteId) {
      return;
    }

    const handleUpdate = () => {
      store.set(noteEditorDirtyAtom, true);
      const markdown =
        typeof editor.getMarkdown === "function"
          ? editor.getMarkdown()
          : JSON.stringify(editor.getJSON());
      pendingRef.current = { noteId, markdown };
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(flush.current, AUTOSAVE_DEBOUNCE_MS);
    };

    const handleBeforeUnload = () => flush.current();

    editor.on("update", handleUpdate);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      editor.off("update", handleUpdate);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flush.current();
    };
  }, [editor, noteId, store]);

  return { flush: flush.current };
}
