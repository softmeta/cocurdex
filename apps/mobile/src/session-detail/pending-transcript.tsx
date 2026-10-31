import type { SavedHost } from "@cocurdex/client-runtime";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type PendingSend, pendingSendItem } from "./pending-send";
import { StatusLine } from "./status-line";
import { condenseTranscript } from "./transcript-activity";
import { TranscriptView } from "./transcript-view";

export function PendingTranscript({
  host,
  send,
}: {
  host: SavedHost;
  send: PendingSend;
}) {
  const { t } = useTranslation("sessions");
  const items = useMemo(
    () => condenseTranscript([pendingSendItem(send)], [], false),
    [send],
  );
  return (
    <TranscriptView
      items={items}
      sentMessageId={send.id}
      actions={{
        hostId: host.hostId,
        fileRoot: undefined,
        onOpenImage: () => undefined,
        onOpenTool: () => undefined,
        onFork: null,
      }}
      footer={<StatusLine text={t("detail.sending")} failed={false} />}
    />
  );
}
