import type { ConversationMessageRecord } from "@cocurdex/shared";
import { AlertTriangle, CircleStop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";

export function ConversationMessageStatus({
  message,
}: {
  message: ConversationMessageRecord;
}) {
  const { t } = useTranslation("chat");
  if (message.status === "cancelled") {
    return (
      <div className="mt-2 flex items-center gap-2 text-muted-foreground">
        <CircleStop className="size-4 shrink-0" />
        <Text size="meta">
          {t("message.stopped", { defaultValue: "Response stopped" })}
        </Text>
      </div>
    );
  }
  if (message.status !== "errored") return null;
  return (
    <div className="mt-2 flex items-start gap-2 text-destructive">
      <AlertTriangle className="size-4 shrink-0" />
      <Text size="meta">
        {message.error ??
          t("message.error", { defaultValue: "Request failed" })}
      </Text>
    </div>
  );
}
