import { MERMAID_LANGUAGE } from "@cocurdex/note-doc";
import {
  hasEditingDecoration,
  renderedLanguage,
} from "@cocurdex/note-doc/preview";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
} from "@tiptap/react";
import { Check, Code, Copy } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "@/components/app";
import { IconButton } from "@/components/ui";
import {
  CODE_LANGUAGE_OPTIONS,
  codeLanguageLabel,
  findCodeLanguageOption,
  normalizeCodeLanguage,
} from "./code-languages";
import { DiagramActions, RenderedPreview } from "./rendered-preview-lazy";

const PLAIN_TEXT_VALUE = "";
const COPIED_RESET_MS = 1200;

function useLanguageOptions(current: string): AppSearchableSelectOption[] {
  const { t } = useTranslation("notes");
  const plain = { value: PLAIN_TEXT_VALUE, label: t("codeBlock.plainText") };
  const known = CODE_LANGUAGE_OPTIONS.map((option) => ({
    value: option.id,
    label: option.label,
    keywords: option.aliases.join(" "),
  }));
  const custom =
    current && !findCodeLanguageOption(current)
      ? [{ value: current, label: current }]
      : [];
  return [plain, ...custom, ...known];
}

function selectedLanguage(raw: unknown) {
  const language = normalizeCodeLanguage(raw);
  return findCodeLanguageOption(language)?.id ?? language;
}

function CopyCodeButton({ code }: { code: string }) {
  const { t } = useTranslation("notes");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
      })
      .catch(() => {});
  };
  return (
    <IconButton
      aria-label={copied ? t("codeBlock.copied") : t("codeBlock.copy")}
      onClick={copy}
      size="xs"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </IconButton>
  );
}

function keepSelection(event: MouseEvent) {
  event.preventDefault();
}

export function CodeBlockView({
  node,
  updateAttributes,
  editor,
  getPos,
  decorations,
}: NodeViewProps) {
  const { t } = useTranslation("notes");
  const language = selectedLanguage(node.attrs.language);
  const options = useLanguageOptions(language);
  const label = language
    ? codeLanguageLabel(language)
    : t("codeBlock.plainText");
  const rendered = renderedLanguage(language);
  const editing = hasEditingDecoration(decorations);
  const [sourcePinned, setSourcePinned] = useState(false);
  const sourceShown = sourcePinned || editing;
  const toggleSource = () => {
    if (sourceShown) {
      setSourcePinned(false);
      if (editing) editor.commands.blur();
      return;
    }
    setSourcePinned(true);
    const pos = getPos();
    if (!editor.isEditable || pos === undefined) return;
    editor.commands.focus(pos + 1 + node.content.size);
  };

  return (
    <NodeViewWrapper
      className="md-code-block"
      data-code-language={language}
      data-rendered={rendered ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
      data-source={rendered && sourcePinned ? "true" : undefined}
      data-empty={node.content.size === 0 ? "true" : undefined}
    >
      <div
        className="md-code-block-header flex h-7 items-center justify-between gap-2 px-1"
        contentEditable={false}
      >
        <AppSearchableSelect
          appearance="ghost"
          disabled={!editor.isEditable}
          emptyText={t("codeBlock.noLanguage")}
          onValueChange={(value) =>
            updateAttributes({ language: value || null })
          }
          options={options}
          searchPlaceholder={t("codeBlock.searchLanguage")}
          triggerAriaLabel={t("codeBlock.language")}
          triggerLabel={label}
          value={language}
        />
        <div className="flex items-center gap-0.5">
          {rendered ? (
            <IconButton
              aria-label={t("codeBlock.showSource")}
              aria-pressed={sourceShown}
              data-state={sourceShown ? "on" : "off"}
              className="data-[state=on]:bg-muted data-[state=on]:text-foreground"
              onClick={toggleSource}
              onMouseDown={keepSelection}
              size="xs"
            >
              <Code className="size-3.5" />
            </IconButton>
          ) : null}
          <CopyCodeButton code={node.textContent} />
          {rendered === MERMAID_LANGUAGE ? (
            <DiagramActions source={node.textContent} />
          ) : null}
        </div>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {rendered ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: keeps ProseMirror from moving the caret into the hidden source when the preview is pressed.
        <div contentEditable={false} onMouseDown={keepSelection}>
          <RenderedPreview language={rendered} source={node.textContent} />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
