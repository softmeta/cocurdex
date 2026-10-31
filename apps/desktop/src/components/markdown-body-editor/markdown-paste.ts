import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const BLOCK_SYNTAX =
  /^ {0,3}(?:#{1,6}[ \t]|[-*+][ \t]|\d{1,9}[.)][ \t]|>|```|~~~|\|.*\|[ \t]*$|(?:[-*_][ \t]*){3,}$)/m;
const INLINE_SYNTAX =
  /(?:\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|!\[[^\]\n]*\]\([^)\s]+\))/;

export function looksLikeMarkdown(text: string): boolean {
  return BLOCK_SYNTAX.test(text) || INLINE_SYNTAX.test(text);
}

function prefersPlainText(types: readonly string[]): boolean {
  return !types.includes("text/html") || types.includes("vscode-editor-data");
}

export const MarkdownPaste = Extension.create({
  name: "markdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (view, event) => {
            const data = event.clipboardData;
            if (!data || !prefersPlainText(data.types)) return false;
            if (view.state.selection.$from.parent.type.spec.code) return false;
            const text = data.getData("text/plain").replace(/\r\n?/g, "\n");
            if (!looksLikeMarkdown(text)) return false;
            return editor.commands.insertContent(text, {
              contentType: "markdown",
            });
          },
        },
      }),
    ];
  },
});
