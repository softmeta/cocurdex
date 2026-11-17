import { type Editor, useEditorState } from "@tiptap/react";
import { type RefObject, useRef, useState } from "react";
import { AppFindBar } from "@/components/app/find-bar";
import { useDocumentEvent } from "@/lib";
import { readBodyFind, setBodyFind } from "./body-find";

function isFindShortcut(event: KeyboardEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "f"
  );
}

function focusIsWithin(container: HTMLElement) {
  const active = document.activeElement;
  return !active || active === document.body || container.contains(active);
}

function revealCurrentMatch(editor: Editor) {
  requestAnimationFrame(() => {
    editor.view.dom
      .querySelector("[data-find-current]")
      ?.scrollIntoView({ block: "center" });
  });
}

export function MarkdownFindBar({
  editor,
  scopeRef,
}: {
  editor: Editor;
  scopeRef: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const find = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = readBodyFind(current.state);
      return {
        query: state.query,
        total: state.matches.length,
        current: state.current,
      };
    },
  });

  useDocumentEvent("keydown", (event) => {
    const container = scopeRef.current;
    if (!isFindShortcut(event) || !container?.isConnected) return;
    if (container.offsetParent === null || !focusIsWithin(container)) return;
    event.preventDefault();
    setOpen(true);
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  if (!open) return null;

  const step = (delta: number) => {
    if (find.total === 0) return;
    setBodyFind(editor.view, { current: find.current + delta });
    revealCurrentMatch(editor);
  };

  return (
    <AppFindBar
      inputRef={inputRef}
      query={find.query}
      matches={{
        current: find.total === 0 ? 0 : find.current + 1,
        total: find.total,
      }}
      onQueryChange={(query) => {
        setBodyFind(editor.view, { query });
        revealCurrentMatch(editor);
      }}
      onNext={() => step(1)}
      onPrevious={() => step(-1)}
      onClose={() => {
        setBodyFind(editor.view, { query: "" });
        setOpen(false);
        editor.commands.focus();
      }}
    />
  );
}
