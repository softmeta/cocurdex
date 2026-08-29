import type { ConversationSource } from "@cocurdex/shared";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { desktopApi } from "@/lib";

interface MessageSourcesProps {
  sources: ConversationSource[];
}

// Renders the citation list at the bottom of an assistant message. Clicks
// route through the main process's openExternal handler so links land in the
// user's default browser instead of the embedded BrowserView.
export function MessageSources({ sources }: MessageSourcesProps) {
  const { t } = useTranslation("chat");
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 rounded-control border border-border bg-muted/40 p-3">
      <div className="mb-2 text-meta uppercase tracking-wide text-muted-foreground">
        {t("sources.heading", {
          defaultValue: "Sources",
          count: sources.length,
        })}
      </div>
      <ul className="flex flex-col gap-1.5">
        {sources.map((source, index) => (
          <li
            // Sources are de-duped by URL upstream; the URL alone is a stable
            // key.
            key={source.url}
            className="flex items-start gap-2 text-meta"
          >
            <span className="text-muted-foreground tabular-nums">
              {index + 1}.
            </span>
            <button
              type="button"
              onClick={() => {
                void desktopApi.openExternal(source.url);
              }}
              className="flex min-w-0 items-start gap-1 text-left hover:underline"
            >
              <span className="truncate">{source.title || source.url}</span>
              <ExternalLink className="size-3 shrink-0 opacity-60" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
