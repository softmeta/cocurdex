import {
  type DeckTheme,
  LIST_INDENT_EM,
  PARAGRAPH_GAP_EM,
  type ResolvedText,
  TEXT_INSET,
} from "@cocurdex/deck";
import { DECK_COLORS, type TextParagraph } from "@cocurdex/shared";
import { EditorContent, useEditor } from "@tiptap/react";
import { type CSSProperties, useRef } from "react";
import {
  fontStack,
  frameStyle,
  slideLength,
  themeColor,
} from "../slide-geometry";
import { docToParagraphs, paragraphsToDoc } from "./slide-text-doc";
import { slideTextExtensions } from "./slide-text-extensions";
import "./slide-text-editor.css";

const VALIGN_JUSTIFY = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
} as const;

function themeVariables(theme: DeckTheme): CSSProperties {
  return Object.fromEntries([
    ...DECK_COLORS.map((token) => [
      `--slide-color-${token}`,
      themeColor(theme, token),
    ]),
    ["--slide-paragraph-gap", `${PARAGRAPH_GAP_EM}em`],
    ["--slide-list-indent", `${LIST_INDENT_EM}em`],
    ["--slide-mono-font", fontStack("mono")],
  ]);
}

function sameParagraphs(a: TextParagraph[], b: TextParagraph[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function SlideTextEditor({
  item,
  theme,
  label,
  placeholder,
  onCommit,
  onCancel,
}: {
  item: ResolvedText;
  theme: DeckTheme;
  label: string;
  placeholder: string;
  onCommit: (paragraphs: TextParagraph[]) => void;
  onCancel: () => void;
}) {
  const settledRef = useRef(false);
  const settle = (paragraphs: TextParagraph[] | null) => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (paragraphs && !sameParagraphs(paragraphs, item.paragraphs)) {
      onCommit(paragraphs);
    } else {
      onCancel();
    }
  };
  const editor = useEditor({
    extensions: slideTextExtensions(placeholder),
    content: paragraphsToDoc(item.paragraphs),
    autofocus: "end",
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
        class: "slide-text-prose outline-none",
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Escape") {
          settle(null);
          view.dom.blur();
          return true;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          view.dom.blur();
          return true;
        }
        return false;
      },
    },
    onBlur: ({ editor: current }) => {
      settle(docToParagraphs(current.getJSON()));
    },
  });

  return (
    <div
      data-slide-editor
      className="absolute z-10 flex flex-col bg-transparent shadow-[0_0_0_1px_var(--primary),0_0_0_2px_rgb(255_255_255/0.7)]"
      style={{
        ...frameStyle(item.frame),
        ...themeVariables(theme),
        padding: slideLength(TEXT_INSET),
        justifyContent: VALIGN_JUSTIFY[item.valign],
        textAlign: item.align,
        color: themeColor(theme, item.color),
        fontFamily: fontStack(item.font),
        fontSize: slideLength(item.fontSize),
        fontWeight: item.bold ? 700 : 400,
        lineHeight: item.lineHeight,
      }}
    >
      <EditorContent editor={editor} className="max-h-full overflow-auto" />
    </div>
  );
}
