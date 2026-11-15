import { formatSeparatorTime } from "@cocurdex/client-runtime";
import { useTranslation } from "react-i18next";

export function ConversationTimeSeparator({ time }: { time: number }) {
  const { t, i18n } = useTranslation("sessions");
  return (
    <div className="flex justify-center pt-2 pb-4">
      <time
        className="text-meta tabular-nums text-chat-fg-muted"
        dateTime={new Date(time).toISOString()}
      >
        {formatSeparatorTime(
          time,
          Date.now(),
          i18n.language,
          t("sidebar.yesterday"),
        )}
      </time>
    </div>
  );
}
