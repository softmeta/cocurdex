import { EditorContent, useEditor } from "@tiptap/react";
import {
  forwardRef,
  type ReactNode,
  useImperativeHandle,
  useState,
} from "react";
import { cn } from "@/lib";
import { buildMarkdownBodyExtensions } from "./extensions";
import "./markdown-body-editor.css";

export interface MarkdownBodyEditorHandle {
  getMarkdown: () => string;
}

interface MarkdownBodyEditorProps {
  /** Parsed once on mount. Remount with a new `key` to load different content. */
  initialMarkdown: string;
  placeholder: string;
  className?: string;
  editorClassName?: string;
}

function readMarkdown(editor: {
  getMarkdown?: () => string;
  getJSON: () => unknown;
}): string {
  if (typeof editor.getMarkdown === "function") {
    return editor.getMarkdown();
  }
  // Fallback if Markdown extension is unavailable in tests.
  return JSON.stringify(editor.getJSON());
}

export const MarkdownBodyEditor = forwardRef<
  MarkdownBodyEditorHandle,
  MarkdownBodyEditorProps
>(function MarkdownBodyEditor(
  { initialMarkdown, placeholder, className, editorClassName },
  ref,
): ReactNode {
  // Capture once per mount so parent re-renders do not reset the document.
  const [content] = useState(() => initialMarkdown);

  const editor = useEditor({
    extensions: buildMarkdownBodyExtensions(placeholder),
    content,
    contentType: "markdown",
    // Required: avoids "can't access DOM" errors under jsdom / non-DOM render.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "md-body-prose focus:outline-none min-h-full",
          editorClassName,
        ),
      },
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => (editor ? readMarkdown(editor) : content),
    }),
    [editor, content],
  );

  return <EditorContent editor={editor} className={className} />;
});

MarkdownBodyEditor.displayName = "MarkdownBodyEditor";
