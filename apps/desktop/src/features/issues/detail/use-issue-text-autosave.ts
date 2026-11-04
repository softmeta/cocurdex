import { useRef } from "react";
import type { MarkdownBodyEditorHandle } from "@/components/markdown-body-editor";
import { useMountEffect } from "@/lib";

const DESCRIPTION_SAVE_DELAY_MS = 600;

export function useIssueTextAutosave({
  initialTitle,
  initialDescription,
  save,
}: {
  initialTitle: string;
  initialDescription: string | null;
  save: (changes: { title?: string; description?: string | null }) => void;
}) {
  const savedRef = useRef({
    title: initialTitle,
    description: initialDescription,
  });
  const draftTitleRef = useRef(initialTitle);
  const editorRef = useRef<MarkdownBodyEditorHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDescription = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const editor = editorRef.current;
    editorRef.current = null;
    if (!editor) {
      return;
    }
    const description = editor.getMarkdown().trim() || null;
    if (description === savedRef.current.description) {
      return;
    }
    savedRef.current = { ...savedRef.current, description };
    save({ description });
  };

  const commitTitle = (): string => {
    const title = draftTitleRef.current.trim();
    if (!title) {
      draftTitleRef.current = savedRef.current.title;
      return savedRef.current.title;
    }
    if (title !== savedRef.current.title) {
      savedRef.current = { ...savedRef.current, title };
      save({ title });
    }
    return title;
  };

  useMountEffect(() => () => {
    commitTitle();
    flushDescription();
  });

  return {
    setDraftTitle: (title: string) => {
      draftTitleRef.current = title;
    },
    commitTitle,
    scheduleDescription: (editor: MarkdownBodyEditorHandle | null) => {
      editorRef.current = editor;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(
        flushDescription,
        DESCRIPTION_SAVE_DELAY_MS,
      );
    },
  };
}
