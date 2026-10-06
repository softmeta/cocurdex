import { Check, Code, Copy, Eye, ScrollText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components";
import { IconButton } from "@/components/ui";

const COPIED_FEEDBACK_MS = 1500;

function ToolCallOutputActions({
  isMarkdown,
  output,
  showSource,
  onToggleSource,
}: {
  isMarkdown: boolean;
  output: string;
  showSource: boolean;
  onToggleSource: () => void;
}) {
  const { t } = useTranslation("agent");
  const [hasCopied, setHasCopied] = useState(false);
  const sourceLabel = showSource
    ? t("toolCalls.viewRendered")
    : t("toolCalls.viewSource");

  const copyOutput = () => {
    void navigator.clipboard
      .writeText(output)
      .then(() => {
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), COPIED_FEEDBACK_MS);
      })
      .catch(() => {});
  };

  return (
    <span className="ml-auto flex items-center gap-0.5">
      {isMarkdown ? (
        <IconButton
          aria-label={sourceLabel}
          aria-pressed={showSource}
          className="text-chat-fg-muted hover:text-chat-fg"
          onClick={onToggleSource}
          size="xs"
          title={sourceLabel}
        >
          {showSource ? <Eye /> : <Code />}
        </IconButton>
      ) : null}
      <IconButton
        aria-label={t("toolCalls.copyOutput")}
        className="text-chat-fg-muted hover:text-chat-fg"
        onClick={copyOutput}
        size="xs"
        title={t("toolCalls.copyOutput")}
      >
        {hasCopied ? <Check /> : <Copy />}
      </IconButton>
    </span>
  );
}

export function ToolCallOutputHeader({
  output,
  isMarkdown,
  showSource,
  onToggleSource,
}: {
  output: string;
  isMarkdown: boolean;
  showSource: boolean;
  onToggleSource: () => void;
}) {
  const { t } = useTranslation("agent");
  return (
    <div className="mb-1.5 flex h-6 items-center gap-1.5 text-body font-medium text-chat-fg-muted">
      <ScrollText className="size-3" />
      {t("toolCalls.output")}
      {output ? (
        <ToolCallOutputActions
          isMarkdown={isMarkdown}
          onToggleSource={onToggleSource}
          output={output}
          showSource={showSource}
        />
      ) : null}
    </div>
  );
}

export function ToolCallOutputContent({
  output,
  renderMarkdown,
}: {
  output: string;
  renderMarkdown: boolean;
}) {
  if (renderMarkdown) {
    return (
      <div className="max-h-[40vh] overflow-auto rounded-control border border-chat-border-soft bg-chat-code-panel p-3">
        <MarkdownRenderer
          className="text-body text-chat-fg-secondary"
          content={output}
        />
      </div>
    );
  }
  return (
    <pre className="max-h-[40vh] overflow-auto rounded-control border border-chat-border-soft bg-chat-code-panel p-3 font-mono text-body leading-5 whitespace-pre-wrap break-words text-chat-fg-secondary [font-variant-ligatures:none]">
      {output}
    </pre>
  );
}
