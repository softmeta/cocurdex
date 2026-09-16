import type { MessageRecord, TeamMemberRecord } from "@cocurdex/shared";
import { ArrowUpRight, SendHorizontal } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Text } from "@/components/ui";
import { desktopApi, taskApi, useMountEffect } from "@/lib";

function lastReplyOf(messages: MessageRecord[]) {
  return (
    messages.findLast(
      (message) =>
        message.role === "assistant" &&
        message.kind !== "reasoning" &&
        message.content.trim().length > 0,
    )?.content ?? null
  );
}

export function TeamMemberPeek({
  member,
  pendingPrompt,
  onOpen,
}: {
  member: TeamMemberRecord;
  pendingPrompt: string | null;
  onOpen(): void;
}) {
  const { t } = useTranslation("agent");
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useMountEffect(() => {
    let cancelled = false;
    void desktopApi.listSessionMessages(member.sessionId).then((result) => {
      if (!cancelled) setLastReply(lastReplyOf(result.messages));
    });
    return () => {
      cancelled = true;
    };
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await taskApi.sendMessage({
        sessionId: member.sessionId,
        content,
        delivery:
          member.status === "running" ? "queue-after-run" : "start-new-run",
      });
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const summary = pendingPrompt ?? lastReply;
  const canReply = member.status !== "stopped" && !pendingPrompt;

  return (
    <div className="mb-1 ms-6 flex flex-col gap-1.5 border-s border-chat-border-soft ps-3 pe-1 pt-0.5 pb-1.5">
      <Text
        className="line-clamp-4 whitespace-pre-wrap break-words"
        size="meta"
        tone={pendingPrompt ? "default" : "muted"}
      >
        {summary ?? t("team.noReply")}
      </Text>
      <div className="flex items-center gap-1.5">
        {canReply ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <Input
              aria-label={t("team.replyPlaceholder", { name: member.name })}
              className="h-7"
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("team.replyPlaceholder", { name: member.name })}
              value={draft}
            />
            <Button
              aria-label={t("team.send")}
              disabled={!draft.trim() || sending}
              size="icon-sm"
              type="submit"
              variant="ghost"
            >
              <SendHorizontal className="size-3.5" />
            </Button>
          </form>
        ) : (
          <span className="flex-1" />
        )}
        <Button
          className="h-7 shrink-0 gap-1 px-2 text-chat-fg-muted"
          onClick={onOpen}
          size="sm"
          type="button"
          variant="ghost"
        >
          {pendingPrompt ? t("team.handle") : t("team.open")}
          <ArrowUpRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
