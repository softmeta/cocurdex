import type { ContextTransferRecord } from "@cocurdex/shared";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  GitFork,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { getAgentDisplayLabel } from "../session-store";
import { useMessageContextTransfer } from "./context-transfers-store";

function handoffLabel(
  transfer: ContextTransferRecord,
  t: ReturnType<typeof useTranslation<"sessions">>["t"],
) {
  const count = transfer.coveredMessageCount;
  const target = transfer.targetAgentType
    ? getAgentDisplayLabel(transfer.targetAgentType)
    : "";
  if (transfer.strategy === "native") {
    return t("lineage.handoff.native", { count, target });
  }
  if (transfer.kind === "fork") {
    return t("lineage.handoff.fork", { count, target });
  }
  const sources = transfer.sourceAgentTypes
    .map((agentType) => getAgentDisplayLabel(agentType))
    .join(", ");
  return transfer.strategy === "delta"
    ? t("lineage.handoff.delta", { count, sources, target })
    : t("lineage.handoff.full", { count, sources, target });
}

function MarkerRule({ children }: { children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <Text
        className="flex shrink-0 items-center gap-1.5"
        size="meta"
        tone="muted"
      >
        {children}
      </Text>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </>
  );
}

export function ContextHandoffMarker({
  message,
}: {
  message: { id: string; sessionId: string };
}) {
  const { t } = useTranslation("sessions");
  const transfer = useMessageContextTransfer(message);
  const [expanded, setExpanded] = useState(false);
  if (transfer?.status !== "consumed") return null;
  const Icon = transfer.kind === "fork" ? GitFork : ArrowRightLeft;
  const label = (
    <>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {handoffLabel(transfer, t)}
    </>
  );

  if (!transfer.handoffText) {
    return (
      <div className="flex w-full max-w-3xl min-w-0 items-center gap-3 self-center py-1">
        <MarkerRule>{label}</MarkerRule>
      </div>
    );
  }

  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="flex w-full max-w-3xl min-w-0 flex-col gap-2 self-center py-1">
      <button
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-center gap-3 text-left"
        onClick={() => setExpanded((value) => !value)}
        title={expanded ? t("lineage.handoff.hide") : t("lineage.handoff.show")}
        type="button"
      >
        <MarkerRule>
          {label}
          <Chevron aria-hidden="true" className="size-3.5 shrink-0" />
        </MarkerRule>
      </button>
      {expanded ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-card bg-chat-code-block px-4 py-3 text-meta text-chat-fg-secondary">
          {transfer.handoffText}
        </pre>
      ) : null}
    </div>
  );
}
