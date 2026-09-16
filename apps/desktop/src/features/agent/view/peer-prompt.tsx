import { type MessageRecord, stripPeerEnvelope } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { ArrowUpRight, Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsibleUserMessageBody, MarkdownRenderer } from "@/components";
import { selectSessionAtom } from "@/features/sessions";

export function PeerPrompt({
  message,
  setUserMessageRef,
}: {
  message: MessageRecord;
  setUserMessageRef(id: string, element: HTMLDivElement | null): void;
}) {
  const { t } = useTranslation("agent");
  const selectSession = useSetAtom(selectSessionAtom);
  const origin = message.origin;
  if (!origin) return null;
  const body = stripPeerEnvelope(message.content);

  return (
    <div
      className="flex w-full justify-start"
      ref={(element) => setUserMessageRef(message.id, element)}
    >
      <article className="w-full min-w-0 max-w-3xl rounded-panel border border-chat-border-soft bg-chat-surface-subtle px-3.5 py-2.5 text-chat-fg">
        <button
          className="group/peer mb-1.5 flex max-w-full items-center gap-1.5 rounded-dense text-meta text-chat-fg-muted hover:text-chat-fg"
          onClick={() => selectSession(origin.sessionId)}
          type="button"
        >
          <Bot className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {t("peerMessage.from", { title: origin.sessionTitle })}
          </span>
          <ArrowUpRight className="size-3.5 shrink-0 opacity-0 group-hover/peer:opacity-100" />
        </button>
        <CollapsibleUserMessageBody key={message.id} text={body}>
          <MarkdownRenderer className="space-y-1.5" content={body} />
        </CollapsibleUserMessageBody>
      </article>
    </div>
  );
}
