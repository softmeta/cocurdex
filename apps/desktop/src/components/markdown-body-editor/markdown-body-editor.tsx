import { EditorContent, useEditor } from "@tiptap/react";
import {
  forwardRef,
  type ReactNode,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib";
import { buildMarkdownBodyExtensions } from "./extensions";
import { TableControls } from "./table/table-controls";
import "./markdown-body-editor.css";

export interface MarkdownBodyEditorHandle {
  getMarkdown: () => string;
  isDirty: () => boolean;
}

interface MarkdownBodyEditorProps {
  initialMarkdown: string;
  placeholder: string;
  className?: string;
  editorClassName?: string;
  onChange?: () => void;
}

function readMarkdown(editor: {
  getMarkdown?: () => string;
  getJSON: () => unknown;
}): string {
  if (typeof editor.getMarkdown === "function") {
    return editor.getMarkdown();
  }
  return JSON.stringify(editor.getJSON());
}

export const MarkdownBodyEditor = forwardRef<
  MarkdownBodyEditorHandle,
  MarkdownBodyEditorProps
>(function MarkdownBodyEditor(
  { initialMarkdown, placeholder, className, editorClassName, onChange },
  ref,
): ReactNode {
  const [content] = useState(() => initialMarkdown);
  const dirtyRef = useRef(false);

  const editor = useEditor({
    extensions: buildMarkdownBodyExtensions(placeholder),
    content,
    contentType: "markdown",
    immediatelyRender: false,
    onUpdate: () => {
      dirtyRef.current = true;
      onChange?.();
    },
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
      isDirty: () => dirtyRef.current,
    }),
    [editor, content],
  );

  return (
    <div className="relative">
      <EditorContent editor={editor} className={className} />
      {editor ? <TableControls editor={editor} /> : null}
    </div>
  );
});

MarkdownBodyEditor.displayName = "MarkdownBodyEditor";
