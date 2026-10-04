import {
  type MessageOrigin,
  type MessageRecord,
  stripPeerEnvelope,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { ArrowUpRight, Bot, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsibleUserMessageBody, MarkdownRenderer } from "@/components";
import { Avatar, AvatarFallback } from "@/components/ui";
import { selectSessionAtom, sessionsAtom } from "@/features/sessions";
import { messageOriginLabel } from "./message-origin-label";

function PeerOriginAvatar({ origin }: { origin: MessageOrigin }) {
  const Icon = origin.kind === "peer" ? Bot : Workflow;
  return (
    <Avatar className="size-7">
      <AvatarFallback className="bg-chat-surface-control text-chat-fg-muted transition-colors group-hover/peer:bg-chat-surface-control-hover group-hover/peer:text-chat-fg">
        <Icon className="size-4" />
      </AvatarFallback>
    </Avatar>
  );
}

function PeerOriginHeader({
  origin,
  fromLead,
}: {
  origin: MessageOrigin;
  fromLead: boolean;
}) {
  const { t } = useTranslation("agent");
  const selectSession = useSetAtom(selectSessionAtom);

  if (origin.kind === "scriptRun") {
    return (
      <div className="flex max-w-full flex-row-reverse items-center gap-2 text-meta text-chat-fg-muted">
        <PeerOriginAvatar origin={origin} />
        <span className="min-w-0 truncate">
          {messageOriginLabel(t, origin)}
        </span>
      </div>
    );
  }

  return (
    <button
      aria-label={messageOriginLabel(t, origin)}
      title={origin.sessionTitle}
      className="group/peer flex max-w-full flex-row-reverse items-center gap-2 rounded-dense text-meta text-chat-fg-muted hover:text-chat-fg"
      onClick={() => selectSession(origin.sessionId)}
      type="button"
    >
      <PeerOriginAvatar origin={origin} />
      <span className="min-w-0 truncate">
        {fromLead ? t("team.lead") : origin.sessionTitle}
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/peer:opacity-100" />
    </button>
  );
}

export function PeerPrompt({
  message,
  setUserMessageRef,
}: {
  message: MessageRecord;
  setUserMessageRef(id: string, element: HTMLDivElement | null): void;
}) {
  const parentSessionId = useAtomValue(sessionsAtom).find(
    (session) => session.id === message.sessionId,
  )?.parentSessionId;
  const origin = message.origin;
  if (!origin) return null;
  const fromLead =
    origin.kind === "peer" && origin.sessionId === parentSessionId;
  const body = stripPeerEnvelope(message.content);

  return (
    <div
      className="flex w-full justify-end"
      ref={(element) => setUserMessageRef(message.id, element)}
    >
      <div className="flex min-w-0 max-w-3xl flex-col items-end gap-1">
        <PeerOriginHeader fromLead={fromLead} origin={origin} />
        <article className="me-9 min-w-0 max-w-[calc(100%-var(--spacing)*9)] rounded-panel rounded-se-md border border-chat-border-soft bg-chat-surface-subtle px-3.5 py-2.5 text-chat-fg">
          <CollapsibleUserMessageBody key={message.id} text={body}>
            <MarkdownRenderer className="space-y-1.5" content={body} />
          </CollapsibleUserMessageBody>
        </article>
      </div>
    </div>
  );
}
