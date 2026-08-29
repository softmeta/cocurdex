import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createSlashCommand } from "./slash-command";

// Allowlisted block/mark set for Markdown round-trip (notes + issue bodies).
// Keep nodes serializable: no custom nodes without a markdown serializer.
export function buildMarkdownBodyExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      // cocurdex-pdf: private scheme for note → PDF reader deep links.
      // TipTap Link defaults to target=_blank which spawns an empty Electron
      // window; keep links in-document and handle navigation in the editor.
      link: {
        openOnClick: false,
        protocols: ["cocurdex-pdf"],
        HTMLAttributes: {
          target: null,
          rel: null,
        },
      },
    }),
    Markdown,
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "paragraph" ? placeholder : "",
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    createSlashCommand(),
  ];
}
