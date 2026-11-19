import {
  buildNoteDocExtensions,
  type NoteDocExtensionOptions,
} from "@cocurdex/note-doc";
import {
  createNotePreviews,
  hasEditingDecoration,
} from "@cocurdex/note-doc/preview";
import { Placeholder } from "@tiptap/extensions";
import { type Extensions, ReactNodeViewRenderer } from "@tiptap/react";
import { BodyFind } from "./body-find";
import { BoundaryParagraph } from "./boundary-paragraph";
import { CodeBlockView } from "./code-block/code-block-view";
import { CodeHighlight } from "./code-block/code-highlight";
import { DocImageUpload } from "./image/doc-image-upload";
import { DocImageView } from "./image/doc-image-view";
import { renderInlineMath } from "./inline-math";
import { LinkClick } from "./link-click";
import { MarkdownPaste } from "./markdown-paste";
import { createSlashCommand } from "./slash-command";
import { TableEditing } from "./table/table-extension";

export function buildMarkdownBodyExtensions(
  placeholder: string,
  options: NoteDocExtensionOptions = {},
): Extensions {
  return [
    ...buildNoteDocExtensions({
      ...options,
      codeBlockView: ReactNodeViewRenderer(CodeBlockView, {
        update: ({
          oldNode,
          newNode,
          oldDecorations,
          newDecorations,
          updateProps,
        }) => {
          if (newNode.type !== oldNode.type) return false;
          const editingChanged =
            hasEditingDecoration(oldDecorations) !==
            hasEditingDecoration(newDecorations);
          if (newNode !== oldNode || editingChanged) updateProps();
          return true;
        },
      }),
      imageView: ReactNodeViewRenderer(DocImageView, { as: "span" }),
    }),
    CodeHighlight,
    createNotePreviews({ renderInlineMath }),
    LinkClick,
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "paragraph" ? placeholder : "",
    }),
    BoundaryParagraph,
    TableEditing,
    DocImageUpload,
    MarkdownPaste,
    BodyFind,
    createSlashCommand(),
  ];
}
