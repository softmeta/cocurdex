import {
  type MessageOrigin,
  type MessageRecord,
  stripPeerEnvelope,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { ArrowUpRight, Bot, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsibleUserMessageBody, MarkdownRenderer } from "@/components";
import { Avatar, AvatarFallback } from "@/components/ui";
import { selectSessionAtom } from "@/features/sessions";
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

function PeerOriginHeader({ origin }: { origin: MessageOrigin }) {
  const { t } = useTranslation("agent");
  const selectSession = useSetAtom(selectSessionAtom);

  if (origin.kind === "scriptRun") {
    return (
      <div className="flex max-w-full items-center gap-2 text-meta text-chat-fg-muted">
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
      className="group/peer flex max-w-full items-center gap-2 self-start rounded-dense text-meta text-chat-fg-muted hover:text-chat-fg"
      onClick={() => selectSession(origin.sessionId)}
      type="button"
    >
      <PeerOriginAvatar origin={origin} />
      <span className="min-w-0 truncate">{origin.sessionTitle}</span>
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
  const origin = message.origin;
  if (!origin) return null;
  const body = stripPeerEnvelope(message.content);

  return (
    <div
      className="flex w-full justify-start"
      ref={(element) => setUserMessageRef(message.id, element)}
    >
      <div className="flex w-full min-w-0 max-w-3xl flex-col items-stretch gap-1">
        <PeerOriginHeader origin={origin} />
        <article className="ms-9 min-w-0 rounded-panel rounded-ss-md border border-chat-border-soft bg-chat-surface-subtle px-3.5 py-2.5 text-chat-fg">
          <CollapsibleUserMessageBody key={message.id} text={body}>
            <MarkdownRenderer className="space-y-1.5" content={body} />
          </CollapsibleUserMessageBody>
        </article>
      </div>
    </div>
  );
}
