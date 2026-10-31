import { Extension, Mark } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { SLIDE_COLOR_MARK } from "./slide-text-doc";

const ParagraphAlign = Extension.create({
  name: "slideParagraphAlign",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          align: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attributes) =>
              attributes.align
                ? { style: `text-align: ${attributes.align}` }
                : {},
          },
        },
      },
    ];
  },
});

const SlideColor = Mark.create({
  name: SLIDE_COLOR_MARK,
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.dataset.slideColor ?? null,
        renderHTML: (attributes) =>
          attributes.color
            ? {
                "data-slide-color": attributes.color,
                style: `color: var(--slide-color-${attributes.color})`,
              }
            : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-slide-color]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

export function slideTextExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      hardBreak: false,
      dropcursor: false,
      trailingNode: false,
      link: { openOnClick: false, autolink: false },
    }),
    ParagraphAlign,
    SlideColor,
    Placeholder.configure({ placeholder }),
  ];
}
