import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui";

import type { ToolCallInputEntry } from "./tool-call-utils";

export function ToolCallCommandDetail({
  command,
  otherEntries,
  output,
  outputErrorMessage,
  outputLoadStatus,
}: {
  command: string;
  otherEntries: ToolCallInputEntry[];
  output: string | null;
  outputErrorMessage: string;
  outputLoadStatus: "ready" | "loading" | "error";
}) {
  const { t } = useTranslation("agent");

  return (
    <div className="flex max-h-[40vh] flex-col gap-2 overflow-auto rounded-control border border-chat-border-soft bg-chat-code-panel p-3 font-mono text-xs leading-5 [font-variant-ligatures:none]">
      <div className="whitespace-pre-wrap break-words text-chat-fg">
        <span className="select-none text-chat-fg-muted">$ </span>
        {command}
      </div>
      {otherEntries.length > 0 ? (
        <dl className="flex flex-col text-chat-fg-muted">
          {otherEntries.map((entry) => (
            <div className="flex min-w-0 gap-2" key={entry.key}>
              <dt className="shrink-0 font-sans">{entry.label}</dt>
              <dd className="min-w-0 truncate">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {outputLoadStatus === "loading" ? (
        <div className="flex items-center gap-2 font-sans text-chat-fg-muted">
          <Spinner size="xs" />
          <span>{t("toolCalls.outputLoading")}</span>
        </div>
      ) : null}
      {outputLoadStatus === "error" ? (
        <div className="font-sans text-chat-fg-muted">
          {t("toolCalls.outputLoadError", { message: outputErrorMessage })}
        </div>
      ) : null}
      {outputLoadStatus === "ready" && output ? (
        <pre className="whitespace-pre border-t border-chat-border-soft pt-2 text-chat-fg-secondary">
          {output}
        </pre>
      ) : null}
    </div>
  );
}
