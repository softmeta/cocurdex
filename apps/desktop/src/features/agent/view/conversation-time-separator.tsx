import { i18n } from "@/i18n";
import { formatSeparatorTime } from "./conversation-time";

export function ConversationTimeSeparator({ time }: { time: number }) {
  return (
    <div className="flex justify-center pt-2 pb-4">
      <time
        className="text-meta tabular-nums text-chat-fg-muted"
        dateTime={new Date(time).toISOString()}
      >
        {formatSeparatorTime(time, Date.now(), i18n.language)}
      </time>
    </div>
  );
}
