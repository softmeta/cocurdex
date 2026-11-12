import type {
  DelegationMessageOrigin,
  DelegationReportOutcome,
  DelegationSource,
} from "@cocurdex/shared";
import { ArrowUpRight } from "lucide-react";
import { use } from "react";
import { useTranslation } from "react-i18next";
import { openEntity } from "@/lib";
import { DelegationFoldContext } from "./delegation-fold";

function SourceButton({ source }: { source: DelegationSource }) {
  return (
    <button
      className="group/source inline-flex max-w-full items-center gap-1 rounded-dense hover:text-chat-fg"
      onClick={() => openEntity({ kind: "session", id: source.sessionId })}
      type="button"
    >
      <span className="min-w-0 truncate">{source.title}</span>
      <ArrowUpRight className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover/source:opacity-100" />
    </button>
  );
}

export function DelegationSourceLine({ messageId }: { messageId: string }) {
  const { t } = useTranslation("agent");
  const sources = use(DelegationFoldContext).sourcesByReplyId.get(messageId);
  if (!sources?.length) return null;
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-meta text-chat-fg-muted">
      <span className="shrink-0">{t("delegation.basedOn")}</span>
      {sources.map((source) => (
        <SourceButton key={source.sessionId} source={source} />
      ))}
    </div>
  );
}

function useOutcomeLabel() {
  const { t } = useTranslation("agent");
  return (outcome: DelegationReportOutcome) => {
    switch (outcome) {
      case "ready":
      case "finished":
        return t("delegation.outcome.finished");
      case "needs_you":
        return t("delegation.outcome.needsYou");
      case "blocked":
        return t("delegation.outcome.blocked");
      case "failed":
        return t("delegation.outcome.failed");
      case "cancelled":
        return t("delegation.outcome.cancelled");
      case "interrupted":
        return t("delegation.outcome.interrupted");
    }
  };
}

export function DelegationStatusLine({
  messageId,
  origin,
}: {
  messageId: string;
  origin: DelegationMessageOrigin;
}) {
  const { t } = useTranslation("agent");
  const outcomeLabel = useOutcomeLabel();
  const awaiting = use(DelegationFoldContext).pendingByMessageId.has(messageId);
  return (
    <div className="flex w-full min-w-0 items-center justify-start gap-1.5 px-1 text-meta text-chat-fg-muted">
      <SourceButton
        source={{
          sessionId: origin.sessionId,
          title: origin.sessionTitle,
          outcome: origin.outcome,
        }}
      />
      <span className="shrink-0">· {outcomeLabel(origin.outcome)}</span>
      {awaiting ? (
        <span className="shrink-0">· {t("delegation.awaitingAssistant")}</span>
      ) : null}
    </div>
  );
}
